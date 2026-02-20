// ===== Hirota Lab CMS Admin Console =====

// --- DOM References ---
const backendUrlInput = document.getElementById("backendUrl");
const saveUrlBtn = document.getElementById("saveUrlBtn");
const healthBtn = document.getElementById("healthBtn");
const refreshBtn = document.getElementById("refreshBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const filesBody = document.getElementById("filesBody");
const logBox = document.getElementById("logBox");

// News
const newsTitle = document.getElementById("newsTitle");
const newsDate = document.getElementById("newsDate");
const newsLink = document.getElementById("newsLink");
const newsVisible = document.getElementById("newsVisible");
const newsBody = document.getElementById("newsBody");
const newsSaveBtn = document.getElementById("newsSaveBtn");
const newsResetBtn = document.getElementById("newsResetBtn");
const newsBodyTable = document.getElementById("newsBodyTable");

// Events
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

// Members
const memberName = document.getElementById("memberName");
const memberNameEn = document.getElementById("memberNameEn");
const memberRole = document.getElementById("memberRole");
const memberTitleEl = document.getElementById("memberTitle");
const memberEmail = document.getElementById("memberEmail");
const memberPhotoUrl = document.getElementById("memberPhotoUrl");
const memberYearJoined = document.getElementById("memberYearJoined");
const memberOrder = document.getElementById("memberOrder");
const memberVisible = document.getElementById("memberVisible");
const memberInterest = document.getElementById("memberInterest");
const memberSaveBtn = document.getElementById("memberSaveBtn");
const memberResetBtn = document.getElementById("memberResetBtn");
const membersBodyTable = document.getElementById("membersBodyTable");

// Publications
const pubTitle = document.getElementById("pubTitle");
const pubAuthors = document.getElementById("pubAuthors");
const pubJournal = document.getElementById("pubJournal");
const pubYear = document.getElementById("pubYear");
const pubVolume = document.getElementById("pubVolume");
const pubPages = document.getElementById("pubPages");
const pubDoi = document.getElementById("pubDoi");
const pubCategory = document.getElementById("pubCategory");
const pubOrder = document.getElementById("pubOrder");
const pubVisible = document.getElementById("pubVisible");
const pubSaveBtn = document.getElementById("pubSaveBtn");
const pubResetBtn = document.getElementById("pubResetBtn");
const pubsBodyTable = document.getElementById("pubsBodyTable");

// Research
const researchTitleEl = document.getElementById("researchTitle");
const researchTitleEn = document.getElementById("researchTitleEn");
const researchImageUrl = document.getElementById("researchImageUrl");
const researchOrder = document.getElementById("researchOrder");
const researchVisible = document.getElementById("researchVisible");
const researchDesc = document.getElementById("researchDesc");
const researchSaveBtn = document.getElementById("researchSaveBtn");
const researchResetBtn = document.getElementById("researchResetBtn");
const researchBodyTable = document.getElementById("researchBodyTable");

// Auth
const googleSignIn = document.getElementById("googleSignIn");
const signOutBtn = document.getElementById("signOutBtn");
const authStatus = document.getElementById("authStatus");

// --- Constants ---
const STORAGE_KEY = "gcs_ui_backend_url";
const TOKEN_KEY = "gcs_admin_id_token";
const EMAIL_KEY = "gcs_admin_email";
let editingNewsId = null;
let editingEventId = null;
let editingMemberId = null;
let editingPubId = null;
let editingResearchId = null;

// --- Utility ---
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
    return JSON.parse(atob(base64));
  } catch { return null; }
}

