const STORAGE_KEY = "expenseflow_v1";

function defaultState() {
  return {
    accounts: [{ id: crypto.randomUUID(), name: "Main Bank", balance: 5000, type: "account" }],
    creditCards: [{ id: crypto.randomUUID(), name: "Primary CC", limit: 100000, used: 0, type: "card" }],
    transactions: [],
    settings: { currency: "₹", monthlyBudget: 0, theme: "dark" },
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const fresh = defaultState();
    saveState(fresh);
    return fresh;
  }
  return JSON.parse(raw);
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const fmt = (amount, state) => `${state.settings.currency || "₹"}${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

function initTheme(state) {
  if (state.settings.theme === "light") document.body.classList.add("light");
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;
  toggle.textContent = document.body.classList.contains("light") ? "☀️" : "🌙";
  toggle.onclick = () => {
    document.body.classList.toggle("light");
    state.settings.theme = document.body.classList.contains("light") ? "light" : "dark";
    toggle.textContent = state.settings.theme === "light" ? "☀️" : "🌙";
    saveState(state);
  };
}

function findEntityName(state, id) {
  return state.accounts.find((a) => a.id === id)?.name || state.creditCards.find((c) => c.id === id)?.name || "Unknown";
}

function bindMainPage(state) {
  const form = document.getElementById("transactionForm");
  if (!form) return;

  const select = document.getElementById("accountSelect");
  const options = [...state.accounts, ...state.creditCards].map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  select.innerHTML = options;

  document.getElementById("dateInput").value = today();

  form.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const amount = Number(data.amount);
    const entity = state.accounts.find((a) => a.id === data.account) || state.creditCards.find((c) => c.id === data.account);

    if (!entity || amount <= 0) return;

    if (entity.type === "account" && data.payment === "debit") {
      entity.balance += data.kind === "income" ? amount : -amount;
    }
    if (entity.type === "card" && data.payment === "credit") {
      entity.used = Math.max(0, entity.used + (data.kind === "expense" ? amount : -amount));
    }

    state.transactions.unshift({
      id: crypto.randomUUID(),
      kind: data.kind,
      amount,
      category: data.category,
      accountId: data.account,
      payment: data.payment,
      note: data.note,
      date: data.date,
      createdAt: Date.now(),
    });

    saveState(state);
    form.reset();
    document.getElementById("dateInput").value = today();
    renderMain(state);
  };

  renderMain(state);
}

function renderMain(state) {
  const netBalance = state.accounts.reduce((sum, a) => sum + a.balance, 0);
  const creditUsed = state.creditCards.reduce((sum, c) => sum + c.used, 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthlySpend = state.transactions
    .filter((t) => t.kind === "expense" && t.date.startsWith(monthKey))
    .reduce((sum, t) => sum + t.amount, 0);

  document.getElementById("netBalance").textContent = fmt(netBalance, state);
  document.getElementById("creditUsed").textContent = fmt(creditUsed, state);
  document.getElementById("monthlySpend").textContent = fmt(monthlySpend, state);

  const budgetHint = document.getElementById("budgetHint");
  const budget = Number(state.settings.monthlyBudget || 0);
  budgetHint.textContent = budget
    ? `${((monthlySpend / budget) * 100).toFixed(1)}% of budget used`
    : "No monthly budget set yet";

  const recent = state.transactions.slice(0, 8);
  const list = document.getElementById("recentList");
  list.innerHTML = recent.length
    ? recent
        .map(
          (t) => `<li>
      <div>
        <strong>${t.category}</strong>
        <div>${findEntityName(state, t.accountId)} · ${t.date}</div>
      </div>
      <strong class="${t.kind === "income" ? "badge-income" : "badge-expense"}">${t.kind === "income" ? "+" : "-"}${fmt(t.amount, state)}</strong>
    </li>`
        )
        .join("")
    : "<li>No transactions yet. Add your first one 👆</li>";
}

function bindSettings(state) {
  const accountForm = document.getElementById("accountForm");
  const cardForm = document.getElementById("cardForm");
  const prefForm = document.getElementById("preferencesForm");
  if (!accountForm) return;

  const render = () => {
    document.getElementById("accountList").innerHTML = state.accounts
      .map((a) => `<li><span>${a.name}</span><strong>${fmt(a.balance, state)}</strong></li>`)
      .join("");
    document.getElementById("cardList").innerHTML = state.creditCards
      .map((c) => `<li><span>${c.name} (${((c.used / c.limit) * 100 || 0).toFixed(1)}%)</span><strong>${fmt(c.used, state)} / ${fmt(c.limit, state)}</strong></li>`)
      .join("");

    prefForm.currency.value = state.settings.currency;
    prefForm.monthlyBudget.value = state.settings.monthlyBudget || "";
  };

  accountForm.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(accountForm).entries());
    state.accounts.push({ id: crypto.randomUUID(), name: data.name, balance: Number(data.balance), type: "account" });
    saveState(state);
    accountForm.reset();
    render();
  };

  cardForm.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(cardForm).entries());
    state.creditCards.push({
      id: crypto.randomUUID(),
      name: data.name,
      limit: Number(data.limit),
      used: Number(data.used || 0),
      type: "card",
    });
    saveState(state);
    cardForm.reset();
    render();
  };

  prefForm.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(prefForm).entries());
    state.settings.currency = data.currency || "₹";
    state.settings.monthlyBudget = Number(data.monthlyBudget || 0);
    saveState(state);
    render();
  };

  render();
}

function bindInsights(state) {
  if (!document.getElementById("categoryBreakdown")) return;

  const expenses = state.transactions.filter((t) => t.kind === "expense");
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
  const byCategory = expenses.reduce((acc, tx) => {
    acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
    return acc;
  }, {});

  const categoryHtml = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => {
      const pct = totalExpense ? (val / totalExpense) * 100 : 0;
      return `<div class="bar-row"><div>${cat} <strong>${fmt(val, state)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
    })
    .join("");
  document.getElementById("categoryBreakdown").innerHTML = categoryHtml || "No expense data yet.";

  document.getElementById("accountBalances").innerHTML = state.accounts
    .map((a) => `<article class="metric-box"><small>${a.name}</small><h3>${fmt(a.balance, state)}</h3></article>`)
    .join("");

  document.getElementById("ccUtilisation").innerHTML = state.creditCards
    .map((c) => {
      const pct = c.limit ? (c.used / c.limit) * 100 : 0;
      return `<div class="bar-row"><div>${c.name} <strong>${pct.toFixed(1)}%</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, pct)}%"></div></div></div>`;
    })
    .join("") || "No cards yet.";

  const byMonth = state.transactions.reduce((acc, t) => {
    const key = t.date.slice(0, 7);
    if (!acc[key]) acc[key] = { expense: 0, income: 0 };
    acc[key][t.kind] += t.amount;
    return acc;
  }, {});

  const months = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-8);
  const maxNet = Math.max(...months.map(([, v]) => Math.max(1, v.income - v.expense)), 1);
  document.getElementById("monthlyTrend").innerHTML = months
    .map(([month, val]) => {
      const net = Math.max(0, val.income - val.expense);
      const h = (net / maxNet) * 180 + 24;
      return `<div class="trend-bar" style="height:${h}px" title="Net ${fmt(net, state)}"><span>${month.slice(5)}</span></div>`;
    })
    .join("") || "No monthly trend yet.";
}

function bindHistory(state) {
  const body = document.getElementById("historyBody");
  if (!body) return;

  const typeEl = document.getElementById("filterType");
  const catEl = document.getElementById("filterCategory");

  const render = () => {
    const type = typeEl.value;
    const categoryTerm = catEl.value.trim().toLowerCase();
    const rows = state.transactions.filter((t) => (type === "all" || t.kind === type) && t.category.toLowerCase().includes(categoryTerm));
    body.innerHTML = rows
      .map(
        (t) => `<tr>
      <td>${t.date}</td>
      <td class="${t.kind === "income" ? "badge-income" : "badge-expense"}">${t.kind}</td>
      <td>${t.category}</td>
      <td>${findEntityName(state, t.accountId)}</td>
      <td>${t.payment}</td>
      <td>${fmt(t.amount, state)}</td>
      <td>${t.note || "—"}</td>
    </tr>`
      )
      .join("");
  };

  typeEl.oninput = render;
  catEl.oninput = render;

  document.getElementById("exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expenseflow-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  render();
}

(function init() {
  const state = loadState();
  initTheme(state);
  bindMainPage(state);
  bindSettings(state);
  bindInsights(state);
  bindHistory(state);
})();
