let tasks = [];

window.onload = () => {
  const saved = localStorage.getItem("tasks");
  if (saved) {
    try {
      tasks = JSON.parse(saved);
    } catch {
      tasks = [];
      localStorage.removeItem("tasks");
    }
  }

  renderTasks();
};

function saveTasks() {
  localStorage.setItem("tasks", JSON.stringify(tasks));
}

function addTask() {
  const input = document.getElementById("task-input");
  const dueDate = document.getElementById("due-date").value;
  const text = input.value.trim();

  if (!text) return;

  tasks.push({ text, completed: false, dueDate });
  saveTasks();
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

    const taskContent = document.createElement("span");
    taskContent.onclick = () => toggleComplete(index);
    taskContent.appendChild(document.createTextNode(task.text));

    if (task.dueDate) {
      taskContent.appendChild(document.createElement("br"));

      const dueDate = document.createElement("small");
      dueDate.textContent = `Due: ${task.dueDate}`;
      taskContent.appendChild(dueDate);
    }

    const actions = document.createElement("div");

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "✏️";
    editButton.onclick = () => editTask(index);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "🗑️";
    deleteButton.onclick = () => deleteTask(index);

    actions.append(editButton, deleteButton);
    li.append(taskContent, actions);
    list.appendChild(li);
  });

  filterTasks();
}

function toggleComplete(index) {
  tasks[index].completed = !tasks[index].completed;
  saveTasks();
  renderTasks();
}

function deleteTask(index) {
  tasks.splice(index, 1);
  saveTasks();
  renderTasks();
}

function editTask(index) {
  const updated = prompt("Edit your task:", tasks[index].text);
  if (updated === null) return;

  const text = updated.trim();
  if (!text) return;

  tasks[index].text = text;
  saveTasks();
  renderTasks();
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
