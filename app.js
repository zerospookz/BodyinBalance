(() => {
  const KEY = "coach_portal_with_nutrition_v1";

  // ---------- Helpers ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { clients: [], activeId: null, programs: [], nutritionPrograms: [], notifications: [] };
      const parsed = JSON.parse(raw);
      parsed.clients ||= [];
      parsed.programs ||= [];
      parsed.nutritionPrograms ||= [];
      parsed.notifications ||= [];
      if (!("activeId" in parsed)) parsed.activeId = null;
      return parsed;
    } catch {
      return { clients: [], activeId: null, programs: [], nutritionPrograms: [], notifications: [] };
    }
  }
  function saveState(st) { localStorage.setItem(KEY, JSON.stringify(st)); }
  function uid() { return Math.random().toString(16).slice(2) + Date.now().toString(16); }
  function nowStr() { return new Date().toLocaleString("bg-BG", { hour12: false }); }
  function escapeHtml(s) {
    return (s ?? "").toString()
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function linkify(plainText) {
    const escaped = escapeHtml(plainText || "");
    const urlRegex = /(\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?])/gi;
    return escaped.replace(urlRegex, (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
  }
  function todayBgDay() {
    const d = new Date().getDay(); // 0 Sun .. 6 Sat
    const map = { 1:"Понеделник",2:"Вторник",3:"Сряда",4:"Четвъртък",5:"Петък",6:"Събота",0:"Неделя" };
    return map[d] || "Понеделник";
  }

  async function ensureNotificationPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try { return (await Notification.requestPermission()) === "granted"; }
    catch { return false; }
  }
  
  async function loadXlsxLib() {
    // Dynamically load XLSX if CDN didn't load (common on some networks)
    if (typeof XLSX !== "undefined") return true;
    return await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      s.onload = () => resolve(typeof XLSX !== "undefined");
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  function normalizeHeader(h) {
    const x = String(h || "").trim().toLowerCase();
    // English
    if (["program","programme","plan","template"].includes(x)) return "Program";
    if (["day","weekday"].includes(x)) return "Day";
    if (["exercise","movement","ex"].includes(x)) return "Exercise";
    if (["sets","set"].includes(x)) return "Sets";
    if (["reps","rep","repetitions"].includes(x)) return "Reps";
    if (["rest","pause","break"].includes(x)) return "Rest";
    if (["note","notes","comment","comments"].includes(x)) return "Note";
    // Bulgarian
    if (["програма","програми","режим"].includes(x)) return "Program";
    if (["ден","дни","седмица","ден от седмицата"].includes(x)) return "Day";
    if (["упражнение","упражнения"].includes(x)) return "Exercise";
    if (["серии","серия"].includes(x)) return "Sets";
    if (["повторения","повторение","репс"].includes(x)) return "Reps";
    if (["почивка","пауза","рест"].includes(x)) return "Rest";
    if (["бележка","бележки","коментар"].includes(x)) return "Note";
    return "";
  }

  function normalizeMealHeader(h) {
    const x = String(h || "").trim().toLowerCase();
    // EN
    if (["meal","mealtitle","title","meal title"].includes(x)) return "MealTitle";
    if (["description","desc","details"].includes(x)) return "Desc";
    if (["kcal","calories","cal"].includes(x)) return "Kcal";
    if (["protein","p"].includes(x)) return "P";
    if (["carbs","carb","c"].includes(x)) return "C";
    if (["fat","fats","f"].includes(x)) return "F";
    if (["time","hour"].includes(x)) return "Time";
    if (["tag","tags","label"].includes(x)) return "Tag";
    if (["adminnote","admin note","coach note"].includes(x)) return "AdminNote";
    // BG
    if (["хранене","име","заглавие","заглавие хранене"].includes(x)) return "MealTitle";
    if (["описание","детайли"].includes(x)) return "Desc";
    if (["ккал","калории"].includes(x)) return "Kcal";
    if (["протеин","п"].includes(x)) return "P";
    if (["въглехидрати","въглех","въгл","c"].includes(x)) return "C";
    if (["мазнини","f"].includes(x)) return "F";
    if (["час","време"].includes(x)) return "Time";
    if (["таг","етикет"].includes(x)) return "Tag";
    if (["админ бележка","треньор бележка","бележка треньор"].includes(x)) return "AdminNote";
    return "";
  }

  function mapRowKeys(row) {
    const out = {};
    for (const [k,v] of Object.entries(row || {})) {
      const nk = normalizeHeader(k);
      if (nk) out[nk] = v;
      else out[k] = v;
    }
    return out;
  }

  function showDesktopNotification(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try { new Notification(title, { body }); } catch {}
  }

  // ---------- State ----------
  let state = loadState();

  // ---------- DOM ----------
  const coachApp = document.getElementById("coachApp");
  const clientPortal = document.getElementById("clientPortal");

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

  // Chat
  const chatBox = document.getElementById("chatBox");
  const msgFrom = document.getElementById("msgFrom");
  const msgText = document.getElementById("msgText");
  const sendMsgBtn = document.getElementById("sendMsgBtn");
  const clearChatBtn = document.getElementById("clearChatBtn");

  // Training
  const daySelect = document.getElementById("daySelect");
  const planDayTitle = document.getElementById("planDayTitle");
  const planList = document.getElementById("planList");
  const exName = document.getElementById("exName");
  const exSets = document.getElementById("exSets");
  const exReps = document.getElementById("exReps");
  const exRest = document.getElementById("exRest");
  const exNote = document.getElementById("exNote");
  const exAdminNote = document.getElementById("exAdminNote");
  const addExBtn = document.getElementById("addExBtn");
  const clearDayBtn = document.getElementById("clearDayBtn");
  const copyPlanBtn = document.getElementById("copyPlanBtn");
  const markDayDoneAdminBtn = document.getElementById("markDayDoneAdminBtn");

  // Excel
  const excelFile = document.getElementById("excelFile");
  const importExcelBtn = document.getElementById("importExcelBtn");
  const programSelect = document.getElementById("programSelect");
  const applyProgramBtn = document.getElementById("applyProgramBtn");
  const applyProgramOverwriteBtn = document.getElementById("applyProgramOverwriteBtn");
  const openExcelFormatBtn = document.getElementById("openExcelFormatBtn");

  // Nutrition (Admin)
  const nExcelFile = document.getElementById("nExcelFile");
  const nImportBtn = document.getElementById("nImportBtn");
  const nFormatBtn = document.getElementById("nFormatBtn");
  const nProgramSelect = document.getElementById("nProgramSelect");
  const nApplyBtn = document.getElementById("nApplyBtn");
  const nApplyOverwriteBtn = document.getElementById("nApplyOverwriteBtn");

  const nDaySelect = document.getElementById("nDaySelect");
  const nClearDayBtn = document.getElementById("nClearDayBtn");
  const mealTitle = document.getElementById("mealTitle");
  const mealDesc = document.getElementById("mealDesc");
  const mealKcal = document.getElementById("mealKcal");
  const mealP = document.getElementById("mealP");
  const mealC = document.getElementById("mealC");
  const mealF = document.getElementById("mealF");
  const mealTime = document.getElementById("mealTime");
  const mealTag = document.getElementById("mealTag");
  const mealAdminNote = document.getElementById("mealAdminNote");
  const addMealBtn = document.getElementById("addMealBtn");
  const nutritionList = document.getElementById("nutritionList");
  const copyNutritionBtn = document.getElementById("copyNutritionBtn");

  // Photos Admin
  const beforeFile = document.getElementById("beforeFile");
  const afterFile = document.getElementById("afterFile");
  const addBeforeBtn = document.getElementById("addBeforeBtn");
  const addAfterBtn = document.getElementById("addAfterBtn");
  const clearPhotosBtn = document.getElementById("clearPhotosBtn");
  const beforeGallery = document.getElementById("beforeGallery");
  const afterGallery = document.getElementById("afterGallery");

  // Profile
  const goal = document.getElementById("goal");
  const weight = document.getElementById("weight");
  const height = document.getElementById("height");
  const freq = document.getElementById("freq");
  const limits = document.getElementById("limits");
  const saveProfileBtn = document.getElementById("saveProfileBtn");
  const profilePreview = document.getElementById("profilePreview");
  const payStatus = document.getElementById("payStatus");
  const packageName = document.getElementById("packageName");
  const packagePrice = document.getElementById("packagePrice");
  const inviteBtn = document.getElementById("inviteBtn");
  const togglePaidBtn = document.getElementById("togglePaidBtn");
  const genCodeBtn = document.getElementById("genCodeBtn");
  const copyPortalBtn = document.getElementById("copyPortalBtn");
  const accessCode = document.getElementById("accessCode");

  // Sidebar buttons
  const notifBtn = document.getElementById("notifBtn");
  const notifCount = document.getElementById("notifCount");
  const exportBtn = document.getElementById("exportBtn");
  const resetBtn = document.getElementById("resetBtn");
  const openPortalBtn = document.getElementById("openPortalBtn");

  // Portal
  const backToCoachBtn = document.getElementById("backToCoachBtn");
  const portalSub = document.getElementById("portalSub");
  const portalLogin = document.getElementById("portalLogin");
  const portalMain = document.getElementById("portalMain");
  const portalCode = document.getElementById("portalCode");
  const portalLoginBtn = document.getElementById("portalLoginBtn");
  const portalClientName = document.getElementById("portalClientName");

  const pTabs = document.querySelectorAll(".tab[data-ptab]");
  const ptabPlan = document.getElementById("ptab-pplan");
  const ptabFood = document.getElementById("ptab-pfood");
  const ptabChat = document.getElementById("ptab-pchat");
  const ptabPhotos = document.getElementById("ptab-pphotos");

  const pDaySelect = document.getElementById("pDaySelect");
  const pPlanList = document.getElementById("pPlanList");
  const pMarkDayDoneBtn = document.getElementById("pMarkDayDoneBtn");
  const pDayDoneHint = document.getElementById("pDayDoneHint");

  const pFoodDaySelect = document.getElementById("pFoodDaySelect");
  const pFoodList = document.getElementById("pFoodList");
  const pFoodDoneBtn = document.getElementById("pFoodDoneBtn");
  const pFoodHint = document.getElementById("pFoodHint");

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
  const closeModalBtn = document.getElementById("closeModal");
  const closeModalBtn2 = document.getElementById("closeModal2");
  const copyModalBtn = document.getElementById("copyModalBtn");

  function openModal(title, text) {
    modalTitle.textContent = title;
    modalText.value = text;
    modal.classList.remove("hidden");
  }
  function closeModal() { modal.classList.add("hidden"); }
  closeModalBtn.addEventListener("click", closeModal);
  closeModalBtn2.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });
  copyModalBtn.addEventListener("click", () => navigator.clipboard.writeText(modalText.value).catch(()=>{}));

  // ---------- Data shapes ----------
  function ensureClientShape(c) {
    c.chat ||= [];
    c.plan ||= {};                 // training
    c.nutrition ||= {};            // nutrition per day: { day: [meals...] }
    c.photos ||= { before: [], after: [] };
    c.photos.before ||= [];
    c.photos.after ||= [];

    c.profile ||= {
      goal:"", weight:"", height:"", freq:"", limits:"",
      payStatus:"unpaid", packageName:"", packagePrice:"",
      accessCode:""
    };

    c.dayStatus ||= {};            // training day completion: {day:{done, doneAt}}
    c.foodStatus ||= {};           // nutrition day completion: {day:{done, doneAt}}

    // normalize exercises
    for (const day of Object.keys(c.plan)) {
      c.plan[day] ||= [];
      c.plan[day].forEach(ex => {
        ex.note ||= "";
        ex.adminNote ||= "";
        if (typeof ex.completed !== "boolean") ex.completed = false;
        if (!("completedAt" in ex)) ex.completedAt = null;
      });
    }

    // normalize meals
    for (const day of Object.keys(c.nutrition)) {
      c.nutrition[day] ||= [];
      c.nutrition[day].forEach(m => {
        m.title ||= "Хранене";
        m.desc ||= "";
        m.kcal = (m.kcal ?? "") === "" ? "" : Number(m.kcal);
        m.p = (m.p ?? "") === "" ? "" : Number(m.p);
        m.c = (m.c ?? "") === "" ? "" : Number(m.c);
        m.f = (m.f ?? "") === "" ? "" : Number(m.f);
        m.time ||= "";
        m.tag ||= "";
        m.adminNote ||= "";
      });
    }

    return c;
  }
  function ensureProgramShape(p) { p.days ||= {}; return p; }
  function ensureNutritionProgramShape(p) { p.days ||= {}; return p; }
  function getActiveClient() { return state.clients.find(x => x.id === state.activeId) || null; }

  // ---------- Notifications ----------
  function pushAdminNotification({ clientId, clientName, type, day, text }) {
    const n = { id: uid(), ts: nowStr(), clientId, clientName, type, day: day || "", text: text || "", read: false };
    state.notifications.unshift(n);
    saveState(state);
    renderNotifCount();
    if (!coachApp.classList.contains("hidden")) {
      showDesktopNotification("✅ Нова нотификация", `${clientName} • ${type}${day ? " • " + day : ""}`);
    }
  }
  function unreadCount() { return (state.notifications || []).filter(n => !n.read).length; }
  function renderNotifCount() { if (notifCount) notifCount.textContent = String(unreadCount()); }

  function openNotificationsModal() {
    const list = (state.notifications || []).slice(0, 60);
    if (!list.length) return openModal("Нотификации", "Няма нотификации още.");
    list.forEach(n => n.read = true);
    saveState(state);
    renderNotifCount();
    const text = list.map(n => {
      const line1 = `[${n.ts}] ${n.clientName}`;
      const line2 =
        n.type === "day_done" ? `  ✅ Завършен тренировъчен ден: ${n.day}` :
        n.type === "exercise_done" ? `  ✅ Завършено упражнение: ${n.text} (${n.day})` :
        n.type === "food_done" ? `  🥗 Следван режим: ${n.day}` :
        n.type === "message" ? `  💬 ${n.text}` :
        `  ${n.text}`;
      return `${line1}\n${line2}\n`;
    }).join("\n");
    openModal("Нотификации (последни 60)", text);
  }

  // ---------- UI Renders ----------
  function renderClients() {
    clientsList.innerHTML = "";
    if (!state.clients.length) {
      clientsList.innerHTML = `<div class="empty muted">Няма клиенти. Добави първия.</div>`;
      return;
    }
    state.clients.forEach(c => {
      const item = document.createElement("div");
      item.className = "client-item" + (c.id === state.activeId ? " active" : "");
      const last = c.chat.length ? c.chat[c.chat.length - 1] : null;
      const meta = last ? `Последно: ${last.ts}` : "Няма чат";

      const paid = (c.profile.payStatus || "unpaid") === "paid";
      const badgeClass = paid ? "badge paid" : "badge unpaid";
      const badgeText = paid ? "Платено" : "Неплатено";

      item.innerHTML = `
        <div>
          <div style="font-weight:800">${escapeHtml(c.name)}</div>
          <div class="client-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="${badgeClass}">${badgeText}</div>
      `;
      item.addEventListener("click", () => {
        state.activeId = c.id;
        saveState(state);
        renderAll();
      });
      clientsList.appendChild(item);
    });
  }

  function renderActiveHeader() {
    const c = getActiveClient();
    if (!c) {
      activeTitle.textContent = "Избери клиент";
      activeMeta.textContent = "Добави клиент отляво и кликни върху него.";
      return;
    }
    activeTitle.textContent = c.name;
    activeMeta.textContent = "Admin: тренировки + хранене • portal • снимки • excel";
  }

  function renderChat() {
    const c = getActiveClient();
    chatBox.innerHTML = "";
    if (!c) return (chatBox.innerHTML = `<div class="empty muted">Избери клиент.</div>`);
    if (!c.chat.length) return (chatBox.innerHTML = `<div class="empty muted">Няма съобщения. Напиши първото.</div>`);
    c.chat.forEach(m => {
      const row = document.createElement("div");
      row.className = "msg " + (m.from === "coach" ? "coach" : "client");
      row.innerHTML = `
        <div class="bubble">
          <div>${linkify(m.text)}</div>
          <div class="meta">${m.from === "coach" ? "Треньор" : "Клиент"} • ${escapeHtml(m.ts)}</div>
        </div>
      `;
      chatBox.appendChild(row);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // --- Training plan ---
  function renderPlan() {
    const c = getActiveClient();
    const day = daySelect.value;
    planDayTitle.textContent = day;
    planList.innerHTML = "";

    if (!c) return (planList.innerHTML = `<div class="empty muted">Избери клиент.</div>`);

    const ds = c.dayStatus?.[day];
    const hint = document.createElement("div");
    hint.className = "hint muted";
    hint.textContent = ds?.done ? `✅ Денят е маркиран: ${ds.doneAt || ""}` : "Денят не е маркиран.";
    planList.appendChild(hint);

    const items = c.plan[day] || [];
    if (!items.length) {
      planList.insertAdjacentHTML("beforeend", `<div class="empty muted">Няма упражнения за този ден.</div>`);
      return;
    }

    items.forEach(ex => {
      const el = document.createElement("div");
      el.className = "plan-item";
      el.innerHTML = `
        <div class="left">
          <div class="title">${escapeHtml(ex.name)} ${ex.completed ? "✅" : ""}</div>
          <div class="sub">${escapeHtml(ex.sets)} серии • ${escapeHtml(ex.reps)} повторения • почивка ${escapeHtml(ex.rest)}</div>
          ${ex.note ? `<div class="note">За клиента: ${linkify(ex.note)}</div>` : ""}
          ${ex.adminNote ? `<div class="note" style="color: rgba(110,231,255,.95);">Admin: ${linkify(ex.adminNote)}</div>` : ""}
          ${ex.completedAt ? `<div class="note">Изпълнено на: ${escapeHtml(ex.completedAt)}</div>` : ""}
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="icon-btn edit-btn" title="Редакция">✏</button>
          <button class="icon-btn toggle-btn" title="Toggle completed">✅</button>
          <button class="icon-btn del-btn" title="Изтрий">🗑</button>
        </div>
      `;
      el.querySelector(".del-btn").addEventListener("click", () => removeExercise(day, ex.id));
      el.querySelector(".toggle-btn").addEventListener("click", () => toggleExerciseCompleted(c, day, ex.id));
      el.querySelector(".edit-btn").addEventListener("click", () => editExerciseInline(el, day, ex.id));
      planList.appendChild(el);
    });
  }

  function renderNutritionPrograms() {
    if (!nProgramSelect) return;
    nProgramSelect.innerHTML = "";
    const list = state.nutritionPrograms || [];
    if (!list.length) {
      nProgramSelect.innerHTML = `<option value="">— няма импортирани —</option>`;
      return;
    }
    nProgramSelect.innerHTML = `<option value="">— избери —</option>`;
    list.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      nProgramSelect.appendChild(opt);
    });
  }

  function renderPrograms() {
    programSelect.innerHTML = "";
    if (!state.programs.length) return (programSelect.innerHTML = `<option value="">— няма импортирани —</option>`);
    programSelect.innerHTML = `<option value="">— избери —</option>`;
    state.programs.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      programSelect.appendChild(opt);
    });
  }

  // --- Nutrition (Admin) ---
  function mealSummary(m) {
    const parts = [];
    if (m.kcal !== "" && m.kcal !== null && m.kcal !== undefined) parts.push(`${m.kcal} kcal`);
    const macros = [];
    if (m.p !== "" && m.p !== null && m.p !== undefined) macros.push(`P ${m.p}g`);
    if (m.c !== "" && m.c !== null && m.c !== undefined) macros.push(`C ${m.c}g`);
    if (m.f !== "" && m.f !== null && m.f !== undefined) macros.push(`F ${m.f}g`);
    if (macros.length) parts.push(macros.join(" • "));
    if (m.time) parts.push(`⏱ ${m.time}`);
    if (m.tag) parts.push(`#${m.tag}`);
    return parts.join(" • ");
  }

  function renderNutrition() {
    const c = getActiveClient();
    const day = nDaySelect.value;
    nutritionList.innerHTML = "";

    if (!c) return (nutritionList.innerHTML = `<div class="empty muted">Избери клиент.</div>`);

    const ds = c.foodStatus?.[day];
    const hint = document.createElement("div");
    hint.className = "hint muted";
    hint.textContent = ds?.done ? `🥗 Клиентът е отбелязал режим: ${ds.doneAt || ""}` : "Няма отбелязване за режима.";
    nutritionList.appendChild(hint);

    const meals = c.nutrition[day] || [];
    if (!meals.length) {
      nutritionList.insertAdjacentHTML("beforeend", `<div class="empty muted">Няма зададен хранителен режим за този ден.</div>`);
      return;
    }

    meals.forEach(m => {
      const el = document.createElement("div");
      el.className = "plan-item";
      el.innerHTML = `
        <div class="left">
          <div class="title">🍽 ${escapeHtml(m.title)}</div>
          <div class="sub">${escapeHtml(mealSummary(m) || "")}</div>
          ${m.desc ? `<div class="note">${linkify(m.desc)}</div>` : ""}
          ${m.adminNote ? `<div class="note" style="color: rgba(110,231,255,.95);">Admin: ${linkify(m.adminNote)}</div>` : ""}
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="icon-btn edit-btn" title="Редакция">✏</button>
          <button class="icon-btn del-btn" title="Изтрий">🗑</button>
        </div>
      `;
      el.querySelector(".del-btn").addEventListener("click", () => removeMeal(day, m.id));
      el.querySelector(".edit-btn").addEventListener("click", () => editMealInline(el, day, m.id));
      nutritionList.appendChild(el);
    });
  }

  // --- Photos ---
  function makeThumb(photo, type, onDelete) {
    const wrap = document.createElement("div");
    wrap.className = "thumb";
    wrap.innerHTML = `
      <img src="${photo.dataUrl}" alt="${type}" />
      <div class="thumb-actions">
        <button class="icon-btn" title="Отвори">🔍</button>
        <button class="icon-btn" title="Изтрий">🗑</button>
      </div>
      <div class="thumb-meta">${escapeHtml(photo.ts || "")}</div>
    `;
    const [openBtn, delBtn] = wrap.querySelectorAll("button");
    openBtn.addEventListener("click", () => openModal("Снимка (dataUrl)", photo.dataUrl));
    delBtn.addEventListener("click", () => onDelete(photo.id));
    return wrap;
  }

  function renderPhotos() {
    const c = getActiveClient();
    beforeGallery.innerHTML = "";
    afterGallery.innerHTML = "";
    if (!c) {
      beforeGallery.innerHTML = `<div class="empty muted">Избери клиент.</div>`;
      afterGallery.innerHTML = `<div class="empty muted">Избери клиент.</div>`;
      return;
    }
    const before = c.photos.before || [];
    const after = c.photos.after || [];
    if (!before.length) beforeGallery.innerHTML = `<div class="empty muted">Няма снимки “Преди”.</div>`;
    else before.forEach(ph => beforeGallery.appendChild(makeThumb(ph, "before", (id)=>deletePhoto(c,"before",id))));
    if (!after.length) afterGallery.innerHTML = `<div class="empty muted">Няма снимки “След”.</div>`;
    else after.forEach(ph => afterGallery.appendChild(makeThumb(ph, "after", (id)=>deletePhoto(c,"after",id))));
  }

  function renderProfile() {
    const c = getActiveClient();
    if (!c) return (profilePreview.textContent = "Избери клиент.");

    goal.value = c.profile.goal || "";
    weight.value = c.profile.weight || "";
    height.value = c.profile.height || "";
    freq.value = c.profile.freq || "";
    limits.value = c.profile.limits || "";
    payStatus.value = c.profile.payStatus || "unpaid";
    packageName.value = c.profile.packageName || "";
    packagePrice.value = c.profile.packagePrice || "";
    accessCode.value = c.profile.accessCode || "";

    const daySummary = Object.fromEntries(Object.entries(c.dayStatus || {}).map(([d,v]) => [d, v?.done ? v.doneAt : null]));
    const foodSummary = Object.fromEntries(Object.entries(c.foodStatus || {}).map(([d,v]) => [d, v?.done ? v.doneAt : null]));
    profilePreview.textContent = JSON.stringify({
      клиент: c.name,
      статус: c.profile.payStatus === "paid" ? "Платено" : "Неплатено",
      код_достъп: c.profile.accessCode || "",
      тренировки_отбелязани: daySummary,
      хранене_отбелязано: foodSummary,
      снимки_преди: (c.photos.before||[]).length,
      снимки_след: (c.photos.after||[]).length
    }, null, 2);
  }

  function renderAll() {
    state.clients = state.clients.map(ensureClientShape);
    state.programs = state.programs.map(ensureProgramShape);
    state.nutritionPrograms = (state.nutritionPrograms || []).map(ensureNutritionProgramShape);
    state.notifications ||= [];
    saveState(state);

    renderClients();
    renderActiveHeader();
    renderChat();
    renderPlan();
    renderNutrition();
    renderPrograms();
    renderNutritionPrograms();
    renderPhotos();
    renderProfile();
    renderNotifCount();

    if (!clientPortal.classList.contains("hidden")) portalRefresh();
  }

  // ---------- Admin actions ----------
  function addClient() {
    const name = clientName.value.trim();
    if (!name) return openModal("Липсва име", "Напиши име на клиент.");

    const c = ensureClientShape({
      id: uid(),
      name,
      chat: [],
      plan: {},
      nutrition: {},
      dayStatus: {},
      foodStatus: {},
      photos: { before: [], after: [] },
      profile: { goal:"", weight:"", height:"", freq:"", limits:"", payStatus:"unpaid", packageName:"", packagePrice:"", accessCode:"" }
    });

    state.clients.unshift(c);
    state.activeId = c.id;
    clientName.value = "";
    saveState(state);
    renderAll();
  }

  function sendAdminChat() {
    const c = getActiveClient();
    const text = msgText.value.trim();
    if (!c) return openModal("Няма избран клиент", "Избери клиент отляво.");
    if (!text) return;

    c.chat.push({ id: uid(), from: msgFrom.value, text, ts: nowStr() });
    msgText.value = "";
    saveState(state);
    renderAll();
  }

  function clearChat() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    c.chat = [];
    saveState(state);
    renderAll();
  }

  // Training CRUD
  function addExercise() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент отляво.");
    const day = daySelect.value;
    const name = exName.value.trim();
    if (!name) return openModal("Липсва упражнение", "Напиши име на упражнението.");

    c.plan[day] ||= [];
    c.plan[day].push({
      id: uid(),
      name,
      sets: String(exSets.value || "3"),
      reps: String(exReps.value || "8-10"),
      rest: String(exRest.value || "90s"),
      note: exNote.value.trim(),
      adminNote: exAdminNote.value.trim(),
      completed: false,
      completedAt: null
    });

    exName.value = "";
    exNote.value = "";
    exAdminNote.value = "";
    saveState(state);
    renderAll();
  }

  function removeExercise(day, exId) {
    const c = getActiveClient();
    if (!c) return;
    c.plan[day] = (c.plan[day] || []).filter(x => x.id !== exId);
    saveState(state);
    renderAll();
  }

  function toggleExerciseCompleted(client, day, exId) {
    const ex = (client.plan[day] || []).find(x => x.id === exId);
    if (!ex) return;
    ex.completed = !ex.completed;
    ex.completedAt = ex.completed ? nowStr() : null;
    saveState(state);
    renderAll();
  }

  function editExercise(day, exId) {
    const c = getActiveClient();
    if (!c) return;
    const ex = (c.plan[day] || []).find(x => x.id === exId);
    if (!ex) return;

    const newName = prompt("Име на упражнение:", ex.name); if (newName === null) return;
    const newSets = prompt("Серии:", ex.sets); if (newSets === null) return;
    const newReps = prompt("Повторения:", ex.reps); if (newReps === null) return;
    const newRest = prompt("Почивка:", ex.rest); if (newRest === null) return;
    const newNote = prompt("Бележка за клиента (видима):", ex.note || ""); if (newNote === null) return;
    const newAdminNote = prompt("Admin бележка (скрита):", ex.adminNote || ""); if (newAdminNote === null) return;

    ex.name = newName.trim() || ex.name;
    ex.sets = String(newSets).trim() || ex.sets;
    ex.reps = String(newReps).trim() || ex.reps;
    ex.rest = String(newRest).trim() || ex.rest;
    ex.note = String(newNote).trim();
    ex.adminNote = String(newAdminNote).trim();

    saveState(state);
    renderAll();
  }

  function editExerciseInline(containerEl, day, exId) {
    const c = getActiveClient();
    if (!c) return;
    const ex = (c.plan[day] || []).find(x => x.id === exId);
    if (!ex) return;

    // Prevent double editor
    if (containerEl.classList.contains("is-editing")) return;
    containerEl.classList.add("is-editing");

    const originalHtml = containerEl.innerHTML;

    containerEl.innerHTML = `
      <div class="left" style="width:100%">
        <div class="title">Редакция</div>
        <div class="grid2" style="display:grid; grid-template-columns: 1.4fr .6fr; gap:10px; margin-top:10px;">
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">Упражнение</label>
            <input class="select" id="e_name" value="${escapeHtml(ex.name)}" />
          </div>
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">Почивка</label>
            <input class="select" id="e_rest" value="${escapeHtml(ex.rest)}" placeholder="например 60s" />
          </div>
        </div>

        <div class="grid3" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-top:10px;">
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">Серии</label>
            <input class="select" id="e_sets" value="${escapeHtml(ex.sets)}" />
          </div>
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">Повторения</label>
            <input class="select" id="e_reps" value="${escapeHtml(ex.reps)}" />
          </div>
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">Статус</label>
            <select class="select select-modern" id="e_done">
              <option value="0">Не е изпълнено</option>
              <option value="1">Изпълнено ✅</option>
            </select>
          </div>
        </div>

        <div style="margin-top:10px;">
          <label class="muted" style="display:block; margin-bottom:6px;">Бележка за клиента (видима)</label>
          <textarea class="select" id="e_note" rows="2" style="min-height:72px; resize:vertical;">${escapeHtml(ex.note || "")}</textarea>
        </div>

        <div style="margin-top:10px;">
          <label class="muted" style="display:block; margin-bottom:6px;">Admin бележка (скрита)</label>
          <textarea class="select" id="e_admin" rows="2" style="min-height:72px; resize:vertical;">${escapeHtml(ex.adminNote || "")}</textarea>
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px; flex-wrap:wrap;">
          <button class="btn ghost" id="e_cancel">Отказ</button>
          <button class="btn primary" id="e_save">Запази</button>
        </div>
      </div>
    `;

    // Set status
    try { containerEl.querySelector("#e_done").value = ex.completed ? "1" : "0"; } catch {}

    const cancelBtn = containerEl.querySelector("#e_cancel");
    const saveBtn = containerEl.querySelector("#e_save");

    cancelBtn.addEventListener("click", () => {
      containerEl.classList.remove("is-editing");
      containerEl.innerHTML = originalHtml;
      // Re-bind buttons by re-render (safer)
      renderPlan();
    });

    saveBtn.addEventListener("click", () => {
      const name = containerEl.querySelector("#e_name").value.trim();
      const sets = containerEl.querySelector("#e_sets").value.trim();
      const reps = containerEl.querySelector("#e_reps").value.trim();
      const rest = containerEl.querySelector("#e_rest").value.trim();
      const note = containerEl.querySelector("#e_note").value.trim();
      const adminNote = containerEl.querySelector("#e_admin").value.trim();
      const done = containerEl.querySelector("#e_done").value === "1";

      if (name) ex.name = name;
      ex.sets = sets || ex.sets;
      ex.reps = reps || ex.reps;
      ex.rest = rest || ex.rest;
      ex.note = note;
      ex.adminNote = adminNote;
      ex.completed = done;
      if (done && !ex.completedAt) ex.completedAt = new Date().toLocaleString();
      if (!done) { ex.completedAt = null; }

      saveState(state);
      containerEl.classList.remove("is-editing");
      renderAll();
    });
  }

  function clearDay() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    const day = daySelect.value;
    c.plan[day] = [];
    c.dayStatus[day] = { done: false, doneAt: null };
    saveState(state);
    renderAll();
  }

  function markDayDoneAdmin() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    const day = daySelect.value;

    c.dayStatus ||= {};
    c.dayStatus[day] = { done: true, doneAt: nowStr() };
    (c.plan[day] || []).forEach(ex => { ex.completed = true; ex.completedAt ||= nowStr(); });

    saveState(state);
    renderAll();
  }

  function copyPlan() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    const day = daySelect.value;
    const items = c.plan[day] || [];
    const lines = [`${c.name} — Тренировка за ${day}`, "--------------------------------"];
    items.forEach((ex, i) => lines.push(`${i+1}. ${ex.name} — ${ex.sets} серии x ${ex.reps}, почивка ${ex.rest}${ex.note ? ` | ${ex.note}` : ""}`));
    const text = items.length ? lines.join("\n") : `${c.name} — Няма упражнения за ${day}.`;
    navigator.clipboard.writeText(text).catch(()=>{});
    openModal("Копирано (тренировка)", text);
  }

  // Nutrition CRUD
  function addMeal() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент отляво.");

    const day = nDaySelect.value;
    const title = mealTitle.value.trim() || "Хранене";
    const desc = mealDesc.value.trim();

    c.nutrition[day] ||= [];
    c.nutrition[day].push({
      id: uid(),
      title,
      desc,
      kcal: mealKcal.value === "" ? "" : Number(mealKcal.value),
      p: mealP.value === "" ? "" : Number(mealP.value),
      c: mealC.value === "" ? "" : Number(mealC.value),
      f: mealF.value === "" ? "" : Number(mealF.value),
      time: mealTime.value.trim(),
      tag: mealTag.value.trim().replaceAll("#",""),
      adminNote: mealAdminNote.value.trim()
    });

    mealTitle.value = "";
    mealDesc.value = "";
    mealKcal.value = "";
    mealP.value = "";
    mealC.value = "";
    mealF.value = "";
    mealTime.value = "";
    mealTag.value = "";
    mealAdminNote.value = "";

    saveState(state);
    renderAll();
  }

  function removeMeal(day, id) {
    const c = getActiveClient();
    if (!c) return;
    c.nutrition[day] = (c.nutrition[day] || []).filter(m => m.id !== id);
    saveState(state);
    renderAll();
  }

  function editMeal(day, id) {
    const c = getActiveClient();
    if (!c) return;
    const m = (c.nutrition[day] || []).find(x => x.id === id);
    if (!m) return;

    const newTitle = prompt("Заглавие (напр. Закуска):", m.title); if (newTitle === null) return;
    const newDesc = prompt("Описание:", m.desc); if (newDesc === null) return;
    const newKcal = prompt("Ккал (празно = няма):", m.kcal === "" ? "" : String(m.kcal)); if (newKcal === null) return;
    const newP = prompt("Протеин (g):", m.p === "" ? "" : String(m.p)); if (newP === null) return;
    const newC = prompt("Въглех. (g):", m.c === "" ? "" : String(m.c)); if (newC === null) return;
    const newF = prompt("Мазнини (g):", m.f === "" ? "" : String(m.f)); if (newF === null) return;
    const newTime = prompt("Час:", m.time || ""); if (newTime === null) return;
    const newTag = prompt("Таг:", m.tag || ""); if (newTag === null) return;
    const newAdmin = prompt("Admin бележка (скрита):", m.adminNote || ""); if (newAdmin === null) return;

    m.title = newTitle.trim() || m.title;
    m.desc = String(newDesc).trim();
    m.kcal = String(newKcal).trim() === "" ? "" : Number(newKcal);
    m.p = String(newP).trim() === "" ? "" : Number(newP);
    m.c = String(newC).trim() === "" ? "" : Number(newC);
    m.f = String(newF).trim() === "" ? "" : Number(newF);
    m.time = String(newTime).trim();
    m.tag = String(newTag).trim().replaceAll("#","");
    m.adminNote = String(newAdmin).trim();

    saveState(state);
    renderAll();
  }

  function editMealInline(containerEl, day, mealId) {
    const c = getActiveClient();
    if (!c) return;
    const meal = (c.nutrition[day] || []).find(x => x.id === mealId);
    if (!meal) return;

    if (containerEl.classList.contains("is-editing")) return;
    containerEl.classList.add("is-editing");

    const originalHtml = containerEl.innerHTML;

    containerEl.innerHTML = `
      <div class="left" style="width:100%">
        <div class="title">Редакция (хранене)</div>

        <div class="grid2" style="display:grid; grid-template-columns: 1.4fr .6fr; gap:10px; margin-top:10px;">
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">Заглавие</label>
            <input class="select" id="m_title" value="${escapeHtml(meal.title)}" placeholder="напр. Закуска" />
          </div>
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">Час</label>
            <input class="select" id="m_time" value="${escapeHtml(meal.time || "")}" placeholder="08:30" />
          </div>
        </div>

        <div style="margin-top:10px;">
          <label class="muted" style="display:block; margin-bottom:6px;">Описание</label>
          <textarea class="select" id="m_desc" rows="2" style="min-height:72px; resize:vertical;">${escapeHtml(meal.desc || "")}</textarea>
        </div>

        <div class="grid4" style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:10px; margin-top:10px;">
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">Ккал</label>
            <input class="select" id="m_kcal" value="${meal.kcal === "" ? "" : escapeHtml(String(meal.kcal))}" placeholder="напр. 520" />
          </div>
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">P</label>
            <input class="select" id="m_p" value="${meal.p === "" ? "" : escapeHtml(String(meal.p))}" placeholder="g" />
          </div>
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">C</label>
            <input class="select" id="m_c" value="${meal.c === "" ? "" : escapeHtml(String(meal.c))}" placeholder="g" />
          </div>
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">F</label>
            <input class="select" id="m_f" value="${meal.f === "" ? "" : escapeHtml(String(meal.f))}" placeholder="g" />
          </div>
        </div>

        <div class="grid2" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">Таг</label>
            <input class="select" id="m_tag" value="${escapeHtml(meal.tag || "")}" placeholder="напр. high-carb" />
          </div>
          <div>
            <label class="muted" style="display:block; margin-bottom:6px;">Статус</label>
            <select class="select select-modern" id="m_done">
              <option value="0">Не е маркирано</option>
              <option value="1">Следвано ✅</option>
            </select>
          </div>
        </div>

        <div style="margin-top:10px;">
          <label class="muted" style="display:block; margin-bottom:6px;">Admin бележка (скрита)</label>
          <textarea class="select" id="m_admin" rows="2" style="min-height:72px; resize:vertical;">${escapeHtml(meal.adminNote || "")}</textarea>
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px; flex-wrap:wrap;">
          <button class="btn ghost" id="m_cancel">Отказ</button>
          <button class="btn primary" id="m_save">Запази</button>
        </div>
      </div>
    `;

    // set status
    try { containerEl.querySelector("#m_done").value = (c.foodStatus?.[day]?.done ? "1" : "0"); } catch {}

    containerEl.querySelector("#m_cancel").addEventListener("click", () => {
      containerEl.classList.remove("is-editing");
      containerEl.innerHTML = originalHtml;
      renderNutrition();
    });

    containerEl.querySelector("#m_save").addEventListener("click", () => {
      const title = containerEl.querySelector("#m_title").value.trim();
      const time = containerEl.querySelector("#m_time").value.trim();
      const desc = containerEl.querySelector("#m_desc").value.trim();
      const kcal = containerEl.querySelector("#m_kcal").value.trim();
      const p = containerEl.querySelector("#m_p").value.trim();
      const ccarb = containerEl.querySelector("#m_c").value.trim();
      const f = containerEl.querySelector("#m_f").value.trim();
      const tag = containerEl.querySelector("#m_tag").value.trim();
      const adminNote = containerEl.querySelector("#m_admin").value.trim();
      const done = containerEl.querySelector("#m_done").value === "1";

      if (title) meal.title = title;
      meal.time = time;
      meal.desc = desc;
      meal.tag = tag.replaceAll("#","");
      meal.adminNote = adminNote;

      meal.kcal = kcal === "" ? "" : Number(kcal);
      meal.p = p === "" ? "" : Number(p);
      meal.c = ccarb === "" ? "" : Number(ccarb);
      meal.f = f === "" ? "" : Number(f);

      c.foodStatus ||= {};
      c.foodStatus[day] ||= {};
      c.foodStatus[day].done = done;
      c.foodStatus[day].doneAt = done ? new Date().toLocaleString() : null;

      saveState(state);
      containerEl.classList.remove("is-editing");
      renderAll();
    });
  }

  function clearNutritionDay() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    const day = nDaySelect.value;
    c.nutrition[day] = [];
    c.foodStatus[day] = { done: false, doneAt: null };
    saveState(state);
    renderAll();
  }

  function copyNutrition() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    const day = nDaySelect.value;
    const meals = c.nutrition[day] || [];
    const lines = [`${c.name} — Хранене за ${day}`, "--------------------------------"];
    meals.forEach((m, i) => {
      const sum = mealSummary(m);
      lines.push(`${i+1}. ${m.title}${sum ? ` (${sum})` : ""}`);
      if (m.desc) lines.push(`   - ${m.desc}`);
    });
    const text = meals.length ? lines.join("\n") : `${c.name} — Няма режим за ${day}.`;
    navigator.clipboard.writeText(text).catch(()=>{});
    openModal("Копирано (хранене)", text);
  }

  // Photos
  async function filesToDataUrls(fileList, maxEachBytes = 900_000) {
    const files = Array.from(fileList || []);
    const out = [];
    for (const f of files) {
      if (f.size > maxEachBytes) {
        openModal("Снимката е голяма", `Файлът "${f.name}" е ${Math.round(f.size/1024)}KB.\nКачвай под ~900KB (demo).`);
        continue;
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      out.push({ id: uid(), dataUrl, ts: nowStr() });
    }
    return out;
  }
  async function addPhotosToClient(client, type, input) {
    if (!client || !input.files || !input.files.length) return;
    const added = await filesToDataUrls(input.files);
    if (!added.length) return;
    client.photos[type] ||= [];
    client.photos[type].unshift(...added);
    input.value = "";
    saveState(state);
    renderAll();
  }
  function deletePhoto(client, type, id) {
    client.photos[type] = (client.photos[type] || []).filter(p => p.id !== id);
    saveState(state);
    renderAll();
  }
  function clearAllPhotos() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    c.photos.before = [];
    c.photos.after = [];
    saveState(state);
    renderAll();
  }

  // Profile
  function saveProfile() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");

    c.profile.goal = goal.value.trim();
    c.profile.weight = String(weight.value || "").trim();
    c.profile.height = String(height.value || "").trim();
    c.profile.freq = String(freq.value || "").trim();
    c.profile.limits = limits.value.trim();

    c.profile.payStatus = payStatus.value;
    c.profile.packageName = packageName.value.trim();
    c.profile.packagePrice = packagePrice.value.trim();
    c.profile.accessCode = accessCode.value.trim().toUpperCase();

    saveState(state);
    renderAll();
  }

  function markPaid() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    c.profile.payStatus = "paid";
    saveState(state);
    renderAll();
  }

  function genAccessCode() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    const code = (Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 4)).toUpperCase();
    c.profile.accessCode = code;
    accessCode.value = code;
    saveState(state);
    renderAll();
    openModal("Код за Portal", code);
  }

  function copyPortalLink() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    const code = (c.profile.accessCode || "").trim();
    if (!code) return openModal("Няма код", "Първо генерирай код.");
    const link = `${location.href.split("#")[0].split("?")[0]}?portal=1&code=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(link).catch(()=>{});
    openModal("Portal линк", link);
  }

  function inviteClient() {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    const code = (c.profile.accessCode || "").trim();
    const link = code ? `${location.href.split("#")[0].split("?")[0]}?portal=1&code=${encodeURIComponent(code)}` : "";
    openModal("Текст за покана",
`Здравей, ${c.name} 👋
Код за Portal: ${code || "(генерирай код)"} 
Portal линк: ${link || "(копирай линк)"}

