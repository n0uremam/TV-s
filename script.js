// script.js (UPDATED)
// Goals:
// ✅ Remove black screen between video <-> image (keep last frame/image visible under video)
// ✅ Smooth cross-fade images (already 2 layers)
// ✅ Sync media timing across TVs using server Date header
// ✅ Data-saving (no cache-busting for media files, only manifest / tables)
// ✅ Keep UI clean (hide “Loading/Buffering” spam)

(function () {
  "use strict";

  /* =========================
     HELPERS
  ========================== */
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
    r.onerror = r.ontimeout = function () { cb("NETWORK/TIMEOUT", null, r); };
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
    var rows = [], row = [];
    var cur = "", q = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i], n = t[i + 1];
      if (c == '"' && q && n == '"') { cur += '"'; i++; }
      else if (c == '"') { q = !q; }
      else if (c == "," && !q) { row.push(cur); cur = ""; }
      else if ((c == "\n" || c == "\r") && !q) {
        if (cur || row.length) { row.push(cur); rows.push(row.slice()); }
        row.length = 0; cur = "";
      } else { cur += c; }
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  function sameData(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* =========================
     CLOCK
  ========================== */
  function tickClock() {
    var d = new Date();
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    var timeEl = document.getElementById("timeLocal");
    var dateEl = document.getElementById("dateLocal");
    if (timeEl) timeEl.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    if (dateEl) dateEl.textContent = d.toDateString();
  }
  setInterval(tickClock, 1000);
  tickClock();

  /* =========================
     WEATHER (Cairo)
  ========================== */
  function loadWeather() {
    var el = document.getElementById("weatherCairo");
    if (!el) return;
    var url = "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m";
    xhr(url + "&t=" + Date.now(), function (err, res) {
      if (err) { el.textContent = "--"; return; }
      try {
        var j = JSON.parse(res);
        el.textContent = Math.round(j.current.temperature_2m) + "°C";
      } catch (e) { el.textContent = "--"; }
    });
  }
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);

  /* =========================
     DATA-SAVING SETTINGS
  ========================== */
  var TABLE_REFRESH_MS = 5 * 60 * 1000;           // tables refresh every 5 min
  var MANIFEST_REFRESH_MS = 3 * 60 * 60 * 1000;   // manifest refresh every 3 hours
  var RESYNC_MEDIA_MS = 10 * 60 * 1000;           // re-sync playback every 10 min

  /* =========================
     MEDIA PLAYER (Vercel)
  ========================== */
  var MEDIA_PATH = "/media/shared/";
  var MANIFEST_URL = MEDIA_PATH + "manifest.json";

  var frame = document.getElementById("mediaFrame");
  var statusEl = document.getElementById("mediaStatus");
  var logoFallback = document.getElementById("mediaLogoFallback");

  function mediaUrl(src) { return MEDIA_PATH + src; }

  function setMediaStatus(t) {
    // Only show critical messages (no “Loading/Buffering” spam)
    if (!statusEl) return;
    if (!t) { statusEl.textContent = ""; return; }
    var s = String(t).toLowerCase();
    if (s.indexOf("offline") >= 0 || s.indexOf("error") >= 0 || s.indexOf("failed") >= 0 || s.indexOf("timeout") >= 0) {
      statusEl.textContent = t;
    } else {
      statusEl.textContent = "";
    }
  }

  function showLogoFallback() { if (logoFallback) logoFallback.style.opacity = "1"; }
  function hideLogoFallback() { if (logoFallback) logoFallback.style.opacity = "0"; }

  var playlist = [];
  var idx = 0;
  var nextTimer = null;
  var resyncTimer = null;

  function clearNext() { if (nextTimer) { clearTimeout(nextTimer); nextTimer = null; } }
  function scheduleNext(ms) { clearNext(); nextTimer = setTimeout(playNext, ms); }

  // --- keep last image visible under video (this is the MAIN black-screen fix) ---
  function keepLastImageVisible() {
    // Ensure one image layer is visible (top layer) so if video disappears there is NO black gap.
    var front = topImg();
    var back = backImg();

    if (front && front.src) front.style.opacity = "1";
    else if (back && back.src) back.style.opacity = "1";
  }

  function removeVideo() {
    if (!frame) return;
    var vids = frame.getElementsByTagName("video");
    if (vids && vids[0]) {
      var v = vids[0];
      try { v.pause(); } catch (_) {}
      try { v.removeAttribute("src"); } catch (_) {}
      try { v.load(); } catch (_) {}
      if (v.parentNode) v.parentNode.removeChild(v);
    }
    // After removing video, show image instantly
    keepLastImageVisible();
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
    img.style.objectFit = "contain";
    img.style.background = "#000";
    img.style.opacity = "0";
    img.style.transition = "opacity 650ms ease";
    img.style.willChange = "opacity";
    // IMPORTANT: keep images above black background but BELOW video
    img.style.zIndex = "1";
    frame.appendChild(img);
    return img;
  }

  var imgA = ensureImageLayer("mediaImgA");
  var imgB = ensureImageLayer("mediaImgB");
  var imgAOnTop = true;
  function topImg() { return imgAOnTop ? imgA : imgB; }
  function backImg() { return imgAOnTop ? imgB : imgA; }

  // --- Sync support (server time) ---
  var serverSkewMs = 0;

  function getServerNow(cb) {
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

  // Video durations for SYNC (seconds)
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

    // Optional extras (kept from your list)
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
      return 30000; // fallback
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
    return { index: 0, offsetMs: 0, remainingMs: timeline.tl[0].durMs, timeline: timeline };
  }

  // --- Image swap (NO BLANKING while loading) ---
  function swapToImage(src, onReady) {
    var back = backImg();
    var front = topImg();

    // Keep current image visible while next loads (prevents black screen)
    if (front && front.src) front.style.opacity = "1";

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

      // Fade in new image, fade out old
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
    // DO NOT remove video until image is ready, otherwise you create black gap.
    // But we must stop audio/video decode eventually; so:
    // - Keep the video playing until image loads (image layers are under it)
    // - When image is ready, remove video.
    var remain = (typeof remainMsOverride === "number") ? remainMsOverride : durationMs;
    remain = Math.max(700, remain);

    hideLogoFallback();
    setMediaStatus(""); // silent

    swapToImage(src, function (ok) {
      if (!ok) {
        // if failed, remove video anyway (fallback)
        removeVideo();
        scheduleNext(900);
        return;
      }
      // Now image is visible; safe to remove video with ZERO black frame
      removeVideo();
      scheduleNext(remain);
    });
  }

  // --- Video: put video ABOVE images so images are always there under it ---
  function playVideo(src, offsetMs, remainMs) {
    hideLogoFallback();

    // Keep last image visible under the video (no black)
    keepLastImageVisible();

    // Remove any previous video, then create new
    removeVideo();

    var v = document.createElement("video");
    v.src = mediaUrl(src);
    v.autoplay = true;
    v.muted = true;          // TV autoplay reliable
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
    v.style.objectFit = "cover";
    v.style.background = "transparent";
    v.style.zIndex = "5"; // above images

    frame.appendChild(v);

    var started = false;
    var lastT = -1;
    var stallAt = Date.now();

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
      if (msg) setMediaStatus(msg);
      removeVideo();
      showLogoFallback();
      scheduleNext(1200);
    }

    v.onloadedmetadata = function () {
      try {
        if (typeof offsetMs === "number" && isFinite(offsetMs) && offsetMs > 0) {
          var offsetSec = offsetMs / 1000;
          if (v.duration && isFinite(v.duration) && offsetSec >= v.duration - 0.8) {
            failVideo("Video offset near end, skipping…");
            return;
          }
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
      if (Date.now() - stallAt > 45000) {
        failVideo("Video froze, skipping…");
      }

      // Sync-based end timer (avoid long tail buffering / black)
      if (typeof remainMs === "number" && remainMs > 0 && !v.__scheduledEnd) {
        v.__scheduledEnd = true;
        setTimeout(function () {
          // We don't want a black screen—keep images underneath visible
          keepLastImageVisible();
          // Remove video and move on
          removeVideo();
          scheduleNext(600);
        }, Math.max(1200, remainMs));
      }
    };

    v.onended = function () {
      clearTimeout(firstFrameTimer);
      keepLastImageVisible();
      removeVideo();
      scheduleNext(600);
    };

    v.onerror = function () {
      failVideo("Video error, skipping…");
    };

    // Don’t show Buffering; watchdog handles it silently
    v.onwaiting = function () {};

    try {
      var p = v.play();
      if (p && p.catch) p.catch(function () { failVideo("Autoplay blocked"); });
    } catch (e) {
      failVideo("Play failed");
    }
  }

  /* =========================
     SYNCED PLAYBACK
  ========================== */
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

      // Next index based on timeline (keeps all TVs aligned)
      var nextIndexInTimeline = (st.index + 1) % st.timeline.tl.length;
      idx = nextIndexInTimeline;

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

    var dur = itemDurationMs(item);
    if (item.type === "image") return playImage(item.src, dur, dur);
    if (item.type === "video") return playVideo(item.src, 0, dur);

    scheduleNext(600);
  }

  function loadManifest(silent) {
    // Only cache-bust MANIFEST, not media files
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

        // Start synced playback (first load & manual refresh)
        if (!silent) startSyncedPlayback();
      } catch (e) {
        if (!silent) setMediaStatus("Manifest JSON error");
        showLogoFallback();
      }
    });
  }

  // Start media
  showLogoFallback();
  loadManifest(false);

  setInterval(function () { loadManifest(true); }, MANIFEST_REFRESH_MS);

  function startResyncLoop() {
    if (resyncTimer) clearInterval(resyncTimer);
    resyncTimer = setInterval(function () {
      startSyncedPlayback();
    }, RESYNC_MEDIA_MS);
  }
  startResyncLoop();

  /* =========================
     TABLES (LIVE, DATA-SAVING)
  ========================== */
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
      progressBody.innerHTML = '<tr><td colspan="5" class="muted">No cars in progress</td></tr>';
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
      html += "<tr>"
        + "<td>" + esc(r.customer) + "</td>"
        + "<td>" + esc(r.model) + "</td>"
        + "<td>" + esc(r.year) + "</td>"
        + "<td>" + esc(r.chassis) + "</td>"
        + "<td>" + esc(r.film) + "</td>"
        + "</tr>";
    }

    progressBody.innerHTML = html;
    if (boardMeta) boardMeta.textContent = "Live · " + progressData.length + " · Page " + (progressPage + 1) + "/" + pages;

    progressPage++;
  }

  function renderRevisit() {
    if (!revisitBody) return;

    if (!revisitData.length) {
      revisitBody.innerHTML = '<tr><td colspan="4" class="muted">No bookings today</td></tr>';
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
      html += "<tr>"
        + "<td>" + esc(r.status) + "</td>"
        + "<td>" + esc(r.name) + "</td>"
        + "<td>" + esc(r.car) + "</td>"
        + "<td>" + esc(r.color) + "</td>"
        + "</tr>";
    }

    revisitBody.innerHTML = html;
    if (revisitMeta) revisitMeta.textContent = "Live · " + revisitData.length + " · Page " + (revisitPage + 1) + "/" + pages;

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
      if (err) { if (boardMeta) boardMeta.textContent = "Offline"; return; }
      try {
        var rows = parseCSV(res).slice(1);
        var data = [];

        // PROGRESS: E,G,I,J,K => 4,6,8,9,10
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var customer = (r[4] || "").trim();
          var model = (r[6] || "").trim();
          var year = (r[8] || "").trim();
          var chassis = (r[9] || "").trim();
          var film = (r[10] || "").trim();
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
      if (err) { if (revisitMeta) revisitMeta.textContent = "Offline"; return; }
      try {
        var rows = parseCSV(res).slice(1);
        var data = [];

        // REVISIT: A,D,F,G => 0,3,5,6
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var status = (r[0] || "").trim();
          var name = (r[3] || "").trim();
          var car = (r[5] || "").trim();
          var color = (r[6] || "").trim();
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
      startSyncedPlayback();
    };
  }

  // Initial + Auto refresh
  loadProgress();
  loadRevisit();
  startPaging();

  setInterval(loadProgress, TABLE_REFRESH_MS);
  setInterval(loadRevisit, TABLE_REFRESH_MS);

  debug("Ready ✓");
})();
