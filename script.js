(function(){

/* =========================
   AUTO REFRESH: 6 HOURS
========================= */
setTimeout(function(){ location.reload(); }, 6 * 60 * 60 * 1000);

/* =========================
   XHR helpers
========================= */
function xhr(url, cb){
  var r = new XMLHttpRequest();
  r.open("GET", url, true);
  r.timeout = 25000;
  r.onload = function(){
    if (r.status >= 200 && r.status < 300) cb(null, r.responseText);
    else cb("HTTP " + r.status);
  };
  r.onerror = r.ontimeout = function(){ cb("NETWORK/TIMEOUT"); };
  r.send();
}

function esc(s){
  s = (s === undefined || s === null) ? "" : String(s);
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function parseCSV(t){
  var rows=[], row=[];
  var cur="", q=false;
  for (var i=0;i<t.length;i++){
    var c=t[i], n=t[i+1];
    if (c=='"' && q && n=='"'){ cur+='"'; i++; }
    else if (c=='"'){ q=!q; }
    else if (c=="," && !q){ row.push(cur); cur=""; }
    else if ((c=="\n"||c=="\r") && !q){
      if (cur || row.length){ row.push(cur); rows.push(row.slice()); }
      row.length=0; cur="";
    } else cur += c;
  }
  if (cur || row.length){ row.push(cur); rows.push(row); }
  return rows;
}

/* =========================
   DATE/TIME + WEATHER (Cairo)
========================= */
function tickClock(){
  var d = new Date();
  function pad(n){ return n<10 ? "0"+n : ""+n; }
  var timeEl = document.getElementById("timeLocal");
  var dateEl = document.getElementById("dateLocal");
  if (timeEl) timeEl.textContent = pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());
  if (dateEl) dateEl.textContent = d.toDateString();
}
setInterval(tickClock, 1000);
tickClock();

function loadWeather(){
  var url = "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m";
  xhr(url + "&t=" + Date.now(), function(err, res){
    var el = document.getElementById("weatherCairo");
    if (!el) return;
    if (err){ el.textContent="--"; return; }
    try{
      var j = JSON.parse(res);
      el.textContent = Math.round(j.current.temperature_2m) + "°C";
    }catch(e){
      el.textContent="--";
    }
  });
}
loadWeather();
setInterval(loadWeather, 10*60*1000);

/* =========================
   MEDIA PLAYER — TV HARDENED
   - Fallback banner ALWAYS exists, never goes away.
   - Video is removed on any fail.
   - If repeated failures, reload.
========================= */
var MEDIA_PATH = "media/shared/";
var MANIFEST_URL = MEDIA_PATH + "manifest.json";
var frame = document.getElementById("mediaFrame");
var statusEl = document.getElementById("mediaStatus");
var fallback = document.getElementById("mediaFallbackBanner");

var playlist = [];
var idx = 0;

var nextTimer=null;
var failCount = 0;          // consecutive failures
var globalFreezeTimer=null;

function setStatus(t){
  if (statusEl) statusEl.textContent = t;
}

function clearNext(){
  if (nextTimer){ clearTimeout(nextTimer); nextTimer=null; }
}

function removeVideo(){
  var v = frame ? frame.querySelector("video") : null;
  if (v){
    try{ v.pause(); }catch(_){}
    try{ v.removeAttribute("src"); }catch(_){}
    try{ v.load(); }catch(_){}
    if (v.parentNode) v.parentNode.removeChild(v);
  }
}

function showFallback(msg){
  // IMPORTANT: fallback is ALWAYS the base layer
  if (fallback){
    fallback.style.display = "block";
    // keep it visible; do NOT hide here
  }
  removeVideo();
  setStatus(msg || "");
}

function scheduleNext(ms){
  clearNext();
  nextTimer = setTimeout(playNext, ms);
}

function hardResetIfNeeded(){
  // if the TV keeps failing videos/images, it needs a refresh
  if (failCount >= 4){
    setStatus("System recovering…");
    setTimeout(function(){ location.reload(); }, 1500);
  }
}

/* ---------- IMAGE ---------- */
function playImage(src, seconds){
  showFallback("Loading image…");
  var dur = (seconds || 15) * 1000;
  if (dur < 3000) dur = 3000;

  var tried = 0;

  function loadOnce(){
    tried++;
    if (!fallback){
      // if no fallback element exists, just skip
      failCount++;
      hardResetIfNeeded();
      scheduleNext(1200);
      return;
    }

    fallback.onload = function(){
      // image is on screen now
      failCount = 0;
      setStatus("");
      scheduleNext(dur);
    };

    fallback.onerror = function(){
      if (tried < 2){
        // retry once
        setStatus("Retry image…");
        setTimeout(loadOnce, 600);
        return;
      }
      failCount++;
      showFallback("Image failed: " + src);
      hardResetIfNeeded();
      scheduleNext(1500);
    };

    // always cache-bust on TVs
    fallback.src = MEDIA_PATH + src + "?t=" + Date.now();
  }

  loadOnce();
}

/* ---------- VIDEO ---------- */
function playVideo(src){
  // Start with fallback visible while the video starts
  showFallback("Loading video…");

  var v = document.createElement("video");
  v.src = MEDIA_PATH + src + "?t=" + Date.now(); // cache-bust to reduce stuck buffers
  v.autoplay = true;
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.setAttribute("webkit-playsinline","true");
  v.setAttribute("playsinline","true");

  // keep video on top, fallback underneath
  v.style.position = "absolute";
  v.style.inset = "0";
  v.style.width = "100%";
  v.style.height = "100%";
  v.style.objectFit = "cover";
  v.style.background = "#000";

  frame.appendChild(v);

  var startedFrames = false;
  var lastTime = -1;
  var stallStart = Date.now();

  // If no first frame within 20s -> fail
  var firstFrameTimeout = setTimeout(function(){
    if (!startedFrames){
      failCount++;
      showFallback("Video can't start: " + src);
      hardResetIfNeeded();
      scheduleNext(2000);
    }
  }, 20000);

  function cleanupAndNext(waitMs){
    clearTimeout(firstFrameTimeout);
    removeVideo();
    // fallback remains visible
    scheduleNext(waitMs || 500);
  }

  v.onplaying = function(){
    setStatus("Playing…");
  };

  v.ontimeupdate = function(){
    // This is the strongest signal that frames are rendering
    if (v.currentTime !== lastTime){
      lastTime = v.currentTime;
      startedFrames = true;
      stallStart = Date.now();
      // Now hide fallback because video is truly rendering
      if (fallback) fallback.style.display = "none";
      setStatus("");
      failCount = 0;
    }

    // Stall detection: if time stops moving for 25s, treat as freeze
    if (Date.now() - stallStart > 25000){
      failCount++;
      showFallback("Video froze: " + src);
      hardResetIfNeeded();
      cleanupAndNext(2200);
    }
  };

  v.onwaiting = function(){
    // keep fallback visible during waiting
    if (fallback) fallback.style.display = "block";
    setStatus("Buffering…");
  };

  v.onstalled = function(){
    if (fallback) fallback.style.display = "block";
    setStatus("Stalled…");
  };

  v.onerror = function(){
    failCount++;
    showFallback("Video error: " + src);
    hardResetIfNeeded();
    cleanupAndNext(2200);
  };

  v.onended = function(){
    // On end, show fallback immediately (prevents black flash)
    if (fallback) fallback.style.display = "block";
    cleanupAndNext(600);
  };

  try{
    var p = v.play();
    if (p && p.catch){
      p.catch(function(){
        failCount++;
        showFallback("Autoplay blocked: " + src);
        hardResetIfNeeded();
        cleanupAndNext(2200);
      });
    }
  }catch(e){
    failCount++;
    showFallback("Play failed: " + src);
    hardResetIfNeeded();
    cleanupAndNext(2200);
  }
}

/* ---------- PLAYLIST ---------- */
function playNext(){
  clearNext();

  if (!playlist.length){
    showFallback("No media in manifest");
    return;
  }

  var item = playlist[idx];
  idx = (idx + 1) % playlist.length;

  if (!item || !item.type || !item.src){
    scheduleNext(600);
    return;
  }

  // Always ensure fallback visible at transitions
  if (fallback) fallback.style.display = "block";
  removeVideo();

  if (item.type === "image") return playImage(item.src, item.duration || 15);
  if (item.type === "video") return playVideo(item.src);

  scheduleNext(600);
}

function loadManifest(){
  showFallback("Loading media…");
  xhr(MANIFEST_URL + "?t=" + Date.now(), function(err, res){
    if (err){
      showFallback("Manifest offline");
      scheduleNext(5000);
      return;
    }
    try{
      var json = JSON.parse(res);
      playlist = (json && json.items) ? json.items : [];
      if (!playlist.length){
        showFallback("No media found");
        return;
      }
      idx = 0;
      failCount = 0;
      playNext();
    }catch(e){
      showFallback("Manifest JSON error");
    }
  });
}

// Global freeze safety: if the browser gets “stuck”, reload
clearInterval(globalFreezeTimer);
globalFreezeTimer = setInterval(function(){
  // if video exists but not progressing and fallback hidden -> force fallback
  var v = frame ? frame.querySelector("video") : null;
  if (v && fallback && fallback.style.display === "none"){
    // if currentTime not changing -> show fallback again
    // (very cheap safety)
    if (v.paused || v.readyState < 2){
      fallback.style.display = "block";
    }
  }
}, 5000);

loadManifest();

/* =========================
   TABLES (unchanged)
========================= */
var CSV_PROGRESS =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";

var CSV_REVISIT =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=1236474828&single=true&output=csv";

var progressBody = document.getElementById("progressBody");
var revisitBody = document.getElementById("revisitBody");
var boardMeta = document.getElementById("boardMeta");
var revisitMeta = document.getElementById("revisitMeta");

function loadProgress(){
  if (boardMeta) boardMeta.textContent = "Loading…";
  if (progressBody) progressBody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';

  xhr(CSV_PROGRESS + "&t=" + Date.now(), function(err, res){
    if (err){
      if (progressBody) progressBody.innerHTML = '<tr><td colspan="5" class="muted">Offline</td></tr>';
      if (boardMeta) boardMeta.textContent = "Offline";
      return;
    }
    try{
      var rows = parseCSV(res).slice(1);
      var html="", count=0;
      for (var i=0;i<rows.length;i++){
        var r = rows[i];
        var customer = (r[4]  || "").trim(); // E
        var model    = (r[6]  || "").trim(); // G
        var year     = (r[8]  || "").trim(); // I
        var chassis  = (r[9]  || "").trim(); // J
        var film     = (r[10] || "").trim(); // K
        if (!customer) continue;
        count++;
        html += "<tr>"
          + "<td>"+esc(customer)+"</td>"
          + "<td>"+esc(model)+"</td>"
          + "<td>"+esc(year)+"</td>"
          + "<td>"+esc(chassis)+"</td>"
          + "<td>"+esc(film)+"</td>"
          + "</tr>";
      }
      if (!html) html = '<tr><td colspan="5" class="muted">No cars in progress</td></tr>';
      if (progressBody) progressBody.innerHTML = html;
      if (boardMeta) boardMeta.textContent = "Live · " + count;
    }catch(e){
      if (progressBody) progressBody.innerHTML = '<tr><td colspan="5" class="muted">Error</td></tr>';
      if (boardMeta) boardMeta.textContent = "Error";
    }
  });
}

function loadRevisit(){
  if (revisitMeta) revisitMeta.textContent = "Loading…";
  if (revisitBody) revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Loading…</td></tr>';

  xhr(CSV_REVISIT + "&t=" + Date.now(), function(err, res){
    if (err){
      if (revisitBody) revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Offline</td></tr>';
      if (revisitMeta) revisitMeta.textContent = "Offline";
      return;
    }
    try{
      var rows = parseCSV(res).slice(1);
      var html="", count=0;
      for (var i=0;i<rows.length;i++){
        var r = rows[i];
        var status = (r[0] || "").trim(); // A
        var name   = (r[3] || "").trim(); // D
        var car    = (r[5] || "").trim(); // F
        var color  = (r[6] || "").trim(); // G
        if (!name) continue;
        count++;
        html += "<tr>"
          + "<td>"+esc(status)+"</td>"
          + "<td>"+esc(name)+"</td>"
          + "<td>"+esc(car)+"</td>"
          + "<td>"+esc(color)+"</td>"
          + "</tr>";
      }
      if (!html) html = '<tr><td colspan="4" class="muted">No bookings today</td></tr>';
      if (revisitBody) revisitBody.innerHTML = html;
      if (revisitMeta) revisitMeta.textContent = "Live · " + count;
    }catch(e){
      if (revisitBody) revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Error</td></tr>';
      if (revisitMeta) revisitMeta.textContent = "Error";
    }
  });
}

var refreshBtn = document.getElementById("refreshBtn");
if (refreshBtn) refreshBtn.onclick = function(){ loadProgress(); loadRevisit(); };

loadProgress();
loadRevisit();
setInterval(loadProgress, 30000);
setInterval(loadRevisit, 30000);

})();
