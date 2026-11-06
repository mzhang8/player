const video = document.getElementById("video");
const videoSelect = document.getElementById("video-select");
const btnPickFolder = document.getElementById("btn-pick-folder");
const folderStatus = document.getElementById("folder-status");

const btnExport = document.getElementById("btn-export");
const btnImport = document.getElementById("btn-import");
const importFileInput = document.getElementById("import-file");
const backupStatus = document.getElementById("backup-status");

const btnPlay = document.getElementById("btn-play");
const btnBack = document.getElementById("btn-back");
const btnFwd = document.getElementById("btn-fwd");

const startInput = document.getElementById("start-time");
const endInput = document.getElementById("end-time");
const skipInput = document.getElementById("skip-amount");
const loopCheckbox = document.getElementById("loop-checkbox");

const speedSlider = document.getElementById("speed");
const speedLabel = document.getElementById("speed-label");

const scrubTrack = document.getElementById("scrub-track");
const scrubHighlight = document.getElementById("scrub-highlight");
const scrubThumb = document.getElementById("scrub-thumb");
const curTimeEl = document.getElementById("cur-time");
const durTimeEl = document.getElementById("dur-time");

const btnSaveConfig = document.getElementById("btn-save-config");
const saveStatus = document.getElementById("save-status");

const rangeNoteInput = document.getElementById("range-note");
const btnSaveRange = document.getElementById("btn-save-range");
const rangeSaveStatus = document.getElementById("range-save-status");
const rangesListEl = document.getElementById("ranges-list");

let currentRanges = [];
let isScrubbing = false;

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"];
const CONFIGS_FILE = "configs.json";
// Where settings were kept before they moved into the videos folder.
const LEGACY_CONFIGS_KEY = "practice-player:configs";

let currentFolder = null;
// Video files in the chosen folder, by name (FileSystemFileHandle values).
let videoFiles = new Map();
let currentObjectUrl = null;
// A remembered folder that Chrome needs a click to re-grant access to.
let folderAwaitingPermission = null;

// Per-video settings and saved sections, kept in configs.json inside the videos folder
// (same shape as the Flask app's configs.json).
let configs = {};
// Set when the folder's configs.json can't be parsed, so it never gets overwritten.
let configsUnreadable = false;

async function readConfigsFile(folder) {
  let file;
  try {
    file = await (await folder.getFileHandle(CONFIGS_FILE)).getFile();
  } catch (e) {
    if (e.name === "NotFoundError") return {};
    throw e;
  }
  const parsed = JSON.parse(await file.text());
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${CONFIGS_FILE} isn't a settings file`);
  }
  return parsed;
}

async function saveConfigs() {
  if (!currentFolder) throw new Error("Choose a videos folder first.");
  if (configsUnreadable) {
    throw new Error(`${CONFIGS_FILE} in this folder couldn't be read, so it wasn't overwritten.`);
  }
  const handle = await currentFolder.getFileHandle(CONFIGS_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(configs, null, 2));
  await writable.close();
}

// Merges `incoming` into `base`. Settings from `incoming` win; saved sections are
// combined, skipping duplicates.
function mergeConfigs(base, incoming) {
  for (const [name, entry] of Object.entries(incoming)) {
    const existing = base[name] || {};
    const ranges = [...(existing.ranges || [])];
    for (const r of entry.ranges || []) {
      if (!ranges.some((x) => x.id === r.id)) ranges.push(r);
    }
    base[name] = { ...existing, ...entry, ranges };
  }
  return base;
}

// Moves settings saved by the earlier, browser-storage version of this page into
// the folder's configs.json (the file's own settings win).
async function migrateLegacyConfigs() {
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_CONFIGS_KEY));
  } catch (e) {
    return;
  }
  if (!legacy || typeof legacy !== "object" || configsUnreadable) return;
  configs = mergeConfigs(legacy, configs);
  await saveConfigs();
  localStorage.removeItem(LEGACY_CONFIGS_KEY);
}