Вътре имаш:
✅ Тренировъчен план + бутон “Завърших тренировката ✅”
✅ Хранителен режим + бутон “Следвам режима ✅”
✅ Чат
✅ Снимки “преди/след”`);
  }

  // Export / reset
  function exportData() { openModal("Експорт (JSON)", JSON.stringify(state, null, 2)); }
  function resetData() {
    localStorage.removeItem(KEY);
    state = { clients: [], activeId: null, programs: [], nutritionPrograms: [], notifications: [] };
    renderAll();
  }

  // ---------- Excel ----------
  function safeStr(x) { return String(x ?? "").trim(); }
  function normalizeDay(day) {
    const d0 = String(day || "").trim();
    const d = d0.toLowerCase();

    // 1) Weekday names (BG/EN)
    const map = {
      "понеделник": "Понеделник", "mon": "Понеделник", "monday": "Понеделник",
      "вторник": "Вторник", "tue": "Вторник", "tues": "Вторник", "tuesday": "Вторник",
      "сряда": "Сряда", "wed": "Сряда", "wednesday": "Сряда",
      "четвъртък": "Четвъртък", "четвърт": "Четвъртък", "thu": "Четвъртък", "thur": "Четвъртък", "thurs": "Четвъртък", "thursday": "Четвъртък",
      "петък": "Петък", "fri": "Петък", "friday": "Петък",
      "събота": "Събота", "sat": "Събота", "saturday": "Събота",
      "неделя": "Неделя", "sun": "Неделя", "sunday": "Неделя",
    };

    // Exact match
    if (map[d]) return map[d];

    // Prefix match ("Понеделник - ...", "Mon - ...")
    for (const k of Object.keys(map)) {
      if (d.startsWith(k + " ") || d.startsWith(k + "-") || d.startsWith(k + "–") || d.startsWith(k + "—")) return map[k];
    }

    // 2) Day numbers: "Day 1", "Day 1 – Upper Body", "Ден 1", "1", "1 - ..."
    const numMatch =
      d.match(/\bday\s*([1-7])\b/i) ||
      d.match(/\bден\s*([1-7])\b/i) ||
      d.match(/^\s*([1-7])\b/);
    if (numMatch) {
      const n = Number(numMatch[1]);
      const days = ["Понеделник","Вторник","Сряда","Четвъртък","Петък","Събота","Неделя"];
      return days[n-1];
    }

    // 3) Fallback: keep existing selected day (UI), otherwise today
    try {
      const sel = (daySelect && daySelect.value) ? daySelect.value : "";
      if (sel) return sel;
    } catch {}
    return getTodayDay();
  }
  function parseExcelRowsToNutritionPrograms(rows) {
    const programsMap = new Map();
    for (const raw of rows) {
      const r = mapRowKeys(raw); // also maps Program/Day + Note etc
      const programName = safeStr(r.Program);
      const day = normalizeDay(r.Day);
      const title = safeStr(r.MealTitle || r.Meal || r.Title || r["Хранене"] || r["Заглавие"] || "");
      if (!programName || !title) continue;

      const m = {
        id: uid(),
        title,
        desc: safeStr(r.Desc) || safeStr(r.Description) || safeStr(r["Описание"]) || "",
        kcal: safeStr(r.Kcal) === "" ? "" : Number(r.Kcal),
        p: safeStr(r.P) === "" ? "" : Number(r.P),
        c: safeStr(r.C) === "" ? "" : Number(r.C),
        f: safeStr(r.F) === "" ? "" : Number(r.F),
        time: safeStr(r.Time) || "",
        tag: safeStr(r.Tag).replaceAll("#","") || "",
        adminNote: safeStr(r.AdminNote) || ""
      };

      if (!programsMap.has(programName)) programsMap.set(programName, { id: uid(), name: programName, days: {} });
      const p = programsMap.get(programName);
      p.days[day] ||= [];
      p.days[day].push(m);
    }
    return Array.from(programsMap.values());
  }

  function parseExcelRowsToPrograms(rows) {
    const programsMap = new Map();
    for (const r of rows) {
      const programName = safeStr(r.Program);
      const day = normalizeDay(r.Day);
      const exercise = safeStr(r.Exercise);
      if (!programName || !exercise) continue;

      const ex = { id: uid(), name: exercise, sets: safeStr(r.Sets) || "3", reps: safeStr(r.Reps) || "8-10", rest: safeStr(r.Rest) || "90s", note: safeStr(r.Note) || "" };
      if (!programsMap.has(programName)) programsMap.set(programName, { id: uid(), name: programName, days: {} });
      const p = programsMap.get(programName);
      p.days[day] ||= [];
      p.days[day].push(ex);
    }
    return Array.from(programsMap.values());
  }

  async function importExcel() {
    if (!excelFile.files || !excelFile.files.length) return openModal("Импорт", "Избери .xlsx или .csv файл.");

    const ok = await loadXlsxLib();
    if (!ok) return openModal("Импорт", "Не успях да заредя XLSX библиотеката. Провери интернет/AdBlock и пробвай пак.");

    const file = excelFile.files[0];
    const name = (file.name || "").toLowerCase();

    // Read data
    let rows = [];
    if (name.endsWith(".csv")) {
      const text = await file.text();
      const wb = XLSX.read(text, { type: "string" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    } else {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });

      // If multiple sheets, prefer first non-empty
      let ws = wb.Sheets[wb.SheetNames[0]];
      for (const sn of wb.SheetNames) {
        const candidate = wb.Sheets[sn];
        const test = XLSX.utils.sheet_to_json(candidate, { defval: "" });
        if (test && test.length) { ws = candidate; rows = test; break; }
      }
      if (!rows.length) rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    }

    if (!rows.length) return openModal("Импорт", "Файлът няма редове (празен sheet).");

    // Normalize/mapping headers (BG/EN)
    rows = rows.map(mapRowKeys);

    // Validate minimal columns
    const keys = Object.keys(rows[0] || {});
    const hasProgram = keys.includes("Program");
    const hasDay = keys.includes("Day");
    const hasExercise = keys.includes("Exercise");

    if (!hasProgram || !hasDay || !hasExercise) {
      return openModal("Грешен формат",
`Не намерих задължителните колони Program/Програма, Day/Ден, Exercise/Упражнение.

