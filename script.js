(function(){
  var mediaFrame = document.getElementById("mediaFrame");
  var overlayBranch = document.getElementById("overlayBranch");
  var branchLabel = document.getElementById("branchLabel");
  var branchSelect = document.getElementById("branchSelect");
  var muteBtn = document.getElementById("muteBtn");
  var countdownEl = document.getElementById("countdown");
  var refreshBtn = document.getElementById("refreshBtn");
  var sheetFrame = document.getElementById("sheetFrame");
  var boardMeta = document.getElementById("boardMeta");

  var muted = true;
  var playlist = [];
  var idx = 0;
  var nextTimer = null;
  var countTimer = null;

  // Shared playlist for all branches
  var MANIFEST_URL = "media/shared/manifest.json";
  var MEDIA_BASE = "media/shared/";

  function xhrGet(url, timeoutMs, cb){
    var x = new XMLHttpRequest();
    x.open("GET", url, true);
    x.timeout = timeoutMs || 10000;
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

  function shuffle(a){
    for (var i=a.length-1;i>0;i--){
      var j = Math.floor(Math.random()*(i+1));
      var t = a[i]; a[i]=a[j]; a[j]=t;
    }
  }

  function clearTimers(){
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

  function renderMessage(msg){
    mediaFrame.innerHTML = '<div class="center-msg muted">' + msg + '</div>';
    countdownEl.textContent = "--";
  }

  function loadManifest(){
    renderMessage("Loading media…");

    xhrGet(MANIFEST_URL + "?t=" + Date.now(), 12000, function(err, text){
      if (err){
        renderMessage("No media (manifest not reachable)");
        return;
      }

      try{
        var data = JSON.parse(text);
        var items = data.items || [];
        if (!items.length){
          renderMessage("No media (manifest empty)");
          return;
        }

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
        renderMessage("No media (manifest JSON error)");
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
    clearTimers();
    if (!playlist.length){
      renderMessage("No media");
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
        renderMessage("Missing image: " + item.src);
        nextTimer = setTimeout(next, 2000);
      };

      var d = item.duration || 6;
      startCountdown(d);
      nextTimer = setTimeout(next, d*1000);
      return;
    }

    // video: TV browsers may fail autoplay or codec -> fallback to next
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
      // fallback: skip video if TV can’t play it
      renderMessage("Video not supported, skipping…");
      nextTimer = setTimeout(next, 1500);
    };

    mediaFrame.appendChild(v);

    // some TVs refuse play() promise; ignore and move on if needed
    try{
      var p = v.play();
      // if promise exists, catch
      if (p && typeof p.catch === "function"){
        p.catch(function(){
          renderMessage("Autoplay blocked, skipping…");
          nextTimer = setTimeout(next, 1500);
        });
      }
    }catch(e){
      renderMessage("Video play failed, skipping…");
      nextTimer = setTimeout(next, 1500);
    }
  }

  // Time/Date (TV-safe: uses TV device time)
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

  // Weather (Cairo) with XHR
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

  // Branch UI (same shared media)
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

  // Sheet refresh: reload iframe (TV-safe)
  refreshBtn.onclick = function(){
    boardMeta.textContent = "Refreshing…";
    sheetFrame.src = sheetFrame.src.split("&t=")[0] + "&t=" + Date.now();
    setTimeout(function(){ boardMeta.textContent = "Live"; }, 800);
  };

  // Auto-refresh sheet iframe every 2 minutes (keeps it alive on TVs)
  setInterval(function(){
    sheetFrame.src = sheetFrame.src.split("&t=")[0] + "&t=" + Date.now();
  }, 2*60*1000);

  // Init
  loadManifest();
})();
