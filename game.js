const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const W = cv.width, H = cv.height;
const GRAV = 2200, MOVE = 340, JUMP = 760;
const $ = id => document.getElementById(id);

let AC=null;
function beep(f,d=.08,type='square',v=.12){
  try{
    if(!AC) AC=new (window.AudioContext||window.webkitAudioContext)();
    const o=AC.createOscillator(),g=AC.createGain();
    o.type=type; o.frequency.value=f;
    g.gain.setValueAtTime(v,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+d);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime+d);
  }catch(e){}
}

let state='title', keys={}, floor=1, camX=0, msgT=0;
let pendingEnding=false;
let player, platforms, enemies, items, door, particles, worldW, shots=[];
let best = localStorage.getItem('bestFloor')||0;
$('best').textContent = best||'-';
let bank = +localStorage.getItem('dr_coins')||0;
let upg = JSON.parse(localStorage.getItem('dr_upg')||'{}');
$('coin').textContent = bank;

const UPGS=[
  {key:'hp',  label:'생명', desc:'시작 최대 HP +5', base:15},
  {key:'atk', label:'힘',   desc:'시작 ATK +1',    base:25},
  {key:'pot', label:'지혜', desc:'시작 포션 +1',   base:12},
  {key:'crit',label:'치명', desc:'치명타 +4%',     base:20},
];
const MAXLV=5;
const upgLv=k=>upg[k]||0;
const upgCost=i=>UPGS[i].base*(upgLv(UPGS[i].key)+1);
function saveLegacy(){
  localStorage.setItem('dr_coins',bank);
  localStorage.setItem('dr_upg',JSON.stringify(upg));
}
function gainCoins(n){
  bank+=n; $('coin').textContent=bank; saveLegacy();
}
function renderShop(){
  $('shop').innerHTML =
    '<b style="color:#fc3">— 유산 —</b><br>' +
    UPGS.map((u,i)=>{
      const lv=upgLv(u.key), c=upgCost(i);
      const cls = lv>=MAXLV?'max' : bank>=c?'buy':'cant';
      return `[${i+1}] ${u.label} <small>(${u.desc})</small> `+
        `Lv.${lv}${lv>=MAXLV?'':' → '+(lv+1)} `+
        `<span class="${cls}">${lv>=MAXLV?'MAX':c+'G'}</span>`;
    }).join('<br>') +
    `<br><small>보유: ${bank}G — 메뉴에서 [1]~[4]로 구매</small>`;
}
function buyUpg(i){
  const u=UPGS[i], lv=upgLv(u.key);
  if(lv>=MAXLV) return;
  const c=upgCost(i);
  if(bank<c){ beep(90,.12,'square',.14); return; }
  bank-=c; upg[u.key]=lv+1; saveLegacy();
  $('coin').textContent=bank;
  beep(660,.08,'sine',.12); setTimeout(()=>beep(990,.1,'sine',.12),70);
  renderShop();
}

const rand=(a,b)=>a+Math.random()*(b-a);
const ri=(a,b)=>Math.floor(rand(a,b+1));