function formatBytes(bytes) {
  if (bytes == null) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = Number(bytes);
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) { size /= 1024; idx++; }
  return `${size.toFixed(size < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
}

// --- API ---
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

// --- Google Auth ---
function initGoogleAuth() {
  const clientId = window.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) { authStatus.textContent = "Missing GOOGLE_OAUTH_CLIENT_ID"; signOutBtn.disabled = true; return; }
  if (!window.google?.accounts?.id) { authStatus.textContent = "Google Identity Services not loaded"; signOutBtn.disabled = true; return; }
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      const token = response?.credential || "";
      if (!token) { log("Google sign-in failed"); return; }
      const payload = parseJwt(token);
      setAuthState(token, payload?.email || "");
      log(`Signed in: ${payload?.email || "unknown"}`);
    },
  });
  window.google.accounts.id.renderButton(googleSignIn, { theme: "outline", size: "large" });
}

// --- Tab Navigation ---
function initTabs() {
  const tabNav = document.getElementById("tabNav");
  tabNav.addEventListener("click", (e) => {
    if (!e.target.classList.contains("tab-btn")) return;
    const tab = e.target.dataset.tab;
    tabNav.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => {
      p.classList.toggle("active", p.dataset.tab === tab);
    });
  });
}

// --- Health ---
async function healthCheck() {
  try {
    const res = await apiFetch("/");
    const text = await res.text();
    log(`Health OK: ${text}`);
  } catch (err) { log(`Health NG: ${err.message}`); }
}

// ===== FILES =====
async function loadFiles() {
  filesBody.innerHTML = "";
  try {
    const res = await apiFetch("/files");
    const files = await res.json();
    if (!Array.isArray(files) || files.length === 0) {
      filesBody.innerHTML = '<tr><td colspan="4">No files found.</td></tr>';
      log("Files: 0"); return;
    }
    for (const file of files) {
      const tr = document.createElement("tr");
      const name = file.name || "(unknown)";
      const id = file.id || "";
      const updated = file.updated ? new Date(file.updated).toLocaleString() : "-";
      tr.innerHTML = `
        <td>${name}</td>
        <td>${formatBytes(file.size)}</td>
        <td>${updated}</td>
        <td>
          ${file.webViewLink ? `<a href="${file.webViewLink}" target="_blank" rel="noopener">View</a> ` : ""}
          <button class="delete" data-action="delete-file" data-id="${id}" data-name="${name}">Delete</button>
        </td>`;
      filesBody.appendChild(tr);
    }
    log(`Files: ${files.length}`);
  } catch (err) {
    filesBody.innerHTML = `<tr><td colspan="4">Error: ${err.message}</td></tr>`;
    log(`Load files failed: ${err.message}`);
  }
}

async function uploadFile() {
  const file = fileInput.files?.[0];
  if (!file) { log("No file selected"); return; }
  const body = new FormData();
  body.append("file", file, file.name);
  try {
    await apiFetch("/upload", { method: "POST", body });
    log(`Uploaded: ${file.name}`);
    await loadFiles();
  } catch (err) { log(`Upload failed: ${err.message}`); }
}

filesBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.action === "delete-file") {
    const id = btn.dataset.id;
    const name = btn.dataset.name;
    if (!confirm(`Delete ${name}?`)) return;
    try {
      await apiFetch(`/delete/${id}`, { method: "DELETE" });
      log(`Deleted: ${name}`);
      await loadFiles();
    } catch (err) { log(`Delete failed: ${err.message}`); }
  }
});

// ===== NEWS =====
function resetNewsForm() {
  editingNewsId = null;
  newsTitle.value = ""; newsDate.value = ""; newsLink.value = "";
  newsVisible.checked = true; newsBody.value = "";
  newsSaveBtn.textContent = "Save";
}

function fillNewsForm(item) {
  editingNewsId = item.id;
  newsTitle.value = item.title || ""; newsDate.value = item.date || "";
  newsLink.value = item.link || ""; newsVisible.checked = item.visible !== false;
  newsBody.value = item.body || "";
  newsSaveBtn.textContent = "Update";
}

function renderNews(items) {
  newsBodyTable.innerHTML = "";
  if (!items?.length) { newsBodyTable.innerHTML = '<tr><td colspan="4">No news.</td></tr>'; return; }
  const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  for (const item of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${item.title || "-"}</td><td>${item.date || "-"}</td><td>${item.visible === false ? "No" : "Yes"}</td>
      <td><button data-type="news" data-action="edit" data-id="${item.id}">Edit</button>
      <button class="delete" data-type="news" data-action="delete" data-id="${item.id}">Delete</button></td>`;
    newsBodyTable.appendChild(tr);
  }
}

