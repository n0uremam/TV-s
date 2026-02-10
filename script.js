(function(){

/* =========================
   MEDIA PLAYER (TV SAFE)
========================= */

var MEDIA_PATH = "media/shared/";
var MANIFEST_URL = MEDIA_PATH + "manifest.json";

var frame = document.getElementById("mediaFrame");

var playlist = [];
var index = 0;
var timer = null;

/* Two image layers for cross-fade */
var imgA = null;
var imgB = null;
var activeIsA = true;

function ensureImageLayers(){
  if (imgA && imgB) return;

  imgA = document.createElement("img");
  imgA.className = "media-layer is-active";
  imgA.alt = "media";

  imgB = document.createElement("img");
  imgB.className = "media-layer";
  imgB.alt = "media";

  frame.innerHTML = "";         // remove "Loading media..."
  frame.appendChild(imgA);
  frame.appendChild(imgB);
}

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

function showFallback(){
  frame.innerHTML =
    '<img class="media-layer is-active" src="' + MEDIA_PATH + '01.jpg" alt="Fallback">';
}

function resetTimers(){
  if (timer) { clearTimeout(timer); timer = null; }
}

function removeVideoIfAny(){
  var v = frame.querySelector("video");
  if (v) {
    try { v.pause(); } catch(_){}
    v.parentNode.removeChild(v);
  }
}

function crossfadeTo(src, cb){
  ensureImageLayers();
  removeVideoIfAny();

  var incoming = activeIsA ? imgB : imgA;
  var outgoing = activeIsA ? imgA : imgB;

  incoming.onload = function(){
    // start fade
    incoming.classList.add("is-active");
    outgoing.classList.remove("is-active");
    activeIsA = !activeIsA;

    // wait for fade to finish before continuing (optional)
    setTimeout(function(){
      if (typeof cb === "function") cb();
    }, 950);
  };

  incoming.onerror = function(){
    // if image missing, skip quickly
    setTimeout(function(){
      if (typeof cb === "function") cb();
    }, 200);
  };

  incoming.src = MEDIA_PATH + src + "?t=" + Date.now();
}

function playNext(){
  resetTimers();

  if (!playlist.length){
    showFallback();
    return;
  }

  var item = playlist[index];
  index = (index + 1) % playlist.length;

  if (item.type === "image"){
    var durationMs = (item.duration || 10) * 1000;

    crossfadeTo(item.src, function(){
      timer = setTimeout(playNext, durationMs);
    });

    return;
  }

  if (item.type === "video"){
    ensureImageLayers();        // keep layers in DOM
    removeVideoIfAny();         // clear previous video

    // hide image layers while video plays
    imgA.classList.remove("is-active");
    imgB.classList.remove("is-active");

    var video = document.createElement("video");
    video.src = MEDIA_PATH + item.src;
    video.autoplay = true;
    video.muted = true;         // TV-safe autoplay
    video.playsInline = true;
    video.preload = "auto";

    video.onended = playNext;
    video.onerror = playNext;

    frame.appendChild(video);

    try{
      var p = video.play();
      if (p && p.catch) p.catch(function(){ playNext(); });
    }catch(e){
      playNext();
    }
    return;
  }

  // unknown type => skip
  timer = setTimeout(playNext, 400);
}

function loadManifest(){
  xhr(MANIFEST_URL + "?t=" + Date.now(), function(err, res){
    if (err){
      showFallback();
      return;
    }
    try{
      var json = JSON.parse(res);
      playlist = (json && json.items) ? json.items : [];
      if (!playlist.length){
        showFallback();
        return;
      }
      index = 0;
      playNext();
    }catch(e){
      showFallback();
    }
  });
}

loadManifest();

/* Extra stability refresh every 5 hours */
setTimeout(function(){ location.reload(); }, 18000 * 1000);


/* =========================
   IN PROGRESS TABLE (ONLY E,G,I,J,K)
========================= */

var CSV_URL =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";

var progressBody = document.getElementById("progressBody");
var boardMeta = document.getElementById("boardMeta");
var refreshBtn = document.getElementById("refreshBtn");

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

function xhrTable(url, cb){
  // reuse XHR without changing media function signatures
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

function loadProgress(){
  progressBody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
  boardMeta.textContent = "Loading…";

  xhrTable(CSV_URL + "&t=" + Date.now(), function(err, res){
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
        return;
      }

      progressBody.innerHTML = html;
      boardMeta.textContent = "Live · " + count;

    }catch(e){
      progressBody.innerHTML = '<tr><td colspan="5" class="muted">Error</td></tr>';
      boardMeta.textContent = "Error";
    }
  });
}

if (refreshBtn) refreshBtn.onclick = loadProgress;
setInterval(loadProgress, 30000);
loadProgress();


/* =========================
   DATE/TIME + WEATHER
========================= */

function tick(){
  var d = new Date();
  function pad(n){ return n<10 ? "0"+n : ""+n; }

  var timeEl = document.getElementById("timeLocal");
  var dateEl = document.getElementById("dateLocal");

  if (timeEl) timeEl.textContent = pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());
  if (dateEl) dateEl.textContent = d.toDateString();
}
setInterval(tick, 1000);
tick();

function loadWeather(){
  var url = "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m";
  var r = new XMLHttpRequest();
  r.open("GET", url + "&t=" + Date.now(), true);
  r.timeout = 15000;
  r.onload = function(){
    var el = document.getElementById("weatherCairo");
    if (!el) return;
    if (!(r.status >= 200 && r.status < 300)){ el.textContent="--"; return; }
    try{
      var j = JSON.parse(r.responseText);
      el.textContent = Math.round(j.current.temperature_2m) + "°C";
    }catch(e){
      el.textContent="--";
    }
  };
  r.onerror = r.ontimeout = function(){
    var el = document.getElementById("weatherCairo");
    if (el) el.textContent="--";
  };
  r.send();
}
loadWeather();
setInterval(loadWeather, 10*60*1000);

})();
