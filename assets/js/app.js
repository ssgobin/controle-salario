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
// Auth State Listener
// ================================
auth.onAuthStateChanged(async (user) => {
  if (user) {
    UID = user.uid;

    // 1) Atualiza UI
    showApp(user);

    // 2) Salva/atualiza perfil no Firestore
    try {
      await upsertUserProfile(user);
    } catch (e) {
      console.warn("Falha ao salvar perfil no Firestore:", e);
    }

  } else {
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
  return db.collection("users").doc(UID).collection("meta").doc("settings");
}
function txCol() {
  return db.collection("users").doc(UID).collection("tx");
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
  return db.collection("users").doc(UID).collection("recurring");
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
const entryModalEl = document.getElementById("entryModal");
const entryModal = new bootstrap.Modal(entryModalEl);
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

  const ctx = document.getElementById("chart");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.map((d) => `${d}`),
      datasets: [
        { label: "Receitas", data: incomeData },
        { label: "Despesas", data: expenseData },
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
let unsubscribeTx = null;
let unsubscribeSettings = null;

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
(async function init() {
  await ensureAuth();

  // Config
  const s = await fbLoadSettings();
  state.config = s || {};
  setDefaultsIfNeeded();
  syncConfigToUI();

  // Listeners
  listenSettings();
  await listenMonth(getSelectedMonthKey());

  renderAll();
})();
