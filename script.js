let tasks = [];

window.onload = () => {
  const saved = localStorage.getItem("tasks");
  if (saved) {
    tasks = JSON.parse(saved);
    renderTasks();
  }
};

function addTask() {
  const input = document.getElementById("task-input");
  const dueDate = document.getElementById("due-date").value;
  const text = input.value.trim();

  if (!text) return;

  tasks.push({ text, completed: false, dueDate });
  localStorage.setItem("tasks", JSON.stringify(tasks));
  input.value = "";
  document.getElementById("due-date").value = "";
  renderTasks();
}

function renderTasks() {
  const list = document.getElementById("task-list");
  list.innerHTML = "";

  tasks.forEach((task, index) => {
    const li = document.createElement("li");
    if (task.completed) li.classList.add("completed");

    li.innerHTML = `
      <span onclick="toggleComplete(${index})">${task.text} 
        ${task.dueDate ? `<br><small>Due: ${task.dueDate}</small>` : ""}</span>
      <div>
        <button onclick="editTask(${index})">✏️</button>
        <button onclick="deleteTask(${index})">🗑️</button>
      </div>
    `;

    list.appendChild(li);
  });
}

function toggleComplete(index) {
  tasks[index].completed = !tasks[index].completed;
  localStorage.setItem("tasks", JSON.stringify(tasks));
  renderTasks();
}

function deleteTask(index) {
  tasks.splice(index, 1);
  localStorage.setItem("tasks", JSON.stringify(tasks));
  renderTasks();
}

function editTask(index) {
  const updated = prompt("Edit your task:", tasks[index].text);
  if (updated) {
    tasks[index].text = updated;
    localStorage.setItem("tasks", JSON.stringify(tasks));
    renderTasks();
  }
}

function clearAllTasks() {
  if (confirm("Are you sure you want to delete all tasks?")) {
    tasks = [];
    localStorage.removeItem("tasks");
    renderTasks();
  }
}

function filterTasks() {
  const search = document.getElementById("search").value.toLowerCase();
  const items = document.querySelectorAll("#task-list li");

  items.forEach((item) => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(search) ? "flex" : "none";
  });
}