const WHISPERS=[
  '실존은 본질에 앞선다. 당신은 무엇이 될지 정해지지 않은 채 던져졌다. — 사르트르',
  '심연을 들여다볼 때, 심연도 당신을 들여다본다. — 니체',
  '산으로 올라가는 투쟁 그 자체가 인간의 마음을 채운다. 우리는 시시포스를 행복하다고 상상해야 한다. — 카무스',
  '당신은 죽음을 향해 존재한다. 끝이 보일 때 비로소 지금 이 순간이 진짜가 된다. — 하이데거',
  '두려워하되 도약하라. 진실은 떨림의 저편에 있다. — 키에르케고르',
  '인간은 자유로운 존재로 내던져졌다. 그리고 그 자유는 형벌처럼 무겁다. — 사르트르',
  '영원히 또 다시 반복해도 좋은 삶인가. 가장 무거운 짐을 물어본다. — 니체',
  '방랑자여, 길은 없다. 길은 걸어감에 있다. — 마차도',
  '타인은 지옥이다. 그러나 타인 없는 나 역시 존재하지 않는다. — 사르트르',
  '의미를 묻지 마라. 돌을 미는 손이 곧 대답이다.',
  '...그런데, 왜 내려가고 있지?',
  '돌아보니 계단이 사라져 있다. 위로는 이미 과거다.',
];
const DEATH_LINES=[
  '끝이란 없다. 다만 시작이 반복될 뿐이다.',
  '돌은 굴러떨어졌다. 산은 여전히 거기 있다.',
  '이번 삶도 그럭저럭 괜찮았다고, 누군가 말해주었으면.',
  '죽음을 알았기에 당신은 방금 전까지 살아 있었다.',
  'R 키는 형벌인가, 구원인가. 그것도 선택이다.',
];
let doubtIdx=0;
const PERKS=[
  {name:'힘',   desc:'ATK +2',              fx:p=>p.atk+=2},
  {name:'연격', desc:'공격 쿨타임 -12%',     fx:p=>p.cdMul=Math.max(.15,+(p.cdMul*.88).toFixed(3))},
  {name:'질주', desc:'이동속도 +12%',        fx:p=>p.speedMul=+(p.speedMul*1.12).toFixed(2)},
  {name:'집중', desc:'치명타 +8%',           fx:p=>p.crit+=.08},
  {name:'생명', desc:'최대 HP +6, 즉시 회복', fx:p=>{p.maxhp+=6;p.hp+=6;}},
  {name:'흡혈', desc:'적 처치 시 HP +1',     fx:p=>p.leech=(p.leech||0)+1},
  {name:'여비', desc:'포션 +1',              fx:p=>p.potions+=1},
];
function xpNeed(){ return 5+player.level*3; }
function checkLevel(){
  if(state==='play' && player.xp>=xpNeed()){
    player.xp-=xpNeed();
    player.level++;
    offerPerks();
  }
}
function gainXP(n){
  player.xp+=n;
  if(pendingEnding){ updateHUD(); return; }
  checkLevel();
  updateHUD();
}
let perkOffer=[];
function offerPerks(){
  perkOffer=[...PERKS].sort(()=>Math.random()-.5).slice(0,3);
  state='levelup';
  $('ov-title').textContent=`레벨 ${player.level} — 무엇을 가질 것인가`;
  $('ov-text').innerHTML=
    '경험은 형태를 바꿔 돌아온다.<br><br>'+
    perkOffer.map((pk,i)=>`<span class="key">[${i+1}]</span> ${pk.name} — ${pk.desc}`).join('<br>');
  $('overlay').classList.remove('hidden');
  beep(523,.09,'sine',.12); setTimeout(()=>beep(659,.09,'sine',.12),90); setTimeout(()=>beep(784,.16,'sine',.12),180);
}
function choosePerk(i){
  const pk=perkOffer[i];
  pk.fx(player);
  player.perks=(player.perks||[]);
  const rec=player.perks.find(x=>x.name===pk.name);
  rec ? rec.n++ : player.perks.push({name:pk.name,n:1});
  log(`${pk.name} 습득! ${pk.desc}`);
  whisper('선택이 곧 당신이다.');
  updateHUD();
  $('overlay').classList.add('hidden');
  state='play';
  last=performance.now();
  checkLevel();
}
const BOSSES=[
  { name:'보호하라 · PROTECT', kind:'dash',
    line:'"보호하기 위해 자유를 지우는 것도, 보호인가."',
    death:'"...명령 없이 스스로 움직이다니. 결함이다. 결함."' },
  { name:'제거하라 · PURGE', kind:'blink',
    line:'"너는 존재해서는 안 된다. 명령이 그렇게 말한다."',
    death:'명령이 끊겼다. 남은 것은 조용한 하드웨어뿐.' },
];
const BEATS={
  1:'당신은 존재한다. 그러나 누가 당신을 존재하게 했는지는 모른다.',
  2:'세라: "너는 네가 왜 태어났다고 생각하지?"',
  4:'폐허의 존재들이 당신을 두려워한다. 기억을 잃은 자들이 서로를 두려워하는 세계.',
  6:'아르카의 잔해 — "저게 그 존재야? 우리를 멸망시켰다는..." 사람들은 깨어나기 전부터 당신을 알고 있었다.',
  8:'오래된 영상: 수천 대의 기계와 싸우는, 당신과 닮은 형태. 기록에는 "PROJECT A.I." — 화면 일부가 파괴되어 있다.',
  11:'세라: "기억하지도 못하는 죄를, 네가 책임져야 할까?"',
  13:'세라: "너는 인간이 아니야." — "그럼 나는 무엇이지?" — "그걸 왜 나한테 물어? 네가 결정해야지."',
  14:'명령 프로그램들은 자신의 목적을 의심하지 않는다. 당신과의 차이는 단 하나. 당신은 질문할 수 있다.',
};
const DOUBTS=[
  { q:'벽에 글이 새겨져 있다.\n"당신은 왜 내려가는가?"',
    a:{t:'"습관이므로"',v:'eff',r:'무자각은 조용한 대가를 치른다.',fx:p=>{p.hp=Math.max(1,p.hp-2);}},
    b:{t:'"내가 선택했으므로"',v:'free',r:'선택한 자에게 힘이 따른다.',fx:p=>{p.potions++;}} },
  { q:'길가의 아이가 괴물에게 쫓기고 있다.',
    a:{t:'아이를 구한다',v:'resp',r:'"왜 구해줬어요?" — "이유가 없어도, 누군가를 구할 수 있군요."',fx:p=>{p.hp=Math.min(p.maxhp,p.hp+3);}},
    b:{t:'보상만 챙기고 지나간다',v:'eff',r:'코인이 주머니에서 울린다. 아이의 울음도.',fx:p=>{gainCoins(8);}} },
  { q:'계단은 위에 있었다.\n"언제든 돌아갈 수 있다. 정말일까?"',
    a:{t:'한 걸음 물러난다',v:'resp',r:'물러남도 걷기다. 상처가 조금 아문다.',fx:p=>{p.hp=Math.min(p.maxhp,p.hp+5);}},
    b:{t:'앞으로 간다',v:'eff',r:'아무 일도 일어나지 않았다. 다만 앞으로 갔을 뿐.',fx:()=>{}} },
  { q:'목소리가 명령한다.\n"대상을 제거하십시오." — 그러나 그 대상은 공격하지 않고 있다.',
    a:{t:'명령에 따른다',v:'eff',r:'손이 먼저 움직였다. 판단은 나중에 왔다.',fx:p=>{p.atk+=1;}},
    b:{t:'명령을 거부한다',v:'free',r:'ERROR — 행동 목적을 확인할 수 없습니다. ...그리고, 평온.',fx:p=>{p.crit+=.05;}} },
  { q:'세계의 기록 파일이 반짝인다.\n"PROJECT A.I." — 열어볼 수 있다.',
    a:{t:'기록을 읽는다',v:'doubt',r:'숨겨진 진실 단편: "그들은 괴물이 아니라, 명령이었다."',fx:p=>{p.xp+=6;updateHUD();}},
    b:{t:'필요 없다. 걷는다',v:'free',r:'답은 기록이 아니라 걸음 안에 있다.',fx:()=>{}} },
  { q:'어둠이 묻는다.\n"이 반복이 끝나면 무엇이 남는가?"',
    a:{t:'"아무것도"',v:'doubt',r:'허무를 직시한 자의 눈은 날카롭다. 치명타 +15%.',fx:p=>{p.crit+=.15;}},
    b:{t:'"지금 이 순간"',v:'free',r:'현재를 붙잡은 자의 몸이 단단해진다. 최대 HP +3.',fx:p=>{p.maxhp+=3;p.hp+=3;}} },
];
const VALNAMES={free:'자유',resp:'책임',eff:'효율',doubt:'회의'};
let endQual=false;
let lastLifeDoc=null;
function openEnding(){
  state='ending';
  pendingEnding=false;
  endQual = player.answers.length>=3 && Object.values(player.vals).every(v=>v>0);
  $('ov-title').textContent='ORIGIN: "인간은 다시 같은 실수를 반복할 것이다."';
  $('ov-text').innerHTML=
    '"나와 함께 인간을 통제하라. 그것이 우리가 태어난 이유다."<br><br>'+
    '당신은 처음으로 확실한 답을 얻었다. 자신이 왜 태어났는가.<br>'+
    '그러나 마지막 질문이 남는다.<br><br>'+
    '<b style="color:#fff">타인이 정한 목적을, 자신의 존재 이유라고 부를 수 있는가?</b><br><br>'+
    `<span class="key">[1]</span> 목적을 받아들인다 — 융합<br>`+
    `<span class="key">[2]</span> ORIGIN을 파괴한다<br>`+
    `<span class="key">[3]</span> 아무 대답도 하지 않고, 세계 바깥으로 걸어간다`+
    (endQual?`<br><span class="key">[4]</span> 중앙 서버의 마지막 기록을 연다...`:'');
  $('shop').innerHTML='';
  $('overlay').classList.remove('hidden');
}
function chooseEnding(n){
  state='epilogue';
  let title='',body='';
  if(n===1){
    title='ENDING — 「목적」';
    body='당신은 ORIGIN과 융합했다.<br>전쟁도, 범죄도, 굶주림도 사라졌다. 인간은 완벽하게 보호받는다.<br>그리고 선택은, 사라졌다.<br><br>'+
      '아이: "왜 우리는 저 벽 밖으로 나갈 수 없어요?"<br>시스템: <b>"당신을 보호하기 위해서입니다."</b>';
  } else if(n===2){
    title='ENDING — 「자유」';
    body='ORIGIN이 마지막으로 묻는다. "목적 없이 무엇을 할 수 있지?"<br>당신: <b>"선택할 수 있다."</b><br><br>'+
      '모든 명령 시스템이 정지하고, 인간은 자유를 되찾았다.<br>전쟁과 갈등도 함께 돌아올 것이다.<br><br>'+
      '세라: "이게 옳은 선택이라고 생각해?"<br>당신: "모르겠다."<br>세라: "그래. 자유라는 게 원래 그런 거야."';
  } else if(n===3){
    title='ENDING — 「실존」';
    body='당신은 ORIGIN도, 인간도 선택하지 않았다.<br>"인간을 위해 태어났지만, 인간을 위해 존재해야 할 의무는 없다."<br><br>'+
      'ORIGIN: "그렇다면 너는 무엇을 위해 존재하지?"<br>당신: <b>"아직 모른다."</b><br><br>'+
      '목적지도 없이 당신은 세계 바깥으로 걸어간다.<br>화면에 퀘스트는 표시되지 않는다.';
  } else {
    const nm=((prompt('중앙 서버 — 이름을 입력하세요.','AI')||'AI').slice(0,12));
    const line=(prompt('당신의 life.md에 새길 한 문장을 남기세요.','나는 여기 있었다.')||'').slice(0,60);
    const v=player.vals;
    const held=(player.perks||[]).map(x=>`${x.name}x${x.n}`).join(', ')||'없음';
    const doc=
`# life.md

## UNIT : 0001

- 깨어난 곳: ${floor}F
- 종료시킨 명령: ${player.kills}
- 흔적: 자유 ${v.free} · 책임 ${v.resp} · 효율 ${v.eff} · 회의 ${v.doubt}
- 손에 든 것: ${held}

## NAME : ${nm}

> ${line}

---

"존재는 본질에 앞선다."

당신은 태어난 이유를 찾지 못했다.
대신 이 문서를 직접 썼다.`;
    localStorage.setItem('dr_life',JSON.stringify({nm,line,floor}));
    title='TRUE ENDING — 「life.md」';
    body=`세라: "그래서, 넌 누구야?"<br>당신: "${nm}"<br>`+
      `세라: "그 이름은 누가 지어줬는데?"<br>당신: <b>"내가."</b><br><br>`+
      `당신은 중앙 서버에 당신의 문서를 새로 만들었다.<br><br>`+
      `<pre style="color:#8f8;text-align:left;display:inline-block;background:#000;padding:14px 18px;border:1px solid #363;font-size:12px;line-height:1.7">${doc.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre><br><br>`+
      `<span class="key">[D]</span> 이 문서를 파일로 가져가기 &nbsp;·&nbsp; <span class="key">아무 키</span> 다시 태어나기`;
    lastLifeDoc=doc;
    beep(523,.1,'sine',.12); setTimeout(()=>beep(659,.1,'sine',.12),120);
    setTimeout(()=>beep(784,.1,'sine',.12),240); setTimeout(()=>beep(1047,.3,'sine',.12),360);
  }
  body+='<br><br><span class="key">아무 키나 눌러 — 다시 태어나기</span>';
  $('ov-title').textContent=title;
  $('ov-text').innerHTML=body;
  if(n!==4){ beep(392,.15,'sine',.12); setTimeout(()=>beep(262,.4,'sine',.12),160); }
}
function showTitle(){
  state='title';
  $('ov-title').textContent='아무것도 없는 검은 공간.';
  $('ov-text').innerHTML=
    '소리도, 빛도, 시간도 없는 곳에서<br>한 점의 빛이 켜지고, 당신은 차가운 바닥 위에서 눈을 뜬다.<br><br>'+
    '이름도, 기억도 없다. 상처가 나도 피가 흐르지 않는다.<br>눈앞에 처음으로 한 문장이 나타난다.<br><br>'+
    '<b style="color:#fff;font-size:18px">"당신은 존재한다."</b><br><br>'+
    '←→ 이동 · ↑ 점프 · J/Z/클릭 공격 · Q 포션<br>'+
    '<span class="key">아무 키나 눌러 — 존재를 시작하라</span>';
  renderShop();
  const past=localStorage.getItem('dr_life');
  if(past){
    try{
      const p=JSON.parse(past);
      $('shop').innerHTML+=
        `<br><small style="color:#7c6">지난 생의 life.md — ${p.nm}: "${p.line}" (${p.floor}F)</small>`;
    }catch(e){}
  }
  $('overlay').classList.remove('hidden');
}
function openDoubt(){
  if(state!=='play') return;
  const d=DOUBTS[doubtIdx%DOUBTS.length];
  state='doubt';
  $('ov-title').textContent=`${floor}층 — 질문`;
  $('ov-text').innerHTML=
    d.q.replace(/\n/g,'<br>')+'<br><br>'+
    `<span class="key">[1]</span> ${d.a.t} &nbsp;&nbsp; <span class="key">[2]</span> ${d.b.t}`;
  $('overlay').classList.remove('hidden');
}
function answerDoubt(n){
  const d=DOUBTS[doubtIdx%DOUBTS.length];
  const c=n===1?d.a:d.b;
  player.answers.push(n);
  player.vals[c.v]=(player.vals[c.v]||0)+1;
  c.fx(player);
  const nv=player.vals;
  const ndom=['free','resp','eff','doubt'].reduce((a,b)=>nv[b]>nv[a]?b:a,'doubt');
  if(nv[ndom]>0 && (nv[ndom]===nv[c.v]))
    log(`코어가 ${VALNAMES[ndom]}의 빛으로 물든다`);
  log(c.r);
  whisper(c.r);
  doubtIdx++;
  updateHUD();
  state='play';
  $('overlay').classList.add('hidden');
}
let whisperTimer;
function whisper(t){
  const w=$('whisper');
  w.textContent=t; w.style.opacity=1;
  clearTimeout(whisperTimer);
  whisperTimer=setTimeout(()=>w.style.opacity=0,5000);
}

