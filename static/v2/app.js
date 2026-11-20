/* ==========================================================
   ValuePilot 客户套餐适配体检 —— 确定性计算引擎与应用逻辑
   全部金额由本文件公式产出，不写死任何结果
   ========================================================== */

const PKG = {
  A:{ id:'A', name:'跨境汇划综合服务', short:'A · 现行',
      fee:3800, spreadBps:32, depRate:0.85,
      tiers:[{upTo:200,price:45},{upTo:Infinity,price:32}],
      swift:{included:0,rate:120},
      gates:[{k:'bal',min:5000000,label:'日均存款 ≥ HKD 5,000,000'},
             {k:'cnt',min:200,label:'月均笔数 ≥ 200'}] },
  B:{ id:'B', name:'全球支付白金', short:'B · 候选',
      fee:2900, spreadBps:22, depRate:1.15,
      tiers:[{upTo:400,price:38},{upTo:Infinity,price:25}],
      swift:{included:500,rate:90},
      gates:[{k:'bal',min:12000000,label:'日均存款 ≥ HKD 12,000,000'},
             {k:'cnt',min:500,label:'月均笔数 ≥ 500'},
             {k:'fin',min:20000000,label:'绑定贸易融资 ≥ HKD 20,000,000'}] },
  C:{ id:'C', name:'弹性跨境组合', short:'C · 候选',
      fee:1600, spreadBps:38, depRate:0.55,
      tiers:[{upTo:300,price:55},{upTo:Infinity,price:28}],
      swift:{included:150,rate:150},
      gates:[{k:'bal',min:3000000,label:'日均存款 ≥ HKD 3,000,000'},
             {k:'cnt',min:150,label:'月均笔数 ≥ 150'}] }
};
const FIN_LIMIT = 22000000;
const IDS = ['A','B','C'];

function tierFee(tiers,n){
  let r=n,s=0,d=[];
  for(let i=0;i<tiers.length;i++){
    if(r<=0) break;
    const t=tiers[i];
    const take=Math.min(r, t.upTo===Infinity ? r : t.upTo-(i===0?0:tiers[i-1].upTo));
    if(take<=0) continue;
    s+=take*t.price; d.push({n:take,p:t.price}); r-=take;
  }
  return {sum:s,detail:d};
}
function checkGates(p,s){
  const res=[],fails=[];
  for(const g of p.gates){
    let v,ok;
    if(g.k==='bal'){v=s.bal;ok=s.bal>=g.min;}
    else if(g.k==='cnt'){v=s.cnt;ok=s.cnt>=g.min;}
    else {v=FIN_LIMIT;ok=FIN_LIMIT>=g.min;}
    res.push({label:g.label,val:v,min:g.min,ok,key:g.k});
    if(!ok) fails.push(g.label+'（实测 '+fmtShort(v)+(g.k==='cnt'?' 笔':'')+'，门槛 '+fmtShort(g.min)+'）');
  }
  return {res,fails,ok:fails.length===0};
}
function compute(p,s){
  const tf=tierFee(p.tiers,s.cnt);
  const billable=Math.max(0,s.cnt-p.swift.included);
  const swift=billable*p.swift.rate;
  const spread=s.amt*p.spreadBps/10000;
  const deposit=s.bal*p.depRate/100/12;
  return {fee:p.fee,remittance:tf.sum,tiers:tf.detail,swift,billable,spread,deposit,
          spreadBps:p.spreadBps,depRate:p.depRate,total:p.fee+tf.sum+swift+spread-deposit};
}
function evalAll(s){
  return IDS.map(id=>{const p=PKG[id],g=checkGates(p,s);return{id,p,g,c:g.ok?compute(p,s):null};});
}
const fmt=n=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt0=n=>Math.round(n).toLocaleString('en-US');
function fmtShort(n){
  const abs=Math.abs(n);
  if(abs>=1000000){
    const m=n/1000000;
    const s=Math.abs(m%1)<0.005 ? String(Math.round(m)) : m.toFixed(2).replace(/0$/,'');
    return s+'M';
  }
  if(abs>=1000) return Math.round(n/1000)+'K';
  return fmt0(n);
}
const money=n=>'HKD '+fmt0(n);

const PRESETS=[
  {id:'P1',name:'P1 当前实际',cnt:415,amt:18600000,bal:6150000,basis:'事实 · 2026-09 实测'},
  {id:'P2',name:'P2 历史同口径',cnt:320,amt:12800000,bal:9200000,basis:'事实 · 2025-09 实测'},
  {id:'P3',name:'P3 业务回落',cnt:190,amt:8400000,bal:6400000,basis:'假设 · 客户经理设定'},
  {id:'P4',name:'P4 余额上调',cnt:415,amt:18600000,bal:14500000,basis:'假设 · 单变量'},
  {id:'P5',name:'P5 余额+笔数',cnt:520,amt:18600000,bal:14500000,basis:'假设 · 双变量'}
];
const S={cnt:415,amt:18600000,bal:6150000,preset:'P1'};
const $=(s,r)=>(r||document).querySelector(s);
const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

/* ---------- 路由 ---------- */
const ROUTES={overview:'view-overview',report:'view-report',data:'view-data',management:'view-management'};
function go(route){
  if(!ROUTES[route]) route='overview';
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.route===route));
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===ROUTES[route]));
  if(location.hash!=='#'+route) history.replaceState(null,'','#'+route);
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('.nav-item').forEach(b=>b.onclick=()=>go(b.dataset.route));
window.addEventListener('hashchange',()=>go(location.hash.slice(1)));
if(location.hash.length>1) go(location.hash.slice(1));
$$('.mode-switch').forEach(b=>b.onclick=()=>{
  $$('.mode-switch').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  toast('已切换视图角色：'+b.textContent.trim());
});

