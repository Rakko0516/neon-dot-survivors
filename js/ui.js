// 汎用UI部品（モーダル・トースト）
import { sfx } from './audio.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg) {
  const root = document.getElementById('toast');
  const d = document.createElement('div');
  d.textContent = msg;
  root.appendChild(d);
  setTimeout(() => d.remove(), 2700);
}

/**
 * モーダルを表示し、押されたボタンの value を返す
 * @param {{title?:string, body:string, buttons?:{label:string,value:any,cls?:string}[], cls?:string, dismiss?:boolean, onMount?:(el)=>void, sound?:'panel'|'panel2'|false}} o
 *   sound：表示したときの音。大きなお知らせ系は 'panel'、ふつうの画面は 'panel2'（省略時）
 */
let lastClose = 0;
export function modal(o) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const ov = document.createElement('div');
    // 閉じてすぐ開き直す（タブ切替・受け取り後の更新など）ときは登場アニメを省く
    ov.className = 'overlay' + (performance.now() - lastClose < 260 ? ' still' : '');
    const btns = o.buttons ?? [{ label: 'OK', value: true, cls: 'teal' }];
    ov.innerHTML = `<div class="modal ${o.cls || ''}">
      ${o.title ? `<h2>${o.title}</h2>` : ''}
      <div class="mbody">${o.body || ''}</div>
      ${btns.length ? `<div class="mbtns">${btns.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${b.label}</button>`).join('')}</div>` : ''}
    </div>`;
    let closed = false;
    const close = (v) => {
      if (closed) return;
      closed = true;
      lastClose = performance.now();
      resolve(v);
      // 閉じるアニメーション（次のモーダルの表示を待たせないよう、結果は先に返す）
      ov.classList.add('closing');
      ov.style.pointerEvents = 'none';
      setTimeout(() => ov.remove(), 170);
    };
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b && b.closest('.mbtns')) {
        const def = btns[+b.dataset.i];
        if (def.keep) { def.onClick && def.onClick(ov); return; }
        close(def.value);
        return;
      }
      if (e.target === ov && o.dismiss !== false) close(undefined);
    });
    root.appendChild(ov);
    // 表示音（同じ画面を開き直しただけのときは鳴らさない）
    if (o.sound !== false && !ov.classList.contains('still')) sfx(o.sound || 'panel2');
    // 一覧の段差表示用に順番を振る
    ov.querySelectorAll('.reveal').forEach((g) => [...g.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 20))));
    if (ov.classList.contains('still')) ov.querySelectorAll('.reveal').forEach((g) => g.classList.remove('reveal'));
    o.onMount && o.onMount(ov, close);
  });
}

export const confirmBox = (title, body, ok = 'OK', cls = 'red') =>
  modal({ title, body, buttons: [{ label: 'キャンセル', value: false }, { label: ok, value: true, cls }] });

export function closeAllModals() {
  document.getElementById('modal-root').innerHTML = '';
}
