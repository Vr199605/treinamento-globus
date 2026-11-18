'use strict';
const crypto = require('crypto');
const L = require('./_lib');

function checkPassword(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new L.HttpError(500, 'Senha do admin não configurada. Crie a variável ADMIN_PASSWORD na Vercel e faça um novo deploy.');
  const given = String(req.headers['x-admin-password'] || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) throw new L.HttpError(401, 'Senha incorreta.');
}

module.exports = L.handler(['GET', 'POST'], async (req) => {
  checkPassword(req);

  if (req.method === 'GET') {
    const [players, settings] = await Promise.all([L.allPlayers(), L.getSettings()]);
    return {
      settings,
      players: players.map(p => ({
        key: p.key, name: p.name, status: p.status, startedAt: p.startedAt,
        score: p.score || 0, correct: p.correct || 0, hard: p.hard || 0, totalMs: p.totalMs || 0
      }))
    };
  }

  const body = await L.readBody(req);
  switch (body.action) {
    case 'setting': {
      if (body.key !== 'open' && body.key !== 'reveal') throw new L.HttpError(400, 'Configuração desconhecida.');
      const s = await L.getSettings();
      s[body.key] = !!body.value;
      await L.saveSettings(s);
      return { ok: true, settings: s };
    }
    case 'release': {
      if (!body.key) throw new L.HttpError(400, 'Participante não informado.');
      await L.redis('HDEL', L.PLAYERS, String(body.key));
      return { ok: true };
    }
    case 'reset': {
      await L.redis('DEL', L.PLAYERS);
      return { ok: true };
    }
    default:
      throw new L.HttpError(400, 'Ação desconhecida.');
  }
});