let toastTimer;
function toast(msg){
  const t=$('#toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2400);
}
window.toastFn = toast;

/* ---------- Tab ---------- */
$$('.tab-btn').forEach(b=>b.onclick=()=>{
  $$('.tab-btn').forEach(x=>x.classList.remove('active'));
  $$('.tab-panel').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  $('#'+b.dataset.tab).classList.add('active');
});

/* ---------- 套餐比较 + 审计明细 + 资格校验 ---------- */
function renderCompare(){
  const rows=evalAll(S), ok=rows.filter(r=>r.g.ok);
  const best=ok.length?ok.reduce((a,b)=>a.c.total<b.c.total?a:b):null;
  $('#cmpBody').innerHTML=rows.map(r=>{
    if(!r.g.ok) return `<tr class="out"><td><b>${r.p.name}</b><div style="font-size:9px;color:#a0a0a5">${r.p.short}</div></td>
      <td><span class="pill red">未通过</span></td>
      <td class="num" colspan="6" style="color:#a0a0a5">不参与金额比较 — ${r.g.fails[0]}</td>
      <td class="num" style="color:#a0a0a5">—</td></tr>`;
    const c=r.c,d=best?c.total-best.c.total:0,isBest=best&&r.id===best.id;
    return `<tr class="${isBest?'win':''}"><td><b>${r.p.name}</b>${isBest?' <span class="pill green">最优</span>':''}</td>
      <td><span class="pill green">通过</span></td>
      <td class="num">${fmt0(c.fee)}</td><td class="num">${fmt0(c.remittance)}</td>
      <td class="num">${fmt0(c.swift)}<div style="font-size:8.5px;color:#aaa">${c.billable>0?c.billable+' 笔 × '+r.p.swift.rate:'含于套餐'}</div></td>
      <td class="num">${fmt0(c.spread)}<div style="font-size:8.5px;color:#aaa">${c.spreadBps} bps</div></td>
      <td class="num green">−${fmt0(c.deposit)}<div style="font-size:8.5px;color:#aaa">${c.depRate}% p.a.</div></td>
      <td class="num"><b>${fmt(c.total)}</b></td>
      <td class="num ${d>0?'red':'muted'}">${d>0?'+'+fmt0(d):'—'}</td></tr>`;
  }).join('');

  const sel=rows.find(r=>r.id==='A');
  if(sel&&sel.c){
    const c=sel.c,p=sel.p;
    const tierTxt=c.tiers.map(t=>`${t.n} 笔 × ${t.p}`).join('  +  ');
    $('#auditBody').innerHTML=`
      <tr><td>账户管理月费</td><td class="mono">固定</td><td class="num">—</td><td class="num">${fmt0(c.fee)}</td></tr>
      <tr><td>汇款手续费</td><td class="mono">阶梯累进</td><td class="num mono">${tierTxt}</td><td class="num">${fmt(c.remittance)}</td></tr>
      <tr><td>电报费</td><td class="mono">${p.swift.included>0?`(笔数 − ${p.swift.included}) × ${p.swift.rate}`:`${S.cnt} × ${p.swift.rate}`}</td><td class="num">${c.billable>0?c.billable+' 笔':'含于套餐'}</td><td class="num">${fmt(c.swift)}</td></tr>
      <tr><td>汇率点差成本</td><td class="mono">金额 × 点差 ÷ 10000</td><td class="num mono">${fmt0(S.amt)} × ${p.spreadBps} bps</td><td class="num">${fmt(c.spread)}</td></tr>
      <tr><td>存款收益（抵扣）</td><td class="mono">余额 × 年利率 ÷ 100 ÷ 12</td><td class="num mono">${fmt0(S.bal)} × ${p.depRate}%</td><td class="num green">−${fmt(c.deposit)}</td></tr>
      <tr class="tot-row"><td colspan="3">月度总成本 · 现行套餐 A</td><td class="num">${fmt(c.total)}</td></tr>`;
  }else{
    $('#auditBody').innerHTML=`<tr><td colspan="4" style="color:#a0a0a5">现行套餐 A 在当前情景下未通过资格，不进行金额计算。</td></tr>`;
  }

  $('#eligBox').innerHTML=rows.map(r=>{
    const checks=r.g.res.map(x=>`<span class="pill ${x.ok?'green':'red'}" style="margin:0 4px 4px 0">${x.ok?'✓':'✕'} ${shortLabel(x.label)} ${x.ok?'达标':'未达标'}</span>`).join('');
    return `<div class="finding ${r.g.ok?(best&&r.id===best.id?'ok':'mild'):'critical'}">
      <span aria-hidden="true">${r.g.ok?'✓':'✕'}</span>
      <div><strong>${r.p.name}</strong><p style="margin:3px 0 6px">${checks}</p>
        <small>${r.g.ok?'全部条件满足，已进入金额比较':'排除理由：'+r.g.fails.join('；')}</small></div>
      <em>${r.g.ok?(best&&r.id===best.id?'最优':'已比较'):'已排除'}</em></div>`;
  }).join('');

  let txt='';
  if(!ok.length){txt='<b>当前情景无可适用套餐。</b>三个套餐的资格门槛均未满足，规则引擎已给出各自排除理由。此为如实结果，不作调整。';}
  else{
    txt=`<b>适用套餐 ${ok.length} 个：</b>${ok.map(r=>r.p.name).join('、')}。`;
    if(best.id==='A') txt+='现行套餐在当前情景下仍为总成本最低项——此时若仅看价格，无需变更。';
    else{
      const a=ok.find(r=>r.id==='A');
      if(a){const dv=a.c.total-best.c.total;
        txt+=`最优为 <b>${best.p.name}</b>，月度总成本较现行 A ${dv>0?`低 <span class="green">${money(dv)}</span>`:`高 <span class="red">${money(-dv)}</span>，此时不应推荐变更`}。`;}
    }
  }
  $('#cmpNarrative').innerHTML=txt;
  return {rows,best,ok};
}
function shortLabel(l){
  const m=l.match(/^(日均存款|月均笔数|绑定贸易融资)/);
  return m?m[1]:l.split(' ')[0];
}

/* ---------- 情景推演 ---------- */
function renderScenario(){
  const rows=evalAll(S), ok=rows.filter(r=>r.g.ok);
  const best=ok.length?ok.reduce((a,b)=>a.c.total<b.c.total?a:b):null;
  const cur=PRESETS.find(p=>p.id===S.preset);

  $('#presetBtns').innerHTML=PRESETS.map(p=>`<button class="ghost-btn ${p.id===S.preset?'active':''}" data-p="${p.id}">${p.name}</button>`).join('');
  $$('#presetBtns .ghost-btn').forEach(b=>b.onclick=()=>{
    const p=PRESETS.find(x=>x.id===b.dataset.p);
    S.preset=p.id;S.cnt=p.cnt;S.amt=p.amt;S.bal=p.bal;
    $('#rCount').value=p.cnt;$('#rBal').value=p.bal;$('#rAmt').value=p.amt;
    renderAll();
  });

  $('#scenarioDesc').textContent=`当前：${cur?cur.name:'自定义情景'}（${cur?cur.basis:'客户经理手动调整'}）· 笔数 ${S.cnt} · 金额 ${fmt0(S.amt)} · 余额 ${fmt0(S.bal)}`;
  $('#reportSub').textContent=`跨境付款与存款留存套餐适配 · 情景 ${cur?cur.name:'自定义'}（${cur?cur.basis:'手动调整'}）`;

  $('#scenarioResults').innerHTML=rows.map(r=>{
    if(!r.g.ok) return `<div><span>${r.p.name}</span><b style="color:#a0a0a5">未通过资格</b><small style="display:block;margin-top:4px">${r.g.fails[0]}</small></div>`;
    const isBest=best&&r.id===best.id;
    return `<div style="${isBest?'background:#f4fbf7':''}"><span>${r.p.name}${isBest?' · 最优':''}</span>
      <b style="color:${isBest?'var(--success)':'#3f3f43'}">${fmt0(r.c.total)}</b><small> HKD / 月</small>
      <small style="display:block;margin-top:4px">${isBest?'当前情景下总成本最低':'较最优 +'+fmt0(r.c.total-best.c.total)}</small></div>`;
  }).join('');

  const aRow=rows.find(r=>r.id==='A');
  if(best){
    $('#scBest').textContent=best.p.name+' 为最优';
    $('#scBestCost').textContent=money(best.c.total)+' / 月';
    const dv=aRow&&aRow.g.ok?aRow.c.total-best.c.total:0;
    $('#scSummary').textContent=best.id==='A'?'现行套餐仍是最低项，无需切换':`较现行套餐 A ${dv>0?'节省 '+money(dv)+' / 月':'成本更高，不建议切换'}`;
    $('#scWinwin').textContent=best.id==='A'?'当前情景下取舍未改变，系统如实展示':'输入跨越门槛后取舍翻转，已说明原因';
  }else{
    $('#scBest').textContent='无可适用套餐';$('#scBestCost').textContent='—';
    $('#scSummary').textContent='全部套餐资格门槛均未满足';
    $('#scWinwin').textContent='规则引擎已给出逐项排除理由';
  }
  $('#vCount').textContent=S.cnt+' 笔';
  $('#vBal').textContent=fmt0(S.bal);
  $('#vAmt').textContent=fmt0(S.amt);

  const steps=[
    {label:'起点 P1 当前实际',cnt:415,amt:18600000,bal:6150000},
    {label:'仅改余额 → P4',cnt:415,amt:18600000,bal:14500000},
    {label:'再改笔数 → P5',cnt:520,amt:18600000,bal:14500000}
  ];
  let prevBest=null,prevElig='';
  $('#runBody').innerHTML=steps.map((st,i)=>{
    const snap={cnt:st.cnt,amt:st.amt,bal:st.bal};
    const ok2=IDS.map(id=>{const p=PKG[id],g=checkGates(p,snap);return{id,g,c:g.ok?compute(p,snap):null};}).filter(r=>r.g.ok);
    const b2=ok2.length?ok2.reduce((x,y)=>x.c.total<y.c.total?x:y):null;
    const bName=b2?PKG[b2.id].name:'无可适用套餐';
    const elig=ok2.length?ok2.map(r=>r.id).join(' + '):'无';
    const changed=prevBest===null?'<span class="pill grey">起点</span>'
      :(prevBest!==bName?'<span class="pill red">取舍改变</span>':'<span class="pill green">取舍未改变</span>');
    const q=i===0?'<span style="color:#999">起点</span>'
      :(elig===prevElig?'<span style="color:#999">适用集合未变</span>':`<span class="red">${prevElig||'无'} → ${elig}</span>`);
    prevBest=bName;prevElig=elig;
    return `<tr class="${i===2?'win':''}"><td class="num">${i+1}</td><td><b>${st.label}</b></td>
      <td class="num">${i===0||st.bal===steps[i-1].bal?'<span style="color:#bbb">不变</span>':fmtShort(steps[i-1].bal)+' → '+fmtShort(st.bal)}</td>
      <td class="num">${i===0||st.cnt===steps[i-1].cnt?'<span style="color:#bbb">不变</span>':steps[i-1].cnt+' → '+st.cnt}</td>
      <td>${q}</td><td>${changed}</td>
      <td><b>${bName}</b><div style="font-size:9px;color:#888">${b2?money(b2.c.total)+' / 月':'—'}</div></td></tr>`;
  }).join('');

  const s5={cnt:520,amt:18600000,bal:14500000};
  const ok5=IDS.map(id=>{const p=PKG[id],g=checkGates(p,s5);return{p,g,c:g.ok?compute(p,s5):null};}).filter(r=>r.g.ok);
  const b5=ok5.length?ok5.reduce((x,y)=>x.c.total<y.c.total?x:y):null;
  const a5=ok5.find(r=>r.p.id==='A');
  $('#whyBody').innerHTML=(b5&&b5.p.id==='B')?`
    <ul style="margin:0;padding-left:16px">
      <li><b>门槛是硬约束。</b>套餐 B 需日均存款 ≥ 12,000,000 且月均笔数 ≥ 500，缺一即被规则引擎排除，与价格无关。</li>
      <li><b>笔数达标后成本结构改变。</b>520 笔下 B 的电报费仅 ${b5.c.billable} 笔计费，且本身含 500 笔额度。</li>
      <li><b>点差是最大变量。</b>B 为 ${b5.c.spreadBps} bps，A 为 ${a5?a5.c.spreadBps:0} bps，金额越大差距越明显。</li>
      <li><b>存款收益反向抵消。</b>B 利率 1.15% 高于 A 的 0.85%，轧差后净成本差约 ${a5?money(a5.c.total-b5.c.total):'—'} / 月。</li>
    </ul>`:'<div class="note-box grey" style="margin:0">在当前设定下取舍未翻转，系统如实展示结果。</div>';

  $('#trigBody').innerHTML=[
    '月均付款笔数跌破 <b>200</b> → 套餐 A 失去资格',
    '月均付款笔数跌破 <b>150</b> → 套餐 C 亦失去资格，需重新安排服务方案',
    '日均存款跌破 <b>HKD 5,000,000</b> → 全部套餐资格失效，须重新协商',
    '付款金额持续高于 <b>HKD 20,000,000</b> → 点差差异放大，B 的优势扩大',
    '笔数升破 <b>400</b> 但余额不足 12,000,000 → B 仍被排除，A 超额笔费跳档至 32',
    '贸易融资额度到期未续 → B 的绑定条件失效，须重新核验'
  ].map(t=>`<li>${t}</li>`).join('');
}

/* ---------- 决策包 + 信号条 ---------- */
function renderDecision(res){
  const best=res.best,ok=res.ok,a=ok.find(r=>r.id==='A');
  $('#sgCost').textContent=best?fmt0(best.c.total):'—';
  $('#sgElig').textContent=ok.length+' / 3';
  $('#sgEligSub').textContent=(3-ok.length)+' 项资格未通过';
  $('#sgDelta').textContent=(best&&a&&best.id!=='A')?'节省 '+fmt0(a.c.total-best.c.total):'维持现行';
  $('#sgDeltaSub').textContent=(best&&a&&best.id!=='A')?money(a.c.total-best.c.total)+' / 月':'当前情景下未产生切换收益';

  const cur=PRESETS.find(p=>p.id===S.preset);
  $('#dpBase').innerHTML=`<dt>情景</dt><dd>${cur?cur.name:'自定义'}</dd><dt>性质</dt><dd>${cur?cur.basis:'手动调整'}</dd>
    <dt>笔数</dt><dd>${S.cnt} 笔</dd><dt>金额</dt><dd>${money(S.amt)}</dd><dt>余额</dt><dd>${money(S.bal)}</dd>`;
  let dl;
  if(!best) dl=`<dt>结论</dt><dd class="red">无可适用套餐</dd><dt>处理</dt><dd>回退至人工安排</dd>`;
  else if(best.id==='A') dl=`<dt>结论</dt><dd>维持 ${best.p.name}</dd><dt>理由</dt><dd>当前情景下总成本最低</dd><dt>月费</dt><dd>${money(best.c.total)}</dd>`;
  else{const dv=a?a.c.total-best.c.total:0;
    dl=`<dt>结论</dt><dd>建议转 ${best.p.name}</dd><dt>理由</dt><dd>月度总成本低 ${money(dv)}</dd>
      <dt>现行成本</dt><dd>${a?money(a.c.total):'—'}</dd><dt>建议成本</dt><dd>${money(best.c.total)}</dd>`;}
  $('#dpResult').innerHTML=dl;
  $('#dpHeadline').textContent=best?(best.id==='A'?'维持现行套餐':'建议转 '+best.p.name):'无适用套餐';
  $('#dpIssue').innerHTML=`<dt>事项</dt><dd>笔费执行不一致</dd><dt>差额</dt><dd class="red">HKD 7,482</dd>
    <dt>工单</dt><dd class="mono">OPS-2026-2211</dd><dt>状态</dt><dd><span class="pill amber">与套餐选择无关</span></dd>`;
  $('#dpReject').innerHTML=IDS.map(id=>{
    const r=res.rows.find(x=>x.id===id);
    if(!r.g.ok) return `<tr><td><b>${r.p.name}</b></td><td class="red">资格未通过 — ${r.g.fails.join('；')}</td><td style="color:#777">${reconsider(id)}</td></tr>`;
    if(best&&id===best.id) return `<tr class="win"><td><b>${r.p.name}</b></td><td><span class="pill green">本次推荐</span> 总成本最低 ${money(r.c.total)}</td><td style="color:#777">任一输入跨越门槛即需重新比较</td></tr>`;
    return `<tr><td><b>${r.p.name}</b></td><td style="color:#777">通过资格但总成本非最优，高于最优 ${money(r.c.total-best.c.total)}</td><td style="color:#777">${reconsider(id)}</td></tr>`;
  }).join('');
}
function reconsider(id){
  if(id==='A') return '笔数跌破 200 或余额跌破 5,000,000 时失去资格；点差劣势随金额放大';
  if(id==='B') return '余额达 12,000,000 且笔数达 500 时重新评估';
  return '余额跌破 3,000,000 或笔数跌破 150 时失去资格；费率劣势随金额放大';
}
function renderAll(){
  const res=renderCompare();
  renderScenario();
  renderDecision(res);
  const a=evalAll(S).find(r=>r.id==='A');
  $('#fitScore').textContent = a&&a.g.ok ? (res.best&&res.best.id==='A'?'72':'58') : '41';
}
$('#rCount').addEventListener('input',e=>{S.cnt=+e.target.value;S.preset='';renderAll();});
$('#rBal').addEventListener('input',e=>{S.bal=+e.target.value;S.preset='';renderAll();});
$('#rAmt').addEventListener('input',e=>{S.amt=+e.target.value;S.preset='';renderAll();});

/* ---------- 会诊室 ---------- */
const AGENTS=[
  {sym:'01',name:'资料读取',desc:'抽取授权材料字段',msg:'已读取 5 份授权材料，抽取 7 个关键字段，1 项置信度低'},
  {sym:'02',name:'价格核查',desc:'对照取录与价目表',msg:'发现 1 项执行不一致：逾期笔费实收 38 高于价目表 32，已标记待处理'},
  {sym:'03',name:'外部检索',desc:'检索公开信息',msg:'检索 4 条公开线索，逐条核对实体与时点，2 条排除、1 条无增量'},
  {sym:'04',name:'证据分层',desc:'事实 / 推断 / 缺口',msg:'已分层为 5 项事实、3 项推断、4 项缺口，缺口不使用推断填补'},
  {sym:'05',name:'情景确认',desc:'人工闸门',msg:'等待客户经理确认偏好与情景 — 假设未确认，不进入计算输入'},
  {sym:'06',name:'资格校验',desc:'规则引擎',msg:'按价目表条款校验 3 个套餐门槛，逐项给出通过与排除理由'},
  {sym:'07',name:'金额计算',desc:'确定性工具',msg:'按公式计算可用套餐月度总成本，输出可审计明细'}
];
const STEPS=[
  {n:1,t:'读取或授权客户材料',d:'模型读取授权范围内的 5 份材料',e:'已完成'},
  {n:2,t:'核查当前有效价格',d:'对照取录与系统价目表，发现 1 项执行不一致',e:'需处理',cls:'diagnostic'},
  {n:3,t:'检索外部信息',d:'4 条线索，核对实体、事件与时点',e:'1 候选'},
  {n:4,t:'展示事实 / 推断 / 缺口',d:'三类来源分层，不合并',e:'已分层'},
  {n:5,t:'客户经理确认偏好与情景',d:'偏好纠正 4 项，情景独立设定',e:'已确认'},
  {n:6,t:'核验套餐适用条件',d:'规则引擎逐条校验门槛',e:'2 通过'},
  {n:7,t:'工具计算并比较套餐',d:'确定性公式产出金额',e:'已计算'},
  {n:8,t:'改变情景并重新运行',d:'单变量未改变取舍、双变量翻转',e:'已重算'},
  {n:9,t:'输出内部决策包',d:'含证据、假设、待核实与非此套餐项',e:'已生成'}
];
function renderAgents(){
  const el=$('#agentList'); if(!el) return;
  el.innerHTML=AGENTS.map((a,i)=>`<div class="agent-row" data-i="${i}">
    <span class="agent-symbol">${a.sym}</span>
    <div><strong>${a.name}</strong><p>${a.desc}</p></div>
    <span class="agent-state">待运行</span></div>`).join('');
}
function renderSteps(){
  const el=$('#stepTimeline'); if(!el) return;
  el.innerHTML=STEPS.map((s,i)=>`<div class="step-tl ${s.cls||''}" data-s="${i}">
    <span>${s.n}</span><div><strong>${s.t}</strong><p>${s.d}</p></div><em>${s.e}</em></div>`).join('');
}
/* ---------- 客户全景检查：单客户下拉 + 开始检查 ---------- */
function getSelectedClient(){
  const sel=$('#clientSelect');
  const list=(window.VP_DATA && window.VP_DATA.customers) || [];
  const cid=sel ? sel.value : (list[0] && list[0].id);
  return list.find(x=>x.id===cid) || list[0] || null;
}
function fillClientSelect(){
  const sel=$('#clientSelect'); if(!sel) return;
  const list=(window.VP_DATA && window.VP_DATA.customers) || [];
  if(sel.options.length === list.length && list.length) return;
  sel.innerHTML=list.map(c=>`<option value="${c.id}">${c.name} · ${c.id}</option>`).join('');
  if(list.length){ sel.value=list[0].id; }
}
/* 将所选客户信息同步到体检报告页 */
function syncReportClient(){
  const c=getSelectedClient(); if(!c) return;
  const n=$('#reportClientName'); if(n) n.textContent=c.name;
  const dn=$('#dpClientName'); if(dn) dn.textContent=c.name;
  const sub=$('#reportSub');
  if(sub && c.industry){ sub.textContent=`跨境付款与存款留存套餐适配 · ${c.industry}${c.sub?' · '+c.sub:''} · ${c.city||''}`; }
  renderReportPricing(c);
}

/* 在客户名称下方的独立卡片中展示该客户全部产品的当前有效价格 */
function renderReportPricing(c){
  const box=$('#reportPricing'); if(!box) return;
  const pr=c.pricing||{}; const items=[];
  ['RMB','FCY','Omni','VA','CashPool'].forEach(k=>{
    const p=pr[k]; if(!p) return;
    items.push({prod:k, val:p.value_list, pref:null, eff:p.eff, exp:p.exp, status:p.status});
  });
  (pr.Deposit||[]).forEach(p=>{
    items.push({prod:'Deposit · '+(p.ccy||'')+' '+(p.tenor||''), val:p.value_list,
      pref:p.pref, eff:p.eff, exp:p.exp, status:p.status});
  });
  if(!items.length){ box.innerHTML='<p class="hp-none">该客户暂无产品价格记录</p>'; return; }
  const rate=v=>v==null||v===''?'':(Math.round(v*10000)/100).toFixed(2)+'%';
  box.innerHTML=`<div class="hp-head">产品价格 <b>${items.length} 项</b></div><div class="hp-grid">`+
    items.map(it=>{
      const exp = it.status && it.status!=='active' ? ' expired' : '';
      return `<div class="hp-chip${exp}">`+
        `<span class="hp-prod">${it.prod}</span>`+
        `<span class="hp-val">${it.val!=null?it.val:'—'}</span>`+
        (it.pref!=null?`<span class="hp-pref">${rate(it.pref)}</span>`:'')+
        `<span class="hp-exp">${it.eff||'—'}${it.exp?' → '+it.exp:''}</span>`+
        `</div>`;
    }).join('')+'</div>';
}
/* 全景检查进度：由 agents.js 的真实执行阶段驱动 */
const CHECK_STAGE_ORDER = ['prepare', 'transactions', 'llm', 'merge', 'report'];
let checkProgressTimer = null;
let checkProgressState = { current: 0, running: false, startedAt: 0 };

function updateCheckElapsed(){
  const elapsed = Math.max(0, Math.floor((Date.now() - checkProgressState.startedAt) / 1000));
  const text = elapsed >= 60
    ? `${Math.floor(elapsed / 60)} 分 ${String(elapsed % 60).padStart(2, '0')} 秒`
    : `${elapsed} 秒`;
  const el = $('#checkElapsed'); if(el) el.textContent = text;
}

function renderCheckProgress(stage, detail, progress){
  const box = $('#checkProgress');
  if(!box || !checkProgressState.running) return;
  const stageIndex = Math.max(0, CHECK_STAGE_ORDER.indexOf(stage));
  checkProgressState.current = Math.max(checkProgressState.current, stageIndex);
  const current = checkProgressState.current;
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  $('#checkProgressDetail').textContent = detail || '正在执行…';
  $('#checkProgressPercent').textContent = percent + '%';
  $('#checkProgressCount').textContent = `步骤 ${current + 1} / ${CHECK_STAGE_ORDER.length}`;
  $('#checkProgressFill').style.width = percent + '%';
  $('#checkProgressBar').setAttribute('aria-valuenow', String(percent));
  $$('#checkSteps li').forEach((item, index) => {
    item.classList.toggle('done', index < current);
    item.classList.toggle('active', index === current);
    item.querySelector('em').textContent = index < current ? '完成' : (index === current ? '进行中' : '等待');
  });
}

function beginCheckProgress(){
  const box = $('#checkProgress'); if(!box) return;
  if(checkProgressTimer) clearInterval(checkProgressTimer);
  checkProgressState = { current: 0, running: true, startedAt: Date.now() };
  box.hidden = false;
  box.classList.remove('is-complete', 'is-error');
  $('#checkProgressTitle').textContent = '正在执行全景检查';
  window.healthCheckProgress = renderCheckProgress;
  renderCheckProgress('prepare', '正在读取客户基础信息、产品定价与检查规则…', 5);
  updateCheckElapsed();
  checkProgressTimer = setInterval(updateCheckElapsed, 1000);
}

function endCheckProgress(success, message){
  const box = $('#checkProgress'); if(!box) return;
  if(success) renderCheckProgress('report', message, 100);
  checkProgressState.running = false;
  if(checkProgressTimer){ clearInterval(checkProgressTimer); checkProgressTimer = null; }
  updateCheckElapsed();
  box.classList.toggle('is-complete', success);
  box.classList.toggle('is-error', !success);
  $('#checkProgressTitle').textContent = success ? '全景检查已完成' : '检查未完成';
  $('#checkProgressDetail').textContent = message;
  $$('#checkSteps li').forEach((item, index) => {
    if(success){
      item.classList.remove('active'); item.classList.add('done');
      item.querySelector('em').textContent = '完成';
    }else if(index === checkProgressState.current){
      item.classList.add('active'); item.querySelector('em').textContent = '失败';
    }
  });
}

function resetCheckProgress(){
  if(checkProgressState.running) return;
  const box = $('#checkProgress'); if(box) box.hidden = true;
  window.healthCheckProgress = null;
}

/* 执行健康检查：调用四个 Agent（当前 mock 模式走预聚合数据） */
async function startCheck(){
  const c=getSelectedClient();
  const btn=$('#startCheck');
  const modal=$('#checkModal');
  if(!c){ toast('请先选择客户'); return; }

  btn.disabled = true;
  btn.textContent = '检查中…';
  if($('#clientSelect')) $('#clientSelect').disabled = true;
  beginCheckProgress();

  try{
    const result = await (window.runHealthCheck
      ? window.runHealthCheck(c)
      : Promise.resolve({ health: c.health, findings: c.findings, source: 'mock' }));

    /* 把最新检查结果写回当前客户对象，供报告页渲染 */
    c.health = result.health || c.health;
    c.findings = result.findings || c.findings;
    if(Array.isArray(result.topCounterparties)) c.cp = result.topCounterparties;
    if(Array.isArray(result.sameNameTransfers)) c.same = result.sameNameTransfers;
    if(result.integration) c.integration = result.integration;

    syncReportClient();
    const txSelect = $('#vpxCustSelect');
    if(txSelect){
      if(txSelect.options.length !== VP.length) txSelect.innerHTML = vpOpts(vpSel);
      txSelect.value = c.id;
      renderVpTx();
    }
    $('#modalMsg').innerHTML =
      `已为「<b>${esc(c.name)}</b>」完成套餐适配体检，可查看详细报告与方案。`;
    endCheckProgress(true, `已完成 ${c.name} 的全景检查，报告与方案已更新。`);
    modal.classList.add('show');
  }catch(err){
    console.error('[startCheck]', err);
    endCheckProgress(false, '检查失败：' + err.message);
    toast('检查失败：' + err.message);
  }finally{
    btn.disabled = false;
    if($('#clientSelect')) $('#clientSelect').disabled = false;
    btn.innerHTML = '开始全景检查 <span aria-hidden="true">→</span>';
  }
}
$('#startCheck') && ($('#startCheck').onclick=startCheck);
$('#clientSelect') && ($('#clientSelect').addEventListener('change', ()=>{ syncReportClient(); resetCheckProgress(); }));
$('#modalClose') && ($('#modalClose').onclick=()=>$('#checkModal').classList.remove('show'));
$('#modalView') && ($('#modalView').onclick=()=>{
  $('#checkModal').classList.remove('show');
  syncReportClient();
  go('report');
});

/* ---------- 追问 ---------- */
const ANSWERS=[
  {k:['C','不推荐'],v:'以当前情景（415 笔、HKD 18.6m、余额 HKD 6.15m）为例：套餐 C 资格虽通过，但点差 38 bps 高于 A 的 32 bps，在 HKD 18.6m 的付款金额上多付约 <b>HKD 11,160</b>；叠加电报费与前 300 笔 HKD 55 的较高笔费，月度总成本 <b>HKD 128,931</b>，高于 A 的 <b>HKD 124,644</b>。故不推荐 C。'},
  {k:['点差'],v:'点差按「付款金额 × 点差 ÷ 10000」计算。当前 HKD 18,600,000 的金额下，每 1 bps 对应 HKD 1,860 / 月。A 与 B 相差 10 bps，即约 <b>HKD 18,600 / 月</b>，是三者中最大的单项差异。'},
  {k:['B','白金','门槛'],v:'把「情景推演」中的余额拉到 HKD 12,000,000 以上、笔数拉到 500 以上，套餐 B 会通过资格校验并成为最优项。注意二者需<b>同时成立</b>——只调余额不改变取舍，系统会如实显示「取舍未改变」。'},
  {k:['执行','多收','7,482'],v:'该项独立于套餐选择议题：抽样 1,247 笔中 247 笔受影响，差额 <b>247 × (38 − 32) = HKD 7,482</b>。已开工单 OPS-2026-2211 交营运部费用稽核组复核；换套餐不会使这项差额自动消失，反之亦然。'}
];
function askAI(){
  const q=$('#askInput').value.trim();
  const ans=$('#aiAnswer');
  if(!q){toast('请输入问题');return;}
  let reply='本原型聚焦真实链路展示。可尝试：① 为什么当前情景下不推荐套餐 C？② 点差怎么计算？③ 怎么让套餐 B 通过资格？④ 执行不一致的差额如何得出？';
  for(const item of ANSWERS){ if(item.k.some(k=>q.includes(k))){reply=item.v;break;} }
  ans.innerHTML=reply;ans.classList.remove('hidden');
}
$('#askBtn').onclick=askAI;
$('#askInput').addEventListener('keydown',e=>{if(e.key==='Enter')askAI();});

/* ---------- 数据与费率库 ---------- */
const DATASETS=[
  {id:'profile',name:'客户授权材料',badge:'5',kicker:'MATERIALS',meta:'材料清单与抽取方式，均标注来源与置信度',
    cols:['材料','类型','期间','抽取字段','方式','状态'],
    rows:[['综合服务协议（现行）','PDF · 14 页','2024-03 生效','费率档位、免笔数、电报费','模型逐页溯源','<span class="pill green">已核对</span>'],
      ['账户流水摘要','系统导出 · XLSX','2024-04 ~ 2026-09','月均笔数、金额、日均余额','结构化读取','<span class="pill green">已核对</span>'],
      ['客户偏好问卷','表单 · 2025-11','—','费率敏感度、免笔需求','模型抽取','<span class="pill amber">含过期项</span>'],
      ['贸易融资额度批复','PDF · 3 页','2026-06-28','额度上限 HKD 22,000,000','模型抽取','<span class="pill green">已核对</span>'],
      ['转账与费用明细','系统导出 · CSV','2026-03 ~ 2026-06','1,247 笔抽样、实收手续费','结构化读取','<span class="pill green">已核对</span>']]},
  {id:'tariff',name:'标准价目表',badge:'3',kicker:'TARIFF',meta:'v2026.01 正式版本，适用于本次比较',
    cols:['套餐','月度管理费','汇款手续费','电报费','点差','存款利率','资格门槛'],
    rows:[['跨境汇划综合服务','HKD 3,800','前 200 笔 45 / 超出 32','HKD 120 / 笔','32 bps','0.85%','存款 ≥ 5m 且 笔数 ≥ 200'],
      ['全球支付白金','HKD 2,900','前 400 笔 38 / 超出 25','含 500 笔 / 超出 90','22 bps','1.15%','存款 ≥ 12m、笔数 ≥ 500、融资 ≥ 20m'],
      ['弹性跨境组合','HKD 1,600','前 300 笔 55 / 超出 28','前 150 笔 90 / 超出 150','38 bps','0.55%','存款 ≥ 3m 且 笔数 ≥ 150']]},
  {id:'execution',name:'执行扣收明细',badge:'4',kicker:'EXECUTION',meta:'系统价目表与实际扣收的对照结果',
    cols:['费用项','价目表','实收','抽样笔数','结论'],
    rows:[['汇款手续费（前 200 笔）','HKD 45','HKD 45','1,000','<span class="pill green">一致</span>'],
      ['汇款手续费（超出 200 笔）','<code>HKD 32</code>','<code>HKD 38</code>','247','<span class="pill red">执行不一致</span>'],
      ['电报费','HKD 120','HKD 120','1,247','<span class="pill green">一致</span>'],
      ['账户管理月费','HKD 3,800','HKD 3,800','4','<span class="pill green">一致</span>']]},
  {id:'external',name:'外部检索线索',badge:'4',kicker:'EXTERNAL',meta:'公开信息，逐条核对实体与时点',
    cols:['来源','日期','相关实体','判定'],
    rows:[['公司官网《深圳跨境电商保税仓上线》','2026-07-09','明海实业（香港）','<span class="pill amber">候选假设</span>'],
      ['汇丰公告《贸易融资额度提升》','2026-06-28','明海实业（香港）','<span class="pill green">事实</span>'],
      ['财经媒体《海防第二装配厂投产》','2026-06-14','集团（明海实业控股）','<span class="pill red">不可归因</span>'],
      ['行业协会《2026 跨境电商展望》','2026-08-20','行业','<span class="pill grey">无增量</span>']]}
];
const NUMCOL=/^(HKD|[\d,]+(\.\d+)?%?$|[\d]+ 笔)/;
function renderDataset(id){
  const d=DATASETS.find(x=>x.id===id)||DATASETS[0];
  $('#dsKicker').textContent=d.kicker;$('#dsTitle').textContent=d.name;$('#dsMeta').textContent=d.meta;
  $('#dsHead').innerHTML='<tr>'+d.cols.map(c=>`<th>${c}</th>`).join('')+'</tr>';
  $('#dsBody').innerHTML=d.rows.map(r=>'<tr>'+r.map(c=>`<td class="${NUMCOL.test(c)?'num':''}">${c}</td>`).join('')+'</tr>').join('');
  $('#dsCount').textContent=d.rows.length+' 条记录';
  $('#dsBanner').innerHTML=(d.id==='execution')
    ? `<div class="standard-rate"><span>执行不一致</span>
         <div><strong>逾期笔费实收高于价目表 HKD 6 / 笔</strong>
           <p>差额 247 × (38 − 32) = HKD 7,482 · 工单 OPS-2026-2211 · 待营运部复核</p></div>
         <em>HKD 7,482</em></div>`
    : '';
  $$('#datasetNav .dataset-item').forEach(b=>b.classList.toggle('active',b.dataset.id===d.id));
}
function renderDatasetNav(){
  $('#datasetNav').innerHTML=DATASETS.map(d=>`<button class="dataset-item" data-id="${d.id}">${d.name}<b>${d.badge}</b></button>`).join('');
  $$('#datasetNav .dataset-item').forEach(b=>b.onclick=()=>renderDataset(b.dataset.id));
}
$('#dsSearch').addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase();
  const active=DATASETS.find(d=>$('#dsTitle').textContent===d.name)||DATASETS[0];
  const rows=active.rows.filter(r=>r.some(c=>String(c).toLowerCase().includes(q)));
  $('#dsBody').innerHTML=rows.map(r=>'<tr>'+r.map(c=>`<td class="${NUMCOL.test(c)?'num':''}">${c}</td>`).join('')+'</tr>').join('');
  $('#dsCount').textContent=rows.length+' 条记录'+(q?'（已筛选）':'');
});
$('#dsExport').onclick=()=>toast('已导出 CSV（演示）');

