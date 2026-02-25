import {
  initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"; import {   getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp, onSnapshot, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

/**
 * Single-page app:
 * - Admin (email/pass) manages clients + plan + nutrition + chat + photos + profile
 * - Client Portal (no auth) enters with code (portal.html redirects to index.html?portal=1&code=...)
 */

// ---------- Firebase init ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Ensure login survives refresh
await setPersistence(auth, browserLocalPersistence);

const db = getFirestore(app);
const storage = getStorage(app);

// ---------- Small helpers ----------
const $ = (id) => document.getElementById(id);
const qs = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function uid(len=10){
  const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s=""; for(let i=0;i<len;i++) s+=a[Math.floor(Math.random()*a.length)];
  return s;
}
function escapeHtml(str){
  return String(str??"")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}
function linkify(htmlEscaped){
  const urlRegex = /(\bhttps?:\/\/[^\s<>"']+)/gi;
  return String(htmlEscaped).replace(urlRegex, (url)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}
function normalizeDay(v){
  const s = String(v??"").trim().toLowerCase();
  const map = {
    "понеделник":"Понеделник","пн":"Понеделник","mon":"Понеделник","monday":"Понеделник","1":"Понеделник","day 1":"Понеделник",
    "вторник":"Вторник","вт":"Вторник","tue":"Вторник","tuesday":"Вторник","2":"Вторник","day 2":"Вторник",
    "сряда":"Сряда","ср":"Сряда","wed":"Сряда","wednesday":"Сряда","3":"Сряда","day 3":"Сряда",
    "четвъртък":"Четвъртък","чт":"Четвъртък","thu":"Четвъртък","thursday":"Четвъртък","4":"Четвъртък","day 4":"Четвъртък",
    "петък":"Петък","пт":"Петък","fri":"Петък","friday":"Петък","5":"Петък","day 5":"Петък",
    "събота":"Събота","сб":"Събота","sat":"Събота","saturday":"Събота","6":"Събота","day 6":"Събота",
    "неделя":"Неделя","нд":"Неделя","sun":"Неделя","sunday":"Неделя","7":"Неделя","0":"Неделя","day 7":"Неделя",
  };
  return map[s] || (s ? (s[0].toUpperCase()+s.slice(1)) : "Понеделник");
}
function openModal(title, body){
  alert(`${title}\n\n${body}`);
}
function showErr(where, e){
  const msg = e?.message || String(e||'Грешка');
  console.error(where, e);
  openModal('Грешка: ' + where, msg);
}
function getParam(k){ return new URLSearchParams(location.search).get(k); }
async function copyToClipboard(text){
  try{ await navigator.clipboard.writeText(text); }
  catch{ openModal("Copy", text); }
}

// ---------- DOM (Admin) ----------
const loginScreen = $("loginScreen");
const loginEmail = $("loginEmail");
const loginPass = $("loginPass");
const loginBtn = $("loginBtn");
const loginErr = $("loginErr");

const coachApp = $("coachApp");
const signOutBtn = $("signOutBtn"); // may be missing in index.html; fallback later

const clientName = $("clientName");
const addClientBtn = $("addClientBtn");
const clientsList = $("clientsList");

const activeTitle = $("activeTitle");
const activeMeta = $("activeMeta");

const tabs = qsa(".tab[data-tab]");
const panels = {
  chat: $("tab-chat"),
  plan: $("tab-plan"),
  nutrition: $("tab-nutrition"),
  photos: $("tab-photos"),
  profile: $("tab-profile"),
};

// Sidebar footer
const notifBtn = $("notifBtn");
const notifCount = $("notifCount");
const exportBtn = $("exportBtn");
const resetBtn = $("resetBtn");
const openPortalBtn = $("openPortalBtn");

// Chat
const chatBox = $("chatBox");
const msgFrom = $("msgFrom");
const msgText = $("msgText");
const sendMsgBtn = $("sendMsgBtn");
const clearChatBtn = $("clearChatBtn");

// Plan
const daySelect = $("daySelect");
const clearDayBtn = $("clearDayBtn");
const planDayTitle = $("planDayTitle");
const planList = $("planList");

const exName = $("exName");
const exSets = $("exSets");
const exReps = $("exReps");
const exRest = $("exRest");
const exNote = $("exNote");
const exAdminNote = $("exAdminNote");
const addExBtn = $("addExBtn");
const markDayDoneAdminBtn = $("markDayDoneAdminBtn");
const copyPlanBtn = $("copyPlanBtn");

// Workouts Excel
const excelFile = $("excelFile");
const importExcelBtn = $("importExcelBtn");
const openExcelFormatBtn = $("openExcelFormatBtn");
const programSelect = $("programSelect");
const applyProgramBtn = $("applyProgramBtn");
const applyProgramOverwriteBtn = $("applyProgramOverwriteBtn");

// Nutrition
const nDaySelect = $("nDaySelect");
const nClearDayBtn = $("nClearDayBtn");
const nutritionList = $("nutritionList");
const copyNutritionBtn = $("copyNutritionBtn");

const mealTitle = $("mealTitle");
const mealDesc = $("mealDesc");
const mealKcal = $("mealKcal");
const mealP = $("mealP");
const mealC = $("mealC");
const mealF = $("mealF");
const mealTime = $("mealTime");
const mealTag = $("mealTag");
const mealAdminNote = $("mealAdminNote");
const addMealBtn = $("addMealBtn");

// Nutrition Excel (new)
const nExcelFile = $("nExcelFile");
const nImportExcelBtn = $("nImportExcelBtn");
const nOpenExcelFormatBtn = $("nOpenExcelFormatBtn");
const nProgramSelect = $("nProgramSelect");
const nApplyProgramBtn = $("nApplyProgramBtn");
const nApplyProgramOverwriteBtn = $("nApplyProgramOverwriteBtn");

// Photos
const beforeFile = $("beforeFile");
const afterFile = $("afterFile");
const addBeforeBtn = $("addBeforeBtn");
const addAfterBtn = $("addAfterBtn");
const beforeGallery = $("beforeGallery");
const afterGallery = $("afterGallery");
const clearPhotosBtn = $("clearPhotosBtn");

// Profile
const goal = $("goal");
const weight = $("weight");
const height = $("height");
const freq = $("freq");
const limits = $("limits");

const payStatus = $("payStatus");
const packageName = $("packageName");
const packagePrice = $("packagePrice");

const genCodeBtn = $("genCodeBtn");
const copyPortalBtn = $("copyPortalBtn");
const accessCode = $("accessCode");
const inviteBtn = $("inviteBtn");
const togglePaidBtn = $("togglePaidBtn");
const saveProfileBtn = $("saveProfileBtn");
const profilePreview = $("profilePreview");

// ---------- DOM (Portal) ----------
const clientPortal = $("clientPortal");
const backToCoachBtn = $("backToCoachBtn");
const portalLogin = $("portalLogin");
const portalCode = $("portalCode");
const portalLoginBtn = $("portalLoginBtn");
const portalMain = $("portalMain");
const portalClientName = $("portalClientName");
const portalSub = $("portalSub");

const pTabs = qsa(".ptab[data-ptab]");
const pPanels = {
  pchat: $("ptab-pchat"),
  pplan: $("ptab-pplan"),
  pfood: $("ptab-pfood"),
  pphotos: $("ptab-pphotos"),
};

const pDaySelect = $("pDaySelect");
const pPlanList = $("pPlanList");
const pMarkDayDoneBtn = $("pMarkDayDoneBtn");
const pDayDoneHint = $("pDayDoneHint");

const pFoodDaySelect = $("pFoodDaySelect");
const pFoodList = $("pFoodList");
const pFoodDoneBtn = $("pFoodDoneBtn");
const pFoodHint = $("pFoodHint");

const pChatBox = $("pChatBox");
const pMsgText = $("pMsgText");
const pSendMsgBtn = $("pSendMsgBtn");

const pBeforeFile = $("pBeforeFile");
const pAfterFile = $("pAfterFile");
const pAddBeforeBtn = $("pAddBeforeBtn");
const pAddAfterBtn = $("pAddAfterBtn");
const pBeforeGallery = $("pBeforeGallery");
const pAfterGallery = $("pAfterGallery");

// ---------- State ----------
let activeClientId = null;
let activeClientUnsub = null;
let activeClient = null;
let chatUnsub = null;
let portalClientRef = null;
let portalClientUnsub = null;
let portalClient = null;

let workoutPrograms = loadLocal("workoutPrograms", {});
let nutritionPrograms = loadLocal("nutritionPrograms", {});

// ---------- Local storage helpers (presets only) ----------
function loadLocal(k, fallback){
  try{ return JSON.parse(localStorage.getItem(k) || "null") ?? fallback; }catch{ return fallback; }
}
function saveLocal(k, v){
  localStorage.setItem(k, JSON.stringify(v));
}
function setLocal(k,v){ localStorage.setItem(k, String(v)); }
function getLocal(k,fallback=""){ return localStorage.getItem(k) ?? fallback; }

// ---------- Auth ----------
function showLogin(show){
  if(!loginScreen) return;
  loginScreen.classList.toggle("hidden", !show);
}
loginBtn?.addEventListener("click", async ()=>{
  loginErr.textContent = "";
  try{
    await signInWithEmailAndPassword(auth, (loginEmail.value||"").trim(), loginPass.value||"");
  }catch(e){
    loginErr.textContent = e?.message || "Грешка при вход.";
  }
});

onAuthStateChanged(auth, async (user)=>{
  const portalMode = getParam("portal")==="1";
  if(portalMode){
    // Portal should work without exposing admin login; use anonymous auth so Firestore rules can require auth.
    try{
      if(!auth.currentUser){
        await signInAnonymously(auth);
      }
    }catch(e){
      showErr("Anonymous auth", e);
    }
    showPortalUI(true);
    showAdminUI(false);
    initPortalFromUrl();
    return;
  }

  // Admin mode (default): always show login first unless authenticated
  if(user){
    showLogin(false);
    showAdminUI(true);
    startClientsListener();
  }else{
    showAdminUI(false);
    showLogin(true);
  }
});
// signout (only if button exists in UI)
qsa("#signOutBtn").forEach(btn=>btn.addEventListener("click", ()=>signOut(auth)));

function showAdminUI(show){
  if(coachApp) coachApp.style.display = show ? "" : "none";
  if(clientPortal) clientPortal.classList.toggle("hidden", true);
}
function showPortalUI(show){
  if(clientPortal) clientPortal.classList.toggle("hidden", !show);
  if(coachApp) coachApp.style.display = show ? "none" : "";
}

// ---------- Tabs (Admin) ----------
function setTab(tab){
  setLocal('adminTab', tab);
  tabs.forEach(t=>t.classList.toggle("active", t.dataset.tab===tab));
  Object.entries(panels).forEach(([k, el])=>{
    if(!el) return;
    el.classList.toggle("hidden", k!==tab);
  });
}
tabs.forEach(t=>t.addEventListener("click", ()=> setTab(t.dataset.tab)));
setTab(getLocal("adminTab","chat"));

// ---------- Tabs (Portal) ----------
function setPTab(tab){
  setLocal('portalTab', tab);
  pTabs.forEach(t=>t.classList.toggle("active", t.dataset.ptab===tab));
  Object.entries(pPanels).forEach(([k, el])=>{
    if(!el) return;
    el.classList.toggle("hidden", k!==tab);
  });
}
pTabs.forEach(t=>t.addEventListener("click", ()=> setPTab(t.dataset.ptab)));
setPTab(getLocal("portalTab","pplan"));

// ---------- Clients list (Admin) ----------
function startClientsListener(){
  const q = query(collection(db,"clients"), orderBy("createdAt","desc"));
  onSnapshot(q, (snap)=>{
    clientsList.innerHTML = "";
    snap.forEach((d)=>{
      const c = { id:d.id, ...d.data() };
      const el = document.createElement("div");
      el.className = "client-row" + (activeClientId===c.id ? " active": "");
      el.innerHTML = `
        <div class="client-name">${escapeHtml(c.name||"")}</div>
        <div class="client-meta muted">Код: <b>${escapeHtml(c.accessCode||c.code||"")}</b></div>
      `;
      el.addEventListener("click", ()=> selectClient(c.id));
      clientsList.appendChild(el);
    });

    // restore previously selected client after refresh
    const remembered = getLocal('activeClientId','');
    if(remembered && !activeClientId){
      // only restore if exists in snapshot
      const exists = snap.docs.some(x=>x.id===remembered);
      if(exists) selectClient(remembered);
    }
  });
}

async function selectClient(clientId){
  activeClientId = clientId;
  setLocal('activeClientId', clientId);
  if(activeClientUnsub) activeClientUnsub();
  if(chatUnsub) chatUnsub();
  activeClient = null;

  const ref = doc(db,"clients", clientId);
  activeClientUnsub = onSnapshot(ref, (s)=>{
    activeClient = { id:s.id, ...s.data() };
    renderActiveHeader();
    renderAll();
  });

  // chat subcollection
  const chatQ = query(collection(db,"clients",clientId,"chat"), orderBy("createdAt","asc"), limit(200));
  chatUnsub = onSnapshot(chatQ, (snap)=>{
    renderChat(snap.docs.map(d=>({id:d.id, ...d.data()})));
  });
}

addClientBtn?.addEventListener("click", async ()=>{
  const name = (clientName.value||"").trim();
  if(!name) return;
  const accessCode = uid(6);
  try{ await addDoc(collection(db,"clients"), {
    name,
    accessCode,
    createdAt: serverTimestamp(),
    paidStatus: "unpaid",
    packageName: "",
    packagePrice: "",
    profile: { goal:"", weight:"", height:"", freq:"", limits:"" },
    plan: {},
    nutrition: {},
    workoutStatus: {},
    foodStatus: {},
    photos: { before:[], after:[] },
  }); }catch(e){ showErr('Добавяне на клиент', e); }
  clientName.value="";
});

function renderActiveHeader(){
  if(!activeTitle || !activeMeta) return;
  if(!activeClient){
    activeTitle.textContent = "Избери клиент";
    activeMeta.textContent = "Добави клиент отляво и кликни върху него.";
    return;
  }
  activeTitle.textContent = activeClient.name || "Клиент";
  const code = activeClient.accessCode || activeClient.code || "";
  activeMeta.innerHTML = `Код: <b>${escapeHtml(code)}</b> • Portal: <b>portal.html?code=${escapeHtml(code)}</b>`;
}

// ---------- Chat ----------
function renderChat(items){
  chatBox.innerHTML = "";
  items.forEach(m=>{
    const el = document.createElement("div");
    el.className = "msg " + (m.from==="coach" ? "me" : "them");
    el.innerHTML = `
      <div class="msg-meta muted">${escapeHtml(m.from||"")} • ${m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString("bg-BG",{hour12:false}) : ""}</div>
      <div class="msg-text">${linkify(escapeHtml(m.text||""))}</div>
    `;
    chatBox.appendChild(el);
  });
  chatBox.scrollTop = chatBox.scrollHeight;
}
sendMsgBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  const text = (msgText.value||"").trim();
  if(!text) return;
  await addDoc(collection(db,"clients",activeClientId,"chat"), {
    from: msgFrom.value || "coach",
    text,
    createdAt: serverTimestamp()
  });
  msgText.value="";
});
msgText?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") sendMsgBtn.click(); });
clearChatBtn?.addEventListener("click", async ()=>{
  openModal("Чат", "Изчистването на чат (subcollection) изисква backend/Cloud Function.\nЗасега можеш да игнорираш или да го изтриеш ръчно от Firebase Console.");
});

// ---------- Plan ----------
function renderPlan(){
  if(!activeClient){ planList.innerHTML=""; return; }
  const day = daySelect.value;
  if(planDayTitle) planDayTitle.textContent = day;
  const list = activeClient.plan?.[day] || [];
  planList.innerHTML = "";
  list.forEach((ex)=>{
    const el = document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div>
        <div class="title">${escapeHtml(ex.name||"")}</div>
        <div class="meta">
          ${ex.sets?`<span class="pill">${escapeHtml(ex.sets)} сер.</span>`:""}
          ${ex.reps?`<span class="pill">${escapeHtml(ex.reps)} повт.</span>`:""}
          ${ex.rest?`<span class="pill">⏱ ${escapeHtml(ex.rest)}</span>`:""}
        </div>
        ${ex.note?`<div class="note">${linkify(escapeHtml(ex.note))}</div>`:""}
      </div>
      <div class="row" style="justify-content:flex-end;gap:8px;">
        <button class="btn ghost" data-act="edit">✏</button>
        <button class="btn danger" data-act="del">🗑</button>
      </div>
    `;
    el.querySelector('[data-act="edit"]').addEventListener("click", async ()=>{
      const name = prompt("Упражнение", ex.name||"") ?? ex.name;
      ex.name = (name||"").trim() || ex.name;
await saveClientPatch({ plan: activeClient.plan });
    });
    el.querySelector('[data-act="del"]').addEventListener("click", async ()=>{
      const i = list.findIndex(x=>x.id===ex.id);
      if(i>=0) list.splice(i,1);
await saveClientPatch({ plan: activeClient.plan });
    });
    planList.appendChild(el);
  });
}
addExBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  const day = daySelect.value;
  const ex = {
    id: uid(10),
    name: (exName.value||"").trim(),
    sets: (exSets.value||"").toString().trim(),
    reps: (exReps.value||"").toString().trim(),
    rest: (exRest.value||"").toString().trim(),
    note: (exNote.value||"").trim(),
    adminNote: (exAdminNote.value||"").trim(),
    completed: false,
    completedAt: null,
  };
  if(!ex.name) return;
  activeClient.plan ||= {};
  activeClient.plan[day] ||= [];
  activeClient.plan[day].push(ex);
  await saveClientPatch({ plan: activeClient.plan });
  exName.value=""; exNote.value=""; exAdminNote.value="";
});
clearDayBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return;
  const day = daySelect.value;
  activeClient.plan ||= {};
  activeClient.plan[day] = [];
  await saveClientPatch({ plan: activeClient.plan });
});
copyPlanBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return;
  const from = daySelect.value;
  const to = prompt("Копирай плана към ден (Понеделник..Неделя):", from) || "";
  const toDay = normalizeDay(to);
  activeClient.plan ||= {};
  activeClient.plan[toDay] = JSON.parse(JSON.stringify(activeClient.plan[from] || []));
  await saveClientPatch({ plan: activeClient.plan });
});
markDayDoneAdminBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return;
  const day = daySelect.value;
  activeClient.workoutStatus ||= {};
  activeClient.workoutStatus[day] = { done:true, doneAt: new Date().toLocaleString("bg-BG",{hour12:false}) };
  await saveClientPatch({ workoutStatus: activeClient.workoutStatus });
});
daySelect?.addEventListener("change", (e)=>{ setLocal("daySelect", e.target.value); }); // persist
daySelect?.addEventListener("change", renderPlan);

// ---------- Workouts Excel import (program presets) ----------
function normalizeHeader(h){
  const x = String(h||"").trim().toLowerCase();
  const m = {
    program:["program","programme","програма","програми","режим","template","plan"],
    day:["day","ден","дни","weekday","ден от седмицата"],
    exercise:["exercise","movement","упражнение","упражнения","упр","ex"],
    sets:["sets","set","серии","серия","сер"],
    reps:["reps","rep","repetitions","повторения","повторение","повт"],
    rest:["rest","pause","break","почивка","пауза","рест"],
    note:["note","notes","бележка","бележки","коментар","comments"],
  };
  for(const [k, arr] of Object.entries(m)){
    if(arr.includes(x)) return k;
  }
  return "";
}
function mapRowKeys(row){
  const out = {};
  for(const [k,v] of Object.entries(row||{})){
    const nk = normalizeHeader(k);
    out[nk || k] = v;
  }
  return out;
}
function safeStr(v){ return String(v??"").trim(); }

function parseWorkoutPrograms(rows){
  const programs = {};
  for(const r0 of rows.map(mapRowKeys)){
    const prog = safeStr(r0.program) || "Default";
    const day = normalizeDay(r0.day);
    const exName = safeStr(r0.exercise);
    if(!exName) continue;
    programs[prog] ||= {};
    programs[prog][day] ||= [];
    programs[prog][day].push({
      id: uid(10),
      name: exName,
      sets: safeStr(r0.sets),
      reps: safeStr(r0.reps),
      rest: safeStr(r0.rest),
      note: safeStr(r0.note),
      adminNote: "",
      completed:false,
      completedAt:null,
    });
  }
  return programs;
}
async function sheetToRows(file){
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type:"array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval:"" });
}
function refreshProgramSelect(){
  const keys = Object.keys(workoutPrograms || {});
  programSelect.innerHTML = `<option value="">— няма импортирани —</option>`;
  keys.forEach(k=>{
    const o=document.createElement("option");
    o.value = k; o.textContent = k;
    programSelect.appendChild(o);
  });
}
openExcelFormatBtn?.addEventListener("click", ()=>{
  openModal("Формат (тренировки)",
`Колони (EN): Program | Day | Exercise | Sets | Reps | Rest | Note
Колони (BG): Програма | Ден | Упражнение | Серии | Повторения | Почивка | Бележка

Day може да е: Понеделник или Mon/Monday или 1..7`);
});
importExcelBtn?.addEventListener("click", async ()=>{
  try{
  if(!excelFile.files?.length) return openModal("Импорт", "Избери .xlsx файл.");
  const rows = await sheetToRows(excelFile.files[0]);
  const parsed = parseWorkoutPrograms(rows);
  workoutPrograms = { ...workoutPrograms, ...parsed };
  saveLocal("workoutPrograms", workoutPrograms);
  refreshProgramSelect();
  openModal("Готово", `Импортирани програми: ${Object.keys(parsed).join(", ")}`);
  excelFile.value="";
  }catch(e){ console.error(e); openModal("Грешка", e?.message || String(e)); }
});
function applyWorkoutProgram(overwrite=false){
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  const prog = programSelect.value;
  if(!prog) return openModal("Програма","Избери програма.");
  const plan = workoutPrograms?.[prog] || {};
  activeClient.plan ||= {};
  if(overwrite){
    activeClient.plan = JSON.parse(JSON.stringify(plan));
  }else{
    // merge by day (append)
    for(const [day, arr] of Object.entries(plan)){
      activeClient.plan[day] ||= [];
      activeClient.plan[day].push(...JSON.parse(JSON.stringify(arr)));
    }
  }
  return saveClientPatch({ plan: activeClient.plan, workoutStatus: {} });
}
applyProgramBtn?.addEventListener("click", ()=>applyWorkoutProgram(false));
applyProgramOverwriteBtn?.addEventListener("click", ()=>applyWorkoutProgram(true));
refreshProgramSelect();

// ---------- Nutrition ----------
function renderNutrition(){
  if(!activeClient){ nutritionList.innerHTML=""; return; }
  const day = nDaySelect.value;
  const list = activeClient.nutrition?.[day] || [];
  nutritionList.innerHTML="";
  list.forEach((m)=>{
    const el=document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div>
        <div class="title">${escapeHtml(m.title||"")}${m.time?` <span class="muted" style="font-weight:800">${escapeHtml(m.time)}</span>`:""}</div>
        <div class="meta">
          ${m.kcal!=="" && m.kcal!=null ? `<span class="pill">🔥 ${escapeHtml(String(m.kcal))} kcal</span>`:""}
          ${m.p!=="" && m.p!=null ? `<span class="pill">P ${escapeHtml(String(m.p))}g</span>`:""}
          ${m.c!=="" && m.c!=null ? `<span class="pill">C ${escapeHtml(String(m.c))}g</span>`:""}
          ${m.f!=="" && m.f!=null ? `<span class="pill">F ${escapeHtml(String(m.f))}g</span>`:""}
          ${m.tag?`<span class="pill">#${escapeHtml(m.tag)}</span>`:""}
        </div>
        ${m.desc?`<div class="note">${linkify(escapeHtml(m.desc))}</div>`:""}
      </div>
      <div class="row" style="justify-content:flex-end;gap:8px;">
        <button class="btn danger" data-act="del">🗑</button>
      </div>
    `;
    el.querySelector('[data-act="del"]').addEventListener("click", async ()=>{
      const i = list.findIndex(x=>x.id===m.id);
      if(i>=0) list.splice(i,1);
await saveClientPatch({ nutrition: activeClient.nutrition });
    });
    nutritionList.appendChild(el);
  });
}
addMealBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  const day = nDaySelect.value;
  const meal = {
    id: uid(10),
    title: (mealTitle.value||"").trim(),
    desc: (mealDesc.value||"").trim(),
    kcal: (mealKcal.value==="" ? "" : Number(mealKcal.value)),
    p: (mealP.value==="" ? "" : Number(mealP.value)),
    c: (mealC.value==="" ? "" : Number(mealC.value)),
    f: (mealF.value==="" ? "" : Number(mealF.value)),
    time: (mealTime.value||"").trim(),
    tag: (mealTag.value||"").trim().replaceAll("#",""),
    adminNote: (mealAdminNote.value||"").trim(),
  };
  if(!meal.title) return;
  activeClient.nutrition ||= {};
  activeClient.nutrition[day] ||= [];
  activeClient.nutrition[day].push(meal);
  await saveClientPatch({ nutrition: activeClient.nutrition });
  mealTitle.value=""; mealDesc.value=""; mealKcal.value=""; mealP.value=""; mealC.value=""; mealF.value=""; mealTime.value=""; mealTag.value=""; mealAdminNote.value="";
});
nClearDayBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return;
  const day = nDaySelect.value;
  activeClient.nutrition ||= {};
  activeClient.nutrition[day] = [];
  await saveClientPatch({ nutrition: activeClient.nutrition });
});
copyNutritionBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return;
  const from = nDaySelect.value;
  const to = prompt("Копирай храненето към ден (Понеделник..Неделя):", from) || "";
  const toDay = normalizeDay(to);
  activeClient.nutrition ||= {};
  activeClient.nutrition[toDay] = JSON.parse(JSON.stringify(activeClient.nutrition[from] || []));
  await saveClientPatch({ nutrition: activeClient.nutrition });
});
nDaySelect?.addEventListener("change", (e)=>{ setLocal("nDaySelect", e.target.value); }); // persist
nDaySelect?.addEventListener("change", renderNutrition);

// Nutrition Excel presets
function normalizeFoodHeader(h){
  const x = String(h||"").trim().toLowerCase();
  const m = {
    program:["program","programme","програма","програми","режим","template","plan"],
    day:["day","ден","дни","weekday","ден от седмицата"],
    title:["meal","mealtitle","title","meal title","хранене","име","заглавие"],
    desc:["description","desc","details","описание","детайли"],
    kcal:["kcal","calories","cal","ккал","калории"],
    p:["protein","p","протеин"],
    c:["carbs","carb","c","въглехидрати","въглех","въгл"],
    f:["fat","fats","f","мазнини"],
    time:["time","hour","час","време"],
    tag:["tag","tags","label","таг","етикет"],
    adminNote:["adminnote","admin note","coach note","админ бележка","треньор бележка","бележка треньор"],
  };
  for(const [k, arr] of Object.entries(m)){
    if(arr.includes(x)) return k;
  }
  return "";
}
function mapFoodRowKeys(row){
  const out = {};
  for(const [k,v] of Object.entries(row||{})){
    const nk = normalizeFoodHeader(k);
    out[nk || k] = v;
  }
  return out;
}
function parseNutritionPrograms(rows){
  const programs = {};
  for(const r0 of rows.map(mapFoodRowKeys)){
    const prog = safeStr(r0.program) || "Default";
    const day = normalizeDay(r0.day);
    const title = safeStr(r0.title);
    if(!title) continue;
    programs[prog] ||= {};
    programs[prog][day] ||= [];
    programs[prog][day].push({
      id: uid(10),
      title,
      desc: safeStr(r0.desc),
      kcal: safeStr(r0.kcal)==="" ? "" : Number(r0.kcal),
      p: safeStr(r0.p)==="" ? "" : Number(r0.p),
      c: safeStr(r0.c)==="" ? "" : Number(r0.c),
      f: safeStr(r0.f)==="" ? "" : Number(r0.f),
      time: safeStr(r0.time),
      tag: safeStr(r0.tag).replaceAll("#",""),
      adminNote: safeStr(r0.adminNote),
    });
  }
  return programs;
}
function refreshNProgramSelect(){
  if(!nProgramSelect) return;
  const keys = Object.keys(nutritionPrograms || {});
  nProgramSelect.innerHTML = `<option value="">— няма импортирани —</option>`;
  keys.forEach(k=>{
    const o=document.createElement("option");
    o.value=k; o.textContent=k;
    nProgramSelect.appendChild(o);
  });
}
nOpenExcelFormatBtn?.addEventListener("click", ()=>{
  openModal("Формат (хранене)",
`Колони (EN): Program | Day | MealTitle | Desc | Kcal | P | C | F | Time | Tag | AdminNote
Колони (BG): Програма | Ден | Хранене | Описание | Ккал | Протеин | Въглехидрати | Мазнини | Час | Таг | Админ бележка`);
});
nImportExcelBtn?.addEventListener("click", async ()=>{
  try{
  if(!nExcelFile?.files?.length) return openModal("Импорт", "Избери .xlsx файл.");
  const rows = await sheetToRows(nExcelFile.files[0]);
  const parsed = parseNutritionPrograms(rows);
  nutritionPrograms = { ...nutritionPrograms, ...parsed };
  saveLocal("nutritionPrograms", nutritionPrograms);
  refreshNProgramSelect();
  openModal("Готово", `Импортирани режими: ${Object.keys(parsed).join(", ")}`);
  nExcelFile.value="";
  }catch(e){ console.error(e); openModal("Грешка", e?.message || String(e)); }
});
function applyNutritionProgram(overwrite=false){
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  const prog = nProgramSelect?.value || "";
  if(!prog) return openModal("Режим","Избери режим.");
  const nut = nutritionPrograms?.[prog] || {};
  activeClient.nutrition ||= {};
  if(overwrite){
    activeClient.nutrition = JSON.parse(JSON.stringify(nut));
  }else{
    for(const [day, arr] of Object.entries(nut)){
      activeClient.nutrition[day] ||= [];
      activeClient.nutrition[day].push(...JSON.parse(JSON.stringify(arr)));
    }
  }
  return saveClientPatch({ nutrition: activeClient.nutrition, foodStatus: {} });
}
nApplyProgramBtn?.addEventListener("click", ()=>applyNutritionProgram(false));
nApplyProgramOverwriteBtn?.addEventListener("click", ()=>applyNutritionProgram(true));
refreshNProgramSelect();

// ---------- Photos ----------
async function filesToDataUrls(fileList){
  // fallback for very small images; preferred path uses Firebase Storage
  const out=[];
  for(const f of Array.from(fileList||[])){
    const dataUrl = await new Promise((resolve,reject)=>{
      const fr = new FileReader();
      fr.onload = ()=> resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(f);
    });
    out.push(String(dataUrl));
  }
  return out;
}

async function uploadImagesToStorage(clientId, kind, fileList){
  // kind: "before" | "after"
  const files = Array.from(fileList||[]);
  if(!files.length) return [];
  const urls = [];
  for(const f of files){
    const path = `clients/${clientId}/photos/${kind}/${Date.now()}_${Math.random().toString(16).slice(2)}_${f.name}`.replace(/\s+/g,"_");
    const r = sRef(storage, path);
    await uploadBytes(r, f, { contentType: f.type || "image/jpeg" });
    urls.push(await getDownloadURL(r));
  }
  return urls;
}
function renderPhotos(){
  if(!activeClient){ beforeGallery.innerHTML=""; afterGallery.innerHTML=""; return; }
  const b = activeClient.photos?.before || [];
  const a = activeClient.photos?.after || [];
  beforeGallery.innerHTML="";
  afterGallery.innerHTML="";
  b.forEach((src, idx)=>{
    const el=document.createElement("div");
    el.className="thumb";
    el.innerHTML = `<img src="${src}" alt="before ${idx+1}"/><button class="thumb-del">×</button>`;
    el.querySelector("button").addEventListener("click", async ()=>{
      b.splice(idx,1);
await saveClientPatch({ photos: activeClient.photos });
    });
    beforeGallery.appendChild(el);
  });
  a.forEach((src, idx)=>{
    const el=document.createElement("div");
    el.className="thumb";
    el.innerHTML = `<img src="${src}" alt="after ${idx+1}"/><button class="thumb-del">×</button>`;
    el.querySelector("button").addEventListener("click", async ()=>{
      a.splice(idx,1);
await saveClientPatch({ photos: activeClient.photos });
    });
    afterGallery.appendChild(el);
  });
}
addBeforeBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  try{
    if(!beforeFile.files?.length) return openModal("Снимки","Избери снимки (Преди).");
    const urls = await uploadImagesToStorage(activeClientId, "before", beforeFile.files);
    activeClient.photos ||= { before:[], after:[] };
    activeClient.photos.before ||= [];
    activeClient.photos.before.push(...urls);
    await saveClientPatch({ photos: activeClient.photos });
    beforeFile.value="";
    openModal("Готово", `Качени снимки: ${urls.length}`);
  }catch(e){
    console.error(e);
    openModal("Грешка при качване", e?.message || String(e));
  }
});
addAfterBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  try{
    if(!afterFile.files?.length) return openModal("Снимки","Избери снимки (След).");
    const urls = await uploadImagesToStorage(activeClientId, "after", afterFile.files);
    activeClient.photos ||= { before:[], after:[] };
    activeClient.photos.after ||= [];
    activeClient.photos.after.push(...urls);
    await saveClientPatch({ photos: activeClient.photos });
    afterFile.value="";
    openModal("Готово", `Качени снимки: ${urls.length}`);
  }catch(e){
    console.error(e);
    openModal("Грешка при качване", e?.message || String(e));
  }
});
clearPhotosBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return;
  activeClient.photos = { before:[], after:[] };
  await saveClientPatch({ photos: activeClient.photos });
});

// ---------- Profile ----------
function renderProfile(){
  if(!activeClient){ profilePreview.textContent="Избери клиент."; return; }
  const p = activeClient.profile || {};
  goal.value = p.goal || "";
  weight.value = p.weight || "";
  height.value = p.height || "";
  freq.value = p.freq || "";
  limits.value = p.limits || "";

  payStatus.value = activeClient.paidStatus || "unpaid";
  packageName.value = activeClient.packageName || "";
  packagePrice.value = activeClient.packagePrice || "";

  accessCode.value = activeClient.accessCode || activeClient.code || "";
  const preview = {
    name: activeClient.name,
    accessCode: accessCode.value,
    paidStatus: payStatus.value,
    packageName: packageName.value,
    packagePrice: packagePrice.value,
    profile: p,
  };
  profilePreview.textContent = JSON.stringify(preview, null, 2);
}
saveProfileBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  const patch = {
    paidStatus: payStatus.value,
    packageName: packageName.value,
    packagePrice: packagePrice.value,
    profile: {
      goal: goal.value,
      weight: weight.value==="" ? "" : Number(weight.value),
      height: height.value==="" ? "" : Number(height.value),
      freq: freq.value==="" ? "" : Number(freq.value),
      limits: limits.value,
    }
  };
  await saveClientPatch(patch);
  openModal("Запазено","Профилът е обновен.");
});
genCodeBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  const code = uid(6);
  accessCode.value = code;
  await saveClientPatch({ accessCode: code });
  openModal("Код","Генериран е нов код.");
});
copyPortalBtn?.addEventListener("click", async ()=>{
  if(!activeClient) return;
  const code = activeClient.accessCode || activeClient.code || "";
  const link = `${location.origin}${location.pathname.replace(/\/[^\/]*$/,"/")}portal.html?code=${encodeURIComponent(code)}`;
  await copyToClipboard(link);
  openModal("Копирано", link);
});
inviteBtn?.addEventListener("click", async ()=>{
  if(!activeClient) return;
  const code = activeClient.accessCode || activeClient.code || "";
  const link = `${location.origin}${location.pathname.replace(/\/[^\/]*$/,"/")}portal.html?code=${encodeURIComponent(code)}`;
  openModal("Текст за покана", `Здравей! Това е твоят портал:\n${link}\nКод: ${code}`);
});
togglePaidBtn?.addEventListener("click", async ()=>{
  payStatus.value = (payStatus.value==="paid" ? "unpaid" : "paid");
  await saveClientPatch({ paidStatus: payStatus.value });
});

// ---------- Sidebar actions ----------
exportBtn?.addEventListener("click", async ()=>{
  if(!activeClientId) return openModal("Експорт","Избери клиент.");
  const snap = await getDoc(doc(db,"clients",activeClientId));
  const data = { id:snap.id, ...snap.data() };
  const blob = new Blob([JSON.stringify(data,null,2)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `client_${data.name||data.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
resetBtn?.addEventListener("click", async ()=>{
  openModal("Нулиране","За безопасност изтриването на клиенти/данни трябва да се прави през Firebase Console или бекенд.");
});
notifBtn?.addEventListener("click", ()=>{
  openModal("Нотификации","Демо UI. За истински push нотификации 24/7 е нужен backend / FCM setup.");
  notifCount.textContent = "0";
});
openPortalBtn?.addEventListener("click", ()=>{
  // show portal UI without code
  showPortalUI(true);
  initPortalFromUrl();
});

// ---------- Save helper ----------
async function saveClientPatch(patch){
  if(!activeClientId) return;
  try{
    await updateDoc(doc(db,"clients",activeClientId), patch);
  }catch(e){
    showErr("Запис (Firestore rules?)", e);
  }
}
// ---------- Render all admin panels ----------
function renderAll(){
  if(!activeClient) return;
  renderPlan();
  renderNutrition();
  renderPhotos();
  renderProfile();
}

// ---------- Portal logic ----------
backToCoachBtn?.addEventListener("click", ()=>{
  // back to admin view (still logged in if auth session exists)
  const url = new URL(location.href);
  url.searchParams.delete("portal");
  url.searchParams.delete("code");
  location.href = url.toString();
});

function initPortalFromUrl(){
  const pre = (getParam("code") || "").trim().toUpperCase();
  if(pre){
    portalCode.value = pre;
    portalLoginWithCode(pre);
  }else{
    // show login
    portalLogin.classList.remove("hidden");
    portalMain.classList.add("hidden");
  }
}

portalLoginBtn?.addEventListener("click", ()=>{
  const code = (portalCode.value||"").trim().toUpperCase();
  if(!code) return openModal("Код","Въведи код.");
  portalLoginWithCode(code);
});
portalCode?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") portalLoginBtn.click(); });

async function portalLoginWithCode(code){
  // unsubscribe old
  if(portalClientUnsub) portalClientUnsub();
  portalClient = null;
  const q = query(collection(db,"clients"), where("accessCode","==",code));
  const snap = await getDocs(q);
  if(snap.empty){
    // fallback older field name
    const q2 = query(collection(db,"clients"), where("code","==",code));
    const snap2 = await getDocs(q2);
    if(snap2.empty) return openModal("Грешка","Невалиден код.");
    portalClientRef = doc(db,"clients", snap2.docs[0].id);
  }else{
    portalClientRef = doc(db,"clients", snap.docs[0].id);
  }
  portalClientUnsub = onSnapshot(portalClientRef, (s)=>{
    portalClient = { id:s.id, ...s.data() };
    portalSub.textContent = portalClient?.name ? `Клиент: ${portalClient.name}` : "Client Portal";
    portalClientName.textContent = portalClient?.name || "Клиент";
    renderPortal();
  });
  portalLogin.classList.add("hidden");
  portalMain.classList.remove("hidden");
  setPTab(getLocal("portalTab","pplan"));
}

function renderPortal(){
  if(!portalClient) return;
  const day = pDaySelect.value;
  const w = portalClient.plan?.[day] || [];
  const n = portalClient.nutrition?.[day] || [];

  // plan list
  pPlanList.innerHTML="";
  w.forEach((ex)=>{
    const el=document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div>
        <div class="title">${escapeHtml(ex.name||"")} ${ex.completed?'<span class="pill">✅</span>':""}</div>
        <div class="meta">
          ${ex.sets?`<span class="pill">${escapeHtml(ex.sets)} сер.</span>`:""}
          ${ex.reps?`<span class="pill">${escapeHtml(ex.reps)} повт.</span>`:""}
          ${ex.rest?`<span class="pill">⏱ ${escapeHtml(ex.rest)}</span>`:""}
        </div>
        ${ex.note?`<div class="note">${linkify(escapeHtml(ex.note))}</div>`:""}
      </div>
      <div class="row" style="justify-content:flex-end">
        <button class="btn primary">${ex.completed ? "↩" : "✓"}</button>
      </div>
    `;
    el.querySelector("button").addEventListener("click", async ()=>{
      ex.completed = !ex.completed;
      ex.completedAt = ex.completed ? new Date().toLocaleString("bg-BG",{hour12:false}) : null;
      portalClient.plan[day] = w;
      try{ await updateDoc(portalClientRef, { plan: portalClient.plan }); }catch(e){ showErr('Portal update', e);} 
    });
    pPlanList.appendChild(el);
  });

  // done hint
  const ws = portalClient.workoutStatus?.[day];
  pDayDoneHint.textContent = ws?.done ? `✅ Завършено: ${ws.doneAt || ""}` : "";

  // food list
  pFoodList.innerHTML="";
  n.forEach((m)=>{
    const el=document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div>
        <div class="title">${escapeHtml(m.title||"")}${m.time?` <span class="muted" style="font-weight:800">${escapeHtml(m.time)}</span>`:""}</div>
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
    pFoodList.appendChild(el);
  });
  const fs = portalClient.foodStatus?.[day];
  pFoodHint.textContent = fs?.done ? `✅ Следвано: ${fs.doneAt || ""}` : "";

  // portal photos
  renderPortalPhotos();
}

pDaySelect?.addEventListener("change", (e)=>{ setLocal("pDaySelect", e.target.value); }); // persist
pDaySelect?.addEventListener("change", renderPortal);
pFoodDaySelect?.addEventListener("change", (e)=>{ setLocal("pFoodDaySelect", e.target.value); }); // persist
pFoodDaySelect?.addEventListener("change", renderPortal);

pMarkDayDoneBtn?.addEventListener("click", async ()=>{
  if(!portalClient) return;
  const day = pDaySelect.value;
  portalClient.workoutStatus ||= {};
  portalClient.workoutStatus[day] = { done:true, doneAt: new Date().toLocaleString("bg-BG",{hour12:false}) };
  try{
    await updateDoc(portalClientRef, { workoutStatus: portalClient.workoutStatus });
  }catch(e){
    showErr("Portal mark workout done", e);
  }
});
pFoodDoneBtn?.addEventListener("click", async ()=>{
  if(!portalClient) return;
  const day = pFoodDaySelect.value;
  portalClient.foodStatus ||= {};
  portalClient.foodStatus[day] = { done:true, doneAt: new Date().toLocaleString("bg-BG",{hour12:false}) };
  try{
    await updateDoc(portalClientRef, { foodStatus: portalClient.foodStatus });
  }catch(e){
    showErr("Portal mark food done", e);
  }
});
// portal chat (simple: store in same subcollection)
function renderPortalChat(items){
  pChatBox.innerHTML = "";
  items.forEach(m=>{
    const el=document.createElement("div");
    el.className = "msg " + (m.from==="client" ? "me" : "them");
    el.innerHTML = `
      <div class="msg-meta muted">${escapeHtml(m.from||"")} • ${m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString("bg-BG",{hour12:false}) : ""}</div>
      <div class="msg-text">${linkify(escapeHtml(m.text||""))}</div>
    `;
    pChatBox.appendChild(el);
  });
  pChatBox.scrollTop = pChatBox.scrollHeight;
}
let portalChatUnsub = null;
function ensurePortalChatListener(){
  if(!portalClientRef) return;
  if(portalChatUnsub) return;
  const chatQ = query(collection(db,"clients",portalClientRef.id,"chat"), orderBy("createdAt","asc"), limit(200));
  portalChatUnsub = onSnapshot(chatQ, (snap)=>{
    renderPortalChat(snap.docs.map(d=>({id:d.id, ...d.data()})));
  });
}
pSendMsgBtn?.addEventListener("click", async ()=>{
  if(!portalClientRef) return;
  const text = (pMsgText.value||"").trim();
  if(!text) return;
  await addDoc(collection(db,"clients",portalClientRef.id,"chat"), {
    from: "client",
    text,
    createdAt: serverTimestamp()
  });
  pMsgText.value="";
  ensurePortalChatListener();
});
pMsgText?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") pSendMsgBtn.click(); });
ensurePortalChatListener();

// portal photos upload (optional)
async function renderPortalPhotos(){
  if(!portalClient) return;
  const b = portalClient.photos?.before || [];
  const a = portalClient.photos?.after || [];
  pBeforeGallery.innerHTML="";
  pAfterGallery.innerHTML="";
  b.forEach((src)=>{
    const el=document.createElement("div"); el.className="thumb";
    el.innerHTML = `<img src="${src}" alt="before"/>`;
    pBeforeGallery.appendChild(el);
  });
  a.forEach((src)=>{
    const el=document.createElement("div"); el.className="thumb";
    el.innerHTML = `<img src="${src}" alt="after"/>`;
    pAfterGallery.appendChild(el);
  });
}
pAddBeforeBtn?.addEventListener("click", async ()=>{
  if(!portalClientRef) return;
  try{
    if(!pBeforeFile.files?.length) return openModal("Снимки","Избери снимки (Преди).");
    const urls = await uploadImagesToStorage(portalClientRef.id, "before", pBeforeFile.files);
    portalClient.photos ||= { before:[], after:[] };
    portalClient.photos.before ||= [];
    portalClient.photos.before.push(...urls);
    await updateDoc(portalClientRef, { photos: portalClient.photos });
    pBeforeFile.value="";
    openModal("Готово", `Качени снимки: ${urls.length}`);
  }catch(e){
    showErr("Portal upload BEFORE", e);
  }
});

pAddAfterBtn?.addEventListener("click", async ()=>{
  if(!portalClientRef) return;
  try{
    if(!pAfterFile.files?.length) return openModal("Снимки","Избери снимки (След).");
    const urls = await uploadImagesToStorage(portalClientRef.id, "after", pAfterFile.files);
    portalClient.photos ||= { before:[], after:[] };
    portalClient.photos.after ||= [];
    portalClient.photos.after.push(...urls);
    await updateDoc(portalClientRef, { photos: portalClient.photos });
    pAfterFile.value="";
    openModal("Готово", `Качени снимки: ${urls.length}`);
  }catch(e){
    showErr("Portal upload AFTER", e);
  }
});

// ---------- Boot ----------
function safeInitSelectDefaults(){
  // set day selects to today
  const days = ["Понеделник","Вторник","Сряда","Четвъртък","Петък","Събота","Неделя"];
  const map = {1:"Понеделник",2:"Вторник",3:"Сряда",4:"Четвъртък",5:"Петък",6:"Събота",0:"Неделя"};
  const today = map[new Date().getDay()] || "Понеделник";
  const saved = {
    daySelect: getLocal('daySelect',''),
    nDaySelect: getLocal('nDaySelect',''),
    pDaySelect: getLocal('pDaySelect',''),
    pFoodDaySelect: getLocal('pFoodDaySelect',''),
  };
  [daySelect, nDaySelect, pDaySelect, pFoodDaySelect].forEach(sel=>{
    if(!sel) return;
    const k = sel.id;
    if(saved[k] && days.includes(saved[k])) { sel.value = saved[k]; return; }
    if(days.includes(today)) sel.value = today;
  });
}
safeInitSelectDefaults();