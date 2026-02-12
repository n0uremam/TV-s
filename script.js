/* =========================
   TABLES — TV SAFE (NO SCROLL)
   We paginate rows instead of scrolling.
========================= */
var CSV_PROGRESS =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";

var CSV_REVISIT =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=1236474828&single=true&output=csv";

var progressBody = document.getElementById("progressBody");
var revisitBody  = document.getElementById("revisitBody");
var boardMeta    = document.getElementById("boardMeta");
var revisitMeta  = document.getElementById("revisitMeta");

var progressData = []; // array of {customer, model, year, chassis, film}
var revisitData  = []; // array of {status, name, car, color}

var progressPage = 0;
var revisitPage  = 0;

var progressPagerTimer = null;
var revisitPagerTimer  = null;

/* Tune these for TV */
var PROGRESS_ROWS_PER_PAGE = 10;
var REVISIT_ROWS_PER_PAGE  = 8;
var PAGE_SWITCH_MS         = 4000; // switch page every 4 seconds

function clearPagerTimers(){
  if (progressPagerTimer) { clearInterval(progressPagerTimer); progressPagerTimer = null; }
  if (revisitPagerTimer)  { clearInterval(revisitPagerTimer);  revisitPagerTimer  = null; }
}

function renderProgressPage(){
  if (!progressBody) return;

  if (!progressData.length){
    progressBody.innerHTML = '<tr><td colspan="5" class="muted">No cars in progress</td></tr>';
    if (boardMeta) boardMeta.textContent = "Live · 0";
    return;
  }

  var totalPages = Math.ceil(progressData.length / PROGRESS_ROWS_PER_PAGE);
  if (progressPage >= totalPages) progressPage = 0;

  var start = progressPage * PROGRESS_ROWS_PER_PAGE;
  var end   = start + PROGRESS_ROWS_PER_PAGE;
  var slice = progressData.slice(start, end);

  var html = "";
  for (var i=0;i<slice.length;i++){
    var r = slice[i];
    html += "<tr>"
      + "<td>"+esc(r.customer)+"</td>"
      + "<td>"+esc(r.model)+"</td>"
      + "<td>"+esc(r.year)+"</td>"
      + "<td>"+esc(r.chassis)+"</td>"
      + "<td>"+esc(r.film)+"</td>"
      + "</tr>";
  }

  progressBody.innerHTML = html;

  // show page counter for staff clarity
  if (boardMeta) boardMeta.textContent = "Live · " + progressData.length + " · Page " + (progressPage+1) + "/" + totalPages;

  progressPage++;
}

function renderRevisitPage(){
  if (!revisitBody) return;

  if (!revisitData.length){
    revisitBody.innerHTML = '<tr><td colspan="4" class="muted">No bookings today</td></tr>';
    if (revisitMeta) revisitMeta.textContent = "Live · 0";
    return;
  }

  var totalPages = Math.ceil(revisitData.length / REVISIT_ROWS_PER_PAGE);
  if (revisitPage >= totalPages) revisitPage = 0;

  var start = revisitPage * REVISIT_ROWS_PER_PAGE;
  var end   = start + REVISIT_ROWS_PER_PAGE;
  var slice = revisitData.slice(start, end);

  var html = "";
  for (var i=0;i<slice.length;i++){
    var r = slice[i];
    html += "<tr>"
      + "<td>"+esc(r.status)+"</td>"
      + "<td>"+esc(r.name)+"</td>"
      + "<td>"+esc(r.car)+"</td>"
      + "<td>"+esc(r.color)+"</td>"
      + "</tr>";
  }

  revisitBody.innerHTML = html;

  if (revisitMeta) revisitMeta.textContent = "Live · " + revisitData.length + " · Page " + (revisitPage+1) + "/" + totalPages;

  revisitPage++;
}

function startPagers(){
  clearPagerTimers();
  // render immediately
  renderProgressPage();
  renderRevisitPage();
  // rotate pages
  progressPagerTimer = setInterval(renderProgressPage, PAGE_SWITCH_MS);
  revisitPagerTimer  = setInterval(renderRevisitPage,  PAGE_SWITCH_MS);
}

function loadProgress(){
  if (boardMeta) boardMeta.textContent = "Loading…";
  if (progressBody) progressBody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';

  xhr(CSV_PROGRESS + "&t=" + Date.now(), function(err, res){
    if (err){
      progressData = [];
      if (progressBody) progressBody.innerHTML = '<tr><td colspan="5" class="muted">Offline</td></tr>';
      if (boardMeta) boardMeta.textContent = "Offline";
      return;
    }

    try{
      var rows = parseCSV(res).slice(1);
      var data = [];

      for (var i=0;i<rows.length;i++){
        var r = rows[i];
        var customer = (r[4]  || "").trim(); // E
        var model    = (r[6]  || "").trim(); // G
        var year     = (r[8]  || "").trim(); // I
        var chassis  = (r[9]  || "").trim(); // J
        var film     = (r[10] || "").trim(); // K

        if (!customer) continue;

        data.push({
          customer: customer,
          model: model,
          year: year,
          chassis: chassis,
          film: film
        });
      }

      progressData = data;
      progressPage = 0; // restart paging when data updates
      startPagers();

    }catch(e){
      progressData = [];
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
      revisitData = [];
      if (revisitBody) revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Offline</td></tr>';
      if (revisitMeta) revisitMeta.textContent = "Offline";
      return;
    }

    try{
      var rows = parseCSV(res).slice(1);
      var data = [];

      for (var i=0;i<rows.length;i++){
        var r = rows[i];
        var status = (r[0] || "").trim(); // A
        var name   = (r[3] || "").trim(); // D
        var car    = (r[5] || "").trim(); // F
        var color  = (r[6] || "").trim(); // G

        if (!name) continue;

        data.push({
          status: status,
          name: name,
          car: car,
          color: color
        });
      }

      revisitData = data;
      revisitPage = 0;
      startPagers();

    }catch(e){
      revisitData = [];
      if (revisitBody) revisitBody.innerHTML = '<tr><td colspan="4" class="muted">Error</td></tr>';
      if (revisitMeta) revisitMeta.textContent = "Error";
    }
  });
}

var refreshBtn = document.getElementById("refreshBtn");
if (refreshBtn) refreshBtn.onclick = function(){ loadProgress(); loadRevisit(); };

// Initial load
loadProgress();
loadRevisit();

// Refresh from Google Sheets every 30s
setInterval(loadProgress, 100000);
setInterval(loadRevisit, 100000);

// If data is already there, start pager anyway
setTimeout(startPagers, 1500);
