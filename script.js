/* Jeu Caryotype – logique principale */

const qs = (sel, el = document) => el.querySelector(sel);
const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const state = {
  minutes: 0,
  timeLeft: 0,
  timerId: null,
  score: 0,
  round: 0,
  stage: 'start', // start | arrange | question | end
  substage: null, // in question: 'choose_chr' | 'zoom'
  targetPair: 1, // 1..4
  concept: '',
  arrangedOK: false,
};

const DATA = {
  pairs: [1, 2, 3, 4],
  // zones position en pourcentage du haut (différentes par pair)
  zoneY: {
    1: 30,
    2: 45,
    3: 60,
    4: 35,
  },
  // Position de la zone dans le ZOOM selon la paire (en pourcentage)
  // Ajustez librement ces valeurs
  zoomPos: {
    1: { left: 38, top: 60 },
    2: { left: 33, top: 76 },
    3: { left: 35, top: 11 },
    4: { left: 36, top: 26 },
  },
};

const GENE_QUESTIONS = [
  "un pigment (couleur) de la peau",
  "l'enzyme amylase (digestion)",
  "une protéine de structure (kératine)",
  "un récepteur à la surface des cellules",
  "une hormone (insuline)",
];

function pad(n) { return String(n).padStart(2, '0'); }

function setScreen(id) {
  qsa('.screen').forEach(s => s.classList.remove('active'));
  qs('#' + id)?.classList.add('active');
}

// Build slots and pool
function buildBoard() {
  const slots = qs('#slots');
  slots.innerHTML = '';
  // Create 4 slots (each accepts 2 chromosomes of its pair)
  const orderPairs = [1,2,3,4];
  orderPairs.forEach((accept, idx) => {
    const d = document.createElement('div');
    d.className = 'slot';
    d.dataset.accept = String(accept);
    d.dataset.index = String(idx);
    d.addEventListener('dragover', ev => { ev.preventDefault(); d.classList.add('over'); });
    d.addEventListener('dragleave', () => d.classList.remove('over'));
    d.addEventListener('drop', onDropToSlot);
    const lab = document.createElement('div');
    lab.className = 'slot-label';
    lab.textContent = `Paire ${accept}`;
    d.appendChild(lab);
    slots.appendChild(d);
  });

  const pool = qs('#pool');
  pool.innerHTML = '';
  pool.addEventListener('dragover', ev => ev.preventDefault());
  pool.addEventListener('drop', onDropToPool);

  // Create 8 chromosomes (A/B notion only for identité visuelle)
  const items = [];
  DATA.pairs.forEach(pair => {
    items.push(makeChromosome(pair, 'A'));
    items.push(makeChromosome(pair, 'B'));
  });
  // shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  items.forEach(el => pool.appendChild(el));
}

function makeChromosome(pair, letter) {
  const d = document.createElement('div');
  d.className = `chromosome pair-${pair}`;
  d.setAttribute('draggable', 'true');
  d.dataset.pair = String(pair);
  d.dataset.id = `${pair}${letter}`;
  d.addEventListener('dragstart', onDragStart);
  d.addEventListener('dragend', onDragEnd);

  // Use a dedicated SVG asset for a more natural shape
  const img = document.createElement('img');
  img.src = 'assets/chromosome_alt.svg';
  img.alt = 'Chromosome';
  img.className = 'art';
  img.setAttribute('draggable', 'false');
  d.appendChild(img);

  // No visible numeric label (avoid giving away the answer)

  const zone = document.createElement('button');
  zone.type = 'button';
  zone.className = 'zone';
  zone.style.top = DATA.zoneY[pair] + '%';
  zone.dataset.pair = String(pair);
  zone.addEventListener('click', onZoneClick);
  d.appendChild(zone);

  return d;
}

