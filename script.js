(function(){

/* =========================
   MEDIA PLAYER (TV SAFE)
========================= */

var MEDIA_PATH = "media/shared/";
var MANIFEST_URL = MEDIA_PATH + "manifest.json";

var frame = document.getElementById("mediaFrame");
var mediaStatus = document.getElementById("mediaStatus");

var playlist = [];
var index = 0;
var timer = null;

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

function setStatus(txt){
  if (mediaStatus) mediaStatus.textContent = txt || "—";
}

function showFallback(reason){
  setStatus("Media fallback (" + reason + ")");
  frame.innerHTML = '<img src="' + MEDIA_PATH + 'banner.jpg" alt="Fallback">';
}

function reset(){
  if (timer) { clearTimeout(timer); timer = null; }
  frame.innerHTML = "";
}

function playNext(){
  if (!playlist.length){
    showFallback("empty playlist");
    return;
  }

  reset();

  var item = playlist[index];
  index = (index + 1) % playlist.length;

  // show which file currently playing
  setStatus((item.type || "?") + " • " + (item.src || ""));

  if (item.type === "image"){
    var img = new Image();
    img.src = MEDIA_PATH + item.src;
    img.onload = function(){
      frame.innerHTML = "";
      frame.appendChild(img);
      var d = (item.duration || 10) * 1000;
      timer = setTimeout(playNext, d);
    };
    img.onerror = function(){
      setStatus("Missing image: " + item.src);
      timer = setTimeout(playNext, 1200);
    };
    return;
  }

  if (item.type === "video"){
    var video = document.createElement("video");
    video.src = MEDIA_PATH + item.src;
    video.autoplay = true;
    video.muted = true;      // TV-safe autoplay
    video.playsInline = true;
    video.preload = "auto";

    video.onended = playNext;
    video.onerror = function(){
      setStatus("Video unsupported/missing: " + item.src);
      timer = setTimeout(playNext, 1200);
    };

    frame.appendChild(video);

    // Some TVs need explicit play()
    try{
      var p = video.play();
      if (p && p.catch) p.catch(function(){
        setStatus("Autoplay blocked: " + item.src);
        timer = setTimeout(playNext, 1200);
      });
    }catch(e){
      setStatus("Play failed: " + item.src);
      timer = setTimeout(playNext, 1200);
    }
    return;
  }

  // unknown type
  setStatus("Unknown type: " + item.type);
  timer = setTimeout(playNext, 1200);
}

function loadManifest(){
  setStatus("Loading manifest…");
  xhr(MANIFEST_URL + "?t=" + Date.now(), function(err, res){
    if (err){
      showFallback("manifest " + err);
      return;
    }
    try{
      var json = JSON.parse(res);
      playlist = (json && json.items) ? json.items : [];
      if (!playlist.length){
        showFallback("manifest has 0 items");
        return;
      }
      index = 0;
      playNext();
    }catch(e){
      showFallback("manifest JSON error");
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

function loadProgress(){
  progressBody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
  boardMeta.textContent = "Loading…";

  xhr(CSV_URL + "&t=" + Date.now(), function(err, res){
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

        // ONLY: E,G,I,J,K
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
  xhr(url + "&t=" + Date.now(), function(err, res){
    var el = document.getElementById("weatherCairo");
    if (!el) return;
    if (err){ el.textContent = "--"; return; }
    try{
      var j = JSON.parse(res);
      el.textContent = Math.round(j.current.temperature_2m) + "°C";
    }catch(e){
      el.textContent = "--";
    }
  });
}
loadWeather();
setInterval(loadWeather, 10*60*1000);

})();