/* ---------- 管理视图 · 图表（纯 SVG，无外部依赖） ---------- */
const MIX=[
  {k:'A · 跨境汇划综合服务',v:22,c:'#db0011'},
  {k:'B · 全球支付白金',v:12,c:'#f0aeb4'},
  {k:'C · 弹性跨境组合',v:5,c:'#8e010c'},
  {k:'尚未归类',v:3,c:'#dcdce0'}
];
const POS=[
  {n:'明海实业',x:29.7,y:-33.2,s:'crit'},
  {n:'瀚宇物流',x:41.8,y:-5.6,s:'crit'},
  {n:'泰盛纺织',x:18.9,y:-19.7,s:'watch'},
  {n:'崇岭精密',x:12.4,y:-8.1,s:'watch'},
  {n:'恒昌电子',x:6.2,y:2.4,s:'ok'},
  {n:'联合医疗',x:3.1,y:-3.5,s:'ok'}
];
const TREND=[{m:'05',v:1},{m:'06',v:2},{m:'07',v:2},{m:'08',v:3},{m:'09',v:2},{m:'10',v:1}];
const TRIG=[{k:'付款笔数超出条款区间',v:3},{k:'日均余额跌破门槛',v:2},{k:'价目表版本更新',v:1}];

function chartScatter(){
  const W=580,H=300,L=52,R=16,T=14,B=38;
  const x0=-2,x1=50,y0=-42,y1=12;
  const px=v=>+(L+(v-x0)/(x1-x0)*(W-L-R)).toFixed(1);
  const py=v=>+(T+(y1-v)/(y1-y0)*(H-T-B)).toFixed(1);
  let s='';
  s+=`<rect x="${px(20)}" y="${py(-15)}" width="${(px(50)-px(20)).toFixed(1)}" height="${(py(-42)-py(-15)).toFixed(1)}" fill="#db0011" opacity="0.055"/>`;
  for(let y=-40;y<=10;y+=10){
    s+=`<line x1="${L}" y1="${py(y)}" x2="${W-R}" y2="${py(y)}" stroke="${y===0?'#dcdce0':'#f0f0f2'}"/>`;
    s+=`<text x="${L-9}" y="${py(y)+3.5}" text-anchor="end" font-size="9" fill="#9a9aa0">${y}%</text>`;
  }
  for(let x=0;x<=50;x+=10){
    s+=`<line x1="${px(x)}" y1="${T}" x2="${px(x)}" y2="${H-B}" stroke="#f0f0f2"/>`;
    s+=`<text x="${px(x)}" y="${H-B+16}" text-anchor="middle" font-size="9" fill="#9a9aa0">${x}%</text>`;
  }
  s+=`<line x1="${px(20)}" y1="${T}" x2="${px(20)}" y2="${H-B}" stroke="#db0011" stroke-dasharray="4 4" opacity=".42"/>`;
  s+=`<line x1="${L}" y1="${py(-15)}" x2="${W-R}" y2="${py(-15)}" stroke="#db0011" stroke-dasharray="4 4" opacity=".42"/>`;
  s+=`<text x="${px(20)+6}" y="${T+12}" font-size="8.5" fill="#c98a90">失稳阈值 20% / −15%</text>`;
  POS.forEach(p=>{
    const cx=px(p.x),cy=py(p.y);
    const col=p.s==='crit'?'#db0011':p.s==='watch'?'#f0aeb4':'#c9c9ce';
    const ring=p.s==='crit'?`<circle cx="${cx}" cy="${cy}" r="11" fill="#db0011" opacity=".13"/>`:'';
    const right=p.x<=36;
    s+=ring+`<circle cx="${cx}" cy="${cy}" r="6" fill="${col}" stroke="#fff" stroke-width="1.5"/>`;
    s+=`<text x="${right?cx+13:cx-13}" y="${cy+3.5}" text-anchor="${right?'start':'end'}" font-size="9.5"
      fill="${p.s==='crit'?'#a8000d':'#71717a'}" font-weight="${p.s==='crit'?'700':'400'}">${p.n}</text>`;
  });
  s+=`<text x="${W-R}" y="${H-6}" text-anchor="end" font-size="9" fill="#8f8f95">付款笔数变动率 →</text>`;
  s+=`<text transform="translate(14,${T+(H-T-B)/2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#8f8f95">余额变动率 →</text>`;
  $('#chartScatter').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="客户业务量与余额偏移散点图">${s}</svg>`;
}

function chartDonut(){
  const total=MIX.reduce((a,b)=>a+b.v,0);
  const r=52,C=2*Math.PI*r;
  let acc=0,seg='';
  MIX.forEach(m=>{
    const len=m.v/total*C;
    seg+=`<circle cx="86" cy="86" r="${r}" fill="none" stroke="${m.c}" stroke-width="19"
      stroke-dasharray="${(len-2).toFixed(2)} ${(C-len+2).toFixed(2)}"
      stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 86 86)"/>`;
    acc+=len;
  });
  $('#chartDonut').innerHTML=`<svg viewBox="0 0 172 172" role="img" aria-label="存量客户套餐结构环形图">${seg}
    <text x="86" y="83" text-anchor="middle" font-size="25" font-weight="700" fill="#1b1b1d">${total}</text>
    <text x="86" y="99" text-anchor="middle" font-size="9" fill="#8f8f95">户 · 存量客户</text></svg>`;
  $('#donutLegend').innerHTML=MIX.map(m=>`<span style="display:flex;align-items:center;width:100%;line-height:1.4">
    <i style="background:${m.c}"></i><span style="flex:1">${m.k}</span>
    <b style="color:#1b1b1d;font-size:10px">${m.v}</b>
    <span style="color:#a0a0a6;font-size:9px;margin-left:8px;width:32px;text-align:right">${(m.v/total*100).toFixed(0)}%</span></span>`).join('');
}