// DnD Handlers
function onDragStart(ev) {
  const el = ev.currentTarget.closest('.chromosome') || ev.target.closest('.chromosome');
  if (!el) return;
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', el.dataset.id);
  // Use the element itself as drag image for better UX
  try { ev.dataTransfer.setDragImage(el, el.clientWidth/2, el.clientHeight/2); } catch {}
  requestAnimationFrame(() => el.classList.add('dragging'));
}
function onDragEnd(ev) {
  const el = ev.currentTarget.closest('.chromosome') || ev.target.closest('.chromosome');
  if (el) el.classList.remove('dragging');
}

function onDropToSlot(ev) {
  ev.preventDefault();
  const id = ev.dataTransfer.getData('text/plain');
  const dragged = findChromosomeById(id);
  if (!dragged) return;
  const slot = ev.currentTarget;
  slot.classList.remove('over');
  // Capacity: max 2 chromosomes per slot
  const children = qsa('.chromosome', slot);
  if (children.length >= 2) return; // ignore drop if full
  const prev = dragged.closest('.slot');
  if (prev && prev !== slot) {
    // removing from previous slot may un-fill it
    if (qsa('.chromosome', prev).length <= 1) prev.classList.remove('filled');
  }
  slot.appendChild(dragged);
  if (qsa('.chromosome', slot).length >= 1) slot.classList.add('filled');
  updateCheckOrderState();
}

function onDropToPool(ev) {
  ev.preventDefault();
  const id = ev.dataTransfer.getData('text/plain');
  const dragged = findChromosomeById(id);
  if (!dragged) return;
  const parentSlot = dragged.closest('.slot');
  if (parentSlot) parentSlot.classList.remove('filled');
  ev.currentTarget.appendChild(dragged);
  updateCheckOrderState();
}

function findChromosomeById(id) {
  return qsa('.chromosome').find(el => el.dataset.id === id);
}

function allSlotsFilled() {
  // Each of 4 slots must contain 2 chromosomes
  return qsa('#slots .slot').every(s => qsa('.chromosome', s).length === 2);
}

function orderIsCorrect() {
  // Each slot i should contain only chromosomes from pair (i+1)
  const slots = qsa('#slots .slot');
  for (let i = 0; i < slots.length; i++) {
    const want = i + 1; // 1..4 left to right
    const chrs = qsa('.chromosome', slots[i]);
    if (chrs.length !== 2) return false;
    if (!chrs.every(c => Number(c.dataset.pair) === want)) return false;
  }
  return true;
}

function updateCheckOrderState() {
  const btn = qs('#check-order');
  const filled = allSlotsFilled();
  btn.disabled = !filled;
  // Auto-validation: if everything is correct, proceed without clicking
  if (state.stage === 'arrange' && filled && orderIsCorrect() && !state.arrangedOK) {
    state.arrangedOK = true;
    // seed next question
    state.targetPair = 1 + Math.floor(Math.random() * 4);
    state.concept = GENE_QUESTIONS[Math.floor(Math.random() * GENE_QUESTIONS.length)];
    qs('#prompt').textContent = `Félicitations ! Les chromosomes sont rangés par taille et par paires. On va maintenant identifier le chromosome ${state.targetPair} en cherchant le gène qui code pour ${state.concept}.`;
    playConfetti();
    setTimeout(enterQuestionStage, 900);
  }
}

function enterArrangeStage() {
  state.stage = 'arrange';
  state.arrangedOK = false;
  // Prépare le résumé de manche: on annonce la cible dès le début
  state.targetPair = 1 + Math.floor(Math.random() * 4);
  state.concept = GENE_QUESTIONS[Math.floor(Math.random() * GENE_QUESTIONS.length)];
  qs('#prompt').textContent = `Objectif: nous cherchons le gène qui code pour ${state.concept}. Il se trouve sur le chromosome ${state.targetPair}. D'abord, range par paires et par taille (du plus grand au plus petit) pour identifier ce chromosome.`;
  qs('#arrange').classList.remove('hidden');
  qs('#question').classList.add('hidden');
  disableZones();
  buildBoard();
  updateCheckOrderState();
}

