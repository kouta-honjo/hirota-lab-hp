const backendUrlInput = document.getElementById("backendUrl");
const saveUrlBtn = document.getElementById("saveUrlBtn");
const healthBtn = document.getElementById("healthBtn");
const refreshBtn = document.getElementById("refreshBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const filesBody = document.getElementById("filesBody");
const logBox = document.getElementById("logBox");
const newsTitle = document.getElementById("newsTitle");
const newsDate = document.getElementById("newsDate");
const newsLink = document.getElementById("newsLink");
const newsVisible = document.getElementById("newsVisible");
const newsBody = document.getElementById("newsBody");
const newsSaveBtn = document.getElementById("newsSaveBtn");
const newsResetBtn = document.getElementById("newsResetBtn");
const newsBodyTable = document.getElementById("newsBodyTable");

const eventTitle = document.getElementById("eventTitle");
const eventDate = document.getElementById("eventDate");
const eventStart = document.getElementById("eventStart");
const eventEnd = document.getElementById("eventEnd");
const eventLocation = document.getElementById("eventLocation");
const eventLink = document.getElementById("eventLink");
const eventVisible = document.getElementById("eventVisible");
const eventDesc = document.getElementById("eventDesc");
const eventSaveBtn = document.getElementById("eventSaveBtn");
const eventResetBtn = document.getElementById("eventResetBtn");
const eventsBodyTable = document.getElementById("eventsBodyTable");
const googleSignIn = document.getElementById("googleSignIn");
const signOutBtn = document.getElementById("signOutBtn");
const authStatus = document.getElementById("authStatus");

const STORAGE_KEY = "gcs_ui_backend_url";
const TOKEN_KEY = "gcs_admin_id_token";
const EMAIL_KEY = "gcs_admin_email";
let editingNewsId = null;
let editingEventId = null;

function log(message) {
  const now = new Date().toISOString();
  logBox.textContent = `[${now}] ${message}\n` + logBox.textContent;
}

function getBackendUrl() {
  return (backendUrlInput.value || "").trim().replace(/\/$/, "");
}

function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setAuthState(token, email) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    if (email) {
      localStorage.setItem(EMAIL_KEY, email);
      authStatus.textContent = `Signed in as ${email}`;
    } else {
      authStatus.textContent = "Signed in";
    }
    signOutBtn.disabled = false;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    authStatus.textContent = "Not signed in";
    signOutBtn.disabled = true;
  }
}

function parseJwt(token) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes == null) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = Number(bytes);
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
}

async function apiFetch(path, options = {}) {
  const base = getBackendUrl();
  if (!base) throw new Error("Backend URL is empty");
  const proxy = new URL("/api/proxy", window.location.origin);
  proxy.searchParams.set("base", base);
  proxy.searchParams.set("path", path);
  const init = { ...options };
  init.headers = init.headers || {};
  const token = getAuthToken();
  if (token && !init.headers.authorization) {
    init.headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(proxy.toString(), init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res;
}

async function apiJson(path, options = {}) {
  const init = { ...options };
  init.headers = init.headers || {};
  init.headers.accept = "application/json";
  if (init.body && typeof init.body !== "string") {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(init.body);
  }
  const res = await apiFetch(path, init);
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

function initGoogleAuth() {
  const clientId = window.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    authStatus.textContent = "Missing GOOGLE_OAUTH_CLIENT_ID";
    signOutBtn.disabled = true;
    return;
  }
  if (!window.google?.accounts?.id) {
    authStatus.textContent = "Google Identity Services not loaded";
    signOutBtn.disabled = true;
    return;
  }
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      const token = response?.credential || "";
      if (!token) {
        log("Google sign-in failed: missing token");
        return;
      }
      const payload = parseJwt(token);
      const email = payload?.email || "";
      setAuthState(token, email);
      log(`Signed in: ${email || "unknown"}`);
    },
  });
  window.google.accounts.id.renderButton(googleSignIn, {
    theme: "outline",
    size: "large",
  });
}

async function healthCheck() {
  try {
    const res = await apiFetch("/");
    const text = await res.text();
    log(`Health OK: ${text}`);
  } catch (err) {
    log(`Health NG: ${err.message}`);
  }
}