async function loadNews() {
  try {
    const p = await apiJson("/content/news");
    renderNews(p?.items || []);
    log(`News: ${p?.items?.length || 0}`);
  } catch (err) { newsBodyTable.innerHTML = `<tr><td colspan="4">Error: ${err.message}</td></tr>`; }
}

async function saveNews() {
  const payload = { title: newsTitle.value.trim(), date: newsDate.value, link: newsLink.value.trim(), visible: newsVisible.checked, body: newsBody.value.trim() };
  try {
    if (editingNewsId == null) { await apiJson("/content/news", { method: "POST", body: payload }); log(`News created`); }
    else { await apiJson(`/content/news/${editingNewsId}`, { method: "PUT", body: payload }); log(`News updated`); }
    resetNewsForm(); await loadNews();
  } catch (err) { log(`Save news failed: ${err.message}`); }
}

newsBodyTable.addEventListener("click", async (e) => {
  const btn = e.target.closest("button"); if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.type === "news" && btn.dataset.action === "edit") {
    try { const p = await apiJson("/content/news"); const item = p?.items?.find(i => i.id === id); if (item) fillNewsForm(item); } catch (err) { log(`Edit failed: ${err.message}`); }
  }
  if (btn.dataset.type === "news" && btn.dataset.action === "delete") {
    if (!confirm("Delete this news?")) return;
    try { await apiJson(`/content/news/${id}`, { method: "DELETE" }); log("News deleted"); await loadNews(); } catch (err) { log(`Delete failed: ${err.message}`); }
  }
});

// ===== EVENTS =====
function resetEventForm() {
  editingEventId = null;
  eventTitle.value = ""; eventDate.value = ""; eventStart.value = "";
  eventEnd.value = ""; eventLocation.value = ""; eventLink.value = "";
  eventVisible.checked = true; eventDesc.value = "";
  eventSaveBtn.textContent = "Save";
}

function fillEventForm(item) {
  editingEventId = item.id;
  eventTitle.value = item.title || ""; eventDate.value = item.date || "";
  eventStart.value = item.time_start || ""; eventEnd.value = item.time_end || "";
  eventLocation.value = item.location || ""; eventLink.value = item.link || "";
  eventVisible.checked = item.visible !== false; eventDesc.value = item.description || "";
  eventSaveBtn.textContent = "Update";
}

