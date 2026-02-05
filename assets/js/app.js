// Controle de Salário (Bootstrap + JS) - agora em Firebase Firestore.
// Dica: abra index.html via Live Server (VSCode) para facilitar.

const $ = (sel) => document.querySelector(sel);
const userAvatar = document.getElementById("userAvatar");
const userEmailEl = document.getElementById("userEmail");
const btnProfile = document.getElementById("btnProfile");


// ================================
// Firebase init (COMPAT)
// ================================
const firebaseConfig = {
  apiKey: "AIzaSyDmbZCCR58Fa2g5x2y4pLC0YZrxurtwqg8",
  authDomain: "salary-saas.firebaseapp.com",
  projectId: "salary-saas",
  storageBucket: "salary-saas.firebasestorage.app",
  messagingSenderId: "32860095863",
  appId: "1:32860095863:web:f7cac5728fe0e629ce4d72",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

let UID = null;

// ================================
// Escopo (pessoal vs cofre compartilhado)
// ================================
let SCOPE = { kind: "user", id: null, role: "owner", name: null }; // kind: "user" | "household"

function baseDoc() {
  if (SCOPE.kind === "household") return db.collection("households").doc(SCOPE.id);
  return db.collection("users").doc(UID);
}

function updateScopeUI() {
  if (!scopeLabel) return;
  if (SCOPE.kind === "household") {
    const label = SCOPE.name ? `Cofre: ${SCOPE.name}` : `Cofre: ${SCOPE.id}`;
    scopeLabel.textContent = label;
    scopeLabel.classList.remove("text-bg-light");
    scopeLabel.classList.add("text-bg-warning");
  } else {
    scopeLabel.textContent = "Pessoal";
    scopeLabel.classList.remove("text-bg-warning");
    scopeLabel.classList.add("text-bg-light");
  }
}

// ================================
// UI helpers (SweetAlert2 opcional)
// ================================
async function uiAlert(opts) {
  if (window.Swal && Swal.fire) return Swal.fire(opts);
  alert((opts.title ? opts.title + "\n\n" : "") + (opts.text || ""));
}

async function uiConfirm(opts) {
  if (window.Swal && Swal.fire) {
    const res = await Swal.fire({
      title: opts.title || "Confirmar",
      text: opts.text || "",
      icon: opts.icon || "question",
      showCancelButton: true,
      confirmButtonText: opts.confirmButtonText || "OK",
      cancelButtonText: opts.cancelButtonText || "Cancelar",
      confirmButtonColor: opts.confirmButtonColor,
    });
    return !!res.isConfirmed;
  }
  return confirm((opts.title ? opts.title + "\n\n" : "") + (opts.text || ""));
}

function requireAccountForHousehold() {
  const cur = auth.currentUser;
  if (!cur || cur.isAnonymous) {
    uiAlert({
      title: "Conecte uma conta",
      text: "Para usar cofre compartilhado, entre com Google ou email e senha.",
      icon: "info",
    });
    return false;
  }
  return true;
}

function makeCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

let BOOT_SEQ = 0;

async function refreshScopeFromProfile() {
  SCOPE = { kind: "user", id: UID, role: "owner", name: null };

  const cur = auth.currentUser;
  if (!cur || cur.isAnonymous) {
    updateScopeUI();
    return;
  }

  try {
    const uSnap = await userDocRef(UID).get();
    const hid = uSnap.exists ? (uSnap.data().householdId || null) : null;
    if (!hid) {
      updateScopeUI();
      return;
    }

    const hRef = db.collection("households").doc(hid);
    const hSnap = await hRef.get();
    if (!hSnap.exists) {
      await userDocRef(UID).set({ householdId: null }, { merge: true });
      updateScopeUI();
      return;
    }

    const memSnap = await hRef.collection("members").doc(UID).get();
    const role = memSnap.exists ? (memSnap.data().role || "member") : "member";
    const name = hSnap.data().name || null;

    SCOPE = { kind: "household", id: hid, role, name };
    updateScopeUI();
  } catch (e) {
    console.warn("Falha ao carregar escopo:", e);
    updateScopeUI();
  }
}

async function openHouseholdMenu() {
  if (!requireAccountForHousehold()) return;

  if (window.Swal && Swal.fire) {
    const res = await Swal.fire({
      title: "Cofre compartilhado",
      html: "<div class='text-start small text-secondary'>Crie um cofre ou entre com um código.</div>",
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: "Criar cofre",
      denyButtonText: "Entrar com código",
      cancelButtonText: "Cancelar",
    });
    if (res.isConfirmed) return createHouseholdFlow();
    if (res.isDenied) return joinHouseholdFlow();
    return;
  }

  const choice = prompt("Digite 1 para criar cofre, 2 para entrar com código:");
  if (choice === "1") return createHouseholdFlow();
  if (choice === "2") return joinHouseholdFlow();
}

async function createHouseholdFlow() {
  if (!requireAccountForHousehold()) return;

  let name = "Nosso cofre";
  if (window.Swal && Swal.fire) {
    const res = await Swal.fire({
      title: "Criar cofre",
      input: "text",
      inputLabel: "Nome do cofre",
      inputPlaceholder: "Ex: Casa / João&Mirelli / Família",
      inputValue: name,
      showCancelButton: true,
      confirmButtonText: "Criar",
      cancelButtonText: "Cancelar",
    });
    if (!res.isConfirmed) return;
    name = String(res.value || "").trim() || name;
  } else {
    name = prompt("Nome do cofre:", name)?.trim() || name;
  }

  let hid = null;
  for (let i = 0; i < 7; i++) {
    const code = makeCode(6);
    const ref = db.collection("households").doc(code);
    const snap = await ref.get();
    if (!snap.exists) {
      hid = code;
      break;
    }
  }
  if (!hid) {
    await uiAlert({ title: "Erro", text: "Não consegui gerar um código. Tente novamente.", icon: "error" });
    return;
  }

  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sem usuário autenticado.");

  const hRef = db.collection("households").doc(hid);

  // 1) cria o cofre com ownerUid correto
  await hRef.set(
    {
      name,
      ownerUid: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      version: 1,
    },
    { merge: true }
  );

  // 2) registra você como membro/owner
  await hRef.collection("members").doc(uid).set(
    { role: "owner", joinedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  // 3) salva householdId no seu user
  await userDocRef(uid).set({ householdId: hid }, { merge: true });


  await bootstrap();

  await uiAlert({
    title: "Cofre criado ✅",
    text: `Código para compartilhar: ${hid}`,
    icon: "success",
  });
}

async function joinHouseholdFlow() {
  if (!requireAccountForHousehold()) return;

  let code = "";
  if (window.Swal && Swal.fire) {
    const res = await Swal.fire({
      title: "Entrar em um cofre",
      input: "text",
      inputLabel: "Código do cofre",
      inputPlaceholder: "Ex: A1B2C3",
      showCancelButton: true,
      confirmButtonText: "Entrar",
      cancelButtonText: "Cancelar",
      inputValidator: (v) => (!v || !v.trim() ? "Digite o código" : undefined),
    });
    if (!res.isConfirmed) return;
    code = String(res.value || "").trim().toUpperCase();
  } else {
    code = prompt("Código do cofre:")?.trim().toUpperCase() || "";
    if (!code) return;
  }

  const hRef = db.collection("households").doc(code);
  const hSnap = await hRef.get();
  if (!hSnap.exists) {
    await uiAlert({ title: "Não encontrado", text: "Código inválido.", icon: "error" });
    return;
  }

  await userDocRef(UID).set({ householdId: code }, { merge: true });

  await bootstrap();

  await uiAlert({
    title: "Pronto ✅",
    text: `Você entrou no cofre: ${hSnap.data().name || code}`,
    icon: "success",
  });
}

async function leaveHouseholdFlow() {
  if (SCOPE.kind !== "household") {
    await uiAlert({ title: "Modo pessoal", text: "Você não está em um cofre.", icon: "info" });
    return;
  }

  const ok = await uiConfirm({
    title: "Sair do cofre?",
    text: "Você voltará para o modo pessoal neste dispositivo.",
    icon: "warning",
    confirmButtonText: "Sair",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#dc3545",
  });
  if (!ok) return;

  const hid = SCOPE.id;

  try {
    await db.collection("households").doc(hid).collection("members").doc(UID).delete();
  } catch (e) {
    console.warn("Falha ao remover membership:", e);
  }

  await userDocRef(UID).set({ householdId: null }, { merge: true });

  await bootstrap();
  await uiAlert({ title: "Ok", text: "Você saiu do cofre.", icon: "success" });
}

async function bootstrap() {
  const cur = auth.currentUser;
  if (!cur) return;

  const mySeq = ++BOOT_SEQ;
  UID = cur.uid;

  try {
    await upsertUserProfile(cur);
  } catch (e) {
    console.warn("Falha ao salvar perfil:", e);
  }

  await refreshScopeFromProfile();
  if (mySeq !== BOOT_SEQ) return;

  stopListeners();

  const s = await fbLoadSettings();
  state.config = s || {};
  setDefaultsIfNeeded();
  syncConfigToUI();

  listenSettings();
  await listenMonth(getSelectedMonthKey());

  renderAll();
}


async function ensureAuth() {
  const cur = auth.currentUser;
  if (cur) {
    UID = cur.uid;
    return UID;
  }
  const res = await auth.signInAnonymously();
  UID = res.user.uid;
  return UID;
}

function userDocRef(uid) {
  return db.collection("users").doc(uid);
}

async function upsertUserProfile(user) {
  if (!user) return;

  const ref = userDocRef(user.uid);
  const snap = await ref.get();

  const payload = {
    uid: user.uid,
    name: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
    provider: (user.providerData?.[0]?.providerId) || "unknown",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (!snap.exists) {
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  }

  await ref.set(payload, { merge: true });
}

// ================================
// AUTH UI
// ================================
const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const navAuthed = document.getElementById("navAuthed");
const userChip = document.getElementById("userChip");
const authMsg = document.getElementById("authMsg");

const btnGoogle = document.getElementById("btnGoogle");
const btnEmailLogin = document.getElementById("btnEmailLogin");
const btnEmailSignup = document.getElementById("btnEmailSignup");
const btnLogout = document.getElementById("btnLogout");
const btnHousehold = document.getElementById("btnHousehold");
const btnLeaveHousehold = document.getElementById("btnLeaveHousehold");
const scopeLabel = document.getElementById("scopeLabel");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");

// ================================
// Helpers UI
// ================================
function showAuth() {
  authView.classList.remove("d-none");
  appView.classList.add("d-none");
  navAuthed.classList.add("d-none");
}

function showApp(user) {
  authView.classList.add("d-none");
  appView.classList.remove("d-none");
  navAuthed.classList.remove("d-none");

  const name = user.displayName || (user.email ? user.email.split("@")[0] : "Usuário");
  const email = user.email || "";

  userChip.textContent = name;
  if (userEmailEl) userEmailEl.textContent = email;

  // Foto Google (ou fallback)
  const photo = user.photoURL;
  if (userAvatar) {
    if (photo) {
      userAvatar.src = photo;
      userAvatar.style.visibility = "visible";
    } else {
      // fallback: avatar “transparente” com iniciais via data URL simples
      const initial = (name || "U").trim().slice(0, 1).toUpperCase();
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <rect width="100%" height="100%" rx="32" ry="32" fill="#6c757d"/>
          <text x="50%" y="54%" text-anchor="middle" font-size="28" fill="white" font-family="Arial" font-weight="700">${initial}</text>
        </svg>`;
      userAvatar.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      userAvatar.style.visibility = "visible";
    }
  }
}


function showError(msg) {
  authMsg.textContent = msg;
  authMsg.classList.remove("d-none");
}

// ================================
// Google Login
// ================================
btnGoogle?.addEventListener("click", async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (e) {
    showError(e.message);
  }
});

// ================================
// Email Login
// ================================
btnEmailLogin?.addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    await auth.signInWithEmailAndPassword(
      loginEmail.value,
      loginPassword.value
    );
  } catch (e) {
    showError("Email ou senha inválidos.");
  }
});

// ================================
// Email Signup
// ================================
btnEmailSignup?.addEventListener("click", async () => {
  try {
    await auth.createUserWithEmailAndPassword(
      loginEmail.value,
      loginPassword.value
    );
  } catch (e) {
    showError(e.message);
  }
});

// ================================
// Logout
// ================================
btnLogout?.addEventListener("click", async () => {
  await auth.signOut();
  showAuth();
});



// ================================
// Cofre compartilhado - botões
// ================================
btnHousehold?.addEventListener("click", async () => {
  try {
    await openHouseholdMenu();
  } catch (e) {
    console.error(e);
    await uiAlert({ title: "Erro", text: e.message || String(e), icon: "error" });
  }
});

btnLeaveHousehold?.addEventListener("click", async () => {
  try {
    await leaveHouseholdFlow();
  } catch (e) {
    console.error(e);
    await uiAlert({ title: "Erro", text: e.message || String(e), icon: "error" });
  }
});
// ================================
// Auth State Listener
let didBoot = false;

async function bootApp() {
  // Config
  const s = await fbLoadSettings();
  state.config = s || {};
  setDefaultsIfNeeded();
  syncConfigToUI();

  // Listeners
  listenSettings();
  await listenMonth(getSelectedMonthKey());

  renderAll();
}

auth.onAuthStateChanged(async (user) => {
  if (user) {
    UID = user.uid;
    showApp(user);

    try { await upsertUserProfile(user); } catch (e) { console.warn(e); }

    if (!didBoot) {
      didBoot = true;
      await bootApp();
    }
  } else {
    didBoot = false;
    UID = null;
    showAuth();
  }
});


// ================================
// Firestore helpers
// Estrutura:
// users/{uid}/meta/settings   -> config
// users/{uid}/tx/{txId}       -> lançamentos (com monthKey)
// ================================
function settingsRef() {
  return baseDoc().collection("meta").doc("settings");
}
function txCol() {
  return baseDoc().collection("tx");
}

async function fbLoadSettings() {
  const snap = await settingsRef().get();
  return snap.exists ? snap.data() : null;
}
async function fbSaveSettings(settings) {
  await settingsRef().set(settings, { merge: true });
}

// Cada lançamento é docId = entry.id
async function fbUpsertTx(entry) {
  entry.id = cleanId(entry.id);
  await txCol().doc(entry.id).set(entry, { merge: true });
}
async function fbDeleteTx(id) {
  await txCol().doc(id).delete();
}

// Lista lançamentos do mês (sem orderBy pra evitar índice)
async function fbListTxByMonth(mKey) {
  const snap = await txCol().where("monthKey", "==", mKey).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Export/Reset precisam de tudo
async function fbListAllTx() {
  const snap = await txCol().get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Apagar tudo do usuário (batch em loop)

async function fbDeleteAllTx() {
  const col = txCol();
  while (true) {
    const snap = await col.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

function recurringCol() {
  return baseDoc().collection("recurring");
}

async function fbDeleteAllRecurring() {
  const col = recurringCol();
  while (true) {
    const snap = await col.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function fbListRecurring() {
  const snap = await recurringCol().get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fbUpsertRecurring(template) {
  template.id = cleanId(template.id);
  template.updatedAt = Date.now();
  await recurringCol().doc(template.id).set(template, { merge: true });
  return template.id;
}

function brl(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function cleanId(id) {
  const s = String(id || "").trim();
  return s.length ? s : uid();
}

function monthKeyFromDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function monthKeyNow() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function dateFromMonthDay(monthKey, day) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, clamp(day, 1, 31));
  const lastDay = new Date(y, m, 0).getDate();
  d.setDate(Math.min(d.getDate(), lastDay));
  return d.toISOString().slice(0, 10);
}

// ================================
// State (em memória) - Firestore é a fonte de verdade
// ================================
let state = {
  config: {},
  months: {}, // { [monthKey]: { entries: [] } }
};

function getMonthData(mKey) {
  state.months[mKey] ??= { entries: [] };
  return state.months[mKey];
}
function getSelectedMonthKey() {
  return monthPicker.value || state.config.selectedMonth || monthKeyNow();
}

// ================================
// UI refs
// ================================
const monthPicker = $("#monthPicker");
const salaryMonthly = $("#salaryMonthly");
const autoIncomeEnabled = $("#autoIncomeEnabled");
const autoIncomeDay1 = $("#autoIncomeDay1");
const autoIncomeDay2 = $("#autoIncomeDay2");

const sumIncome = $("#sumIncome");
const sumExpense = $("#sumExpense");
const sumBalance = $("#sumBalance");
const sumPaid = $("#sumPaid");
const paidProgress = $("#paidProgress");

const rows = $("#rows");
const emptyState = $("#emptyState");

const search = $("#search");
const filterType = $("#filterType");
const filterStatus = $("#filterStatus");

const btnGenerateIncome = $("#btnGenerateIncome");
const btnAddExpense = $("#btnAddExpense");
const btnAddIncome = $("#btnAddIncome");
const btnReset = $("#btnReset");
const btnToday = $("#btnToday");
const btnExport = $("#btnExport");
const fileImport = $("#fileImport");

let chart;

// Modal
// Modal
const entryModalEl = document.getElementById("entryModal");

function createNativeModal(el) {
  let backdrop = null;

  const show = () => {
    if (!el) return;
    el.style.display = "block";
    el.removeAttribute("aria-hidden");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("role", "dialog");
    el.classList.add("show");

    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";

    backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop fade show";
    document.body.appendChild(backdrop);
  };

  const hide = () => {
    if (!el) return;
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
    el.style.display = "none";

    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";

    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    backdrop = null;
  };

  // fecha ao clicar no backdrop do próprio modal
  el?.addEventListener("click", (ev) => {
    if (ev.target === el) hide();
  });

  // fecha no ESC
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && el.classList.contains("show")) hide();
  });

  return { show, hide };
}

const entryModal = (() => {
  if (!entryModalEl) {
    console.error('Elemento #entryModal não encontrado.');
    return { show() {}, hide() {} };
  }

  // Bootstrap 5 real
  if (window.bootstrap?.Modal) {
    return window.bootstrap.Modal.getOrCreateInstance(entryModalEl);
  }

  // Bootstrap 4 (jQuery)
  if (window.jQuery && typeof window.jQuery(entryModalEl).modal === "function") {
    return {
      show: () => window.jQuery(entryModalEl).modal("show"),
      hide: () => window.jQuery(entryModalEl).modal("hide"),
    };
  }

  // Fallback sem plugin
  console.warn("Bootstrap Modal plugin não encontrado. Usando fallback nativo.");
  return createNativeModal(entryModalEl);
})();

const entryForm = $("#entryForm");
const entryModalTitle = $("#entryModalTitle");
const entryId = $("#entryId");
const entryType = $("#entryType");
const entryDue = $("#entryDue");
const entryName = $("#entryName");
const entryCategory = $("#entryCategory");
const entryAmount = $("#entryAmount");
const entryPaid = $("#entryPaid");
const entryNotes = $("#entryNotes");
const entryRecurring = $("#entryRecurring");


// ================================
// Config defaults + sync
// ================================
function setDefaultsIfNeeded() {
  const m = monthKeyNow();
  if (!state.config.selectedMonth) state.config.selectedMonth = m;
  if (typeof state.config.salaryMonthly !== "number") state.config.salaryMonthly = 0;
  if (typeof state.config.autoIncomeEnabled !== "boolean") state.config.autoIncomeEnabled = true;
  if (typeof state.config.autoIncomeDay1 !== "number") state.config.autoIncomeDay1 = 5;
  if (typeof state.config.autoIncomeDay2 !== "number") state.config.autoIncomeDay2 = 20;
}

function syncConfigToUI() {
  monthPicker.value = state.config.selectedMonth || monthKeyNow();
  salaryMonthly.value = state.config.salaryMonthly || 0;
  autoIncomeEnabled.checked = !!state.config.autoIncomeEnabled;
  autoIncomeDay1.value = state.config.autoIncomeDay1 ?? 5;
  autoIncomeDay2.value = state.config.autoIncomeDay2 ?? 20;
}

async function syncUIToConfigAndSave() {
  state.config.selectedMonth = getSelectedMonthKey();
  state.config.salaryMonthly = Number(salaryMonthly.value || 0);
  state.config.autoIncomeEnabled = autoIncomeEnabled.checked;
  state.config.autoIncomeDay1 = clamp(Number(autoIncomeDay1.value || 5), 1, 31);
  state.config.autoIncomeDay2 = clamp(Number(autoIncomeDay2.value || 20), 1, 31);
  state.config.updatedAt = Date.now();
  await fbSaveSettings(state.config);
}

// ================================
// Entries ops (agora no Firestore)
// ================================
function upsertEntryLocal(mKey, entry) {
  const md = getMonthData(mKey);
  const idx = md.entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) md.entries[idx] = entry;
  else md.entries.push(entry);
}

function deleteEntryLocal(mKey, id) {
  const md = getMonthData(mKey);
  md.entries = md.entries.filter((e) => e.id !== id);
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const da = a.due || "";
    const dbb = b.due || "";
    if (da !== dbb) return da.localeCompare(dbb);
    return (a.type || "").localeCompare(b.type || "");
  });
}

function filteredEntries(entries) {
  const q = (search.value || "").trim().toLowerCase();
  const ft = filterType.value;
  const fs = filterStatus.value;

  return entries.filter((e) => {
    if (ft !== "all" && e.type !== ft) return false;
    if (fs === "paid" && !e.paid) return false;
    if (fs === "open" && e.paid) return false;

    if (q) {
      const blob = `${e.name || ""} ${e.category || ""} ${e.notes || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function computeSummary(entries) {
  const income = entries
    .filter((e) => e.type === "income")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const expense = entries
    .filter((e) => e.type === "expense")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const paid = entries
    .filter((e) => e.type === "expense" && e.paid)
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const balance = income - expense;
  const pct = expense > 0 ? (paid / expense) * 100 : 0;
  return { income, expense, paid, balance, pct };
}

function renderSummary(entries) {
  const { income, expense, paid, balance, pct } = computeSummary(entries);
  sumIncome.textContent = brl(income);
  sumExpense.textContent = brl(expense);
  sumPaid.textContent = brl(paid);

  sumBalance.textContent = brl(balance);
  sumBalance.classList.toggle("text-danger", balance < 0);
  sumBalance.classList.toggle("text-success", balance >= 0);

  const p = clamp(pct, 0, 100).toFixed(0);
  paidProgress.style.width = `${p}%`;
  paidProgress.textContent = `${p}%`;
}

function pillType(type) {
  if (type === "income")
    return `<span class="badge rounded-pill pill-type pill-income">Receb.</span>`;
  return `<span class="badge rounded-pill pill-type pill-expense">Despesa</span>`;
}

function formatDateBR(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) =>
  ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m])
  );
}

function renderTable(entries) {
  const list = sortEntries(filteredEntries(entries));

  rows.innerHTML = list
    .map((e) => {
      const amount = brl(e.amount);
      return `
      <tr>
        <td>${pillType(e.type)}</td>
        <td>
          <div class="fw-semibold">${escapeHtml(e.name || "")}</div>
          ${e.notes ? `<div class="small-muted">${escapeHtml(e.notes)}</div>` : ``}
        </td>
        <td>${escapeHtml(e.category || "-")}</td>
        <td>${formatDateBR(e.due)}</td>
        <td class="text-end fw-bold">${amount}</td>
        <td class="text-center">
          <div class="form-check d-inline-flex align-items-center justify-content-center">
            <input class="form-check-input" type="checkbox" ${e.paid ? "checked" : ""
        } data-action="togglePaid" data-id="${e.id}">
          </div>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="${e.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${e.id}">Excluir</button>
        </td>
      </tr>
    `;
    })
    .join("");

  const any = entries.length > 0;
  emptyState.classList.toggle("d-none", any);

  rows.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      const action = ev.currentTarget.getAttribute("data-action");
      const id = ev.currentTarget.getAttribute("data-id");
      if (action === "edit") openEdit(id);
      if (action === "delete") onDelete(id);
    });
  });

  rows.querySelectorAll('input[data-action="togglePaid"]').forEach((chk) => {
    chk.addEventListener("change", (ev) => {
      const id = ev.currentTarget.getAttribute("data-id");
      togglePaid(id, ev.currentTarget.checked);
    });
  });
}