async function loadFiles() {
  filesBody.innerHTML = "";
  try {
    const res = await apiFetch("/files");
    const files = await res.json();
    if (!Array.isArray(files) || files.length === 0) {
      filesBody.innerHTML = '<tr><td colspan="4">No files found.</td></tr>';
      log("Loaded file list: 0 files");
      return;
    }

    for (const file of files) {
      const tr = document.createElement("tr");
      const name = file.name || "(unknown)";
      const updated = file.updated ? new Date(file.updated).toLocaleString() : "-";

      tr.innerHTML = `
        <td>${name}</td>
        <td>${formatBytes(file.size)}</td>
        <td>${updated}</td>
        <td>
          <button data-action="download" data-name="${encodeURIComponent(name)}">Download</button>
          <button class="delete" data-action="delete" data-name="${encodeURIComponent(name)}">Delete</button>
        </td>
      `;
      filesBody.appendChild(tr);
    }

    log(`Loaded file list: ${files.length} files`);
  } catch (err) {
    filesBody.innerHTML = `<tr><td colspan="4">Error: ${err.message}</td></tr>`;
    log(`Load files failed: ${err.message}`);
  }
}

async function uploadFile() {
  const file = fileInput.files?.[0];
  if (!file) {
    log("Upload skipped: no file selected");
    return;
  }

  const body = new FormData();
  body.append("file", file, file.name);

  try {
    await apiFetch("/upload", { method: "POST", body });
    log(`Upload success: ${file.name}`);
    await loadFiles();
  } catch (err) {
    log(`Upload failed: ${err.message}`);
  }
}

function resetNewsForm() {
  editingNewsId = null;
  newsTitle.value = "";
  newsDate.value = "";
  newsLink.value = "";
  newsVisible.checked = true;
  newsBody.value = "";
  newsSaveBtn.textContent = "Save";
}

function resetEventForm() {
  editingEventId = null;
  eventTitle.value = "";
  eventDate.value = "";
  eventStart.value = "";
  eventEnd.value = "";
  eventLocation.value = "";
  eventLink.value = "";
  eventVisible.checked = true;
  eventDesc.value = "";
  eventSaveBtn.textContent = "Save";
}

function fillNewsForm(item) {
  editingNewsId = item.id;
  newsTitle.value = item.title || "";
  newsDate.value = item.date || "";
  newsLink.value = item.link || "";
  newsVisible.checked = item.visible !== false;
  newsBody.value = item.body || "";
  newsSaveBtn.textContent = "Update";
}

function fillEventForm(item) {
  editingEventId = item.id;
  eventTitle.value = item.title || "";
  eventDate.value = item.date || "";
  eventStart.value = item.time_start || "";
  eventEnd.value = item.time_end || "";
  eventLocation.value = item.location || "";
  eventLink.value = item.link || "";
  eventVisible.checked = item.visible !== false;
  eventDesc.value = item.description || "";
  eventSaveBtn.textContent = "Update";
}

function renderNews(items) {
  newsBodyTable.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    newsBodyTable.innerHTML = '<tr><td colspan="4">No news items.</td></tr>';
    return;
  }
  const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  for (const item of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.title || "-"}</td>
      <td>${item.date || "-"}</td>
      <td>${item.visible === false ? "No" : "Yes"}</td>
      <td>
        <button data-type="news" data-action="edit" data-id="${item.id}">Edit</button>
        <button class="delete" data-type="news" data-action="delete" data-id="${item.id}">Delete</button>
      </td>
    `;
    newsBodyTable.appendChild(tr);
  }
}

function renderEvents(items) {
  eventsBodyTable.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    eventsBodyTable.innerHTML = '<tr><td colspan="5">No events.</td></tr>';
    return;
  }
  const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  for (const item of sorted) {
    const time = [item.time_start, item.time_end].filter(Boolean).join(" - ") || "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.title || "-"}</td>
      <td>${item.date || "-"}</td>
      <td>${time}</td>
      <td>${item.visible === false ? "No" : "Yes"}</td>
      <td>
        <button data-type="event" data-action="edit" data-id="${item.id}">Edit</button>
        <button class="delete" data-type="event" data-action="delete" data-id="${item.id}">Delete</button>
      </td>
    `;
    eventsBodyTable.appendChild(tr);
  }
}

async function loadNews() {
  try {
    const payload = await apiJson("/content/news");
    renderNews(payload?.items || []);
    log(`Loaded news: ${payload?.items?.length || 0} items`);
  } catch (err) {
    newsBodyTable.innerHTML = `<tr><td colspan="4">Error: ${err.message}</td></tr>`;
    log(`Load news failed: ${err.message}`);
  }
}

async function loadEvents() {
  try {
    const payload = await apiJson("/content/events");
    renderEvents(payload?.items || []);
    log(`Loaded events: ${payload?.items?.length || 0} items`);
  } catch (err) {
    eventsBodyTable.innerHTML = `<tr><td colspan="5">Error: ${err.message}</td></tr>`;
    log(`Load events failed: ${err.message}`);
  }
}

