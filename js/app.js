import {
  SIZE,
  LABELS,
  createTown,
  createChallengeTown,
  createSimulation,
  advance,
  townStats,
  parseTown,
  serializeTown,
  mergeTokens,
  position,
} from './world.js';
import { CityView } from './scene.js';
import { COLOURS, detectTokens, StableTokens, CameraSession } from './vision.js';
const $ = (selector) => document.querySelector(selector);
const tools = [...document.querySelectorAll('[data-tool]')];
let base = createTown(),
  tokens = [],
  tiles = [...base],
  selected = 'road',
  history = [],
  sandbox = null,
  sandboxHistory = [],
  sim,
  view;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches,
  speed = 1,
  showRoutes = true,
  mode = 'mouse',
  paperSource = null,
  lastTokenSignature = '',
  toastTimer;
let saved = false;
try {
  const stored = localStorage.getItem('deskworld.city.v1');
  if (stored) {
    base = parseTown(stored);
    tiles = [...base];
    saved = true;
  }
} catch {
  $('#save-status').textContent = 'Browser storage unavailable; export to keep your city';
}
const symbols = {
  empty: '·',
  road: '╋',
  home: '⌂',
  studio: '▥',
  park: '♣',
  block: '×',
  water: '≈',
};
const protectedCells = () =>
  new Set(sim?.challenge ? sim.agents.flatMap((a) => [a.origin, a.goal]) : []);
