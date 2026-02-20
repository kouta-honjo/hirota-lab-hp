/* ===== 廣田研究室 HP - Common JavaScript ===== */

// API base URL - set via Vercel env or fallback
const API_BASE = window.PUBLIC_API_BASE || '';

// --- API Communication ---
async function apiGet(path) {
  const url = API_BASE ? `${API_BASE}${path}` : `/api/proxy?base=&path=${encodeURIComponent(path)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --- Shared Header Injection ---
function injectHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;

  const currentPage = location.pathname.split('/').pop() || 'index.html';

  const navItems = [
    { href: 'index.html', label: 'Top' },
    { href: 'about.html', label: 'About' },
    { href: 'research.html', label: 'Research' },
    { href: 'publications.html', label: 'Publication' },
    { href: 'members.html', label: 'Member' },
    { href: 'contact.html', label: 'Contact' },
  ];

  const navHTML = navItems
    .map(item => {
      const active = currentPage === item.href ? ' class="active"' : '';
      return `<li><a href="${item.href}"${active}>${item.label}</a></li>`;
    })
    .join('');

  header.innerHTML = `
    <header class="site-header">
      <div class="header-top">
        <div class="header-university">
          <a href="https://www.hiroshima-u.ac.jp/" target="_blank" rel="noopener">広島大学</a> &gt;
          <a href="https://www.hiroshima-u.ac.jp/ilcs" target="_blank" rel="noopener">大学院 統合生命科学研究科</a>
        </div>
        <div class="header-lab-name">廣田研究室</div>
        <div class="header-lab-name-en">Hirota Laboratory - Microbial Phosphorus Metabolism</div>
      </div>
      <nav class="site-nav">
        <button class="nav-toggle" aria-label="メニュー" onclick="toggleNav()">&#9776;</button>
        <ul id="nav-menu">${navHTML}</ul>
      </nav>
    </header>
  `;
}

// --- Shared Footer Injection ---
function injectFooter() {
  const footer = document.getElementById('site-footer');
  if (!footer) return;

  footer.innerHTML = `
    <footer class="site-footer">
      <div class="footer-inner">
        <h3>廣田研究室 / Hirota Laboratory</h3>
        <div class="footer-info">
          <p>広島大学大学院 統合生命科学研究科</p>
          <p>Graduate School of Integrated Sciences for Life, Hiroshima University</p>
          <p>〒739-8528 広島県東広島市鏡山1-3-1</p>
          <p>1-3-1 Kagamiyama, Higashi-Hiroshima, Hiroshima 739-8528, Japan</p>
        </div>
        <div class="footer-copy">
          &copy; ${new Date().getFullYear()} Hirota Laboratory, Hiroshima University. All rights reserved.
        </div>
      </div>
    </footer>
  `;
}

// --- Mobile Nav Toggle ---
function toggleNav() {
  const menu = document.getElementById('nav-menu');
  if (menu) menu.classList.toggle('open');
}

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
  injectHeader();
  injectFooter();
});