function chartTrend(){
  const W=520,H=200,L=32,R=10,T=16,B=34;
  const max=4,bw=(W-L-R)/TREND.length,bh=(H-T-B)/max;
  let s='';
  for(let v=0;v<=max;v++){
    const y=(H-B-v*bh).toFixed(1);
    s+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="#f0f0f2"/>`;
    s+=`<text x="${L-8}" y="${+y+3.5}" text-anchor="end" font-size="9" fill="#9a9aa0">${v}</text>`;
  }
  TREND.forEach((t,i)=>{
    const x=L+i*bw+bw*0.24,w=bw*0.52,h=t.v*bh;
    s+=`<rect x="${x.toFixed(1)}" y="${(H-B-h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2"
      fill="#db0011" opacity="${i===TREND.length-1?'1':'0.78'}"/>`;
    s+=`<text x="${(x+w/2).toFixed(1)}" y="${(H-B-h-6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#a8000d">${t.v}</text>`;
    s+=`<text x="${(x+w/2).toFixed(1)}" y="${H-B+16}" text-anchor="middle" font-size="9" fill="#9a9aa0">2026-${t.m}</text>`;
  });
  s+=`<line x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}" stroke="#dcdce0"/>`;
  $('#chartTrend').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="月度新增独立议题柱状图">${s}</svg>`;
}

function chartTriggers(){
  const W=520,H=190,L=152,R=34,T=18,B=16;
  const max=3,bh=(H-T-B)/TRIG.length,barMax=W-L-R;
  let s='';
  TRIG.forEach((t,i)=>{
    const y=T+i*bh+bh*0.18,h=bh*0.44,w=barMax*(t.v/max);
    s+=`<text x="${L-10}" y="${(y+h/2+3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#5f5f66">${t.k}</text>`;
    s+=`<rect x="${L}" y="${y.toFixed(1)}" width="${barMax}" height="${h.toFixed(1)}" rx="3" fill="#f4f4f6"/>`;
    s+=`<rect x="${L}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#db0011"/>`;
    s+=`<text x="${(L+w+8).toFixed(1)}" y="${(y+h/2+3.5).toFixed(1)}" font-size="10" font-weight="700" fill="#a8000d">${t.v}</text>`;
  });
  $('#chartTriggers').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="重算触发原因横向条形图">${s}</svg>`;
}

