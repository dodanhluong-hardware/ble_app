const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const btnSave = document.getElementById('btn-save');
const btnConnect = document.getElementById('btn-connect');
const btnDisconnect = document.getElementById('btn-disconnect');
const connState = document.getElementById('conn-state');
const txState = document.getElementById('tx-state');
const eqPresetSel = document.getElementById('system-eq-preset');
const btNameInput = document.getElementById('bt-name');
const bleNameInput = document.getElementById('ble-name');
const chipDevice = document.getElementById('chip-device');
const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const pwaBar = document.getElementById('pwa-bar');
const btnPwaInstall = document.getElementById('btn-pwa-install');
const btnPwaClose = document.getElementById('btn-pwa-close');
const PWA_BAR_CLOSED_KEY = 'pwa_bar_closed';
const preampBandChipsL = document.querySelectorAll('#ch-l .band-chip[data-band]');
const preampBandChipsR = document.querySelectorAll('#ch-r .band-chip[data-band]');
const preampTableBodyL = document.getElementById('eq-table-body-l');
const preampTableBodyR = document.getElementById('eq-table-body-r');
const eqSvgL = document.querySelector('#eq-path-l')?.ownerSVGElement || null;
const eqSvgR = document.querySelector('#eq-path-r')?.ownerSVGElement || null;
const drcCurve = document.getElementById('drc-curve');
const drcParams = [
  'drc-pregain',
  'drc-threshold',
  'drc-ratio',
  'drc-knee',
  'drc-attack',
  'drc-release',
  'drc-makeup',
  'drc-mode',
].map((id) => document.getElementById(id)).filter(Boolean);

let connected = true;
let lastTx = '';
let deferredInstallPrompt = null;
let pwaBarClosedByUser = localStorage.getItem(PWA_BAR_CLOSED_KEY) === '1';
const DB_MIN = -12;
const DB_MAX = 12;
const CHART_H = 30;
const EQ_MIN_FREQ = 50;
const EQ_MAX_FREQ_HARD = 20000;
const EQ_DEFAULT_FS = 48000;

const preampBands = [
  { id: 0, active: true, type: 'PK', fc: 80, gain: 0.0, q: 0.707 },
  { id: 1, active: true, type: 'PK', fc: 1000, gain: 0.0, q: 0.707 },
  { id: 2, active: true, type: 'PK', fc: 10000, gain: 0.0, q: 0.707 },
  { id: 3, active: false, type: 'PK', fc: 160, gain: 0.0, q: 0.707 },
  { id: 4, active: false, type: 'PK', fc: 315, gain: 0.0, q: 0.707 },
  { id: 5, active: false, type: 'PK', fc: 630, gain: 0.0, q: 0.707 },
  { id: 6, active: false, type: 'PK', fc: 2000, gain: 0.0, q: 0.707 },
  { id: 7, active: false, type: 'PK', fc: 5000, gain: 0.0, q: 0.707 },
  { id: 8, active: false, type: 'PK', fc: 12000, gain: 0.0, q: 0.707 },
];
const preampBandsR = preampBands.map((b) => ({ ...b }));
let draggingBandId = null;
let isDragging = false;
let draggingSide = null;

function getPreampBands(side) {
  return side === 'r' ? preampBandsR : preampBands;
}
function setDragScrollLock(locked) {
  if (locked) {
    document.body.classList.add('drag-scroll-lock');
  } else {
    document.body.classList.remove('drag-scroll-lock');
  }
}
function setSidebarOpen(open) {
  document.body.classList.toggle('sidebar-open', open);
}

if (btnSidebarToggle) {
  btnSidebarToggle.addEventListener('click', () => {
    const next = !document.body.classList.contains('sidebar-open');
    setSidebarOpen(next);
  });
}
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));
}


tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.panel;
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById(target);
    if (panel) panel.classList.add('active');
    setSidebarOpen(false);
  });
});

