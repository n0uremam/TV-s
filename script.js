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
   MEDIA PLAYER — FIX IMAGE HANG
   - Banner stays as base layer
   - Separate overlay IMG for slideshow images
   - Image timeout if neither onload nor onerror fires
========================= */
var MEDIA_PATH = "media/shared/";
var MANIFEST_URL = MEDIA_PATH + "manifest.json";
var frame = document.getElementById("mediaFrame");
var statusEl = document.getElementById("mediaStatus");
var bannerBase = document.getElementById("mediaFallbackBanner");

var playlist = [];
var idx = 0;

var nextTimer = null;
var failCount = 0;

var IMAGE_HANG_TIMEOUT_MS = 10000; // ✅ if image hangs, skip after 10s
var VIDEO_FIRSTFRAME_TIMEOUT_MS = 20000;
var VIDEO_STALL_MS = 25000;

function setStatus(t){
  if (statusEl) statusEl.textContent = t || "";
}
function clearNext(){
  if (nextTimer){ clearTimeout(nextTimer); nextTimer=null; }
}
function scheduleNext(ms){
  clearNext();
  nextTimer = setTimeout(playNext, ms);
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

function ensureOverlayImage(){
  var img = document.getElementById("mediaOverlayImage");
  if (img) return img;

  img = document.createElement("img");
  img.id = "mediaOverlayImage";
  img.alt = "media";
  img.style.position = "absolute";
  img.style.inset = "0";
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";   // images shrink-to-fit
  img.style.background = "#000";
  img.style.opacity = "0";
  img.style.transition = "opacity 600ms ease";
  img.style.display = "block";
  frame.appendChild(img);
  return img;
}

function showBannerBase(){
  if (bannerBase){
    bannerBase.style.display = "block";
    bannerBase.style.opacity = "1";
  }
}

function hardResetIfNeeded(){
  if (failCount >= 4){
    setStatus("System recovering…");
    setTimeout(function(){ location.reload(); }, 1500);
  }
}

/* ----- IMAGE ----- */
function playImage(src, seconds){
  removeVideo();
  showBannerBase();

  var overlay = ensureOverlayImage();
  overlay.style.opacity = "0";
  overlay.src = ""; // clear

  var dur = (seconds || 15) * 1000;
  if (dur < 3000) dur = 3000;

  setStatus("Loading image…");

  var done = false;
  var hangTimer = setTimeout(function(){
    if (done) return;
    done = true;
    failCount++;
    setStatus("Image timeout, skipping…");
    overlay.style.opacity = "0";
    hardResetIfNeeded();
    scheduleNext(1200);
  }, IMAGE_HANG_TIMEOUT_MS);

  overlay.onload = function(){
    if (done) return;
    done = true;
    clearTimeout(hangTimer);

    failCount = 0;
    setStatus("");
    // Show image above banner
    overlay.style.opacity = "1";

    // move next after duration
    scheduleNext(dur);
  };

  overlay.onerror = function(){
    if (done) return;
    done = true;
    clearTimeout(hangTimer);

    failCount++;
    setStatus("Image failed, skipping…");
    overlay.style.opacity = "0";
    hardResetIfNeeded();
    scheduleNext(1200);
  };

  // cache-bust for TVs
  overlay.src = MEDIA_PATH + src + "?t=" + Date.now();
}

/* ----- VIDEO ----- */
function playVideo(src){
  // Keep banner visible until video shows frames
  showBannerBase();

  var overlay = ensureOverlayImage();
  overlay.style.opacity = "0"; // hide image overlay during video

  removeVideo();
  setStatus("Loading video…");

  var v = document.createElement("video");
  v.src = MEDIA_PATH + src + "?t=" + Date.now();
  v.autoplay = true;
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.setAttribute("webkit-playsinline","true");
  v.setAttribute("playsinline","true");

  v.style.position = "absolute";
  v.style.inset = "0";
  v.style.width = "100%";
  v.style.height = "100%";
  v.style.objectFit = "cover";  // videos fill (no shrink)
  v.style.background = "#000";

  frame.appendChild(v);

  var startedFrames = false;
  var lastTime = -1;
  var stallStart = Date.now();

  var firstFrameTimer = setTimeout(function(){
    if (!startedFrames){
      failCount++;
      setStatus("Video can't start, skipping…");
      removeVideo();
      hardResetIfNeeded();
      scheduleNext(1500);
    }
  }, VIDEO_FIRSTFRAME_TIMEOUT_MS);

  function markProgress(){
    stallStart = Date.now();
  }

  function failVideo(msg){
    clearTimeout(firstFrameTimer);
    failCount++;
    setStatus(msg || "Video error, skipping…");
    removeVideo();
    showBannerBase();
    hardResetIfNeeded();
    scheduleNext(1500);
  }

  v.onplaying = function(){
    setStatus("Playing…");
    markProgress();
  };

  v.ontimeupdate = function(){
    if (v.currentTime !== lastTime){
      lastTime = v.currentTime;
      startedFrames = true;
      failCount = 0;
      setStatus("");
      // Only now hide banner (video is truly rendering)
      if (bannerBase) bannerBase.style.display = "none";
      markProgress();
    }
    // stall protection
    if (Date.now() - stallStart > VIDEO_STALL_MS){
      failVideo("Video froze, skipping…");
    }
  };

  v.onwaiting = function(){
    showBannerBase();
    setStatus("Buffering…");
  };

  v.onstalled = function(){
    showBannerBase();
    setStatus("Stalled…");
  };

  v.onerror = function(){ failVideo("Video error, skipping…"); };

  v.onended = function(){
    clearTimeout(firstFrameTimer);
    showBannerBase(); // prevent black flash
    removeVideo();
    scheduleNext(500);
  };

  try{
    var p = v.play();
    if (p && p.catch){
      p.catch(function(){ failVideo("Autoplay blocked, skipping…"); });
    }
  }catch(e){
    failVideo("Play failed, skipping…");
  }
}

/* ----- PLAYLIST ----- */
function playNext(){
  clearNext();

  if (!playlist.length){
    showBannerBase();
    setStatus("No media in manifest");
    return;
  }

  var item = playlist[idx];
  idx = (idx + 1) % playlist.length;

  if (!item || !item.type || !item.src){
    scheduleNext(600);
    return;
  }

  // Always show banner during transitions
  showBannerBase();
  removeVideo();

  if (item.type === "image") return playImage(item.src, item.duration || 15);
  if (item.type === "video") return playVideo(item.src);

  scheduleNext(600);
}

function loadManifest(){
  showBannerBase();
  setStatus("Loading media…");

  xhr(MANIFEST_URL + "?t=" + Date.now(), function(err, res){
    if (err){
      setStatus("Manifest offline");
      scheduleNext(5000);
      return;
    }
    try{
      var json = JSON.parse(res);
      playlist = (json && json.items) ? json.items : [];
      if (!playlist.length){
        setStatus("No media found");
        return;
      }
      idx = 0;
      failCount = 0;
      playNext();
    }catch(e){
      setStatus("Manifest JSON error");
    }
  });
}

loadManifest();

/* =========================
   TABLES (same as before)
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
