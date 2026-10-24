/*
 * ドットラッシュ！ タイトル画面ムービー（Canvas版）
 *
 *   const movie = DotRushTitle.create(canvas, { skipIntro:false, onTap:()=>{...} });
 *   await movie.ready;          // フォント読み込みとロゴ生成が終わると再生開始
 *   movie.restart(true);        // true = イントロを飛ばしてループ部分から
 *   movie.destroy();            // タイトル画面を離れるとき
 *
 * 構成：イントロ 11 秒（ロゴ登場まで）→ 以後 16 秒周期のループを暗転なしで繰り返す。
 * canvas は 270x480（縦 9:16）。表示サイズは CSS で拡大し image-rendering: pixelated を付ける。
 */
(function(global){
'use strict';
const W=270,H=480,HORIZON=262,K='#1a1030';
const INTRO=11,LOOP=16,LOGO_T=7.0;
const TAU=Math.PI*2;
// 周期 LOOP 秒で必ず元に戻るよう、背景の揺れなどの周波数を丸める
const Q=f=>TAU*Math.max(1,Math.round(f*LOOP/TAU))/LOOP;
const WQ={star:Q(3),win:Q(2),flag:Q(8),f1:Q(9),f2:Q(13),pulse:Q(6),boss:Q(1.6),eye:Q(5),ray:Q(.3),sway:Q(1.3),hair:Q(16),hair2:Q(8),masc:Q(5),pump:Q(20),flt:TAU*6/LOOP};

/* ---------- timeline ---------- */
const PLAN_I=[[0,'run'],[2.5,'turn'],[2.68,'draw'],[3.0,'gun'],[5.0,'holster'],[5.38,'magic'],[7.15,'turnF'],[7.33,'run'],[INTRO,'end']];
const PLAN_L=[[0,'run'],[2.2,'turn'],[2.38,'draw'],[2.7,'gun'],[4.6,'holster'],[4.98,'magic'],[7.0,'turnF'],[7.18,'run'],
              [9.6,'turn'],[9.78,'draw'],[10.1,'gun'],[11.8,'holster'],[12.18,'magic'],[14.2,'turnF'],[14.38,'run'],[LOOP,'end']];
const GL_I=[[1.55,2.0],[8.7,9.1]],GL_L=[[1.0,1.4],[8.2,8.6]];
const FIN_I=6.3,FIN_L=12.7;
function planState(plan,u){for(let i=plan.length-2;i>=0;i--)if(u>=plan[i][0])return {s:plan[i][1],p:(u-plan[i][0])/(plan[i+1][0]-plan[i][0])};return {s:'run',p:0};}
const loopU=T=>(T-INTRO)%LOOP;
const stateAt=T=>T<INTRO?planState(PLAN_I,T):planState(PLAN_L,loopU(T));
const glancing=T=>{const g=T<INTRO?GL_I:GL_L,u=T<INTRO?T:loopU(T);return g.some(([a,b])=>u>=a&&u<b);};
const isMoving=s=>s==='run'||s==='turnF';
// scroll speed scaled so one loop travels a whole number of ground tiles (seamless background)
const SPD=(()=>{let d=0;for(let i=0;i<PLAN_L.length-1;i++)d+=(PLAN_L[i+1][0]-PLAN_L[i][0])*(isMoving(PLAN_L[i][1])?70:36);
  const k=W*Math.max(1,Math.round(d/W))/d;return {run:70*k,back:36*k,perLoop:d*k};})();
const HILL_K=W*Math.max(1,Math.round(SPD.perLoop*.17/W))/SPD.perLoop;

/* ---------- shared helpers ---------- */
const mk=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').imageSmoothingEnabled=false;return c;};
const lerp=(a,b,k)=>a+(b-a)*k;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const BAY=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
const bay=(x,y)=>(BAY[y&3][x&3]+.5)/16;

function shape(w,h,inside,color,outline=K){
  const c=mk(w,h),x=c.getContext('2d');
  const ins=(i,j)=>i>=0&&j>=0&&i<w&&j<h&&inside(i,j);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    if(ins(i,j)){x.fillStyle=color(i,j);x.fillRect(i,j,1,1);}
    else if(ins(i-1,j)||ins(i+1,j)||ins(i,j-1)||ins(i,j+1)){x.fillStyle=outline;x.fillRect(i,j,1,1);}
  }
  return {c,x};
}
function fromRows(rows,pal,w){
  w=w||Math.max(...rows.map(r=>r.length));const h=rows.length,c=mk(w,h),x=c.getContext('2d');
  rows.forEach((r,j)=>{for(let i=0;i<r.length;i++){const col=pal[r[i]];if(col){x.fillStyle=col;x.fillRect(i,j,1,1);}}});
  return c;
}
function mirror(c){const m=mk(c.width,c.height),x=m.getContext('2d');x.translate(c.width,0);x.scale(-1,1);x.drawImage(c,0,0);return m;}
function whiteOf(c){const w=mk(c.width,c.height),x=w.getContext('2d');x.drawImage(c,0,0);x.globalCompositeOperation='source-in';x.fillStyle='#fff';x.fillRect(0,0,w.width,w.height);return w;}
function dilate(m,w,h){const o=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(m[y*w+x])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<w&&Y<h)o[Y*w+X]=1;}return o;}