async function saveNews() {
  const payload = {
    title: newsTitle.value.trim(),
    date: newsDate.value,
    link: newsLink.value.trim(),
    visible: newsVisible.checked,
    body: newsBody.value.trim(),
  };
  try {
    if (editingNewsId == null) {
      await apiJson("/content/news", { method: "POST", body: payload });
      log(`News created: ${payload.title || "(no title)"}`);
    } else {
      await apiJson(`/content/news/${editingNewsId}`, { method: "PUT", body: payload });
      log(`News updated: ${payload.title || "(no title)"}`);
    }
    resetNewsForm();
    await loadNews();
  } catch (err) {
    log(`Save news failed: ${err.message}`);
  }
}

async function saveEvent() {
  const payload = {
    title: eventTitle.value.trim(),
    date: eventDate.value,
    time_start: eventStart.value,
    time_end: eventEnd.value,
    location: eventLocation.value.trim(),
    link: eventLink.value.trim(),
    visible: eventVisible.checked,
    description: eventDesc.value.trim(),
  };
  try {
    if (editingEventId == null) {
      await apiJson("/content/events", { method: "POST", body: payload });
      log(`Event created: ${payload.title || "(no title)"}`);
    } else {
      await apiJson(`/content/events/${editingEventId}`, { method: "PUT", body: payload });
      log(`Event updated: ${payload.title || "(no title)"}`);
    }
    resetEventForm();
    await loadEvents();
  } catch (err) {
    log(`Save event failed: ${err.message}`);
  }
}

newsBodyTable.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const type = target.dataset.type;
  const action = target.dataset.action;
  const id = Number(target.dataset.id);
  if (!type || !action || Number.isNaN(id)) return;
  if (type === "news" && action === "edit") {
    try {
      const payload = await apiJson("/content/news");
      const item = payload?.items?.find((i) => i.id === id);
      if (item) fillNewsForm(item);
    } catch (err) {
      log(`Load news item failed: ${err.message}`);
    }
  }
  if (type === "news" && action === "delete") {
    if (!confirm("Delete this news item?")) return;
    try {
      await apiJson(`/content/news/${id}`, { method: "DELETE" });
      log("News deleted");
      await loadNews();
    } catch (err) {
      log(`Delete news failed: ${err.message}`);
    }
  }
});

eventsBodyTable.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const type = target.dataset.type;
  const action = target.dataset.action;
  const id = Number(target.dataset.id);
  if (!type || !action || Number.isNaN(id)) return;
  if (type === "event" && action === "edit") {
    try {
      const payload = await apiJson("/content/events");
      const item = payload?.items?.find((i) => i.id === id);
      if (item) fillEventForm(item);
    } catch (err) {
      log(`Load event item failed: ${err.message}`);
    }
  }
  if (type === "event" && action === "delete") {
    if (!confirm("Delete this event?")) return;
    try {
      await apiJson(`/content/events/${id}`, { method: "DELETE" });
      log("Event deleted");
      await loadEvents();
    } catch (err) {
      log(`Delete event failed: ${err.message}`);
    }
  }
});

signOutBtn.addEventListener("click", () => {
  setAuthState("", "");
  log("Signed out");
});
filesBody.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const action = target.dataset.action;
  const encoded = target.dataset.name;
  if (!action || !encoded) return;

  const filename = decodeURIComponent(encoded);

  if (action === "download") {
    try {
      const res = await apiFetch(`/download/${encodeURIComponent(filename)}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      log(`Download success: ${filename}`);
    } catch (err) {
      log(`Download failed: ${err.message}`);
    }
  }

  if (action === "delete") {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await apiFetch(`/delete/${encodeURIComponent(filename)}`, { method: "DELETE" });
      log(`Delete success: ${filename}`);
      await loadFiles();
    } catch (err) {
      log(`Delete failed: ${err.message}`);
    }
  }
});

saveUrlBtn.addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEY, getBackendUrl());
  log("Saved backend URL");
});

healthBtn.addEventListener("click", healthCheck);
refreshBtn.addEventListener("click", loadFiles);
uploadBtn.addEventListener("click", uploadFile);
newsSaveBtn.addEventListener("click", saveNews);
newsResetBtn.addEventListener("click", resetNewsForm);
eventSaveBtn.addEventListener("click", saveEvent);
eventResetBtn.addEventListener("click", resetEventForm);

backendUrlInput.value = localStorage.getItem(STORAGE_KEY) || "";
const existingToken = getAuthToken();
if (existingToken) {
  const payload = parseJwt(existingToken);
  setAuthState(existingToken, payload?.email || "");
} else {
  setAuthState("", "");
}
window.addEventListener("load", initGoogleAuth);
if (backendUrlInput.value) {
  healthCheck();
  loadFiles();
  loadNews();
  loadEvents();
}