function setConnUI() {
  if (!connState) return;
  connState.textContent = connected ? 'Connected' : 'Disconnected';
  connState.classList.remove('ok', 'bad');
  connState.classList.add(connected ? 'ok' : 'bad');
}

function setTxStatus(text, mode = 'normal') {
  if (!txState) return;
  txState.textContent = `TX: ${text}`;
  txState.classList.remove('ok', 'warn', 'bad');
  if (mode === 'ok') txState.classList.add('ok');
  if (mode === 'warn') txState.classList.add('warn');
  if (mode === 'bad') txState.classList.add('bad');
}

function sendTx(tag) {
  if (!connected) {
    setTxStatus('blocked (not connected)', 'bad');
    return;
  }
  if (lastTx === tag) {
    setTxStatus('SKIPDUP', 'warn');
    return;
  }
  lastTx = tag;
  setTxStatus('TX OK', 'ok');
}

function hidePwaBar() {
  if (!pwaBar) return;
  pwaBar.hidden = true;
  pwaBar.classList.add('is-hidden');
}

function isRunningAsInstalledApp() {
  const mm = (q) => window.matchMedia && window.matchMedia(q).matches;
  const iosStandalone = typeof navigator.standalone === 'boolean' ? navigator.standalone : false;
  return (
    mm('(display-mode: standalone)') ||
    mm('(display-mode: window-controls-overlay)') ||
    mm('(display-mode: fullscreen)') ||
    mm('(display-mode: minimal-ui)') ||
    iosStandalone ||
    document.referrer.startsWith('android-app://')
  );
}

function showPwaBar() {
  if (!pwaBar) return;
  if (pwaBarClosedByUser) return;
  if (isRunningAsInstalledApp()) return;
  if (location.protocol === 'file:') return;
  pwaBar.classList.remove('is-hidden');
  pwaBar.hidden = false;
}

function inferRangeUnit(rangeEl) {
  const id = rangeEl.id || '';
  if (id.includes('freq') || id.includes('lpf') || id.includes('hpf')) return 'Hz';
  if (id.includes('atk') || id.includes('attack') || id.includes('rel') || id.includes('release')) return 'ms';
  if (id.includes('thr') || id.includes('threshold') || id.includes('depth')) return 'dB';
  if (id.includes('gain') || id.includes('fx-send') || id.includes('afb') || id.includes('noise') || id.includes('mic')) return '';
  return '';
}

function formatRangeValue(rangeEl) {
  const raw = Number(rangeEl.value);
  const step = Number(rangeEl.step || '1');
  const unit = rangeEl.dataset.unit || inferRangeUnit(rangeEl);
  const valueText = Number.isFinite(step) && step < 1 ? raw.toFixed(1) : String(Math.round(raw));
  return unit ? `${valueText} ${unit}` : valueText;
}

function ensureRangeValueEl(rangeEl) {
  let valueEl = rangeEl._valueEl;
  if (valueEl) return valueEl;

  valueEl = document.createElement('span');
  valueEl.className = 'range-live-value';

  const dynFader = rangeEl.closest('.dyn-fader');
  if (dynFader) {
    valueEl.classList.add('dyn-fader-value');
    dynFader.appendChild(valueEl);
  } else {
    const host = rangeEl.closest('label') || rangeEl.parentElement;
    if (host) host.appendChild(valueEl);
  }

  rangeEl._valueEl = valueEl;
  return valueEl;
}

function initRangeLiveValues() {
  const ranges = document.querySelectorAll('input[type="range"]');
  ranges.forEach((rangeEl) => {
    const valueEl = ensureRangeValueEl(rangeEl);
    const render = () => {
      valueEl.textContent = formatRangeValue(rangeEl);
    };
    render();
    rangeEl.addEventListener('input', render);
    rangeEl.addEventListener('change', render);
  });
}

