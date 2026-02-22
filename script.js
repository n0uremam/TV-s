(function () {
  "use strict";
  var debugBox = document.getElementById("debugBox");
  function debug(msg) {
    // Data-saving / clean UI: keep this silent.
    // If you ever want debug back: if (debugBox) debugBox.textContent = msg;
  }

  window.onerror = function (message, source, lineno, colno) {
    debug("JS ERROR: " + message + " @ " + lineno + ":" + colno);
    return false;
  };

  function xhr(url, cb, method) {
    var r = new XMLHttpRequest();
    r.open(method || "GET", url, true);
    r.timeout = 25000;
    r.onload = function () {
      if (r.status >= 200 && r.status < 300) cb(null, r.responseText, r);
      else cb("HTTP " + r.status, null, r);
    };
    r.onerror = r.ontimeout = function () {
      cb("NETWORK/TIMEOUT", null, r);
    };
    r.send();
  }

  function esc(s) {
    s = s === undefined || s === null ? "" : String(s);
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseCSV(t) {
    var rows = [],
      row = [];
    var cur = "",
      q = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i],
        n = t[i + 1];
      if (c == '"' && q && n == '"') {
        cur += '"';
        i++;
      } else if (c == '"') {
        q = !q;
      } else if (c == "," && !q) {
        row.push(cur);
        cur = "";
      } else if ((c == "\n" || c == "\r") && !q) {
        if (cur || row.length) {
          row.push(cur);
          rows.push(row.slice());
        }
        row.length = 0;
        cur = "";
      } else {
        cur += c;
      }
    }
    if (cur || row.length) {
      row.push(cur);
      rows.push(row);
    }
    return rows;
  }

  function sameData(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // ===== Clock =====
  function tickClock() {
    var d = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : "" + n;
    }
    var timeEl = document.getElementById("timeLocal");
    var dateEl = document.getElementById("dateLocal");
    if (timeEl)
      timeEl.textContent =
        pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    if (dateEl) dateEl.textContent = d.toDateString();
  }
  setInterval(tickClock, 1000);
  tickClock();

  // ===== Weather (Cairo) =====
  function loadWeather() {
    var el = document.getElementById("weatherCairo");
    if (!el) return;
    var url =
      "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m";
    xhr(url + "&t=" + Date.now(), function (err, res) {
      if (err) {
        el.textContent = "--";
        return;
      }
      try {
        var j = JSON.parse(res);
        el.textContent = Math.round(j.current.temperature_2m) + "°C";
      } catch (e) {
        el.textContent = "--";
      }
    });
  }
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);

  // ===== LIVE UPDATE SETTINGS (Data-saving) =====
  var TABLE_REFRESH_MS = 5 * 60 * 1000;          // tables refresh every 5 minutes (saves data)
  var MANIFEST_REFRESH_MS = 3 * 60 * 60 * 1000;  // manifest refresh every 3 hours (saves data)
  var RESYNC_MEDIA_MS = 10 * 60 * 1000;          // re-sync media every 10 minutes

  // ===== MEDIA PLAYER (Vercel) =====
  // IMPORTANT on Vercel: use absolute path from site root
  var MEDIA_PATH = "/media/shared/";
  var MANIFEST_URL = MEDIA_PATH + "manifest.json";

  var frame = document.getElementById("mediaFrame");
  var statusEl = document.getElementById("mediaStatus");
  var logoFallback = document.getElementById("mediaLogoFallback");

  // Keep media URLs WITHOUT cache-busting => better caching + less buffering
  function mediaUrl(src) {
    return MEDIA_PATH + src;
  }

  function setMediaStatus(t) {
    // Hide noisy messages: only show critical ones
    if (!statusEl) return;
    if (!t) {
      statusEl.textContent = "";
      return;
    }
    // Only show these:
    if (
      t.indexOf("offline") >= 0 ||
      t.indexOf("error") >= 0 ||
      t.indexOf("failed") >= 0 ||
      t.indexOf("timeout") >= 0
    ) statusEl.textContent = t;
    else statusEl.textContent = ""; // suppress "Loading..." / "Buffering..." spam
  }

  function showLogoFallback() {
    if (logoFallback) logoFallback.style.opacity = "1";
  }
  function hideLogoFallback() {
    if (logoFallback) logoFallback.style.opacity = "0";
  }

  var playlist = [];
  var idx = 0;
  var nextTimer = null;
  var resyncTimer = null;

  function clearNext() {
    if (nextTimer) {
      clearTimeout(nextTimer);
      nextTimer = null;
    }
  }
  function scheduleNext(ms) {
    clearNext();
    nextTimer = setTimeout(playNext, ms);
  }

  function removeVideo() {
    if (!frame) return;
    var vids = frame.getElementsByTagName("video");
    if (vids && vids[0]) {
      try { vids[0].pause(); } catch (_) {}
      try { vids[0].removeAttribute("src"); } catch (_) {}
      try { vids[0].load(); } catch (_) {}
      if (vids[0].parentNode) vids[0].parentNode.removeChild(vids[0]);
    }
  }

  // Two image layers => smooth cross-fade
  function ensureImageLayer(id) {
    var img = document.getElementById(id);
    if (img) return img;
    img = document.createElement("img");
    img.id = id;
    img.decoding = "async";
    img.loading = "eager";
    img.referrerPolicy = "no-referrer";
    img.style.position = "absolute";
    img.style.left = "0";
    img.style.top = "0";
    img.style.right = "0";
    img.style.bottom = "0";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain"; // keep your “no stretch” look for images
    img.style.background = "#000";
    img.style.opacity = "0";
    img.style.transition = "opacity 650ms ease";
    img.style.willChange = "opacity";
    frame.appendChild(img);
    return img;
  }

  var imgA = ensureImageLayer("mediaImgA");
  var imgB = ensureImageLayer("mediaImgB");
  var imgAOnTop = true;
  function topImg() { return imgAOnTop ? imgA : imgB; }
  function backImg() { return imgAOnTop ? imgB : imgA; }

  // --- Sync support (server time) ---
  var serverSkewMs = 0; // serverNow = Date.now() + serverSkewMs

  function getServerNow(cb) {
    // Use HEAD on the manifest (same origin) to read Date header => sync TVs
    xhr(MANIFEST_URL + "?ts=" + Date.now(), function (err, _res, req) {
      if (err || !req) return cb(Date.now() + serverSkewMs);
      try {
        var dateHdr = req.getResponseHeader("Date");
        if (!dateHdr) return cb(Date.now() + serverSkewMs);
        var serverNow = new Date(dateHdr).getTime();
        if (!isFinite(serverNow)) return cb(Date.now() + serverSkewMs);
        serverSkewMs = serverNow - Date.now();
        cb(serverNow);
      } catch (e) {
        cb(Date.now() + serverSkewMs);
      }
    }, "HEAD");
  }

  // Video durations (seconds) for SYNC (from your list)
  var VIDEO_DUR = {
    "02.mp4": 68,
    "04.mp4": 7,
    "05.mp4": 9,
    "06.mp4": 27,
    "11.mp4": 220,
    "12.mp4": 29,
    "15.mp4": 29,
    "16.mp4": 35,
    "17.mp4": 62,
    "18.mp4": 23,
    "19.mp4": 35,
    "21.mp4": 76,
    "22.mp4": 37, 
    "23.mp4": 67,
    "24.mp4": 77, 
    "25.mp4": 180,
    "26.mp4": 85, 
    "27.mp4": 11
  };

  function itemDurationMs(item) {
    if (!item) return 0;
    if (item.type === "image") return Math.max(3000, (item.duration || 15) * 1000);
    if (item.type === "video") {
      var s = VIDEO_DUR[item.src];
      if (typeof s === "number" && s > 0) return Math.max(3000, s * 1000);
      // fallback if unknown
      return 30000;
    }
    return 0;
  }

  function buildTimeline(items) {
    var tl = [];
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.type || !it.src) continue;
      var d = itemDurationMs(it);
      if (!d) continue;
      tl.push({ item: it, durMs: d, startMs: total });
      total += d;
    }
    return { tl: tl, totalMs: total };
  }

  function computeSyncedState(serverNow, items) {
    var timeline = buildTimeline(items);
    if (!timeline.tl.length || timeline.totalMs <= 0) return null;

    var pos = serverNow % timeline.totalMs;
    for (var i = 0; i < timeline.tl.length; i++) {
      var seg = timeline.tl[i];
      if (pos >= seg.startMs && pos < seg.startMs + seg.durMs) {
        return {
          index: i,
          offsetMs: pos - seg.startMs,
          remainingMs: seg.durMs - (pos - seg.startMs),
          timeline: timeline
        };
      }
    }
    // fallback
    return { index: 0, offsetMs: 0, remainingMs: timeline.tl[0].durMs, timeline: timeline };
  }

  // --- Image loading with smoother behavior (less “skipping”) ---
  function swapToImage(src, onReady) {
    var back = backImg();
    var front = topImg();

    // do NOT blank the screen while loading
    // keep front visible until back loads, then fade
    var done = false;
    var IMAGE_TIMEOUT_MS = 20000;

    var hang = setTimeout(function () {
      if (done) return;
      done = true;
      setMediaStatus("Image timeout, skipping…");
      showLogoFallback();
      if (onReady) onReady(false);
    }, IMAGE_TIMEOUT_MS);

    back.onload = function () {
      if (done) return;
      done = true;
      clearTimeout(hang);

      hideLogoFallback();
      back.style.opacity = "1";
      front.style.opacity = "0";
      imgAOnTop = !imgAOnTop;

      setMediaStatus("");
      if (onReady) onReady(true);
    };

    back.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(hang);
      setMediaStatus("Image failed, skipping…");
      showLogoFallback();
      if (onReady) onReady(false);
    };

    back.src = mediaUrl(src);
  }

  function playImage(src, durationMs, remainMsOverride) {
    removeVideo();
    hideLogoFallback();

    // schedule according to sync remaining time
    var remain = typeof remainMsOverride === "number" ? remainMsOverride : durationMs;

    swapToImage(src, function (ok) {
      if (!ok) {
        scheduleNext(900);
        return;
      }
      scheduleNext(Math.max(700, remain));
    });
  }

  // --- Video: reduce buffering + keep autoplay reliable on TVs ---
  function playVideo(src, offsetMs, remainMs) {
    removeVideo();
    hideLogoFallback();

    var v = document.createElement("video");
    v.src = mediaUrl(src);
    v.autoplay = true;
    v.muted = true;             // IMPORTANT: TVs often require muted autoplay
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("webkit-playsinline", "true");
    v.setAttribute("playsinline", "true");

    v.style.position = "absolute";
    v.style.left = "0";
    v.style.top = "0";
    v.style.right = "0";
    v.style.bottom = "0";
    v.style.width = "100%";
    v.style.height = "100%";
    v.style.objectFit = "cover"; // keeps video filling the frame (no shrink)
    v.style.background = "#000";

    frame.appendChild(v);

    var started = false;
    var lastT = -1;
    var stallAt = Date.now();

    // If it can’t start quickly, skip (prevents long “Buffering…”)
    var START_TIMEOUT_MS = 25000;
    var firstFrameTimer = setTimeout(function () {
      if (!started) {
        setMediaStatus("Video can't start, skipping…");
        removeVideo();
        showLogoFallback();
        scheduleNext(1200);
      }
    }, START_TIMEOUT_MS);

    function failVideo(msg) {
      clearTimeout(firstFrameTimer);
      setMediaStatus(msg || "Video error, skipping…");
      removeVideo();
      showLogoFallback();
      scheduleNext(1200);
    }

    // Apply sync offset after metadata is ready
    v.onloadedmetadata = function () {
      try {
        if (typeof offsetMs === "number" && isFinite(offsetMs) && offsetMs > 0) {
          var offsetSec = offsetMs / 1000;
          // If offset is too close to end, jump to next item
          if (v.duration && isFinite(v.duration) && offsetSec >= v.duration - 0.8) {
            failVideo("Video offset near end, skipping…");
            return;
          }
          // best-effort seek
          v.currentTime = offsetSec;
        }
      } catch (_) {}
    };

    v.ontimeupdate = function () {
      if (v.currentTime !== lastT) {
        lastT = v.currentTime;
        started = true;
        stallAt = Date.now();
        clearTimeout(firstFrameTimer);
        setMediaStatus("");
      }

      // freeze watchdog
      if (Date.now() - stallAt > 45000) {
        failVideo("Video froze, skipping…");
      }

      // sync-based end (don’t rely only on onended)
      if (typeof remainMs === "number" && remainMs > 0) {
        // once started, schedule based on remaining time only once
        // (avoid double scheduling)
        if (!v.__scheduledEnd) {
          v.__scheduledEnd = true;
          setTimeout(function () {
            // if still same video mounted, move on
            try {
              failVideo(""); // uses scheduleNext(1200) -> smooth next
            } catch (_) {}
          }, Math.max(1200, remainMs));
        }
      }
    };

    v.onended = function () {
      clearTimeout(firstFrameTimer);
      removeVideo();
      scheduleNext(600);
    };

    v.onerror = function () {
      failVideo("Video error, skipping…");
    };

    v.onwaiting = function () {
      // keep silent; watchdog handles long waits
    };

    try {
      var p = v.play();
      if (p && p.catch) p.catch(function () { failVideo("Autoplay blocked"); });
    } catch (e) {
      failVideo("Play failed");
    }
  }

  // ===== Manifest + Synced playback =====
  function startSyncedPlayback() {
    if (!playlist || !playlist.length) {
      showLogoFallback();
      setMediaStatus("No media found (manifest empty)");
      return;
    }

    getServerNow(function (serverNow) {
      var st = computeSyncedState(serverNow, playlist);
      if (!st || !st.timeline || !st.timeline.tl.length) {
        showLogoFallback();
        setMediaStatus("No media found (manifest empty)");
        return;
      }

      var seg = st.timeline.tl[st.index];
      var it = seg.item;

      // Set idx to the NEXT timeline item (so playNext continues correctly)
      // Convert timeline index to playlist “next” index by searching item src/type
      // (simple approach: just move sequentially inside timeline)
      var nextIndexInTimeline = (st.index + 1) % st.timeline.tl.length;
      idx = nextIndexInTimeline; // idx used in playNext()

      clearNext();

      if (it.type === "image") {
        playImage(it.src, seg.durMs, st.remainingMs);
      } else if (it.type === "video") {
        playVideo(it.src, st.offsetMs, st.remainingMs);
      } else {
        scheduleNext(600);
      }
    });
  }

  function playNext() {
    clearNext();

    if (!playlist.length) {
      showLogoFallback();
      setMediaStatus("No media found (manifest empty)");
      return;
    }

    var item = playlist[idx];
    idx = (idx + 1) % playlist.length;

    if (!item || !item.type || !item.src) {
      scheduleNext(600);
      return;
    }

    // Non-synced fallback path (kept), but we still try to keep it smooth.
    if (item.type === "image") return playImage(item.src, itemDurationMs(item), itemDurationMs(item));
    if (item.type === "video") return playVideo(item.src, 0, itemDurationMs(item));

    scheduleNext(600);
  }

  function loadManifest(silent) {
    // Only cache-bust the MANIFEST (not media files) to keep data low and caching high.
    xhr(MANIFEST_URL + "?ts=" + Date.now(), function (err, res) {
      if (err) {
        if (!silent) setMediaStatus("Manifest offline (" + err + ")");
        showLogoFallback();
        return;
      }
      try {
        var j = JSON.parse(res);
        var items = (j && j.items) ? j.items : [];
        playlist = items || [];

        if (!playlist.length) {
          showLogoFallback();
          setMediaStatus("No media found (manifest empty)");
          return;
        }

        // Always (re)start synced playback when manifest loads (first load or manual refresh)
        if (!silent) {
          startSyncedPlayback();
        }
      } catch (e) {
        if (!silent) setMediaStatus("Manifest JSON error");
        showLogoFallback();
      }
    });
  }

  // Start media
  showLogoFallback();
  loadManifest(false);

  // Refresh manifest (rare, data-saving)
  setInterval(function () { loadManifest(true); }, MANIFEST_REFRESH_MS);

  // Periodic re-sync across TVs (keeps everyone aligned even with drift)
  function startResyncLoop() {
    if (resyncTimer) clearInterval(resyncTimer);
    resyncTimer = setInterval(function () {
      // Don’t re-download manifest; just re-sync playback timing.
      startSyncedPlayback();
    }, RESYNC_MEDIA_MS);
  }
  startResyncLoop();

  // ===== TABLES (LIVE) =====
  var CSV_PROGRESS =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";

  var CSV_REVISIT =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=1236474828&single=true&output=csv";

  var progressBody = document.getElementById("progressBody");
  var revisitBody = document.getElementById("revisitBody");
  var boardMeta = document.getElementById("boardMeta");
  var revisitMeta = document.getElementById("revisitMeta");

  var progressData = [];
  var revisitData = [];
  var progressPage = 0;
  var revisitPage = 0;

  var PROGRESS_ROWS_PER_PAGE = 9;
  var REVISIT_ROWS_PER_PAGE = 9;
  var PAGE_SWITCH_MS = 4000;

  var progressTimer = null;
  var revisitTimer = null;

  function stopPaging() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    if (revisitTimer) { clearInterval(revisitTimer); revisitTimer = null; }
  }

  function renderProgress() {
    if (!progressBody) return;

    if (!progressData.length) {
      progressBody.innerHTML =
        '<tr><td colspan="5" class="muted">No cars in progress</td></tr>';
      if (boardMeta) boardMeta.textContent = "Live · 0";
      return;
    }

    var pages = Math.ceil(progressData.length / PROGRESS_ROWS_PER_PAGE);
    if (progressPage >= pages) progressPage = 0;

    var start = progressPage * PROGRESS_ROWS_PER_PAGE;
    var slice = progressData.slice(start, start + PROGRESS_ROWS_PER_PAGE);

    var html = "";
    for (var i = 0; i < slice.length; i++) {
      var r = slice[i];
      html +=
        "<tr>" +
        "<td>" + esc(r.customer) + "</td>" +
        "<td>" + esc(r.model) + "</td>" +
        "<td>" + esc(r.year) + "</td>" +
        "<td>" + esc(r.chassis) + "</td>" +
        "<td>" + esc(r.film) + "</td>" +
        "</tr>";
    }

    progressBody.innerHTML = html;
    if (boardMeta)
      boardMeta.textContent =
        "Live · " + progressData.length + " · Page " + (progressPage + 1) + "/" + pages;

    progressPage++;
  }

  function renderRevisit() {
    if (!revisitBody) return;

    if (!revisitData.length) {
      revisitBody.innerHTML =
        '<tr><td colspan="4" class="muted">No bookings today</td></tr>';
      if (revisitMeta) revisitMeta.textContent = "Live · 0";
      return;
    }

    var pages = Math.ceil(revisitData.length / REVISIT_ROWS_PER_PAGE);
    if (revisitPage >= pages) revisitPage = 0;

    var start = revisitPage * REVISIT_ROWS_PER_PAGE;
    var slice = revisitData.slice(start, start + REVISIT_ROWS_PER_PAGE);

    var html = "";
    for (var i = 0; i < slice.length; i++) {
      var r = slice[i];
      html +=
        "<tr>" +
        "<td>" + esc(r.status) + "</td>" +
        "<td>" + esc(r.name) + "</td>" +
        "<td>" + esc(r.car) + "</td>" +
        "<td>" + esc(r.color) + "</td>" +
        "</tr>";
    }

    revisitBody.innerHTML = html;
    if (revisitMeta)
      revisitMeta.textContent =
        "Live · " + revisitData.length + " · Page " + (revisitPage + 1) + "/" + pages;

    revisitPage++;
  }

  function startPaging() {
    stopPaging();
    renderProgress();
    renderRevisit();
    progressTimer = setInterval(renderProgress, PAGE_SWITCH_MS);
    revisitTimer = setInterval(renderRevisit, PAGE_SWITCH_MS);
  }

  function loadProgress() {
    if (boardMeta) boardMeta.textContent = "Updating…";
    xhr(CSV_PROGRESS + "&t=" + Date.now(), function (err, res) {
      if (err) {
        if (boardMeta) boardMeta.textContent = "Offline";
        return;
      }
      try {
        var rows = parseCSV(res).slice(1);
        var data = [];

        // PROGRESS: E,G,I,J,K => 4,6,8,9,10
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var customer = (r[4] || "").trim(); // E
          var model = (r[6] || "").trim();    // G
          var year = (r[8] || "").trim();     // I
          var chassis = (r[9] || "").trim();  // J
          var film = (r[10] || "").trim();    // K
          if (!customer) continue;
          data.push({ customer: customer, model: model, year: year, chassis: chassis, film: film });
        }

        if (!sameData(progressData, data)) {
          progressData = data;
          progressPage = 0;
          startPaging();
        }

      } catch (e) {
        if (boardMeta) boardMeta.textContent = "Error";
      }
    });
  }

  function loadRevisit() {
    if (revisitMeta) revisitMeta.textContent = "Updating…";
    xhr(CSV_REVISIT + "&t=" + Date.now(), function (err, res) {
      if (err) {
        if (revisitMeta) revisitMeta.textContent = "Offline";
        return;
      }
      try {
        var rows = parseCSV(res).slice(1);
        var data = [];

        // REVISIT: A,D,F,G => 0,3,5,6
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var status = (r[0] || "").trim(); // A
          var name = (r[3] || "").trim();   // D
          var car = (r[5] || "").trim();    // F
          var color = (r[6] || "").trim();  // G
          if (!name) continue;
          data.push({ status: status, name: name, car: car, color: color });
        }

        if (!sameData(revisitData, data)) {
          revisitData = data;
          revisitPage = 0;
          startPaging();
        }

      } catch (e) {
        if (revisitMeta) revisitMeta.textContent = "Error";
      }
    });
  }

  // Manual refresh
  var refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.onclick = function () {
      loadManifest(false);
      loadProgress();
      loadRevisit();
      // also immediate re-sync
      startSyncedPlayback();
    };
  }

  // Initial + Auto refresh (data-saving)
  loadProgress();
  loadRevisit();
  startPaging();

  setInterval(loadProgress, TABLE_REFRESH_MS);
  setInterval(loadRevisit, TABLE_REFRESH_MS);

  debug("Ready ✓");

})();
