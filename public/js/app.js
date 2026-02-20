/* ===== 環境微生物工学研究室 HP - Common JavaScript ===== */

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
    { href: 'index.html', label: 'Home' },
    { href: 'research.html', label: 'Research' },
    { href: 'members.html', label: 'Members' },
    { href: 'publications.html', label: 'Publications' },
    { href: 'about.html', label: 'About' },
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
      <div class="header-inner">
        <a href="index.html" class="header-logo" style="text-decoration:none;">
          <span class="header-logo-sub">広島大学大学院 統合生命科学研究科 生物工学プログラム</span>
          <span class="header-logo-main">環境微生物工学研究室</span>
        </a>
        <button class="nav-toggle" aria-label="メニュー" onclick="toggleNav()">&#9776;</button>
        <nav>
          <ul class="header-nav" id="nav-menu">${navHTML}</ul>
        </nav>
      </div>
    </header>
  `;
}

// --- Shared Footer Injection ---
function injectFooter() {
  const footer = document.getElementById('site-footer');
  if (!footer) return;

  const navItems = [
    { href: 'index.html', label: 'Home' },
    { href: 'research.html', label: 'Research' },
    { href: 'members.html', label: 'Members' },
    { href: 'publications.html', label: 'Publications' },
    { href: 'contact.html', label: 'Contact' },
  ];

  const navHTML = navItems
    .map(item => `<li><a href="${item.href}">${item.label}</a></li>`)
    .join('');

  footer.innerHTML = `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-info">
          <strong>環境微生物工学研究室</strong><br>
          広島大学大学院 統合生命科学研究科 生物工学プログラム<br>
          〒739-8528 広島県東広島市鏡山1-3-1
        </div>
        <nav>
          <ul class="footer-nav">${navHTML}</ul>
        </nav>
        <div class="footer-copy">&copy; ${new Date().getFullYear()} Environmental Microbiology Laboratory, Hiroshima University. All Rights Reserved.</div>
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
