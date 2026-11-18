'use strict';
const L = require('./_lib');

module.exports = L.handler(['POST'], async (req) => {
  const body = await L.readBody(req);
  const name = L.cleanName(body.name);
  const key = L.nameKey(name);
  if (key.length < 2) throw new L.HttpError(400, 'Digite seu nome (de preferência nome e sobrenome).');

  const settings = await L.getSettings();
  if (!settings.open) throw new L.HttpError(403, 'A provinha está fechada no momento. Aguarde o apresentador liberar.', 'closed');

  const player = { key, name, status: 'running', startedAt: Date.now() };
  const created = await L.createPlayer(player);
  if (!created) throw new L.HttpError(409, 'Esse nome já participou. Cada pessoa joga uma vez só. Se você caiu no meio, peça ao apresentador para liberar seu nome.', 'already');

  return { name, questions: L.publicQuestions(), timeLimit: L.TIME_LIMIT };
});