function flashStatus(el, text, ms = 1500) {
  el.textContent = text;
  setTimeout(() => {
    el.textContent = "";
  }, ms);
}

// The folder handle is kept in IndexedDB so the folder is remembered between visits.
function withHandleStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("practice-player", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("handles");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("handles", mode);
      const req = fn(tx.objectStore("handles"));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

const getSavedFolder = () => withHandleStore("readonly", (store) => store.get("folder"));
const rememberFolder = (handle) => withHandleStore("readwrite", (store) => store.put(handle, "folder"));

function fmtTime(t) {
  if (!isFinite(t) || t < 0) return "0:00.00";
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

// Accepts "M:SS.mm", "M:SS", or plain seconds ("SS.mm" / "SS").
function parseTimeStr(str) {
  if (typeof str !== "string") return NaN;
  str = str.trim();
  if (str === "") return NaN;
  const parts = str.split(":");
  if (parts.length === 1) {
    const s = parseFloat(parts[0]);
    return isNaN(s) ? NaN : s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (isNaN(m) || isNaN(s)) return NaN;
    return m * 60 + s;
  }
  return NaN;
}

function normalizeTimeField(input) {
  const raw = input.value.trim();
  if (raw === "") return;
  const secs = parseTimeStr(raw);
  input.value = isNaN(secs) || secs < 0 ? "" : fmtTime(secs);
}

function updateRangeHighlight() {
  const dur = video.duration;
  if (!isFinite(dur) || dur <= 0) {
    scrubHighlight.style.display = "none";
    return;
  }
  const start = getStart();
  const end = getEnd();
  if (!(end > start)) {
    scrubHighlight.style.display = "none";
    return;
  }
  scrubHighlight.style.left = `${(start / dur) * 100}%`;
  scrubHighlight.style.width = `${((end - start) / dur) * 100}%`;
  scrubHighlight.style.display = "block";
}

function updateThumbPosition() {
  const dur = video.duration;
  const pct = isFinite(dur) && dur > 0 ? (video.currentTime / dur) * 100 : 0;
  scrubThumb.style.left = `${Math.min(Math.max(pct, 0), 100)}%`;
}

function seekFromPointer(e) {
  const dur = video.duration;
  if (!isFinite(dur) || dur <= 0) return;
  const rect = scrubTrack.getBoundingClientRect();
  const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
  const frac = rect.width > 0 ? x / rect.width : 0;
  video.currentTime = frac * dur;
  scrubThumb.style.left = `${frac * 100}%`;
  curTimeEl.textContent = fmtTime(frac * dur);
}

function getStart() {
  const v = parseTimeStr(startInput.value);
  return isNaN(v) || v < 0 ? 0 : v;
}

function getEnd() {
  const v = parseTimeStr(endInput.value);
  const dur = video.duration;
  if (isNaN(v) || v <= 0) return isFinite(dur) ? dur : Infinity;
  return isFinite(dur) ? Math.min(v, dur) : v;
}

async function loadVideoList(folder) {
  videoFiles = new Map();
  for await (const entry of folder.values()) {
    const ext = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
    if (entry.kind === "file" && VIDEO_EXTENSIONS.includes(ext)) {
      videoFiles.set(entry.name, entry);
    }
  }
  const videos = [...videoFiles.keys()].sort();

  videoSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = `Choose a video from ${folder.name}…`;
  videoSelect.appendChild(placeholder);
  for (const name of videos) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    videoSelect.appendChild(opt);
  }

  btnPickFolder.textContent = "Change folder…";
  folderStatus.textContent = `${videos.length} video${videos.length === 1 ? "" : "s"} in “${folder.name}”`;
}

async function openFolder(folder) {
  currentFolder = folder;
  video.removeAttribute("src");
  video.load();
  renderRanges([]);

  configsUnreadable = false;
  try {
    configs = await readConfigsFile(folder);
  } catch (e) {
    configs = {};
    configsUnreadable = true;
  }
  let migrateError = null;
  try {
    await migrateLegacyConfigs();
  } catch (e) {
    migrateError = e;
  }

  await loadVideoList(folder);
  if (configsUnreadable) {
    folderStatus.textContent += ` — couldn't read ${CONFIGS_FILE}, so changes won't be saved until it's fixed or removed.`;
  } else if (migrateError) {
    folderStatus.textContent += ` — couldn't save ${CONFIGS_FILE}: ${migrateError.message}`;
  }
}

async function pickFolder() {
  let folder;
  try {
    folder = await window.showDirectoryPicker({ id: "videos", mode: "readwrite", startIn: "downloads" });
  } catch (e) {
    if (e.name !== "AbortError") folderStatus.textContent = `Couldn't open that folder: ${e.message}`;
    return;
  }
  folderAwaitingPermission = null;
  await rememberFolder(folder);
  await openFolder(folder);
}

async function onPickFolderClick() {
  if (folderAwaitingPermission) {
    const folder = folderAwaitingPermission;
    if ((await folder.requestPermission({ mode: "readwrite" })) === "granted") {
      folderAwaitingPermission = null;
      await openFolder(folder);
      return;
    }
  }
  await pickFolder();
}

async function restoreFolder() {
  if (!window.showDirectoryPicker) {
    btnPickFolder.disabled = true;
    folderStatus.textContent = "This browser can't open local folders. Use Chrome or Edge.";
    return;
  }
  const folder = await getSavedFolder().catch(() => null);
  if (!folder) return;
  if ((await folder.queryPermission({ mode: "readwrite" })) === "granted") {
    await openFolder(folder);
    return;
  }
  // Chrome only re-grants access after a click.
  folderAwaitingPermission = folder;
  btnPickFolder.textContent = `Reconnect “${folder.name}”`;
}

function loadConfigForVideo(name) {
  const cfg = configs[name] || {};

  startInput.value = cfg.start != null ? fmtTime(cfg.start) : "";
  endInput.value = cfg.end != null ? fmtTime(cfg.end) : "";
  loopCheckbox.checked = !!cfg.loop;

  const speedPct = cfg.speed != null ? cfg.speed : 100;
  speedSlider.value = speedPct;
  speedLabel.textContent = `${speedPct}%`;
  video.playbackRate = speedPct / 100;

  skipInput.value = cfg.skip != null ? cfg.skip : 1;

  rangeNoteInput.value = "";
  renderRanges([...(cfg.ranges || [])]);
  updateRangeHighlight();
}

function renderRanges(ranges) {
  currentRanges = ranges || [];
  rangesListEl.innerHTML = "";

  if (currentRanges.length === 0) {
    const empty = document.createElement("p");
    empty.className = "ranges-empty";
    empty.textContent = "No saved sections yet for this video.";
    rangesListEl.appendChild(empty);
    return;
  }

  const sorted = [...currentRanges].sort((a, b) => a.start - b.start);
  for (const r of sorted) {
    const item = document.createElement("div");
    item.className = "range-item";

    const times = document.createElement("span");
    times.className = "range-times";
    times.textContent = `${fmtTime(r.start)} – ${fmtTime(r.end)}`;

    const note = document.createElement("span");
    note.className = "range-note";
    note.textContent = r.note || "";

    const del = document.createElement("button");
    del.className = "btn-delete-range";
    del.title = "Delete this saved section";
    del.innerHTML = "&times;";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteRange(r.id);
    });

    item.addEventListener("click", () => {
      startInput.value = fmtTime(r.start);
      endInput.value = fmtTime(r.end);
      updateRangeHighlight();
    });

    item.appendChild(times);
    item.appendChild(note);
    item.appendChild(del);
    rangesListEl.appendChild(item);
  }
}