function renderEvents(items) {
  eventsBodyTable.innerHTML = "";
  if (!items?.length) { eventsBodyTable.innerHTML = '<tr><td colspan="5">No events.</td></tr>'; return; }
  const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  for (const item of sorted) {
    const time = [item.time_start, item.time_end].filter(Boolean).join(" - ") || "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${item.title || "-"}</td><td>${item.date || "-"}</td><td>${time}</td><td>${item.visible === false ? "No" : "Yes"}</td>
      <td><button data-type="event" data-action="edit" data-id="${item.id}">Edit</button>
      <button class="delete" data-type="event" data-action="delete" data-id="${item.id}">Delete</button></td>`;
    eventsBodyTable.appendChild(tr);
  }
}

async function loadEvents() {
  try {
    const p = await apiJson("/content/events");
    renderEvents(p?.items || []);
    log(`Events: ${p?.items?.length || 0}`);
  } catch (err) { eventsBodyTable.innerHTML = `<tr><td colspan="5">Error: ${err.message}</td></tr>`; }
}

async function saveEvent() {
  const payload = { title: eventTitle.value.trim(), date: eventDate.value, time_start: eventStart.value, time_end: eventEnd.value, location: eventLocation.value.trim(), link: eventLink.value.trim(), visible: eventVisible.checked, description: eventDesc.value.trim() };
  try {
    if (editingEventId == null) { await apiJson("/content/events", { method: "POST", body: payload }); log(`Event created`); }
    else { await apiJson(`/content/events/${editingEventId}`, { method: "PUT", body: payload }); log(`Event updated`); }
    resetEventForm(); await loadEvents();
  } catch (err) { log(`Save event failed: ${err.message}`); }
}

eventsBodyTable.addEventListener("click", async (e) => {
  const btn = e.target.closest("button"); if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.type === "event" && btn.dataset.action === "edit") {
    try { const p = await apiJson("/content/events"); const item = p?.items?.find(i => i.id === id); if (item) fillEventForm(item); } catch (err) { log(`Edit failed: ${err.message}`); }
  }
  if (btn.dataset.type === "event" && btn.dataset.action === "delete") {
    if (!confirm("Delete this event?")) return;
    try { await apiJson(`/content/events/${id}`, { method: "DELETE" }); log("Event deleted"); await loadEvents(); } catch (err) { log(`Delete failed: ${err.message}`); }
  }
});

// ===== MEMBERS =====
function resetMemberForm() {
  editingMemberId = null;
  memberName.value = ""; memberNameEn.value = ""; memberRole.value = "master";
  memberTitleEl.value = ""; memberEmail.value = ""; memberPhotoUrl.value = "";
  memberYearJoined.value = ""; memberOrder.value = "99";
  memberVisible.checked = true; memberInterest.value = "";
  memberSaveBtn.textContent = "Save";
}

function fillMemberForm(item) {
  editingMemberId = item.id;
  memberName.value = item.name || ""; memberNameEn.value = item.name_en || "";
  memberRole.value = item.role || "master"; memberTitleEl.value = item.title || "";
  memberEmail.value = item.email || ""; memberPhotoUrl.value = item.photo_url || "";
  memberYearJoined.value = item.year_joined || ""; memberOrder.value = item.order ?? 99;
  memberVisible.checked = item.visible !== false; memberInterest.value = item.research_interest || "";
  memberSaveBtn.textContent = "Update";
}

function renderMembers(items) {
  membersBodyTable.innerHTML = "";
  if (!items?.length) { membersBodyTable.innerHTML = '<tr><td colspan="5">No members.</td></tr>'; return; }
  const sorted = [...items].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  for (const item of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${item.name || "-"}</td><td>${item.role || "-"}</td><td>${item.order ?? "-"}</td><td>${item.visible === false ? "No" : "Yes"}</td>
      <td><button data-type="member" data-action="edit" data-id="${item.id}">Edit</button>
      <button class="delete" data-type="member" data-action="delete" data-id="${item.id}">Delete</button></td>`;
    membersBodyTable.appendChild(tr);
  }
}

async function loadMembers() {
  try {
    const p = await apiJson("/content/members");
    renderMembers(p?.items || []);
    log(`Members: ${p?.items?.length || 0}`);
  } catch (err) { membersBodyTable.innerHTML = `<tr><td colspan="5">Error: ${err.message}</td></tr>`; }
}

async function saveMember() {
  const payload = {
    name: memberName.value.trim(), name_en: memberNameEn.value.trim(),
    role: memberRole.value, title: memberTitleEl.value.trim(),
    email: memberEmail.value.trim(), photo_url: memberPhotoUrl.value.trim(),
    research_interest: memberInterest.value.trim(),
    year_joined: memberYearJoined.value.trim(),
    order: parseInt(memberOrder.value) || 99, visible: memberVisible.checked
  };
  try {
    if (editingMemberId == null) { await apiJson("/content/members", { method: "POST", body: payload }); log(`Member created`); }
    else { await apiJson(`/content/members/${editingMemberId}`, { method: "PUT", body: payload }); log(`Member updated`); }
    resetMemberForm(); await loadMembers();
  } catch (err) { log(`Save member failed: ${err.message}`); }
}

membersBodyTable.addEventListener("click", async (e) => {
  const btn = e.target.closest("button"); if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.type === "member" && btn.dataset.action === "edit") {
    try { const p = await apiJson("/content/members"); const item = p?.items?.find(i => i.id === id); if (item) fillMemberForm(item); } catch (err) { log(`Edit failed: ${err.message}`); }
  }
  if (btn.dataset.type === "member" && btn.dataset.action === "delete") {
    if (!confirm("Delete this member?")) return;
    try { await apiJson(`/content/members/${id}`, { method: "DELETE" }); log("Member deleted"); await loadMembers(); } catch (err) { log(`Delete failed: ${err.message}`); }
  }
});

