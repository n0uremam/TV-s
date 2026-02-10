const mediaFrame = document.getElementById("mediaFrame");
const overlayBranch = document.getElementById("overlayBranch");
const branchLabel = document.getElementById("branchLabel");
const branchSelect = document.getElementById("branchSelect");
const muteBtn = document.getElementById("muteBtn");
const countdownEl = document.getElementById("countdown");

const progressBody = document.getElementById("progressBody");
const boardMeta = document.getElementById("boardMeta");
const refreshBtn = document.getElementById("refreshBtn");

let muted = true;
let playlist = [];
let index = 0;
let timer = null;
let countdownTimer = null;

const MANIFEST_URL = `media/shared/manifest.json`;
const BASE = `media/shared/`;

/* =========================
   MEDIA
========================= */

function clearMediaTimers(){
  clearTimeout(timer);
  clearInterval(countdownTimer);
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

async function loadManifest(){
  try{
    const r = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache:"no-store" });
    if (!r.ok) throw new Error(`Manifest HTTP ${r.status}`);
    const j = await r.json();

    playlist = (j.items || []).map(it => ({
      ...it,
      src: BASE + it.src
    }));

    if (!playlist.length) throw new Error("Manifest has 0 items");

    shuffle(playlist);
    play();
  }catch(e){
    mediaFrame.innerHTML = `
      <div style="color:#aaa;display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:20px;line-height:1.6">
        <div>
          <div style="font-weight:800;margin-bottom:6px">No media</div>
          <div style="color:#777;font-size:12px">Debug: ${e.message}</div>
        </div>
      </div>`;
  }
}

function startCountdown(sec){
  clearInterval(countdownTimer);
  let s = sec;
  countdownEl.textContent = s;
  countdownTimer = setInterval(() => {
    s--;
    countdownEl.textContent = Math.max(s,0);
    if(s<=0) clearInterval(countdownTimer);
  }, 1000);
}

function next(){
  if (!playlist.length) return;
  index = (index + 1) % playlist.length;
  if(index === 0) shuffle(playlist);
  play();
}

function play(){
  clearMediaTimers();
  if(!playlist.length) return;

  const item = playlist[index];
  mediaFrame.innerHTML = "";

  if(item.type === "image"){
    const img = new Image();
    img.src = item.src;
    img.onerror = () => {
      mediaFrame.innerHTML = `<div style="color:#aaa;display:flex;align-items:center;justify-content:center;height:100%">Missing file: ${item.src}</div>`;
    };
    mediaFrame.appendChild(img);

    const d = item.duration || 6;
    startCountdown(d);
    timer = setTimeout(next, d * 1000);
    return;
  }

  const v = document.createElement("video");
  v.src = item.src;
  v.autoplay = true;
  v.muted = muted;
  v.playsInline = true;
  v.preload = "auto";
  v.controls = false;

  v.onloadedmetadata = () => startCountdown(Math.ceil(v.duration || 8));
  v.onended = next;
  v.onerror = next;

  mediaFrame.appendChild(v);

  v.play().catch(() => {
    startCountdown(6);
    timer = setTimeout(next, 6000);
  });
}

/* =========================
   TIME + DATE (CAIRO)
========================= */

function tickCairo(){
  const now = new Date();

  document.getElementById("timeCairo").textContent =
    new Intl.DateTimeFormat("en-GB", {
      timeZone:"Africa/Cairo",
      hour:"2-digit", minute:"2-digit", second:"2-digit"
    }).format(now);

  document.getElementById("dateCairo").textContent =
    new Intl.DateTimeFormat("en-GB", {
      timeZone:"Africa/Cairo",
      weekday:"short", day:"2-digit", month:"short", year:"numeric"
    }).format(now);
}
setInterval(tickCairo, 1000);
tickCairo();

/* =========================
   WEATHER (CAIRO)
========================= */

async function loadWeather(){
  try{
    const r = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m&timezone=Africa%2FCairo",
      { cache:"no-store" }
    );
    const j = await r.json();
    document.getElementById("weatherCairo").textContent =
      Math.round(j.current.temperature_2m) + "°C";
  }catch{
    document.getElementById("weatherCairo").textContent = "--";
  }
}
loadWeather();
setInterval(loadWeather, 10 * 60 * 1000);

/* =========================
   IN PROGRESS (Google Sheet Published CSV)
   Columns: E,G,I,H,J  => idx 4,6,8,7,9
========================= */

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
    else if (c === "," && !inQuotes) { row.push(cur.trim()); cur = ""; }
    else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (cur.length || row.length) row.push(cur.trim());
      if (row.length) rows.push(row);
      row = []; cur = "";
    } else cur += c;
  }
  if (cur.length || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows;
}

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function fetchWithTimeout(url, ms=12000){
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try{
    const res = await fetch(url, { cache:"no-store", signal: controller.signal });
    clearTimeout(t);
    return res;
  }catch(e){
    clearTimeout(t);
    throw e;
  }
}

async function loadProgress(){
  progressBody.innerHTML = `<tr><td colspan="5" class="muted">Loading…</td></tr>`;
  boardMeta.textContent = "Loading…";

  try{
    const r = await fetchWithTimeout(`${CSV_URL}&ts=${Date.now()}`, 12000);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const csv = await r.text();
    const rows = parseCSV(csv);

    // remove header + empty rows
    const data = rows.slice(1).filter(r => r.some(cell => (cell || "").trim() !== ""));

    if(!data.length){
      progressBody.innerHTML = `<tr><td colspan="5" class="muted">No cars in progress.</td></tr>`;
      boardMeta.textContent = "Live • 0";
      return;
    }

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
  }catch(e){
    progressBody.innerHTML = `<tr><td colspan="5" class="muted">Offline</td></tr>`;
    boardMeta.textContent = "Offline";
  }
}

refreshBtn.addEventListener("click", loadProgress);
setInterval(loadProgress, 30000);
loadProgress();

/* =========================
   UI EVENTS
========================= */

muteBtn.onclick = () => {
  muted = !muted;
  muteBtn.textContent = muted ? "Muted" : "Sound On";
  const v = mediaFrame.querySelector("video");
  if (v) v.muted = muted;
};

branchSelect.onchange = () => {
  const label = branchSelect.selectedOptions[0].text;
  overlayBranch.textContent = label;
  branchLabel.textContent = `${label} Branch • Waiting Room Display`;
};

/* =========================
   AUTO REFRESH PAGE (5 HOURS)
========================= */
setTimeout(() => location.reload(), 5 * 60 * 60 * 1000);

/* =========================
   INIT
========================= */
loadManifest();