async function saveCurrentRange() {
  const name = videoSelect.value;
  if (!name) return;

  if (startInput.value.trim() === "" || endInput.value.trim() === "") {
    rangeSaveStatus.textContent = "Set both start and end time first.";
    setTimeout(() => {
      rangeSaveStatus.textContent = "";
    }, 2000);
    return;
  }

  const start = getStart();
  const end = getEnd();
  if (!(end > start)) {
    rangeSaveStatus.textContent = "End time must be after start time.";
    setTimeout(() => {
      rangeSaveStatus.textContent = "";
    }, 2000);
    return;
  }

  const note = rangeNoteInput.value.trim();
  const entry = configs[name] || (configs[name] = {});
  const ranges = entry.ranges || (entry.ranges = []);
  const newRange = { id: crypto.randomUUID().replaceAll("-", "").slice(0, 8), start, end, note };
  ranges.push(newRange);
  try {
    await saveConfigs();
  } catch (e) {
    flashStatus(rangeSaveStatus, `Not saved: ${e.message}`, 5000);
    return;
  }
  currentRanges.push(newRange);
  renderRanges(currentRanges);
  rangeNoteInput.value = "";
  rangeSaveStatus.textContent = "Saved!";
  setTimeout(() => {
    rangeSaveStatus.textContent = "";
  }, 1500);
}

