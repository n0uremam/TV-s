(function(){

/* =========================
   AUTO REFRESH: 6 HOURS
========================= */
setTimeout(function(){ location.reload(); }, 6 * 60 * 60 * 1000);

/* =========================
   XHR + CSV helpers (TV safe)
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
   MEDIA PLAYER + GLOBAL FAILSAFE
========================= */
var MEDIA_PATH = "media/shared/";
var MANIFEST_URL = MEDIA_PATH + "manifest.json";
var frame = document.getElementById("mediaFrame");
var mediaStatus = document.getElementById("mediaStatus");

var playlist = [];
var idx = 0;

// timers
var nextTimer=null, stallTimer=null, hardCutTimer=null;

// per-item config
var VIDEO_STALL_MS = 30000;              // 30s no progress => consider frozen
var VIDEO_MAX_MS   = 12 * 60 * 1000;     // hard safety for very long videos
var IMAGE_MAX_MS   = 2 * 60 * 1000;      // image hard safety

// crossfade layers for images
var imgA=null, imgB=null, activeIsA=true;
var veil=null;

// GLOBAL watchdog: if nothing changes for too long => force next
var GLOBAL_FREEZE_MS = 70000; // 70s with no "heartbeat" => force next
var globalWatchTimer = null;
var lastHeartbeat = Date.now();
var consecutiveFails = 0;     // if too many fails => show banner longer

function heartbeat(){
  lastHeartbeat = Date.now();
}

function startGlobalWatch(){
  if (globalWatchTimer) clearInterval(globalWatchTimer);
  globalWatchTimer = setInterval(function(){
    if (Date.now() - lastHeartbeat > GLOBAL_FREEZE_MS){
      // something is frozen
      forceRecover("Frozen media detected");
    }
  }, 5000);
}

function forceRecover(msg){
  // Show banner briefly, then continue
  showFallback(msg || "Recovering…");
  consecutiveFails++;
  clearMediaTimers();
  // if many fails -> pause longer so TV can recover memory
  var wait = consecutiveFails >= 3 ? 6000 : 1800;
  nextTimer = setTimeout(playNext, wait);
  heartbeat();
}

function ensureLayers(){
  if(!veil){
    veil = document.createElement("div");
    veil.style.position="absolute";
    veil.style.inset="0";
    veil.style.background="#000";
    veil.style.opacity="0";
    veil.style.transition="opacity 450ms ease";
    veil.style.pointerEvents="none";
  }
  if(imgA && imgB) return;

  imgA = document.createElement("img");
  imgA.className="media-layer is-active";
  imgA.alt="media";

  imgB = document.createElement("img");
  imgB.className="media-layer";
  imgB.alt="media";

  frame.innerHTML="";
  frame.appendChild(imgA);
  frame.appendChild(imgB);
  frame.appendChild(veil);
}

function veilIn(){ if(veil) veil.style.opacity="1"; }
function veilOut(){ if(veil) veil.style.opacity="0"; }

function clearMediaTimers(){
  if(nextTimer){clearTimeout(nextTimer);nextTimer=null;}
  if(stallTimer){clearTimeout(stallTimer);stallTimer=null;}
  if(hardCutTimer){clearTimeout(hardCutTimer);hardCutTimer=null;}
}

function removeVideoIfAny(){
  var v = frame.querySelector("video");
  if(v){
    try{ v.pause(); }catch(_){}
    try{ v.removeAttribute("src"); }catch(_){}
    try{ v.load(); }catch(_){}
    if(v.parentNode) v.parentNode.removeChild(v);
  }
}

function showFallback(msg){
  ensureLayers();
  removeVideoIfAny();
  // banner is stable fallback
  imgA.src = "media/banner.jpg?t=" + Date.now();
  imgA.classList.add("is-active");
  imgB.classList.remove("is-active");
  if(mediaStatus){
    mediaStatus.style.display="block";
    mediaStatus.textContent = msg || "";
  }
  veilOut();
  heartbeat();
}

/* Image: retry once; if still fails -> recover */
function showImage(src, seconds){
  ensureLayers();
  removeVideoIfAny();
  if(mediaStatus) mediaStatus.style.display="none";

  var incoming = activeIsA ? imgB : imgA;
  var outgoing = activeIsA ? imgA : imgB;

  var durationMs = (seconds || 15) * 1000;
  if(durationMs > IMAGE_MAX_MS) durationMs = IMAGE_MAX_MS;

  var triedRetry = false;

  function loadImage(){
    veilIn();
    heartbeat();

    incoming.onload = function(){
      consecutiveFails = 0;
      incoming.classList.add("is-active");
      outgoing.classList.remove("is-active");
      activeIsA = !activeIsA;
      setTimeout(veilOut, 120);

      clearMediaTimers();
      nextTimer = setTimeout(playNext, durationMs);
      hardCutTimer = setTimeout(function(){
        forceRecover("Image freeze safety");
      }, durationMs + 15000); // extra safety window
      heartbeat();
    };

    incoming.onerror = function(){
      if(!triedRetry){
        triedRetry = true;
        // retry with cache buster
        incoming.src = MEDIA_PATH + src + "?t=" + Date.now();
        heartbeat();
        return;
      }
      forceRecover("Image failed: " + src);
    };

    incoming.src = MEDIA_PATH + src + "?t=" + Date.now();
  }

  loadImage();
}

/* Video: progress heartbeat + stall detection + global failsafe */
function showVideo(src){
  ensureLayers();
  removeVideoIfAny();
  if(mediaStatus) mediaStatus.style.display="none";

  imgA.classList.remove("is-active");
  imgB.classList.remove("is-active");
  veilIn();
  heartbeat();

  var video = document.createElement("video");
  video.src = MEDIA_PATH + src;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("webkit-playsinline","true");
  video.setAttribute("playsinline","true");

  // sizing is controlled by CSS (object-fit: cover)
  frame.appendChild(video);

  clearMediaTimers();

  hardCutTimer = setTimeout(function(){
    forceRecover("Video timeout: " + src);
  }, VIDEO_MAX_MS);

  function kickStall(){
    if(stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(function(){
      forceRecover("Video stalled: " + src);
    }, VIDEO_STALL_MS);
  }

  var firstFrameTimer = setTimeout(function(){
    forceRecover("Video can't start: " + src);
  }, 22000);

  video.onplaying = function(){
    kickStall();
    heartbeat();
  };

  video.ontimeupdate = function(){
    clearTimeout(firstFrameTimer);
    kickStall();
    veilOut();
    heartbeat();
    consecutiveFails = 0;
  };

  video.onwaiting = function(){ kickStall(); heartbeat(); };
  video.onstalled = function(){ kickStall(); heartbeat(); };

  video.onended = function(){
    veilIn();
    clearTimeout(firstFrameTimer);
    heartbeat();
    nextTimer = setTimeout(playNext, 350);
  };

  video.onerror = function(){
    clearTimeout(firstFrameTimer);
    forceRecover("Video error: " + src);
  };

  try{
    var p = video.play();
    if(p && p.catch){
      p.catch(function(){
        clearTimeout(firstFrameTimer);
        forceRecover("Autoplay blocked: " + src);
      });
    }
  }catch(e){
    clearTimeout(firstFrameTimer);
    forceRecover("Play failed: " + src);
  }
}

function playNext(){
  clearMediaTimers();
  heartbeat();

  if(!playlist.length){
    showFallback("No media");
    return;
  }

  var item = playlist[idx];
  idx = (idx + 1) % playlist.length;

  if(!item || !item.type || !item.src){
    nextTimer = setTimeout(playNext, 600);
    return;
  }

  if(item.type === "image") return showImage(item.src, item.duration || 15);
  if(item.type === "video") return showVideo(item.src);

  nextTimer = setTimeout(playNext, 600);
}

function loadManifest(){
  ensureLayers();
  if(mediaStatus){ mediaStatus.style.display="block"; mediaStatus.textContent="Loading media…"; }

  xhr(MANIFEST_URL + "?t=" + Date.now(), function(err, res){
    if(err){
      showFallback("Media offline (manifest)");
      return;
    }
    try{
      var json = JSON.parse(res);
      playlist = (json && json.items) ? json.items : [];
      if(!playlist.length){
        showFallback("No media in manifest");
        return;
      }
      idx = 0;
      consecutiveFails = 0;
      veilIn();
      heartbeat();
      setTimeout(playNext, 250);
    }catch(e){
      showFallback("Manifest error");
    }
  });
}

startGlobalWatch();
loadManifest();

/* =========================
   AUTO-SCROLL TABLES
========================= */
function enableAutoScroll(wrapId){
  var wrap = document.getElementById(wrapId);
  if(!wrap) return;

  var table = wrap.querySelector("table");
  if(!table) return;

  var mover = wrap.querySelector(".auto-scroll");
  if(!mover){
    mover = document.createElement("div");
    mover.className = "auto-scroll";
    mover.appendChild(table);
    wrap.appendChild(mover);
  }

  var y=0, dir=1, speed=0.35, pauseTop=2200, pauseBottom=2200;
  var paused=false, lastTick=Date.now();

  function resetToTop(){
    y=0; dir=1;
    mover.style.transform="translateY(0px)";
  }

  function tick(){
    var wrapH = wrap.clientHeight;
    var moverH = mover.scrollHeight;

    if(moverH <= wrapH + 2){
      resetToTop();
      requestAnimationFrame(tick);
      return;
    }

    var now = Date.now();
    var dt = now - lastTick;
    lastTick = now;

    if(paused){ requestAnimationFrame(tick); return; }

    y += dir * speed * (dt / 16.6);
    var maxY = moverH - wrapH;

    if(y >= maxY){
      y = maxY;
      mover.style.transform="translateY(" + (-y) + "px)";
      paused=true;
      setTimeout(function(){ dir=-1; paused=false; }, pauseBottom);
    } else if(y <= 0){
      y=0;
      mover.style.transform="translateY(0px)";
      paused=true;
      setTimeout(function(){ dir=1; paused=false; }, pauseTop);
    } else {
      mover.style.transform="translateY(" + (-y) + "px)";
    }

    requestAnimationFrame(tick);
  }

  resetToTop();
  requestAnimationFrame(tick);
}

/* =========================
   TABLES: IN PROGRESS + REVISIT
========================= */
var CSV_PROGRESS =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";

var CSV_REVISIT =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=1236474828&single=true&output=csv";

var progressBody = document.getElementById("progressBody");
var boardMeta = document.getElementById("boardMeta");
var revisitBody = document.getElementById("revisitBody");
var revisitMeta = document.getElementById("revisitMeta");

function loadProgress(){
  progressBody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
  boardMeta.textContent = "Loading…";

  xhr(CSV_PROGRESS + "&t=" + Date.now(), function(err, res){
    if(err){
      progressBody.innerHTML = '<tr><td colspan="5" class="muted">Offline</td></tr>';
      boardMeta.textContent = "Offline";
      return;
    }
    try{
      var rows = parseCSV(res).slice(1);
      var html="", count=0;

      for(var i=0;i<rows.length;i++){
        var r = rows[i];
        var customer = (r[4]  || "").trim(); // E
        var model    = (r[6]  || "").trim(); // G
        var year     = (r[8]  || "").trim(); // I
        var chassis  = (r[9]  || "").trim(); // J
        var film     = (r[10] || "").trim(); // K
        if(!customer) continue;
        count++;
        html += "<tr>"
          + "<td>"+esc(customer)+"</td>"
          + "<td>"+esc(model)+"</td>"
          + "<td>"+esc(year)+"</td>"
          + "<td>"+esc(chassis)+"</td>"
          + "<td>"+esc(film)+"</td>"
          + "</tr>";
      }

      if(!html){
        progressBody.innerHTML = '<tr><td colspan="5" class="muted">No cars in progress</td></tr>';
        boardMeta.textContent = "Live · 0";
        setTimeout(function(){ enableAutoScroll("progressWrap"); }, 300);
        return;
      }

      progressBody.innerHTML = html;
      boardMeta.textContent = "Live · " + count;
      setTimeout(function(){ enableAutoScroll("progressWrap"); }, 300);

    }catch(e){
      progressBody.innerHTML = '<tr><td colspan="5" class="muted">Error</td></tr>';
      boardMeta.textContent = "Error";
    }
  });
}

function loadRevisit(){
  revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Loading…</td></tr>';
  if(revisitMeta) revisitMeta.textContent = "Loading…";

  xhr(CSV_REVISIT + "&t=" + Date.now(), function(err, res){
    if(err){
      revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Offline</td></tr>';
      if(revisitMeta) revisitMeta.textContent = "Offline";
      return;
    }
    try{
      var rows = parseCSV(res).slice(1);
      var html="", count=0;

      for(var i=0;i<rows.length;i++){
        var r = rows[i];
        var status = (r[0] || "").trim(); // A
        var name   = (r[3] || "").trim(); // D
        var car    = (r[5] || "").trim(); // F
        var color  = (r[6] || "").trim(); // G
        if(!name) continue;
        count++;
        html += "<tr>"
          + "<td>"+esc(status)+"</td>"
          + "<td>"+esc(name)+"</td>"
          + "<td>"+esc(car)+"</td>"
          + "<td>"+esc(color)+"</td>"
          + "</tr>";
      }

      if(!html){
        revisitBody.innerHTML = '<tr><td colspan="4" class="muted">No bookings today</td></tr>';
        if(revisitMeta) revisitMeta.textContent = "Live · 0";
        setTimeout(function(){ enableAutoScroll("revisitWrap"); }, 300);
        return;
      }

      revisitBody.innerHTML = html;
      if(revisitMeta) revisitMeta.textContent = "Live · " + count;
      setTimeout(function(){ enableAutoScroll("revisitWrap"); }, 300);

    }catch(e){
      revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Error</td></tr>';
      if(revisitMeta) revisitMeta.textContent = "Error";
    }
  });
}

var refreshBtn = document.getElementById("refreshBtn");
if(refreshBtn) refreshBtn.onclick = function(){ loadProgress(); loadRevisit(); };

setInterval(loadProgress, 30000);
setInterval(loadRevisit, 30000);
loadProgress();
loadRevisit();

setTimeout(function(){
  enableAutoScroll("progressWrap");
  enableAutoScroll("revisitWrap");
}, 900);

})();
