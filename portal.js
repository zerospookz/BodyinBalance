import { collection, query, where, getDocs, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase.js";
import { escapeHtml, linkify } from "./utils.js";

const loginCard = document.getElementById("loginCard");
const main = document.getElementById("main");
const codeEl = document.getElementById("code");
const loginBtn = document.getElementById("loginBtn");
const err = document.getElementById("err");
const clientSub = document.getElementById("clientSub");

const daySel = document.getElementById("daySel");
const workoutList = document.getElementById("workoutList");
const foodList = document.getElementById("foodList");
const markWorkoutBtn = document.getElementById("markWorkoutBtn");
const markFoodBtn = document.getElementById("markFoodBtn");

let clientRef = null;
let clientData = null;

function showErr(msg){ err.style.display="block"; err.textContent=msg; }
function getParam(k){ return new URLSearchParams(location.search).get(k); }

function getStoredCode(){
  return (localStorage.getItem("lastPortalCode") || "").trim().toUpperCase();
}
function setStoredCode(code){
  if(code) localStorage.setItem("lastPortalCode", String(code).trim().toUpperCase());
}

async function loginWithCode(code){
  setStoredCode(code);
  err.style.display="none";
  const q = query(collection(db,"clients"), where("code","==",code));
  const snap = await getDocs(q);
  if(snap.empty) return showErr("Невалиден код.");
  const d = snap.docs[0];
  clientRef = doc(db,"clients", d.id);
  onSnapshot(clientRef, (s)=>{
    clientData = s.data();
    clientSub.textContent = (clientData?.name ? `Клиент: ${clientData.name}` : "Клиент");
    render();
  });
  loginCard.style.display="none";
  main.style.display="grid";
}

function render(){
  const day = daySel.value;
  workoutList.innerHTML="";
  foodList.innerHTML="";
  if(!clientData) return;

  const w = (clientData.plan?.[day]||[]);
  const n = (clientData.nutrition?.[day]||[]);

  w.forEach(ex=>{
    const el=document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div>
        <div class="title">${escapeHtml(ex.name)} ${ex.completed?'<span class="pill">✅</span>':''}</div>
        <div class="meta">
          ${ex.sets?`<span class="pill">${escapeHtml(ex.sets)} серии</span>`:""}
          ${ex.reps?`<span class="pill">${escapeHtml(ex.reps)} повт</span>`:""}
          ${ex.rest?`<span class="pill">⏱ ${escapeHtml(ex.rest)}</span>`:""}
        </div>
        ${ex.note?`<div class="note">${linkify(escapeHtml(ex.note))}</div>`:""}
      </div>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" data-id="${ex.id}">${ex.completed?'↩':'✓'}</button>
      </div>
    `;
    el.querySelector("button").onclick = async ()=>{
      ex.completed = !ex.completed;
      ex.completedAt = ex.completed ? new Date().toLocaleString() : null;
      await updateDoc(clientRef, { plan: clientData.plan });
    };
    workoutList.appendChild(el);
  });

  n.forEach(m=>{
    const el=document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div>
        <div class="title">${escapeHtml(m.title)}${m.time?` <span class="muted" style="font-weight:700">${escapeHtml(m.time)}</span>`:""}</div>
        <div class="meta">
          ${m.kcal!=="" && m.kcal!=null ? `<span class="pill">🔥 ${escapeHtml(String(m.kcal))} kcal</span>`:""}
          ${m.p!=="" && m.p!=null ? `<span class="pill">P ${escapeHtml(String(m.p))}g</span>`:""}
          ${m.c!=="" && m.c!=null ? `<span class="pill">C ${escapeHtml(String(m.c))}g</span>`:""}
          ${m.f!=="" && m.f!=null ? `<span class="pill">F ${escapeHtml(String(m.f))}g</span>`:""}
          ${m.tag?`<span class="pill">#${escapeHtml(m.tag)}</span>`:""}
        </div>
        ${m.desc?`<div class="note">${linkify(escapeHtml(m.desc))}</div>`:""}
      </div>
    `;
    foodList.appendChild(el);
  });
}

daySel.onchange = render;

markWorkoutBtn.onclick = async ()=>{
  if(!clientData) return;
  const day = daySel.value;
  clientData.workoutStatus ||= {};
  clientData.workoutStatus[day] = { done:true, doneAt:new Date().toLocaleString() };
  await updateDoc(clientRef, { workoutStatus: clientData.workoutStatus });
};

markFoodBtn.onclick = async ()=>{
  if(!clientData) return;
  const day = daySel.value;
  clientData.foodStatus ||= {};
  clientData.foodStatus[day] = { done:true, doneAt:new Date().toLocaleString() };
  await updateDoc(clientRef, { foodStatus: clientData.foodStatus });
};

loginBtn.onclick = ()=>{
  const code = (codeEl.value||"").trim().toUpperCase();
  if(!code) return showErr("Въведи код.");
  loginWithCode(code);
};
codeEl.addEventListener("keydown", e=>{ if(e.key==="Enter") loginBtn.click(); });

const pre = ((getParam("code")||"") || getStoredCode()).trim().toUpperCase();
if(pre){
  codeEl.value = pre;
  loginWithCode(pre);
}
