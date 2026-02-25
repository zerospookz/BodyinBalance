import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, where, orderBy, limit, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

/**
 * Data model (Firestore)
 * - clients (collection)
 *   - { name, accessCode, createdAt, paid, profile, plan, dayStatus, nutrition, foodStatus, photos }
 * - clients/{clientId}/chat (subcollection)
 *   - { from: "coach"|"client", text, createdAt }
 */

// ---------- Firebase init ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Helpers ----------
function uid() { return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function nowStr() { return new Date().toLocaleString("bg-BG", { hour12: false }); }
function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function linkify(plainText) {
  const escaped = escapeHtml(plainText || "");
  const urlRegex = /(\bhttps?:\/\/[^\"'\s<>()]+[^\s<>()'\".,;:!?])/gi;
  return escaped.replace(urlRegex, (url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}
function todayBgDay() {
  const d = new Date().getDay(); // 0 Sun .. 6 Sat
  const map = { 1:"Понеделник",2:"Вторник",3:"Сряда",4:"Четвъртък",5:"Петък",6:"Събота",0:"Неделя" };
  return map[d] || "Понеделник";
}
function genCode(len=6){
  const chars="ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out="";
  for(let i=0;i<len;i++) out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}

// ---------- DOM ----------
const coachApp = document.getElementById("coachApp");
const clientPortal = document.getElementById("clientPortal");

const loginScreen = document.getElementById("loginScreen");
const loginEmail = document.getElementById("loginEmail");
const loginPass = document.getElementById("loginPass");
const loginBtn = document.getElementById("loginBtn");
const loginErr = document.getElementById("loginErr");

const clientName = document.getElementById("clientName");
const addClientBtn = document.getElementById("addClientBtn");
const clientsList = document.getElementById("clientsList");

const activeTitle = document.getElementById("activeTitle");
const activeMeta = document.getElementById("activeMeta");

const tabs = document.querySelectorAll(".tab[data-tab]");
const tabChat = document.getElementById("tab-chat");
const tabPlan = document.getElementById("tab-plan");
const tabNutrition = document.getElementById("tab-nutrition");
const tabPhotos = document.getElementById("tab-photos");
const tabProfile = document.getElementById("tab-profile");

// Chat (admin)
const chatBox = document.getElementById("chatBox");
const msgFrom = document.getElementById("msgFrom");
const msgText = document.getElementById("msgText");
const sendMsgBtn = document.getElementById("sendMsgBtn");
const clearChatBtn = document.getElementById("clearChatBtn");

// Plan (admin)
const daySelect = document.getElementById("daySelect");
const clearDayBtn = document.getElementById("clearDayBtn");
const planList = document.getElementById("planList");
const addExerciseBtn = document.getElementById("addExerciseBtn");

// Nutrition (admin)
const foodDaySelect = document.getElementById("foodDaySelect");
const mealsList = document.getElementById("mealsList");
const addMealBtn = document.getElementById("addMealBtn");

// Photos (admin)
const beforeFile = document.getElementById("beforeFile");
const afterFile = document.getElementById("afterFile");
const addBeforeBtn = document.getElementById("addBeforeBtn");
const addAfterBtn = document.getElementById("addAfterBtn");
const beforeGallery = document.getElementById("beforeGallery");
const afterGallery = document.getElementById("afterGallery");

// Profile (admin)
const accessCodeEl = document.getElementById("accessCode");
const portalLinkEl = document.getElementById("portalLink");
const paidToggle = document.getElementById("paidToggle");
const profileNotes = document.getElementById("profileNotes");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const profilePreview = document.getElementById("profilePreview");

// Portal
const portalSub = document.getElementById("portalSub");
const backToCoachBtn = document.getElementById("backToCoachBtn");
const portalLogin = document.getElementById("portalLogin");
const portalCode = document.getElementById("portalCode");
const portalLoginBtn = document.getElementById("portalLoginBtn");
const portalMain = document.getElementById("portalMain");
const portalClientName = document.getElementById("portalClientName");

const pTabs = document.querySelectorAll(".tab[data-ptab]");
const ptabPlan = document.getElementById("ptab-pplan");
const ptabFood = document.getElementById("ptab-pfood");
const ptabChat = document.getElementById("ptab-pchat");
const ptabPhotos = document.getElementById("ptab-pphotos");

const pDaySelect = document.getElementById("pDaySelect");
const pPlanList = document.getElementById("pPlanList");
const pDayDoneBtn = document.getElementById("pDayDoneBtn");
const pDayDoneHint = document.getElementById("pDayDoneHint");

const pFoodDaySelect = document.getElementById("pFoodDaySelect");
const pFoodList = document.getElementById("pFoodList");
const pFoodDoneBtn = document.getElementById("pFoodDoneBtn");
const pFoodDoneHint = document.getElementById("pFoodDoneHint");

const pChatBox = document.getElementById("pChatBox");
const pMsgText = document.getElementById("pMsgText");
const pSendMsgBtn = document.getElementById("pSendMsgBtn");

const pBeforeFile = document.getElementById("pBeforeFile");
const pAfterFile = document.getElementById("pAfterFile");
const pAddBeforeBtn = document.getElementById("pAddBeforeBtn");
const pAddAfterBtn = document.getElementById("pAddAfterBtn");
const pBeforeGallery = document.getElementById("pBeforeGallery");
const pAfterGallery = document.getElementById("pAfterGallery");

// Modal
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");
const closeModal = document.getElementById("closeModal");
const closeModal2 = document.getElementById("closeModal2");
const copyModalBtn = document.getElementById("copyModalBtn");

// ---------- Modal helpers ----------
function openModal(title, text){
  modalTitle.textContent = title;
  modalText.value = text;
  modal.classList.remove("hidden");
}
function closeModalFn(){ modal.classList.add("hidden"); }
closeModal?.addEventListener("click", closeModalFn);
closeModal2?.addEventListener("click", closeModalFn);
copyModalBtn?.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(modalText.value); } catch {}
});

// ---------- View routing ----------
const url = new URL(window.location.href);
const isPortal = url.searchParams.get("portal") === "1";
const urlCode = url.searchParams.get("code") || "";

// ---------- Firestore live state ----------
let activeClientId = null;
let clients = []; // cached list
let unsubClients = null;
let unsubChat = null; // active client chat listener

function setTab(name){
  document.querySelectorAll(".tab[data-tab]").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  tabChat.classList.toggle("hidden", name !== "chat");
  tabPlan.classList.toggle("hidden", name !== "plan");
  tabNutrition.classList.toggle("hidden", name !== "nutrition");
  tabPhotos.classList.toggle("hidden", name !== "photos");
  tabProfile.classList.toggle("hidden", name !== "profile");
}

function setPortalTab(name){
  pTabs.forEach(t => t.classList.toggle("active", t.dataset.ptab === name));
  ptabPlan.classList.toggle("hidden", name !== "pplan");
  ptabFood.classList.toggle("hidden", name !== "pfood");
  ptabChat.classList.toggle("hidden", name !== "pchat");
  ptabPhotos.classList.toggle("hidden", name !== "pphotos");
}

// ---------- Admin: clients list ----------
function renderClients(){
  clientsList.innerHTML = "";
  if(!clients.length){
    clientsList.innerHTML = `<div class="empty muted">Няма клиенти. Добави от полето горе.</div>`;
    return;
  }
  clients.forEach(c => {
    const el = document.createElement("div");
    el.className = "client-item" + (c.id === activeClientId ? " active" : "");
    el.innerHTML = `
      <div>
        <div class="client-title">${escapeHtml(c.name || "Без име")}</div>
        <div class="client-meta">Код: <b>${escapeHtml(c.accessCode || "-")}</b></div>
      </div>
      <div class="badge ${c.paid ? "paid":"unpaid"}">${c.paid ? "Платен":"Неплатен"}</div>
    `;
    el.addEventListener("click", () => selectClient(c.id));
    clientsList.appendChild(el);
  });
}

async function selectClient(id){
  activeClientId = id;
  renderClients();
  const ref = doc(db, "clients", id);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    activeTitle.textContent = "Избери клиент";
    activeMeta.textContent = "Клиентът не е намерен.";
    return;
  }
  const c = { id, ...snap.data() };
  activeTitle.textContent = c.name || "Клиент";
  activeMeta.textContent = `Код: ${c.accessCode || "-"} • Създаден: ${c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString("bg-BG",{hour12:false}) : "-"}`;
  // render per tab
  renderAdminProfile(c);
  renderAdminPlan(c);
  renderAdminNutrition(c);
  renderAdminPhotos(c);
  // chat listener
  listenChat(id);
}

function listenClients(){
  const qref = query(collection(db,"clients"), orderBy("createdAt","desc"));
  unsubClients = onSnapshot(qref, (qs) => {
    clients = qs.docs.map(d => ({ id:d.id, ...d.data() }));
    renderClients();
    if(activeClientId && !clients.some(c => c.id === activeClientId)){
      activeClientId = null;
    }
  });
}

async function addClient(){
  const name = (clientName.value || "").trim();
  if(!name) return openModal("Име", "Въведи име на клиента.");
  const accessCode = genCode(6);
  const docRef = await addDoc(collection(db,"clients"), {
    name,
    accessCode,
    paid: false,
    createdAt: serverTimestamp(),
    profile: { notes: "" },
    plan: {},
    dayStatus: {},
    nutrition: {},
    foodStatus: {},
    photos: { before: [], after: [] }
  });
  clientName.value = "";
  await selectClient(docRef.id);
  openModal("Създаден клиент", `Клиент: ${name}\nКод за достъп: ${accessCode}\n\nPortal: portal.html?code=${accessCode}`);
}

// ---------- Admin: profile ----------
function renderAdminProfile(c){
  accessCodeEl.textContent = c.accessCode || "-";
  portalLinkEl.value = `portal.html?code=${c.accessCode || ""}`;
  paidToggle.checked = !!c.paid;
  profileNotes.value = c.profile?.notes || "";
  profilePreview.textContent = JSON.stringify({
    name: c.name,
    accessCode: c.accessCode,
    paid: !!c.paid,
    notes: c.profile?.notes || ""
  }, null, 2);
}

async function saveProfile(){
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  const ref = doc(db,"clients",activeClientId);
  await updateDoc(ref, {
    paid: !!paidToggle.checked,
    "profile.notes": profileNotes.value || ""
  });
  openModal("Запазено","Профилът е обновен.");
}

// ---------- Admin: plan ----------
function renderAdminPlan(c){
  const day = daySelect.value;
  const items = (c.plan && c.plan[day]) ? c.plan[day] : [];
  planList.innerHTML = "";
  if(!items.length){
    planList.innerHTML = `<div class="empty muted">Няма упражнения за ${escapeHtml(day)}.</div>`;
    return;
  }
  items.forEach(ex => {
    const el = document.createElement("div");
    el.className = "plan-item";
    el.innerHTML = `
      <div class="left">
        <div class="title">${escapeHtml(ex.name || "")}</div>
        <div class="sub">${escapeHtml([ex.sets?`${ex.sets} серии`:"", ex.reps?`${ex.reps} повтор.`:"", ex.rest?`почивка ${ex.rest}`:""].filter(Boolean).join(" • "))}</div>
        ${ex.note ? `<div class="note">${linkify(ex.note)}</div>` : ""}
      </div>
      <div class="actions">
        <button class="btn ghost small" data-act="edit">Редакция</button>
        <button class="btn danger small" data-act="del">✕</button>
      </div>
    `;
    el.querySelector('[data-act="del"]').addEventListener("click", () => deleteExercise(day, ex.id));
    el.querySelector('[data-act="edit"]').addEventListener("click", () => editExercise(day, ex.id));
    planList.appendChild(el);
  });
}

async function upsertExercise(day, ex){
  const ref = doc(db,"clients",activeClientId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const c = snap.data();
  const plan = c.plan || {};
  plan[day] ||= [];
  const idx = plan[day].findIndex(x => x.id === ex.id);
  if(idx >= 0) plan[day][idx] = ex;
  else plan[day].push(ex);
  await updateDoc(ref, { plan });
  await selectClient(activeClientId);
}

function addExercise(){
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  const day = daySelect.value;
  const ex = { id: uid(), name: "Ново упражнение", sets: "3", reps: "8-12", rest: "90s", note: "" };
  openModal("Добави упражнение", "Попълни данните в Admin → Тренировки като натиснеш Редакция на елемента.");
  upsertExercise(day, ex);
}

async function editExercise(day, id){
  const ref = doc(db,"clients",activeClientId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const c = snap.data();
  const ex = (c.plan?.[day] || []).find(x => x.id === id);
  if(!ex) return;

  const text = `Редакция (JSON)\n\n${JSON.stringify(ex, null, 2)}\n\nСложи валиден JSON и натисни Copy → после paste обратно в този modal НЕ се поддържа.`;
  openModal("Редакция (копирай JSON и редактирай в редактор)", text);
  // For simplicity: quick inline prompt
  const editedRaw = prompt("Постави JSON за упражнението:", JSON.stringify(ex));
  if(!editedRaw) return;
  try{
    const edited = JSON.parse(editedRaw);
    edited.id = ex.id;
    await upsertExercise(day, edited);
  }catch{
    openModal("Грешка","Невалиден JSON.");
  }
}

async function deleteExercise(day, id){
  const ref = doc(db,"clients",activeClientId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const c = snap.data();
  const plan = c.plan || {};
  plan[day] = (plan[day] || []).filter(x => x.id !== id);
  await updateDoc(ref, { plan });
  await selectClient(activeClientId);
}

async function clearDay(){
  if(!activeClientId) return;
  const day = daySelect.value;
  const ref = doc(db,"clients",activeClientId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const c = snap.data();
  const plan = c.plan || {};
  plan[day] = [];
  await updateDoc(ref, { plan });
  await selectClient(activeClientId);
}

// ---------- Admin: nutrition ----------
function mealSummary(m){
  const parts = [];
  if(m.protein) parts.push(`P ${m.protein}g`);
  if(m.carbs) parts.push(`C ${m.carbs}g`);
  if(m.fat) parts.push(`F ${m.fat}g`);
  if(m.kcal) parts.push(`${m.kcal} kcal`);
  return parts.join(" • ");
}
function renderAdminNutrition(c){
  const day = foodDaySelect.value;
  const meals = (c.nutrition && c.nutrition[day]) ? c.nutrition[day] : [];
  mealsList.innerHTML = "";
  if(!meals.length){
    mealsList.innerHTML = `<div class="empty muted">Няма режим за ${escapeHtml(day)}.</div>`;
    return;
  }
  meals.forEach(m => {
    const el = document.createElement("div");
    el.className = "plan-item";
    el.innerHTML = `
      <div class="left">
        <div class="title">🍽 ${escapeHtml(m.title || "")}</div>
        <div class="sub">${escapeHtml(mealSummary(m) || "")}</div>
        ${m.desc ? `<div class="note">${linkify(m.desc)}</div>` : ""}
      </div>
      <div class="actions">
        <button class="btn ghost small" data-act="edit">Редакция</button>
        <button class="btn danger small" data-act="del">✕</button>
      </div>
    `;
    el.querySelector('[data-act="del"]').addEventListener("click", () => deleteMeal(day, m.id));
    el.querySelector('[data-act="edit"]').addEventListener("click", () => editMeal(day, m.id));
    mealsList.appendChild(el);
  });
}

async function upsertMeal(day, meal){
  const ref = doc(db,"clients",activeClientId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const c = snap.data();
  const nutrition = c.nutrition || {};
  nutrition[day] ||= [];
  const idx = nutrition[day].findIndex(x => x.id === meal.id);
  if(idx >= 0) nutrition[day][idx] = meal;
  else nutrition[day].push(meal);
  await updateDoc(ref, { nutrition });
  await selectClient(activeClientId);
}

function addMeal(){
  if(!activeClientId) return openModal("Няма клиент","Избери клиент.");
  const day = foodDaySelect.value;
  const meal = { id: uid(), title: "Хранене", protein:"", carbs:"", fat:"", kcal:"", desc:"" };
  upsertMeal(day, meal);
}

async function editMeal(day, id){
  const ref = doc(db,"clients",activeClientId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const c = snap.data();
  const meal = (c.nutrition?.[day] || []).find(x => x.id === id);
  if(!meal) return;
  const editedRaw = prompt("Постави JSON за храненето:", JSON.stringify(meal));
  if(!editedRaw) return;
  try{
    const edited = JSON.parse(editedRaw);
    edited.id = meal.id;
    await upsertMeal(day, edited);
  }catch{
    openModal("Грешка","Невалиден JSON.");
  }
}

async function deleteMeal(day, id){
  const ref = doc(db,"clients",activeClientId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const c = snap.data();
  const nutrition = c.nutrition || {};
  nutrition[day] = (nutrition[day] || []).filter(x => x.id !== id);
  await updateDoc(ref, { nutrition });
  await selectClient(activeClientId);
}

// ---------- Photos (base64 in Firestore - ok for small images) ----------
function fileToDataUrl(file){
  return new Promise((resolve,reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function makeThumb(ph, kind, onDelete){
  const el = document.createElement("div");
  el.className = "thumb";
  el.innerHTML = `
    <img src="${ph.dataUrl}" alt="${escapeHtml(kind)}" />
    <button class="thumb-del" title="Изтрий">✕</button>
  `;
  el.querySelector(".thumb-del").addEventListener("click", () => onDelete(ph.id));
  return el;
}
async function renderAdminPhotos(c){
  beforeGallery.innerHTML = "";
  afterGallery.innerHTML = "";
  const before = c.photos?.before || [];
  const after = c.photos?.after || [];
  if(!before.length) beforeGallery.innerHTML = `<div class="empty muted">Няма снимки “Преди”.</div>`;
  else before.forEach(ph => beforeGallery.appendChild(makeThumb(ph,"before",(id)=>deletePhoto("before",id))));
  if(!after.length) afterGallery.innerHTML = `<div class="empty muted">Няма снимки “След”.</div>`;
  else after.forEach(ph => afterGallery.appendChild(makeThumb(ph,"after",(id)=>deletePhoto("after",id))));
}
async function addPhotos(kind, files){
  if(!activeClientId) return;
  if(!files || !files.length) return;
  const ref = doc(db,"clients",activeClientId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const c = snap.data();
  const photos = c.photos || { before: [], after: [] };
  const list = photos[kind] || [];
  for(const f of files){
    const dataUrl = await fileToDataUrl(f);
    list.push({ id: uid(), name: f.name, dataUrl, ts: nowStr() });
  }
  photos[kind] = list;
  await updateDoc(ref, { photos });
  await selectClient(activeClientId);
}
async function deletePhoto(kind, id){
  const ref = doc(db,"clients",activeClientId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const c = snap.data();
  const photos = c.photos || { before: [], after: [] };
  photos[kind] = (photos[kind] || []).filter(p => p.id !== id);
  await updateDoc(ref, { photos });
  await selectClient(activeClientId);
}

// ---------- Chat (Firestore subcollection) ----------
function renderChatMessages(msgs, forPortal=false){
  const box = forPortal ? pChatBox : chatBox;
  box.innerHTML = "";
  if(!msgs.length){
    box.innerHTML = `<div class="empty muted">Няма съобщения. Напиши първото.</div>`;
    return;
  }
  msgs.forEach(m => {
    const row = document.createElement("div");
    row.className = "msg " + (m.from === "coach" ? "coach" : "client");
    row.innerHTML = `
      <div class="bubble">
        <div>${linkify(m.text)}</div>
        <div class="meta">${m.from === "coach" ? "Треньор" : "Клиент"} • ${escapeHtml(m.ts || "")}</div>
      </div>
    `;
    box.appendChild(row);
  });
  box.scrollTop = box.scrollHeight;
}

function listenChat(clientId){
  if(unsubChat) { try{unsubChat();}catch{} }
  const cref = collection(db,"clients",clientId,"chat");
  const qref = query(cref, orderBy("createdAt","asc"), limit(200));
  unsubChat = onSnapshot(qref, (qs) => {
    const msgs = qs.docs.map(d => {
      const data=d.data();
      return { id:d.id, from:data.from, text:data.text, ts: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString("bg-BG",{hour12:false}) : "" };
    });
    renderChatMessages(msgs, false);
    // if portal open for same client, update too
    if(portalClientId === clientId){
      renderChatMessages(msgs, true);
    }
  });
}

async function sendMessage(from, text, clientId){
  const t = (text || "").trim();
  if(!t) return;
  const cref = collection(db,"clients",clientId,"chat");
  await addDoc(cref, { from, text: t, createdAt: serverTimestamp() });
}

async function clearChat(clientId){
  // Firestore doesn't have batch delete easily here; we do a limited delete.
  const cref = collection(db,"clients",clientId,"chat");
  const qs = await getDocs(query(cref, orderBy("createdAt","desc"), limit(200)));
  const deletions = qs.docs.map(d => deleteDoc(d.ref));
  await Promise.allSettled(deletions);
}

// ---------- Portal logic (no auth) ----------
let portalClientId = null;
let portalClient = null;
let unsubPortalClient = null;

function showPortal(){
  coachApp.classList.add("hidden");
  clientPortal.classList.remove("hidden");
  portalSub.textContent = "Вход с код";
  portalLogin.classList.remove("hidden");
  portalMain.classList.add("hidden");
}
function showCoach(){
  clientPortal.classList.add("hidden");
  coachApp.classList.remove("hidden");
  portalClientId = null;
  portalClient = null;
  if(unsubPortalClient){ try{unsubPortalClient();}catch{} unsubPortalClient=null; }
}

async function findClientByCode(code){
  const normalized = String(code || "").trim().toUpperCase();
  if(!normalized) return null;
  const qref = query(collection(db,"clients"), where("accessCode","==", normalized), limit(1));
  const qs = await getDocs(qref);
  if(qs.empty) return null;
  const d = qs.docs[0];
  return { id:d.id, ...d.data() };
}

function listenPortalClient(id){
  if(unsubPortalClient){ try{unsubPortalClient();}catch{} }
  unsubPortalClient = onSnapshot(doc(db,"clients",id), (snap) => {
    if(!snap.exists()) return;
    portalClient = { id:snap.id, ...snap.data() };
    portalRefresh();
  });
}

async function portalLoginWithCode(code){
  const client = await findClientByCode(code);
  if(!client) return openModal("Грешен код","Няма клиент с този код.");
  portalClientId = client.id;
  portalClientName.textContent = client.name || "Клиент";
  portalSub.textContent = `Влязъл като: ${client.name || "Клиент"}`;
  portalLogin.classList.add("hidden");
  portalMain.classList.remove("hidden");
  // defaults
  const td = todayBgDay();
  pDaySelect.value = td;
  pFoodDaySelect.value = td;
  setPortalTab("pplan");
  listenPortalClient(client.id);
}

function getPortalClient(){ return portalClient; }

// Portal render
function portalRenderPlan(){
  const c = getPortalClient();
  pPlanList.innerHTML = "";
  if(!c) return;
  const day = pDaySelect.value;
  const items = c.plan?.[day] || [];
  const ds = c.dayStatus?.[day];
  pDayDoneHint.textContent = ds?.done ? `✅ Маркирано на: ${ds.doneAt}` : `Още не е маркирано за този ден.`;

  if(!items.length){
    pPlanList.innerHTML = `<div class="empty muted">Няма упражнения за ${escapeHtml(day)}.</div>`;
    return;
  }
  items.forEach(ex => {
    const el = document.createElement("div");
    el.className = "plan-item";
    el.innerHTML = `
      <div class="left">
        <div class="title">${escapeHtml(ex.name || "")} ${ex.completed ? "✅" : ""}</div>
        <div class="sub">${escapeHtml([ex.sets?`${ex.sets} серии`:"", ex.reps?`${ex.reps} повтор.`:"", ex.rest?`почивка ${ex.rest}`:""].filter(Boolean).join(" • "))}</div>
        ${ex.note ? `<div class="note">${linkify(ex.note)}</div>` : ""}
      </div>
      <div></div>
    `;
    pPlanList.appendChild(el);
  });
}
async function portalDayDone(){
  const c = getPortalClient();
  if(!c) return;
  const day = pDaySelect.value;
  const dayStatus = c.dayStatus || {};
  dayStatus[day] = { done:true, doneAt: nowStr() };
  await updateDoc(doc(db,"clients",c.id), { dayStatus });
}
function portalRenderFood(){
  const c = getPortalClient();
  pFoodList.innerHTML = "";
  if(!c) return;
  const day = pFoodDaySelect.value;
  const meals = c.nutrition?.[day] || [];
  const fs = c.foodStatus?.[day];
  pFoodDoneHint.textContent = fs?.done ? `✅ Маркирано на: ${fs.doneAt}` : `Още не е маркирано за този ден.`;

  if(!meals.length){
    pFoodList.innerHTML = `<div class="empty muted">Няма зададен режим за ${escapeHtml(day)}.</div>`;
    return;
  }
  meals.forEach(m => {
    const el = document.createElement("div");
    el.className = "plan-item";
    el.innerHTML = `
      <div class="left">
        <div class="title">🍽 ${escapeHtml(m.title || "")}</div>
        <div class="sub">${escapeHtml(mealSummary(m) || "")}</div>
        ${m.desc ? `<div class="note">${linkify(m.desc)}</div>` : ""}
      </div>
      <div></div>
    `;
    pFoodList.appendChild(el);
  });
}
async function portalFoodDone(){
  const c = getPortalClient();
  if(!c) return;
  const day = pFoodDaySelect.value;
  const foodStatus = c.foodStatus || {};
  foodStatus[day] = { done:true, doneAt: nowStr() };
  await updateDoc(doc(db,"clients",c.id), { foodStatus });
}
function portalRenderPhotos(){
  const c = getPortalClient();
  pBeforeGallery.innerHTML = "";
  pAfterGallery.innerHTML = "";
  if(!c) return;
  const before = c.photos?.before || [];
  const after = c.photos?.after || [];
  if(!before.length) pBeforeGallery.innerHTML = `<div class="empty muted">Няма снимки “Преди”.</div>`;
  else before.forEach(ph => {
    const el = document.createElement("div");
    el.className="thumb";
    el.innerHTML=`<img src="${ph.dataUrl}" alt="before" />`;
    pBeforeGallery.appendChild(el);
  });
  if(!after.length) pAfterGallery.innerHTML = `<div class="empty muted">Няма снимки “След”.</div>`;
  else after.forEach(ph => {
    const el = document.createElement("div");
    el.className="thumb";
    el.innerHTML=`<img src="${ph.dataUrl}" alt="after" />`;
    pAfterGallery.appendChild(el);
  });
}
async function portalSendMessage(){
  const c = getPortalClient();
  const text = (pMsgText.value || "").trim();
  if(!c || !text) return;
  pMsgText.value = "";
  await sendMessage("client", text, c.id);
}
async function portalAddPhotos(kind, files){
  const c = getPortalClient();
  if(!c) return;
  if(!files || !files.length) return;
  // same storage as admin
  const ref = doc(db,"clients",c.id);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const cd = snap.data();
  const photos = cd.photos || { before: [], after: [] };
  const list = photos[kind] || [];
  for(const f of files){
    const dataUrl = await fileToDataUrl(f);
    list.push({ id: uid(), name: f.name, dataUrl, ts: nowStr() });
  }
  photos[kind] = list;
  await updateDoc(ref, { photos });
}

function portalRefresh(){
  portalRenderPlan();
  portalRenderFood();
  portalRenderPhotos();
  // chat updated by listener when active
}

// ---------- Events ----------
tabs.forEach(t => t.addEventListener("click", () => setTab(t.dataset.tab)));
pTabs.forEach(t => t.addEventListener("click", () => setPortalTab(t.dataset.ptab)));

loginBtn?.addEventListener("click", async () => {
  loginErr.textContent = "";
  const email = (loginEmail.value||"").trim();
  const pass = loginPass.value||"";
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    loginErr.textContent = e?.message || "Грешка при вход.";
  }
});

addClientBtn?.addEventListener("click", addClient);
daySelect?.addEventListener("change", async () => activeClientId && selectClient(activeClientId));
foodDaySelect?.addEventListener("change", async () => activeClientId && selectClient(activeClientId));
addExerciseBtn?.addEventListener("click", addExercise);
clearDayBtn?.addEventListener("click", clearDay);
addMealBtn?.addEventListener("click", addMeal);

addBeforeBtn?.addEventListener("click", () => addPhotos("before", beforeFile.files));
addAfterBtn?.addEventListener("click", () => addPhotos("after", afterFile.files));

saveProfileBtn?.addEventListener("click", saveProfile);
portalLinkEl?.addEventListener("focus", () => portalLinkEl.select());

sendMsgBtn?.addEventListener("click", async () => {
  if(!activeClientId) return;
  await sendMessage(msgFrom.value, msgText.value, activeClientId);
  msgText.value = "";
});
msgText?.addEventListener("keydown", (e) => {
  if(e.key === "Enter"){ e.preventDefault(); sendMsgBtn.click(); }
});
clearChatBtn?.addEventListener("click", async () => {
  if(!activeClientId) return;
  await clearChat(activeClientId);
});

backToCoachBtn?.addEventListener("click", showCoach);
portalLoginBtn?.addEventListener("click", () => portalLoginWithCode(portalCode.value));
portalCode?.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); portalLoginBtn.click(); } });

pDaySelect?.addEventListener("change", portalRenderPlan);
pFoodDaySelect?.addEventListener("change", portalRenderFood);
pDayDoneBtn?.addEventListener("click", portalDayDone);
pFoodDoneBtn?.addEventListener("click", portalFoodDone);
pSendMsgBtn?.addEventListener("click", portalSendMessage);
pMsgText?.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); pSendMsgBtn.click(); } });

pAddBeforeBtn?.addEventListener("click", () => portalAddPhotos("before", pBeforeFile.files));
pAddAfterBtn?.addEventListener("click", () => portalAddPhotos("after", pAfterFile.files));

// Admin logout button: reuse existing "resetBtn" area? If you want a logout button, use the top-left brand click.
document.addEventListener("keydown", async (e) => {
  if(e.key === "Escape") closeModalFn();
});

// ---------- Boot ----------
function showLogin(){
  loginScreen.classList.remove("hidden");
  coachApp.classList.add("hidden");
}
function showAdmin(){
  loginScreen.classList.add("hidden");
  coachApp.classList.remove("hidden");
}

async function bootPortal(){
  showPortal();
  if(urlCode){
    await portalLoginWithCode(urlCode);
  }
}

function bootAdmin(){
  setTab("chat");
  listenClients();
}

onAuthStateChanged(auth, (user) => {
  if(isPortal){
    // portal doesn't require auth; ignore auth state
    return;
  }
  if(user){
    showAdmin();
    bootAdmin();
  }else{
    showLogin();
  }
});

if(isPortal){
  bootPortal();
}else{
  // if user is already signed in, admin will show in onAuthStateChanged
  // else login overlay
  showLogin();
}
