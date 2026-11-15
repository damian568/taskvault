// app.js - browser-side logic (plain JavaScript). Talks to the REST API with fetch().

const form = document.getElementById('task-form');
const input = document.getElementById('task-title');
const list = document.getElementById('task-list');
const message = document.getElementById('message');

// Helper around fetch(): sends JSON, throws on errors, returns parsed JSON (null for 204).
async function api(method, url, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));   // error body may not be JSON
    throw new Error(data.error || `request failed (HTTP ${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

function showMessage(text) {
  message.textContent = text;
}

// addEventListener instead of onclick="..." because the CSP blocks inline handlers.
function makeButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

// Redraw the whole list.
function renderTasks(tasks) {
  list.replaceChildren();

  if (tasks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No tasks yet.';
    list.append(empty);
    return;
  }

  for (const task of tasks) {
    const item = document.createElement('li');
    item.className = task.status === 'done' ? 'task done' : 'task';

    // SECURITY: textContent, never innerHTML -> "<script>" is shown as text (no XSS).
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = task.title;

    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    const toggle = makeButton(task.status === 'done' ? 'Undo' : 'Done', () =>
      runAndReload(() => api('PUT', `/api/tasks/${task.id}`, { status: nextStatus })));

    const remove = makeButton('Delete', () => {
      if (confirm(`Delete "${task.title}"?`)) {
        runAndReload(() => api('DELETE', `/api/tasks/${task.id}`));
      }
    });
    remove.className = 'danger';

    item.append(title, toggle, remove);
    list.append(item);
  }
}

async function loadTasks() {
  try {
    renderTasks(await api('GET', '/api/tasks'));
  } catch (err) {
    showMessage(`Could not load tasks: ${err.message}`);
  }
}

// Run an action, then reload the list. Show errors instead of failing silently.
async function runAndReload(action) {
  try {
    await action();
    showMessage('');
    await loadTasks();
  } catch (err) {
    showMessage(`Error: ${err.message}`);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();             // stop the full-page reload
  const title = input.value.trim();
  if (!title) return;
  runAndReload(async () => {
    await api('POST', '/api/tasks', { title });
    input.value = '';
  });
});

loadTasks();