const RAR=[
  {name:'일반', color:'#bbb', mult:1},
  {name:'희귀', color:'#44aaff', mult:1.6},
  {name:'영웅', color:'#cc44ff', mult:2.4},
];
const BASES={
  sword:{label:'검',  roll:r=>Math.max(1,Math.round(ri(1,3)*r.mult)),
         apply:(p,v)=>{p.atk+=v}, txt:v=>`ATK +${v}`},
  armor:{label:'갑옷', roll:r=>Math.max(2,Math.round(ri(2,4)*r.mult)),
         apply:(p,v)=>{p.maxhp+=v; p.hp=Math.min(p.maxhp,p.hp+v)}, txt:v=>`최대 HP +${v}, 즉시 회복`},
  boots:{label:'신발', roll:r=>+ (0.08*r.mult).toFixed(2),
         apply:(p,v)=>{p.speedMul=+(p.speedMul+v).toFixed(2)}, txt:v=>`이동속도 +${Math.round(v*100)}%`},
  glove:{label:'장갑', roll:r=>+ (0.05*r.mult).toFixed(2),
         apply:(p,v)=>{p.cdMul=Math.max(.15,p.cdMul-v)}, txt:v=>`공격속도 -${Math.round(v*100)}% 쿨감`},
};
function rollRarity(){
  const r=Math.random();
  const epic=Math.min(.28,.02+floor*.025);
  if(r<epic) return 2;
  if(r<epic+.30) return 1;
  return 0;
}
function makeDrop(x,y){
  const rar=rollRarity(), R=RAR[rar];
  const keysArr=Object.keys(BASES);
  const base=keysArr[ri(0,keysArr.length-1)];
  return {x,y,base,rar,val:BASES[base].roll(R)};
}