Намерени колони:
${keys.join(", ")}

Очакван формат (EN или BG):
Program | Day | Exercise | Sets | Reps | Rest | Note
Програма | Ден | Упражнение | Серии | Повторения | Почивка | Бележка`);
    }

    const imported = parseExcelRowsToPrograms(rows);
    if (!imported.length) return openModal("Импорт", "Не намерих валидни редове (провери Program/Day/Exercise).");

    // Merge by name
    const byName = new Map(state.programs.map(p => [p.name, p]));
    imported.forEach(p => byName.set(p.name, p));
    state.programs = Array.from(byName.values());

    excelFile.value = "";
    saveState(state);
    renderAll();

    openModal("Импорт готов",
`Импортирани/обновени програми: ${imported.length}
Общо програми: ${state.programs.length}

Програмата се приложи автоматично към избрания клиент.`);

    // AUTO APPLY to active client (overwrite)
    const activeClient = getActiveClient();
    if (activeClient && imported.length === 1) {
      activeClient.plan = {};
      const p = imported[0];
      Object.keys(p.days || {}).forEach(day => {
        activeClient.plan[day] = (p.days[day] || []).map(ex => ({
          ...ex,
          id: uid(),
          completed: false,
          completedAt: null
        }));
      });
      const first = firstDayWithItems(activeClient.plan);
      if (first) {
        try { daySelect.value = first; } catch {}
        try { nDaySelect.value = first; } catch {}
      }
      saveState(state);
      renderAll();
    }
  }

  async function importNutrition() {
    if (!nExcelFile || !nExcelFile.files || !nExcelFile.files.length) return openModal("Импорт (хранене)", "Избери .xlsx или .csv файл.");
    const ok = await loadXlsxLib();
    if (!ok) return openModal("Импорт (хранене)", "Не успях да заредя XLSX библиотеката. Провери интернет/AdBlock и пробвай пак.");

    const file = nExcelFile.files[0];
    const name = (file.name || "").toLowerCase();
    let rows = [];
    if (name.endsWith(".csv")) {
      const text = await file.text();
      const wb = XLSX.read(text, { type: "string" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    } else {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      let ws = wb.Sheets[wb.SheetNames[0]];
      for (const sn of wb.SheetNames) {
        const candidate = wb.Sheets[sn];
        const test = XLSX.utils.sheet_to_json(candidate, { defval: "" });
        if (test && test.length) { ws = candidate; rows = test; break; }
      }
      if (!rows.length) rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    }
    if (!rows.length) return openModal("Импорт (хранене)", "Файлът няма редове (празен sheet).");

    // Normalize headers for Program/Day/Note + then map meal headers
    rows = rows.map((r) => {
      const a = mapRowKeys(r);
      const out = {};
      for (const [k,v] of Object.entries(a)) {
        const mk = normalizeMealHeader(k);
        if (mk) out[mk] = v;
        else out[k] = v;
      }
      return out;
    });

    const keys = Object.keys(rows[0] || {});
    if (!keys.includes("Program") || !keys.includes("Day") || !keys.includes("MealTitle")) {
      return openModal("Грешен формат (хранене)",
`Липсват задължителните колони:
- Program/Програма
- Day/Ден
- MealTitle/Хранене

