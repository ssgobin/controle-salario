window.Charts = (() => {
  function brl(v) {
    const n = Number(v || 0);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  let charts = {};
  function buildDailyChart(entries) {
    const el = document.getElementById("chartDaily");
    if (!el) return;
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
    const balanceData = labels.map((d) => points[d].income - points[d].expense);
    if (charts.chartDaily) {
      try { charts.chartDaily.destroy(); } catch {}
    }
    charts.chartDaily = new Chart(el, {
      type: "bar",
      data: {
        labels: labels.map((d) => `${d}`),
        datasets: [
          { label: "Receitas", data: incomeData, backgroundColor: "rgba(40, 167, 69, 0.85)" },
          { label: "Despesas", data: expenseData, backgroundColor: "rgba(220, 53, 69, 0.85)" },
          { label: "Saldo final", data: balanceData, backgroundColor: "rgba(255, 193, 7, 0.85)", borderColor: "rgba(255,193,7,1)", borderWidth: 1 },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${brl(ctx.raw)}` } },
        },
        scales: { y: { ticks: { callback: (v) => brl(v) } } },
      },
    });
  }
  function buildCategoryChart(entries) {
    const el = document.getElementById("chartByCategory");
    if (!el) return;
    const totals = {};
    for (const e of entries) {
      if (e.type !== "expense") continue;
      const cat = (e.category || "Outros").trim();
      totals[cat] = (totals[cat] || 0) + Number(e.amount || 0);
    }
    const labels = Object.keys(totals);
    const data = labels.map((k) => totals[k]);
    const colors = labels.map((_, i) => `hsl(${(i * 47) % 360} 70% 55% / 0.9)`);
    if (charts.chartByCategory) {
      try { charts.chartByCategory.destroy(); } catch {}
    }
    charts.chartByCategory = new Chart(el, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors }] },
      options: {
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${brl(ctx.raw)}` } },
        },
      },
    });
  }
  return { buildDailyChart, buildCategoryChart };
})();
