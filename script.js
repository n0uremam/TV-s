const branchSelect = document.getElementById("branchSelect");
const mediaFrame = document.getElementById("mediaFrame");
const overlayBranch = document.getElementById("overlayBranch");
const branchLabel = document.getElementById("branchLabel");
const muteBtn = document.getElementById("muteBtn");
const countdownEl = document.getElementById("countdown");

const progressBody = document.getElementById("progressBody");
const boardMeta = document.getElementById("boardMeta");
const refreshBtn = document.getElementById("refreshBtn");

let muted = true;

// ✅ Same playlist for ALL branches
const USE_SHARED_PLAYLIST_FOR_ALL_BRANCHES = true;
const SHARED_BRANCH_KEY = "shared";

// ✅ Auto shuffle
const AUTO_SHUFFLE = true;

let playlist = [];
let index = 0;
let timer = null;
let countdownTimer = null;

// ===================== MEDIA =====================

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

async function loadManifest(branch) {
  const b = USE_SHARED_PLAYLIST_FOR_ALL_BRANCHES ? SHARED_BRANCH_KEY : branch;

  try {
    const r = await fetch(`media/${b}/manifest.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error("manifest not found");
    const j = await r.json();

    playlist = (j.items || []).map(it => ({
      type: it.type,
      src: `media/${b}/${it.src}`,
      duration: it.duration
    }));

    if (AUTO_SHUFFLE) shuffleArray(playlist);

  } catch {
    playlist = [];
  }
}

function renderNoMedia() {
  mediaFrame.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#aaa;text-align:center;padding:20px">
      No media found.<br>
      Create: <b>media/shared/manifest.json</b> and upload media files.
    </div>`;
  countdownEl.textContent = "--";
}

function clearTimers() {
  if (timer) clearTimeout(timer);
  if (countdownTimer) clearInterval(countdownTimer);
  timer = null;
  countdownTimer = null;
}

function startCountdown(sec) {
  clearInterval(countdownTimer);
  let s = sec;
  countdownEl.textContent = s;
  countdownTimer = setInterval(() => {
    s--;
    countdownEl.textContent = Math.max(s, 0);
    if (s <= 0) clearInterval(countdownTimer);
  }, 1000);
}

function next() {
  if (!playlist.length) return renderNoMedia();
  index = (index + 1) % playlist.length;

  // ✅ Optional reshuffle when loop completes
  if (index === 0 && AUTO_SHUFFLE) shuffleArray(playlist);

  play();
}

function play() {
  clearTimers();

  if (!playlist.length) return renderNoMedia();

  const item = playlist[index];
  mediaFrame.innerHTML = "";

  if (item.type === "image") {
    const img = new Image();
    img.src = item.src;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    mediaFrame.appendChild(img);

    const d = item.duration || 6;
    startCountdown(d);
    timer = setTimeout(next, d * 1000);
    return;
  }

  // video
  const v = document.createElement("video");
  v.src = item.src;
  v.autoplay = true;
  v.muted = muted;
  v.playsInline = true;
  v.preload = "auto";
  v.controls = false;
  v.style.width = "100%";
  v.style.height = "100%";
  v.style.objectFit = "cover";

  mediaFrame.appendChild(v);

  v.onloadedmetadata = () => startCountdown(Math.ceil(v.duration || 8));
  v.onended = next;
  v.onerror = next;

  v.play().catch(() => {
    startCountdown(6);
    timer = setTimeout(next, 6000);
  });
}

// ===================== GOOGLE SHEET (ROBUST CSV PARSER) =====================

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";

function parseCSV(text) {
  const rows = [];
  let row = [], cur = "", inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"' && inQuotes && next === '"') { cur += '"'; i++; }
    else if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) { row.push(cur); cur = ""; }
    else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (cur.length || row.length) row.push(cur);
      if (row.length) rows.push(row);
      row = []; cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }

  return rows;
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadProgress() {
  progressBody.innerHTML = `<tr><td colspan="5" class="muted">Loading…</td></tr>`;

  try {
    const r = await fetch(CSV_URL, { cache: "no-store" });
    const csv = await r.text();
    const rows = parseCSV(csv);

    // skip header row
    const data = rows.slice(1).filter(r => r.some(cell => (cell || "").trim() !== ""));

    if (!data.length) {
      progressBody.innerHTML = `<tr><td colspan="5" class="muted">No cars in progress.</td></tr>`;
      boardMeta.textContent = "Live • 0";
      return;
    }

    // E,G,I,H,J -> indexes 4,6,8,7,9
    progressBody.innerHTML = data.map(r => `
      <tr>
        <td>${esc(r[4])}</td>
        <td>${esc(r[6])}</td>
        <td>${esc(r[8])}</td>
        <td>${esc(r[7])}</td>
        <td>${esc(r[9])}</td>
      </tr>
    `).join("");

    boardMeta.textContent = `Live • ${data.length}`;

  } catch {
    progressBody.innerHTML = `<tr><td colspan="5" class="muted">Offline</td></tr>`;
    boardMeta.textContent = "Offline";
  }
}

refreshBtn.addEventListener("click", loadProgress);
setInterval(loadProgress, 30000);

// ===================== TIME + DATE (CAIRO) =====================

function tickCairo() {
  const now = new Date();

  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  document.getElementById("timeCairo").textContent = timeFmt.format(now);
  document.getElementById("dateCairo").textContent = dateFmt.format(now);
}

setInterval(tickCairo, 1000);
tickCairo();

// ===================== WEATHER (CAIRO) =====================

async function loadWeather() {
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m&timezone=Africa%2FCairo";
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    document.getElementById("weatherCairo").textContent = `${Math.round(j.current.temperature_2m)}°C`;
  } catch {
    document.getElementById("weatherCairo").textContent = "--";
  }
}

loadWeather();
setInterval(loadWeather, 10 * 60 * 1000);

// ===================== EVENTS =====================

muteBtn.onclick = () => {
  muted = !muted;
  muteBtn.textContent = muted ? "Muted" : "Sound On";
};

branchSelect.onchange = async () => {
  const label = branchSelect.selectedOptions[0].text;
  overlayBranch.textContent = label;
  branchLabel.textContent = `${label} Branch • Waiting Room Display`;

  index = 0;
  await loadManifest(branchSelect.value);
  play();
};

// ===================== INIT =====================

(async () => {
  const label = branchSelect.selectedOptions[0].text;
  overlayBranch.textContent = label;
  branchLabel.textContent = `${label} Branch • Waiting Room Display`;

  await loadManifest(branchSelect.value);
  play();

  loadProgress();
})();