function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200);
}
function persist() {
  if (sim?.challenge) return;
  try {
    localStorage.setItem('deskworld.city.v1', serializeTown(base));
    $('#save-status').textContent = 'City saved in this browser';
  } catch {
    $('#save-status').textContent = 'Export your city to keep it';
  }
}
function remember() {
  history.push([...base]);
  if (history.length > 50) history.shift();
}
function selectTool(type) {
  selected = type;
  tools.forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.tool === type)),
  );
  $('#map-tool').value = type;
  $('#hover-text').textContent = `${LABELS[type]} selected · click a tile`;
}
function drawMap() {
  document.querySelectorAll('.map-cell').forEach((button, id) => {
    button.dataset.type = tiles[id];
    button.textContent = symbols[tiles[id]];
    const { x, y } = position(id);
    button.setAttribute(
      'aria-label',
      `Column ${String.fromCharCode(65 + x)}, row ${y + 1}: ${LABELS[tiles[id]]}`,
    );
  });
}
function updateTown(restart = false) {
  tiles = mergeTokens(base, tokens, protectedCells());
  if (restart || !sim) sim = createSimulation(tiles, !!sim?.challenge);
  else sim.revision++;
  view?.rebuild(tiles);
  const stats = townStats(tiles);
  $('#connected-count').textContent = `${stats.connected} / ${stats.homes}`;
  $('#park-count').textContent = stats.parks;
  $('#undo').disabled = !history.length;
  drawMap();
  updateStatus();
}
function editCell(cell) {
  if (sim.challenge && (protectedCells().has(cell) || ['home', 'studio'].includes(selected))) {
    notify('Homes and studios stay fixed during this challenge.');
    return;
  }
  if (tokens.some((token) => token.cell === cell)) {
    notify('Move that paper piece, or keep the pieces before editing this tile.');
    return;
  }
  if (base[cell] === selected) return;
  const restart =
    !sim.challenge && [base[cell], selected].some((type) => type === 'home' || type === 'studio');
  remember();
  base[cell] = selected;
  updateTown(restart);
  persist();
  const { x, y } = position(cell);
  $('#hover-text').textContent =
    `${LABELS[selected]} placed · ${String.fromCharCode(65 + x)}${y + 1}`;
}
try {
  view = new CityView($('#stage'), {
    onPick: editCell,
    onHover: (cell) => {
      if (cell !== null) {
        const { x, y } = position(cell);
        $('#hover-text').textContent =
          `${String.fromCharCode(65 + x)}${y + 1} · ${LABELS[tiles[cell]]} → ${LABELS[selected]}`;
      }
    },
  });
  $('#loading').remove();
} catch {
  const loading = $('#loading');
  loading.textContent = 'This browser cannot start the 3D view; the keyboard map still works.';
  loading.className = 'error-message';
  notify('Open the keyboard map to build without 3D.');
}
function updateStatus() {
  const waiting = sim.agents.filter((a) => a.blocked && !a.done).length;
  $('#simulation-note').textContent = paused
    ? 'Neighbours are paused'
    : sim.status === 'empty'
      ? 'Add a home and a studio'
      : waiting
        ? `${waiting} waiting for a route`
        : sim.status === 'won'
          ? 'Everyone made it home'
          : 'Neighbours are heading home';
  $('#pause').textContent = paused ? '▶' : 'Ⅱ';
  $('#pause').setAttribute('aria-label', paused ? 'Resume neighbours' : 'Pause neighbours');
  $('#challenge-progress').hidden = !sim.challenge;
  if (sim.challenge) {
    $('#mode-pill').lastChild.textContent = ' STORM CHALLENGE';
    $('#town-title').textContent = 'The way home';
    const left = Math.max(0, Math.ceil(sim.deadline - sim.elapsed));
    $('#countdown').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    $('#arrival-count').textContent = `${sim.delivered} / ${sim.agents.length} home`;
    $('#arrivals').value = sim.delivered;
    $('#challenge-title').textContent =
      sim.status === 'won'
        ? 'Everyone is home.'
        : sim.status === 'lost'
          ? 'The rain arrived.'
          : 'Before the rain.';
    $('#challenge-copy').textContent =
      sim.status === 'won'
        ? 'A small repair made a way for everyone.'
        : sim.status === 'lost'
          ? `${sim.delivered} neighbours made it; try reconnecting the roads earlier.`
          : 'Replace a roadblock on row 4 with a road; the northern homes need a connection.';
    $('#challenge').textContent = 'Back to free play ↗';
    $('#weather').textContent =
      sim.status === 'lost'
        ? '☂ Rain on the rooftops'
        : sim.status === 'won'
          ? '☀ Home, just in time'
          : '☁ Rain is on its way';
  } else {
    $('#mode-pill').lastChild.textContent = ' FREE PLAY';
    $('#town-title').textContent = 'Little Sunday';
    $('#challenge-title').textContent = 'Before the rain.';
    $('#challenge-copy').textContent =
      'Road works. Twelve neighbours. One minute to get everyone home.';
    $('#challenge').textContent = 'Take the challenge ↗';
    $('#weather').textContent = '☀ A good day to build';
  }
}
function openDialog(id) {
  $(id).showModal();
}
document
  .querySelectorAll('.close-dialog')
  .forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