function renderCharts(){
  if(!$('#chartScatter')) return;
  chartScatter();chartDonut();chartTrend();chartTriggers();
}

/* ---------- 初始化 ---------- */
renderAgents();
renderSteps();
renderDatasetNav();
renderDataset('profile');
renderCharts();
renderAll();
fillClientSelect();
syncReportClient();
if(window.renderAgentStatus) window.renderAgentStatus();
if(window.initLlmForm) window.initLlmForm();

/* ================= 数据集集成（window.VP_DATA，20 户） ================= */
const VP = (window.VP_DATA && window.VP_DATA.customers) || [];
let vpSel = VP[0] ? VP[0].id : null;
let vpLightSel = 0;

function vpGet(id){ return VP.find(c => c.id === id) || VP[0]; }
function vpOpts(id){ return VP.map(c => `<option value="${c.id}" ${c.id===id?'selected':''}>${c.name} · ${c.id}</option>`).join(''); }
function vpLightColor(l){
  const s = String(l||'').toLowerCase();
  if(s.startsWith('red')) return '#db0011';
  if(s.startsWith('amber')) return '#a86200';
  return '#12805f';
}
function vpLineChart(el, series, h){
  h = h || 220;
  const W = 580, P = {l:52, r:12, t:14, b:26};
  if(!series.length){ el.innerHTML='<p class="chart-note">无数据</p>'; return; }
  const vals = series.map(d=>d.v).filter(v=>v!=null);
  const mx = Math.max(...vals)*1.08, mn = Math.min(...vals)*0.92;
  const px = i => P.l + i*(W-P.l-P.r)/Math.max(1,series.length-1);
  const py = v => P.t + (mx-v)/(mx-mn||1)*(h-P.t-P.b);
  const grid = [0,.25,.5,.75,1].map(t=>{const y=P.t+t*(h-P.t-P.b);const v=mx-t*(mx-mn);
    return `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${W-P.r}" y2="${y.toFixed(1)}" stroke="#e8e8ea" stroke-width="1"/><text x="${P.l-6}" y="${(y+3).toFixed(1)}" font-size="9" fill="#74747b" text-anchor="end">${fmtShort(v)}</text>`;}).join('');
  const pts = series.map((d,i)=>`${px(i).toFixed(1)},${py(d.v).toFixed(1)}`).join(' ');
  const dots = series.map((d,i)=>`<circle cx="${px(i).toFixed(1)}" cy="${py(d.v).toFixed(1)}" r="2.4" fill="#db0011"/>`).join('');
  const labels = series.filter((_,i)=>i%Math.ceil(series.length/8)===0).map(d=>
    `<text x="${px(series.indexOf(d)).toFixed(1)}" y="${h-8}" font-size="9" fill="#74747b" text-anchor="middle">${d.m}</text>`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="趋势图">${grid}<polyline points="${pts}" fill="none" stroke="#db0011" stroke-width="2"/>${dots}${labels}</svg>`;
}
function vpBarChart(el, items, h){
  h = h || 200;
  const W = 580, P = {l:110, r:14, t:10, b:20};
  const mx = Math.max(1, ...items.map(d=>d.v))*1.1;
  const rows = items.map((d,i)=>{
    const y = P.t + i*((h-P.t-P.b)/Math.max(1,items.length));
    const bh = Math.min(18,(h-P.t-P.b)/items.length-4);
    const w = (mx? d.v/mx*(W-P.l-P.r):0);
    return `<text x="${P.l-8}" y="${(y+bh/2+3.5).toFixed(1)}" font-size="10" fill="#1b1b1d" text-anchor="end">${d.k.length>13?d.k.slice(0,13)+'…':d.k}</text>
      <rect x="${P.l}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="#db0011" opacity="${(1-i*0.06).toFixed(2)}"/>
      <text x="${(P.l+w+8).toFixed(1)}" y="${(y+bh/2+3.5).toFixed(1)}" font-size="10" font-weight="700" fill="#a8000d">${d.v}</text>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="条形图">${rows}</svg>`;
}

/* ---- 客户全景：档案 + 体检 + 定价 + TOI ---- */
function renderVpOverview(){
  const sel = $('#vpCustSelect'); if(!sel) return;
  if(sel.options.length !== VP.length) sel.innerHTML = vpOpts(vpSel);
  const c = vpGet(sel.value); vpSel = c.id;
  $('#vpProfile').innerHTML = `
    <dt>客户名称</dt><dd><strong>${c.name}</strong></dd>
    <dt>集团 / 客户号</dt><dd>${c.group||'—'} · ${c.id}</dd>
    <dt>客户经理 / 客服</dt><dd>${c.rm||'—'} / ${c.cs||'—'}</dd>
    <dt>行业</dt><dd>${c.industry||'—'}${c.sub?' · '+c.sub:''}</dd>
    <dt>地区</dt><dd>${c.province||'—'} ${c.city||''}</dd>
    <dt>经营状态 / 成立年限</dt><dd>${(c.ext&&c.ext.operating_status)||'—'} · ${(c.ext&&c.ext.years_in_operation)!=null?(c.ext.years_in_operation+' 年'):'—'}</dd>
    <dt>员工数 / 集团成员</dt><dd>${(c.ext&&c.ext.employee_count)||'—'} / ${(c.ext&&c.ext.group_member_count)||'—'}</dd>`;
  const H = c.health;
  $('#vpHealthStrip').innerHTML = `
    <div class="signal"><span>健康评分</span><strong>${H.score}</strong><small>${H.level||''} · ${H.light||''}</small></div>
    <div class="signal"><span>定价治理</span><strong>${H.pg}</strong><small>/ 100</small></div>
    <div class="signal"><span>盈利贡献</span><strong>${H.pf}</strong><small>/ 100</small></div>
    <div class="signal"><span>数据质量</span><strong>${H.dq}</strong><small>红${H.n_red||0} · 黄${H.n_amber||0} · 绿${H.n_green||0}</small></div>`;
  const pb = $('#vpPricingBody');
  const pr = c.pricing||{};
  const rows = [];
  ['RMB','FCY','Omni','VA','CashPool'].forEach(k=>{
    const p = pr[k]; if(!p) return;
    rows.push(`<tr><td>${k}</td><td class="num">${p.value_list!=null?p.value_list:'—'}</td><td>${p.eff||'—'}</td><td>${p.exp||'—'}</td><td><span class="pill green">${p.status||'—'}</span></td></tr>`);
  });
  (pr.Deposit||[]).slice(0,5).forEach(p=>{
    rows.push(`<tr><td>Deposit · ${p.product||''}</td><td class="num">${p.value_list!=null?p.value_list:'—'}${p.pref!=null?' <small>(优'+p.pref+')</small>':''}</td><td>${p.eff||'—'}</td><td>—</td><td><span class="pill green">${p.status||'—'}</span></td></tr>`);
  });
  pb.innerHTML = rows.join('') || '<tr><td colspan="5">无定价记录</td></tr>';
  const toi = (c.toi||[]).filter(t=>t.total>0).map(t=>({m:t.month, v:t.total}));
  vpLineChart($('#vpToiChart'), toi, 220);
  $('#vpFcTip').textContent = c.fc ? `下月外推 P10 ${fmtShort(c.fc.p10)} · P50 ${fmtShort(c.fc.p50)} · P90 ${fmtShort(c.fc.p90)}` : '样本不足，无法外推';
}
$('#vpCustSelect') && $('#vpCustSelect').addEventListener('change', renderVpOverview);

/* ---- 数据校验：交易核验 ---- */
function renderVpTx(){
  const sel = $('#vpxCustSelect'); if(!sel) return;
  if(sel.options.length !== VP.length) sel.innerHTML = vpOpts(vpSel);
  const c = vpGet(sel.value);
  // monthly payments: last 12 months, sum CNY+FCY (ccy within each month entry)
  const pays = c.pay||[];
  const last12 = pays.slice(-12);
  vpLineChart($('#vpPayChart'), last12.map(p=>({m:p.month.slice(2), v:p.amt})), 200);
  const dep = (c.dep||[]).filter(d=>d.ccy==='CNY').slice(-12);
  vpLineChart($('#vpDepChart'), dep.map(d=>({m:d.month.slice(2), v:d.close})), 200);
  // same-name
  const realtime = c.integration && c.integration.source === 'llm';
  const demo = realtime && c.integration.demo;
  const providerNames = {aliyun:'阿里云', bigmodel:'智谱'};
  const provider = realtime && c.integration.provider
    ? `${providerNames[c.integration.provider]||c.integration.provider}${c.integration.fallback_used?'（备用）':''} · ` : '';
  const keywordCategories = window.getSameNameKeywordCategories
    ? window.getSameNameKeywordCategories(c) : [];
  const candidateHtml = keywordCategories.length
    ? `<div style="margin-top:12px;padding-top:8px;border-top:1px solid #ececef"><strong>候选词库（非实际命中）</strong>${keywordCategories.map(k=>`<p class="chart-note same-keyword" style="margin:4px 0"><b>${esc(k.label)}</b> · ${esc(k.keywords.join('、'))}</p>`).join('')}</div>` : '';
  $('#vpSameBody').innerHTML = (c.same&&c.same.length)
    ? c.same.map(s=>`<div class="kv" style="padding:8px 0;border-bottom:1px solid #ececef"><dt>${esc(s.name)}</dt><dd>${Number(s.cnt)||0} 笔 · 金额 ${fmtShort(Number(s.amt)||0)} · ${esc(s.bank||'—')}<span class="chart-note" style="display:block;margin:4px 0 0">附言：${esc(s.narrative||'—')}<br>资金用途：${esc(s.purpose||'交易附言不足，无法判断用途')}</span></dd></div>`).join('')
    : `<p class="chart-note">${realtime?'本次实时分析未发现符合筛选条件的同名跨行转账。':'尚未运行实时 LLM 同名转账分析。'}</p>${candidateHtml}`;
  // keywords
  const kw = (c.kw||[]).slice(0,8).map(([k,v])=>({k, v}));
  $('#vpKwChart').innerHTML = kw.length ? '' : '<p class="chart-note">无关键词命中</p>';
  if(kw.length) vpBarChart($('#vpKwChart'), kw, Math.max(120, kw.length*30));
  // counterparties
  $('#vpCpBody').innerHTML = (c.cp||[]).map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.bank||'—')}</td><td class="num">${Number(p.cnt)||0}</td><td class="num">${fmtShort(Number(p.amt)||0)}</td></tr>`).join('') || '<tr><td colspan="4">暂无数据，请运行健康检查</td></tr>';
  const meta = $('#vpIntegrationMeta');
  if(meta){
    meta.textContent = realtime
      ? `${demo ? '模拟演示 · ' : ''}${provider}LLM 分析 · ${c.integration.model||'未命名模型'} · ${Number(c.integration.transaction_count)||0} 笔流水 · ${new Date(c.integration.fetched_at).toLocaleString('zh-CN')}`
      : 'Top 10 与同名转账当前为预聚合样例；运行健康检查后由 SQLite 模拟逐笔流水和大模型更新，仅用于演示。';
  }
}
$('#vpxCustSelect') && $('#vpxCustSelect').addEventListener('change', renderVpTx);

