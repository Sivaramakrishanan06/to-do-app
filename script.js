const STORAGE_KEY = "flowpilot_users";
const SESSION_KEY = "flowpilot_session";
const MAX_TASK_LENGTH = 180;
const REMINDER_INTERVAL_MS = 60_000;

const state = {
  users: loadJSON(STORAGE_KEY, {}),
  currentUser: localStorage.getItem(SESSION_KEY) || null,
  dragSourceId: null,
  channel: "BroadcastChannel" in window ? new BroadcastChannel("flowpilot-sync") : null,
  searchTerm: "",
  statusFilter: "all"
};

const ui = {};

window.addEventListener("DOMContentLoaded", init);

function init() {
  cacheUI();
  bindEvents();
  loadTheme();
  state.channel?.addEventListener("message", refreshFromStorage);
  window.addEventListener("storage", refreshFromStorage);
  refreshUI();
  setInterval(checkDueReminders, REMINDER_INTERVAL_MS);
}

function cacheUI() {
  [
    "auth-panel", "main-panel", "welcome-title", "auth-message", "task-list", "task-input", "task-priority", "due-date", "search",
    "status-filter", "metric-total", "metric-completed", "metric-focus", "metric-due", "analytics-chart", "ai-plan", "reminder-btn",
    "auth-name", "auth-email", "auth-password", "sr-live"
  ].forEach((id) => { ui[id.replace(/-/g, "_")] = document.getElementById(id); });
}

function bindEvents() {
  document.getElementById("register-btn").addEventListener("click", registerUser);
  document.getElementById("login-btn").addEventListener("click", loginUser);
  document.getElementById("logout-btn").addEventListener("click", logoutUser);
  document.getElementById("add-task-btn").addEventListener("click", addTask);
  document.getElementById("clear-all-btn").addEventListener("click", clearAllTasks);
  document.getElementById("ai-plan-btn").addEventListener("click", () => generateAIPlan(true));
  document.getElementById("theme-toggle").addEventListener("click", toggleDarkMode);
  document.getElementById("reminder-btn").addEventListener("click", enableReminders);

  ui.search.addEventListener("input", debounce((e) => {
    state.searchTerm = sanitizeText(e.target.value.toLowerCase(), 200);
    renderTasks();
  }, 120));
  ui.status_filter.addEventListener("change", (e) => {
    state.statusFilter = e.target.value;
    renderTasks();
  });

  ui.task_input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTask();
  });
}

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveUsers() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.users)); state.channel?.postMessage("sync"); }
function getTasks() { return state.users[state.currentUser]?.tasks || []; }
function setTasks(tasks) { state.users[state.currentUser].tasks = tasks; saveUsers(); }

function refreshFromStorage() { state.users = loadJSON(STORAGE_KEY, {}); refreshUI(false); }
function refreshUI(updateMessage = true) {
  if (state.currentUser && state.users[state.currentUser]) {
    ui.auth_panel.classList.add("hidden");
    ui.main_panel.classList.remove("hidden");
    ui.welcome_title.textContent = `Welcome back, ${state.users[state.currentUser].name}`;
    renderTasks();
    updateAnalytics();
    generateAIPlan(false);
    return;
  }

  state.currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  ui.auth_panel.classList.remove("hidden");
  ui.main_panel.classList.add("hidden");
  if (updateMessage) setAuthMessage("Sign in to continue.");
}