/* ---------- static art (built once) ---------- */
let ART=null;
function buildArt(){
  if(ART)return ART;
  const A={};
  const bodyCol=(light,base,dark,x0,y0,lt=-4.5,dk=3.2,rk=5.5)=>{if(x0*.6+y0<lt)return light;if(y0>dk||x0>rk)return dark;return base;};
  function slime(base,light,dark,sq){
    const w=20,h=17,cx=10,cy=sq?11:10.5,rx=sq?8.8:8,ry=sq?5.6:6.5,bottom=15;
    const inside=(i,j)=>{const X=i+.5,Y=j+.5;if(Y>bottom)return false;
      const dx=(X-cx)/rx,dy=(Y-cy)/ry;if(dx*dx+dy*dy<1)return true;
      const top=cy-ry-3;if(Y>top&&Y<cy-ry+2){const k=(Y-top)/5;return Math.abs(X-(cx+1+(1-k)*2))<k*2.2+.3;}return false;};
    const {c,x}=shape(w,h,inside,(i,j)=>bodyCol(light,base,dark,i+.5-cx,j+.5-cy));
    const ey=Math.round(cy-1);
    x.fillStyle='#fff';x.fillRect(cx-5,ey-1,3,3);x.fillRect(cx+1,ey-1,3,3);
    x.fillStyle=K;x.fillRect(cx-3,ey,1,2);x.fillRect(cx+3,ey,1,2);
    x.fillRect(cx-3,ey+3,6,3);x.fillStyle='#e0305a';x.fillRect(cx-2,ey+4,4,2);x.fillStyle='#ff8aa8';x.fillRect(cx-1,ey+5,2,1);
    x.fillStyle='#fff';x.fillRect(cx-6,Math.round(cy-ry+2),2,1);
    return c;
  }
  function demon(base,light,dark,sq){
    const w=20,h=21,cx=10,cy=sq?12.6:12,rx=sq?7.6:7,ry=sq?6.4:7;
    const inB=(X,Y)=>((X-cx)/rx)**2+((Y-cy)/ry)**2<1;
    const inH=(X,Y)=>{for(const s of[-1,1]){const top=cy-ry-4,bot=cy-ry+2;if(Y>top&&Y<bot){const k=(Y-top)/(bot-top);const hx=cx+s*4.5+s*(1-k)*2;if(Math.abs(X-hx)<k*1.6+.3)return true;}}return false;};
    const {c,x}=shape(w,h,(i,j)=>inB(i+.5,j+.5)||inH(i+.5,j+.5),(i,j)=>{const X=i+.5,Y=j+.5;if(!inB(X,Y))return X<cx?'#ffe6a8':'#d9b06a';return bodyCol(light,base,dark,X-cx,Y-cy,-4,3.5,5);});
    const ey=Math.round(cy-1);
    x.fillStyle='#ffe84a';x.fillRect(cx-5,ey,3,2);x.fillRect(cx+2,ey,3,2);
    x.fillStyle=K;x.fillRect(cx-3,ey,1,2);x.fillRect(cx+4,ey,1,2);
    x.fillRect(cx-6,ey-2,1,1);x.fillRect(cx-5,ey-1,2,1);x.fillRect(cx+5,ey-2,1,1);x.fillRect(cx+3,ey-1,2,1);
    x.fillRect(cx-3,ey+3,6,2);x.fillStyle='#fff';x.fillRect(cx-2,ey+3,1,1);x.fillRect(cx+1,ey+3,1,1);
    return c;
  }
  function skull(sq){
    const w=16,h=17,cx=8,cy=sq?8:7.5,r=6.3;
    const inside=(i,j)=>{const X=i+.5,Y=j+.5;return ((X-cx)**2+(Y-cy)**2<r*r)||(X>4&&X<12&&Y>cy+2&&Y<cy+7);};
    const {c,x}=shape(w,h,inside,(i,j)=>{const X=i+.5-cx,Y=j+.5-cy;return (X+Y*.5>3.2)?'#b8b0d8':'#f4f2fb';});
    const sy=Math.round(cy-1);
    x.fillStyle=K;x.fillRect(3,sy,4,3);x.fillRect(9,sy,4,3);
    x.fillStyle='#ff3a5a';x.fillRect(5,sy+1,1,1);x.fillRect(10,sy+1,1,1);
    x.fillStyle=K;x.fillRect(7,sy+4,2,1);x.fillRect(5,sy+6,6,1);x.fillRect(6,sy+7,1,1);x.fillRect(8,sy+7,1,1);x.fillRect(10,sy+7,1,1);
    return c;
  }
  function block(base,light,dark,sq){
    const w=20,h=20,t0=sq?4:3;
    const inside=(i,j)=>{if(i<2||i>17||j<t0||j>17)return false;const a=Math.min(i-2,17-i),b=Math.min(j-t0,17-j);return a+b>=2;};
    const {c,x}=shape(w,h,inside,(i,j)=>{if(j<t0+2&&i<12)return light;if(i>14||j>15)return dark;return base;});
    const ey=t0+4;
    x.fillStyle='#fff';x.fillRect(5,ey,4,4);x.fillRect(11,ey,4,4);
    x.fillStyle=K;x.fillRect(7,ey+1,2,2);x.fillRect(13,ey+1,2,2);
    x.fillRect(5,ey+6,10,4);x.fillStyle='#d8284a';x.fillRect(6,ey+7,8,2);x.fillStyle='#ff8aa8';x.fillRect(8,ey+8,4,1);
    x.fillStyle='#fff';x.fillRect(6,ey+6,1,1);x.fillRect(13,ey+6,1,1);
    return c;
  }
  function ghost(base,light,dark,sq){
    const w=20,h=19,cx=10,cy=sq?9:8,r=7.2;
    const inside=(i,j)=>{const X=i+.5,Y=j+.5;if((X-cx)**2+(Y-cy)**2<r*r)return true;
      return X>cx-r+.3&&X<cx+r-.3&&Y>=cy&&Y<cy+7+Math.sin(X*1.3+(sq?2:0))*1.4;};
    const {c,x}=shape(w,h,inside,(i,j)=>bodyCol(light,base,dark,i+.5-cx,j+.5-cy,-4,5,5));
    x.fillStyle='#fff';x.fillRect(cx-5,cy-2,3,4);x.fillRect(cx+1,cy-2,3,4);
    x.fillStyle=K;x.fillRect(cx-3,cy-1,1,2);x.fillRect(cx+3,cy-1,1,2);
    x.fillRect(cx-2,cy+3,4,3);x.fillStyle='#e0305a';x.fillRect(cx-1,cy+4,2,2);
    return c;
  }
  A.TYPES=[
    {b:sq=>slime('#3aa8ff','#a6e6ff','#1a5ac8',sq),hp:2,hop:1,col:'#3aa8ff'},
    {b:sq=>slime('#5ad04a','#b6f27e','#2a8a3a',sq),hp:2,hop:1,col:'#5ad04a'},
    {b:sq=>slime('#a04ae0','#d89aff','#5a2a9a',sq),hp:2,hop:1,col:'#a04ae0'},
    {b:sq=>demon('#e0402a','#ff8a5a','#9a1a2a',sq),hp:3,hop:0,col:'#e0402a'},
    {b:sq=>demon('#f08a1a','#ffc05a','#b04a10',sq),hp:3,hop:0,col:'#f08a1a'},
    {b:sq=>skull(sq),hp:2,hop:0,col:'#f4f2fb'},
    {b:sq=>block('#4ac84a','#9af07a','#1f7a3a',sq),hp:3,hop:0,col:'#4ac84a'},
    {b:sq=>ghost('#7a4ad0','#b08aff','#3a2080',sq),hp:2,hop:0,col:'#7a4ad0'},
  ];
  A.TYPES.forEach(t=>{t.fr=[t.b(false),t.b(true)];t.white=t.fr.map(whiteOf);});

  A.BOSS=(()=>{
    const w=58,h=46,cx=29,cy=27,rx=24,ry=17;
    const inB=(X,Y)=>((X-cx)/rx)**2+((Y-cy)/ry)**2<1;
    const inH=(X,Y)=>{for(const s of[-1,1]){const top=3,bot=15;if(Y>top&&Y<bot){const k=(Y-top)/(bot-top);const hx=cx+s*14+s*(1-k)*5;if(Math.abs(X-hx)<k*3+.5)return true;}}return false;};
    const {c,x}=shape(w,h,(i,j)=>inB(i+.5,j+.5)||inH(i+.5,j+.5),(i,j)=>{const X=i+.5,Y=j+.5;if(!inB(X,Y))return '#4a2e7a';return bodyCol('#40206e','#2c1552','#1c0c38',X-cx,Y-cy,-8,8,14);},'#0c0420');
    x.fillStyle='#120620';x.fillRect(cx-10,cy+4,20,6);
    x.fillStyle='#e8e0ff';x.fillRect(cx-8,cy+4,2,3);x.fillRect(cx+6,cy+4,2,3);x.fillRect(cx-2,cy+4,1,2);x.fillRect(cx+1,cy+4,1,2);
    return c;
  })();

  const HP={K,W:'#f6f2ff',w:'#c4b8ec',S:'#ffdcc8',s:'#f2a48e',E:'#d63a9a',H:'#ffffff',P:'#ff4fa8',R:'#c8203a',B:'#2b2340',b:'#463a66',p:'#ff9ab8'};
  const HEAD=["........KK..........",".......KWK..........","....KKKWWKKKK.......","...KWWWWWWWWWKK.....","..KWWWWWWWWWWWWK....",".KWWWWWWWWWWWWWWK...",
    ".KWWwWWWWWWWWPPWK...","KWWwWWWWWWWWWPPWWK..","KWWwWSWWSSWWSSSWWK..","KWwWSSSSSSSSSSSSWK..","KWwWSSKKSSSSKKSSWK..","KWwWSSEHSSSSEHSSWK..",
    "KWwWSSEESSSSEESSwK..",".KwWSpSSSSSSSSpSwK..",".KwWKSSSSKRRKSSKWK..","..KWKKsssssssKKKWK.."];
  const TORSO=["...KBBBBPBBBBBBK....","..KBBbBBPBBBBbBBK...","..KBbBBBBBBBBBbBK...","..KBBBBBBBBBBBBBK...","...KPPPPPPPPPPPK....","...KBKBKBKBKBKBK...."];
  const LEGS_A=["...KSSK.....KSSK....","..KWWK.......KWWK...",".KPPPK.......KPPPK..",".KKKK.........KKKK.."];
  const LEGS_B=[".....KSSKSSK........",".....KWWKWWK........","....KPPPKPPPK.......","....KKKKKKKKK......."];
  A.HEAD_R=fromRows(HEAD,HP,20);A.HEAD_L=mirror(A.HEAD_R);
  A.BODY_R=[fromRows(TORSO.concat(LEGS_A),HP,20),fromRows(TORSO.concat(LEGS_B),HP,20)];
  A.BODY_L=A.BODY_R.map(mirror);
  A.CROWN=fromRows(["..K.....K.....K..",".KYK...KYK...KYK.",".KYYK.KYYYK.KYYK.",".KYYYKYYYYYKYYYK.",".KYYYYYYYYYYYYYK.",".KYYRYYYBYYYRYYK.",".KOOOOOOOOOOOOOK.","..KKKKKKKKKKKKK.."],
    {K,Y:'#ffd23a',O:'#e08a1a',R:'#ff4f6a',B:'#4ad8ff'});

  // background
  A.bg=mk(W,H);
  (()=>{const x=A.bg.getContext('2d');
    const stops=[[0,'#120838'],[50,'#1e0e66'],[105,'#2e1f9a'],[155,'#4a2aa8'],[195,'#8a2fa0'],[225,'#d8447a'],[248,'#ff8a3a'],[262,'#ffc65a']];
    const toRGB=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
    const id=x.createImageData(W,HORIZON);
    for(let y=0;y<HORIZON;y++){let s=0;while(s<stops.length-2&&y>=stops[s+1][0])s++;
      const [y0,c0]=stops[s],[y1,c1]=stops[s+1],t=(y-y0)/(y1-y0),P0=toRGB(c0),P1=toRGB(c1);
      for(let i=0;i<W;i++){const col=t>bay(i,y)?P1:P0,k=(y*W+i)*4;id.data[k]=col[0];id.data[k+1]=col[1];id.data[k+2]=col[2];id.data[k+3]=255;}}
    x.putImageData(id,0,0);
    const body='#1d1352',hi='#3a2c88',rect=(a,b,c,d,col=body)=>{x.fillStyle=col;x.fillRect(a,b,c,d);};
    const cone=(cx,ay,by,hw)=>{for(let y=ay;y<by;y++){const hh=Math.round((y-ay)/(by-ay)*hw);rect(cx-hh,y,hh*2+1,1);}};
    rect(186,170,84,92);for(let i=186;i<270;i+=6)rect(i,164,3,6);
    rect(176,140,18,122);for(let i=176;i<194;i+=5)rect(i,134,3,6);
    rect(214,92,22,170);cone(225,58,92,13);rect(248,118,22,144);cone(259,92,118,13);
    rect(193,140,1,30,hi);rect(235,92,1,72,hi);rect(269,118,1,46,hi);})();
  A.WINDOWS=[[222,104],[222,122],[228,140],[184,152],[256,134],[200,190],[240,192],[258,172],[222,206],[180,200]];
  A.moon=mk(56,56);
  (()=>{const x=A.moon.getContext('2d'),cx=28,cy=28,r=24;
    for(let j=0;j<56;j++)for(let i=0;i<56;i++){const dx=i+.5-cx,dy=j+.5-cy,d=Math.hypot(dx,dy);
      if(d<r){let col='#dff6ff';if(d>r-4&&dx+dy>0&&bay(i,j)<.55)col='#a8d6f2';x.fillStyle=col;x.fillRect(i,j,1,1);}}
    [[20,18,4],[33,31,5],[21,36,3],[37,16,2.5],[13,27,2]].forEach(([a,b,r])=>{for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++)if(i*i+j*j<=r*r){x.fillStyle=(i+j>r*.6)?'#e8f8ff':'#b6def4';x.fillRect(a+i,b+j,1,1);}});})();
  const cloud=(w,h,circ)=>shape(w,h,(i,j)=>circ.some(([a,b,r])=>(i+.5-a)**2+(j+.5-b)**2<r*r),(i,j)=>circ.some(([a,b,r])=>(i+.5-a)**2+(j+.5-b-2)**2<r*r)?'#3b2c8e':'#5b4cc0','#24186a').c;
  A.CLOUDS=[cloud(46,16,[[10,10,6],[20,8,7],[31,9,6],[39,11,4]]),cloud(34,14,[[9,9,5],[18,7,6],[27,9,5]]),cloud(56,18,[[10,12,6],[22,9,8],[35,10,7],[47,12,5]])];
  A.clouds=[{x:20,y:150,s:0,v:.07},{x:150,y:178,s:1,v:.1},{x:70,y:206,s:2,v:.13},{x:230,y:226,s:1,v:.16}].map(c=>{
    const span=W+A.CLOUDS[c.s].width,n=Math.max(1,Math.round(SPD.perLoop*c.v/span));return {...c,span,v:span*n/SPD.perLoop};});
  A.hills=mk(W,40);
  (()=>{const x=A.hills.getContext('2d');for(let i=0;i<W;i++){const a=TAU*i/W,h=Math.round(14+6*Math.sin(a*2)+4*Math.sin(a*5+1)+2*Math.sin(a*9+2));
    x.fillStyle='#2a1866';x.fillRect(i,40-h,1,h);x.fillStyle='#4a2a9a';x.fillRect(i,40-h,1,1);}})();
  const GH=H-HORIZON;A.ground=mk(W,GH);
  (()=>{const x=A.ground.getContext('2d'),sr=mulberry32(11);
    for(let y=0;y<GH;y++){x.fillStyle=y<22?'#16432c':y<70?'#1c5432':'#22623a';x.fillRect(0,y,W,1);}
    for(let i=0;i<W;i++){const a=TAU*i/W,r=Math.round(1.5+1.5*Math.sin(a*11));x.fillStyle='#2d7a3a';x.fillRect(i,0,1,r+1);}
    for(let i=0;i<W;i++){const a=TAU*i/W,t=Math.round(1.5+1.5*Math.sin(a*7)+Math.sin(a*17)),b=Math.round(1.5+1.5*Math.sin(a*5+2)+Math.sin(a*13));
      const top=88+t,bot=150-b;x.fillStyle='#a8693e';x.fillRect(i,top-1,1,1);x.fillRect(i,bot,1,1);
      x.fillStyle='#6e4430';x.fillRect(i,top,1,bot-top);x.fillStyle='#82533a';x.fillRect(i,top+8,1,bot-top-18);}
    const dup=(f,px)=>{f(px);if(px<10)f(px+W);if(px>W-10)f(px-W);};
    for(let n=0;n<40;n++){const px=Math.floor(sr()*W),py=96+Math.floor(sr()*48);dup(X=>{x.fillStyle='#b07a50';x.fillRect(X,py,2,1);x.fillStyle='#4e2e20';x.fillRect(X,py+1,2,1);},px);}
    for(let n=0;n<90;n++){const px=Math.floor(sr()*W),py=6+Math.floor(sr()*(GH-10));if(py>80&&py<158)continue;
      dup(X=>{x.fillStyle='#3a9a44';x.fillRect(X,py,1,1);x.fillRect(X-1,py-1,1,1);x.fillRect(X+1,py-1,1,1);x.fillStyle='#6ad05a';x.fillRect(X-2,py-2,1,1);x.fillRect(X+2,py-2,1,1);},px);
      if(sr()<.25){const fc=sr()<.5?'#ffe84a':'#ff6aa8';dup(X=>{x.fillStyle=fc;x.fillRect(X+4,py-3,2,2);},px);}}})();
  A.vign=mk(W,H);(()=>{const x=A.vign.getContext('2d'),g=x.createRadialGradient(W/2,H*.55,110,W/2,H*.55,340);g.addColorStop(0,'rgba(6,2,26,0)');g.addColorStop(1,'rgba(6,2,26,.6)');x.fillStyle=g;x.fillRect(0,0,W,H);})();
  const sr=mulberry32(5);A.STARS=Array.from({length:60},()=>({x:Math.floor(sr()*W),y:Math.floor(sr()*200),p:sr()*7,b:sr()<.15}));
  ART=A;return A;
}

