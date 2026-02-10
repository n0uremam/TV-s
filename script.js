(function(){
  var mediaFrame = document.getElementById("mediaFrame");
  var overlayBranch = document.getElementById("overlayBranch");
  var branchLabel = document.getElementById("branchLabel");
  var branchSelect = document.getElementById("branchSelect");
  var muteBtn = document.getElementById("muteBtn");
  var countdownEl = document.getElementById("countdown");

  var progressBody = document.getElementById("progressBody");
  var boardMeta = document.getElementById("boardMeta");
  var refreshBtn = document.getElementById("refreshBtn");

  var muted = true;
  var playlist = [];
  var idx = 0;
  var nextTimer = null;
  var countTimer = null;

  // Shared playlist for all branches
  var MANIFEST_URL = "media/shared/manifest.json";
  var MEDIA_BASE = "media/shared/";

  // Published CSV (same sheet, output=csv)
  var CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";

  /* ---------- XHR ---------- */
  function xhrGet(url, timeoutMs, cb){
    var x = new XMLHttpRequest();
    x.open("GET", url, true);
    x.timeout = timeoutMs || 12000;
    x.onreadystatechange = function(){
      if (x.readyState === 4){
        if (x.status >= 200 && x.status < 300) cb(null, x.responseText);
        else cb(new Error("HTTP " + x.status), null);
      }
    };
    x.ontimeout = function(){ cb(new Error("TIMEOUT"), null); };
    x.onerror = function(){ cb(new Error("NETWORK"), null); };
    x.send();
  }

  function esc(s){
    s = (s === undefined || s === null) ? "" : String(s);
    return s
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  /* ---------- CSV parser (supports quotes/commas) ---------- */
  function parseCSV(text){
    var rows = [];
    var row = [];
    var cur = "";
    var inQuotes = false;

    for (var i=0;i<text.length;i++){
      var c = text[i];
      var n = text[i+1];

      if (c === '"' && inQuotes && n === '"'){ cur += '"'; i++; }
      else if (c === '"'){ inQuotes = !inQuotes; }
      else if (c === "," && !inQuotes){ row.push(cur); cur=""; }
      else if ((c === "\n" || c === "\r") && !inQuotes){
        if (cur.length || row.length) row.push(cur);
        if (row.length) rows.push(row);
        row = []; cur = "";
      } else {
        cur += c;
      }
    }
    if (cur.length || row.length){ row.push(cur); rows.push(row); }
    return rows;
  }

  /* =========================
     MEDIA
  ========================= */
  function shuffle(a){
    for (var i=a.length-1;i>0;i--){
      var j = Math.floor(Math.random()*(i+1));
      var t = a[i]; a[i]=a[j]; a[j]=t;
    }
  }

  function clearMediaTimers(){
    if (nextTimer) clearTimeout(nextTimer);
    if (countTimer) clearInterval(countTimer);
    nextTimer = null;
    countTimer = null;
  }

  function startCountdown(sec){
    clearInterval(countTimer);
    var s = sec;
    countdownEl.textContent = String(s);
    countTimer = setInterval(function(){
      s--;
      countdownEl.textContent = String(Math.max(s,0));
      if (s <= 0) clearInterval(countTimer);
    }, 1000);
  }

  function renderMediaMsg(msg){
    mediaFrame.innerHTML = '<div class="center-msg muted">' + esc(msg) + '</div>';
    countdownEl.textContent = "--";
  }

  function loadManifest(){
    renderMediaMsg("Loading media…");
    xhrGet(MANIFEST_URL + "?t=" + Date.now(), 12000, function(err, text){
      if (err){ renderMediaMsg("No media (manifest not reachable)"); return; }

      try{
        var data = JSON.parse(text);
        var items = data.items || [];
        if (!items.length){ renderMediaMsg("No media (manifest empty)"); return; }

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
        playCurrent();
      }catch(e){
        renderMediaMsg("No media (manifest JSON error)");
      }
    });
  }

  function next(){
    if (!playlist.length) return;
    idx = (idx + 1) % playlist.length;
    if (idx === 0) shuffle(playlist);
    playCurrent();
  }

  function playCurrent(){
    clearMediaTimers();
    if (!playlist.length){ renderMediaMsg("No media"); return; }

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
        renderMediaMsg("Missing image: " + item.src);
        nextTimer = setTimeout(next, 2000);
      };

      var d = item.duration || 6;
      startCountdown(d);
      nextTimer = setTimeout(next, d * 1000);
      return;
    }

    // video fallback (skip if not supported)
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
      renderMediaMsg("Video not supported, skipping…");
      nextTimer = setTimeout(next, 1500);
    };

    mediaFrame.appendChild(v);

    try{
      var p = v.play();
      if (p && typeof p.catch === "function"){
        p.catch(function(){
          renderMediaMsg("Autoplay blocked, skipping…");
          nextTimer = setTimeout(next, 1500);
        });
      }
    }catch(e){
      renderMediaMsg("Video play failed, skipping…");
      nextTimer = setTimeout(next, 1500);
    }
  }

  /* =========================
     LOCAL DATE/TIME (TV-safe)
  ========================= */
  function tickLocal(){
    var now = new Date();
    function pad(n){ return (n<10 ? "0"+n : ""+n); }

    var hh = pad(now.getHours());
    var mm = pad(now.getMinutes());
    var ss = pad(now.getSeconds());

    var days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    document.getElementById("timeLocal").textContent = hh + ":" + mm + ":" + ss;
    document.getElementById("dateLocal").textContent =
      days[now.getDay()] + ", " + pad(now.getDate()) + " " + months[now.getMonth()] + " " + now.getFullYear();
  }
  setInterval(tickLocal, 1000);
  tickLocal();

  /* =========================
     WEATHER (Cairo) via XHR
  ========================= */
  function loadWeather(){
    var url = "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m";
    xhrGet(url + "&t=" + Date.now(), 10000, function(err, text){
      if (err){
        document.getElementById("weatherCairo").textContent = "--";
        return;
      }
      try{
        var j = JSON.parse(text);
        var t = j && j.current && j.current.temperature_2m;
        document.getElementById("weatherCairo").textContent = (Math.round(t) + "°C");
      }catch(e){
        document.getElementById("weatherCairo").textContent = "--";
      }
    });
  }
  loadWeather();
  setInterval(loadWeather, 10*60*1000);

  /* =========================
     IN PROGRESS (ONLY E,F,G,H,J)
     E=4, F=5, G=6, H=7, J=9
  ========================= */
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
        var rows = parseCSV(csvText);
        var data = rows.slice(1); // remove header

        // remove empty lines
        var clean = [];
        for (var i=0;i<data.length;i++){
          var r = data[i];
          var hasAny = false;
          for (var k=0;k<r.length;k++){
            if ((r[k] || "").trim() !== "") { hasAny = true; break; }
          }
          if (hasAny) clean.push(r);
        }

        if (!clean.length){
          progressBody.innerHTML = '<tr><td colspan="5" class="muted">No orders in progress.</td></tr>';
          boardMeta.textContent = "Live • 0";
          return;
        }

        var html = "";
        for (var j=0;j<clean.length;j++){
          var r2 = clean[j];

          var E = (r2[4] || "").trim();
          var F = (r2[5] || "").trim();
          var G = (r2[6] || "").trim();
          var H = (r2[7] || "").trim();
          var J = (r2[9] || "").trim();

          html += "<tr>";
          html += "<td>" + esc(E) + "</td>";
          html += "<td><span class='status-pill in-progress'>" + esc(F || "In progress") + "</span></td>";
          html += "<td>" + esc(G) + "</td>";
          html += "<td>" + esc(H) + "</td>";
          html += "<td>" + esc(J) + "</td>";
          html += "</tr>";
        }

        progressBody.innerHTML = html;
        boardMeta.textContent = "Live • " + clean.length;
      }catch(e){
        progressBody.innerHTML = '<tr><td colspan="5" class="muted">Error</td></tr>';
        boardMeta.textContent = "Error";
      }
    });
  }

  refreshBtn.onclick = loadProgress;

  // Auto refresh progress every 30 seconds (TV-safe)
  setInterval(loadProgress, 30000);

  /* =========================
     UI EVENTS
  ========================= */
  branchSelect.onchange = function(){
    var label = branchSelect.options[branchSelect.selectedIndex].text;
    overlayBranch.textContent = label;
    branchLabel.textContent = label + " Branch • Waiting Room Display";
  };

  muteBtn.onclick = function(){
    muted = !muted;
    muteBtn.textContent = muted ? "Muted" : "Sound On";
    var vid = mediaFrame.querySelector("video");
    if (vid) vid.muted = muted;
  };

  /* =========================
     EXTRA SAFETY REFRESH (5 hours)
  ========================= */
  setTimeout(function(){ location.reload(); }, 18000 * 1000);

  /* =========================
     INIT
  ========================= */
  loadManifest();
  loadProgress();

})();
