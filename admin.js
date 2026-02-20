import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { uid, escapeHtml, linkify, normalizeDay } from "./utils.js";

const loginCard = document.getElementById("loginCard");
const appCard = document.getElementById("appCard");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("pass");
const loginBtn = document.getElementById("loginBtn");
const loginErr = document.getElementById("loginErr");
const signOutBtn = document.getElementById("signOutBtn");

const clientsList = document.getElementById("clientsList");
const newClientName = document.getElementById("newClientName");
const addClientBtn = document.getElementById("addClientBtn");

const wFile = document.getElementById("wFile");
const wImportBtn = document.getElementById("wImportBtn");
const wFormatBtn = document.getElementById("wFormatBtn");
const nFile = document.getElementById("nFile");
const nImportBtn = document.getElementById("nImportBtn");
const nFormatBtn = document.getElementById("nFormatBtn");
const daySel = document.getElementById("daySel");
const previewList = document.getElementById("previewList");

let activeClientId = null;
let activeClient = null;

function showErr(msg){
  loginErr.style.display = "block";
  loginErr.textContent = msg;
}
loginBtn.onclick = async ()=>{
  loginErr.style.display = "none";
  try{
    await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
  }catch(e){
    showErr(e.message || "Грешка");
  }
};
signOutBtn.onclick = ()=> signOut(auth);

onAuthStateChanged(auth, (user)=>{
  if(user){
    loginCard.style.display="none";
    appCard.style.display="grid";
    startClientsListener();
  }else{
    loginCard.style.display="block";
    appCard.style.display="none";
  }
});