// ===== PUBLICATIONS =====
function resetPubForm() {
  editingPubId = null;
  pubTitle.value = ""; pubAuthors.value = ""; pubJournal.value = "";
  pubYear.value = ""; pubVolume.value = ""; pubPages.value = "";
  pubDoi.value = ""; pubCategory.value = "paper"; pubOrder.value = "99";
  pubVisible.checked = true;
  pubSaveBtn.textContent = "Save";
}

function fillPubForm(item) {
  editingPubId = item.id;
  pubTitle.value = item.title || ""; pubAuthors.value = item.authors || "";
  pubJournal.value = item.journal || ""; pubYear.value = item.year || "";
  pubVolume.value = item.volume || ""; pubPages.value = item.pages || "";
  pubDoi.value = item.doi || ""; pubCategory.value = item.category || "paper";
  pubOrder.value = item.order ?? 99; pubVisible.checked = item.visible !== false;
  pubSaveBtn.textContent = "Update";
}

function renderPubs(items) {
  pubsBodyTable.innerHTML = "";
  if (!items?.length) { pubsBodyTable.innerHTML = '<tr><td colspan="6">No publications.</td></tr>'; return; }
  const sorted = [...items].sort((a, b) => (b.year || "").localeCompare(a.year || ""));
  for (const item of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${item.title || "-"}</td><td>${item.authors || "-"}</td><td>${item.year || "-"}</td><td>${item.category || "-"}</td><td>${item.visible === false ? "No" : "Yes"}</td>
      <td><button data-type="pub" data-action="edit" data-id="${item.id}">Edit</button>
      <button class="delete" data-type="pub" data-action="delete" data-id="${item.id}">Delete</button></td>`;
    pubsBodyTable.appendChild(tr);
  }
}

async function loadPubs() {
  try {
    const p = await apiJson("/content/publications");
    renderPubs(p?.items || []);
    log(`Publications: ${p?.items?.length || 0}`);
  } catch (err) { pubsBodyTable.innerHTML = `<tr><td colspan="6">Error: ${err.message}</td></tr>`; }
}

async function savePub() {
  const payload = {
    title: pubTitle.value.trim(), authors: pubAuthors.value.trim(),
    journal: pubJournal.value.trim(), year: pubYear.value.trim(),
    volume: pubVolume.value.trim(), pages: pubPages.value.trim(),
    doi: pubDoi.value.trim(), category: pubCategory.value,
    order: parseInt(pubOrder.value) || 99, visible: pubVisible.checked
  };
  try {
    if (editingPubId == null) { await apiJson("/content/publications", { method: "POST", body: payload }); log(`Publication created`); }
    else { await apiJson(`/content/publications/${editingPubId}`, { method: "PUT", body: payload }); log(`Publication updated`); }
    resetPubForm(); await loadPubs();
  } catch (err) { log(`Save publication failed: ${err.message}`); }
}

pubsBodyTable.addEventListener("click", async (e) => {
  const btn = e.target.closest("button"); if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.type === "pub" && btn.dataset.action === "edit") {
    try { const p = await apiJson("/content/publications"); const item = p?.items?.find(i => i.id === id); if (item) fillPubForm(item); } catch (err) { log(`Edit failed: ${err.message}`); }
  }
  if (btn.dataset.type === "pub" && btn.dataset.action === "delete") {
    if (!confirm("Delete this publication?")) return;
    try { await apiJson(`/content/publications/${id}`, { method: "DELETE" }); log("Publication deleted"); await loadPubs(); } catch (err) { log(`Delete failed: ${err.message}`); }
  }
});

// ===== RESEARCH =====
function resetResearchForm() {
  editingResearchId = null;
  researchTitleEl.value = ""; researchTitleEn.value = "";
  researchImageUrl.value = ""; researchOrder.value = "99";
  researchVisible.checked = true; researchDesc.value = "";
  researchSaveBtn.textContent = "Save";
}

function fillResearchForm(item) {
  editingResearchId = item.id;
  researchTitleEl.value = item.title || ""; researchTitleEn.value = item.title_en || "";
  researchImageUrl.value = item.image_url || ""; researchOrder.value = item.order ?? 99;
  researchVisible.checked = item.visible !== false; researchDesc.value = item.description || "";
  researchSaveBtn.textContent = "Update";
}

function renderResearch(items) {
  researchBodyTable.innerHTML = "";
  if (!items?.length) { researchBodyTable.innerHTML = '<tr><td colspan="4">No research topics.</td></tr>'; return; }
  const sorted = [...items].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  for (const item of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${item.title || "-"}</td><td>${item.order ?? "-"}</td><td>${item.visible === false ? "No" : "Yes"}</td>
      <td><button data-type="research" data-action="edit" data-id="${item.id}">Edit</button>
      <button class="delete" data-type="research" data-action="delete" data-id="${item.id}">Delete</button></td>`;
    researchBodyTable.appendChild(tr);
  }
}