function buildChart(entries) {
  const points = {};
  for (const e of entries) {
    if (!e.due) continue;
    const day = e.due.slice(8, 10);
    points[day] ??= { income: 0, expense: 0 };
    if (e.type === "income") points[day].income += Number(e.amount || 0);
    if (e.type === "expense") points[day].expense += Number(e.amount || 0);
  }

  const labels = Object.keys(points).sort((a, b) => Number(a) - Number(b));
  const incomeData = labels.map((d) => points[d].income);
  const expenseData = labels.map((d) => points[d].expense);

  // ✅ Saldo final (Receitas - Despesas) por dia
  const balanceData = labels.map((d) => points[d].income - points[d].expense);

  const ctx = document.getElementById("chart");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.map((d) => `${d}`),
      datasets: [
        { label: "Receitas", data: incomeData, backgroundColor: "rgba(40, 167, 69, 0.85)" }, // verde (Bootstrap success)
        { label: "Despesas", data: expenseData, backgroundColor: "rgba(220, 53, 69, 0.85)" }, // vermelho (Bootstrap danger)  
        {
          label: "Saldo final",
          data: balanceData,
          backgroundColor: "rgba(255, 193, 7, 0.85)", // amarelo (Bootstrap warning)
          borderColor: "rgba(255, 193, 7, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${brl(ctx.raw)}`,
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (v) => brl(v),
          },
        },
      },
    },
  });
}