function enableZonesForPair(pair) {
  // no-op in new flow (we use zoom modal). Keep for backward compatibility.
  disableZones();
}
function disableZones() { qsa('.zone').forEach(z => z.classList.remove('enabled', 'highlight')); }

function enterQuestionStage() {
  state.stage = 'question';
  state.substage = 'choose_chr';
  // pick target pair 1..4 randomly
  if (!state.targetPair) state.targetPair = 1 + Math.floor(Math.random() * 4);
  if (!state.concept) state.concept = GENE_QUESTIONS[Math.floor(Math.random() * GENE_QUESTIONS.length)];
  qs('#question-text').textContent = `Nous cherchons le gène qui code pour ${state.concept} et il se trouve sur le chromosome ${state.targetPair}. Clique sur ce chromosome pour pouvoir cliquer ensuite à l'endroit du gène.`;
  qs('#prompt').textContent = `Bravo ! Les chromosomes sont rangés par taille et par paires. Cherchons maintenant ${state.concept} : il est sur le chromosome ${state.targetPair}. Clique d'abord sur ce chromosome.`;
  qs('#question').classList.remove('hidden');
  // figer la position: on désactive le drag des chromosomes
  qsa('.chromosome').forEach(el => {
    el.setAttribute('draggable','false');
    el.classList.toggle('target', Number(el.dataset.pair) === state.targetPair);
    el.addEventListener('click', onChromosomeChoiceOnce, { once: true });
  });
}

function onChromosomeChoiceOnce(ev) {
  const el = ev.currentTarget.closest('.chromosome');
  if (!el) return;
  const pair = Number(el.dataset.pair);
  if (pair === state.targetPair) {
    openZoom(pair);
  } else {
    flashWrong();
    // reattach listener if wrong
    el.addEventListener('click', onChromosomeChoiceOnce, { once: true });
  }
}

function openZoom(pair){
  state.substage = 'zoom';
  const modal = qs('#zoom');
  modal.classList.remove('hidden');
  const zone = qs('#zoom-zone');
  // Position issue de DATA.zoomPos pour la paire
  const pos = (DATA.zoomPos && DATA.zoomPos[pair]) ? DATA.zoomPos[pair] : { left: 38, top: (DATA.zoneY[pair] || 40) };
  zone.style.left = pos.left + '%';
  zone.style.top = pos.top + '%';
  zone.classList.add('enabled');
  const onClick = () => {
    zone.removeEventListener('click', onClick);
    zone.classList.remove('enabled');
    modal.classList.add('hidden');
    state.score += 1; updateScore(); playConfetti();
    state.concept = '';
    nextRound();
  };
  zone.addEventListener('click', onClick);
}

function onZoneClick(ev) {
  if (state.stage !== 'question') return;
  const pair = Number(ev.currentTarget.dataset.pair);
  if (pair === state.targetPair) {
    // success
    state.score += 1;
    updateScore();
    playConfetti();
    nextRound();
  } else {
    // wrong: reveal the correct one, then require click on it
    flashWrong();
    disableZones();
    const correct = qsa('.zone').find(z => Number(z.dataset.pair) === state.targetPair);
    if (correct) {
      correct.classList.add('enabled', 'highlight');
      qs('#prompt').textContent = `Pas grave ! Clique sur la zone indiquée (sur le chromosome ${state.targetPair}) pour continuer.`;
      const proceed = () => {
        correct.removeEventListener('click', proceed);
        correct.classList.remove('highlight');
        nextRound();
      };
      correct.addEventListener('click', proceed);
    }
  }
}

function onValidateOrder() {
  if (!allSlotsFilled()) return;
  if (orderIsCorrect()) {
    // seed next question info and show pedagogical message via question text
    state.targetPair = 1 + Math.floor(Math.random() * 4);
    state.concept = GENE_QUESTIONS[Math.floor(Math.random() * GENE_QUESTIONS.length)];
    enterQuestionStage();
  } else {
    flashWrong();
    qs('#prompt').textContent = `L'ordre n'est pas encore correct. Essaie encore !`;
  }
}

