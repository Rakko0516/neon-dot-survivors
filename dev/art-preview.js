import * as A from '../js/art.js';
import { CHARACTERS, BIOMES, SKILLS, EQUIP } from '../js/data.js';
const o=document.getElementById('o');
const add=(cv,s=4,bg)=>{const i=document.createElement('img');i.src=A.toURL(cv,s);if(bg)i.style.background=bg;o.appendChild(i)};
const h=(t)=>{const e=document.createElement('h3');e.textContent=t;o.appendChild(e)};
h('chars');
for(const c of Object.values(CHARACTERS)) for(const f of ['idle','walk1','walk2']) add(A.charSprite(c,f),5,c.bg);
h('enemies');
for(const b of BIOMES){ for(const [t,p] of b.enemies) add(A.enemySprite(t,p),4,b.floor[0]); add(A.enemySprite('golem',b.golem),3,b.floor[0]); add(A.enemySprite('golem',b.golem,{crown:true}),3,b.floor[0]); o.appendChild(document.createElement('br')); }
h('tiles');
for(const b of BIOMES){ const [c,g]=[document.createElement('canvas'),null]; c.width=16*8;c.height=16*3; const x=c.getContext('2d');
 for(let i=0;i<8;i++){x.drawImage(A.floorTile(b,i*7+1),i*16,0); x.drawImage(A.floorTile(b,i*7+3,true),i*16,16);}
 x.drawImage(A.rockTile(b,1),0,32);x.drawImage(A.rockTile(b,2),16,32);x.drawImage(A.spikeTile(b),32,32);
 add(c,3); add(A.wallDeco(b,1),3,b.side); add(A.wallDeco(b,2),3,b.side); o.appendChild(document.createElement('br')); }
h('skill icons');
for(const s of Object.values(SKILLS)) add(A.icon(s.icon,s.color),4,'#4a3528');
h('equip icons');
for(const e of Object.values(EQUIP)) add(A.icon(e.icon,e.color),4,'#4a3528');
for(const n of ['castle','altar','gear','coin','gem','lock']) add(A.icon(n,'#e8c060'),4,'#efe2c4');
for(const k of Object.keys(A.PICKUP)) add(A.PICKUP[k]('#36f2ff'),5,'#7cc35a');
h('frames');
for(const k of ['panel','paper','gold','dark']){const i=document.createElement('img');i.src=A.frameURL(k);i.style.width='96px';o.appendChild(i)}
