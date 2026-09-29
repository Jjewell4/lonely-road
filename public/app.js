// Lonely Road: one button, one line.
//
// Where the clip comes from, in order:
//   1. A clip saved on this device through "Set up the clip" (IndexedDB).
//   2. A file deployed with the site at /audio/lonely-road.mp3 (or .m4a).

const BUNDLED_CLIPS = ['/audio/lonely-road.mp3', '/audio/lonely-road.m4a'];
const MAX_CLIP_SECONDS = 60;
const FADE_IN_SECONDS = 0.01;
const FADE_OUT_SECONDS = 0.25;

const $ = (id) => document.getElementById(id);
const playButton = $('play');
const statusEl = $('status');
const setup = $('setup');
const fileInput = $('file');
const editor = $('editor');
const preview = $('preview');
const startInput = $('start');
const endInput = $('end');
const saveButton = $('save');
const forgetButton = $('forget');

const player = new Audio();
player.preload = 'auto';

let clipUrl = null;
let sourceFile = null;
let previewStopTimer = null;

// ---------- storage (IndexedDB, one record) ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('lonely-road', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('clips');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbRequest(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = fn(db.transaction('clips', mode).objectStore('clips'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const getSavedClip = () => dbRequest('readonly', (s) => s.get('clip'));
const putSavedClip = (clip) => dbRequest('readwrite', (s) => s.put(clip, 'clip'));
const deleteSavedClip = () => dbRequest('readwrite', (s) => s.delete('clip'));

// ---------- loading the clip ----------

function setClip(blob) {
  if (clipUrl) URL.revokeObjectURL(clipUrl);
  clipUrl = URL.createObjectURL(blob);
  player.src = clipUrl;
  player.load();
}

async function loadClip() {
  try {
    const saved = await getSavedClip();
    if (saved?.blob) {
      setClip(saved.blob);
      forgetButton.hidden = false;
      return true;
    }
  } catch (err) {
    console.warn('Could not read saved clip', err);
  }

  for (const url of BUNDLED_CLIPS) {
    try {
      const res = await fetch(url);
      const type = res.headers.get('content-type') || '';
      if (res.ok && !type.startsWith('text/')) {
        setClip(await res.blob());
        return true;
      }
    } catch {
      // offline and not cached; try the next one
    }
  }
  return false;
}

// ---------- playback ----------

function setPlaying(on) {
  document.body.classList.toggle('playing', on);
}

async function play() {
  if (!clipUrl) {
    statusEl.textContent = 'No clip yet. Set one up below.';
    setup.open = true;
    return;
  }
  player.currentTime = 0;
  try {
    await player.play();
    statusEl.textContent = '';
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      statusEl.textContent = 'Tap the button to start walking.';
    } else {
      statusEl.textContent = `Couldn't play: ${err.message}`;
    }
  }
}

player.addEventListener('play', () => setPlaying(true));
player.addEventListener('pause', () => setPlaying(false));
player.addEventListener('ended', () => setPlaying(false));

playButton.addEventListener('click', play);

// ---------- clip setup ----------

const readNumber = (input) => Math.max(0, Number.parseFloat(input.value) || 0);
const round1 = (n) => Math.round(n * 10) / 10;

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  sourceFile = file;
  if (preview.src) URL.revokeObjectURL(preview.src);
  preview.src = URL.createObjectURL(file);
  editor.hidden = false;
  startInput.value = '0';
  endInput.value = '10';
  statusEl.textContent = `Loaded ${file.name}. Scrub to the line and mark it.`;
});

$('markStart').addEventListener('click', () => {
  startInput.value = round1(preview.currentTime);
  if (readNumber(endInput) <= readNumber(startInput)) {
    endInput.value = round1(readNumber(startInput) + 8);
  }
});

$('markEnd').addEventListener('click', () => {
  endInput.value = round1(preview.currentTime);
});

