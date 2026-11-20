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

/* ---------- 路由 ---------- */
const ROUTES={overview:'view-overview',workbench:'view-workbench',report:'view-report',data:'view-data',management:'view-management'};
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
  $('#agentList').innerHTML=AGENTS.map((a,i)=>`<div class="agent-row" data-i="${i}">
    <span class="agent-symbol">${a.sym}</span>
    <div><strong>${a.name}</strong><p>${a.desc}</p></div>
    <span class="agent-state">待运行</span></div>`).join('');
}
function renderSteps(){
  $('#stepTimeline').innerHTML=STEPS.map((s,i)=>`<div class="step-tl ${s.cls||''}" data-s="${i}">
    <span>${s.n}</span><div><strong>${s.t}</strong><p>${s.d}</p></div><em>${s.e}</em></div>`).join('');
}
$('#startCheck').onclick=()=>{
  go('workbench');
  const status=$('#roomStatus'),bar=$('#wbProgress'),ho=$('#handoff'),ht=$('#handoffText');
  const btn=$('#startCheck');
  btn.disabled=true;
  const rows=$$('#agentList .agent-row'),tl=$$('#stepTimeline .step-tl'),chain=$$('#chain .chain-step');
  rows.forEach(r=>{r.className='agent-row';r.querySelector('.agent-state').textContent='待运行';});
  tl.forEach(t=>t.classList.remove('running','done'));
  chain.forEach(c=>c.classList.remove('active','done'));
  status.className='status-pill running';status.innerHTML='<i></i>体检中';
  ho.classList.remove('hidden');
  let i=0;
  const tick=()=>{
    if(i>0){
      rows[i-1].className='agent-row done';
      rows[i-1].querySelector('.agent-state').textContent='完成';
      if(tl[i-1])tl[i-1].classList.add('done');
      if(chain[i-1]){chain[i-1].classList.remove('active');chain[i-1].classList.add('done');}
    }
    if(i>=AGENTS.length){
      tl.forEach(t=>t.classList.add('done'));
      chain.forEach(c=>{c.classList.remove('active');c.classList.add('done');});
      status.className='status-pill done';status.innerHTML='<i></i>已完成';
      bar.style.width='100%';
      ht.textContent='体检完成 — 已产出内部决策包 VP-2026-1042，含执行一致性独立议题 1 项';
      btn.disabled=false;
      toast('适配体检完成 · 决策包已生成');
      return;
    }
    rows[i].className='agent-row working';
    rows[i].querySelector('.agent-state').textContent='运行中';
    ht.textContent=AGENTS[i].msg;
    bar.style.width=Math.round(((i+1)/AGENTS.length)*100)+'%';
    if(tl[i])tl[i].classList.add('running');
    if(chain[i])chain[i].classList.add('active');
    i++;
    setTimeout(tick,780);
  };
  tick();
};

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

/* ---------- 加载客户列表 ---------- */
async function loadCustomersFromAPI(){
  try{
    const res=await fetch('/api/customers');
    const customers=await res.json();
    const sel=$('#clientSelect');
    const badge=$('#clientBadge');
    sel.innerHTML='<option value="">-- 选择客户 --</option>';
    customers.forEach(c=>{
      const opt=document.createElement('option');
      opt.value=c.customer_id;
      opt.textContent=c.client_name+' · '+c.customer_id;
      sel.appendChild(opt);
    });
    if(badge&&customers.length>0){
      const first=customers[0].client_name;
      badge.textContent=first.charAt(0);
    }
  }catch(e){
    console.error('Failed to load customers:',e);
    $('#clientSelect').innerHTML='<option value="">加载失败</option>';
  }
}

/* ---------- 初始化 ---------- */
renderAgents();
renderSteps();
renderDatasetNav();
renderDataset('profile');
renderAll();
loadCustomersFromAPI();