/* ---- 管理视图：真实跨客户数据 ---- */
function renderVpManagement(){
  if(!VP.length) return;
  const c1 = $('#vpMgmtHealth'); if(!c1) return;
  // health score distribution buckets
  const buckets = [[90,'≥90 优'],[80,'80–89 良'],[70,'70–79 中'],[0,'<70 待改进']];
  const cnt = buckets.map(([t,k])=>({k, v: VP.filter(c=>(c.health.score||0)>=t).length}));
  cnt[1].v -= cnt[0].v; cnt[2].v -= cnt[0].v + cnt[1].v; cnt[3].v -= cnt[0].v + cnt[1].v + cnt[2].v;
  vpBarChart(c1, cnt, 190);
  // traffic light donut
  const lights = ['Red','Amber','Green'];
  const lc = lights.map(l=>VP.filter(c=>String(c.health.light||'').toLowerCase().startsWith(l.toLowerCase())).length);
  const colors = ['#db0011','#a86200','#12805f'];
  const total = lc.reduce((a,b)=>a+b,0) || 1;
  let off = 0; const R = 52, C = 2*Math.PI*R;
  const seg = lc.map((v,i)=>{
    const len = v/total*C;
    const s = `<circle cx="86" cy="86" r="${R}" fill="none" stroke="${colors[i]}" stroke-width="24" stroke-dasharray="${len.toFixed(1)} ${(C-len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 86 86)"/>`;
    off += len; return s;
  }).join('');
  $('#vpMgmtDonut').innerHTML = `<svg viewBox="0 0 172 172" role="img" aria-label="红黄绿灯分布">${seg}
    <text x="86" y="82" text-anchor="middle" font-size="22" font-weight="700" fill="#1b1b1d">${VP.length}</text>
    <text x="86" y="100" text-anchor="middle" font-size="10" fill="#74747b">客户</text></svg>`;
  $('#vpMgmtDonutLegend').innerHTML = lights.map((l,i)=>`<span class="vp-light-item" data-light="${l}" style="cursor:pointer;user-select:none${i===vpLightSel?'':';opacity:.45'}"><i style="background:${colors[i]}"></i>${l==='Red'?'红灯':l==='Amber'?'黄灯':'绿灯'} ${lc[i]} 户</span>`).join('');
  // 点击甜甜圈或图例 → 显示该灯客户列表
  const showList = (li)=>{
    vpLightSel = li;
    const l = lights[li];
    const custs = VP.filter(c=>String(c.health.light||'').toLowerCase().startsWith(l.toLowerCase()));
    $('#vpMgmtCustList').innerHTML = custs.length ? `
      <p class="section-kicker" style="margin:0 0 6px">${l==='Red'?'红灯':l==='Amber'?'黄灯':'绿灯'}客户 · ${custs.length} 户</p>
      ${custs.map(c=>`<div class="focus-item" style="padding:7px 0"><span class="rank" style="background:${colors[li]}">${(c.health.score!=null?c.health.score:'—')}</span><div><strong>${c.name}</strong><p>${c.industry||'—'} · ${c.rm||'—'} · 红发现项 ${c.health.n_red||0} / 黄 ${c.health.n_amber||0}</p></div></div>`).join('')}`
      : `<p class="chart-note">该灯暂无客户。</p>`;
    $('#vpMgmtDonutLegend').querySelectorAll('.vp-light-item').forEach((el,i)=>{
      el.style.opacity = (i===li || li==null) ? '' : '.45';
    });
  };
  const donutEl = $('#vpMgmtDonut');
  donutEl.onclick = ()=> showList((vpLightSel+1)%3);
  $('#vpMgmtDonutLegend').querySelectorAll('.vp-light-item').forEach((el,i)=>{ el.onclick = ()=> showList(i); });
  showList(0);
  // avg TOI trend across customers (last 12 months)
  const months = [...new Set(VP.flatMap(c=>(c.toi||[]).map(t=>t.month)))].sort().filter(m=>VP.some(c=>{const t=(c.toi||[]).find(x=>x.month===m);return t&&t.total>0;})).slice(-12);
  const trend = months.map(m=>({m:m.slice(2), v: VP.reduce((a,c)=>{const t=(c.toi||[]).find(x=>x.month===m);return a+(t&&t.total||0);},0)}));
  vpLineChart($('#vpMgmtTrend'), trend, 200);
  // red/amber finding counts per customer (top)
  const rows = VP.map(c=>({k:c.name, v:(c.health.n_red||0), amber:(c.health.n_amber||0)}))
    .sort((a,b)=>(b.v+b.amber)-(a.v+a.amber)).slice(0,8);
  $('#vpMgmtFindings').innerHTML = rows.map((r,i)=>{
    const mx = Math.max(1,...rows.map(x=>x.v+x.amber));
    const W = 580, L = 150, bw = (W-L-20);
    const y = 10 + i*26;
    return `<text x="${L-8}" y="${y+12}" font-size="10" fill="#1b1b1d" text-anchor="end">${r.k.length>10?r.k.slice(0,10)+'…':r.k}</text>
      <rect x="${L}" y="${y}" width="${(r.v/mx*bw).toFixed(1)}" height="10" rx="2" fill="#db0011"/>
      <rect x="${(L+r.v/mx*bw).toFixed(1)}" y="${y}" width="${(r.amber/mx*bw).toFixed(1)}" height="10" rx="2" fill="#f0aeb4"/>
      <text x="${W-14}" y="${y+12}" font-size="10" font-weight="700" fill="#a8000d" text-anchor="end">${r.v}红/${r.amber}黄</text>`;
  }).join('');
  const wrap = $('#vpMgmtFindings').closest('.chart-box') || $('#vpMgmtFindings');
  wrap.innerHTML = `<svg viewBox="0 0 580 ${10+rows.length*26}" role="img" aria-label="红黄发现项">${$('#vpMgmtFindings').innerHTML}</svg>`;
}

/* VP 数据视图初始化（置于 VP 定义之后） */
renderVpOverview();
renderVpTx();
renderVpManagement();
