/* ===== News Dynamic Loading ===== */

(function () {
  const MAX_ITEMS = 10;

  async function loadNews() {
    const container = document.getElementById('news-list');
    if (!container) return;

    try {
      const data = await apiGet('/public/news');
      const items = (data.items || []).slice(0, MAX_ITEMS);

      if (items.length === 0) {
        container.innerHTML = '<li class="news-empty">現在お知らせはありません。</li>';
        return;
      }

      container.innerHTML = items.map(item => {
        const date = item.date || '';
        const title = item.title || '';
        const body = item.body || '';
        const link = item.link || '';

        const titleHTML = link
          ? `<a href="${escapeHTML(link)}" target="_blank" rel="noopener">${escapeHTML(title)}</a>`
          : escapeHTML(title);

        return `
          <li class="news-item">
            <span class="news-date">${escapeHTML(date)}</span>
            <div>
              <div class="news-title">${titleHTML}</div>
              ${body ? `<div class="news-body">${escapeHTML(body)}</div>` : ''}
            </div>
          </li>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = '<li class="news-empty">お知らせの読み込みに失敗しました。</li>';
      console.error('Failed to load news:', err);
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', loadNews);
})();
