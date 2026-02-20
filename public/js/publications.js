/* ===== Publications Dynamic Loading ===== */

(function () {
  let allItems = [];
  let currentCategory = 'paper';

  async function loadPublications() {
    const content = document.getElementById('pub-content');
    if (!content) return;

    try {
      const data = await apiGet('/public/publications');
      allItems = data.items || [];
      renderPublications();
    } catch (err) {
      content.innerHTML = '<p class="news-empty">業績データの読み込みに失敗しました。</p>';
      console.error('Failed to load publications:', err);
    }
  }

  function renderPublications() {
    const content = document.getElementById('pub-content');
    if (!content) return;

    const filtered = allItems.filter(item => (item.category || 'paper') === currentCategory);

    if (filtered.length === 0) {
      content.innerHTML = '<p class="news-empty">該当する業績はありません。</p>';
      return;
    }

    // Group by year
    const byYear = {};
    filtered.forEach(item => {
      const year = item.year || 'Unknown';
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(item);
    });

    const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

    content.innerHTML = years.map(year => {
      const items = byYear[year];
      return `
        <div class="pub-year-group">
          <div class="pub-year">${escapeHTML(String(year))}</div>
          <ul class="pub-list">
            ${items.map(item => renderPubItem(item)).join('')}
          </ul>
        </div>
      `;
    }).join('');
  }

  function renderPubItem(item) {
    const authors = item.authors || '';
    const title = item.title || '';
    const journal = item.journal || '';
    const volume = item.volume || '';
    const pages = item.pages || '';
    const doi = item.doi || '';

    let journalInfo = escapeHTML(journal);
    if (volume) journalInfo += `, ${escapeHTML(volume)}`;
    if (pages) journalInfo += `, ${escapeHTML(pages)}`;

    return `
      <li class="pub-item">
        <span class="authors">${escapeHTML(authors)}</span>
        <span class="title">"${escapeHTML(title)}"</span>
        ${journal ? `<span class="journal">${journalInfo}</span>` : ''}
        ${doi ? `<span class="doi"> [<a href="https://doi.org/${escapeHTML(doi)}" target="_blank" rel="noopener">DOI</a>]</span>` : ''}
      </li>
    `;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Tab switching
  document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.getElementById('pub-tabs');
    if (tabs) {
      tabs.addEventListener('click', (e) => {
        if (e.target.classList.contains('pub-tab')) {
          tabs.querySelectorAll('.pub-tab').forEach(t => t.classList.remove('active'));
          e.target.classList.add('active');
          currentCategory = e.target.dataset.category || 'paper';
          renderPublications();
        }
      });
    }
    loadPublications();
  });
})();