function flashWrong() {
  qsa('.slot').forEach(s => {
    s.style.outline = '2px solid var(--bad)';
    s.style.transform = 'translateY(-2px)';
    setTimeout(() => { s.style.outline = ''; s.style.transform = ''; }, 220);
  });
}

function updateScore() { qs('#score').textContent = String(state.score); }

function formatTime(sec) { const m = Math.floor(sec/60), s = sec%60; return `${pad(m)}:${pad(s)}`; }

function startTimer() {
  clearInterval(state.timerId);
  const end = Date.now() + state.timeLeft * 1000;
  state.timerId = setInterval(() => {
    const left = Math.max(0, Math.round((end - Date.now())/1000));
    state.timeLeft = left;
    qs('#timer').textContent = formatTime(left);
    if (left <= 0) {
      clearInterval(state.timerId);
      endGame();
    }
  }, 250);
}

function startGame() {
  state.score = 0; state.round = 0; updateScore();
  qs('#timer').textContent = formatTime(state.minutes*60);
  state.timeLeft = state.minutes*60; startTimer();
  setScreen('game-screen');
  nextRound(true);
}

function nextRound(first = false) {
  state.round += 1;
  // reshuffle and ask new question
  enterArrangeStage();
  // enable validate only when filled
  qs('#check-order').disabled = true;
}

function endGame() {
  state.stage = 'end';
  setScreen('end-screen');
  qs('#final-score').textContent = String(state.score);
}

function resetToHome() {
  clearInterval(state.timerId);
  state.stage = 'start';
  setScreen('start-screen');
}

// Confetti
function playConfetti() {
  const canvas = qs('#confetti');
  const ctx = canvas.getContext('2d');
  const w = canvas.width = window.innerWidth;
  const h = canvas.height = window.innerHeight;
  const pieces = Array.from({length: 180}, () => ({
    x: Math.random()*w,
    y: -20 - Math.random()*h*0.3,
    r: 2 + Math.random()*4,
    c: randomColor(),
    vy: 2 + Math.random()*3,
    vx: -1 + Math.random()*2,
    a: Math.random()*Math.PI*2,
    va: -0.2 + Math.random()*0.4,
  }));
  let t0 = performance.now();
  let raf;
  const draw = (t) => {
    const dt = Math.min(32, t - t0); t0 = t;
    ctx.clearRect(0,0,w,h);
    pieces.forEach(p => {
      p.a += p.va * dt/16;
      p.x += p.vx * dt/16;
      p.y += p.vy * dt/16;
      if (p.y > h + 10) { p.y = -10; p.x = Math.random()*w; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2.2);
      ctx.restore();
    });
    raf = requestAnimationFrame(draw);
  };
  const stop = () => { cancelAnimationFrame(raf); ctx.clearRect(0,0,w,h); };
  draw(performance.now());
  setTimeout(stop, 1600);
}
function randomColor(){
  const palette = ['#fde047','#f472b6','#60a5fa','#34d399','#fca5a5','#a78bfa','#f59e0b'];
  return palette[(Math.random()*palette.length)|0];
}

// Wire up UI
window.addEventListener('DOMContentLoaded', () => {
  // time selection
  qsa('.btn.time').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.btn.time').forEach(b => b.classList.remove('primary'));
      btn.classList.add('primary');
      state.minutes = Number(btn.dataset.minutes);
      qs('#start-btn').disabled = false;
    });
  });
  qs('#start-btn').addEventListener('click', startGame);
  qs('#reset-btn').addEventListener('click', startGame);
  qs('#check-order').addEventListener('click', onValidateOrder);
  qs('#again-btn').addEventListener('click', startGame);
  qs('#home-btn').addEventListener('click', resetToHome);
  // resize confetti canvas on viewport change
  window.addEventListener('resize', () => {
    const canvas = qs('#confetti');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  });
});