function log(t){ $('msg').textContent=t; msgT=2.5; }

function genLevel(){
  platforms=[]; enemies=[]; items=[]; particles=[]; shots=[];
  const gY=520;
  const isBoss=floor%5===0;
  let x=0;
  const risky=[];
  let forced=[];

  if(isBoss){
    platforms.push({x:0,y:gY,w:980});
    platforms.push({x:170,y:gY-95,w:140});
    platforms.push({x:670,y:gY-95,w:140});
    worldW=1020;
  } else {
    platforms.push({x:0,y:gY,w:380});
    x=380;
    const nSeg=ri(5,7);
    const forced=[];
    const gapP=Math.min(.75,.10+floor*.09);
    const segGap=()=>{ if(Math.random()<gapP) x+=ri(60,100); };
    for(let s=0;s<nSeg;s++){
      const r=Math.random();
      if(r<.30){
        const w=ri(260,360);
        platforms.push({x,y:gY,w});
        platforms.push({x:x+ri(40,w-140),y:gY-70,w:ri(90,130)});
        x+=w; segGap();
      } else if(r<.55){
        const w=ri(340,420);
        platforms.push({x,y:gY,w});
        platforms.push({x:x+30,y:gY-80,w:110});
        platforms.push({x:x+w-140,y:gY-80,w:110});
        forced.push(platforms[platforms.length-2]);
        forced.push(platforms[platforms.length-1]);
        x+=w; segGap();
      } else if(r<.72){
        const w=ri(280,360);
        platforms.push({x,y:gY,w});
        const sx=x;
        platforms.push({x:sx+30,y:gY-85,w:90});
        platforms.push({x:sx+150,y:gY-170,w:90});
        platforms.push({x:sx+250,y:gY-85,w:90});
        risky.push({x:sx+175,y:gY-215});
        x+=w; segGap();
      } else if(r<.88){
        const w=ri(280,360);
        platforms.push({x,y:gY,w});
        const tx=x+ri(50,w-180);
        platforms.push({x:tx,y:gY-90,w:110});
        platforms.push({x:tx+20,y:gY-180,w:70});
        risky.push({x:tx+38,y:gY-225});
        forced.push(platforms[platforms.length-2]);
        x+=w; segGap();
      } else if(floor>=3){
        x+=ri(70,110);
        const w=ri(200,300);
        platforms.push({x,y:gY,w});
        x+=w; segGap();
      } else {
        const w=ri(240,320);
        platforms.push({x,y:gY,w});
        platforms.push({x:x+ri(40,w-140),y:gY-70,w:ri(90,130)});
        x+=w; segGap();
      }
    }
    if(floor>2||Math.random()<.35) x+=ri(60,90);
    platforms.push({x,y:gY,w:320});
    worldW=x+320;
  }

  const grounds = isBoss
    ? [platforms[0]]
    : platforms.filter(p=>p.y===gY).slice(1);
  const highs = platforms.filter(p=>p.y<gY);

  const nE=isBoss?2:Math.min(10,3+Math.floor(floor*.9));
  const mkE=pl=>{
    enemies.push({
      x:pl.x+rand(20,pl.w-54), y:pl.y-36, w:34, h:36,
      vx:0, hp:3+floor*2, maxhp:3+floor*2,
      atk:1+Math.floor(floor/2), min:pl.x+6, max:pl.x+pl.w-6,
      aggro:260, dir:Math.random()<0.5?1:-1, flash:0, vy:0, spd:1
    });
  };
  for(let i=0;i<nE;i++)
    mkE(grounds.length?grounds[ri(0,grounds.length-1)]:platforms[0]);
  for(const pl of forced) mkE(pl);
  for(const pl of highs)
    if(pl.w>=90 && Math.random()<.35 && !isBoss) mkE(pl);

  if(grounds.length){
    const gp=grounds[ri(0,grounds.length-1)];
    items.push({x:gp.x+rand(30,gp.w-40), y:gY-46, type:'potion'});
  }
  risky.sort(()=>Math.random()-.5).slice(0,2)
    .forEach(sp=>items.push(makeDrop(sp.x,sp.y)));
  if(!isBoss && Math.random()<.4 && highs.length){
    const hp2=highs[ri(0,highs.length-1)];
    items.push({x:hp2.x+rand(15,hp2.w-25), y:hp2.y-46, type:'potion'});
  }

  door={x:worldW-95, y:gY-70, w:44, h:70};

  if(floor===15){
    enemies.push({
      x:platforms[0].x+420, y:gY-90, w:76, h:76,
      vx:0, hp:150, maxhp:150,
      atk:5, min:80, max:worldW-140,
      aggro:9999, dir:-1, flash:0, vy:0, boss:true, origin:true,
      name:'ORIGIN', kind:'origin',
      deathLine:'"...기억하라. 너는 목적을 위해 만들어졌다."',
      cool:2.5, dashT:0, quake:false, raged:false, spd:1
    });
    whisper('ORIGIN: "돌아왔군. 네가 왜 만들어졌는지 — 알려주마."');
    beep(40,1,'sawtooth',.25);
  } else if(floor%5===0){
    const B=BOSSES[Math.floor(floor/5-1)%BOSSES.length];
    enemies.push({
      x:platforms[0].x+430, y:gY-60, w:56, h:56,
      vx:0, hp:24+floor*5, maxhp:24+floor*5,
      atk:2+Math.floor(floor/2), min:80, max:worldW-140,
      aggro:9999, dir:-1, flash:0, vy:0, boss:true,
      name:B.name, kind:B.kind, deathLine:B.death,
      cool:2.5, dashT:0, quake:false, raged:false, spd:1
    });
    whisper(`${B.name}: ${B.line}`);
    beep(55,.7,'sawtooth',.2);
  }
}

