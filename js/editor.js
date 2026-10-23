import { GITHUB_REPO, GITHUB_BRANCH } from './config.js';
    import { APP_VERSION } from './version.js';
    const $ = (s) => document.querySelector(s);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let entries = [];

    $('#f-date').value = new Date().toLocaleDateString('sv-SE');
    $('#f-version').placeholder = `例: ${APP_VERSION}（現在のアプリ版）`;

    if (GITHUB_REPO) {
      $('#gh').href = `https://github.com/${GITHUB_REPO}/edit/${GITHUB_BRANCH}/changelog.json`;
    } else {
      $('#gh').removeAttribute('href');
      $('#gh').style.opacity = .4;
      $('#gh-note').textContent = 'js/config.js の GITHUB_REPO を設定するとボタンが使えます。';
    }

    function render() {
      $('#list').innerHTML = entries.length ? entries.map((e, i) => `
        <div class="entry-row">
          <div class="log-entry">
            <div><span class="ver">${e.version ? 'v' + esc(e.version) : 'お知らせ'}</span><span class="date">${esc(e.date)}</span>${e.notify ? ' <span class="muted">🔔</span>' : ''}</div>
            <div class="ttl">${esc(e.title)}</div>
            <ul>${(e.items || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          </div>
          <button class="btn small danger" data-del="${i}">削除</button>
        </div>`).join('') : '<p class="muted">まだありません</p>';
      $('#out').value = JSON.stringify({ entries }, null, 2) + '\n';
    }

    $('#list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (b && confirm('この項目を削除しますか？')) { entries.splice(+b.dataset.del, 1); render(); }
    });

    $('#add').addEventListener('click', () => {
      const title = $('#f-title').value.trim();
      const items = $('#f-items').value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!title && !items.length) { alert('タイトルか内容を入力してください'); return; }
      const version = $('#f-version').value.trim();
      const date = $('#f-date').value;
      entries.unshift({ id: `${date}-${version || 'news'}-${Date.now().toString(36)}`, version, date, title, items, notify: $('#f-notify').checked });
      $('#f-title').value = ''; $('#f-items').value = '';
      render();
      $('#out').scrollIntoView({ behavior: 'smooth' });
    });

    $('#copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('#out').value); } catch { $('#out').select(); document.execCommand('copy'); }
      $('#copy').textContent = 'コピーしました';
      setTimeout(() => ($('#copy').textContent = 'JSONをコピー'), 1500);
    });

    fetch('./changelog.json?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { entries = j.entries || []; render(); })
      .catch(() => { entries = []; render(); });