function renderAll() {
  const mKey = getSelectedMonthKey();
  const md = getMonthData(mKey);
  const entries = md.entries || [];
  renderSummary(entries);
  renderTable(entries);
  buildChart(entries);
}

// ================================
// Modal handlers
// ================================
function openNew(type) {
  entryModalTitle.textContent = type === "income" ? "Novo Recebimento" : "Nova Despesa";
  entryId.value = "";
  entryType.value = type;
  entryName.value = "";
  entryCategory.value = "";
  entryAmount.value = "";
  entryPaid.checked = false;
  entryNotes.value = "";

  if (entryRecurring) entryRecurring.checked = false;

  const mKey = getSelectedMonthKey();
  const iso = dateFromMonthDay(mKey, new Date().getDate());
  entryDue.value = iso;

  entryModal.show();
}

function openEdit(id) {
  const mKey = getSelectedMonthKey();
  const md = getMonthData(mKey);
  const e = md.entries.find((x) => x.id === id);
  if (!e) return;

  entryModalTitle.textContent = "Editar Lançamento";
  entryId.value = e.id;
  entryType.value = e.type;
  entryDue.value = e.due;
  entryName.value = e.name || "";
  entryCategory.value = e.category || "";
  entryAmount.value = Number(e.amount || 0);
  entryPaid.checked = !!e.paid;
  entryNotes.value = e.notes || "";

  if (entryRecurring) entryRecurring.checked = !!e.recurring;

  entryModal.show();
}