/* ---------- logo (built after fonts load, shrinks to fit the screen) ---------- */
const LOGO_Y=62,LC_OFF=44,LC_H=134,P=6;
const GOLD=['#fff8b0','#ffd23a','#ff9a1a','#f0601a'],BLUE=['#e0fcff','#5ae0ff','#2a9cff','#1a5ae0'];
function buildLetter(ch,pal,fs,dela){
  const GW=Math.ceil(fs*1.55),GLH=Math.ceil(fs*1.42),base=Math.round(fs*1.16);
  const w=GW+P*2,h=GLH+P*2+3,g=mk(GW,GLH),gx=g.getContext('2d');
  gx.font=`${dela?'':'900 '}${fs}px "Dela Gothic One","Hiragino Sans","Noto Sans CJK JP","Yu Gothic",sans-serif`;
  gx.textBaseline='alphabetic';gx.fillStyle='#fff';gx.fillText(ch,4,base);
  const d=gx.getImageData(0,0,GW,GLH).data;let m=new Uint8Array(w*h);
  for(let j=0;j<GLH;j++)for(let i=0;i<GW;i++)if(d[(j*GW+i)*4+3]>120)m[(P+j)*w+P+i]=1;
  if(!dela){const b2=new Uint8Array(w*h);for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++)if(m[y*w+x]){b2[y*w+x]=b2[y*w+x+1]=b2[(y+1)*w+x]=b2[(y+1)*w+x+1]=1;}m=b2;}
  const d3=dilate(dilate(m,w,h),w,h),d4=dilate(d3,w,h);
  let minX=w,maxX=0,minY=h,maxY=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(m[y*w+x]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  if(minX>maxX){minX=P;maxX=P+fs;minY=P;maxY=P+fs;}
  const o=mk(w,h),ox=o.getContext('2d'),f=mk(w,h),fx=f.getContext('2d');
  const top=P+base-fs*.9,span=fs*.95;
  for(let y=3;y<h;y++)for(let x=0;x<w;x++)if(d4[(y-3)*w+x]){ox.fillStyle='#0c0624';ox.fillRect(x,y,1,1);}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=y*w+x;
    if(d3[k]){ox.fillStyle='#1b1040';ox.fillRect(x,y,1,1);}else if(d4[k]){ox.fillStyle='#ffffff';ox.fillRect(x,y,1,1);}
    if(m[k]){const u=(y-top)/span;let col=u<.25?pal[0]:u<.52?pal[1]:u<.78?pal[2]:pal[3];
      if(!m[k-w])col='#ffffff';else if(!m[k+w])col=pal[3];fx.fillStyle=col;fx.fillRect(x,y,1,1);}}
  return {o,f,w,h,minX,maxX,minY,maxY,base};
}
function buildLogo(){
  let dela=false;try{dela=document.fonts.check('30px "Dela Gothic One"','ド');}catch(e){}
  const chars=[...'ドットラッシュ！'],n=chars.length,TILT=1.2;
  // mascots sit outside the letters: slime ~22px on the left, skull ~28px on the right
  const MAX=W-60;
  let L,adv,total,fs;
  for(fs=37;fs>=20;fs--){
    L=chars.map((ch,i)=>buildLetter(ch,i>=3&&i<=6?BLUE:GOLD,fs,dela));
    adv=L.map(l=>l.maxX-l.minX+2);total=adv.reduce((a,b)=>a+b,0)-2;
    if(total<=MAX)break;
  }
  let cur=Math.round((W-total)/2)-2;const x0=cur;
  L.forEach((l,i)=>{l.x=cur-l.minX;l.y=LOGO_Y+Math.round(((n-1)/2-i)*TILT);cur+=adv[i];});
  const bot=LOGO_Y+Math.max(...L.map(l=>l.maxY));
  return {L,x0,total,ux0:x0+8,ux1:x0+total+4,uy:bot+5+Math.round((n-1)/2*TILT),slope:-TILT/(total/n)};
}

