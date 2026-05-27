const STORAGE_KEY = "flowpilot_users";
const SESSION_KEY = "flowpilot_session";
let users = loadJSON(STORAGE_KEY, {});
let currentUser = localStorage.getItem(SESSION_KEY) || null;
let dragSourceId = null;
const channel = "BroadcastChannel" in window ? new BroadcastChannel("flowpilot-sync") : null;

window.onload = () => {
  loadTheme();
  channel?.addEventListener("message", refreshFromStorage);
  window.addEventListener("storage", refreshFromStorage);
  refreshUI();
  setInterval(checkDueReminders, 60_000);
};

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveUsers() { localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); channel?.postMessage("sync"); }
function getTasks() { return users[currentUser]?.tasks || []; }
function setTasks(tasks) { users[currentUser].tasks = tasks; saveUsers(); }

function refreshFromStorage() { users = loadJSON(STORAGE_KEY, {}); refreshUI(false); }
function refreshUI(updateMessage = true) {
  if (currentUser && users[currentUser]) {
    document.getElementById("auth-panel").classList.add("hidden");
    document.getElementById("main-panel").classList.remove("hidden");
    document.getElementById("welcome-title").textContent = `Welcome back, ${users[currentUser].name}`;
    renderTasks();
    updateAnalytics();
    generateAIPlan(false);
  } else {
    currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    document.getElementById("auth-panel").classList.remove("hidden");
    document.getElementById("main-panel").classList.add("hidden");
    if (updateMessage) setAuthMessage("Sign in to continue.");
  }
}

function registerUser() {
  const [name, email, password] = authInputs();
  if (!name || !email || !password) return setAuthMessage("Fill out all fields.");
  if (users[email]) return setAuthMessage("Account already exists.");
  users[email] = { name, password, tasks: [] };
  saveUsers();
  setAuthMessage("Account created. Please sign in.");
}
function loginUser() {
  const [, email, password] = authInputs();
  if (!users[email] || users[email].password !== password) return setAuthMessage("Invalid credentials.");
  currentUser = email;
  localStorage.setItem(SESSION_KEY, email);
  refreshUI();
}
function logoutUser() { currentUser = null; refreshUI(); }
function authInputs() {
  return ["auth-name", "auth-email", "auth-password"].map((id) => document.getElementById(id).value.trim());
}
function setAuthMessage(msg) { document.getElementById("auth-message").textContent = msg; }

function addTask() {
  const text = document.getElementById("task-input").value.trim();
  if (!text || !currentUser) return;
  const priority = document.getElementById("task-priority").value;
  const dueDate = document.getElementById("due-date").value;
  const tasks = getTasks();
  tasks.unshift({ id: crypto.randomUUID(), text, priority, dueDate, completed: false, createdAt: Date.now(), reminded: false });
  setTasks(tasks);
  document.getElementById("task-input").value = "";
  document.getElementById("due-date").value = "";
  renderTasks(); updateAnalytics(); generateAIPlan(false);
}

function renderTasks() {
  const list = document.getElementById("task-list");
  const search = document.getElementById("search").value.toLowerCase();
  const status = document.getElementById("status-filter").value;
  list.innerHTML = "";

  getTasks().filter(t => t.text.toLowerCase().includes(search))
    .filter(t => status === "all" || (status === "done" ? t.completed : !t.completed))
    .forEach(task => list.appendChild(taskNode(task)));
}

function taskNode(task) {
  const li = document.createElement("li");
  li.className = "task-item";
  li.draggable = true;
  li.dataset.id = task.id;
  li.innerHTML = `<div class="task-top"><strong class="${task.completed ? "completed-title" : ""}">${task.text}</strong>
    <div class="badges"><span class="badge">${task.priority.toUpperCase()}</span>${task.dueDate ? `<span class="badge">Due ${task.dueDate}</span>` : ""}</div></div>
    <div class="actions"><button onclick="toggleComplete('${task.id}')">${task.completed ? "Undo" : "Done"}</button>
    <button class="ghost" onclick="editTask('${task.id}')">Edit</button><button class="danger" onclick="deleteTask('${task.id}')">Delete</button></div>`;
  li.addEventListener("dragstart", () => { dragSourceId = task.id; li.classList.add("dragging"); });
  li.addEventListener("dragend", () => li.classList.remove("dragging"));
  li.addEventListener("dragover", (e) => e.preventDefault());
  li.addEventListener("drop", () => reorderTask(task.id));
  return li;
}