async function loadResearch() {
  try {
    const p = await apiJson("/content/research");
    renderResearch(p?.items || []);
    log(`Research: ${p?.items?.length || 0}`);
  } catch (err) { researchBodyTable.innerHTML = `<tr><td colspan="4">Error: ${err.message}</td></tr>`; }
}

async function saveResearch() {
  const payload = {
    title: researchTitleEl.value.trim(), title_en: researchTitleEn.value.trim(),
    description: researchDesc.value.trim(), image_url: researchImageUrl.value.trim(),
    order: parseInt(researchOrder.value) || 99, visible: researchVisible.checked
  };
  try {
    if (editingResearchId == null) { await apiJson("/content/research", { method: "POST", body: payload }); log(`Research topic created`); }
    else { await apiJson(`/content/research/${editingResearchId}`, { method: "PUT", body: payload }); log(`Research topic updated`); }
    resetResearchForm(); await loadResearch();
  } catch (err) { log(`Save research failed: ${err.message}`); }
}

researchBodyTable.addEventListener("click", async (e) => {
  const btn = e.target.closest("button"); if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.type === "research" && btn.dataset.action === "edit") {
    try { const p = await apiJson("/content/research"); const item = p?.items?.find(i => i.id === id); if (item) fillResearchForm(item); } catch (err) { log(`Edit failed: ${err.message}`); }
  }
  if (btn.dataset.type === "research" && btn.dataset.action === "delete") {
    if (!confirm("Delete this research topic?")) return;
    try { await apiJson(`/content/research/${id}`, { method: "DELETE" }); log("Research topic deleted"); await loadResearch(); } catch (err) { log(`Delete failed: ${err.message}`); }
  }
});

// ===== EVENT LISTENERS =====
signOutBtn.addEventListener("click", () => { setAuthState("", ""); log("Signed out"); });
saveUrlBtn.addEventListener("click", () => { localStorage.setItem(STORAGE_KEY, getBackendUrl()); log("Saved backend URL"); });
healthBtn.addEventListener("click", healthCheck);
refreshBtn.addEventListener("click", loadFiles);
uploadBtn.addEventListener("click", uploadFile);

newsSaveBtn.addEventListener("click", saveNews);
newsResetBtn.addEventListener("click", resetNewsForm);
eventSaveBtn.addEventListener("click", saveEvent);
eventResetBtn.addEventListener("click", resetEventForm);
memberSaveBtn.addEventListener("click", saveMember);
memberResetBtn.addEventListener("click", resetMemberForm);
pubSaveBtn.addEventListener("click", savePub);
pubResetBtn.addEventListener("click", resetPubForm);
researchSaveBtn.addEventListener("click", saveResearch);
researchResetBtn.addEventListener("click", resetResearchForm);

// ===== INIT =====
backendUrlInput.value = localStorage.getItem(STORAGE_KEY) || window.PUBLIC_API_BASE || "";
const existingToken = getAuthToken();
if (existingToken) {
  const payload = parseJwt(existingToken);
  setAuthState(existingToken, payload?.email || "");
} else {
  setAuthState("", "");
}

initTabs();
window.addEventListener("load", initGoogleAuth);

if (backendUrlInput.value) {
  healthCheck();
  loadFiles();
  loadNews();
  loadEvents();
  loadMembers();
  loadPubs();
  loadResearch();
}