/* ---------- the movie ---------- */
function create(canvas,opts={}){
  const A=buildArt(),TYPES=A.TYPES;
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const lc=mk(W,LC_H),lx=lc.getContext('2d');
  const reduce=!!(global.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  let R=mulberry32(opts.seed??1234);
  const rand=(a,b)=>a+R()*(b-a);
  let logo=null,raf=0,last=0,alive=true,auto=opts.autoplay!==false;

  let T,monsters,bullets,orbs,bolts,exps,parts,coins,lines,sparks,landed;
  let shake,flash,bflash,dist,gunCD,orbCD,boltCD,aim,aimT,muzzle,fin,introFin,finCyc,dustCD,lineCD,emberCD,sparkCD,prevState;
  const hero={x:-30,y:372};
  function reset(){
    R=mulberry32(opts.seed??1234);
    T=0;monsters=[];bullets=[];orbs=[];bolts=[];exps=[];parts=[];coins=[];lines=[];sparks=[];landed=[];
    shake=0;flash=0;bflash=0;dist=0;gunCD=0;orbCD=0;boltCD=.3;aim=Math.PI;aimT=null;muzzle=0;fin=null;introFin=false;finCyc=-1;
    dustCD=0;lineCD=0;emberCD=0;sparkCD=0;prevState='run';hero.x=-30;
  }
  reset();

  function spawn(){
    const ty=Math.floor(R()*TYPES.length),y=Math.round(rand(272,452)),sc=y>=338?2:1;
    monsters.push({ty,x:-24-rand(0,50),y,sc,vx:rand(34,60),ph:rand(0,6),hp:Math.ceil(TYPES[ty].hp*(sc===2?1.5:1)),hit:0,off:rand(0,46),dead:false});
  }
  const part=(x,y,vx,vy,col,life,size=2,g=200)=>parts.push({x,y,vx,vy,col,life,max:life,size,g});
  const boom=(x,y,r,cols)=>exps.push({x,y,r,t:0,dur:.45,cols});
  function kill(m,coinChance=.6){
    if(m.dead)return;m.dead=true;const col=TYPES[m.ty].col,cy=m.y-8*m.sc;
    for(let i=0;i<12;i++)part(m.x,cy,rand(-90,90),rand(-140,-20),i%3?col:'#ffffff',rand(.35,.7),m.sc+1);
    boom(m.x,cy,9*m.sc,['#ffffff','#ffe84a','#ff8a2a']);
    if(R()<coinChance)coins.push({x:m.x,y:cy,vx:rand(-30,50),vy:rand(-150,-90),gy:m.y-2,spin:rand(0,6),age:0});
  }
  const hurt=(m,d)=>{if(m.dead)return;m.hp-=d;m.hit=.08;if(m.hp<=0)kill(m);};
  const area=(x,y,r,d)=>monsters.forEach(m=>{if(Math.hypot(m.x-x,(m.y-8*m.sc)-y)<r)hurt(m,d);});
  const pick=f=>{const c=monsters.filter(m=>!m.dead&&m.x>-6&&(!f||f(m)));return c.length?c[Math.floor(R()*c.length)]:null;};
  function makeBolt(x0,y0,x1,y1){const p=[[x0,y0]];for(let i=1;i<8;i++){const k=i/8;p.push([x0+(x1-x0)*k+rand(-9,9),y0+(y1-y0)*k]);}p.push([x1,y1]);return p;}
  function strike(x,y,big){
    bolts.push({x0:x+rand(-20,20),y0:big?160:182,x1:x,y1:y,pts:null,life:.3,j:0});
    boom(x,y,big?26:14,['#ffffff','#bff8ff','#5ad8ff']);
    for(let i=0;i<10;i++)part(x,y,rand(-120,120),rand(-160,-40),i%2?'#bff8ff':'#ffffff',rand(.3,.6),2);
    area(x,y,big?30:22,big?9:3);
  }
  function heroFrame(st){
    const back=st.s==='gun'||st.s==='draw'||st.s==='holster'||st.s==='magic'||(st.s==='turn'&&st.p>=.5)||(st.s==='turnF'&&st.p<.5);
    const fr=Math.floor(T*(back?6:10))%2;let bob=fr?-2:0;if(st.s==='turn'||st.s==='turnF')bob=-3;
    const sx=Math.round(hero.x-20),sy=Math.round(hero.y-52+bob);
    return {back,fr,sx,sy,chest:{x:sx+18,y:sy+36},nearSh:back?{x:sx+9,y:sy+34}:{x:sx+31,y:sy+34},farSh:back?{x:sx+31,y:sy+34}:{x:sx+9,y:sy+34}};
  }
  function gunPose(G,g){
    const dir={x:Math.cos(aim),y:Math.sin(aim)},hip={x:G.sx+24,y:G.sy+44},ab={x:G.chest.x+dir.x*2,y:G.chest.y+dir.y*2},rec=muzzle>0?2:0;
    const base={x:lerp(hip.x,ab.x,g)-dir.x*rec,y:lerp(hip.y,ab.y,g)-dir.y*rec},ang=lerp(Math.PI*.58,aim,g);
    return {base,ang,tip:{x:base.x+Math.cos(ang)*26,y:base.y+Math.sin(ang)*26}};
  }
  const fingerTip=G=>({x:G.nearSh.x+Math.cos(aim)*22,y:G.nearSh.y+Math.sin(aim)*22});

  function update(dt){
    T+=dt;
    const st=stateAt(T),moving=isMoving(st.s);
    dist+=dt*(moving?SPD.run:SPD.back);
    if(T<1.3){const k=T/1.3;hero.x=-30+208*(1-(1-k)**3);}
    else hero.x=lerp(hero.x,(moving?178:188)+Math.sin(T*WQ.sway)*3,Math.min(1,dt*3));
    if(T>.3){const target=Math.min(30,Math.floor((T-.3)*16));let live=monsters.filter(m=>!m.dead).length;while(live<target){spawn();live++;}}
    monsters.forEach(m=>{m.x+=m.vx*dt;const maxX=hero.x-30-(m.sc-1)*8-m.off;if(m.x>maxX)m.x=maxX;m.hit=Math.max(0,m.hit-dt);});
    monsters=monsters.filter(m=>!m.dead);
    const G=heroFrame(st);
    if(st.s!==prevState){
      if(st.s==='turn'||st.s==='turnF')for(let i=0;i<8;i++)part(hero.x+rand(-10,10),hero.y-2,rand(-60,60),rand(-60,-10),'#e8dcc8',rand(.3,.5),3,60);
      if(st.s==='magic')for(let i=0;i<10;i++)part(G.sx+24,G.sy+44,rand(-50,50),rand(-70,-10),i%2?'#ff9ad8':'#ffffff',.4,2,0);
      prevState=st.s;
    }
    if(G.back){
      if(!aimT||aimT.dead||R()<dt*2)aimT=pick(m=>m.x>10);
      if(aimT){let a=Math.atan2((aimT.y-8*aimT.sc)-G.chest.y,aimT.x-G.chest.x);if(a<0)a+=TAU;a=clamp(a,Math.PI*.8,Math.PI*1.18);aim+=(a-aim)*Math.min(1,dt*12);}
    }
    if(st.s==='gun'){gunCD-=dt;
      if(gunCD<=0&&aimT){const burst=(T*3.2)%1<.75;gunCD=burst?.09:.2;
        if(burst){const gp=gunPose(G,1),c=Math.cos(gp.ang),s=Math.sin(gp.ang);bullets.push({x:gp.tip.x,y:gp.tip.y,vx:c*360,vy:s*360});muzzle=.05;
          part(gp.base.x,gp.base.y-4,rand(10,40),rand(-90,-50),'#ffd23a',.4,2,400);}}}
    bullets.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;
      for(const m of monsters){if(m.dead)continue;if(Math.abs(b.x-m.x)<7*m.sc&&Math.abs(b.y-(m.y-8*m.sc))<8*m.sc){hurt(m,1);b.dead=true;for(let i=0;i<4;i++)part(b.x,b.y,rand(-60,60),rand(-80,20),'#ffe84a',.2,1,0);break;}}
      if(b.x<-10||b.y<0||b.y>H)b.dead=true;});
    bullets=bullets.filter(b=>!b.dead);
    const charging=fin&&!fin.blown;
    if(st.s==='magic'&&st.p>.12){
      const tp=fingerTip(G);
      orbCD-=dt;if(orbCD<=0&&!charging){orbCD=.17;const tg=pick();if(tg){const a=Math.atan2((tg.y-8*tg.sc)-tp.y,tg.x-tp.x);orbs.push({x:tp.x,y:tp.y,vx:Math.cos(a)*240,vy:Math.sin(a)*240,tg,life:1.6,rot:0});}}
      boltCD-=dt;if(boltCD<=0&&!charging){boltCD=.55;const m=pick(m=>m.x<hero.x-40);if(m){strike(m.x,m.y-6*m.sc,false);bflash=Math.max(bflash,.3);shake=Math.max(shake,2.5);}}
      if(R()<.6)part(tp.x+rand(-2,2),tp.y+rand(-8,8),rand(-30,0),rand(-20,20),R()<.5?'#ff9ad8':'#bff8ff',.25,1,0);
    }
    orbs.forEach(o=>{o.life-=dt;o.rot+=dt*14;if(!o.tg||o.tg.dead)o.tg=pick();
      if(o.tg){const tx=o.tg.x,ty=o.tg.y-8*o.tg.sc,d=Math.hypot(tx-o.x,ty-o.y)||1;o.vx+=((tx-o.x)/d*300-o.vx)*Math.min(1,dt*5);o.vy+=((ty-o.y)/d*300-o.vy)*Math.min(1,dt*5);
        if(d<8*o.tg.sc){o.dead=true;boom(o.x,o.y,12,['#ffffff','#ff9ad8','#ff4fa8']);area(o.x,o.y,15,2);}}
      o.x+=o.vx*dt;o.y+=o.vy*dt;if(R()<.7)part(o.x,o.y,rand(-15,15),rand(-15,15),R()<.5?'#ff9ad8':'#fff3a0',.3,1,0);
      if(o.life<=0)o.dead=true;});
    orbs=orbs.filter(o=>!o.dead);
    bolts.forEach(b=>{b.life-=dt;b.j-=dt;if(b.j<=0){b.j=.04;b.pts=makeBolt(b.x0,b.y0,b.x1,b.y1);}});
    bolts=bolts.filter(b=>b.life>0);
    // finisher: big one in the intro (hands over to the logo), smaller one once per loop
    if(!fin){
      if(T<INTRO){if(!introFin&&T>=FIN_I){introFin=true;fin={t:0,blown:false,big:true};}}
      else{const cyc=Math.floor((T-INTRO)/LOOP),u=loopU(T);if(u>=FIN_L&&u<FIN_L+.4&&cyc!==finCyc){finCyc=cyc;fin={t:0,blown:false,big:false};}}
    }
    if(fin){fin.t+=dt;const tp=fingerTip(G);
      if(fin.t<.55)for(let i=0;i<3;i++){const a=rand(0,TAU),r=rand(22,40);part(tp.x+Math.cos(a)*r,tp.y+Math.sin(a)*r,-Math.cos(a)*90,-Math.sin(a)*90,R()<.5?'#ff6ac8':'#7ae8ff',.35,2,0);}
      if(!fin.blown&&fin.t>=.55){fin.blown=true;
        const nb=fin.big?6:4;for(let k=0;k<nb;k++){const x=10+k*(hero.x-60)/(nb-1)+rand(-8,8),y=rand(285,440);strike(x,y,true);}
        monsters.forEach(m=>{if(m.x<hero.x-(fin.big?20:50))kill(m,.3);});flash=fin.big?1:.45;shake=fin.big?7:5;}
      if(fin.t>1.3)fin=null;}
    coins.forEach(c=>{c.age+=dt;c.spin+=dt*10;
      if(c.age<.9){c.vy+=420*dt;c.x+=c.vx*dt;c.y+=c.vy*dt;if(c.y>c.gy){c.y=c.gy;c.vy*=-.45;c.vx*=.6;}}
      else{const tx=hero.x,ty=hero.y-26,d=Math.hypot(tx-c.x,ty-c.y)||1,sp=120+(c.age-.9)*700;c.x+=(tx-c.x)/d*sp*dt;c.y+=(ty-c.y)/d*sp*dt;
        if(d<8){c.dead=true;for(let i=0;i<5;i++)part(c.x,c.y,rand(-50,50),rand(-70,-10),'#fff3a0',.3,1,0);}}
      if(c.age>3)c.dead=true;});
    coins=coins.filter(c=>!c.dead);
    dustCD-=dt;if(T>.1&&dustCD<=0){dustCD=moving?.07:.14;part(hero.x-6,hero.y-2,rand(-70,-40)*(moving?1:.5),rand(-30,-5),'#e8dcc8',rand(.3,.5),3,40);}
    lineCD-=dt;if(T>1&&lineCD<=0){lineCD=moving?rand(.05,.14):rand(.15,.3);lines.push({x:W+5,y:rand(285,470),l:rand(10,34),v:rand(260,380)});}
    lines.forEach(l=>{l.x-=l.v*dt;});lines=lines.filter(l=>l.x+l.l>0);
    emberCD-=dt;if(emberCD<=0){emberCD=.05;part(rand(0,150),HORIZON-2,rand(-8,12),rand(-50,-20),R()<.5?'#ff8a1a':'#ffe24a',rand(.8,1.5),1,-10);}
    parts.forEach(p=>{p.life-=dt;p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;});parts=parts.filter(p=>p.life>0);
    exps.forEach(e=>e.t+=dt);exps=exps.filter(e=>e.t<e.dur);
    const lt=T-LOGO_T;
    if(logo)logo.L.forEach((l,i)=>{const ti=.25+i*.1;if(!landed[i]&&lt>=ti+.22){landed[i]=true;shake=Math.max(shake,1.6);
      const bx=l.x+(l.minX+l.maxX)/2,by=l.y+l.maxY+1;for(let k=0;k<6;k++)part(bx+rand(-10,10),by,rand(-60,60),rand(-60,-10),k%2?'#ffffff':'#fff3a0',.35,2,120);}});
    if(logo&&lt>2.5){sparkCD-=dt;if(sparkCD<=0){sparkCD=.22;const l=logo.L[Math.floor(R()*logo.L.length)];sparks.push({x:l.x+rand(l.minX,l.maxX),y:l.y+rand(l.minY,l.maxY),t:0});}}
    sparks.forEach(s=>s.t+=dt);sparks=sparks.filter(s=>s.t<.5);
    muzzle-=dt;shake*=Math.exp(-dt*9);flash=Math.max(0,flash-dt*2.2);bflash=Math.max(0,bflash-dt*4);
  }

  /* draw helpers */
  function pixCircle(cx,cy,r,col,fade=0,step=2){if(r<=0)return;ctx.fillStyle=col;const r2=r*r,x0=Math.floor((cx-r)/step)*step,y0=Math.floor((cy-r)/step)*step;
    for(let y=y0;y<=cy+r;y+=step)for(let x=x0;x<=cx+r;x+=step){const dx=x+step/2-cx,dy=y+step/2-cy;if(dx*dx+dy*dy<=r2){if(fade>0&&bay(Math.floor(x/step),Math.floor(y/step))<fade)continue;ctx.fillRect(x,y,step,step);}}}
  function pixEllipse(cx,cy,rx,ry,col,step=1){ctx.fillStyle=col;for(let y=-ry;y<=ry;y+=step)for(let x=-rx;x<=rx;x+=step)if((x/rx)**2+(y/ry)**2<=1)ctx.fillRect(Math.round(cx+x),Math.round(cy+y),step,step);}
  function thick(x0,y0,x1,y1,size,col){const L=Math.hypot(x1-x0,y1-y0),n=Math.max(1,Math.ceil(L));ctx.fillStyle=col;
    for(let i=0;i<=n;i++){const x=x0+(x1-x0)*i/n,y=y0+(y1-y0)*i/n;ctx.fillRect(Math.round(x-size/2),Math.round(y-size/2),size,size);}}
  function starShape(x,y,s,c1,c2){x=Math.round(x);y=Math.round(y);ctx.fillStyle=c1;ctx.fillRect(x-s,y,s*2+1,1);ctx.fillRect(x,y-s,1,s*2+1);ctx.fillRect(x-1,y-1,3,3);ctx.fillStyle=c2;ctx.fillRect(x,y,1,1);}
  function arm(a,b){thick(a.x,a.y,b.x,b.y,8,K);const m={x:lerp(a.x,b.x,.72),y:lerp(a.y,b.y,.72)};thick(a.x,a.y,m.x,m.y,4,'#2b2340');thick(m.x,m.y,b.x,b.y,4,'#ffdcc8');}
  function drawMonster(m){
    const ty=TYPES[m.ty],ph=T*(ty.hop?7:5)+m.ph;let off,fr;
    if(ty.hop){const s=Math.abs(Math.sin(ph));off=-Math.round(s*4)*m.sc;fr=s<.25?1:0;}
    else{off=-Math.round(Math.abs(Math.sin(ph))*1.5)*m.sc;fr=Math.floor(ph*1.3)%2;}
    const img=m.hit>0?ty.white[fr]:ty.fr[fr],w=img.width*m.sc,h=img.height*m.sc;
    ctx.drawImage(img,Math.round(m.x-w/2),Math.round(m.y-h+off),w,h);
  }
  function drawGun(base,ang){
    const c=Math.cos(ang),s=Math.sin(ang),n={x:-s*Math.sign(c||1)*-1,y:Math.abs(c)},Pt=d=>[base.x+c*d,base.y+s*d];
    const grip=[base.x+c*5+n.x*6,base.y+s*5+n.y*6];
    thick(base.x+c*5,base.y+s*5,grip[0],grip[1],7,K);thick(...Pt(-3),...Pt(26),8,K);
    thick(base.x+c*5,base.y+s*5,grip[0],grip[1],3,'#3a3e6a');
    thick(...Pt(-2),...Pt(19),4,'#5a6094');thick(...Pt(19),...Pt(26),4,'#2a2e50');
    thick(...Pt(0),...Pt(17),2,'#9aa0d8');thick(...Pt(3),...Pt(14),1,'#ff4fa8');
    const [mx,my]=Pt(25);ctx.fillStyle='#ff4fa8';ctx.fillRect(Math.round(mx)-1,Math.round(my)-1,2,2);
  }
  function drawMagicRing(p,big){
    const ry=big?16:9,rx=big?5:3;
    for(let i=0;i<40;i++){const t=i/40*TAU+T*3;ctx.fillStyle=i%2?'#ff6ac8':'#ffb0e0';ctx.fillRect(Math.round(p.x-2+Math.cos(t)*rx),Math.round(p.y+Math.sin(t)*ry),1,2);}
    for(let i=0;i<20;i++){const t=-i/20*TAU+T*2;ctx.fillStyle='#7ae8ff';ctx.fillRect(Math.round(p.x-4+Math.cos(t)*rx*.6),Math.round(p.y+Math.sin(t)*ry*.65),1,1);}
    for(let i=0;i<4;i++){const t=i/4*TAU+T*4;ctx.fillStyle='#fff';ctx.fillRect(Math.round(p.x-2+Math.cos(t)*rx)-1,Math.round(p.y+Math.sin(t)*ry)-1,2,2);}
    starShape(p.x,p.y,Math.floor(T*20)%2?3:2,'#ffffff','#ffffff');
  }
  function drawGroundCircle(Rr,a){const cx=hero.x,cy=hero.y;
    for(let i=0;i<64;i++){const t=i/64*TAU+T*1.5;ctx.fillStyle=`rgba(255,106,200,${a})`;ctx.fillRect(Math.round(cx+Math.cos(t)*Rr),Math.round(cy+Math.sin(t)*Rr*.38),2,1);
      const t2=-i/64*TAU+T;ctx.fillStyle=`rgba(122,232,255,${a})`;ctx.fillRect(Math.round(cx+Math.cos(t2)*Rr*.7),Math.round(cy+Math.sin(t2)*Rr*.7*.38),1,1);}
    for(let i=0;i<8;i++){const t=i/8*TAU+T*2.4;ctx.fillStyle=`rgba(255,255,255,${a})`;ctx.fillRect(Math.round(cx+Math.cos(t)*Rr*.85)-1,Math.round(cy+Math.sin(t)*Rr*.85*.38)-1,3,3);}
  }
  function drawHero(st){
    const G=heroFrame(st),{sx,sy,back,fr}=G,glance=!back&&glancing(T);
    for(let k=0;k<3;k++){const len=back?3+k:5+k*2;
      for(let pass=0;pass<2;pass++)for(let s=0;s<len;s++){
        const px=back?sx+32+s*3:sx+4-s*3,py=sy+12+k*8+Math.round(Math.sin(T*(back?WQ.hair2:WQ.hair)+s*.6+k)*s*.35)*2;
        if(pass===0){ctx.fillStyle=K;ctx.fillRect(px-2,py-2,8,8);}else{ctx.fillStyle=s>len-3?'#c4b8ec':'#f6f2ff';ctx.fillRect(px,py,4,4);}}}
    let gunG=0;
    if(st.s==='draw')gunG=1-(1-st.p)**2;else if(st.s==='gun')gunG=1;else if(st.s==='holster')gunG=1-st.p*st.p;
    const holding=st.s==='draw'||st.s==='gun'||st.s==='holster';let gp=null;
    if(holding){gp=gunPose(G,gunG);const c=Math.cos(gp.ang),s=Math.sin(gp.ang);arm(G.farSh,{x:gp.base.x+c*4,y:gp.base.y+s*4+3});}
    else if(st.s==='magic')arm(G.farSh,{x:G.farSh.x+3,y:G.farSh.y+12});
    ctx.drawImage(back?A.BODY_L[fr]:A.BODY_R[fr],sx,sy+32,40,20);
    if(glance)ctx.drawImage(A.HEAD_L,sx-4,sy,40,32);else ctx.drawImage(back?A.HEAD_L:A.HEAD_R,sx,sy,40,32);
    if(glance){ctx.fillStyle='#8ae0ff';ctx.fillRect(sx+30,sy+8,2,4);ctx.fillStyle='#fff';ctx.fillRect(sx+30,sy+8,1,1);
      ctx.fillStyle=K;ctx.fillRect(sx+2,sy-8,3,6);ctx.fillRect(sx+2,sy-1,3,3);ctx.fillStyle='#ffd23a';ctx.fillRect(sx+3,sy-7,1,4);ctx.fillRect(sx+3,sy,1,1);}
    if(holding){
      if(st.s==='holster'&&st.p>.85)starShape(gp.base.x,gp.base.y,3,'#ff9ad8','#fff');else drawGun(gp.base,gp.ang);
      const c=Math.cos(gp.ang),s=Math.sin(gp.ang);arm(G.nearSh,{x:gp.base.x+c*13,y:gp.base.y+s*13+1});
      if(muzzle>0&&st.s==='gun')starShape(gp.tip.x+c*3,gp.tip.y+s*3,5,'#ffe84a','#ffffff');
    }else if(st.s==='magic'){
      const d={x:Math.cos(aim),y:Math.sin(aim)},hand={x:G.nearSh.x+d.x*14,y:G.nearSh.y+d.y*14};
      const k=Math.min(1,st.p*8),h2={x:lerp(G.nearSh.x+2,hand.x,k),y:lerp(G.nearSh.y+10,hand.y,k)};
      thick(h2.x,h2.y,h2.x+d.x*7,h2.y+d.y*7,4,K);arm(G.nearSh,h2);
      thick(h2.x+d.x*2,h2.y+d.y*2,h2.x+d.x*6,h2.y+d.y*6,2,'#ffdcc8');
      if(k>=1)drawMagicRing(fingerTip(G),fin&&!fin.blown);
    }else if(!back){const sw=Math.round(Math.sin(T*WQ.pump)*3),f=G.nearSh;arm(f,{x:f.x+5+sw,y:f.y+8});}
  }
  function drawBolt(b){if(!b.pts)return;const p=b.pts;
    [[6,'rgba(90,216,255,.55)'],[3,'#bff8ff'],[1,'#ffffff']].forEach(([s,c])=>{for(let i=0;i<p.length-1;i++)thick(p[i][0],p[i][1],p[i+1][0],p[i+1][1],s,c);});}
  function drawExp(e){const p=e.t/e.dur,r=e.r*(.5+.5*(1-(1-p)**3)),fade=p>.5?(p-.5)/.5:0;
    if(p<.12){pixCircle(e.x,e.y,e.r*.8*(p/.12+.2),'#ffffff');return;}
    pixCircle(e.x,e.y,r,e.cols[2],fade);pixCircle(e.x,e.y,r*.7,e.cols[1],fade);pixCircle(e.x,e.y,r*.38*(1-p),e.cols[0],fade);}
  function drawCoin(c){const w=Math.max(1,Math.round(Math.abs(Math.cos(c.spin))*4)),x=Math.round(c.x),y=Math.round(c.y);
    ctx.fillStyle=K;ctx.fillRect(x-w-1,y-5,w*2+2,10);ctx.fillRect(x-w,y-6,w*2,12);
    ctx.fillStyle='#ffc21a';ctx.fillRect(x-w,y-5,w*2,10);ctx.fillStyle='#fff3a0';ctx.fillRect(x-w,y-5,Math.max(1,w-1),3);
    if(w>2){ctx.fillStyle='#e08a10';ctx.fillRect(x-1,y-3,2,6);}}
  function tri(x,y,dir,col){ctx.fillStyle=col;for(let i=0;i<5;i++)ctx.fillRect(dir>0?x+i:x-i,y-4+i,1,9-i*2);}
  const backOut=p=>{const s=2.2;p-=1;return p*p*((s+1)*p+s)+1;};
  const bounceOut=p=>{const n=7.5625,d=2.75;if(p<1/d)return n*p*p;if(p<2/d)return n*(p-=1.5/d)*p+.75;if(p<2.5/d)return n*(p-=2.25/d)*p+.9375;return n*(p-=2.625/d)*p+.984375;};

  function drawLogo(){
    const lt=T-LOGO_T;if(lt<0||!logo)return;const G=logo;
    lx.clearRect(0,0,W,LC_H);lx.save();lx.translate(0,-(LOGO_Y-LC_OFF));
    const vis=G.L.map((l,i)=>{const ti=.25+i*.1,q=(lt-ti)/.22;if(q<=0)return null;
      if(q<1)return {l,x:l.x,y:Math.round(l.y-(1-q*q)*110),w:l.w,h:l.h};
      const r=Math.min(1,(lt-ti-.22)/.3),a=Math.sin(r*Math.PI*2)*(1-r)*.32,w=Math.round(l.w*(1+a*.8)),h=Math.round(l.h*(1-a));
      return {l,x:Math.round(l.x+l.w/2-w/2),y:l.y+l.h-h,w,h};});
    const ut=(lt-1.25)/.25;
    if(ut>0){const len=G.ux1-G.ux0,end=G.ux0+len*Math.min(1,ut);
      for(let pass=0;pass<3;pass++)for(let x=G.ux0;x<end;x++){const u=(x-G.ux0)/len;
        const y=Math.round(G.uy+u*G.slope*len+(u>.42?3:0)+(u>.7?-2:0)),th=Math.round(1+5*Math.sin(Math.min(1,u*1.15)*Math.PI*.95));
        const t2=[th+2,th,Math.max(0,th-2)][pass];if(t2<=0)continue;lx.fillStyle=['#1b1040','#ff8a1a','#fff36a'][pass];lx.fillRect(x,y-t2,1,t2*2);}
      if(ut<1){lx.fillStyle='#fff';lx.fillRect(Math.round(end)-2,Math.round(G.uy+(end-G.ux0)*G.slope)-3,4,6);}}
    ['o','f'].forEach(k=>vis.forEach(v=>{if(v&&v.w>0&&v.h>0)lx.drawImage(v.l[k],v.x,v.y,v.w,v.h);}));
    const ct=(lt-1.6)/.5;
    if(ct>0){const a=G.L[1],b=G.L[2],cx=Math.round((a.x+(a.minX+a.maxX)/2+b.x+(b.minX+b.maxX)/2)/2),ty=Math.min(a.y+a.minY,b.y+b.minY)-15;
      lx.drawImage(A.CROWN,cx-17,ty-Math.round((1-bounceOut(Math.min(1,ct)))*80),34,16);}
    const bobOn=clamp((lt-2.6)/.5,0,1);
    const st1=(lt-2.0)/.45,st2=(lt-2.2)/.45;
    if(st1>0){const k=Math.min(1,st1),hop=Math.round(Math.sin(k*Math.PI)*-22),bob=Math.round(Math.sin(T*WQ.masc)*1.5*bobOn),sl=TYPES[0].fr[Math.floor(T*3)%2];
      const sxp=Math.max(0,G.x0-26)+Math.round(k*6);lx.drawImage(sl,sxp,G.uy+12-34+hop+bob+Math.round((1-k)*30),40,34);}
    if(st2>0){const s=st2<1?backOut(st2):1,sk=TYPES[5].fr[0],kw=Math.round(32*s),kh=Math.round(34*s),bob=Math.round(Math.sin(T*WQ.masc+1)*1.5*bobOn);
      const cxk=Math.min(W-17,G.x0+G.total+14);lx.drawImage(sk,Math.round(cxk-kw/2),G.uy-14-kh+bob,kw,kh);}
    lx.restore();
    if(lt>2.6){const per=LOOP/6,st=((T%per)/per)*per/.5;if(st<1){const bx=-30+st*(W+100);lx.save();lx.globalCompositeOperation='source-atop';
      lx.fillStyle='rgba(255,255,255,.85)';lx.beginPath();lx.moveTo(bx,0);lx.lineTo(bx+9,0);lx.lineTo(bx-61,LC_H);lx.lineTo(bx-70,LC_H);lx.closePath();lx.fill();
      lx.fillStyle='rgba(255,255,255,.6)';lx.beginPath();lx.moveTo(bx+14,0);lx.lineTo(bx+17,0);lx.lineTo(bx-53,LC_H);lx.lineTo(bx-56,LC_H);lx.closePath();lx.fill();lx.restore();}}
    const fy=Math.round(Math.sin(T*WQ.flt)*1.5*bobOn);
    ctx.drawImage(lc,0,LOGO_Y-LC_OFF+fy);
    sparks.forEach(s=>{const sz=Math.round(Math.sin(s.t/.5*Math.PI)*3);if(sz>0)starShape(s.x,s.y+fy,sz,'#ffffff','#fff3a0');});
  }
  function drawTap(){
    if(!logo||T<LOGO_T+2.8)return;
    const bx=Math.round(W/2-70),by=437,bw=140,bh=20;
    ctx.fillStyle=K;ctx.fillRect(bx-1,by-1,bw+2,bh+2);ctx.fillStyle='#16103e';ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#bdb4ff';ctx.fillRect(bx+1,by+1,bw-2,1);ctx.fillRect(bx+1,by+bh-2,bw-2,1);ctx.fillRect(bx+1,by+1,1,bh-2);ctx.fillRect(bx+bw-2,by+1,1,bh-2);
    const o=Math.floor(T*4)%2;tri(bx+10-o,by+bh/2,-1,'#ffd23a');tri(bx+bw-10+o,by+bh/2,1,'#ffd23a');
    if((T*26/LOOP)%1<.68){ctx.font='8px "Press Start 2P", monospace';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle='#3a2a8a';ctx.fillText('TAP TO START',W/2+1,by+bh/2+2);ctx.fillStyle='#ffffff';ctx.fillText('TAP TO START',W/2,by+bh/2+1);}
  }
  function draw(){
    const st=stateAt(T);
    ctx.fillStyle='#0b0820';ctx.fillRect(0,0,W,H);
    ctx.save();
    if(!reduce&&shake>.3)ctx.translate(Math.round(rand(-shake,shake)),Math.round(rand(-shake,shake)));
    ctx.drawImage(A.bg,0,0);
    A.STARS.forEach(s=>{const tw=Math.sin(T*WQ.star+s.p);if(tw<-.6)return;ctx.fillStyle=tw>.7?'#ffffff':'#b8b0ff';
      if(s.b&&tw>.3){ctx.fillRect(s.x-1,s.y,3,1);ctx.fillRect(s.x,s.y-1,1,3);}else ctx.fillRect(s.x,s.y,1,1);});
    const mg=ctx.createRadialGradient(214,40,20,214,40,70);mg.addColorStop(0,'rgba(170,230,255,.35)');mg.addColorStop(1,'rgba(170,230,255,0)');ctx.fillStyle=mg;ctx.fillRect(140,0,130,120);
    ctx.drawImage(A.moon,186,12);
    ctx.save();ctx.fillStyle='rgba(255,210,150,.07)';
    for(let i=0;i<7;i++){const a=-Math.PI+i/6*Math.PI+Math.sin(T*WQ.ray)*.08+.05,w=.07;ctx.beginPath();ctx.moveTo(60,HORIZON-8);ctx.lineTo(60+Math.cos(a-w)*400,HORIZON-8+Math.sin(a-w)*400);ctx.lineTo(60+Math.cos(a+w)*400,HORIZON-8+Math.sin(a+w)*400);ctx.closePath();ctx.fill();}
    ctx.restore();
    A.WINDOWS.forEach(([x,y],i)=>{ctx.fillStyle=Math.sin(T*WQ.win+i*1.7)>-.3?'#ffcf5a':'#7a4a2a';ctx.fillRect(x,y,2,4);});
    [[225,44],[259,80]].forEach(([x,y],i)=>{ctx.fillStyle='#1d1352';ctx.fillRect(x,y,1,14);ctx.fillStyle='#e0304a';
      for(let c=0;c<7;c++)ctx.fillRect(x+1+c,y+Math.round(Math.sin(T*WQ.flag+c*.8+i)),1,4);});
    A.clouds.forEach(c=>{const img=A.CLOUDS[c.s],x=(((c.x-dist*c.v)%c.span)+c.span)%c.span-img.width;ctx.drawImage(img,Math.round(x),c.y);});
    const hx=Math.round((dist*HILL_K)%W);ctx.drawImage(A.hills,-hx,HORIZON-40);ctx.drawImage(A.hills,W-hx,HORIZON-40);
    const pulse=.8+.2*Math.sin(T*WQ.pulse),fg=ctx.createRadialGradient(50,HORIZON,10,50,HORIZON,150);fg.addColorStop(0,`rgba(255,140,40,${.45*pulse})`);fg.addColorStop(1,'rgba(255,140,40,0)');ctx.fillStyle=fg;ctx.fillRect(0,HORIZON-150,220,180);
    for(let x=0;x<150;x+=5){const h=Math.round((4+((Math.sin(T*WQ.f1+x*.7)+Math.sin(T*WQ.f2+x*1.3))*.5+1)*5)*(1-x/170));if(h<2)continue;
      ctx.fillStyle='#e0302a';ctx.fillRect(x,HORIZON-h,5,h);ctx.fillStyle='#ff8a1a';ctx.fillRect(x+1,HORIZON-Math.round(h*.7),3,Math.round(h*.7));ctx.fillStyle='#ffe24a';ctx.fillRect(x+2,HORIZON-Math.round(h*.4),1,Math.round(h*.4));}
    const gx=Math.round(dist%W);ctx.drawImage(A.ground,-gx,HORIZON);ctx.drawImage(A.ground,W-gx,HORIZON);
    lines.forEach(l=>{ctx.fillStyle='rgba(255,255,255,.22)';ctx.fillRect(Math.round(l.x),Math.round(l.y),Math.round(l.l),1);});
    if(T>.8){const a=Math.min(1,(T-.8)/1),bob=Math.round(Math.sin(T*WQ.boss)*3);ctx.globalAlpha=.9*a;ctx.drawImage(A.BOSS,-18,186+bob,116,92);
      ctx.fillStyle=Math.sin(T*WQ.eye)>0?'#ff2a4a':'#ff6a7a';ctx.globalAlpha=a;ctx.fillRect(16,232+bob,14,6);ctx.fillRect(50,232+bob,14,6);
      ctx.fillStyle='#ffd0d8';ctx.fillRect(20,234+bob,6,2);ctx.fillRect(54,234+bob,6,2);ctx.globalAlpha=1;}
    if(fin){const k=Math.min(1,fin.t/.55),a=fin.t<.9?1:Math.max(0,1-(fin.t-.9)/.4);drawGroundCircle(14+k*30,a);}
    monsters.forEach(m=>pixEllipse(m.x,m.y,7*m.sc,2*m.sc,'rgba(10,4,30,.4)',m.sc));
    pixEllipse(hero.x,hero.y,12,3,'rgba(10,4,30,.45)',2);
    const ents=monsters.map(m=>({y:m.y,m}));ents.push({y:hero.y+.5,h:1});ents.sort((a,b)=>a.y-b.y);
    ents.forEach(e=>e.h?drawHero(st):drawMonster(e.m));
    coins.forEach(drawCoin);
    bullets.forEach(b=>{const d=Math.hypot(b.vx,b.vy),ux=b.vx/d,uy=b.vy/d;thick(b.x-ux*8,b.y-uy*8,b.x-ux*3,b.y-uy*3,2,'#ff9a1a');thick(b.x-ux*3,b.y-uy*3,b.x,b.y,2,'#fff3a0');ctx.fillStyle='#fff';ctx.fillRect(Math.round(b.x)-1,Math.round(b.y)-1,2,2);});
    orbs.forEach(o=>{starShape(o.x,o.y,Math.floor(o.rot)%2?4:3,'#ff6ac8','#ffffff');ctx.fillStyle='#fff3a0';ctx.fillRect(Math.round(o.x)-1,Math.round(o.y)-1,3,3);});
    bolts.forEach(drawBolt);exps.forEach(drawExp);
    parts.forEach(p=>{ctx.globalAlpha=Math.min(1,p.life/p.max*1.6);ctx.fillStyle=p.col;ctx.fillRect(Math.round(p.x),Math.round(p.y),p.size,p.size);});ctx.globalAlpha=1;
    ctx.restore();
    ctx.drawImage(A.vign,0,0);
    if(bflash>0){ctx.fillStyle=`rgba(170,225,255,${(reduce?.3:1)*bflash*.5})`;ctx.fillRect(0,0,W,H);}
    if(flash>0){ctx.fillStyle=`rgba(255,255,255,${Math.min(reduce?.35:1,flash)})`;ctx.fillRect(0,0,W,H);}
    drawLogo();drawTap();
    if(T<.6){ctx.fillStyle=`rgba(8,4,24,${1-T/.6})`;ctx.fillRect(0,0,W,H);}
  }

  function frame(ts){if(!alive)return;const dt=Math.min(.05,last?(ts-last)/1000:0);last=ts;update(dt);draw();raf=requestAnimationFrame(frame);}
  function restart(skipIntro){reset();if(skipIntro)for(let i=0;i<INTRO*60;i++)update(1/60);last=0;}
  const onVis=()=>{last=0;};
  const onClick=()=>{if(opts.onTap)opts.onTap();};
  canvas.addEventListener('click',onClick);document.addEventListener('visibilitychange',onVis);
  ctx.fillStyle='#0b0820';ctx.fillRect(0,0,W,H);

  const fontsLoaded=(global.document&&document.fonts)?Promise.race([
    Promise.all([document.fonts.load('30px "Dela Gothic One"','ドットラッシュ！'),document.fonts.load('8px "Press Start 2P"','TAP')]),
    new Promise(r=>setTimeout(r,2500))]).catch(()=>{}):Promise.resolve();
  const ready=fontsLoaded.then(()=>{logo=buildLogo();restart(!!opts.skipIntro);if(auto&&alive)raf=requestAnimationFrame(frame);});

  return {
    ready,
    restart,
    /** 'intro' | 'loop' */
    get phase(){return T<INTRO?'intro':'loop';},
    get time(){return T;},
    step(dt){update(dt);},render(){draw();},
    destroy(){alive=false;cancelAnimationFrame(raf);canvas.removeEventListener('click',onClick);document.removeEventListener('visibilitychange',onVis);},
  };
}
global.DotRushTitle={create,INTRO,LOOP,LOGO_T,WIDTH:W,HEIGHT:H};
})(typeof window!=='undefined'?window:globalThis);
