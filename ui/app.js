const backendUrlInput = document.getElementById("backendUrl");
const saveUrlBtn = document.getElementById("saveUrlBtn");
const healthBtn = document.getElementById("healthBtn");
const refreshBtn = document.getElementById("refreshBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const filesBody = document.getElementById("filesBody");
const logBox = document.getElementById("logBox");

const STORAGE_KEY = "gcs_ui_backend_url";

function log(message) {
  const now = new Date().toISOString();
  logBox.textContent = `[${now}] ${message}\n` + logBox.textContent;
}

function getBackendUrl() {
  return (backendUrlInput.value || "").trim().replace(/\/$/, "");
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
  const res = await fetch(`${base}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res;
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

backendUrlInput.value = localStorage.getItem(STORAGE_KEY) || "";
if (backendUrlInput.value) {
  healthCheck();
  loadFiles();
}
