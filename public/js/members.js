/* ===== Members Dynamic Loading ===== */

(function () {
  const ROLE_ORDER = {
    'professor': { label: 'Faculty', order: 0 },
    'associate_professor': { label: 'Faculty', order: 0 },
    'assistant_professor': { label: 'Faculty', order: 0 },
    'postdoc': { label: 'Faculty', order: 0 },
    'doctor': { label: 'Students', order: 1 },
    'master': { label: 'Students', order: 1 },
    'bachelor': { label: 'Students', order: 1 },
    'research_student': { label: 'Students', order: 1 },
    'alumni': { label: 'Alumni', order: 2 },
  };

  const ROLE_LABELS = {
    'professor': '教授',
    'associate_professor': '准教授',
    'assistant_professor': '助教',
    'postdoc': 'ポスドク',
    'doctor': '博士課程',
    'master': '修士課程',
    'bachelor': '学部生',
    'research_student': '研究生',
    'alumni': '卒業生',
  };

  const GROUP_LABELS = ['Faculty / 教員', 'Students / 学生', 'Alumni / 卒業生'];

  async function loadMembers() {
    const content = document.getElementById('members-content');
    if (!content) return;

    try {
      const data = await apiGet('/public/members');
      const items = data.items || [];

      if (items.length === 0) {
        content.innerHTML = '<p class="news-empty">メンバー情報はありません。</p>';
        return;
      }

      // Group members
      const groups = [[], [], []]; // Faculty, Students, Alumni
      items.forEach(member => {
        const role = member.role || 'bachelor';
        const info = ROLE_ORDER[role] || { order: 1 };
        groups[info.order].push(member);
      });

      // Sort within each group by order field
      groups.forEach(group => {
        group.sort((a, b) => (a.order || 99) - (b.order || 99));
      });

      content.innerHTML = groups.map((group, idx) => {
        if (group.length === 0) return '';
        return `
          <div class="members-group">
            <h3>${GROUP_LABELS[idx]}</h3>
            <ul class="members-simple-list">
              ${group.map(member => renderMemberListItem(member)).join('')}
            </ul>
          </div>
        `;
      }).join('');
    } catch (err) {
      content.innerHTML = '<p class="news-empty">メンバー情報の読み込みに失敗しました。</p>';
      console.error('Failed to load members:', err);
    }
  }

  function renderMemberListItem(member) {
    const name = member.name || '';
    const nameEn = member.name_en || '';
    const role = member.role || '';
    const roleLabel = ROLE_LABELS[role] || role;
    const researchmap = member.researchmap_url || '';

    return `
      <li class="members-list-item">
        <span class="member-list-role">${escapeHTML(roleLabel)}</span>
        <span class="member-list-name">${escapeHTML(name)}</span>
        ${nameEn ? `<span class="member-list-name-en">${escapeHTML(nameEn)}</span>` : ''}
        ${researchmap ? `<a class="member-list-researchmap" href="${escapeHTML(researchmap)}" target="_blank" rel="noopener">researchmap</a>` : ''}
      </li>
    `;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', loadMembers);
})();