Намерени колони:
${keys.join(", ")}

Пример формат:
Program | Day | MealTitle | Desc | Kcal | P | C | F | Time | Tag | AdminNote`);
    }

    const imported = parseExcelRowsToNutritionPrograms(rows);
    if (!imported.length) return openModal("Импорт (хранене)", "Не намерих валидни редове (провери Program/Day/MealTitle).");

    const byName = new Map((state.nutritionPrograms || []).map(p => [p.name, p]));
    imported.forEach(p => byName.set(p.name, p));
    state.nutritionPrograms = Array.from(byName.values());

    nExcelFile.value = "";
    saveState(state);
    renderAll();

    openModal("Импорт готов (хранене)",
`Импортирани/обновени режими: ${imported.length}
Общо режими: ${state.nutritionPrograms.length}

Режимът се приложи автоматично към избрания клиент.`);

    // AUTO APPLY to active client (overwrite)
    const activeClient = getActiveClient();
    if (activeClient && imported.length === 1) {
      activeClient.nutrition = {};
      const p = imported[0];
      Object.keys(p.days || {}).forEach(day => {
        activeClient.nutrition[day] = (p.days[day] || []).map(m => ({
          ...m,
          id: uid()
        }));
      });
      const firstN = firstDayWithItems(activeClient.nutrition);
      if (firstN) {
        try { nDaySelect.value = firstN; } catch {}
      }
      saveState(state);
      renderAll();
    }
  }

  function applyNutritionToClient(overwrite = false) {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    const pid = nProgramSelect?.value;
    if (!pid) return openModal("Избери режим", "Първо избери режим (хранене).");

    const p = (state.nutritionPrograms || []).find(x => x.id === pid);
    if (!p) return;

    if (overwrite) { c.nutrition = {}; c.foodStatus = {}; }

    Object.keys(p.days || {}).forEach(day => {
      c.nutrition[day] ||= [];
      const copied = (p.days[day] || []).map(m => ({
        id: uid(),
        title: m.title,
        desc: m.desc,
        kcal: m.kcal === "" ? "" : Number(m.kcal),
        p: m.p === "" ? "" : Number(m.p),
        c: m.c === "" ? "" : Number(m.c),
        f: m.f === "" ? "" : Number(m.f),
        time: m.time || "",
        tag: (m.tag || "").replaceAll("#",""),
        adminNote: m.adminNote || ""
      }));
      c.nutrition[day].push(...copied);
    });

    saveState(state);
    renderAll();
    openModal("Приложено (хранене)", "Режимът е приложен към клиента. Клиентът не вижда източника.");
  }

  function showNutritionFormat() {
    openModal("Формат (хранене)",
`Колони (EN):
Program | Day | MealTitle | Desc | Kcal | P | C | F | Time | Tag | AdminNote

