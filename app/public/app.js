// =============================================================================
// app.js - browser-side logic for the TaskVault page (plain JavaScript, no framework).
// Talks to the REST API with fetch() and redraws the task list after every change.
// =============================================================================

// References to the page elements defined in index.html.
const form = document.getElementById('task-form');
const input = document.getElementById('task-title');
const list = document.getElementById('task-list');
const message = document.getElementById('message');

// Small helper around fetch():
//  - sends the body as JSON when one is given
//  - throws an Error with the server's message for non-2xx responses
//  - returns the parsed JSON (or null for 204 No Content)
async function api(method, url, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';  // tells Express to parse it as JSON
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);                    // relative URL = same origin (via nginx)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));        // error body may not be JSON (e.g. 502 from nginx)
    throw new Error(data.error || `request failed (HTTP ${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

// Show a short message to the user (empty string clears it).
function showMessage(text) {
  message.textContent = text;
}

// Build a button with a label and a click handler.
// (addEventListener instead of onclick="..." in HTML, because the CSP blocks inline handlers.)
function makeButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

// Redraw the whole list from an array of tasks.
function renderTasks(tasks) {
  list.replaceChildren();                       // remove the old items

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

    // SECURITY: textContent (never innerHTML). A title like "<script>...</script>"
    // is shown as plain text instead of being executed -> prevents stored XSS.
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = task.title;

    // Toggle between 'todo' and 'done' -> PUT /api/tasks/:id
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    const toggle = makeButton(task.status === 'done' ? 'Undo' : 'Done', () =>
      runAndReload(() => api('PUT', `/api/tasks/${task.id}`, { status: nextStatus })));

    // Delete -> DELETE /api/tasks/:id (after a confirmation)
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

// Load all tasks from the API and draw them.
async function loadTasks() {
  try {
    renderTasks(await api('GET', '/api/tasks'));
  } catch (err) {
    showMessage(`Could not load tasks: ${err.message}`);
  }
}

// Run an API action, then reload the list. Errors are shown instead of failing silently.
async function runAndReload(action) {
  try {
    await action();
    showMessage('');
    await loadTasks();
  } catch (err) {
    showMessage(`Error: ${err.message}`);
  }
}

// Create a task when the form is submitted.
form.addEventListener('submit', (event) => {
  event.preventDefault();                      // stop the browser's default full-page form submit
  const title = input.value.trim();
  if (!title) return;
  runAndReload(async () => {
    await api('POST', '/api/tasks', { title });
    input.value = '';                          // clear the input after success
  });
});

// Initial load when the page opens.
loadTasks();