$('#help').addEventListener('click', () => openDialog('#help-dialog'));
$('#map-open').addEventListener('click', () => {
  drawMap();
  openDialog('#map-dialog');
});
for (let id = 0; id < SIZE * SIZE; id++) {
  const button = document.createElement('button');
  button.className = 'map-cell';
  button.dataset.cell = id;
  button.tabIndex = id === 0 ? 0 : -1;
  button.addEventListener('click', () => editCell(id));
  $('#map-grid').append(button);
}
$('#map-grid').addEventListener('keydown', (event) => {
  const current = Number(event.target.dataset.cell);
  if (!Number.isInteger(current)) return;
  const { x, y } = position(current);
  let next = current;
  if (event.key === 'ArrowRight') next = y * SIZE + Math.min(SIZE - 1, x + 1);
  else if (event.key === 'ArrowLeft') next = y * SIZE + Math.max(0, x - 1);
  else if (event.key === 'ArrowDown') next = Math.min(SIZE - 1, y + 1) * SIZE + x;
  else if (event.key === 'ArrowUp') next = Math.max(0, y - 1) * SIZE + x;
  else if (event.key === 'Home') next = y * SIZE;
  else if (event.key === 'End') next = y * SIZE + SIZE - 1;
  else return;
  event.preventDefault();
  event.target.tabIndex = -1;
  const nextButton = $(`[data-cell="${next}"]`);
  nextButton.tabIndex = 0;
  nextButton.focus();
  view?.setCursor(next);
});
$('#map-grid').addEventListener('focusin', (event) => {
  document
    .querySelectorAll('.map-cell')
    .forEach((button) => (button.tabIndex = button === event.target ? 0 : -1));
});
$('#map-tool').addEventListener('change', (event) => selectTool(event.target.value));
tools.forEach((button) => button.addEventListener('click', () => selectTool(button.dataset.tool)));
document.addEventListener('keydown', (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    document.querySelector('dialog[open]') ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
  )
    return;
  if (/^[1-6]$/.test(event.key)) selectTool(tools[Number(event.key) - 1].dataset.tool);
});
$('#pause').addEventListener('click', () => {
  paused = !paused;
  updateStatus();
});
$('#speed').addEventListener('click', () => {
  speed = speed === 1 ? 2 : 1;
  $('#speed').textContent = `${speed}×`;
  $('#speed').setAttribute('aria-label', `Simulation speed ${speed} times`);
});
$('#routes').addEventListener('change', (event) => {
  showRoutes = event.target.checked;
  view?.showRoutes(sim, showRoutes);
});
$('#rotate-left').addEventListener('click', () => view?.rotate(-Math.PI / 2));
$('#rotate-right').addEventListener('click', () => view?.rotate(Math.PI / 2));
$('#zoom-in').addEventListener('click', () => view?.changeZoom(0.15));
$('#zoom-out').addEventListener('click', () => view?.changeZoom(-0.15));
$('#undo').addEventListener('click', () => {
  if (!history.length) return;
  base = history.pop();
  updateTown(!sim.challenge);
  persist();
  notify('Last change undone.');
});
function returnToSandbox() {
  stopPaper();
  base = sandbox || createTown();
  history = sandboxHistory;
  sandbox = null;
  sim = createSimulation(base);
  updateTown();
  persist();
}
$('#reset').addEventListener('click', () => {
  if (sim.challenge) {
    returnToSandbox();
    return;
  }
  stopPaper();
  remember();
  base = createTown();
  updateTown(true);
  persist();
  notify('The starter neighbourhood is back; Undo restores your city.');
});
$('#challenge').addEventListener('click', () => {
  if (sim.challenge) {
    returnToSandbox();
    return;
  }
  openDialog('#challenge-dialog');
});
$('#challenge-start').addEventListener('click', () => {
  stopPaper();
  sandbox = [...base];
  sandboxHistory = [...history];
  history = [];
  base = createChallengeTown();
  tiles = [...base];
  sim = createSimulation(tiles, true);
  paused = false;
  speed = 1;
  $('#speed').textContent = '1×';
  $('#speed').setAttribute('aria-label', 'Simulation speed 1 times');
  selectTool('road');
  updateTown();
  $('#challenge-dialog').close();
  notify('Repair a roadblock on row 4 to reconnect the northern homes.');
});
$('#export').addEventListener('click', () => {
  const blob = new Blob([serializeTown(tiles)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'deskworld-city.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('City exported as deskworld-city.json.');
});
$('#import').addEventListener('click', () => {
  if (sim.challenge) {
    notify('Return to free play before importing a city.');
    return;
  }
  $('#import-file').click();
});
$('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 20000) throw new Error('Choose a DeskWorld JSON file under 20 KB.');
    const imported = parseTown(await file.text());
    if (sim.challenge) throw new Error('Return to free play before importing a city.');
    stopPaper();
    remember();
    base = imported;
    updateTown(true);
    persist();
    notify('Your city is ready.');
  } catch (error) {
    notify(error.message);
  }
  event.target.value = '';
});
const video = $('#camera-video'),
  camera = new CameraSession(navigator.mediaDevices, video),
  tracker = new StableTokens(),
  preview = $('#paper-canvas'),
  previewContext = preview.getContext('2d');