function registerUser() {
  const [name, email, password] = authInputs();
  if (!name || !email || !password) return setAuthMessage("Fill out all fields.");
  if (!isValidEmail(email)) return setAuthMessage("Enter a valid email.");
  if (password.length < 8) return setAuthMessage("Password must be at least 8 characters.");
  if (state.users[email]) return setAuthMessage("Account already exists.");
  state.users[email] = { name, password: encodePassword(password), tasks: [] };
  saveUsers();
  setAuthMessage("Account created. Please sign in.");
}
function loginUser() {
  const [, email, password] = authInputs();
  const user = state.users[email];
  if (!user) return setAuthMessage("Invalid credentials.");

  const encodedInput = encodePassword(password);
  const matched = user.password === encodedInput || user.password === password;
  if (!matched) return setAuthMessage("Invalid credentials.");

  if (user.password === password) {
    user.password = encodedInput;
    saveUsers();
  }

  state.currentUser = email;
  localStorage.setItem(SESSION_KEY, email);
  refreshUI();
}
function logoutUser() { state.currentUser = null; refreshUI(); announce("Logged out"); }
function authInputs() {
  return ["auth_name", "auth_email", "auth_password"].map((id) => sanitizeText(ui[id].value.trim(), id === "auth_password" ? 128 : 80));
}
function setAuthMessage(msg) { ui.auth_message.textContent = msg; announce(msg); }

function addTask() {
  const text = sanitizeText(ui.task_input.value.trim(), MAX_TASK_LENGTH);
  if (!text || !state.currentUser) return;
  const tasks = getTasks();
  tasks.unshift({
    id: crypto.randomUUID(),
    text,
    priority: ui.task_priority.value,
    dueDate: ui.due_date.value,
    completed: false,
    createdAt: Date.now(),
    reminded: false,
    completedAt: null
  });
  setTasks(tasks);
  ui.task_input.value = "";
  ui.due_date.value = "";
  renderTasks(); updateAnalytics(); generateAIPlan(false);
}

function renderTasks() {
  const list = ui.task_list;
  const fragment = document.createDocumentFragment();
  list.textContent = "";

  const filtered = getTasks().filter((t) => t.text.toLowerCase().includes(state.searchTerm))
    .filter((t) => state.statusFilter === "all" || (state.statusFilter === "done" ? t.completed : !t.completed));

  filtered.forEach((task) => fragment.appendChild(taskNode(task)));
  list.appendChild(fragment);
}

function taskNode(task) {
  const li = document.createElement("li");
  li.className = "task-item";
  li.draggable = true;
  li.dataset.id = task.id;

  const top = document.createElement("div"); top.className = "task-top";
  const title = document.createElement("strong");
  if (task.completed) title.classList.add("completed-title");
  title.textContent = task.text;

  const badges = document.createElement("div"); badges.className = "badges";
  const priority = document.createElement("span"); priority.className = "badge"; priority.textContent = task.priority.toUpperCase();
  badges.append(priority);
  if (task.dueDate) {
    const due = document.createElement("span"); due.className = "badge"; due.textContent = `Due ${task.dueDate}`;
    badges.append(due);
  }
  top.append(title, badges);

  const actions = document.createElement("div"); actions.className = "actions";
  actions.append(
    actionButton(task.completed ? "Undo" : "Done", () => toggleComplete(task.id)),
    actionButton("Edit", () => editTask(task.id), "ghost"),
    actionButton("Delete", () => deleteTask(task.id), "danger")
  );

  li.append(top, actions);
  li.addEventListener("dragstart", () => { state.dragSourceId = task.id; li.classList.add("dragging"); });
  li.addEventListener("dragend", () => li.classList.remove("dragging"));
  li.addEventListener("dragover", (e) => e.preventDefault());
  li.addEventListener("drop", () => reorderTask(task.id));
  return li;
}

