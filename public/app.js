const newsList = document.getElementById("newsList");
const eventList = document.getElementById("eventList");

function getApiBase() {
  return (window.PUBLIC_API_BASE || "").trim().replace(/\/$/, "");
}

async function fetchPublic(path) {
  const base = getApiBase();
  if (!base) throw new Error("PUBLIC_API_BASE is not set");
  const proxy = new URL("/api/proxy", window.location.origin);
  proxy.searchParams.set("base", base);
  proxy.searchParams.set("path", path);
  const res = await fetch(proxy.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function renderNews(items) {
  newsList.innerHTML = "";
  if (!items.length) {
    newsList.innerHTML = "<li>お知らせはありません。</li>";
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    const title = item.title || "";
    const date = item.date || "";
    const body = item.body || "";
    const link = item.link || "";
    li.innerHTML = `
      <strong>${date}</strong> ${title}<br/>
      <span>${body}</span>
      ${link ? `<br/><a href="${link}" target="_blank" rel="noopener">詳細</a>` : ""}
    `;
    newsList.appendChild(li);
  }
}

function renderEvents(items) {
  eventList.innerHTML = "";
  if (!items.length) {
    eventList.innerHTML = "<li>行事予定はありません。</li>";
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    const title = item.title || "";
    const date = item.date || "";
    const time = [item.time_start, item.time_end].filter(Boolean).join(" - ");
    const location = item.location || "";
    const desc = item.description || "";
    const link = item.link || "";
    li.innerHTML = `
      <strong>${date} ${time ? `(${time})` : ""}</strong> ${title}<br/>
      <span>${location}</span><br/>
      <span>${desc}</span>
      ${link ? `<br/><a href="${link}" target="_blank" rel="noopener">詳細</a>` : ""}
    `;
    eventList.appendChild(li);
  }
}

async function loadPublic() {
  try {
    const news = await fetchPublic("/public/news");
    renderNews(news.items || []);
  } catch (err) {
    newsList.innerHTML = `<li>ニュース取得に失敗しました: ${err.message}</li>`;
  }

  try {
    const events = await fetchPublic("/public/events");
    renderEvents(events.items || []);
  } catch (err) {
    eventList.innerHTML = `<li>行事予定取得に失敗しました: ${err.message}</li>`;
  }
}

loadPublic();
