(function(){

/* =========================
   SETTINGS
========================= */
var MANIFEST_URL = "media/shared/manifest.json"; // must exist on Netlify exactly
var MEDIA_BASE   = "media/shared/";

// ✅ Fallback if manifest fails (put these files in media/shared/)
var FALLBACK_ITEMS = [
  { type: "image", src: "01.jpg", duration: 6 },
  { type: "video", src: "02.mp4" },
  { type: "image", src: "03.jpg", duration: 6 }
];

/* Sheet CSV */
var CSV_URL =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";

/* =========================
   DOM
========================= */
var mediaFrame   = document.getElementById("mediaFrame");
var countdownEl  = document.getElementById("countdown");
var muteBtn      = document.getElementById("muteBtn");

var progressBody = document.getElementById("progressBody");
var boardMeta    = document.getElementById("boardMeta");
var refreshBtn   = document.getElementById("refreshBtn");

/* =========================
   XHR (TV-safe)
========================= */
function xhrGet(url, timeoutMs, cb){
  var x = new XMLHttpRequest();
  x.open("GET", url, true);
  x.timeout = timeoutMs || 12000;
  x.onreadystatechange = function(){
    if (x.readyState === 4){
      if (x.status >= 200 && x.status < 300) cb(null, x.responseText, x.status);
      else cb(new Error("HTTP " + x.status), null, x.status);
    }
  };
  x.ontimeout = function(){ cb(new Error("TIMEOUT"), null, 0); };
  x.onerror   = function(){ cb(new Error("NETWORK"), null, 0); };
  x.send();
}

/* =========================
   HELPERS
========================= */
function esc(s){
  s = (s === undefined || s === null) ? "" : String(s);
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function renderMediaMsg(title, detail){
  mediaFrame.innerHTML =
    '<div style="color:#aaa;text-align:center;padding:22px;line-height:1.6">' +
      '<div style="font-weight:900;color:#fff;margin-bottom:6px">' + esc(title) + '</div>' +
      (detail ? '<div style="font-size:12px;color:#777">' + esc(detail) + '</div>' : '') +
    '</div>';
  if (countdownEl) countdownEl.textContent = "--";
}

function shuffle(a){
  for (var i=a.length-1;i>0;i--){
    var j = Math.floor(Math.random()*(i+1));
    var t = a[i]; a[i]=a[j]; a[j]=t;
  }
}

/* =========================
   MEDIA PLAYER
========================= */
var muted = true;
var playlist = [];
var idx = 0;
var nextTimer = null;
var countTimer = null;

function clearMediaTimers(){
  if (nextTimer) clearTimeout(nextTimer);
  if (countTimer) clearInterval(countTimer);
  nextTimer = null;
  countTimer = null;
}

function startCountdown(sec){
  if (!countdownEl) return;
  clearInterval(countTimer);
  var s = sec;
  countdownEl.textContent = String(s);
  countTimer = setInterval(function(){
    s--;
    countdownEl.textContent = String(Math.max(s,0));
    if (s <= 0) clearInterval(countTimer);
  }, 1000);
}

function buildPlaylist(items){
  playlist = [];
  for (var i=0;i<items.length;i++){
    playlist.push({
      type: items[i].type,
      src: MEDIA_BASE + items[i].src,
      duration: items[i].duration
    });
  }
  shuffle(playlist);
  idx = 0;
}

function next(){
  if (!playlist.length) return;
  idx = (idx + 1) % playlist.length;
  if (idx === 0) shuffle(playlist);
  playCurrent();
}

function playCurrent(){
  clearMediaTimers();
  if (!playlist.length){
    renderMediaMsg("No media", "Playlist empty");
    return;
  }

  var item = playlist[idx];
  mediaFrame.innerHTML = "";

  if (item.type === "image"){
    var img = new Image();
    img.src = item.src;
    img.onload = function(){
      mediaFrame.innerHTML = "";
      mediaFrame.appendChild(img);
    };
    img.onerror = function(){
      renderMediaMsg("Missing image", item.src);
      nextTimer = setTimeout(next, 1500);
    };

    var d = item.duration || 6;
    startCountdown(d);
    nextTimer = setTimeout(next, d * 1000);
    return;
  }

  var v = document.createElement("video");
  v.src = item.src;
  v.autoplay = true;
  v.muted = muted;
  v.playsInline = true;
  v.preload = "auto";
  v.controls = false;

  v.onloadedmetadata = function(){
    var d2 = Math.ceil(v.duration || 8);
    startCountdown(d2);
  };
  v.onended = next;
  v.onerror = function(){
    renderMediaMsg("Video not supported", "Skipping: " + item.src);
    nextTimer = setTimeout(next, 1500);
  };

  mediaFrame.appendChild(v);

  try{
    var p = v.play();
    if (p && typeof p.catch === "function"){
      p.catch(function(){
        renderMediaMsg("Autoplay blocked", "Skipping video");
        nextTimer = setTimeout(next, 1500);
      });
    }
  }catch(e){
    renderMediaMsg("Video play failed", "Skipping video");
    nextTimer = setTimeout(next, 1500);
  }
}

function loadManifest(){
  renderMediaMsg("Loading media…", "Fetching manifest.json");

  xhrGet(MANIFEST_URL + "?t=" + Date.now(), 12000, function(err, text, status){
    if (err){
      // ✅ fallback playlist
      buildPlaylist(FALLBACK_ITEMS);
      renderMediaMsg(
        "Manifest not reachable — using fallback",
        "Check: /media/shared/manifest.json (Error: " + err.message + ")"
      );
      // start after showing message briefly
      setTimeout(playCurrent, 1200);
      return;
    }

    try{
      var data = JSON.parse(text);
      var items = data.items || [];
      if (!items.length) throw new Error("manifest has 0 items");

      buildPlaylist(items);
      playCurrent();
    }catch(e){
      buildPlaylist(FALLBACK_ITEMS);
      renderMediaMsg(
        "Manifest JSON error — using fallback",
        "Fix manifest.json format"
      );
      setTimeout(playCurrent, 1200);
    }
  });
}

/* =========================
   IN PROGRESS (CSV) — ONLY E,G,I,J,K
   CUSTOMER NAME (E=4)
   CAR MODEL     (G=6)
   CAR YEAR      (I=8)
   CHASSIS (J=9)
   Type of Films (K=10)
========================= */

function parseCSV(t){
  var rows = [];
  var row = [];
  var cur = "";
  var q = false;

  for (var i=0;i<t.length;i++){
    var c=t[i], n=t[i+1];
    if (c === '"' && q && n === '"'){ cur += '"'; i++; }
    else if (c === '"'){ q = !q; }
    else if (c === "," && !q){ row.push(cur); cur=""; }
    else if ((c === "\n" || c === "\r") && !q){
      if (cur.length || row.length){ row.push(cur); rows.push(row); }
      row = []; cur = "";
    } else cur += c;
  }
  if (cur.length || row.length){ row.push(cur); rows.push(row); }
  return rows;
}

function loadProgress(){
  progressBody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
  boardMeta.textContent = "Loading…";

  xhrGet(CSV_URL + "&t=" + Date.now(), 12000, function(err, csvText){
    if (err){
      progressBody.innerHTML = '<tr><td colspan="5" class="muted">Offline</td></tr>';
      boardMeta.textContent = "Offline";
      return;
    }

    try{
      var rows = parseCSV(csvText).slice(1); // skip header

      var html = "";
      var count = 0;

      for (var i=0;i<rows.length;i++){
        var r = rows[i];

        var customer = (r[4]  || "").trim();  // E
        var model    = (r[6]  || "").trim();  // G
        var year     = (r[8]  || "").trim();  // I
        var chassis  = (r[9]  || "").trim();  // J
        var film     = (r[10] || "").trim();  // K

        if (!customer) continue;
        count++;

        html += "<tr>";
        html += "<td style='direction:rtl;text-align:right;font-weight:700'>" + esc(customer) + "</td>";
        html += "<td>" + esc(model) + "</td>";
        html += "<td>" + esc(year) + "</td>";
        html += "<td>" + esc(chassis) + "</td>";
        html += "<td>" + esc(film) + "</td>";
        html += "</tr>";
      }

      if (!html){
        progressBody.innerHTML = '<tr><td colspan="5" class="muted">No cars in progress.</td></tr>';
        boardMeta.textContent = "Live • 0";
        return;
      }

      progressBody.innerHTML = html;
      boardMeta.textContent = "Live • " + count;

    }catch(e){
      progressBody.innerHTML = '<tr><td colspan="5" class="muted">Error</td></tr>';
      boardMeta.textContent = "Error";
    }
  });
}

/* =========================
   TIME/DATE (local device time)
========================= */
function tickLocal(){
  var now = new Date();
  function pad(n){ return (n<10 ? "0"+n : ""+n); }
  var hh = pad(now.getHours());
  var mm = pad(now.getMinutes());
  var ss = pad(now.getSeconds());

  var days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  var timeEl = document.getElementById("timeLocal");
  var dateEl = document.getElementById("dateLocal");

  if (timeEl) timeEl.textContent = hh + ":" + mm + ":" + ss;
  if (dateEl) dateEl.textContent = days[now.getDay()] + ", " + pad(now.getDate()) + " " + months[now.getMonth()] + " " + now.getFullYear();
}
setInterval(tickLocal, 1000);
tickLocal();

/* Weather (Cairo) */
function loadWeather(){
  var url = "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m";
  xhrGet(url + "&t=" + Date.now(), 10000, function(err, text){
    var el = document.getElementById("weatherCairo");
    if (!el) return;
    if (err){ el.textContent = "--"; return; }
    try{
      var j = JSON.parse(text);
      el.textContent = Math.round(j.current.temperature_2m) + "°C";
    }catch(e){
      el.textContent = "--";
    }
  });
}
loadWeather();
setInterval(loadWeather, 10*60*1000);

/* UI */
if (muteBtn){
  muteBtn.onclick = function(){
    muted = !muted;
    muteBtn.textContent = muted ? "Muted" : "Sound On";
    var vid = mediaFrame.querySelector("video");
    if (vid) vid.muted = muted;
  };
}

if (refreshBtn){
  refreshBtn.onclick = loadProgress;
}
setInterval(loadProgress, 30000);

/* Extra safety full reload in 5 hours */
setTimeout(function(){ location.reload(); }, 18000 * 1000);

/* INIT */
loadManifest();
loadProgress();

})();