function renderEqLine(target) {
  const line = (target === 'l' || target === 'r')
    ? document.getElementById(`eq-path-${target}`)
    : document.getElementById(`eq-line-${target}`);
  const pointsGroup = document.getElementById(`eq-points-${target}`);
  const labelsGroup = document.getElementById(`eq-labels-${target}`);
  if (!line) return;

  let mapped = [];
  if (target === 'l' || target === 'r') {
    renderFreqAxis(target);
    const bands = getPreampBands(target);
    const activeBands = bands.filter((b) => b.active);
    if (!activeBands.length) {
      line.setAttribute('d', 'M 0 15 L 100 15');
      if (pointsGroup) pointsGroup.innerHTML = '';
      if (labelsGroup) labelsGroup.innerHTML = '';
      return;
    }
    mapped = activeBands.map((b) => {
      const x = freqToLogX(b.fc);
      const y = dbToY(b.gain);
      return { x, y, label: `F${b.id}`, bandId: b.id };
    });
    line.setAttribute('d', buildEqResponsePath(activeBands));
  } else {
    const sliders = document.querySelectorAll(`.eq-band[data-eq-target="${target}"]`);
    if (!sliders.length) return;
    const values = Array.from(sliders).map((s) => Number(s.value));
    const step = 100 / (values.length - 1);
    mapped = values.map((v, i) => {
      const x = i * step;
      const y = 15 - (v * 0.9);
      return { x, y };
    });
  }

  mapped.sort((a, b) => a.x - b.x);
  if (target !== 'l' && target !== 'r') {
    const points = mapped.map((p) => `${p.x},${p.y}`).join(' ');
    line.setAttribute('points', points);
  }
  if (pointsGroup) {
    pointsGroup.innerHTML = mapped.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="1.2" data-band="${p.bandId ?? ''}"></circle>`).join('');
  }
  if (labelsGroup && (target === 'l' || target === 'r')) {
    const bands = getPreampBands(target);
    labelsGroup.innerHTML = mapped.map((p) => {
      const band = bands[p.bandId];
      const typeText = String(band?.type || 'PK').toUpperCase();
      const freqText = formatFreq(band?.fc ?? 0);
      const gainText = `${(band?.gain ?? 0).toFixed(1)} dB`;
      const yTop = Math.max(1.6, p.y - 3.0);
      const yBottom = yTop + 1.35;
      return `
        <text class="eq-point-tag eq-point-tag-title" x="${p.x}" y="${yTop}" text-anchor="middle">F${p.bandId} • ${typeText} • ${freqText}</text>
        <text class="eq-point-tag eq-point-tag-sub" x="${p.x}" y="${yBottom}" text-anchor="middle">${gainText}</text>
      `;
    }).join('');
  }
}

function freqToLogX(fc) {
  const minF = EQ_MIN_FREQ;
  const maxF = getEqMaxFreq();
  const f = Math.max(minF, Math.min(maxF, Number(fc) || minF));
  const ratio = (Math.log10(f) - Math.log10(minF)) / (Math.log10(maxF) - Math.log10(minF));
  return Math.max(0, Math.min(100, ratio * 100));
}

function xToFreq(x) {
  const minF = EQ_MIN_FREQ;
  const maxF = getEqMaxFreq();
  const ratio = Math.max(0, Math.min(1, x / 100));
  const freq = 10 ** (Math.log10(minF) + ratio * (Math.log10(maxF) - Math.log10(minF)));
  return Math.round(freq);
}

function getEqSampleRate() {
  const fromWin = Number(window.EQ_FS);
  const fromQuery = Number(new URLSearchParams(window.location.search).get('fs'));
  const fs = Number.isFinite(fromWin) && fromWin > 2000
    ? fromWin
    : (Number.isFinite(fromQuery) && fromQuery > 2000 ? fromQuery : EQ_DEFAULT_FS);
  return Math.max(8000, Math.min(192000, fs));
}

function getEqMaxFreq() {
  const nyquist = getEqSampleRate() * 0.5;
  return Math.max(EQ_MIN_FREQ * 2, Math.min(EQ_MAX_FREQ_HARD, nyquist));
}

function parseTickTextToFreq(text) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return null;
  if (s.endsWith('k')) return Number(s.slice(0, -1)) * 1000;
  return Number(s);
}

function formatTickFreq(freq) {
  if (freq >= 1000) {
    const k = freq / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `${Math.round(freq)}`;
}

function renderFreqAxis(side = 'l') {
  const row = document.querySelector(`#ch-${side} .freq-row`);
  if (!row) return;
  const ticks = Array.from(row.querySelectorAll('span'));
  if (!ticks.length) return;

  row.style.position = 'relative';
  row.style.height = '16px';

  const maxF = getEqMaxFreq();
  ticks.forEach((tick) => {
    const f = parseTickTextToFreq(tick.dataset.freq || tick.textContent);
    if (!Number.isFinite(f) || f < EQ_MIN_FREQ || f > maxF) {
      tick.style.display = 'none';
      return;
    }
    tick.style.display = 'block';
    tick.style.position = 'absolute';
    tick.style.left = `${freqToLogX(f)}%`;
    tick.style.transform = 'translateX(-50%)';
    tick.textContent = formatTickFreq(f);
  });

  // Keep edge labels inside viewport on narrow screens.
  const first = ticks[0];
  if (first) {
    first.style.left = '0%';
    first.style.transform = 'translateX(0)';
  }

  // Ensure right-most Nyquist tick always visible when Fs < 40k.
  const last = ticks[ticks.length - 1];
  if (maxF < EQ_MAX_FREQ_HARD && last) {
    last.style.display = 'block';
    last.style.position = 'absolute';
    last.style.left = '100%';
    last.style.transform = 'translateX(-100%)';
    last.textContent = formatTickFreq(maxF);
  }
}

function yToGain(y) {
  const gain = DB_MAX - (Math.max(0, Math.min(CHART_H, y)) / CHART_H) * (DB_MAX - DB_MIN);
  return Math.max(DB_MIN, Math.min(DB_MAX, Math.round(gain * 10) / 10));
}

function qToTension(q) {
  const qSafe = Math.max(0.1, Math.min(10, q || 0.707));
  return Math.max(0.08, Math.min(0.40, 0.40 - ((qSafe - 0.1) / 9.9) * 0.30));
}

function buildSmoothPathByQ(points) {
  if (!points.length) return 'M 0 15 L 100 15';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const b0 = preampBands[p0.bandId];
    const b1 = preampBands[p1.bandId];
    const qAvg = ((b0?.q ?? 0.707) + (b1?.q ?? 0.707)) * 0.5;
    const t = qToTension(qAvg);
    const dx = p1.x - p0.x;
    const cp1x = p0.x + dx * t;
    const cp1y = p0.y;
    const cp2x = p1.x - dx * t;
    const cp2y = p1.y;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

function buildEqResponsePath(activeBands) {
  const samples = 170;
  let d = '';
  for (let i = 0; i <= samples; i += 1) {
    const x = (i / samples) * 100;
    const freq = xToFreq(x);
    let gainSum = 0;
    activeBands.forEach((band) => {
      gainSum += bandResponseDb(band, freq);
    });
    const gainClamped = Math.max(DB_MIN, Math.min(DB_MAX, gainSum));
    const y = dbToY(gainClamped);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return d;
}

function dbToY(db) {
  const c = Math.max(DB_MIN, Math.min(DB_MAX, db));
  return ((DB_MAX - c) / (DB_MAX - DB_MIN)) * CHART_H;
}

function formatFreq(fc) {
  if (!fc) return '0Hz';
  if (fc >= 1000) {
    const k = fc / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}kHz`;
  }
  return `${Math.round(fc)}Hz`;
}

function updateDrcCurve() {
  if (!drcCurve) return;
  const threshold = Number(document.getElementById('drc-threshold')?.value ?? -24);
  const ratio = Math.max(1, Number(document.getElementById('drc-ratio')?.value ?? 3));
  const knee = Math.max(0, Number(document.getElementById('drc-knee')?.value ?? 6));
  const makeup = Number(document.getElementById('drc-makeup')?.value ?? 0);

  const inMin = -80;
  const inMax = 0;
  const outMin = -80;
  const outMax = 12;
  const n = 90;
  let pts = '';

  for (let i = 0; i <= n; i += 1) {
    const xDb = inMin + (i / n) * (inMax - inMin);
    let yDb;
    if (knee <= 0) {
      yDb = xDb <= threshold ? xDb : threshold + (xDb - threshold) / ratio;
    } else {
      const kneeStart = threshold - knee * 0.5;
      const kneeEnd = threshold + knee * 0.5;
      if (xDb < kneeStart) {
        yDb = xDb;
      } else if (xDb > kneeEnd) {
        yDb = threshold + (xDb - threshold) / ratio;
      } else {
        const t = (xDb - kneeStart) / knee;
        const linear = xDb;
        const comp = threshold + (xDb - threshold) / ratio;
        yDb = linear * (1 - t) + comp * t;
      }
    }
    yDb += makeup;

    const px = 10 + ((xDb - inMin) / (inMax - inMin)) * 82;
    const py = 90 - ((yDb - outMin) / (outMax - outMin)) * 80;
    pts += i === 0 ? `${px},${py}` : ` ${px},${py}`;
  }

  drcCurve.setAttribute('points', pts);
}

function sigmoid(v) {
  return 1 / (1 + Math.exp(-v));
}

function bandResponseDb(band, freq) {
  const type = String(band.type || 'PK').toUpperCase();
  const fs = getEqSampleRate();
  const maxFc = Math.min(getEqMaxFreq(), fs * 0.49);
  const fc = Math.max(20, Math.min(maxFc, Number(band.fc) || 1000));
  const q = Math.max(0.1, Math.min(10, Number(band.q) || 0.707));
  const gain = Math.max(DB_MIN, Math.min(DB_MAX, Number(band.gain) || 0));
  const w0 = (2 * Math.PI * fc) / fs;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * q);
  const A = 10 ** (gain / 40);
  const sqrtA = Math.sqrt(A);

  let b0; let b1; let b2; let a0; let a1; let a2;
  switch (type) {
    case 'LP':
      b0 = (1 - cosw0) * 0.5; b1 = 1 - cosw0; b2 = (1 - cosw0) * 0.5;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
      break;
    case 'HP':
      b0 = (1 + cosw0) * 0.5; b1 = -(1 + cosw0); b2 = (1 + cosw0) * 0.5;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
      break;
    case 'BP':
      // RBJ BPF with constant 0 dB peak gain.
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
      break;
    case 'NOTCH':
      b0 = 1; b1 = -2 * cosw0; b2 = 1;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
      break;
    case 'LS':
      b0 = A * ((A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosw0);
      b2 = A * ((A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha);
      a0 = (A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosw0);
      a2 = (A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha;
      break;
    case 'HS':
      b0 = A * ((A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
      b2 = A * ((A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha);
      a0 = (A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosw0);
      a2 = (A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha;
      break;
    case 'PK':
    default:
      b0 = 1 + alpha * A; b1 = -2 * cosw0; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cosw0; a2 = 1 - alpha / A;
      break;
  }

  const w = (2 * Math.PI * freq) / fs;
  const c1 = Math.cos(w); const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w); const s2 = Math.sin(2 * w);

  const numRe = b0 + b1 * c1 + b2 * c2;
  const numIm = -(b1 * s1 + b2 * s2);
  const denRe = a0 + a1 * c1 + a2 * c2;
  const denIm = -(a1 * s1 + a2 * s2);

  const num2 = numRe * numRe + numIm * numIm;
  const den2 = denRe * denRe + denIm * denIm;
  const mag = Math.sqrt(num2 / Math.max(1e-20, den2));
  return 20 * Math.log10(Math.max(1e-8, mag));
}

function typeUsesGain(type) {
  const t = String(type || 'PK').toUpperCase();
  return t === 'PK' || t === 'LS' || t === 'HS';
}

function renderPreampRows(side = 'l') {
  const tableBody = side === 'r' ? preampTableBodyR : preampTableBodyL;
  const bands = getPreampBands(side);
  if (!tableBody) return;
  const rows = bands
    .filter((b) => b.active)
    .map((b) => `
      <div class="eq-table-row" data-row-band="${b.id}">
        <div class="eq-cell eq-cell-band">
          <span class="eq-cell-label">Band</span>
          <span class="eq-cell-value">F${b.id}</span>
        </div>
        <label class="eq-cell">
          <span class="eq-cell-label">Type</span>
          <select data-field="type" data-band="${b.id}">
            <option value="LP" ${b.type === 'LP' ? 'selected' : ''}>LP</option>
            <option value="HP" ${b.type === 'HP' ? 'selected' : ''}>HP</option>
            <option value="BP" ${b.type === 'BP' ? 'selected' : ''}>BP</option>
            <option value="NOTCH" ${b.type === 'NOTCH' ? 'selected' : ''}>NOTCH</option>
            <option value="PK" ${b.type === 'PK' ? 'selected' : ''}>PK</option>
            <option value="LS" ${b.type === 'LS' ? 'selected' : ''}>LS</option>
            <option value="HS" ${b.type === 'HS' ? 'selected' : ''}>HS</option>
          </select>
        </label>
        <label class="eq-cell">
          <span class="eq-cell-label">Fc</span>
          <input data-field="fc" data-band="${b.id}" type="number" min="20" max="20000" value="${b.fc}">
        </label>
        <label class="eq-cell">
          <span class="eq-cell-label">Gain</span>
          <input data-field="gain" data-band="${b.id}" type="number" step="0.1" min="-12" max="12" value="${b.gain.toFixed(1)}" ${typeUsesGain(b.type) ? '' : 'disabled'}>
        </label>
        <label class="eq-cell">
          <span class="eq-cell-label">Q</span>
          <input data-field="q" data-band="${b.id}" type="number" step="0.001" min="0.100" max="10.000" value="${b.q.toFixed(3)}">
        </label>
      </div>
    `).join('');
  tableBody.innerHTML = rows;
}

function syncBandChipUI(side = 'l') {
  const chips = side === 'r' ? preampBandChipsR : preampBandChipsL;
  const bands = getPreampBands(side);
  chips.forEach((chip) => {
    const idx = Number(chip.dataset.band);
    const band = bands[idx];
    chip.classList.toggle('active', !!band?.active);
  });
}

function updatePreampRowFields(side, bandId) {
  const tableBody = side === 'r' ? preampTableBodyR : preampTableBodyL;
  const bands = getPreampBands(side);
  if (!tableBody) return;
  const band = bands[bandId];
  if (!band) return;
  const fcInput = tableBody.querySelector(`input[data-field="fc"][data-band="${bandId}"]`);
  const gainInput = tableBody.querySelector(`input[data-field="gain"][data-band="${bandId}"]`);
  if (fcInput) fcInput.value = String(band.fc);
  if (gainInput) gainInput.value = String(band.gain.toFixed(1));
}

if (btnSave) {
  btnSave.addEventListener('click', () => {
    sendTx('save');
    setTimeout(() => setTxStatus('idle'), 1200);
  });
}

if (btnConnect) {
  btnConnect.addEventListener('click', () => {
    connected = true;
    setConnUI();
    setTxStatus('link up', 'ok');
  });
}

if (btnDisconnect) {
  btnDisconnect.addEventListener('click', () => {
    connected = false;
    setConnUI();
    setTxStatus('link down', 'bad');
  });
}

if (eqPresetSel) {
  eqPresetSel.addEventListener('change', () => {
    sendTx(`preset_${eqPresetSel.value}`);
  });
}

function bindPreampChipEvents(side, chips) {
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const idx = Number(chip.dataset.band);
      const bands = getPreampBands(side);
      const band = bands[idx];
      if (!band) return;
      band.active = !band.active;
      syncBandChipUI(side);
      renderPreampRows(side);
      renderEqLine(side);
      if (side === 'l') {
        sendTx(`band_F${idx}_${band.active ? 'on' : 'off'}`);
      } else {
        sendTx(`band_r_F${idx}_${band.active ? 'on' : 'off'}`);
      }
    });
  });
}

bindPreampChipEvents('l', preampBandChipsL);
bindPreampChipEvents('r', preampBandChipsR);

function bindPreampTableEvents(side, tableBody) {
  if (!tableBody) return;
  tableBody.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const bandId = Number(target.getAttribute('data-band'));
    const field = target.getAttribute('data-field');
    const bands = getPreampBands(side);
    const band = bands[bandId];
    if (!band || !field) return;

    if (field === 'type' && target instanceof HTMLSelectElement) {
      band.type = target.value;
      if (!typeUsesGain(band.type)) band.gain = 0;
    }
    if (field === 'fc' && target instanceof HTMLInputElement) {
      const v = Number(String(target.value).replace(',', '.'));
      if (!Number.isNaN(v)) band.fc = Math.max(20, Math.min(20000, Math.round(v)));
    }
    if (field === 'gain' && target instanceof HTMLInputElement) {
      if (!typeUsesGain(band.type)) {
        band.gain = 0;
      } else {
      const v = Number(String(target.value).replace(',', '.'));
      if (!Number.isNaN(v)) band.gain = Math.max(DB_MIN, Math.min(DB_MAX, v));
      }
    }
    if (field === 'q' && target instanceof HTMLInputElement) {
      const v = Number(String(target.value).replace(',', '.'));
      if (!Number.isNaN(v)) band.q = Math.max(0.1, Math.min(10, v));
    }

    renderEqLine(side);
    renderPreampRows(side);
    updatePreampRowFields(side, bandId);
    if (side === 'l') {
      sendTx(`band_F${bandId}_${field}_${target.value}`);
    } else {
      sendTx(`band_r_F${bandId}_${field}_${target.value}`);
    }
  });
}

bindPreampTableEvents('l', preampTableBodyL);
bindPreampTableEvents('r', preampTableBodyR);

const onEqDragMove = (event) => {
  if (!isDragging || draggingBandId === null || !draggingSide) return;
  const svg = draggingSide === 'r' ? eqSvgR : eqSvgL;
  if (!svg) return;
  const bands = getPreampBands(draggingSide);
  const band = bands[draggingBandId];
  if (!band || !band.active) return;
  const rect = svg.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 30;
  band.fc = xToFreq(x);
  if (typeUsesGain(band.type)) {
    band.gain = yToGain(y);
  } else {
    band.gain = 0;
  }
  renderEqLine(draggingSide);
  updatePreampRowFields(draggingSide, draggingBandId);
  setTxStatus('DRAG EQ', 'ok');
  event.preventDefault();
};

const stopEqDrag = () => {
  if (!isDragging || draggingBandId === null || !draggingSide) return;
  if (draggingSide === 'l') {
    sendTx(`drag_F${draggingBandId}_ok`);
  } else {
    sendTx(`drag_r_F${draggingBandId}_ok`);
  }
  const side = draggingSide;
  draggingBandId = null;
  draggingSide = null;
  isDragging = false;
  setDragScrollLock(false);
  document.querySelectorAll(`#eq-points-${side} circle.dragging`).forEach((c) => c.classList.remove('dragging'));
};

function bindEqDrag(side, svg) {
  if (!svg) return;
  svg.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof SVGCircleElement)) return;
    const bandId = Number(target.getAttribute('data-band'));
    if (Number.isNaN(bandId)) return;
    draggingBandId = bandId;
    draggingSide = side;
    isDragging = true;
    target.classList.add('dragging');
    setDragScrollLock(true);
    if (typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
}

bindEqDrag('l', eqSvgL);
bindEqDrag('r', eqSvgR);
window.addEventListener('pointermove', onEqDragMove, { passive: false });
window.addEventListener('pointerup', stopEqDrag);
window.addEventListener('pointercancel', stopEqDrag);

document.querySelectorAll('input[type="range"]').forEach((slider) => {
  slider.addEventListener('pointerdown', () => setDragScrollLock(true));
  slider.addEventListener('pointerup', () => setDragScrollLock(false));
  slider.addEventListener('pointercancel', () => setDragScrollLock(false));
});
window.addEventListener('pointerup', () => {
  if (!isDragging) setDragScrollLock(false);
});
window.addEventListener('pointercancel', () => {
  if (!isDragging) setDragScrollLock(false);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setDragScrollLock(false);
});

if (btNameInput) {
  btNameInput.addEventListener('change', () => {
    sendTx(`bt_name_${btNameInput.value}`);
    if (chipDevice) chipDevice.textContent = btNameInput.value || 'MVAPP_DSP_01';
  });
}

if (bleNameInput) {
  bleNameInput.addEventListener('change', () => {
    sendTx(`ble_name_${bleNameInput.value}`);
  });
}

document.querySelectorAll('.eq-band').forEach((el) => {
  el.addEventListener('input', () => {
    renderEqLine(el.dataset.eqTarget);
  });
  el.addEventListener('change', () => {
    sendTx(`eq_${el.dataset.eqTarget}_${el.value}`);
  });
});

document.querySelectorAll('input[type="range"]:not(.eq-band), select').forEach((el) => {
  el.addEventListener('change', () => {
    const key = `${el.id || el.tagName}:${el.value}`;
    sendTx(key);
  });
});

drcParams.forEach((el) => {
  el.addEventListener('input', () => {
    updateDrcCurve();
    sendTx(`drc_${el.id}_${el.value}`);
  });
  el.addEventListener('change', () => updateDrcCurve());
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  if (isRunningAsInstalledApp()) {
    hidePwaBar();
    return;
  }
  deferredInstallPrompt = event;
  pwaBarClosedByUser = false;
  localStorage.removeItem(PWA_BAR_CLOSED_KEY);
  showPwaBar();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hidePwaBar();
});

if (btnPwaInstall) {
  btnPwaInstall.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      const secure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (!secure) {
        alert('PWA chi ho tro tren HTTPS hoac localhost.');
      } else {
        alert('Trinh duyet chua cho phep Install Prompt. Thu reload trang, hoac vao menu trinh duyet -> Save and share -> Install page as app.');
      }
      return;
    }
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch (_) {
      // no-op
    }
    deferredInstallPrompt = null;
    hidePwaBar();
  });
}

if (btnPwaClose) {
  btnPwaClose.addEventListener('click', () => {
    pwaBarClosedByUser = true;
    localStorage.setItem(PWA_BAR_CLOSED_KEY, '1');
    hidePwaBar();
  });
}

if (!pwaBarClosedByUser && !isRunningAsInstalledApp() && location.protocol !== 'file:') {
  setTimeout(() => {
    if (!deferredInstallPrompt) showPwaBar();
  }, 1200);
}

renderEqLine('l');
renderEqLine('r');
renderEqLine('mic');
renderPreampRows('l');
renderPreampRows('r');
syncBandChipUI('l');
syncBandChipUI('r');
updateDrcCurve();
setConnUI();
initRangeLiveValues();
renderFreqAxis('l');
renderFreqAxis('r');
renderEqLine('l');
renderEqLine('r');
renderPreampRows('l');
renderPreampRows('r');