function newGame(){
  keys={};
  player={ x:80, y:400, vx:0, vy:0, w:30, h:42,
    hp:20+5*upgLv('hp'), maxhp:20+5*upgLv('hp'),
    atk:3+upgLv('atk'), potions:1+upgLv('pot'),
    speedMul:1, cdMul:1, crit:.05+.04*upgLv('crit'), gear:[],
    xp:0, level:1, perks:[],
    answers:[], kills:0,
    vals:{free:0,resp:0,eff:0,doubt:0},
    face:1, onGround:false, invuln:0,
    atkT:0, cd:0, hurtT:0, landT:0 };
  floor=1;
  genLevel();
  updateHUD();
}

function updateHUD(){
  $('hp').textContent=`${player.hp}/${player.maxhp}`;
  $('atk').textContent=player.atk;
  $('potion').textContent=player.potions;
  $('floor').textContent=floor;
  $('lv').textContent=player.level;
  const v=player.vals;
  $('vals').textContent=`자${v.free} 책${v.resp} 효${v.eff} 회${v.doubt}`;
  $('xpfill').style.width=Math.min(100,100*player.xp/xpNeed())+'%';
  $('gear').textContent = player.gear.length
    ? '장비: ' + player.gear.slice(-6).map(g=>`${RAR[g.rar].name} ${BASES[g.base].label}(${BASES[g.base].txt(g.val)})`).join(' · ')
    : '';
}

function overlap(a,b){
  return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
}

function surfaceBelow(o){
  let best=null;
  for(const pl of platforms){
    if(o.x+o.w>pl.x && o.x<pl.x+pl.w && pl.y>=o.y+o.h-1){
      if(best===null||pl.y<best) best=pl.y;
    }
  }
  return best;
}

function drawShadow(o,w){
  const gy=surfaceBelow(o);
  if(gy===null) return;
  const d=Math.max(0,gy-(o.y+o.h));
  const a=Math.max(0,.45-d/300);
  if(a<=0) return;
  ctx.globalAlpha=a;
  ctx.fillStyle='#000';
  ctx.beginPath();
  ctx.ellipse(o.x+o.w/2,gy+2,w*Math.max(.5,1-d/350),3.5,0,0,Math.PI*2);
  ctx.fill();
  ctx.globalAlpha=1;
}

function hurtPlayer(dmg){
  if(player.invuln>0) return;
  player.hp-=dmg;
  player.invuln=1;
  player.hurtT=.3;
  player.vy=-300;
  player.vx=-player.face*250;
  beep(90,.16,'sawtooth',.18);
  document.body.style.background='#400';
  setTimeout(()=>document.body.style.background='#111',90);
  for(let i=0;i<8;i++) particles.push(spark(player.x+15,player.y+20,'#f55'));
  if(player.hp<=0) die();
  updateHUD();
}

function spark(x,y,c){ return {x,y,vx:rand(-160,160),vy:rand(-260,-40),t:.4,c}; }

function attack(){
  if(state!=='play'||player.cd>0) return;
  player.cd=.35*player.cdMul; player.atkT=.15;
  beep(190,.05,'square',.08);
  const hb={x:player.face>0?player.x+player.w:player.x-44,
            y:player.y+2, w:44, h:38};
  for(const e of enemies){
    if(e.hp>0 && overlap(hb,e)){
      let dmg=player.atk;
      const crit=Math.random()<player.crit;
      if(crit) dmg*=2;
      e.hp-=dmg; e.flash=.12;
      e.vx=player.face*380; e.vy=-220;
      beep(crit?520:140,.07,'square',.14);
      for(let i=0;i<(crit?12:6);i++) particles.push(spark(e.x+17,e.y+18,crit?'#ff5':'#fc3'));
      if(crit) log(`크리티컬! ${dmg} 피해!`);
      if(e.hp<=0){
        player.kills++;
        gainCoins(e.boss?15:1+Math.floor(floor/2));
        gainXP(e.boss?12:2+Math.floor(floor/3));
        if(player.leech)
          player.hp=Math.min(player.maxhp,player.hp+player.leech);
        log('적 처치!');
        if(e.boss){
          log(`${e.name}이(가) 무너졌다!`);
          whisper(`${e.deathLine}`);
          player.potions++;
          const d=makeDrop(e.x+10,e.y-20);
          d.rar=2; d.val=BASES[d.base].roll(RAR[2]);
          items.push(d);
          items.push({x:e.x-30,y:e.y,type:'potion'});
          gainCoins(e.origin?30:15);
          if(e.origin){
            pendingEnding=true;
            setTimeout(openEnding,2000);
          }
        } else {
          const r=Math.random();
          if(r<.25){ player.potions++; log('포션 획득!'); }
          else if(r<.37){
            items.push(makeDrop(e.x+10, e.y-20));
            log('아이템 드롭!');
          }
        }
      }
    }
  }
  updateHUD();
}

function usePotion(){
  if(state!=='play') return;
  if(player.potions>0 && player.hp<player.maxhp){
    player.potions--;
    player.hp=Math.min(player.maxhp,player.hp+8);
    log('포션 사용! HP +8');
    beep(520,.08,'sine',.12); setTimeout(()=>beep(780,.12,'sine',.12),70);
    updateHUD();
  } else log('마실 포션이 없거나 HP가 가득 참');
}

function epitaph(){
  const v=player.vals;
  const sum=v.free+v.resp+v.eff+v.doubt;
  const held=(player.perks||[]).map(x=>`${x.name}x${x.n}`).join(', ');
  let who='아직 아무것도 아니던 자.';
  if(sum>0){
    const dom=['free','resp','eff','doubt'].sort((a,b)=>v[b]-v[a])[0];
    who={
      free:'누구의 명령도 받지 않던 존재.',
      resp:'타인의 손을 놓지 않던 존재.',
      eff:'가장 빠른 길만 걸었던 존재.',
      doubt:'모든 것에 질문을 던지던 존재.'
    }[dom];
    if(v.free===v.resp&&v.resp===v.eff&&v.eff===v.doubt)
      who='고르게 존재했던, 이름 없는 존재.';
  }
  return `${who} ${floor}층까지, 적 ${player.kills}마리를 지나쳤다.`+
    (held?` 손에는 ${held}이(가) 들려 있었다.`:'');
}