function actionButton(label, onClick, css = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = css;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function reorderTask(targetId) {
  if (!state.dragSourceId || state.dragSourceId === targetId) return;
  const tasks = [...getTasks()];
  const from = tasks.findIndex((t) => t.id === state.dragSourceId);
  const to = tasks.findIndex((t) => t.id === targetId);
  if (from < 0 || to < 0) return;
  const [moved] = tasks.splice(from, 1);
  tasks.splice(to, 0, moved);
  setTasks(tasks);
  renderTasks();
}
function toggleComplete(id) { updateTask(id, (t) => { t.completed = !t.completed; t.completedAt = t.completed ? Date.now() : null; }); }
function editTask(id) {
  const tasks = getTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  const text = sanitizeText(prompt("Edit task", task.text)?.trim() || "", MAX_TASK_LENGTH);
  if (!text) return;
  task.text = text;
  setTasks(tasks); renderTasks(); generateAIPlan(false);
}
function deleteTask(id) { setTasks(getTasks().filter((t) => t.id !== id)); renderTasks(); updateAnalytics(); }
function clearAllTasks() { if (confirm("Clear all tasks?")) { setTasks([]); renderTasks(); updateAnalytics(); } }
function updateTask(id, updater) {
  const tasks = getTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  updater(task);
  setTasks(tasks); renderTasks(); updateAnalytics(); generateAIPlan(false);
}

function updateAnalytics() {
  const tasks = getTasks();
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const today = new Date().toISOString().slice(0, 10);
  const dueToday = tasks.filter((t) => t.dueDate === today && !t.completed).length;
  const focus = total ? Math.round((completed / total) * 100) : 0;
  ui.metric_total.textContent = total;
  ui.metric_completed.textContent = completed;
  ui.metric_focus.textContent = `${focus}%`;
  ui.metric_due.textContent = dueToday;
  renderChart(tasks);
}

function renderChart(tasks) {
  const chart = ui.analytics_chart;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return { label: d.toLocaleDateString(undefined, { weekday: "short" }), key };
  });

  const completedByDay = tasks.reduce((acc, task) => {
    if (!task.completedAt) return acc;
    const key = new Date(task.completedAt).toISOString().slice(0, 10);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const max = Math.max(1, ...days.map(({ key }) => completedByDay[key] || 0));
  chart.innerHTML = days.map(({ label, key }) => {
    const count = completedByDay[key] || 0;
    const h = Math.round((count / max) * 140) + 8;
    return `<div class="bar-wrap"><div class="bar" style="height:${h}px"></div><div>${label}<br>${count}</div></div>`;
  }).join("");
}

function generateAIPlan(announceToUser = true) {
  const tasks = getTasks();
  const open = tasks.filter((t) => !t.completed);
  const high = open.filter((t) => t.priority === "high");
  const dueSoon = open.filter((t) => t.dueDate && t.dueDate <= new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  let msg = "No pending work. Perfect time to plan a strategic goal.";
  if (open.length) msg = `You have ${open.length} open tasks. Start with ${high.length || 1} high-priority item${high.length === 1 ? "" : "s"}, then batch ${Math.max(open.length - high.length, 0)} medium/low tasks. ${dueSoon.length ? `${dueSoon.length} task(s) are due soon—handle them before noon.` : "No urgent due dates today."}`;
  ui.ai_plan.textContent = msg;
  if (announceToUser) announce("AI plan refreshed");
}

function loadTheme() { document.body.classList.toggle("dark-mode", localStorage.getItem("theme") === "dark"); }
function toggleDarkMode() {
  const dark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("theme", dark ? "dark" : "light");
  document.getElementById("theme-toggle").setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
}

async function enableReminders() {
  if (!("Notification" in window)) return announce("Notifications not supported on this device.");
  const permission = await Notification.requestPermission();
  ui.reminder_btn.textContent = permission === "granted" ? "Reminders Enabled" : "Enable Reminders";
}
function checkDueReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted" || !state.currentUser) return;
  const today = new Date().toISOString().slice(0, 10);
  const tasks = getTasks();
  let changed = false;
  tasks.forEach((task) => {
    if (!task.completed && task.dueDate === today && !task.reminded) {
      new Notification("Task reminder", { body: task.text });
      task.reminded = true;
      changed = true;
    }
  });
  if (changed) setTasks(tasks);
}

function sanitizeText(input, maxLength) { return input.replace(/[<>]/g, "").slice(0, maxLength); }
function encodePassword(password) { return btoa(unescape(encodeURIComponent(password))); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function announce(message) { ui.sr_live.textContent = message; }
function debounce(fn, delay) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; }
