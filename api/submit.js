'use strict';
const L = require('./_lib');

function publicResult(p, settings) {
  const r = { name: p.name, title: L.titleFor(p.correct, p.total), score: p.score, correct: p.correct, total: p.total, hard: p.hard };
  if (settings.reveal) r.review = L.grade(p.answers).review;
  return r;
}

module.exports = L.handler(['POST'], async (req) => {
  const body = await L.readBody(req);
  const key = L.nameKey(body.name);
  if (!key) throw new L.HttpError(400, 'Nome não informado.');

  const player = await L.getPlayer(key);
  if (!player) throw new L.HttpError(404, 'Não encontramos sua participação (o apresentador pode ter liberado ou zerado). Comece de novo.', 'notstarted');

  const settings = await L.getSettings();
  // Já enviou antes (ex.: reenvio após falha de rede): devolve o mesmo resultado.
  if (player.status === 'done') return publicResult(player, settings);

  const limitMs = L.TIME_LIMIT * 1000;
  const raw = Array.isArray(body.answers) ? body.answers : [];
  const answers = L.QUESTIONS.map((q, n) => {
    const a = raw[n] || {};
    const i = Number.isInteger(a.i) && a.i >= 0 && a.i < q.options.length ? a.i : -1;
    let ms = Number(a.ms);
    if (!isFinite(ms) || ms < 0) ms = limitMs;
    return { i, ms: Math.min(Math.round(ms), limitMs) };
  });

  // Proteção simples contra tempo falsificado: a soma não pode ser menor que o tempo real decorrido no servidor
  // menos uma folga generosa (animações, rede, recarregar a página).
  const elapsed = Date.now() - player.startedAt;
  const declared = answers.reduce((s, a) => s + a.ms, 0);
  const minPlausible = elapsed - (L.QUESTIONS.length * 1500 + 45000);
  if (declared < minPlausible) {
    const factor = Math.min(elapsed, L.QUESTIONS.length * limitMs) / Math.max(declared, 1);
    answers.forEach(a => { a.ms = Math.min(Math.round(a.ms * factor), limitMs); });
  }

  const g = L.grade(answers);
  const done = Object.assign({}, player, {
    status: 'done', answers, score: g.score, correct: g.correct, hard: g.hard, total: g.total,
    totalMs: answers.reduce((s, a) => s + a.ms, 0), finishedAt: Date.now()
  });

  // Se o nome foi liberado enquanto a pessoa jogava, não ressuscita o registro.
  const still = await L.getPlayer(key);
  if (!still) throw new L.HttpError(404, 'Sua participação foi liberada pelo apresentador. Comece de novo.', 'notstarted');
  if (still.status === 'done') return publicResult(still, settings);

  await L.putPlayer(done);
  return publicResult(done, settings);
});
