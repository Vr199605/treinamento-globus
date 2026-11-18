// Funções compartilhadas pelas rotas da API (arquivos com "_" não viram rota na Vercel).
'use strict';
const QUESTIONS = require('./_questions');

const TIME_LIMIT = 20; // segundos por pergunta
const BASE = { 'Fácil': 100, 'Médio': 150, 'Difícil': 200, 'Desafio': 300 };
const HARD_LEVELS = { 'Difícil': 1, 'Desafio': 1 };
const PLAYERS = 'cw:players';
const SETTINGS = 'cw:settings';
const DEFAULT_SETTINGS = { open: true, reveal: false };

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

// ---------- Banco (Upstash Redis via REST, sem dependências) ----------
function redisConfig() {
  const env = process.env;
  // Aceita os nomes padrão e também os com prefixo (ex.: STORAGE_KV_REST_API_URL), que a Vercel cria
  // quando o banco é conectado com um "Custom Prefix".
  const find = (suffixes, exclude) => {
    for (const s of suffixes) if (env[s]) return env[s];
    const k = Object.keys(env).find(n => suffixes.some(s => n.endsWith('_' + s)) && !(exclude && exclude.test(n)) && env[n]);
    return k ? env[k] : '';
  };
  const url = find(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']);
  const token = find(['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'], /READ_ONLY/);
  if (!url || !token) {
    throw new HttpError(500, 'Banco de dados não configurado. Conecte o Upstash Redis ao projeto na Vercel (aba Storage) e faça um novo deploy.');
  }
  return { url: url.replace(/\/+$/, ''), token };
}

async function redis(...command) {
  const { url, token } = redisConfig();
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
  } catch (e) {
    throw new HttpError(503, 'Não foi possível falar com o banco de dados. Tente de novo em instantes.');
  }
  let j = null;
  try { j = await r.json(); } catch (e) { /* resposta não-JSON */ }
  if (!r.ok || !j || j.error) {
    throw new HttpError(503, 'Erro no banco de dados' + (j && j.error ? ': ' + j.error : ' (HTTP ' + r.status + ').'));
  }
  return j.result;
}

async function getSettings() {
  const raw = await redis('GET', SETTINGS);
  let s = {};
  if (raw) { try { s = JSON.parse(raw); } catch (e) { s = {}; } }
  return Object.assign({}, DEFAULT_SETTINGS, s);
}
async function saveSettings(s) { await redis('SET', SETTINGS, JSON.stringify(s)); }

async function getPlayer(key) {
  const raw = await redis('HGET', PLAYERS, key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
async function putPlayer(p) { await redis('HSET', PLAYERS, p.key, JSON.stringify(p)); }
async function createPlayer(p) { return (await redis('HSETNX', PLAYERS, p.key, JSON.stringify(p))) === 1; }
async function allPlayers() {
  const flat = (await redis('HGETALL', PLAYERS)) || [];
  const out = [];
  for (let i = 1; i < flat.length; i += 2) { try { out.push(JSON.parse(flat[i])); } catch (e) { /* ignora */ } }
  return out;
}

// ---------- Nome ----------
function cleanName(name) {
  return String(name == null ? '' : name).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}
function nameKey(name) {
  return cleanName(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------- HTTP ----------
async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = req.body;
  if (raw == null) {
    raw = await new Promise((resolve, reject) => {
      let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) reject(new HttpError(413, 'Requisição grande demais.')); });
      req.on('end', () => resolve(d)); req.on('error', reject);
    });
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { throw new HttpError(400, 'Dados inválidos.'); }
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

// Envolve a rota: qualquer erro vira JSON (nunca uma página HTML).
function handler(methods, fn) {
  return async (req, res) => {
    try {
      if (methods.indexOf(req.method) === -1) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, 'Método não permitido.');
      }
      const out = await fn(req, res);
      if (!res.writableEnded) send(res, 200, out || { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      send(res, status, { error: e.status ? e.message : 'Erro interno no servidor. Tente de novo.', code: e.code });
    }
  };
}

// ---------- Pontuação ----------
function speedBonus(base, ms) {
  const limit = TIME_LIMIT * 1000;
  return Math.max(0, Math.round(base * 0.5 * (1 - Math.min(ms, limit) / limit)));
}

function grade(answers) {
  let streak = 0, score = 0, correct = 0, hard = 0;
  const review = QUESTIONS.map((q, n) => {
    const a = answers[n] || { i: -1, ms: TIME_LIMIT * 1000 };
    const base = BASE[q.level];
    const ok = a.i === q.correct;
    let pts = 0;
    if (ok) {
      streak++; correct++;
      if (HARD_LEVELS[q.level]) hard++;
      pts = base + speedBonus(base, a.ms) + Math.min(streak - 1, 4) * 25;
    } else streak = 0;
    score += pts;
    return { q: q.q, options: q.options, correctIndex: q.correct, why: q.why, ok, pts };
  });
  return { score, correct, hard, total: QUESTIONS.length, review };
}

function titleFor(correct, total) {
  const r = correct / total;
  if (r === 1) return 'Mestre do Cowork';
  if (r >= 0.8) return 'Expert em Cowork';
  if (r >= 0.6) return 'Mandou bem';
  if (r >= 0.4) return 'No caminho certo';
  return 'Aprendiz de Cowork';
}

// Embaralha as alternativas sem revelar qual é a certa.
function publicQuestions() {
  return QUESTIONS.map(q => {
    const opts = q.options.map((t, i) => ({ t, i }));
    for (let k = opts.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [opts[k], opts[j]] = [opts[j], opts[k]];
    }
    return { level: q.level, base: BASE[q.level], q: q.q, options: opts };
  });
}

module.exports = {
  QUESTIONS, TIME_LIMIT, HttpError, redis, getSettings, saveSettings, getPlayer, putPlayer, createPlayer,
  allPlayers, cleanName, nameKey, readBody, send, handler, grade, titleFor, publicQuestions, PLAYERS
};