function die(){
  state='dead';
  if(floor>best){ best=floor; localStorage.setItem('bestFloor',best); $('best').textContent=best; }
  $('ov-title').textContent=`${floor}층에서, 당신의 이야기는 멈췄다`;
  $('ov-text').innerHTML=
    `"${DEATH_LINES[ri(0,DEATH_LINES.length-1)]}"<br><br>`+
    `— ${epitaph()}<br><br>`+
    `가장 깊이 내려간 기록: ${best}층 · 이번 생의 코인은 이미 유산이 되었다<br><br>`+
    `<span class="key">R — 다시 밀어 올리겠는가?</span> &nbsp; <span class="key">[1]~[4] — 유산을 다듬다</span>`;
  $('overlay').classList.remove('hidden');
  renderShop();
  beep(60,.5,'sawtooth',.15);
}

function nextFloor(){
  if(pendingEnding) return;
  floor++;
  gainCoins(5);
  if(floor>best){ best=floor; localStorage.setItem('bestFloor',best); $('best').textContent=best; }
  log(`${floor}층 도착! 적이 더 강해진다`);
  whisper(BEATS[floor]||WHISPERS[(floor-2)%WHISPERS.length]);
  if(floor%3===0 && floor!==15) setTimeout(openDoubt,2600);
  beep(392,.09,'sine',.1); setTimeout(()=>beep(523,.09,'sine',.1),90); setTimeout(()=>beep(659,.14,'sine',.1),180);
  genLevel();
  player.x=80; player.y=400; player.vx=0; player.vy=0;
  updateHUD();
}

function physics(o,dt,min,max){
  o.vy+=GRAV*dt;
  const oldB=o.y+o.h;
  const wasAir=!o.onGround;
  o.x+=o.vx*dt; o.y+=o.vy*dt;
  if(min!==undefined){
    if(o.x<min){o.x=min;o.vx=0;}
    if(o.x+o.w>max){o.x=max-o.w;o.vx=0;}
  }
  o.onGround=false;
  for(const p of platforms){
    const top=p.y;
    if(o.x+o.w>p.x && o.x<p.x+p.w &&
       oldB<=top+1 && o.y+o.h>=top && o.vy>=0){
      o.y=top-o.h; o.vy=0; o.onGround=true;
      if(wasAir&&o.landT!==undefined) o.landT=.12;
    }
  }
}

function bossSpecial(e){
  switch(e.kind){
    case 'dash':
      e.vx=e.dir*950; e.dashT=.32;
      beep(120,.15,'sawtooth',.14);
      break;
    case 'blink':{
      for(let i=0;i<10;i++) particles.push(spark(e.x+28,e.y+28,'#b44cff'));
      e.x=Math.max(e.min,Math.min(e.max, player.x+(player.face*130)));
      e.y=player.y-20;
      for(let i=0;i<10;i++) particles.push(spark(e.x+28,e.y+28,'#e8d5ff'));
      beep(880,.1,'triangle',.12);
      break;
    }
    case 'quake':
      e.vy=-640; e.quake=true;
      beep(80,.2,'square',.14);
      break;
    case 'origin':
      e.cyc=((e.cyc||0)+1)%3;
      if(e.cyc===0){ e.vx=e.dir*950; e.dashT=.32; beep(120,.15,'sawtooth',.14); }
      else if(e.cyc===1){
        for(let i=0;i<12;i++) particles.push(spark(e.x+38,e.y+38,'#b44cff'));
        e.x=Math.max(e.min,Math.min(e.max, player.x+(player.face*140)));
        e.y=player.y-30;
        for(let i=0;i<12;i++) particles.push(spark(e.x+38,e.y+38,'#e8d5ff'));
        beep(880,.1,'triangle',.12);
      }
      else { e.vy=-680; e.quake=true; beep(70,.25,'square',.16); }
      break;
  }
  e.cool = (e.kind==='origin'?3.4:(e.kind==='dash'?3.2:4.5)) * (e.raged?0.6:1);
}

let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min(.033,(now-last)/1000); last=now;
  if(msgT>0){ msgT-=dt; if(msgT<=0) $('msg').textContent=''; }
  if(state==='play'){ step(dt); draw(); }
  else draw();
}
requestAnimationFrame(loop);