Колони (BG):
Програма | Ден | Хранене | Описание | Ккал | Протеин | Въглехидрати | Мазнини | Час | Таг | Админ бележка

Пример:
Cut 4w | Понеделник | Закуска | овес + кисело мляко | 520 | 35 | 65 | 14 | 08:30 | high-carb | само за теб`);
  }

  function applyProgramToClient(overwrite = false) {
    const c = getActiveClient();
    if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    const pid = programSelect.value;
    if (!pid) return openModal("Избери програма", "Първо избери програма.");

    const p = state.programs.find(x => x.id === pid);
    if (!p) return;

    if (overwrite) { c.plan = {}; c.dayStatus = {}; }

    Object.keys(p.days || {}).forEach(day => {
      c.plan[day] ||= [];
      const copied = (p.days[day] || []).map(ex => ({
        id: uid(),
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        note: ex.note,
        adminNote: "",
        completed: false,
        completedAt: null
      }));
      c.plan[day].push(...copied);
    });

    saveState(state);
    renderAll();
    openModal("Приложено", "Програмата е приложена към клиента. Клиентът не вижда източника.");
  }

  function showExcelFormat() {
    openModal("Excel формат",
`Колони (EN):
Program | Day | Exercise | Sets | Reps | Rest | Note

Колони (BG):
Програма | Ден | Упражнение | Серии | Повторения | Почивка | Бележка

