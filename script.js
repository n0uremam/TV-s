const mediaFrame = document.getElementById("mediaFrame");
const overlayBranch = document.getElementById("overlayBranch");
const branchLabel = document.getElementById("branchLabel");
const branchSelect = document.getElementById("branchSelect");
const muteBtn = document.getElementById("muteBtn");
const countdownEl = document.getElementById("countdown");
const progressBody = document.getElementById("progressBody");
const boardMeta = document.getElementById("boardMeta");

let muted = true;
let playlist = [];
let index = 0;
let timer = null;
let countdownTimer = null;

const MANIFEST_URL = `media/shared/manifest.json`;
const BASE = `media/shared/`;

/* ---------------- MEDIA ---------------- */

function clearTimers(){
  clearTimeout(timer);
  clearInterval(countdownTimer);
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

async function loadManifest(){
  try{
    const r = await fetch(`${MANIFEST_URL}?t=${Date.now()}`,{cache:"no-store"});
    const j = await r.json();
    playlist = j.items.map(it=>({...it,src:BASE+it.src}));
    shuffle(playlist);
    play();
  }catch{
    mediaFrame.innerHTML="<div style='color:#aaa;display:flex;align-items:center;justify-content:center;height:100%'>No media</div>";
  }
}

function startCountdown(sec){
  clearInterval(countdownTimer);
  let s=sec;
  countdownEl.textContent=s;
  countdownTimer=setInterval(()=>{
    s--; countdownEl.textContent=Math.max(s,0);
    if(s<=0) clearInterval(countdownTimer);
  },1000);
}

function next(){
  index=(index+1)%playlist.length;
  if(index===0) shuffle(playlist);
  play();
}

function play(){
  clearTimers();
  const item=playlist[index];
  mediaFrame.innerHTML="";

  if(item.type==="image"){
    const img=new Image();
    img.src=item.src;
    mediaFrame.appendChild(img);
    startCountdown(item.duration||6);
    timer=setTimeout(next,(item.duration||6)*1000);
  }else{
    const v=document.createElement("video");
    v.src=item.src;
    v.autoplay=true;
    v.muted=muted;
    v.playsInline=true;
    v.onloadedmetadata=()=>startCountdown(Math.ceil(v.duration||8));
    v.onended=next;
    mediaFrame.appendChild(v);
  }
}

/* ---------------- TIME / DATE ---------------- */

function tickCairo(){
  const now=new Date();
  document.getElementById("timeCairo").textContent=
    new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(now);
  document.getElementById("dateCairo").textContent=
    new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",weekday:"short",day:"2-digit",month:"short",year:"numeric"}).format(now);
}
setInterval(tickCairo,1000);
tickCairo();

/* ---------------- WEATHER ---------------- */

async function loadWeather(){
  const r=await fetch("https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m");
  const j=await r.json();
  document.getElementById("weatherCairo").textContent=Math.round(j.current.temperature_2m)+"°C";
}
loadWeather();
setInterval(loadWeather,600000);

/* ---------------- EVENTS ---------------- */

muteBtn.onclick=()=>{
  muted=!muted;
  muteBtn.textContent=muted?"Muted":"Sound On";
};

branchSelect.onchange=()=>{
  const label=branchSelect.selectedOptions[0].text;
  overlayBranch.textContent=label;
  branchLabel.textContent=`${label} Branch • Waiting Room Display`;
};

/* ---------------- AUTO REFRESH (5 HOURS) ---------------- */

setTimeout(()=>location.reload(),5*60*60*1000);

/* ---------------- INIT ---------------- */

loadManifest();
