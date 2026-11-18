(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PW = sessionStorage.getItem('cw-admin') || '';
  var data = null, timer = null;
  var WIN = 2; // quantos ganham brinde

  function api(method, body) {
    return fetch('/api/admin', { method: method, headers: { 'Content-Type': 'application/json', 'x-admin-password': PW }, body: body ? JSON.stringify(body) : undefined })
      .catch(function () { throw new Error('Sem conexão com o servidor.'); })
      .then(function (r) {
        return r.text().then(function (txt) {
          var j = null; try { j = JSON.parse(txt); } catch (x) {}
          if (!r.ok || !j) {
            var e = new Error((j && j.error) || (r.status === 404 ? 'API não encontrada (404). Confira se a pasta api/ foi enviada para o repositório.' : 'Erro inesperado no servidor (' + r.status + ').'));
            e.status = r.status; throw e;
          }
          return j;
        });
      });
  }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function fmtTime(ms) { var s = Math.round(ms / 1000); return Math.floor(s / 60) + 'min ' + String(s % 60).padStart(2, '0') + 's'; }
  function fmtHour(t) { return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

  var lastErr = '';
  function load() {
    return api('GET').then(function (d) { data = d; lastErr = ''; render(); }).catch(function (e) {
      if (e.status === 401) { logout(); $('loginError').textContent = 'Senha incorreta.'; }
      else if (e.message !== lastErr) { lastErr = e.message; alert(e.message); } // não repete o mesmo alerta a cada 10s
    });
  }
  function act(body) { return api('POST', body).then(load).catch(function (e) { alert(e.message); load(); }); }
  function logout() { sessionStorage.removeItem('cw-admin'); PW = ''; clearInterval(timer); $('panel').hidden = true; $('login').hidden = false; }

  function enter(d) {
    data = d; $('login').hidden = true; $('panel').hidden = false; render();
    clearInterval(timer); timer = setInterval(load, 10000);
  }
  $('loginForm').addEventListener('submit', function (ev) {
    ev.preventDefault(); PW = $('pw').value;
    $('loginError').textContent = '';
    api('GET').then(function (d) { sessionStorage.setItem('cw-admin', PW); enter(d); })
      .catch(function (e) { PW = ''; sessionStorage.removeItem('cw-admin'); $('loginError').textContent = e.message; });
  });
  $('logout').onclick = logout; $('refresh').onclick = load;

  function ranked() {
    return data.players.filter(function (p) { return p.status === 'done'; }).sort(function (a, b) {
      return b.score - a.score || b.hard - a.hard || a.totalMs - b.totalMs; // o tempo só ordena a tabela, nunca decide o brinde
    });
  }
  function same(a, b) { return a.score === b.score && a.hard === b.hard; }

  // Calcula os ganhadores e detecta empate na linha de corte.
  function analyse(list) {
    if (list.length === 0) return null;
    var cut = list[Math.min(WIN, list.length) - 1];
    var group = list.filter(function (p) { return same(p, cut); });
    var better = list.filter(function (p) { return p.score > cut.score || (p.score === cut.score && p.hard > cut.hard); });
    var slots = Math.min(WIN, list.length) - better.length;
    return { sure: better, group: group, slots: slots, tie: group.length > slots };
  }
  function drawKey(g) { return 'cw-draw-' + g.map(function (p) { return p.key; }).sort().join('|'); }
  function pickRandom(group, n) {
    var a = group.slice(), out = [];
    while (out.length < n && a.length) { var buf = new Uint32Array(1); crypto.getRandomValues(buf); out.push(a.splice(buf[0] % a.length, 1)[0]); }
    return out;
  }

  function render() {
    var list = ranked(), run = data.players.filter(function (p) { return p.status !== 'done'; });
    $('nTotal').textContent = data.players.length; $('nDone').textContent = list.length; $('nRun').textContent = run.length;
    $('tOpen').checked = data.settings.open; $('tReveal').checked = data.settings.reveal;

    var A = analyse(list), box = $('winners'); box.innerHTML = '';
    var winnerKeys = {}, tieKeys = {};
    if (A) {
      var wb = el('div', null, 'win-box');
      wb.appendChild(el('h3', 'Quem leva o brinde'));
      var names = A.sure.map(function (p) { return p.name; });
      if (!A.tie) {
        A.group.slice(0, A.slots).forEach(function (p) { names.push(p.name); });
        A.sure.concat(A.group.slice(0, A.slots)).forEach(function (p) { winnerKeys[p.key] = 1; });
        wb.appendChild(el('p', names.join('  e  '), 'names'));
      } else {
        A.sure.forEach(function (p) { winnerKeys[p.key] = 1; });
        A.group.forEach(function (p) { tieKeys[p.key] = 1; });
        var saved = sessionStorage.getItem(drawKey(A.group));
        if (A.sure.length) wb.appendChild(el('p', 'Garantido: ' + A.sure.map(function (p) { return p.name; }).join(', ')));
        wb.appendChild(el('p', 'Empate em ' + A.group[0].score + ' pontos (' + A.group[0].hard + ' acertos nas difíceis) entre: ' + A.group.map(function (p) { return p.name; }).join(', ') + '. ' + A.slots + (A.slots > 1 ? ' vagas' : ' vaga') + ' por sorteio.'));
        if (saved) {
          var picked = []; try { picked = JSON.parse(saved) || []; } catch (x) {}
          picked.forEach(function (k) { winnerKeys[k] = 1; });
          wb.appendChild(el('p', 'Sorteado: ' + picked.map(function (k) { return (data.players.find(function (p) { return p.key === k; }) || {}).name; }).join(' e '), 'names'));
        } else {
          var b = el('button', 'Sortear agora', 'mini draw');
          b.onclick = function () { sessionStorage.setItem(drawKey(A.group), JSON.stringify(pickRandom(A.group, A.slots).map(function (p) { return p.key; }))); render(); };
          wb.appendChild(b);
        }
      }
      box.appendChild(wb);
    } else box.appendChild(el('p', 'Ainda não há participantes que concluíram.', 'note'));

    var tb = document.querySelector('#rank tbody'); tb.innerHTML = '';
    list.forEach(function (p, i) {
      var tr = el('tr', null, winnerKeys[p.key] ? 'win' : (tieKeys[p.key] ? 'tie' : ''));
      [i + 1, p.name + (winnerKeys[p.key] ? '  🏆' : ''), p.score, p.correct + '/10', p.hard + '/4', fmtTime(p.totalMs)].forEach(function (v) { tr.appendChild(el('td', v)); });
      tr.appendChild(actionCell(p)); tb.appendChild(tr);
    });
    var rb = document.querySelector('#run tbody'); rb.innerHTML = '';
    run.forEach(function (p) {
      var tr = el('tr'); tr.appendChild(el('td', p.name)); tr.appendChild(el('td', fmtHour(p.startedAt))); tr.appendChild(actionCell(p)); rb.appendChild(tr);
    });
  }
  function actionCell(p) {
    var td = el('td'), b = el('button', 'liberar nome', 'x');
    b.onclick = function () { if (confirm('Liberar o nome "' + p.name + '"? O resultado será apagado e a pessoa poderá jogar de novo.')) act({ action: 'release', key: p.key }); };
    td.appendChild(b); return td;
  }

  $('tOpen').onchange = function () { act({ action: 'setting', key: 'open', value: this.checked }); };
  $('tReveal').onchange = function () { act({ action: 'setting', key: 'reveal', value: this.checked }); };
  $('reset').onclick = function () {
    if (confirm('Apagar TODOS os participantes e resultados? Isso não pode ser desfeito.') && confirm('Tem certeza mesmo?')) api('POST', { action: 'reset' }).then(function () { sessionStorage.clear(); sessionStorage.setItem('cw-admin', PW); load(); }).catch(function (e) { alert(e.message); });
  };
  $('csv').onclick = function () {
    var rows = [['posicao', 'nome', 'pontos', 'acertos', 'dificeis', 'tempo_segundos']];
    ranked().forEach(function (p, i) { rows.push([i + 1, '"' + p.name.replace(/"/g, '""') + '"', p.score, p.correct, p.hard, Math.round(p.totalMs / 1000)]); });
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(function (r) { return r.join(';'); }).join('\n')], { type: 'text/csv' })); a.download = 'ranking-cowork.csv'; a.click();
  };

  if (PW) { api('GET').then(enter).catch(function (e) { logout(); if (e.status !== 401) $('loginError').textContent = e.message; }); }
})();