Пример:
Hypertrophy 4w | Понеделник | Клек | 4 | 6-8 | 120s | https://youtube.com/...`);
  }

  // ---------- Tabs (Admin) ----------
  function setTab(name) {
    document.querySelectorAll(".tab[data-tab]").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    tabChat.classList.toggle("hidden", name !== "chat");
    tabPlan.classList.toggle("hidden", name !== "plan");
    tabNutrition.classList.toggle("hidden", name !== "nutrition");
    tabPhotos.classList.toggle("hidden", name !== "photos");
    tabProfile.classList.toggle("hidden", name !== "profile");
  }

  // ---------- Portal ----------
  let portalClientId = null;
  function showPortal() {
    coachApp.classList.add("hidden");
    clientPortal.classList.remove("hidden");
    portalSub.textContent = "Вход с код";
    try { if (!portalCode.value) portalCode.value = localStorage.getItem("last_portal_code") || ""; } catch {}
    portalLogin.classList.remove("hidden");
    portalMain.classList.add("hidden");
    try { portalCode.focus(); } catch {}
  }
  function showCoach() {
    clientPortal.classList.add("hidden");
    coachApp.classList.remove("hidden");
    portalClientId = null;
  }
  function findClientByCode(code) {
    const normalized = String(code || "").trim().toUpperCase();
    return state.clients.find(c => (c.profile?.accessCode || "").toUpperCase() === normalized) || null;
  }
  function portalLoginWithCode(code) {
    const client = findClientByCode(code);
    if (!client) return openModal("Грешен код", "Няма клиент с този код.");

    portalClientId = client.id;
    try { localStorage.setItem("last_portal_code", String(code||"").trim().toUpperCase()); } catch {}
    portalClientName.textContent = client.name;
    portalSub.textContent = `Влязъл като: ${client.name}`;

    // default day = today
    const td = todayBgDay();
    pDaySelect.value = td;
    pFoodDaySelect.value = td;

    portalLogin.classList.add("hidden");
    portalMain.classList.remove("hidden");
    setPortalTab("pplan");
    portalRefresh();
  }
  function getPortalClient() { return state.clients.find(c => c.id === portalClientId) || null; }

  function setPortalTab(name) {
    pTabs.forEach(t => t.classList.toggle("active", t.dataset.ptab === name));
    ptabPlan.classList.toggle("hidden", name !== "pplan");
    ptabFood.classList.toggle("hidden", name !== "pfood");
    ptabChat.classList.toggle("hidden", name !== "pchat");
    ptabPhotos.classList.toggle("hidden", name !== "pphotos");
  }

  // Portal Training
  function portalRenderPlan() {
    const c = getPortalClient();
    pPlanList.innerHTML = "";
    if (!c) return;

    const day = pDaySelect.value;
    const items = c.plan[day] || [];
    const ds = c.dayStatus?.[day];
    pDayDoneHint.textContent = ds?.done ? `✅ Маркирано на: ${ds.doneAt}` : `Още не е маркирано за този ден.`;

    if (!items.length) {
      pPlanList.innerHTML = `<div class="empty muted">Няма упражнения за ${escapeHtml(day)}.</div>`;
      return;
    }

    items.forEach(ex => {
      const el = document.createElement("div");
      el.className = "plan-item";
      el.innerHTML = `
        <div class="left">
          <div class="title">${escapeHtml(ex.name)} ${ex.completed ? "✅" : ""}</div>
          <div class="sub">${escapeHtml(ex.sets)} серии • ${escapeHtml(ex.reps)} повторения • почивка ${escapeHtml(ex.rest)}</div>
          ${ex.note ? `<div class="note">${linkify(ex.note)}</div>` : ""}
          ${ex.completedAt ? `<div class="note">Отбелязано: ${escapeHtml(ex.completedAt)}</div>` : ""}
        </div>
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          <button class="btn primary done-ex-btn">${ex.completed ? "Завършено ✅" : "Маркирай"}</button>
        </div>
      `;
      el.querySelector(".done-ex-btn").addEventListener("click", () => {
        ex.completed = true;
        ex.completedAt = nowStr();
        pushAdminNotification({ clientId: c.id, clientName: c.name, type: "exercise_done", day, text: ex.name });
        saveState(state);
        renderAll();
      });
      pPlanList.appendChild(el);
    });
  }

  function portalMarkDayDone() {
    const c = getPortalClient();
    if (!c) return;
    const day = pDaySelect.value;

    c.dayStatus ||= {};
    c.dayStatus[day] = { done: true, doneAt: nowStr() };
    (c.plan[day] || []).forEach(ex => { ex.completed = true; ex.completedAt ||= nowStr(); });

    pushAdminNotification({ clientId: c.id, clientName: c.name, type: "day_done", day, text: "" });
    saveState(state);
    renderAll();
  }

  // Portal Nutrition
  function portalRenderFood() {
    const c = getPortalClient();
    pFoodList.innerHTML = "";
    if (!c) return;

    const day = pFoodDaySelect.value;
    const meals = c.nutrition[day] || [];
    const ds = c.foodStatus?.[day];
    pFoodHint.textContent = ds?.done ? `🥗 Отбелязано на: ${ds.doneAt}` : `Още не е отбелязано за този ден.`;

    if (!meals.length) {
      pFoodList.innerHTML = `<div class="empty muted">Няма зададен режим за ${escapeHtml(day)}.</div>`;
      return;
    }

    meals.forEach(m => {
      const el = document.createElement("div");
      el.className = "plan-item";
      el.innerHTML = `
        <div class="left">
          <div class="title">🍽 ${escapeHtml(m.title)}</div>
          <div class="sub">${escapeHtml(mealSummary(m) || "")}</div>
          ${m.desc ? `<div class="note">${linkify(m.desc)}</div>` : ""}
        </div>
        <div></div>
      `;
      pFoodList.appendChild(el);
    });
  }

  function portalFoodDone() {
    const c = getPortalClient();
    if (!c) return;
    const day = pFoodDaySelect.value;
    c.foodStatus ||= {};
    c.foodStatus[day] = { done: true, doneAt: nowStr() };
    pushAdminNotification({ clientId: c.id, clientName: c.name, type: "food_done", day, text: "" });
    saveState(state);
    renderAll();
  }

  // Portal Chat
  function portalRenderChat() {
    const c = getPortalClient();
    pChatBox.innerHTML = "";
    if (!c) return;
    if (!c.chat.length) return (pChatBox.innerHTML = `<div class="empty muted">Няма съобщения. Напиши първото.</div>`);
    c.chat.forEach(m => {
      const row = document.createElement("div");
      row.className = "msg " + (m.from === "coach" ? "coach" : "client");
      row.innerHTML = `
        <div class="bubble">
          <div>${linkify(m.text)}</div>
          <div class="meta">${m.from === "coach" ? "Треньор" : "Клиент"} • ${escapeHtml(m.ts)}</div>
        </div>
      `;
      pChatBox.appendChild(row);
    });
    pChatBox.scrollTop = pChatBox.scrollHeight;
  }
  function portalSendMessage() {
    const c = getPortalClient();
    const text = pMsgText.value.trim();
    if (!c || !text) return;
    c.chat.push({ id: uid(), from: "client", text, ts: nowStr() });
    pMsgText.value = "";
    pushAdminNotification({ clientId: c.id, clientName: c.name, type: "message", day: pDaySelect.value, text });
    saveState(state);
    renderAll();
  }

  // Portal Photos
  function portalRenderPhotos() {
    const c = getPortalClient();
    pBeforeGallery.innerHTML = "";
    pAfterGallery.innerHTML = "";
    if (!c) return;
    const before = c.photos.before || [];
    const after = c.photos.after || [];
    if (!before.length) pBeforeGallery.innerHTML = `<div class="empty muted">Няма снимки “Преди”.</div>`;
    else before.forEach(ph => pBeforeGallery.appendChild(makeThumb(ph,"before",(id)=>deletePhoto(c,"before",id))));
    if (!after.length) pAfterGallery.innerHTML = `<div class="empty muted">Няма снимки “След”.</div>`;
    else after.forEach(ph => pAfterGallery.appendChild(makeThumb(ph,"after",(id)=>deletePhoto(c,"after",id))));
  }

  function portalRefresh() {
    portalRenderPlan();
    portalRenderFood();
    portalRenderChat();
    portalRenderPhotos();
  }

  // ---------- URL helpers ----------
  function getParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  // ---------- Events wiring ----------
  addClientBtn.addEventListener("click", addClient);
  clientName.addEventListener("keydown", e => { if (e.key === "Enter") addClient(); });

  sendMsgBtn.addEventListener("click", sendAdminChat);
  msgText.addEventListener("keydown", e => { if (e.key === "Enter") sendAdminChat(); });
  clearChatBtn.addEventListener("click", clearChat);

  // Training
  daySelect.addEventListener("change", renderPlan);
  addExBtn.addEventListener("click", addExercise);
  clearDayBtn.addEventListener("click", clearDay);
  copyPlanBtn.addEventListener("click", copyPlan);
  markDayDoneAdminBtn.addEventListener("click", markDayDoneAdmin);

  // Excel
  importExcelBtn.addEventListener("click", importExcel);
  applyProgramBtn.addEventListener("click", () => applyProgramToClient(false));
  applyProgramOverwriteBtn.addEventListener("click", () => applyProgramToClient(true));
  openExcelFormatBtn.addEventListener("click", showExcelFormat);

  // Nutrition
  nDaySelect.addEventListener("change", renderNutrition);
  if (nImportBtn) nImportBtn.addEventListener("click", importNutrition);
  if (nFormatBtn) nFormatBtn.addEventListener("click", showNutritionFormat);
  if (nApplyBtn) nApplyBtn.addEventListener("click", () => applyNutritionToClient(false));
  if (nApplyOverwriteBtn) nApplyOverwriteBtn.addEventListener("click", () => applyNutritionToClient(true));

  addMealBtn.addEventListener("click", addMeal);
  nClearDayBtn.addEventListener("click", clearNutritionDay);
  copyNutritionBtn.addEventListener("click", copyNutrition);

  // Photos
  addBeforeBtn.addEventListener("click", async () => {
    const c = getActiveClient(); if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    await addPhotosToClient(c, "before", beforeFile);
  });
  addAfterBtn.addEventListener("click", async () => {
    const c = getActiveClient(); if (!c) return openModal("Няма избран клиент", "Избери клиент.");
    await addPhotosToClient(c, "after", afterFile);
  });
  clearPhotosBtn.addEventListener("click", clearAllPhotos);

  // Profile
  saveProfileBtn.addEventListener("click", saveProfile);
  togglePaidBtn.addEventListener("click", markPaid);
  genCodeBtn.addEventListener("click", genAccessCode);
  copyPortalBtn.addEventListener("click", copyPortalLink);
  inviteBtn.addEventListener("click", inviteClient);

  // Sidebar
  exportBtn.addEventListener("click", exportData);
  resetBtn.addEventListener("click", resetData);
  notifBtn.addEventListener("click", async () => { await ensureNotificationPermission(); openNotificationsModal(); });

  // Tabs admin
  tabs.forEach(t => t.addEventListener("click", () => setTab(t.dataset.tab)));

  // Portal open/close
  openPortalBtn.addEventListener("click", showPortal);
  backToCoachBtn.addEventListener("click", showCoach);

  portalLoginBtn.addEventListener("click", () => portalLoginWithCode(portalCode.value));
  portalCode.addEventListener("keydown", e => { if (e.key === "Enter") portalLoginWithCode(portalCode.value); });

  // Portal tabs
  pTabs.forEach(t => t.addEventListener("click", () => setPortalTab(t.dataset.ptab)));
  pDaySelect.addEventListener("change", portalRenderPlan);
  pFoodDaySelect.addEventListener("change", portalRenderFood);

  pMarkDayDoneBtn.addEventListener("click", portalMarkDayDone);
  pFoodDoneBtn.addEventListener("click", portalFoodDone);

  pSendMsgBtn.addEventListener("click", portalSendMessage);
  pMsgText.addEventListener("keydown", e => { if (e.key === "Enter") portalSendMessage(); });

  pAddBeforeBtn.addEventListener("click", async () => {
    const c = getPortalClient(); if (!c) return;
    await addPhotosToClient(c, "before", pBeforeFile);
  });
  pAddAfterBtn.addEventListener("click", async () => {
    const c = getPortalClient(); if (!c) return;
    await addPhotosToClient(c, "after", pAfterFile);
  });

  // Cross-tab sync (Portal uploads -> Admin sees immediately)
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try { state = loadState(); renderAll(); } catch {}
  });

  // ---------- Init ----------
  state.clients = state.clients.map(ensureClientShape);
  state.programs = state.programs.map(ensureProgramShape);
    state.nutritionPrograms = (state.nutritionPrograms || []).map(ensureNutritionProgramShape);
  state.notifications ||= [];
  saveState(state);

  const td = todayBgDay();
  daySelect.value = td;
  nDaySelect.value = td;

  renderAll();
  setTab("chat");

  // Auto-open portal by URL
  const adminFlag = getParam("admin");
  const portalFlag = getParam("portal");
  const codeParam = getParam("code");

  // Default behavior: ако НЕ е admin режим → отваряме Client Portal (скриваме Admin)
  if (adminFlag === "1") {
    // Admin остава видим
  } else {
    showPortal();
    if (portalFlag === "1" && codeParam) {
      portalCode.value = codeParam;
      portalLoginWithCode(codeParam);
    }
  }
})();