async function deleteRange(id) {
  const name = videoSelect.value;
  if (!name) return;
  const entry = configs[name];
  if (entry && entry.ranges) {
    entry.ranges = entry.ranges.filter((r) => r.id !== id);
    try {
      await saveConfigs();
    } catch (e) {
      flashStatus(rangeSaveStatus, `Not saved: ${e.message}`, 5000);
      return;
    }
  }
  currentRanges = currentRanges.filter((r) => r.id !== id);
  renderRanges(currentRanges);
}

async function saveConfigForCurrentVideo() {
  const name = videoSelect.value;
  if (!name) return;
  const payload = {
    start: startInput.value.trim() === "" ? null : getStart(),
    end: endInput.value.trim() === "" ? null : getEnd(),
    speed: parseInt(speedSlider.value, 10),
    loop: loopCheckbox.checked,
    skip: parseFloat(skipInput.value) || 1,
  };
  configs[name] = { ...configs[name], ...payload };
  try {
    await saveConfigs();
  } catch (e) {
    flashStatus(saveStatus, `Not saved: ${e.message}`, 5000);
    return;
  }
  saveStatus.textContent = "Saved!";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 1500);
}

function exportConfigs() {
  const blob = new Blob([JSON.stringify(configs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "configs.json";
  a.click();
  URL.revokeObjectURL(url);
}

// Merges an exported (or the Flask app's) configs.json into the folder's configs.json.
// Settings from the imported file win; saved sections are combined, skipping duplicates.
async function importConfigs(file) {
  if (!currentFolder) {
    flashStatus(backupStatus, "Choose a videos folder first.", 3000);
    return;
  }
  let incoming;
  try {
    incoming = JSON.parse(await file.text());
  } catch (e) {
    incoming = null;
  }
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    flashStatus(backupStatus, "That file isn't a settings export.", 3000);
    return;
  }

  mergeConfigs(configs, incoming);
  try {
    await saveConfigs();
  } catch (e) {
    flashStatus(backupStatus, `Not saved: ${e.message}`, 5000);
    return;
  }

  if (videoSelect.value) loadConfigForVideo(videoSelect.value);
  const count = Object.keys(incoming).length;
  flashStatus(backupStatus, `Imported settings for ${count} video${count === 1 ? "" : "s"}.`, 3000);
}

videoSelect.addEventListener("change", async () => {
  const name = videoSelect.value;
  if (!name) return;
  let file;
  try {
    file = await videoFiles.get(name).getFile();
  } catch (e) {
    folderStatus.textContent = `Couldn't open “${name}” — it may have been moved or deleted.`;
    return;
  }
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);
  video.src = currentObjectUrl;
  video.load();
  loadConfigForVideo(name);
});

function togglePlay() {
  if (!video.src) return;
  if (video.paused || video.ended) {
    const start = getStart();
    const end = getEnd();
    if (video.currentTime < start || video.currentTime >= end) {
      video.currentTime = start;
    }
    video.play();
  } else {
    video.pause();
  }
}

function jumpToStart() {
  if (!video.src) return;
  video.currentTime = getStart();
}

function jumpToEnd() {
  if (!video.src) return;
  const end = getEnd();
  video.currentTime = isFinite(end) ? end : video.duration || 0;
}

function step(direction) {
  if (!video.src) return;
  const amount = parseFloat(skipInput.value) || 1;
  const dur = isFinite(video.duration) ? video.duration : video.currentTime + amount;
  let newTime = video.currentTime + direction * amount;
  newTime = Math.max(0, Math.min(newTime, dur));
  video.currentTime = newTime;
}

startInput.addEventListener("input", updateRangeHighlight);
endInput.addEventListener("input", updateRangeHighlight);
startInput.addEventListener("blur", () => {
  normalizeTimeField(startInput);
  updateRangeHighlight();
});
endInput.addEventListener("blur", () => {
  normalizeTimeField(endInput);
  updateRangeHighlight();
});

const btnJumpStart = document.getElementById("btn-jump-start");
const btnJumpEnd = document.getElementById("btn-jump-end");

btnPlay.addEventListener("click", togglePlay);
btnBack.addEventListener("click", () => step(-1));
btnFwd.addEventListener("click", () => step(1));
btnJumpStart.addEventListener("click", jumpToStart);
btnJumpEnd.addEventListener("click", jumpToEnd);
btnSaveConfig.addEventListener("click", saveConfigForCurrentVideo);
btnSaveRange.addEventListener("click", saveCurrentRange);
btnPickFolder.addEventListener("click", onPickFolderClick);
btnExport.addEventListener("click", exportConfigs);
btnImport.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", () => {
  const file = importFileInput.files[0];
  importFileInput.value = "";
  if (file) importConfigs(file);
});

