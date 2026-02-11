document.addEventListener("DOMContentLoaded", () => {
  const projRows = document.getElementById("projRows");
  const goalMonthly = document.getElementById("goalMonthly");
  const goalSaveBtn = document.getElementById("goalSaveBtn");
  const goalCurrent = document.getElementById("goalCurrent");
  const periodStart = document.getElementById("periodStart");
  const periodEnd = document.getElementById("periodEnd");
  const periodRunBtn = document.getElementById("periodRunBtn");
  const periodIncome = document.getElementById("periodIncome");
  const periodExpense = document.getElementById("periodExpense");
  const periodBalance = document.getElementById("periodBalance");
  const cmpA = document.getElementById("cmpA");
  const cmpB = document.getElementById("cmpB");
  const cmpRunBtn = document.getElementById("cmpRunBtn");
  const cmpRows = document.getElementById("cmpRows");

  function brl(v) {
    const n = Number(v || 0);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function monthKeyNow() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  function monthKeyAdd(mk, delta) {
    const [y, m] = mk.split("-").map(Number);
    const d0 = new Date(y, m - 1 + delta, 1);
    const yy = d0.getFullYear();
    const mm = String(d0.getMonth() + 1).padStart(2, "0");
    return `${yy}-${mm}`;
  }
  function computeSummary(list) {
    let income = 0, expense = 0, paid = 0;
    for (const e of list) {
      const v = Number(e.amount || 0);
      if (e.type === "income") income += v;
      if (e.type === "expense") {
        expense += v;
        if (e.paid) paid += v;
      }
    }
    const balance = income - expense;
    const pct = expense ? (paid / expense) * 100 : 0;
    return { income, expense, paid, balance, pct };
  }

  async function runProjections() {
    if (!projRows) return;
    try {
      const mk = (window.state?.config?.selectedMonth) || monthKeyNow();
      const rec = await window.fbListRecurring();
      const salary = Number(window.state?.config?.salaryMonthly || 0);
      const autoEnabled = !!window.state?.config?.autoIncomeEnabled;
      const months = [mk, monthKeyAdd(mk, 1), monthKeyAdd(mk, 2)];
      projRows.innerHTML = months.map((mkey) => {
        const incomeRec = rec.filter((r) => (r.type || "expense") === "income").reduce((a, b) => a + Number(b.amount || 0), 0);
        const expenseRec = rec.filter((r) => (r.type || "expense") === "expense").reduce((a, b) => a + Number(b.amount || 0), 0);
        const income = (autoEnabled ? salary : 0) + incomeRec;
        const expense = expenseRec;
        const balance = income - expense;
        return `
          <tr>
            <td>${mkey}</td>
            <td class="text-end">${brl(income)}</td>
            <td class="text-end">${brl(expense)}</td>
            <td class="text-end fw-bold">${brl(balance)}</td>
          </tr>
        `;
      }).join("");
    } catch (e) {
      console.error(e);
    }
  }

  function syncGoalUI() {
    const g = Number(window.state?.config?.goalMonthly || 0);
    if (goalMonthly) goalMonthly.value = g || 0;
    if (goalCurrent) goalCurrent.textContent = brl(g);
  }
  async function saveGoal() {
    const v = Number(goalMonthly?.value || 0);
    window.state.config.goalMonthly = v;
    window.state.config.updatedAt = Date.now();
    await window.fbSaveSettings({ goalMonthly: v, updatedAt: window.state.config.updatedAt });
    syncGoalUI();
  }

  async function runPeriod() {
    if (!periodIncome || !periodExpense || !periodBalance) return;
    const s = periodStart?.value;
    const e = periodEnd?.value;
    if (!s || !e) return;
    try {
      const all = await window.fbListAllTx();
      const list = all.filter((x) => x.monthKey >= s && x.monthKey <= e);
      const sum = computeSummary(list);
      periodIncome.textContent = brl(sum.income);
      periodExpense.textContent = brl(sum.expense);
      periodBalance.textContent = brl(sum.balance);
    } catch (err) {
      console.error(err);
    }
  }

  async function runCompare() {
    if (!cmpRows) return;
    const a = cmpA?.value || monthKeyNow();
    const b = cmpB?.value || monthKeyAdd(a, -1);
    try {
      const ta = await window.fbListTxByMonth(a);
      const tb = await window.fbListTxByMonth(b);
      const sa = computeSummary(ta);
      const sb = computeSummary(tb);
      cmpRows.innerHTML = `
        <tr>
          <td>${a}</td>
          <td class="text-end">${brl(sa.income)}</td>
          <td class="text-end">${brl(sa.expense)}</td>
          <td class="text-end fw-bold">${brl(sa.balance)}</td>
        </tr>
        <tr>
          <td>${b}</td>
          <td class="text-end">${brl(sb.income)}</td>
          <td class="text-end">${brl(sb.expense)}</td>
          <td class="text-end fw-bold">${brl(sb.balance)}</td>
        </tr>
        <tr>
          <td>Diferença</td>
          <td class="text-end">${brl(sa.income - sb.income)}</td>
          <td class="text-end">${brl(sa.expense - sb.expense)}</td>
          <td class="text-end fw-bold">${brl(sa.balance - sb.balance)}</td>
        </tr>
      `;
    } catch (err) {
      console.error(err);
    }
  }

  if (goalSaveBtn) goalSaveBtn.addEventListener("click", saveGoal);
  if (periodRunBtn) periodRunBtn.addEventListener("click", runPeriod);
  if (cmpRunBtn) cmpRunBtn.addEventListener("click", runCompare);

  document.getElementById("mainTabs")?.querySelectorAll('[data-bs-toggle="tab"]').forEach((btn) => {
    btn.addEventListener("shown.bs.tab", () => {
      const mKey = window.state?.config?.selectedMonth || monthKeyNow();
      const md = window.state?.months?.[mKey] || { entries: [] };
      const entries = md.entries || [];
      window.Charts?.buildDailyChart(entries);
      window.Charts?.buildCategoryChart(entries);
      runProjections();
      syncGoalUI();
    });
  });
  runProjections();
  syncGoalUI();
});
