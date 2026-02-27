const STORAGE_KEY = "expenseflow_v2";

function defaultState() {
  return {
    accounts: [],
    creditCards: [],
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

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (amount, state) => `${state.settings.currency || "₹"}${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function initTheme(state) {
  if (state.settings.theme === "light") document.body.classList.add("light");
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;
  const sync = () => (toggle.textContent = document.body.classList.contains("light") ? "☀️" : "🌙");
  sync();
  toggle.onclick = () => {
    document.body.classList.toggle("light");
    state.settings.theme = document.body.classList.contains("light") ? "light" : "dark";
    sync();
    saveState(state);
  };
}

function initAmbientEffects() {
  window.addEventListener("pointermove", (e) => {
    document.documentElement.style.setProperty("--x", `${e.clientX}px`);
    document.documentElement.style.setProperty("--y", `${e.clientY}px`);
  });

  const hero = document.getElementById("transactionHero");
  if (!hero) return;
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    const rx = ((e.clientY - r.top) / r.height - 0.5) * -2.5;
    const ry = ((e.clientX - r.left) / r.width - 0.5) * 2.5;
    hero.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  });
  hero.addEventListener("pointerleave", () => {
    hero.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
  });
}

function findEntityName(state, id) {
  return state.accounts.find((a) => a.id === id)?.name || state.creditCards.find((c) => c.id === id)?.name || "Unknown";
}

function bindMainPage(state) {
  const form = document.getElementById("transactionForm");
  if (!form) return;

  const select = document.getElementById("accountSelect");
  const submitBtn = form.querySelector("button[type='submit']");
  const setupHint = document.getElementById("setupHint");

  const renderOptions = () => {
    const hasAccounts = state.accounts.length > 0;
    const hasCards = state.creditCards.length > 0;
    const parts = [];
    if (hasAccounts) {
      parts.push(`<optgroup label="Accounts">${state.accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join("")}</optgroup>`);
    }
    if (hasCards) {
      parts.push(`<optgroup label="Cards">${state.creditCards.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</optgroup>`);
    }

    if (!parts.length) {
      select.innerHTML = '<option value="">No account/card configured</option>';
      select.disabled = true;
      submitBtn.disabled = true;
      setupHint.textContent = "Add at least one account or card in Settings to start tracking.";
    } else {
      select.innerHTML = parts.join("");
      select.disabled = false;
      submitBtn.disabled = false;
      setupHint.textContent = "";
    }
  };

  renderOptions();
  document.getElementById("dateInput").value = today();

  select.onchange = () => {
    const chosenId = select.value;
    const isCard = state.creditCards.some((c) => c.id === chosenId);
    const pay = document.getElementById("payment");
    pay.value = isCard ? "credit" : "debit";
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const amount = Number(data.amount);
    if (!data.account || amount <= 0) return;

    const account = state.accounts.find((a) => a.id === data.account);
    const card = state.creditCards.find((c) => c.id === data.account);

    if (account && data.payment === "debit") account.balance += data.kind === "income" ? amount : -amount;
    if (card && data.payment === "credit") card.used = Math.max(0, card.used + (data.kind === "expense" ? amount : -amount));

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
    renderOptions();
    renderMain(state);
  };

  renderMain(state);
}

function renderMain(state) {
  const netBalance = state.accounts.reduce((s, a) => s + a.balance, 0);
  const creditUsed = state.creditCards.reduce((s, c) => s + c.used, 0);
  const month = new Date().toISOString().slice(0, 7);
  const monthlySpend = state.transactions.filter((t) => t.kind === "expense" && t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0);

  const net = document.getElementById("netBalance");
  const cre = document.getElementById("creditUsed");
  const mon = document.getElementById("monthlySpend");
  if (net) net.textContent = fmt(netBalance, state);
  if (cre) cre.textContent = fmt(creditUsed, state);
  if (mon) mon.textContent = fmt(monthlySpend, state);

  const budgetHint = document.getElementById("budgetHint");
  if (budgetHint) {
    const b = Number(state.settings.monthlyBudget || 0);
    budgetHint.textContent = b ? `${((monthlySpend / b) * 100).toFixed(1)}% of budget` : "No monthly budget set";
  }

  const list = document.getElementById("recentList");
  if (!list) return;
  const recent = state.transactions.slice(0, 7);
  list.innerHTML = recent.length
    ? recent
        .map(
          (t) => `<li><div><strong>${t.category}</strong><div>${findEntityName(state, t.accountId)} • ${t.date}</div></div><strong class="${t.kind === "income" ? "badge-income" : "badge-expense"}">${t.kind === "income" ? "+" : "-"}${fmt(t.amount, state)}</strong></li>`
        )
        .join("")
    : "<li>No transactions yet.</li>";
}

function bindSettings(state) {
  const accountForm = document.getElementById("accountForm");
  const cardForm = document.getElementById("cardForm");
  const prefForm = document.getElementById("preferencesForm");
  if (!accountForm) return;

  const render = () => {
    document.getElementById("accountList").innerHTML = state.accounts.length
      ? state.accounts.map((a) => `<li><span>${a.name}</span><strong>${fmt(a.balance, state)}</strong></li>`).join("")
      : "<li>No accounts added.</li>";

    document.getElementById("cardList").innerHTML = state.creditCards.length
      ? state.creditCards
          .map((c) => `<li><span>${c.name} (${((c.used / c.limit) * 100 || 0).toFixed(1)}%)</span><strong>${fmt(c.used, state)} / ${fmt(c.limit, state)}</strong></li>`)
          .join("")
      : "<li>No cards added.</li>";

    prefForm.currency.value = state.settings.currency || "₹";
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
    state.creditCards.push({ id: crypto.randomUUID(), name: data.name, limit: Number(data.limit), used: Number(data.used || 0), type: "card" });
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

  document.getElementById("categoryBreakdown").innerHTML = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => {
      const pct = totalExpense ? (val / totalExpense) * 100 : 0;
      return `<div>${cat} <strong>${fmt(val, state)}</strong><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
    })
    .join("") || "No expense data yet.";

  document.getElementById("accountBalances").innerHTML = state.accounts.map((a) => `<article class="metric-box"><small>${a.name}</small><h3>${fmt(a.balance, state)}</h3></article>`).join("") || "No accounts yet.";

  document.getElementById("ccUtilisation").innerHTML = state.creditCards
    .map((c) => `<div>${c.name} <strong>${((c.used / c.limit) * 100 || 0).toFixed(1)}%</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, (c.used / c.limit) * 100 || 0)}%"></div></div></div>`)
    .join("") || "No cards yet.";

  const byMonth = state.transactions.reduce((acc, t) => {
    const key = t.date.slice(0, 7);
    if (!acc[key]) acc[key] = { expense: 0, income: 0 };
    acc[key][t.kind] += t.amount;
    return acc;
  }, {});
  const months = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-8);
  const maxNet = Math.max(...months.map(([, v]) => Math.max(v.income - v.expense, 1)), 1);
  document.getElementById("monthlyTrend").innerHTML = months.map(([m, v]) => `<div class="trend-bar" style="height:${((Math.max(v.income - v.expense, 0) / maxNet) * 180 + 24)}px"><span>${m.slice(5)}</span></div>`).join("") || "No monthly trend yet.";
}

function bindHistory(state) {
  const body = document.getElementById("historyBody");
  if (!body) return;
  const typeEl = document.getElementById("filterType");
  const catEl = document.getElementById("filterCategory");

  const render = () => {
    const type = typeEl.value;
    const cat = catEl.value.trim().toLowerCase();
    const rows = state.transactions.filter((t) => (type === "all" || t.kind === type) && t.category.toLowerCase().includes(cat));
    body.innerHTML = rows
      .map(
        (t) => `<tr><td>${t.date}</td><td class="${t.kind === "income" ? "badge-income" : "badge-expense"}">${t.kind}</td><td>${t.category}</td><td>${findEntityName(state, t.accountId)}</td><td>${t.payment}</td><td>${fmt(t.amount, state)}</td><td>${t.note || "—"}</td></tr>`
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
  initAmbientEffects();
  bindMainPage(state);
  bindSettings(state);
  bindInsights(state);
  bindHistory(state);
})();