async function onDelete(id) {
  const mKey = getSelectedMonthKey();
  const md = getMonthData(mKey);
  const e = md.entries.find((x) => x.id === id);
  if (!e) return;

  const ok = confirm(`Excluir "${e.name}"?`);
  if (!ok) return;

  // Firestore
  await fbDeleteTx(id);

  // Local
  deleteEntryLocal(mKey, id);
  renderAll();
}

async function togglePaid(id, paid) {
  const mKey = getSelectedMonthKey();
  const md = getMonthData(mKey);
  const e = md.entries.find((x) => x.id === id);
  if (!e) return;

  e.paid = !!paid;
  e.updatedAt = Date.now();

  // Firestore
  await fbUpsertTx(e);

  // Local
  upsertEntryLocal(mKey, e);
  renderAll();
}

// ================================
// Auto income (gera e salva no Firestore)
// ================================
async function generateAutoIncome() {
  await syncUIToConfigAndSave();

  const mKey = getSelectedMonthKey();

  // trava anti-duplicação por mês
  state.config.autoIncomeGenerated ??= {};
  if (state.config.autoIncomeGenerated[mKey]) {
    alert("Recebimentos automáticos desse mês já foram gerados.");
    return;
  }

  const salary = Number(state.config.salaryMonthly || 0);

  if (salary <= 0) {
    alert("Informe o salário do mês para gerar os recebimentos.");
    return;
  }
  if (!state.config.autoIncomeEnabled) {
    alert("Ative 'Recebimentos automáticos' para gerar.");
    return;
  }

  const day1 = state.config.autoIncomeDay1 ?? 5;
  const day2 = state.config.autoIncomeDay2 ?? 20;

  // Remove os auto gerados anteriores (no mês)
  state.config.autoIncomeGenerated ??= {};
  state.config.autoIncomeGenerated[mKey] = false;
  const md = getMonthData(mKey);
  const toDelete = (md.entries || []).filter((e) => e.autoIncome).map((e) => e.id);
  for (const id of toDelete) await fbDeleteTx(id);
  md.entries = (md.entries || []).filter((e) => !e.autoIncome);

  const half = Math.round((salary / 2) * 100) / 100;
  const rest = Math.round((salary - half) * 100) / 100;

  const e1 = {
    id: uid(),
    monthKey: mKey,
    type: "income",
    name: "Salário (parcela 1)",
    category: "Salário",
    amount: half,
    due: dateFromMonthDay(mKey, day1),
    paid: true,
    notes: "Gerado automaticamente",
    autoIncome: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const e2 = {
    id: uid(),
    monthKey: mKey,
    type: "income",
    name: "Salário (parcela 2)",
    category: "Salário",
    amount: rest,
    due: dateFromMonthDay(mKey, day2),
    paid: false,
    notes: "Gerado automaticamente",
    autoIncome: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Salva no Firestore
  await fbUpsertTx(e1);
  await fbUpsertTx(e2);

  // marca como gerado pra não duplicar
  state.config.autoIncomeGenerated[mKey] = true;
  await fbSaveSettings({ autoIncomeGenerated: state.config.autoIncomeGenerated, updatedAt: Date.now() });

  // Local
  md.entries.push(e1, e2);

  renderAll();
}


async function ensureRecurringForMonth(mKey) {
  // Cria instâncias mensais para templates recorrentes que ainda não existem neste mês
  const templates = await fbListRecurring();
  if (!templates.length) return;

  const existing = await fbListTxByMonth(mKey);
  const existingInstanceOf = new Set(existing.map((e) => e.instanceOf).filter(Boolean));

  let wrote = 0;
  const batch = db.batch();

  for (const t of templates) {
    if (t.enabled === false) continue;
    if ((t.freq || "monthly") !== "monthly") continue;

    const templateId = String(t.id || "").trim();
    if (!templateId) continue;

    if (existingInstanceOf.has(templateId)) continue;

    const day = clamp(Number(t.dayOfMonth || 1), 1, 31);
    const due = dateFromMonthDay(mKey, day);

    const entry = {
      id: uid(),
      monthKey: mKey,
      type: t.type || "expense",
      name: t.name || "Recorrente",
      category: t.category || "",
      amount: Number(t.amount || 0),
      due,
      paid: false,
      notes: t.notes || "",
      autoIncome: false,
      recurring: true,
      instanceOf: templateId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    batch.set(txCol().doc(entry.id), entry, { merge: true });
    wrote++;
  }

  if (wrote > 0) await batch.commit();
}


// ================================
// Realtime listeners
// ================================
var unsubscribeTx = null;
var unsubscribeSettings = null;

function stopListeners() {
  if (typeof unsubscribeTx === "function") unsubscribeTx();
  if (typeof unsubscribeSettings === "function") unsubscribeSettings();
  unsubscribeTx = null;
  unsubscribeSettings = null;
}

function listenSettings() {
  if (unsubscribeSettings) unsubscribeSettings();
  unsubscribeSettings = settingsRef().onSnapshot((snap) => {
    if (!snap.exists) return;
    const s = snap.data() || {};
    state.config = { ...state.config, ...s };
    setDefaultsIfNeeded();
    syncConfigToUI();
  });
}

async function listenMonth(mKey) {
  if (unsubscribeTx) unsubscribeTx();

  // limpa local do mês antes de repopular
  state.months[mKey] = { entries: [] };

  // 1) garante as recorrências do mês ANTES de escutar snapshot
  await ensureRecurringForMonth(mKey);

  // 2) agora liga o realtime
  unsubscribeTx = txCol()
    .where("monthKey", "==", mKey)
    .onSnapshot((snap) => {
      const md = getMonthData(mKey);
      md.entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
    });
}


// ================================
// Events
// ================================
monthPicker.addEventListener("change", async () => {
  // salva mês escolhido no settings
  state.config.selectedMonth = monthPicker.value || monthKeyNow();
  await fbSaveSettings({ selectedMonth: state.config.selectedMonth, updatedAt: Date.now() });

  // muda listener
  await listenMonth(state.config.selectedMonth);
  renderAll();

});

salaryMonthly.addEventListener("change", async () => {
  await syncUIToConfigAndSave();
  renderAll();
});
autoIncomeEnabled.addEventListener("change", async () => {
  await syncUIToConfigAndSave();
});
autoIncomeDay1.addEventListener("change", async () => {
  await syncUIToConfigAndSave();
});
autoIncomeDay2.addEventListener("change", async () => {
  await syncUIToConfigAndSave();
});

search.addEventListener("input", () => renderAll());
filterType.addEventListener("change", () => renderAll());
filterStatus.addEventListener("change", () => renderAll());

btnGenerateIncome.addEventListener("click", generateAutoIncome);
btnAddExpense.addEventListener("click", () => openNew("expense"));
btnAddIncome.addEventListener("click", () => openNew("income"));

btnToday.addEventListener("click", async () => {
  state.config.selectedMonth = monthKeyNow();
  await fbSaveSettings({ selectedMonth: state.config.selectedMonth, updatedAt: Date.now() });
  syncConfigToUI();
  await listenMonth(state.config.selectedMonth);
  renderAll();

});

entryForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();

  const mKey = getSelectedMonthKey();
  const id = cleanId(entryId.value);

  const entry = {
    id,
    monthKey: mKey,
    type: entryType.value,
    name: entryName.value.trim(),
    category: entryCategory.value.trim(),
    amount: Number(entryAmount.value || 0),
    due: entryDue.value,
    paid: !!entryPaid.checked,
    notes: entryNotes.value.trim(),
    autoIncome: false,
    createdAt: Date.now(), // ok mesmo em edição, não afeta muito
    updatedAt: Date.now(),
  };

  if (!entry.name) return alert("Informe um nome.");
  if (!entry.due) return alert("Informe o vencimento.");
  if (!(entry.amount >= 0)) return alert("Valor inválido.");


  // Recorrência mensal (template + instância)
  entry.recurring = !!(entryRecurring && entryRecurring.checked);
  if (entry.recurring) {
    const dayOfMonth = Number((entry.due || "").slice(8, 10) || 1);
    const template = {
      id: entry.instanceOf || uid(),
      enabled: true,
      freq: "monthly",
      dayOfMonth,
      type: entry.type,
      name: entry.name,
      category: entry.category,
      amount: entry.amount,
      notes: entry.notes,
    };
    const templateId = await fbUpsertRecurring(template);
    entry.instanceOf = templateId;
  }

  // Salva no Firestore
  await fbUpsertTx(entry);

  // Local (o realtime já vai atualizar, mas deixa responsivo instantâneo)
  upsertEntryLocal(mKey, entry);

  entryModal.hide();
  renderAll();
});

document.querySelectorAll('#entryModal [data-bs-dismiss="modal"]').forEach((btn) => {
  btn.addEventListener("click", () => entryModal.hide());
});


btnReset.addEventListener("click", async () => {
  const ok = confirm("Resetar tudo? Isso apaga seus dados no Firestore (deste usuário).");
  if (!ok) return;

  // apaga tx + settings
  await fbDeleteAllTx();
  await fbDeleteAllRecurring();
  await settingsRef().set({}, { merge: false });

  // reseta local
  state = { config: {}, months: {} };
  setDefaultsIfNeeded();
  syncConfigToUI();

  // reinicia listeners do mês atual
  listenSettings();
  listenMonth(getSelectedMonthKey());

  renderAll();
});

btnExport.addEventListener("click", async () => {
  const settings = (await fbLoadSettings()) || {};
  const allTx = await fbListAllTx();
  const recurring = await fbListRecurring();

  const exportObj = {
    version: 2,
    exportedAt: new Date().toISOString(),
    config: settings,
    tx: allTx,
    recurring,
  };

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "controle-salario-backup-firestore.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

fileImport.addEventListener("change", async () => {
  const f = fileImport.files?.[0];
  if (!f) return;

  try {
    const txt = await f.text();
    const imported = JSON.parse(txt);

    if (!imported || typeof imported !== "object") throw new Error("JSON inválido");
    if (!Array.isArray(imported.tx)) throw new Error("Backup inválido (tx não é array)");

    const cfg = imported.config || {};
    await fbSaveSettings({ ...cfg, updatedAt: Date.now() });


    // importa templates recorrentes (se houver)
    if (Array.isArray(imported.recurring)) {
      let r = 0;
      while (r < imported.recurring.length) {
        const batchR = db.batch();
        const chunkR = imported.recurring.slice(r, r + 400);
        chunkR.forEach((t) => {
          const tid = cleanId(t.id);
          const ref = recurringCol().doc(tid);
          batchR.set(ref, { ...t, id: tid, updatedAt: Date.now() }, { merge: true });
        });
        await batchR.commit();
        r += 400;
      }
    }

    // escreve tx em batches
    const all = imported.tx.map((e) => {
      // garante monthKey
      const mk = e.monthKey || monthKeyFromDate(e.due) || getSelectedMonthKey();
      return {
        ...e,
        id: cleanId(e.id),
        monthKey: mk,
        updatedAt: Date.now(),
      };
    });

    // limpa antes (opcional). aqui eu mantenho e "mergeia".
    // Se quiser limpar tudo antes, descomenta:
    // await fbDeleteAllTx();

    let i = 0;
    while (i < all.length) {
      const batch = db.batch();
      const chunk = all.slice(i, i + 400);
      chunk.forEach((entry) => {
        const ref = txCol().doc(entry.id);
        batch.set(ref, entry, { merge: true });
      });
      await batch.commit();
      i += 400;
    }

    alert("Importado com sucesso ✅");
    // realtime vai repopular automaticamente
  } catch (e) {
    alert("Falha ao importar: " + e.message);
  } finally {
    fileImport.value = "";
  }
});

// ================================
// Init (Firestore first)
// ================================
// (async function init() {
//   await ensureAuth();

//   // Config
//   const s = await fbLoadSettings();
//   state.config = s || {};
//   setDefaultsIfNeeded();
//   syncConfigToUI();

//   // Listeners
//   listenSettings();
//   await listenMonth(getSelectedMonthKey());

//   renderAll();
// })();
