(function(){

const CSV_URL =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";

const progressBody = document.getElementById("progressBody");
const boardMeta = document.getElementById("boardMeta");
const refreshBtn = document.getElementById("refreshBtn");

/* XHR (TV safe) */
function xhr(url, cb){
  const r = new XMLHttpRequest();
  r.open("GET", url, true);
  r.timeout = 12000;
  r.onload = () => r.status>=200 ? cb(null,r.responseText) : cb("error");
  r.onerror = r.ontimeout = () => cb("error");
  r.send();
}

function esc(s){
  return (s||"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));
}

/* CSV parser */
function parseCSV(t){
  const rows=[],row=[];
  let cur="",q=false;
  for(let i=0;i<t.length;i++){
    const c=t[i],n=t[i+1];
    if(c=='"'&&q&&n=='"'){cur+='"';i++}
    else if(c=='"'){q=!q}
    else if(c==","&&!q){row.push(cur);cur=""}
    else if((c=="\n"||c=="\r")&&!q){
      if(cur||row.length){row.push(cur);rows.push(row.slice())}
      row.length=0;cur="";
    } else cur+=c;
  }
  if(cur||row.length){row.push(cur);rows.push(row)}
  return rows;
}

/* Load Progress */
function loadProgress(){
  progressBody.innerHTML='<tr><td colspan="5" class="muted">Loading…</td></tr>';
  boardMeta.textContent="Loading…";

  xhr(CSV_URL+"&t="+Date.now(),(e,res)=>{
    if(e){
      progressBody.innerHTML='<tr><td colspan="5" class="muted">Offline</td></tr>';
      boardMeta.textContent="Offline";
      return;
    }

    const rows=parseCSV(res).slice(1);
    let html="",count=0;

    rows.forEach(r=>{
      const customer=r[4];     // E
      const model=r[6];        // G
      const year=r[8];         // I
      const chassis=r[9];      // J
      const film=r[10];        // K
      if(!customer) return;
      count++;
      html+=`
      <tr>
        <td>${esc(customer)}</td>
        <td>${esc(model)}</td>
        <td>${esc(year)}</td>
        <td>${esc(chassis)}</td>
        <td>${esc(film)}</td>
      </tr>`;
    });

    if(!html){
      progressBody.innerHTML='<tr><td colspan="5" class="muted">No cars in progress</td></tr>';
      boardMeta.textContent="Live · 0";
      return;
    }

    progressBody.innerHTML=html;
    boardMeta.textContent="Live · "+count;
  });
}

refreshBtn.onclick=loadProgress;
setInterval(loadProgress,30000);
loadProgress();

/* Time + Date */
setInterval(()=>{
  const d=new Date();
  const pad=n=>n<10?"0"+n:n;
  document.getElementById("timeLocal").textContent=
    pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());
  document.getElementById("dateLocal").textContent=
    d.toDateString();
},1000);

/* Weather Cairo */
xhr("https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m",
(e,res)=>{
  if(e) return;
  const t=JSON.parse(res).current.temperature_2m;
  document.getElementById("weatherCairo").textContent=Math.round(t)+"°C";
});

})();