video.addEventListener("play", () => {
  btnPlay.innerHTML = "&#10074;&#10074;";
});
video.addEventListener("pause", () => {
  btnPlay.innerHTML = "&#9654;";
});

video.addEventListener("loadedmetadata", () => {
  durTimeEl.textContent = fmtTime(video.duration);
  updateThumbPosition();
  updateRangeHighlight();
});

video.addEventListener("timeupdate", () => {
  curTimeEl.textContent = fmtTime(video.currentTime);
  if (!isScrubbing) {
    updateThumbPosition();
  }

  const end = getEnd();
  if (video.currentTime >= end - 0.03 && !video.paused) {
    if (loopCheckbox.checked) {
      video.currentTime = getStart();
    } else {
      video.pause();
      video.currentTime = end;
    }
  }
});

video.addEventListener("ended", () => {
  if (loopCheckbox.checked) {
    video.currentTime = getStart();
    video.play();
  }
});

scrubTrack.addEventListener("pointerdown", (e) => {
  isScrubbing = true;
  scrubTrack.setPointerCapture(e.pointerId);
  seekFromPointer(e);
});
scrubTrack.addEventListener("pointermove", (e) => {
  if (!isScrubbing) return;
  seekFromPointer(e);
});
["pointerup", "pointercancel"].forEach((evt) =>
  scrubTrack.addEventListener(evt, (e) => {
    isScrubbing = false;
    if (scrubTrack.hasPointerCapture(e.pointerId)) {
      scrubTrack.releasePointerCapture(e.pointerId);
    }
  })
);

speedSlider.addEventListener("input", () => {
  const pct = parseInt(speedSlider.value, 10);
  video.playbackRate = pct / 100;
  speedLabel.textContent = `${pct}%`;
});

function isTypingTarget(el) {
  return el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
}

document.addEventListener("keydown", (e) => {
  if (isTypingTarget(document.activeElement)) return;

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    step(-1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    step(1);
  } else if (e.key === " ") {
    e.preventDefault();
    togglePlay();
  }
});

restoreFolder();