async function startClientsListener(){
  const q = query(collection(db,"clients"), orderBy("createdAt","desc"));
  onSnapshot(q, (snap)=>{
    clientsList.innerHTML = "";
    snap.forEach((d)=>{
      const c = { id:d.id, ...d.data() };
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div>
          <div class="title">${escapeHtml(c.name||"")}</div>
          <div class="meta">
            <span class="pill">Код: <b>${escapeHtml(c.code||"")}</b></span>
            <span class="pill">${escapeHtml(c.id)}</span>
          </div>
          <div class="muted" style="font-size:12px;margin-top:8px;">Линк: <b>portal.html?code=${escapeHtml(c.code||"")}</b></div>
        </div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn ${activeClientId===c.id?'primary':''}" data-id="${c.id}">Избери</button>
        </div>
      `;
      el.querySelector("button").onclick = async ()=>{
        activeClientId = c.id;
        activeClient = c;
        // refresh selection styling by re-render
        startClientsListener();
        await loadActiveClient();
        renderPreview();
      };
      clientsList.appendChild(el);
    });
  });
}

addClientBtn.onclick = async ()=>{
  const name = newClientName.value.trim();
  if(!name) return;
  const code = uid(6);
  await addDoc(collection(db,"clients"), {
    name, code,
    createdAt: Date.now(),
    plan: {},
    nutrition: {},
    workoutStatus: {},
    foodStatus: {}
  });
  newClientName.value="";
};

daySel.onchange = ()=> renderPreview();

async function loadActiveClient(){
  if(!activeClientId) return;
  const d = await getDoc(doc(db,"clients",activeClientId));
  activeClient = { id:d.id, ...d.data() };
}

function openModal(title, body){
  alert(title + "\n\n" + body);
}

function sheetToRows(file){
  return new Promise(async (resolve,reject)=>{
    try{
      const name = (file.name||"").toLowerCase();
      let rows = [];
      if(name.endsWith(".csv")){
        const text = await file.text();
        const wb = XLSX.read(text, { type:"string" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval:"" });
      }else{
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type:"array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval:"" });
      }
      resolve(rows);
    }catch(e){ reject(e); }
  });
}

function normalizeHeader(h){
  const x = String(h||"").trim().toLowerCase();
  if(["program","programme","plan","template","програма","програми","режим"].includes(x)) return "Program";
  if(["day","weekday","ден","дни","седмица","ден от седмицата"].includes(x)) return "Day";
  if(["exercise","movement","ex","упражнение","упражнения","упр"].includes(x)) return "Exercise";
  if(["sets","set","серии","серия","сер"].includes(x)) return "Sets";
  if(["reps","rep","repetitions","повторения","повторение","повт"].includes(x)) return "Reps";
  if(["rest","pause","break","почивка","пауза","рест"].includes(x)) return "Rest";
  if(["note","notes","comment","comments","бележка","бележки","коментар"].includes(x)) return "Note";
  // food
  if(["meal","mealtitle","title","meal title","хранене","име","заглавие"].includes(x)) return "MealTitle";
  if(["description","desc","details","описание","детайли"].includes(x)) return "Desc";
  if(["kcal","calories","cal","ккал","калории"].includes(x)) return "Kcal";
  if(["protein","p","протеин"].includes(x)) return "P";
  if(["carbs","carb","c","въглехидрати","въглех","въгл"].includes(x)) return "C";
  if(["fat","fats","f","мазнини"].includes(x)) return "F";
  if(["time","hour","час","време"].includes(x)) return "Time";
  if(["tag","tags","label","таг","етикет"].includes(x)) return "Tag";
  if(["adminnote","admin note","coach note","админ бележка","треньор бележка","бележка треньор"].includes(x)) return "AdminNote";
  return "";
}
function mapRowKeys(row){
  const out={};
  for(const [k,v] of Object.entries(row||{})){
    const nk = normalizeHeader(k);
    if(nk) out[nk]=v;
    else out[k]=v;
  }
  return out;
}
function safeStr(v){ return String(v??"").trim(); }

function parseWorkout(rows){
  // returns plan: {DayName: [exercise...]}
  const plan = {};
  for(const raw of rows.map(mapRowKeys)){
    const program = safeStr(raw.Program);
    const day = normalizeDay(raw.Day);
    const exName = safeStr(raw.Exercise);
    if(!exName) continue;
    plan[day] ||= [];
    plan[day].push({
      id: uid(10),
      name: exName,
      sets: safeStr(raw.Sets),
      reps: safeStr(raw.Reps),
      rest: safeStr(raw.Rest),
      note: safeStr(raw.Note),
      adminNote: "",
      completed:false,
      completedAt:null
    });
  }
  return plan;
}
function parseFood(rows){
  const nutrition = {};
  for(const raw0 of rows.map(mapRowKeys)){
    const day = normalizeDay(raw0.Day);
    const title = safeStr(raw0.MealTitle);
    if(!title) continue;
    nutrition[day] ||= [];
    nutrition[day].push({
      id: uid(10),
      title,
      desc: safeStr(raw0.Desc),
      kcal: safeStr(raw0.Kcal)==="" ? "" : Number(raw0.Kcal),
      p: safeStr(raw0.P)==="" ? "" : Number(raw0.P),
      c: safeStr(raw0.C)==="" ? "" : Number(raw0.C),
      f: safeStr(raw0.F)==="" ? "" : Number(raw0.F),
      time: safeStr(raw0.Time),
      tag: safeStr(raw0.Tag).replaceAll("#",""),
      adminNote: safeStr(raw0.AdminNote)
    });
  }
  return nutrition;
}

async function applyToClient(patch){
  if(!activeClientId) return openModal("Няма избран клиент","Избери клиент отляво.");
  await updateDoc(doc(db,"clients",activeClientId), patch);
  await loadActiveClient();
  renderPreview();
}

wFormatBtn.onclick = ()=> openModal("Формат (тренировки)",
`Колони (EN): Program | Day | Exercise | Sets | Reps | Rest | Note
Колони (BG): Програма | Ден | Упражнение | Серии | Повторения | Почивка | Бележка

Day може да е: Понеделник или Mon/Monday или Day 1 – ... или 1..7`);

nFormatBtn.onclick = ()=> openModal("Формат (хранене)",
`Колони (EN): Program | Day | MealTitle | Desc | Kcal | P | C | F | Time | Tag | AdminNote
Колони (BG): Програма | Ден | Хранене | Описание | Ккал | Протеин | Въглехидрати | Мазнини | Час | Таг | Админ бележка`);

wImportBtn.onclick = async ()=>{
  if(!wFile.files?.length) return openModal("Импорт","Избери файл.");
  const rows = await sheetToRows(wFile.files[0]);
  const plan = parseWorkout(rows);
  await applyToClient({ plan, workoutStatus:{} });
  wFile.value="";
  openModal("Готово","Тренировките са приложени към избрания клиент.");
};
nImportBtn.onclick = async ()=>{
  if(!nFile.files?.length) return openModal("Импорт","Избери файл.");
  const rows = await sheetToRows(nFile.files[0]);
  const nutrition = parseFood(rows);
  await applyToClient({ nutrition, foodStatus:{} });
  nFile.value="";
  openModal("Готово","Храненето е приложено към избрания клиент.");
};

function renderPreview(){
  previewList.innerHTML = "";
  if(!activeClient){ previewList.innerHTML = `<div class="muted">Избери клиент.</div>`; return; }
  const day = daySel.value;
  const w = (activeClient.plan?.[day]||[]);
  const n = (activeClient.nutrition?.[day]||[]);

  const head = document.createElement("div");
  head.className="muted";
  head.style.fontWeight="900";
  head.textContent = `План за ${day}: ${w.length} упр., ${n.length} хранения`;
  previewList.appendChild(head);

  w.slice(0,6).forEach(ex=>{
    const el=document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div>
        <div class="title">${escapeHtml(ex.name)}</div>
        <div class="meta">
          ${ex.sets?`<span class="pill">${escapeHtml(ex.sets)} серии</span>`:""}
          ${ex.reps?`<span class="pill">${escapeHtml(ex.reps)} повт</span>`:""}
          ${ex.rest?`<span class="pill">⏱ ${escapeHtml(ex.rest)}</span>`:""}
        </div>
        ${ex.note?`<div class="note">${linkify(escapeHtml(ex.note))}</div>`:""}
      </div>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" data-id="${ex.id}">✏</button>
      </div>
    `;
    el.querySelector("button").onclick = async ()=>{
      const name = prompt("Упражнение", ex.name) ?? ex.name;
      ex.name = name.trim() || ex.name;
      await applyToClient({ plan: activeClient.plan });
    };
    previewList.appendChild(el);
  });
}