function reorderTask(targetId) {
  if (!dragSourceId || dragSourceId === targetId) return;
  const tasks = [...getTasks()];
  const from = tasks.findIndex(t => t.id === dragSourceId);
  const to = tasks.findIndex(t => t.id === targetId);
  const [moved] = tasks.splice(from, 1);
  tasks.splice(to, 0, moved);
  setTasks(tasks);
  renderTasks();
}
function toggleComplete(id) { updateTask(id, t => (t.completed = !t.completed)); }
function editTask(id) {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === id);
  const text = prompt("Edit task", task.text);
  if (!text?.trim()) return;
  task.text = text.trim();
  setTasks(tasks); renderTasks(); generateAIPlan(false);
}
function deleteTask(id) { setTasks(getTasks().filter(t => t.id !== id)); renderTasks(); updateAnalytics(); }
function clearAllTasks() { if (confirm("Clear all tasks?")) { setTasks([]); renderTasks(); updateAnalytics(); } }
function updateTask(id, updater) {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  updater(task);
  setTasks(tasks); renderTasks(); updateAnalytics(); generateAIPlan(false);
}

function updateAnalytics() {
  const tasks = getTasks();
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const today = new Date().toISOString().slice(0, 10);
  const dueToday = tasks.filter(t => t.dueDate === today && !t.completed).length;
  const focus = total ? Math.round((completed / total) * 100) : 0;
  document.getElementById("metric-total").textContent = total;
  document.getElementById("metric-completed").textContent = completed;
  document.getElementById("metric-focus").textContent = `${focus}%`;
  document.getElementById("metric-due").textContent = dueToday;
  renderChart(tasks);
}

function renderChart(tasks) {
  const chart = document.getElementById("analytics-chart");
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return { label: d.toLocaleDateString(undefined, { weekday: "short" }), key };
  });
  const max = Math.max(1, ...days.map(({ key }) => tasks.filter(t => t.completed && new Date(t.createdAt).toISOString().slice(0, 10) === key).length));
  chart.innerHTML = days.map(({ label, key }) => {
    const count = tasks.filter(t => t.completed && new Date(t.createdAt).toISOString().slice(0, 10) === key).length;
    const h = Math.round((count / max) * 140) + 8;
    return `<div class="bar-wrap"><div class="bar" style="height:${h}px"></div><div>${label}<br>${count}</div></div>`;
  }).join("");
}

function generateAIPlan(announce = true) {
  const tasks = getTasks();
  const open = tasks.filter(t => !t.completed);
  const high = open.filter(t => t.priority === "high");
  const dueSoon = open.filter(t => t.dueDate && t.dueDate <= new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  let msg = "No pending work. Perfect time to plan a strategic goal.";
  if (open.length) msg = `You have ${open.length} open tasks. Start with ${high.length || 1} high-priority item${high.length === 1 ? "" : "s"}, then batch ${Math.max(open.length - high.length, 0)} medium/low tasks. ${dueSoon.length ? `${dueSoon.length} task(s) are due soon—handle them before noon.` : "No urgent due dates today."}`;
  document.getElementById("ai-plan").textContent = msg;
  if (announce) alert("AI plan refreshed!");
}

function loadTheme() { document.body.classList.toggle("dark-mode", localStorage.getItem("theme") === "dark"); }
function toggleDarkMode() { const dark = document.body.classList.toggle("dark-mode"); localStorage.setItem("theme", dark ? "dark" : "light"); }

async function enableReminders() {
  if (!("Notification" in window)) return alert("Notifications not supported on this device.");
  const permission = await Notification.requestPermission();
  document.getElementById("reminder-btn").textContent = permission === "granted" ? "Reminders Enabled" : "Enable Reminders";
}
function checkDueReminders() {
  if (Notification.permission !== "granted" || !currentUser) return;
  const today = new Date().toISOString().slice(0, 10);
  const tasks = getTasks();
  tasks.forEach(task => {
    if (!task.completed && task.dueDate === today && !task.reminded) {
      new Notification("Task reminder", { body: task.text });
      task.reminded = true;
    }
  });
  setTasks(tasks);
}