const processing = document.createElement('canvas');
processing.width = 160;
processing.height = 160;
const pixels = processing.getContext('2d', { willReadFrequently: true });
const demoPieces = [
  { colour: 'coral', x: 7.5 / 11, y: 4.5 / 11 },
  { colour: 'green', x: 3.5 / 11, y: 6.5 / 11 },
  { colour: 'blue', x: 5.5 / 11, y: 3.5 / 11 },
];
let dragPiece = null,
  lastVision = 0,
  cameraPending = false;
function setInputUI(state) {
  $('#camera-state').textContent = state;
  $('#camera-start').hidden = !!paperSource;
  $('#paper-demo').hidden = !!paperSource;
  $('#camera-stop').hidden = !paperSource && !cameraPending;
  $('#freeze').hidden = !paperSource;
  $('#camera-start').disabled = cameraPending;
}
function stopPaper() {
  camera.stop();
  paperSource = null;
  cameraPending = false;
  tracker.clear();
  tokens = [];
  lastTokenSignature = '';
  setInputUI('CAMERA OFF');
  $('#paper-hint').textContent = 'The square maps to the whole city; the top edge is row 1.';
  if (sim) updateTown(!sim.challenge);
  drawPaper();
}
function setMode(next) {
  mode = next;
  $('#paper-panel').hidden = mode !== 'paper';
  $('#mouse-mode').setAttribute('aria-pressed', String(mode === 'mouse'));
  $('#paper-mode').setAttribute('aria-pressed', String(mode === 'paper'));
  if (mode === 'mouse') stopPaper();
  else drawPaper();
}
$('#mouse-mode').addEventListener('click', () => setMode('mouse'));
$('#paper-mode').addEventListener('click', () => setMode('paper'));
$('#camera-start').addEventListener('click', async () => {
  cameraPending = true;
  setInputUI('WAITING FOR PERMISSION');
  $('#paper-hint').textContent =
    'Allow camera access, then centre a plain square board in the preview.';
  try {
    if (await camera.start()) {
      paperSource = 'camera';
      cameraPending = false;
      setInputUI('CAMERA LIVE');
      $('#paper-hint').textContent =
        'Keep the board square to the camera; allow a moment for pieces to settle.';
    }
  } catch (error) {
    cameraPending = false;
    setInputUI('CAMERA UNAVAILABLE');
    $('#paper-hint').textContent =
      error.name === 'NotAllowedError'
        ? 'Camera permission was not granted; the paper demo still works.'
        : error.name === 'NotFoundError'
          ? 'No camera was found; try the paper demo.'
          : 'The camera could not start; check browser access or try the paper demo.';
  }
});
$('#paper-demo').addEventListener('click', () => {
  stopPaper();
  paperSource = 'demo';
  setInputUI('PAPER DEMO');
  $('#paper-hint').textContent =
    'Drag the coloured pieces here; the same detector reads camera frames.';
  drawPaper();
});
$('#camera-stop').addEventListener('click', stopPaper);
$('#freeze').addEventListener('click', () => {
  const kept = [...tiles];
  remember();
  stopPaper();
  base = kept;
  updateTown(!sim.challenge);
  persist();
  notify('Paper pieces are now part of your city.');
});
function drawPaper() {
  if (paperSource === 'camera' && video.readyState >= 2) {
    const side = Math.min(video.videoWidth, video.videoHeight);
    pixels.drawImage(
      video,
      (video.videoWidth - side) / 2,
      (video.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      160,
      160,
    );
  } else {
    pixels.fillStyle = '#f3f0e5';
    pixels.fillRect(0, 0, 160, 160);
    if (paperSource === 'demo')
      for (const token of demoPieces) {
        pixels.fillStyle = `rgb(${COLOURS[token.colour].rgb.join(',')})`;
        pixels.fillRect(token.x * 160 - 5, token.y * 160 - 5, 10, 10);
      }
  }
  previewContext.drawImage(processing, 0, 0, 240, 240);
  previewContext.strokeStyle = '#263d3520';
  previewContext.lineWidth = 0.7;
  for (let n = 1; n < 11; n++) {
    const offset = (n * 240) / 11;
    previewContext.beginPath();
    previewContext.moveTo(offset, 0);
    previewContext.lineTo(offset, 240);
    previewContext.moveTo(0, offset);
    previewContext.lineTo(240, offset);
    previewContext.stroke();
  }
  if (!paperSource) {
    previewContext.fillStyle = '#7b8972';
    previewContext.font = 'italic 15px Georgia';
    previewContext.textAlign = 'center';
    previewContext.fillText('A blank page. A whole city.', 120, 126);
  }
}
function trackPaper(now) {
  drawPaper();
  if (!paperSource || (paperSource === 'camera' && video.readyState < 2)) return;
  const detected = detectTokens(pixels.getImageData(0, 0, 160, 160));
  tokens = tracker.update(detected, now);
  for (const token of detected) {
    const { x, y, w, h } = token.bounds;
    previewContext.strokeStyle = '#273f35';
    previewContext.lineWidth = 1.5;
    previewContext.strokeRect(x * 240 - 2, y * 240 - 2, w * 240 + 4, h * 240 + 4);
  }
  const signature = tokens
    .map((t) => `${t.colour}:${t.cell}`)
    .sort()
    .join('|');
  if (signature !== lastTokenSignature) {
    const oldHomes = tiles
      .map((t, i) => (t === 'home' ? i : null))
      .filter((i) => i !== null)
      .join();
    lastTokenSignature = signature;
    const next = mergeTokens(base, tokens, protectedCells());
    const newHomes = next
      .map((t, i) => (t === 'home' ? i : null))
      .filter((i) => i !== null)
      .join();
    updateTown(!sim.challenge && oldHomes !== newHomes);
  }
}
function previewPoint(event) {
  const rect = preview.getBoundingClientRect();
  return {
    x: Math.max(0.035, Math.min(0.965, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0.035, Math.min(0.965, (event.clientY - rect.top) / rect.height)),
  };
}
preview.addEventListener('pointerdown', (event) => {
  if (paperSource !== 'demo') return;
  const point = previewPoint(event);
  dragPiece = demoPieces.find((t) => Math.hypot(t.x - point.x, t.y - point.y) < 0.1) || null;
  if (dragPiece) preview.setPointerCapture(event.pointerId);
});
preview.addEventListener('pointermove', (event) => {
  if (!dragPiece) return;
  Object.assign(dragPiece, previewPoint(event));
});
preview.addEventListener('pointerup', () => (dragPiece = null));
preview.addEventListener('pointercancel', () => (dragPiece = null));
document.addEventListener('visibilitychange', () => {
  lastFrame = 0;
  accumulator = 0;
  if (document.hidden && (paperSource === 'camera' || cameraPending)) {
    stopPaper();
    $('#paper-hint').textContent =
      'Camera stopped while this tab was hidden; start it again when ready.';
  }
});
window.addEventListener('pagehide', () => camera.stop());
updateTown(true);
drawPaper();
if (saved) $('#save-status').textContent = 'Your last city is back';
let lastFrame = 0,
  accumulator = 0,
  lastStatus = 0,
  lastRoutes = 0,
  ambientEnd = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (!paused && !document.querySelector('dialog[open]')) {
    accumulator += dt * speed;
    while (accumulator >= 0.05) {
      advance(sim, tiles, 0.05);
      accumulator -= 0.05;
    }
    if (!sim.challenge && sim.status === 'won') {
      ambientEnd += dt;
      if (ambientEnd > 3) {
        sim = createSimulation(tiles);
        ambientEnd = 0;
      }
    } else ambientEnd = 0;
  } else accumulator = 0;
  if (now - lastStatus > 150) {
    updateStatus();
    lastStatus = now;
  }
  if (now - lastRoutes > 500) {
    view?.showRoutes(sim, showRoutes);
    lastRoutes = now;
  }
  if (mode === 'paper' && now - lastVision > 100) {
    trackPaper(now);
    lastVision = now;
  }
  view?.update(sim, now / 1000, sim.challenge && sim.status === 'lost');
}
requestAnimationFrame(frame);