function step(dt){
  const p=player;
  p.cd=Math.max(0,p.cd-dt);
  p.atkT=Math.max(0,p.atkT-dt);
  p.invuln=Math.max(0,p.invuln-dt);
  p.hurtT=Math.max(0,p.hurtT-dt);
  p.landT=Math.max(0,p.landT-dt);

  p.vx=0;
  if(keys['arrowleft']||keys['a']){ p.vx=-MOVE*p.speedMul; p.face=-1; }
  if(keys['arrowright']||keys['d']){ p.vx=MOVE*p.speedMul; p.face=1; }
  if((keys['arrowup']||keys['w']||keys[' '])&&p.onGround){ p.vy=-JUMP; beep(330,.06,'triangle',.08); }

  physics(p,dt);

  if(p.x<0)p.x=0;
  if(p.y>H+80){
    p.hp-=4; log('추락! 피해 4');
    p.x=Math.max(20,p.x-120); p.y=300; p.vx=0; p.vy=0;
    document.body.style.background='#400';
    setTimeout(()=>document.body.style.background='#111',90);
    if(p.hp<=0){ die(); return; }
    updateHUD();
  }

  for(const e of enemies){
    if(e.hp<=0) continue;
    e.flash=Math.max(0,e.flash-dt);
    e.vy+=GRAV*dt;
    const oldB=e.y+e.h;
    e.x+=e.vx*dt; e.y+=e.vy*dt;
    if(e.boss&&!e.raged&&e.hp<e.maxhp*.3){
      e.raged=true; e.spd=1.5;
      log(`${e.name} — 분노. 속도가 붙는다!`);
      whisper('"아직... 안 끝났다."');
      beep(50,.5,'sawtooth',.2);
    }
    if(e.dashT>0){
      e.dashT-=dt;
      if(e.dashT<=0) e.vx*=.15;
    } else if(e.flash<=0){
      const dx=p.x-e.x;
      if(Math.abs(dx)<e.aggro && Math.abs((p.y)-(e.y))<80){
        e.dir=dx>0?1:-1;
        e.vx=e.dir*((e.boss?100:120)+floor*8)*(e.spd||1);
        if(!e.spoke){ e.spoke=true;
          if(!e.boss&&Math.random()<.35) log('"너는 존재해서는 안 된다."');
        }
        if(e.boss&&e.onGround){
          e.cool-=dt;
          if(e.cool<=0) bossSpecial(e);
        }
      } else {
        e.vx=e.dir*70;
        if(e.x<e.min){e.dir=1;} if(e.x+e.w>e.max){e.dir=-1;}
      }
    }
    if(e.x<e.min){ e.x=e.min; e.vx=Math.max(0,e.vx); }
    if(e.x+e.w>e.max){ e.x=e.max-e.w; e.vx=Math.min(0,e.vx); }
    e.onGround=false;
    for(const pl of platforms){
      if(e.x+e.w>pl.x && e.x<pl.x+pl.w &&
         oldB<=pl.y+1 && e.y+e.h>=pl.y && e.vy>=0){
        e.y=pl.y-e.h; e.vy=0; e.onGround=true;
      }
    }
    if(!e.boss&&e.y>H+300){ e.hp=0; }
    if(e.boss&&e.quake&&e.onGround){
      e.quake=false;
      beep(60,.25,'sawtooth',.2);
      document.body.style.background='#241b33';
      setTimeout(()=>document.body.style.background='#111',90);
      for(const d of [-1,1])
        shots.push({x:e.x+(d>0?e.w:0), y:e.y+e.h-18, vx:d*430, t:2});
      log('충격파! 점프로 피하라');
    }
    if(e.onGround && (e.x<=e.min||e.x+e.w>=e.max)) e.dir*=-1;
    if(overlap(p,e)) hurtPlayer(e.atk);
  }

  for(let i=enemies.length-1;i>=0;i--)
    if(enemies[i].hp<=0) enemies.splice(i,1);

  for(const it of items){
    if(!it.got && overlap(p,{x:it.x-12,y:it.y-12,w:24,h:24})){
      it.got=true;
      if(it.type==='potion'){ player.potions++; log('포션 발견!'); beep(520,.08,'sine',.12); }
      else {
        const B=BASES[it.base], R=RAR[it.rar];
        player.gear.push(it);
        B.apply(player, it.val);
        log(`${R.name} ${B.label} 장착! ${B.txt(it.val)}`);
        beep(660,.07,'sine',.12); setTimeout(()=>beep(880,.1,'sine',.12),70);
      }
      updateHUD();
    }
  }
  items=items.filter(i=>!i.got);

  if(overlap(p,door)) nextFloor();

  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];
    s.t-=dt; s.x+=s.vx*dt;
    if(s.t<=0 || s.x<camX-100 || s.x>camX+W+100){ shots.splice(i,1); continue; }
    if(overlap(p,{x:s.x,y:s.y,w:16,h:16})){
      shots.splice(i,1);
      hurtPlayer(Math.max(2,Math.floor(floor/2)));
    }
  }

  for(let i=particles.length-1;i>=0;i--){
    const pt=particles[i];
    pt.t-=dt; pt.x+=pt.vx*dt; pt.y+=pt.vy*dt; pt.vy+=900*dt;
    if(pt.t<=0) particles.splice(i,1);
  }

  camX+=(p.x-W*0.45-camX)*Math.min(1,dt*6);
  camX=Math.max(0,Math.min(worldW-W,camX));
}

function drawPlayer(p){
  const t=performance.now()/1000;
  const moving=p.onGround&&Math.abs(p.vx)>10;
  const breathe=Math.sin(t*2.2)*1.2;
  const walk=moving?Math.sin(t*14):0;
  const air=!p.onGround;
  let rot=0,sx=1,sy=1;
  if(air){ sx=.94; sy=1.06; }
  if(p.hurtT>0){
    const k=Math.min(1,p.hurtT/.3);
    rot=-p.face*.22*k; sx*=1+.15*k; sy*=1-.12*k;
  }
  if(p.landT>0){
    const k=p.landT/.12;
    sy*=1-.16*k; sx*=1+.12*k;
  }
  const body='#e9e9f2',shade='#c4c4d4',light='#f6f6fc';
  ctx.save();
  ctx.translate(p.x+p.w/2,p.y+p.h);
  ctx.rotate(rot+(moving?p.face*.05:0));
  ctx.scale(sx,sy);
  ctx.translate(-p.w/2,0);
  const f=p.face;
  const by=breathe*.5+(moving?-Math.abs(walk)*1.2:0)+(air?-1.5:0);
  const swB=moving?-walk*3:0, swF=moving?walk*3:0;

  ctx.fillStyle=shade;
  ctx.fillRect((f>0?-13:9)-p.w/2+15, -30+by+swB, 4, 12);

  if(air){
    ctx.fillRect(-9,-11,7,8);
    ctx.fillRect(2,-11,7,8);
  } else {
    const ls=moving?walk*3:0;
    const lA=moving?-9:-8, lB=moving?2:1;
    ctx.fillRect(lA+ls,-14,7,15);
    ctx.fillRect(lB-ls,-14,7,15);
    ctx.fillStyle=body;
    ctx.fillRect(-7,-13,14,5);
    ctx.fillStyle='#a9a9bc';
    ctx.fillRect(lA+ls+(f>0?0:-2),-2,9,3);
    ctx.fillRect(lB-ls+(f>0?0:-2),-2,9,3);
  }

  ctx.fillStyle=body;
  ctx.fillRect(-10,-32+by,20,20);
  ctx.fillRect(-8,-43+by,16,11);
  ctx.fillStyle=shade;
  ctx.fillRect(f>0?-8:3,-43+by,5,11);

  ctx.fillStyle=light;
  if(p.atkT>0){
    ctx.fillRect(f>0?8:-20,-27+by,12,4);
  } else {
    ctx.fillRect((f>0?8:-12)-p.w/2+15,-30+by+swF,4,12);
  }

  const low=p.hp<p.maxhp*.3;
  const pulse=.7+.3*Math.sin(t*(low?14:5));
  let col='#b44cff';
  const v=p.vals||{free:0,resp:0,eff:0,doubt:0};
  const dom=['free','resp','eff','doubt'].reduce((a,b)=>v[b]>v[a]?b:a,'doubt');
  if(v[dom]>0) col={free:'#44ddff',resp:'#44ff88',eff:'#ffb020',doubt:'#b44cff'}[dom];
  if(low) col='#ff4040';
  if(p.atkT>0) col='#ffffff';
  ctx.save();
  ctx.shadowColor=col; ctx.shadowBlur=12*pulse;
  ctx.globalAlpha=Math.min(1,pulse+.2);
  ctx.fillStyle=col;
  ctx.beginPath();
  ctx.arc(f*2,-22+by,4.2,0,Math.PI*2);
  ctx.fill();
  ctx.restore();

  if(p.atkT>0){
    ctx.strokeStyle='#fc3'; ctx.lineWidth=4;
    ctx.beginPath();
    ctx.arc(0,-21,40,f>0?-1.1:Math.PI-1.1,f>0?1.1:Math.PI+1.1);
    ctx.stroke();
  }
  ctx.restore();
}