$('previewClip').addEventListener('click', () => {
  const start = readNumber(startInput);
  const end = readNumber(endInput);
  if (end <= start) {
    statusEl.textContent = 'End needs to be after start.';
    return;
  }
  clearTimeout(previewStopTimer);
  preview.currentTime = start;
  preview.play();
  previewStopTimer = setTimeout(() => preview.pause(), (end - start) * 1000);
});

preview.addEventListener('pause', () => clearTimeout(previewStopTimer));

saveButton.addEventListener('click', async () => {
  if (!sourceFile) return;
  const start = readNumber(startInput);
  const end = readNumber(endInput);
  if (end <= start) {
    statusEl.textContent = 'End needs to be after start.';
    return;
  }
  if (end - start > MAX_CLIP_SECONDS) {
    statusEl.textContent = `Keep it under ${MAX_CLIP_SECONDS} seconds.`;
    return;
  }

  saveButton.disabled = true;
  statusEl.textContent = 'Cutting the clip…';
  try {
    const blob = await cutClip(sourceFile, start, end);
    await putSavedClip({ blob, name: sourceFile.name, start, end, savedAt: Date.now() });
    setClip(blob);
    forgetButton.hidden = false;
    preview.pause();
    setup.open = false;
    statusEl.textContent = 'Saved. Tap to walk.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Couldn't cut that file: ${err.message}`;
  } finally {
    saveButton.disabled = false;
  }
});

forgetButton.addEventListener('click', async () => {
  await deleteSavedClip();
  forgetButton.hidden = true;
  if (clipUrl) URL.revokeObjectURL(clipUrl);
  clipUrl = null;
  player.removeAttribute('src');
  const found = await loadClip();
  statusEl.textContent = found ? 'Deleted. Using the bundled clip.' : 'Deleted.';
});

// Decode the whole song, keep [start, end) with a short fade, and encode it
// as a small WAV so we never have to keep the full track around.
async function cutClip(file, start, end) {
  const ctx = new AudioContext();
  try {
    const song = await ctx.decodeAudioData(await file.arrayBuffer());
    const rate = song.sampleRate;
    const from = Math.floor(Math.min(start, song.duration) * rate);
    const to = Math.floor(Math.min(end, song.duration) * rate);
    const length = to - from;
    if (length <= 0) throw new Error('that range is past the end of the song');

    const fadeIn = Math.min(length, Math.floor(FADE_IN_SECONDS * rate));
    const fadeOut = Math.min(length, Math.floor(FADE_OUT_SECONDS * rate));
    const channels = [];
    for (let c = 0; c < song.numberOfChannels; c++) {
      const data = song.getChannelData(c).slice(from, to);
      for (let i = 0; i < fadeIn; i++) data[i] *= i / fadeIn;
      for (let i = 0; i < fadeOut; i++) data[length - 1 - i] *= i / fadeOut;
      channels.push(data);
    }
    return encodeWav(channels, rate);
  } finally {
    ctx.close();
  }
}

function encodeWav(channels, sampleRate) {
  const numChannels = channels.length;
  const numFrames = channels[0].length;
  const blockAlign = numChannels * 2;
  const dataSize = numFrames * blockAlign;
  const view = new DataView(new ArrayBuffer(44 + dataSize));
  const writeString = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// ---------- launch behaviour ----------

const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches;

// Launch paths can overlap (start_url + launchQueue), so ignore a request that
// arrives just after the clip started, and never interrupt clip setup.
function autoPlay() {
  if (setup.open) return;
  if (!player.paused && player.currentTime < 0.5) return;
  play();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW failed', err));
}

const found = await loadClip();
if (!found) {
  statusEl.textContent = 'No clip yet. Set one up below.';
  setup.open = true;
} else if (new URLSearchParams(location.search).has('play')) {
  autoPlay();
}

// Tapping the home-screen icon while the app is already open just brings it
// back to the front, so play again whenever it becomes visible.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isInstalled()) autoPlay();
});

// Chrome's Launch Handler API (manifest "focus-existing") reports relaunches here.
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(() => autoPlay());
}
