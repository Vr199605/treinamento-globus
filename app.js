(function () {
  'use strict';
  var KEY = 'cw-quiz-v1';
  var $ = function (id) { return document.getElementById(id); };
  var S = null;            // estado salvo no navegador
  var timer = null, startedAt = 0;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $(id).classList.add('active'); window.scrollTo(0, 0);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // Lê a resposta como texto e só depois tenta JSON: se o servidor devolver uma página HTML
  // (ex.: 404 da Vercel), mostramos uma mensagem clara em vez de "Unexpected token".
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .catch(function () { throw new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.'); })
      .then(function (r) {
        return r.text().then(function (txt) {
          var j = null; try { j = JSON.parse(txt); } catch (e) {}
          if (!r.ok || !j) {
            var err = new Error((j && j.error) || (r.status === 404 ? 'Servidor da provinha não encontrado (404). Avise o apresentador.' : 'Erro inesperado no servidor (' + r.status + '). Tente de novo.'));
            err.status = r.status; err.code = j && j.code; throw err;
          }
          return j;
        });
      });
  }
  function resetToHome(msg) {
    clearInterval(timer); S = null; try { localStorage.removeItem(KEY); } catch (e) {}
    var btn = $('startBtn'); btn.disabled = false; btn.textContent = 'Começar o desafio';
    show('home'); $('homeError').textContent = msg || '';
  }

  // ---------- Explicação e início ----------
  $('goName').addEventListener('click', function () { show('home'); $('name').focus(); });
  $('startForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var btn = $('startBtn'), err = $('homeError');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Preparando…';
    post('/api/start', { name: $('name').value }).then(function (d) {
      S = { name: d.name, questions: d.questions, timeLimit: d.timeLimit, answers: [], idx: 0, done: false };
      save(); runQuestion();
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Começar o desafio';
      if (e.code === 'already') { show('blocked'); return; }
      err.textContent = e.message;
    });
  });

  // ---------- Perguntas ----------
  var LV = { 'Fácil': 'f', 'Médio': 'm', 'Difícil': 'd', 'Desafio': 'x' };
  var answered = false;
  function runQuestion() {
    if (S.idx >= S.questions.length) return finish();
    answered = false;
    var q = S.questions[S.idx], n = S.questions.length;
    show('quiz');
    $('who').textContent = S.name;
    $('count').textContent = 'Pergunta ' + (S.idx + 1) + ' de ' + n;
    $('xpFill').style.width = (S.idx / n * 100) + '%';
    var lv = $('level'); lv.textContent = q.level; lv.className = 'level ' + LV[q.level];
    $('worth').textContent = 'Vale ' + q.base + ' pontos + bônus de velocidade';
    $('question').textContent = q.q;
    var box = $('options'); box.innerHTML = ''; box.className = 'options';
    q.options.forEach(function (o, k) {
      var b = el('button', 'opt'); b.type = 'button';
      b.appendChild(el('span', 'k', 'ABCD'[k])); b.appendChild(el('span', '', o.t));
      b.addEventListener('click', function () { answer(o.i, b); });
      box.appendChild(b);
    });
    startTimer();
  }
  function startTimer() {
    clearInterval(timer);
    var fill = $('timerFill'), limit = S.timeLimit * 1000;
    startedAt = Date.now(); fill.className = ''; fill.style.width = '100%';
    $('timeText').textContent = S.timeLimit + 's';
    timer = setInterval(function () {
      var left = Math.max(limit - (Date.now() - startedAt), 0);
      fill.style.width = (left / limit * 100) + '%';
      fill.className = left < 6000 ? 'low' : '';
      $('timeText').textContent = Math.ceil(left / 1000) + 's';
      if (left <= 0) answer(-1, null);
    }, 100);
  }
  function answer(i, btn) {
    if (answered) return; // evita resposta dupla (clique + fim do tempo, ou dois cliques rápidos)
    answered = true;
    clearInterval(timer);
    var ms = Math.min(Date.now() - startedAt, S.timeLimit * 1000);
    $('options').classList.add('locked');
    if (btn) btn.classList.add('picked');
    S.answers.push({ i: i, ms: ms }); S.idx++; save();
    setTimeout(runQuestion, i === -1 ? 900 : 550);
  }

  // ---------- Resultado ----------
  function finish() {
    clearInterval(timer);
    show('quiz');
    $('who').textContent = S.name; $('count').textContent = 'Fim!'; $('xpFill').style.width = '100%';
    $('level').textContent = ''; $('level').className = 'level'; $('worth').textContent = '';
    $('timerFill').style.width = '0'; $('timeText').textContent = '';
    $('question').textContent = 'Enviando suas respostas…'; $('options').innerHTML = ''; $('options').className = 'options';
    post('/api/submit', { name: S.name, answers: S.answers }).then(function (r) {
      S.done = true; S.result = r; save(); showResult(r, true);
    }).catch(function (e) {
      if (e.code === 'notstarted') return resetToHome(e.message);
      var box = $('options'); box.innerHTML = '';
      box.appendChild(el('p', 'error', e.message));
      var b = el('button', 'btn', 'Tentar enviar de novo'); b.type = 'button'; b.onclick = finish; box.appendChild(b);
    });
  }
  function showResult(r, celebrate) {
    show('result');
    $('rName').textContent = r.name;
    $('rTitle').textContent = r.title;
    $('rCorrect').textContent = r.correct + ' de ' + r.total;
    $('rHard').textContent = r.hard + ' de 4';
    countUp($('rScore'), r.score);
    var rv = $('review'); rv.innerHTML = '';
    $('rNote').textContent = 'Sua participação foi registrada. O apresentador divulga os vencedores no fim.';
    if (r.review && r.review.length) {
      $('rNote').textContent = 'Veja o gabarito e as pegadinhas de cada pergunta:';
      r.review.forEach(function (x, n) {
        var d = el('div', 'rv' + (x.ok ? ' ok' : ''));
        d.appendChild(el('p', '', (n + 1) + '. ' + x.q));
        d.appendChild(el('p', 'a', (x.ok ? 'Você acertou: ' : 'Resposta certa: ') + x.options[x.correctIndex] + (x.ok ? '  (+' + x.pts + ' pts)' : '')));
        d.appendChild(el('p', 'a', x.why)); rv.appendChild(d);
      });
    }
    if (celebrate && r.correct >= 6) confetti();
  }
  function countUp(node, to) {
    var t0 = performance.now(), dur = 1200;
    (function f(t) { var p = Math.min((t - t0) / dur, 1); node.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); })(t0);
  }
  function confetti() {
    var c = $('confetti'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    var cols = ['#F0955F', '#5FC4BB', '#FCFAF6', '#F0C95F'], ps = [];
    for (var i = 0; i < 140; i++) ps.push({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, v: 2 + Math.random() * 4, s: 5 + Math.random() * 7, c: cols[i % 4], r: Math.random() * 6 });
    var t0 = Date.now();
    (function f() {
      x.clearRect(0, 0, c.width, c.height);
      ps.forEach(function (p) { p.y += p.v; p.x += Math.sin(p.y / 30 + p.r) * 1.5; x.fillStyle = p.c; x.fillRect(p.x, p.y, p.s, p.s * .6); });
      if (Date.now() - t0 < 4500) requestAnimationFrame(f); else x.clearRect(0, 0, c.width, c.height);
    })();
  }

  // ---------- Ao abrir a página ----------
  S = load();
  var valid = S && typeof S === 'object' && Array.isArray(S.questions) && S.questions.length && Array.isArray(S.answers) && S.name;
  if (!valid) { S = null; try { localStorage.removeItem(KEY); } catch (e) {} }
  else if (S.done && S.result) showResult(S.result, false);
  else if (S.idx < S.questions.length) runQuestion(); // retoma se a página recarregar
  else finish();
})();
