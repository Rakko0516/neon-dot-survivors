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
 * @param {{title?:string, body:string, buttons?:{label:string,value:any,cls?:string}[], cls?:string, dismiss?:boolean, onMount?:(el)=>void}} o
 */
export function modal(o) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const ov = document.createElement('div');
    ov.className = 'overlay';
    const btns = o.buttons ?? [{ label: 'OK', value: true, cls: 'teal' }];
    ov.innerHTML = `<div class="modal ${o.cls || ''}">
      ${o.title ? `<h2>${o.title}</h2>` : ''}
      <div class="mbody">${o.body || ''}</div>
      ${btns.length ? `<div class="mbtns">${btns.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${b.label}</button>`).join('')}</div>` : ''}
    </div>`;
    const close = (v) => {
      ov.remove();
      resolve(v);
    };
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b && b.closest('.mbtns')) {
        sfx('click');
        const def = btns[+b.dataset.i];
        if (def.keep) { def.onClick && def.onClick(ov); return; }
        close(def.value);
        return;
      }
      if (e.target === ov && o.dismiss !== false) close(undefined);
    });
    root.appendChild(ov);
    o.onMount && o.onMount(ov, close);
  });
}

export const confirmBox = (title, body, ok = 'OK', cls = 'red') =>
  modal({ title, body, buttons: [{ label: 'キャンセル', value: false }, { label: ok, value: true, cls }] });

export function closeAllModals() {
  document.getElementById('modal-root').innerHTML = '';
}