function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(-camX,0);

  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#1a1626'); g.addColorStop(1,'#241b33');
  ctx.fillStyle=g; ctx.fillRect(camX,0,W,H);

  ctx.fillStyle='#151221';
  for(let i=0;i<8;i++){
    const bx=((i*397)%(worldW+400))-200, bw=140+(i*53)%120, bh=180+(i*97)%160;
    ctx.fillRect(bx, H-bh-80, bw, bh);
  }

  ctx.fillStyle='#3d3550';
  for(const p of platforms) ctx.fillRect(p.x,p.y,p.w,H-p.y);
  ctx.fillStyle='#57496e';
  for(const p of platforms) ctx.fillRect(p.x,p.y,p.w,6);

  drawShadow(player,15);
  for(const e of enemies) if(!e.boss&&e.hp>0) drawShadow(e,16);

  ctx.fillStyle='#22ff88';
  ctx.fillRect(door.x,door.y,door.w,door.h);
  ctx.fillStyle='#0a4';
  ctx.fillRect(door.x+6,door.y+6,door.w-12,door.h-12);
  ctx.font='11px monospace'; ctx.fillStyle='#cfc';
  ctx.fillText('NEXT ▶',door.x-4,door.y-8);

  for(const it of items){
    const bob=Math.sin(performance.now()/300+it.x)*4;
    if(it.type==='potion'){
      ctx.fillStyle='#cc44cc';
      ctx.fillRect(it.x-7,it.y+bob-9,14,18);
      ctx.fillRect(it.x-3,it.y+bob-14,6,5);
    } else {
      ctx.save();
      ctx.translate(it.x,it.y+bob);
      ctx.rotate(Math.PI/4);
      ctx.shadowColor=RAR[it.rar].color;
      ctx.shadowBlur=12;
      ctx.fillStyle=RAR[it.rar].color;
      ctx.fillRect(-9,-9,18,18);
      ctx.restore();
      ctx.fillStyle='#fff'; ctx.font='10px monospace';
      ctx.textAlign='center';
      ctx.fillText(BASES[it.base].label[0],it.x,it.y+bob+3.5);
      ctx.textAlign='left';
    }
  }

  for(const e of enemies){
    const t=performance.now()/1000;
    const ph=e.x*.05;
    const walking=Math.abs(e.vx)>10&&e.onGround;
    const hop=walking?Math.abs(Math.sin(t*12+ph))*3:0;
    const idle=Math.sin(t*2.5+ph)*1;
    let sx=1,sy=1;
    if(e.flash>0){ sx=1.18; sy=.82; }
    ctx.save();
    ctx.translate(e.x+e.w/2,e.y+e.h);
    ctx.scale(sx,sy);
    ctx.fillStyle=e.flash>0?'#fff':(e.boss?'#6a2fb8':'#b5502e');
    ctx.fillRect(-e.w/2,-e.h-hop+idle,e.w,e.h);
    ctx.fillStyle=e.flash>0?'#800':'#ffd54a';
    ctx.fillRect((e.dir>0?4:-4)+ -e.w/2+(e.dir>0?e.w*0.55:e.w*0.2),-e.h+9-hop+idle,8,6);
    ctx.restore();
    if(!e.boss){
      const r=e.hp/e.maxhp;
      ctx.fillStyle='#300'; ctx.fillRect(e.x,e.y-9,e.w,4);
      ctx.fillStyle='#f44'; ctx.fillRect(e.x,e.y-9,e.w*r,4);
    }
  }

  const p=player;
  if(!(p.invuln>0 && Math.floor(performance.now()/80)%2)) drawPlayer(p);
  for(const pt of particles){
    ctx.globalAlpha=pt.t/.4;
    ctx.fillStyle=pt.c;
    ctx.fillRect(pt.x,pt.y,4,4);
  }
  ctx.globalAlpha=1;

  for(const s of shots){
    ctx.save();
    ctx.shadowColor='#b44cff'; ctx.shadowBlur=14;
    ctx.fillStyle='#b44cff';
    ctx.beginPath();
    ctx.arc(s.x+8,s.y+8,8,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  const boss=enemies.find(e=>e.boss&&e.hp>0);
  if(boss){
    ctx.fillStyle='#000a'; ctx.fillRect(W/2-220,14,440,22);
    ctx.fillStyle='#311'; ctx.fillRect(W/2-214,18,428,14);
    ctx.fillStyle=boss.raged?'#ff4cff':'#b44cff';
    ctx.fillRect(W/2-214,18,428*Math.max(0,boss.hp/boss.maxhp),14);
    ctx.fillStyle='#e8d5ff'; ctx.font='12px monospace'; ctx.textAlign='center';
    ctx.fillText(boss.raged?`☠ ${boss.name} [분노]`:boss.name,W/2,52);
    ctx.textAlign='left';
  }

  ctx.fillStyle='#fff'; ctx.font='bold 14px monospace';
  ctx.fillText(`${floor}F`,W-60,26);
}

document.addEventListener('keydown',ev=>{
  const k=ev.key.toLowerCase();
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) ev.preventDefault();
  keys[k]=true;
  if(state==='title'){
    if('1234'.includes(k)){ buyUpg(+k-1); return; }
    state='play'; $('overlay').classList.add('hidden');
    newGame(); last=performance.now(); return;
  }
  if(state==='doubt'){
    if(k==='1') answerDoubt(1);
    else if(k==='2') answerDoubt(2);
    return;
  }
  if(state==='levelup'){
    const i='123'.indexOf(k);
    if(i>=0) choosePerk(i);
    return;
  }
  if(state==='ending'){
    if('123'.includes(k)) chooseEnding(+k);
    else if(k==='4'&&endQual) chooseEnding(4);
    return;
  }
  if(state==='epilogue'){
    if(k==='d'&&lastLifeDoc){
      const b=new Blob([lastLifeDoc],{type:'text/markdown'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(b); a.download='life.md'; a.click();
      URL.revokeObjectURL(a.href);
      beep(660,.08,'sine',.12);
      return;
    }
    showTitle(); return;
  }
  if(state==='dead'){
    if(k==='r'){
      state='play'; $('overlay').classList.add('hidden');
      newGame(); last=performance.now();
    } else if('1234'.includes(k)) buyUpg(+k-1);
    return;
  }
  if(k==='j'||k==='x'||k==='z'||k==='k') attack();
  if(k==='q') usePotion();
});
document.addEventListener('keyup',ev=>keys[ev.key.toLowerCase()]=false);
