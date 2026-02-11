(function(){
*/setTimeout(function(){ location.reload(); }, 10 * 60 * 1000);
function xhr(url, cb){
  var r = new XMLHttpRequest();
  r.open("GET", url, true);
  r.timeout = 15000;
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
var MEDIA_PATH = "media/shared/";
var MANIFEST_URL = MEDIA_PATH + "manifest.json";
var frame = document.getElementById("mediaFrame");
var playlist = [];
var idx = 0;
var nextTimer = null;
var stallTimer = null;
var hardCutTimer = null;
var imgA = null, imgB = null, activeIsA = true;
var VIDEO_STALL_MS = 12000;
var VIDEO_MAX_MS   = 120000;
var IMAGE_MAX_MS   = 45000;
function ensureLayers(){
  if (imgA && imgB) return;
  imgA = document.createElement("img");
  imgA.className = "media-layer is-active";
  imgA.alt = "media";
  imgB = document.createElement("img");
  imgB.className = "media-layer";
  imgB.alt = "media";
  frame.innerHTML = "";
  frame.appendChild(imgA);
  frame.appendChild(imgB);
}
function clearAllTimers(){
  if (nextTimer){ clearTimeout(nextTimer); nextTimer = null; }
  if (stallTimer){ clearTimeout(stallTimer); stallTimer = null; }
  if (hardCutTimer){ clearTimeout(hardCutTimer); hardCutTimer = null; }
}
function removeVideoIfAny(){
  var v = frame.querySelector("video");
  if (v) {
    try { v.pause(); } catch(_){}
    try { v.src = ""; } catch(_){}
    try { v.load(); } catch(_){}
    if (v.parentNode) v.parentNode.removeChild(v);
  }
}
function showFallback(){
  ensureLayers();
  removeVideoIfAny();
  imgA.src = "media/banner.jpg";
  imgA.classList.add("is-active");
  imgB.classList.remove("is-active");
}
function showImage(src, seconds){
  ensureLayers();
  removeVideoIfAny();
  var incoming = activeIsA ? imgB : imgA;
  var outgoing = activeIsA ? imgA : imgB;
  var durationMs = (seconds || 10) * 1000;
  if (durationMs > IMAGE_MAX_MS) durationMs = IMAGE_MAX_MS;
  incoming.onload = function(){
    incoming.classList.add("is-active");
    outgoing.classList.remove("is-active");
    activeIsA = !activeIsA;
    clearAllTimers();
    nextTimer = setTimeout(playNext, durationMs);
    hardCutTimer = setTimeout(playNext, durationMs + 2000); // extra safety
  };
  incoming.onerror = function(){
    clearAllTimers();
    nextTimer = setTimeout(playNext, 700);
  };
  incoming.src = MEDIA_PATH + src + "?t=" + Date.now();
}
function showVideo(src){
  ensureLayers();
  removeVideoIfAny();
  imgA.classList.remove("is-active");
  imgB.classList.remove("is-active");
  var video = document.createElement("video");
  video.src = MEDIA_PATH + src;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("webkit-playsinline","true");
  video.setAttribute("playsinline","true");
  frame.appendChild(video);
  clearAllTimers();
  hardCutTimer = setTimeout(function(){
    playNext();
  }, VIDEO_MAX_MS);
  var lastT = -1;
  var lastProgressAt = Date.now();
  function kickStallWatch(){
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(function(){
      playNext();
    }, VIDEO_STALL_MS);
  }
  function onProgress(){
    var t = 0;
    try { t = video.currentTime || 0; } catch(_){}
    if (t !== lastT){
      lastT = t;
      lastProgressAt = Date.now();
      kickStallWatch();
    }
  }
  video.onended = function(){ playNext(); };
  video.onerror = function(){ nextTimer = setTimeout(playNext, 700); };
  video.onplaying = function(){
    lastProgressAt = Date.now();
    kickStallWatch();
  };
  video.ontimeupdate = onProgress;
  video.onprogress = onProgress;
  video.onwaiting = function(){
    kickStallWatch();
  };
  video.onstalled = function(){
    kickStallWatch();
  };
  var metaTimer = setTimeout(function(){
    playNext();
  }, 8000);
  video.onloadedmetadata = function(){
    clearTimeout(metaTimer);
    kickStallWatch();
  };
  try{
    var p = video.play();
    if (p && p.catch){
      p.catch(function(){
        nextTimer = setTimeout(playNext, 700);
      });
    }
  }catch(e){
    nextTimer = setTimeout(playNext, 700);
  }
}
function playNext(){
  clearAllTimers();
  if (!playlist.length){
    showFallback();
    return;
  }
  var item = playlist[idx];
  idx = (idx + 1) % playlist.length;
  if (!item || !item.type || !item.src){
    nextTimer = setTimeout(playNext, 300);
    return;
  }
  if (item.type === "image"){
    showImage(item.src, item.duration || 10);
    return;
  }
  if (item.type === "video"){
    showVideo(item.src);
    return;
  }
  nextTimer = setTimeout(playNext, 300);
}
function loadManifest(){
  xhr(MANIFEST_URL + "?t=" + Date.now(), function(err, res){
    if (err){ showFallback(); return; }
    try{
      var json = JSON.parse(res);
      playlist = (json && json.items) ? json.items : [];
      if (!playlist.length){ showFallback(); return; }
      idx = 0;
      playNext();
    }catch(e){
      showFallback();
    }
  });
}
loadManifest();
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
  var y = 0;
  var dir = 1;
  var speed = 0.35;
  var pauseTop = 2200;
  var pauseBottom = 2200;
  var paused = false;
  var lastTick = Date.now();
  function resetToTop(){
    y = 0;
    dir = 1;
    mover.style.transform = "translateY(0px)";
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
    if(paused){
      requestAnimationFrame(tick);
      return;
    }
    y += dir * speed * (dt / 16.6);
    var maxY = moverH - wrapH;
    if(y >= maxY){
      y = maxY;
      mover.style.transform = "translateY(" + (-y) + "px)";
      paused = true;
      setTimeout(function(){ dir = -1; paused = false; }, pauseBottom);
    } else if(y <= 0){
      y = 0;
      mover.style.transform = "translateY(0px)";
      paused = true;
      setTimeout(function(){ dir = 1; paused = false; }, pauseTop);
    } else {
      mover.style.transform = "translateY(" + (-y) + "px)";
    }
    requestAnimationFrame(tick);
  }
  resetToTop();
  requestAnimationFrame(tick);
}
var CSV_PROGRESS =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";
var progressBody = document.getElementById("progressBody");
var boardMeta = document.getElementById("boardMeta");
function loadProgress(){
  progressBody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
  boardMeta.textContent = "Loading…";
  xhr(CSV_PROGRESS + "&t=" + Date.now(), function(err, res){
    if (err){
      progressBody.innerHTML = '<tr><td colspan="5" class="muted">Offline</td></tr>';
      boardMeta.textContent = "Offline";
      return;
    }
    try{
      var rows = parseCSV(res).slice(1);
      var html = "";
      var count = 0;
      for (var i=0;i<rows.length;i++){
        var r = rows[i];
        var customer = (r[4]  || "").trim(); // E
        var model    = (r[6]  || "").trim(); // G
        var year     = (r[8]  || "").trim(); // I
        var chassis  = (r[9]  || "").trim(); // J
        var film     = (r[10] || "").trim(); // K
        if (!customer) continue;
        count++;
        html += "<tr>";
        html += "<td>" + esc(customer) + "</td>";
        html += "<td>" + esc(model) + "</td>";
        html += "<td>" + esc(year) + "</td>";
        html += "<td>" + esc(chassis) + "</td>";
        html += "<td>" + esc(film) + "</td>";
        html += "</tr>";
      }
      if (!html){
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
var CSV_REVISIT =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=1236474828&single=true&output=csv";
var revisitBody = document.getElementById("revisitBody");
var revisitMeta = document.getElementById("revisitMeta");
function loadRevisit(){
  revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Loading…</td></tr>';
  if (revisitMeta) revisitMeta.textContent = "Loading…";
  xhr(CSV_REVISIT + "&t=" + Date.now(), function(err, res){
    if (err){
      revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Offline</td></tr>';
      if (revisitMeta) revisitMeta.textContent = "Offline";
      return;
    }
    try{
      var rows = parseCSV(res).slice(1);
      var html = "";
      var count = 0;
      for (var i=0;i<rows.length;i++){
        var r = rows[i];
        var status = (r[0] || "").trim(); // A
        var name   = (r[3] || "").trim(); // D
        var car    = (r[5] || "").trim(); // F
        var color  = (r[6] || "").trim(); // G
        if (!name) continue;
        count++;
        html += "<tr>";
        html += "<td>" + esc(status) + "</td>";
        html += "<td>" + esc(name) + "</td>";
        html += "<td>" + esc(car) + "</td>";
        html += "<td>" + esc(color) + "</td>";
        html += "</tr>";
      }
      if (!html){
        revisitBody.innerHTML = '<tr><td colspan="4" class="muted">No bookings today</td></tr>';
        if (revisitMeta) revisitMeta.textContent = "Live · 0";
        setTimeout(function(){ enableAutoScroll("revisitWrap"); }, 300);
        return;
      }
      revisitBody.innerHTML = html;
      if (revisitMeta) revisitMeta.textContent = "Live · " + count;
      setTimeout(function(){ enableAutoScroll("revisitWrap"); }, 300);

    }catch(e){
      revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Error</td></tr>';
      if (revisitMeta) revisitMeta.textContent = "Error";
    }
  });
}
var refreshBtn = document.getElementById("refreshBtn");
if (refreshBtn) refreshBtn.onclick = function(){
  loadProgress();
  loadRevisit();
};
setInterval(loadProgress, 30000);
setInterval(loadRevisit, 30000);
loadProgress();
loadRevisit();
setTimeout(function(){
  enableAutoScroll("progressWrap");
  enableAutoScroll("revisitWrap");
}, 900);
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
})();
