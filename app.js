// ══ Main App ══
// Data will be decompressed after pako loads
let DASHBOARD_DATA = {};

// Decompress data
(function(){
  try {
    const b64 = DASHBOARD_DATA_COMPRESSED;
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    const json = pako.inflate(arr, {to:'string'});
    DASHBOARD_DATA = JSON.parse(json);
  } catch(e){ console.error('Decompress error:', e); }
})();


const refDate = DASHBOARD_DATA.refDate;

// ── Deduplication: กรองบิลซ้ำออก ──
// สาเหตุ: NSS ส่งข้อมูลแบบ split row — บิลเดียวกันมี 2 แถว
// แถวหนึ่งแสดง "จำนวนทั้งบิล" อีกแถวแสดง "จำนวนที่เหลือ"
// Rule: เลือกแถวที่ "จำนวน" = "จำนวนทั้งบิล" (แถวที่ครบถ้วน)
//       ถ้าไม่มีแถวที่ตรง ให้เลือกแถวแรก (first occurrence)
(function deduplicateBills(rawBills) {
  const seen = new Map(); // billNo → best row index
  const dupeNos = new Set();

  rawBills.forEach((b, i) => {
    const key = b.no;
    if (seen.has(key)) {
      dupeNos.add(key);
      const prevIdx = seen.get(key);
      const prev = rawBills[prevIdx];
      // ถ้าแถวใหม่มี จำนวน = จำนวนทั้งบิล ให้ใช้แทน
      if (b.qty !== undefined && b.totalQty !== undefined && b.qty === b.totalQty) {
        seen.set(key, i);
      }
      // ถ้าแถวเดิมยังไม่ดี แต่แถวใหม่ก็ไม่ดีเหมือนกัน → คงเดิม
    } else {
      seen.set(key, i);
    }
  });

  const dedupedBills = Array.from(seen.values()).map(i => rawBills[i]);

  // แสดง warning ถ้ามีบิลซ้ำ
  if (dupeNos.size > 0) {
    window._dupeBillCount = dupeNos.size;
    window._dupeBillNos = Array.from(dupeNos);
  }

  return dedupedBills;
})(DASHBOARD_DATA.bills);

// ถ้า DASHBOARD_DATA.bills มี field qty/totalQty ให้ใช้ dedup
// ถ้าไม่มี (โครงสร้างต่างออกไป) ให้ fallback dedup แบบ first-seen
const _rawBills = DASHBOARD_DATA.bills;
const _seenBillNos = new Map();
const _dupeSet = new Set();
_rawBills.forEach((b, i) => {
  if (_seenBillNos.has(b.no)) {
    _dupeSet.add(b.no);
  } else {
    _seenBillNos.set(b.no, i);
  }
});
// เลือกเฉพาะแถวที่ดีที่สุด: qty===totalQty หรือ first occurrence
const _bestRows = new Map();
_rawBills.forEach((b, i) => {
  const key = b.no;
  if (!_bestRows.has(key)) {
    _bestRows.set(key, i);
  } else {
    // ถ้าแถวใหม่มี qty เท่ากับ totalQty ให้แทน
    if (Number(b.qty) === Number(b.totalQty) && Number(b.qty) > 0) {
      _bestRows.set(key, i);
    }
  }
});
const bills = Array.from(_bestRows.values()).map(i => _rawBills[i]);

// สรุป dedup stats
const _dupeBillCount = _dupeSet.size;
const _totalRawCount = _rawBills.length;
const _dedupedCount = bills.length;

const PROB_CFG = {
  'สถานะบิลคงค้างขนย้าย': {label:'คงค้างขนย้าย', icon:'fa-truck-arrow-right', color:'#c85000', bg:'#fff0e6'},
  'สถานะบิลคงค้างกระจาย': {label:'คงค้างกระจาย', icon:'fa-diagram-project', color:'#2b55b8', bg:'#e8f0ff'},
  'สถานะบิลคงค้างDC แผนกธุรการสาขา': {label:'ธุรการสาขา', icon:'fa-pen-to-square', color:'#6b2bb8', bg:'#f0e8ff'},
  'ไม่ระบุ': {label:'ไม่ระบุ', icon:'fa-circle-question', color:'#8a9ab0', bg:'#f4f7fa'},
};
const PROB_ORDER = ['สถานะบิลคงค้างขนย้าย','สถานะบิลคงค้างกระจาย','สถานะบิลคงค้างDC แผนกธุรการสาขา'];

function ageCls(st){ return st==='เกิน KPI'?'age-over':st==='เริ่มช้า'?'age-slow':'age-ok'; }
function typeCls(t){ return t&&t.includes('Cold')?'type-cold':'type-dry'; }
function typeLabel(t){ return t&&t.includes('Cold')?'<i class="fa-solid fa-snowflake" style="font-size:9px;margin-right:3px;color:#006BB6"></i>สินค้าคุมอุณหภูมิ':'<i class="fa-solid fa-cubes" style="font-size:9px;margin-right:3px;color:#f0a500"></i>สินค้าทั่วไป'; }
function probLabel(p){ return (PROB_CFG[p]||{label:p}).label; }
function probCfg(p){ return PROB_CFG[p]||{label:p,bg:'#f4f7fa',color:'#8a9ab0'}; }

// ── Populate f-dc dropdown dynamically from data ──
function populateDCDropdown(){
  const sel = document.getElementById('f-dc');
  const allDC = [...new Set(bills.map(b=>b.dcFocus))].sort((a,b)=>{
    const na = parseInt(a), nb = parseInt(b);
    if(!isNaN(na)&&!isNaN(nb)) return na-nb;
    return a.localeCompare(b,'th');
  });
  allDC.forEach(dc=>{
    const opt = document.createElement('option');
    opt.value = dc;
    opt.textContent = dc;
    sel.appendChild(opt);
  });
}

// ── Tab switch ──
function switchTab(id, btn){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
}

// ── Risk level mapping from อายุบิล sheet ──
// สินค้าทั่วไป: ขนย้าย, กระจาย, ธุรการ
// สินค้า Coldchain: ขนย้าย, กระจาย, ธุรการ
function getRiskLevel(age, prodType, probType){
  const isCold = prodType && prodType.includes('Cold');
  const d = Math.round(age||0);
  if(probType === 'สถานะบิลคงค้างDC แผนกธุรการสาขา'){
    if(d<=5) return 'กลุ่ม Clear ปกติ';
    if(d<=7) return 'กลุ่ม Clear ต้องเร่งจัดการ';
    return 'กลุ่ม Clear วิกฤต';
  }
  if(isCold){
    // Coldchain
    if(probType === 'สถานะบิลคงค้างขนย้าย'){
      if(d<=1) return 'ปกติ'; if(d<=5) return 'เริ่มเสี่ยง'; if(d<=7) return 'ต้องเร่งจัดการ'; return 'วิกฤต';
    }
    // กระจาย Coldchain: เข้มกว่า
    if(d<=1) return 'ปกติ'; if(d<=3) return 'เริ่มเสี่ยง'; if(d<=5) return 'ต้องเร่งจัดการ'; return 'วิกฤต';
  } else {
    // ทั่วไป
    if(probType === 'สถานะบิลคงค้างขนย้าย'){
      if(d<=1) return 'ปกติ'; if(d<=5) return 'เริ่มเสี่ยง'; if(d<=7) return 'ต้องเร่งจัดการ'; return 'วิกฤต';
    }
    // กระจาย ทั่วไป
    if(d<=2) return 'ปกติ'; if(d<=5) return 'เริ่มเสี่ยง'; if(d<=7) return 'ต้องเร่งจัดการ'; return 'วิกฤต';
  }
}

// ── Active filter state ──
let activeRiskFilter = '';      // 'ปกติ' | 'เริ่มเสี่ยง' | 'วิกฤต+เร่งจัดการ'
let activeProbFilter = '';
let activeAgeFilter = '';       // legacy — kept for DC tab compat
let activeTypeFilter = '';      // 'สินค้าทั่วไป' | 'สินค้า Coldchain' | ''
const _probKeys = [];

function resetAllFilters(){
  activeRiskFilter=''; activeProbFilter=''; activeAgeFilter=''; activeTypeFilter='';
  document.querySelectorAll('.sum-card,.risk-cell,.prob-cell').forEach(el=>el.classList.remove('rc-active','pc-active','active'));
  // reset overview seg bars
  document.querySelectorAll('#ov-seg-type .seg-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.querySelectorAll('#ov-seg-prob .seg-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  renderOverview();
}

function filterByRisk(riskVal, cardId){
  activeRiskFilter = activeRiskFilter===riskVal ? '' : riskVal;
  activeProbFilter=''; activeTypeFilter='';
  document.querySelectorAll('.sum-card').forEach(el=>el.classList.remove('active'));
  if(activeRiskFilter) document.querySelector('.sum-card.s-'+cardId.replace('sum-',''))?.classList.add('active');
  document.querySelectorAll('.risk-cell,.prob-cell').forEach(el=>el.classList.remove('rc-active','pc-active'));
  renderOverview();
}

function filterByRiskType(riskVal, typeKey, prefix){
  const prodType = typeKey==='dry' ? 'สินค้าทั่วไป' : 'สินค้า Coldchain';
  // toggle
  if(activeRiskFilter===riskVal && activeTypeFilter===prodType){
    activeRiskFilter=''; activeTypeFilter='';
  } else {
    activeRiskFilter=riskVal; activeTypeFilter=prodType; activeProbFilter='';
  }
  document.querySelectorAll('.risk-cell,.prob-cell,.sum-card').forEach(el=>el.classList.remove('rc-active','pc-active','active'));
  if(activeRiskFilter){
    event.currentTarget.classList.add('rc-active');
  }
  renderOverview();
}

function filterByProbType(probVal, typeKey, prefix){
  const prodType = typeKey==='dry' ? 'สินค้าทั่วไป' : 'สินค้า Coldchain';
  if(activeProbFilter===probVal && activeTypeFilter===prodType){
    activeProbFilter=''; activeTypeFilter='';
  } else {
    activeProbFilter=probVal; activeTypeFilter=prodType; activeRiskFilter='';
  }
  document.querySelectorAll('.risk-cell,.prob-cell,.sum-card').forEach(el=>el.classList.remove('rc-active','pc-active','active'));
  if(activeProbFilter){
    event.currentTarget.classList.add('pc-active');
  }
  renderOverview();
}

function filterByAge(ageVal){ activeAgeFilter = activeAgeFilter===ageVal ? '' : ageVal; renderOverview(); }

/* ── V5-7: Type Toggle — sub-filter ต่อจากการ์ด 4 หลัก ── */
function setTypeToggle(typeVal, btn){
  // toggle: ถ้ากดซ้ำ = ยกเลิก
  activeTypeFilter = activeTypeFilter===typeVal ? '' : typeVal;
  // ไม่ reset activeProbFilter — ให้ทำงานเป็น AND กับการ์ดที่เลือกไว้
  activeRiskFilter=''; activeAgeFilter='';
  // update button states
  document.querySelectorAll('.type-toggle-btn').forEach(b=>{
    b.classList.remove('active-all','active-dry','active-cold');
  });
  if(activeTypeFilter===''){
    document.getElementById('ttb-all')?.classList.add('active-all');
  } else if(activeTypeFilter.includes('Cold')){
    document.getElementById('ttb-cold')?.classList.add('active-cold');
  } else {
    document.getElementById('ttb-dry')?.classList.add('active-dry');
  }
  renderOverview();
}

/* ── V5-8: Overview seg filter functions ── */
function setOvTypeSeg(typeVal, btn){
  activeTypeFilter = activeTypeFilter===typeVal ? '' : typeVal;
  activeRiskFilter=''; activeAgeFilter='';
  document.querySelectorAll('#ov-seg-type .seg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderOverview();
}

function setOvProbSeg(probVal, btn){
  activeProbFilter = activeProbFilter===probVal ? '' : probVal;
  activeRiskFilter=''; activeAgeFilter='';
  document.querySelectorAll('#ov-seg-prob .seg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderOverview();
}

/* ── V5-7: filterByProbSum — กดการ์ด 4 หลัก, reset type toggle กลับ "ทั้งหมด" ── */
function filterByProbSum(probVal, cardId){
  // toggle: ถ้ากดซ้ำ = ยกเลิก
  if(activeProbFilter===probVal){
    activeProbFilter='';
  } else {
    activeProbFilter=probVal;
    // เมื่อเลือกกลุ่มใหม่ ให้ reset type toggle กลับ "ทั้งหมด"
    activeTypeFilter='';
    document.querySelectorAll('.type-toggle-btn').forEach(b=>b.classList.remove('active-all','active-dry','active-cold'));
    document.getElementById('ttb-all')?.classList.add('active-all');
  }
  activeRiskFilter=''; activeAgeFilter='';
  // update sum-card active state
  document.querySelectorAll('.sum-card').forEach(el=>el.classList.remove('active'));
  if(activeProbFilter){
    const cls = cardId.replace('sum-','s-');
    document.querySelector('.sum-card.'+cls)?.classList.add('active');
  }
  document.querySelectorAll('.risk-cell,.prob-cell').forEach(el=>el.classList.remove('rc-active','pc-active'));
  renderOverview();
}
function setProbFilter(idx){ const p=_probKeys[idx]; if(!p) return; activeProbFilter=activeProbFilter===p?'':p; renderOverview(); }

function renderOverview(){
  document.getElementById('hdr-date').textContent = refDate;
  document.getElementById('h-refdate').textContent = refDate;

  // Cache risk for all bills first
  bills.forEach(b=>{ b._risk = getRiskLevel(b.age, b.type, b.problem); });

  // Filtered bill set — ใช้นับตัวเลขการ์ดและ DC
  const filteredBills = (activeProbFilter || activeTypeFilter || activeRiskFilter || activeAgeFilter)
    ? bills.filter(b=>{
        const typeOk = !activeTypeFilter || b.type===activeTypeFilter;
        const probOk = !activeProbFilter || b.problem===activeProbFilter;
        const ageOk  = !activeAgeFilter  || b.ageStatus===activeAgeFilter;
        const riskOk = !activeRiskFilter || (
          activeRiskFilter==='วิกฤต+เร่งจัดการ' ? (b._risk==='วิกฤต'||b._risk==='ต้องเร่งจัดการ') :
          b._risk===activeRiskFilter
        );
        return typeOk && probOk && ageOk && riskOk;
      })
    : bills;

  // Compute risk for all bills (ใช้ bills ทั้งหมดเพื่อ Hero section)
  const total=filteredBills.length;
  let okCnt=0, riskCnt=0, urgeCnt=0, critCnt=0, clearCnt=0, clearOk=0, clearUrge=0, clearCrit=0;
  let dryOk=0,dryRisk=0,dryUrge=0,dryCrit=0,dryClear=0,dryTotal=0;
  let coldOk=0,coldRisk=0,coldUrge=0,coldCrit=0,coldClear=0,coldTotal=0;
  let dryTrans=0,dryDist=0,dryAdmin=0;
  let coldTrans=0,coldDist=0,coldAdmin=0;
  const avgAge = total>0 ? (filteredBills.reduce((s,b)=>s+(b.age||0),0)/total) : 0;

  filteredBills.forEach(b=>{
    const rl = b._risk;
    const isCold = b.type && b.type.includes('Cold');
    if(rl==='ปกติ') okCnt++;
    else if(rl==='เริ่มเสี่ยง') riskCnt++;
    else if(rl==='ต้องเร่งจัดการ') urgeCnt++;
    else if(rl==='วิกฤต') critCnt++;
    else if(rl.startsWith('กลุ่ม Clear')){
      clearCnt++;
      if(rl==='กลุ่ม Clear วิกฤต') clearCrit++;
      else if(rl==='กลุ่ม Clear ต้องเร่งจัดการ') clearUrge++;
      else clearOk++;
    }
    if(isCold){
      coldTotal++;
      if(rl==='ปกติ') coldOk++; else if(rl==='เริ่มเสี่ยง') coldRisk++; else if(rl==='ต้องเร่งจัดการ') coldUrge++; else if(rl==='วิกฤต') coldCrit++; else if(rl.startsWith('กลุ่ม Clear')) coldClear++;
      if(b.problem==='สถานะบิลคงค้างขนย้าย') coldTrans++;
      else if(b.problem==='สถานะบิลคงค้างกระจาย') coldDist++;
      else coldAdmin++;
    } else {
      dryTotal++;
      if(rl==='ปกติ') dryOk++; else if(rl==='เริ่มเสี่ยง') dryRisk++; else if(rl==='ต้องเร่งจัดการ') dryUrge++; else if(rl==='วิกฤต') dryCrit++; else if(rl.startsWith('กลุ่ม Clear')) dryClear++;
      if(b.problem==='สถานะบิลคงค้างขนย้าย') dryTrans++;
      else if(b.problem==='สถานะบิลคงค้างกระจาย') dryDist++;
      else dryAdmin++;
    }
  });

  // Hero — ใช้ bills ทั้งหมด (ไม่ filter) เพื่อให้ progress bar สะท้อน overview จริง
  const over=bills.filter(b=>b.ageStatus==='เกิน KPI').length;
  const slow=bills.filter(b=>b.ageStatus==='เริ่มช้า').length;
  const ok2=bills.filter(b=>b.ageStatus==='ปกติ').length;
  const heroTotal=bills.length;
  document.getElementById('h-total').textContent=total.toLocaleString();
  document.getElementById('h-over').textContent=over.toLocaleString();
  document.getElementById('h-slow').textContent=slow.toLocaleString();
  document.getElementById('h-ok').textContent=ok2.toLocaleString();
  document.getElementById('h-bar').style.width=(total>0?Math.round((over+slow)/total*100):0)+'%';

  // Summary row
  const critTotal = urgeCnt+critCnt;
  document.getElementById('s-total').textContent=total.toLocaleString();
  document.getElementById('s-ok').textContent=okCnt.toLocaleString();
  document.getElementById('s-risk').textContent=riskCnt.toLocaleString();
  document.getElementById('s-crit').textContent=critTotal.toLocaleString();

  // s-total-sub: แสดงสถานะ filter ที่ active
  const PROB_SHORT = {
    'สถานะบิลคงค้างขนย้าย': 'คงค้างขนย้าย',
    'สถานะบิลคงค้างกระจาย': 'คงค้างกระจาย',
    'สถานะบิลคงค้างDC แผนกธุรการสาขา': 'ธุรการสาขา'
  };
  const typeLabel = activeTypeFilter ? (activeTypeFilter.includes('Cold') ? 'สินค้าคุมอุณหภูมิ' : 'สินค้าทั่วไป') : '';
  const probLabel = activeProbFilter ? (PROB_SHORT[activeProbFilter] || activeProbFilter) : '';
  const subParts2 = [probLabel, typeLabel].filter(Boolean);
  document.getElementById('s-total-sub').textContent = subParts2.length ? subParts2.join(' › ') : 'ทุกประเภทสินค้า';

  // sub numbers ของการ์ด — ถ้า filter type แล้ว แสดงตาม type นั้น
  if(activeTypeFilter && activeTypeFilter.includes('Cold')){
    document.getElementById('s-ok-sub').textContent=`สินค้า CC ${coldTrans}`;
    document.getElementById('s-risk-sub').textContent=`สินค้า CC ${coldDist}`;
    document.getElementById('s-crit-sub').textContent=`สินค้า CC ${coldAdmin}`;
  } else if(activeTypeFilter){
    document.getElementById('s-ok-sub').textContent=`สินค้า AB ${dryTrans}`;
    document.getElementById('s-risk-sub').textContent=`สินค้า AB ${dryDist}`;
    document.getElementById('s-crit-sub').textContent=`สินค้า AB ${dryAdmin}`;
  } else {
    document.getElementById('s-ok-sub').textContent=`สินค้า AB ${dryTrans} · สินค้า CC ${coldTrans}`;
    document.getElementById('s-risk-sub').textContent=`สินค้า AB ${dryDist} · สินค้า CC ${coldDist}`;
    document.getElementById('s-crit-sub').textContent=`สินค้า AB ${dryAdmin} · สินค้า CC ${coldAdmin}`;
  }

  // Product group blocks
  document.getElementById('pg-dry-total').textContent=dryTotal.toLocaleString();
  document.getElementById('pg-cold-total').textContent=coldTotal.toLocaleString();
  // Dry risk cells
  document.getElementById('rc-dry-ok').textContent=dryOk.toLocaleString();
  document.getElementById('rc-dry-warn').textContent=dryRisk.toLocaleString();
  document.getElementById('rc-dry-urge').textContent=dryUrge.toLocaleString();
  document.getElementById('rc-dry-crit').textContent=dryCrit.toLocaleString();
  // Cold risk cells
  document.getElementById('rc-cold-ok').textContent=coldOk.toLocaleString();
  document.getElementById('rc-cold-warn').textContent=coldRisk.toLocaleString();
  document.getElementById('rc-cold-urge').textContent=coldUrge.toLocaleString();
  document.getElementById('rc-cold-crit').textContent=coldCrit.toLocaleString();
  // Problem cells
  document.getElementById('pc-dry-trans').textContent=dryTrans.toLocaleString();
  document.getElementById('pc-dry-dist').textContent=dryDist.toLocaleString();
  document.getElementById('pc-dry-admin').textContent=dryAdmin.toLocaleString();
  document.getElementById('pc-cold-trans').textContent=coldTrans.toLocaleString();
  document.getElementById('pc-cold-dist').textContent=coldDist.toLocaleString();
  document.getElementById('pc-cold-admin').textContent=coldAdmin.toLocaleString();

  // avg (legacy hidden elements)
  document.getElementById('s-avg').textContent=avgAge.toFixed(1);
  document.getElementById('s-avg-sub').textContent='วันเฉลี่ย';

  // ── update 6-card summary block ──
  update6Cards({
    total, dryTotal, coldTotal,
    critCnt, dryCrit, coldCrit,
    urgeCnt, dryUrge, coldUrge,
    riskCnt, dryRisk, coldRisk,
    clearCnt, dryClear, coldClear, clearOk, clearUrge, clearCrit,
    okCnt, dryOk, coldOk
  });

  renderDCOverview();
}

/* ── 6-card update helper ── */
function update6Cards(d){
  const t = d.total || 1; // avoid /0
  function pct(n){ return t>0 ? Math.round(n/t*100) : 0; }
  function set(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }
  function bar(id,n){ const el=document.getElementById(id); if(el) el.style.width=Math.min(100,pct(n))+'%'; }
  function pctTxt(id,n){ const el=document.getElementById(id); if(el) el.textContent=t>0?pct(n)+'%':'—'; }

  // บิลรวม
  set('sc6n-total', d.total.toLocaleString());
  set('sc6p-dry-total', d.dryTotal.toLocaleString());
  set('sc6p-cold-total', d.coldTotal.toLocaleString());
  // วิกฤต
  set('sc6n-crit', d.critCnt.toLocaleString());
  set('sc6p-dry-crit', d.dryCrit.toLocaleString());
  set('sc6p-cold-crit', d.coldCrit.toLocaleString());
  bar('sc6b-crit', d.critCnt); pctTxt('sc6t-crit', d.critCnt);
  const critCard=document.getElementById('sc6-crit');
  if(critCard) critCard.classList.toggle('has-danger', d.critCnt>0);
  // ต้องเร่งจัดการ
  set('sc6n-urge', d.urgeCnt.toLocaleString());
  set('sc6p-dry-urge', d.dryUrge.toLocaleString());
  set('sc6p-cold-urge', d.coldUrge.toLocaleString());
  bar('sc6b-urge', d.urgeCnt); pctTxt('sc6t-urge', d.urgeCnt);
  const urgeCard=document.getElementById('sc6-urge');
  if(urgeCard) urgeCard.classList.toggle('has-danger', d.urgeCnt>0);
  // เริ่มเสี่ยง
  set('sc6n-warn', d.riskCnt.toLocaleString());
  set('sc6p-dry-warn', d.dryRisk.toLocaleString());
  set('sc6p-cold-warn', d.coldRisk.toLocaleString());
  bar('sc6b-warn', d.riskCnt); pctTxt('sc6t-warn', d.riskCnt);
  // กลุ่ม Clear
  set('sc6n-clear', d.clearCnt.toLocaleString());
  set('sc6p-dry-clear', d.dryClear.toLocaleString());
  set('sc6p-cold-clear', d.coldClear.toLocaleString());
  bar('sc6b-clear', d.clearCnt); pctTxt('sc6t-clear', d.clearCnt);
  set('sc6n-clear-ok',   d.clearOk.toLocaleString());
  set('sc6n-clear-urge', d.clearUrge.toLocaleString());
  set('sc6n-clear-crit', d.clearCrit.toLocaleString());
  // ปกติ
  set('sc6n-ok', d.okCnt.toLocaleString());
  set('sc6p-dry-ok', d.dryOk.toLocaleString());
  set('sc6p-cold-ok', d.coldOk.toLocaleString());
  bar('sc6b-ok', d.okCnt); pctTxt('sc6t-ok', d.okCnt);
}



let dcSortMode='count'; // 'count' | 'age'

function setDCSort(mode, btn){
  dcSortMode=mode;
  document.querySelectorAll('#dc-sort-count,#dc-sort-age').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderDCOverview();
}

function renderDCOverview(){
  const hasFilter = !!(activeProbFilter||activeAgeFilter||activeRiskFilter||activeTypeFilter);

  // Build full DC map — track all 5 risk levels
  const dcMapAll={};
  bills.forEach(b=>{
    const dc=b.dcFocus;
    if(!dcMapAll[dc]) dcMapAll[dc]={
      total:0, maxAge:0,
      rOk:0, rWarn:0, rUrge:0, rCrit:0, rClear:0,
      dryTotal:0, coldTotal:0, dryUrge:0, coldUrge:0,
      age1:0, age2:0, age3:0
    };
    const m=dcMapAll[dc];
    m.total++;
    m.maxAge=Math.max(m.maxAge, b.age||0);
    const age=b.age||0;
    if(age<=3) m.age1++; else if(age<=7) m.age2++; else m.age3++;
    const rl=b._risk||getRiskLevel(b.age,b.type,b.problem);
    if(rl==='ปกติ')           m.rOk++;
    else if(rl==='เริ่มเสี่ยง')  m.rWarn++;
    else if(rl==='ต้องเร่งจัดการ') m.rUrge++;
    else if(rl==='วิกฤต')       m.rCrit++;
    else if(rl.startsWith('กลุ่ม Clear'))  m.rClear++;
    const isCold=b.type&&b.type.includes('Cold');
    if(isCold){ m.coldTotal++; if(rl==='ต้องเร่งจัดการ'||rl==='วิกฤต') m.coldUrge++; }
    else       { m.dryTotal++;  if(rl==='ต้องเร่งจัดการ'||rl==='วิกฤต') m.dryUrge++;  }
  });

  // Build filtered DC map
  const dcMapFiltered={};
  if(hasFilter){
    bills.filter(b=>{
      const rl=b._risk||getRiskLevel(b.age,b.type,b.problem);
      const typeOk = !activeTypeFilter || b.type===activeTypeFilter;
      const probOk = !activeProbFilter || b.problem===activeProbFilter;
      const ageOk  = !activeAgeFilter  || b.ageStatus===activeAgeFilter;
      const riskOk = !activeRiskFilter || (
        activeRiskFilter==='วิกฤต+เร่งจัดการ' ? (rl==='วิกฤต'||rl==='ต้องเร่งจัดการ') :
        activeRiskFilter==='ปกติ' ? rl==='ปกติ' :
        activeRiskFilter==='เริ่มเสี่ยง' ? rl==='เริ่มเสี่ยง' : true
      );
      return typeOk && probOk && ageOk && riskOk;
    }).forEach(b=>{
      const dc=b.dcFocus;
      if(!dcMapFiltered[dc]) dcMapFiltered[dc]={
        total:0, maxAge:0,
        rOk:0, rWarn:0, rUrge:0, rCrit:0, rClear:0,
        age1:0, age2:0, age3:0
      };
      const m=dcMapFiltered[dc];
      m.total++;
      m.maxAge=Math.max(m.maxAge, b.age||0);
      const age=b.age||0;
      if(age<=3) m.age1++; else if(age<=7) m.age2++; else m.age3++;
      const rl=b._risk||getRiskLevel(b.age,b.type,b.problem);
      if(rl==='ปกติ') m.rOk++; else if(rl==='เริ่มเสี่ยง') m.rWarn++;
      else if(rl==='ต้องเร่งจัดการ') m.rUrge++; else if(rl==='วิกฤต') m.rCrit++;
      else if(rl.startsWith('กลุ่ม Clear')){
      m.rClear++;
      if(rl==='กลุ่ม Clear วิกฤต') m.rClearCrit++;
      else if(rl==='กลุ่ม Clear ต้องเร่งจัดการ') m.rClearUrge++;
      else m.rClearOk++;
    }
    });
  }

  const subParts=[];
  if(activeTypeFilter) subParts.push(activeTypeFilter.includes('Cold')?'สินค้า CC':'สินค้า AB');
  if(activeProbFilter) subParts.push((PROB_CFG[activeProbFilter]||{label:activeProbFilter}).label);
  if(activeRiskFilter) subParts.push(activeRiskFilter);
  if(activeAgeFilter)  subParts.push(activeAgeFilter);
  document.getElementById('dc-overview-sub').textContent=subParts.length?'('+subParts.join(' · ')+')'  :'';

  const grid=document.getElementById('dc-overview-grid');
  grid.innerHTML='';

  const sortSource = hasFilter ? dcMapFiltered : dcMapAll;
  const allDCs = Object.keys(dcMapAll);

  // เรียงแบบ tier-first: สาขาที่มีวิกฤตอยู่ก่อน เรียงตามจำนวนวิกฤตมากสุด
  // ถ้าไม่มีวิกฤตเลย → ดูต้องเร่ง → เสี่ยง → Clear → ปกติ → ไม่มีข้อมูล
  function dcTierSort(ma, mb){
    // tier ของแต่ละสาขา = ระดับสูงสุดที่มี ≥ 1
    function tier(m){ if(!m||m.total===0) return 6; if(m.rCrit>0) return 1; if(m.rUrge>0) return 2; if(m.rWarn>0) return 3; if(m.rClear>0) return 4; if(m.rOk>0) return 5; return 6; }
    const ta=tier(ma), tb=tier(mb);
    if(ta!==tb) return ta-tb; // tier ต่ำกว่า = อันตรายกว่า = มาก่อน
    // tier เดียวกัน → เรียงตามจำนวนของ tier นั้นมากสุดก่อน
    if(ta===1) return (mb.rCrit||0)-(ma.rCrit||0);
    if(ta===2) return (mb.rUrge||0)-(ma.rUrge||0);
    if(ta===3) return (mb.rWarn||0)-(ma.rWarn||0);
    if(ta===4) return (mb.rClear||0)-(ma.rClear||0);
    return (mb.rOk||0)-(ma.rOk||0);
  }

  const sortFn = dcSortMode==='age'
    ? (a,b)=>{
        const aHas=hasFilter?!!dcMapFiltered[a]:true, bHas=hasFilter?!!dcMapFiltered[b]:true;
        if(aHas && !bHas) return -1;
        if(!aHas && bHas) return 1;
        const sa=sortSource[a]||{maxAge:0}; const sb=sortSource[b]||{maxAge:0};
        return sb.maxAge-sa.maxAge;
      }
    : (a,b)=>{
        const src = hasFilter ? dcMapFiltered : dcMapAll;
        const ma=src[a]||null, mb=src[b]||null;
        // ไม่มีข้อมูลในกลุ่ม filter → ไปท้ายเสมอ
        if(!ma && !mb) return dcTierSort(dcMapAll[a],dcMapAll[b]);
        if(!ma) return 1;
        if(!mb) return -1;
        return dcTierSort(ma, mb);
      };

  // Risk cell config: วิกฤต → ต้องเร่ง → เสี่ยง → Clear → ปกติ (ซ้ายไปขวา)
  const RISK_CELLS = [
    ['drc-crit',  'fa-bolt',    'วิกฤต'],
    ['drc-urge',  'fa-triangle-exclamation',   'ต้องเร่ง'],
    ['drc-warn',  'fa-circle-exclamation', 'เสี่ยง'],
    ['drc-clear', 'fa-flag-checkered',         'Clear'],
    ['drc-ok',    'fa-circle-check',         'ปกติ'],
  ];
  const RISK_KEYS = ['rCrit','rUrge','rWarn','rClear','rOk'];

  allDCs.sort(sortFn).forEach((dc,rankIdx)=>{
    const s = hasFilter ? (dcMapFiltered[dc]||{total:0,maxAge:0,rOk:0,rWarn:0,rUrge:0,rCrit:0,rClear:0}) : dcMapAll[dc];
    const full = dcMapAll[dc];
    const dimmed = hasFilter && !dcMapFiltered[dc];

    // Border class by severity
    const borderCls = full.rCrit>0 ? 'has-crit' : full.rUrge>0 ? 'has-urge' : full.rWarn>0 ? 'has-warn' : '';

    const card=document.createElement('div');
    card.className='dc-card '+borderCls;
    if(dimmed) card.style.cssText='opacity:.35;filter:grayscale(1) brightness(1.05);pointer-events:none;border-color:#dde6ed;';

    // Risk cells HTML
    const cellsHtml = RISK_CELLS.map(([cls, icon, lbl], i)=>{
      const val = s[RISK_KEYS[i]]||0;
      const zeroClass = val===0 ? ' is-zero' : '';
      return `<div class="dc-risk-cell ${cls}${zeroClass}">
        <div class="dc-risk-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="dc-risk-num">${val}</div>
        <div class="dc-risk-lbl">${lbl}</div>
      </div>`;
    }).join('');

    // Type strip
    let typeStrip='';
    if(full.dryTotal)  typeStrip+=`<span class="dc-type-tag dry"><i class="fa-solid fa-cubes" style="font-size:8px"></i>${full.dryTotal}${full.dryUrge?` <i class="fa-solid fa-circle-exclamation" style="font-size:7px;color:var(--red)"></i>${full.dryUrge}`:''}</span>`;
    if(full.coldTotal) typeStrip+=`<span class="dc-type-tag cold"><i class="fa-solid fa-snowflake" style="font-size:8px"></i>${full.coldTotal}${full.coldUrge?` <i class="fa-solid fa-circle-exclamation" style="font-size:7px;color:var(--red)"></i>${full.coldUrge}`:''}</span>`;

    const ageDist = (()=>{
      const a1=s.age1||0, a2=s.age2||0, a3=s.age3||0;
      const cell=(num,color,fadeColor,label)=>`
        <div style="display:flex;flex-direction:column;align-items:center;padding:5px 2px 6px;border-right:1px solid var(--border)">
          <div style="width:7px;height:7px;border-radius:50%;background:${num>0?color:fadeColor};margin-bottom:3px"></div>
          <div style="font-size:12px;font-weight:800;line-height:1;color:${num>0?color:'#c0c8d4'}">${num}</div>
          <div style="font-size:7px;color:var(--mid);white-space:nowrap;margin-top:1px">${label}</div>
        </div>`;
      return `<div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--border)">
        <div style="display:flex;flex-direction:column;align-items:center;padding:5px 2px 6px;border-right:1px solid var(--border)">
          <div style="width:7px;height:7px;border-radius:50%;background:${a3>0?'#ED1C24':'#dde6ed'};margin-bottom:3px"></div>
          <div style="font-size:12px;font-weight:800;line-height:1;color:${a3>0?'#c0271e':'#c0c8d4'}">${a3}</div>
          <div style="font-size:7px;color:var(--mid);white-space:nowrap;margin-top:1px">8+ วัน</div>
        </div>
        ${cell(a2,'#c47f00','#dde6ed','4 – 7 วัน')}
        <div style="display:flex;flex-direction:column;align-items:center;padding:5px 2px 6px">
          <div style="width:7px;height:7px;border-radius:50%;background:${a1>0?'#22a663':'#dde6ed'};margin-bottom:3px"></div>
          <div style="font-size:12px;font-weight:800;line-height:1;color:${a1>0?'#22a663':'#c0c8d4'}">${a1}</div>
          <div style="font-size:7px;color:var(--mid);white-space:nowrap;margin-top:1px">≤ 3 วัน</div>
        </div>
      </div>`;
    })();

    const rank = rankIdx + 1;
    const maxAge = s.maxAge || 0;
    const maxAgeColor = maxAge >= 8 ? '#c0271e' : maxAge >= 4 ? '#a07000' : 'var(--mid)';

    card.innerHTML=`
      <div class="dc-card-head">
        <span style="font-size:9px;font-weight:700;color:var(--mid);background:var(--gray-light);border:1px solid var(--border);border-radius:5px;padding:1px 5px;flex-shrink:0;margin-right:5px">#${rank}</span>
        <div class="dc-name"><i class="fa-solid fa-store" style="font-size:8px;color:var(--teal);margin-right:4px"></i>${dc}</div>
        <div class="dc-total-badge"><i class="fa-solid fa-receipt" style="font-size:8px"></i>${s.total}</div>
      </div>
      <div class="dc-risk-grid">${cellsHtml}</div>
      ${ageDist}
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:3px;padding:3px 8px 5px;border-top:1px solid var(--border);background:var(--gray-light)">
        <i class="fa-solid fa-hourglass-half" style="font-size:8px;color:${maxAgeColor}"></i>
        <span style="font-size:8.5px;color:var(--mid)">อายุสูงสุด</span>
        <span style="font-size:10px;font-weight:800;color:${maxAgeColor}">${maxAge} วัน</span>
      </div>
    `;

    card.onclick=()=>{
      activeRiskFilter=''; activeProbFilter=''; activeAgeFilter=''; activeTypeFilter='';
      document.querySelectorAll('.sum-card,.risk-cell,.prob-cell').forEach(el=>el.classList.remove('rc-active','pc-active','active'));
      document.getElementById('f-dc').value=dc;
      document.getElementById('f-age').value='';
      document.getElementById('f-dcstatus').value='';
      document.getElementById('f-search').value='';
      segState.type=''; segState.prob='';
      document.querySelectorAll('#seg-type .seg-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
      document.querySelectorAll('#seg-prob .seg-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
      currentPage=1; renderBills();
      switchTab('bills',document.querySelectorAll('.tab-btn')[1]);
    };
    grid.appendChild(card);
  });
}

// ── Bills Tab ──
const segState={type:'',prob:''};
let sortField='age', sortAsc=false, currentPage=1;
const PAGE_SIZE=50;

function setSeg(key, val, btn){
  segState[key]=val;

  btn.closest('.seg-tabs').querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  currentPage=1;
  renderBills();
}

function sortBy(f){
  if(sortField===f) sortAsc=!sortAsc; else {sortField=f;sortAsc=false;}
  currentPage=1; renderBills();
}

function getFiltered(){
  const fa=document.getElementById('f-age').value;
  const fds=document.getElementById('f-dcstatus').value;
  const fdc=document.getElementById('f-dc').value;
  const fs=document.getElementById('f-search').value.trim().toLowerCase();
  return bills.filter(b=>{
    const rl=b._risk||getRiskLevel(b.age,b.type,b.problem);
    const typeOk = !activeTypeFilter && !segState.type ? true :
                   segState.type ? b.type===segState.type :
                   activeTypeFilter ? b.type===activeTypeFilter : true;
    const probOk = (!segState.prob||b.problem===segState.prob) && (!activeProbFilter||b.problem===activeProbFilter);
    const ageOk  = (!fa||b.ageStatus===fa);
    const riskOk = !activeRiskFilter ? true : (
      activeRiskFilter==='วิกฤต+เร่งจัดการ' ? (rl==='วิกฤต'||rl==='ต้องเร่งจัดการ') :
      activeRiskFilter==='ปกติ' ? rl==='ปกติ' :
      activeRiskFilter==='เริ่มเสี่ยง' ? rl==='เริ่มเสี่ยง' : true
    );
    return typeOk && probOk && ageOk && riskOk &&
      (!fds||b.dcGroupRef===fds) &&
      (!fdc||b.dcFocus===fdc) &&
      (!fs||b.no.includes(fs));
  });
}

function renderBills(){
  let filtered=getFiltered();
  filtered.sort((a,b)=>{
    let va=a[sortField],vb=b[sortField];
    if(sortField==='age'){va=a.age;vb=b.age;}
    if(va<vb) return sortAsc?-1:1;
    if(va>vb) return sortAsc?1:-1;
    return 0;
  });
  document.getElementById('f-count').textContent=filtered.length+' รายการ';
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  if(currentPage>totalPages) currentPage=1;
  const page=filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);

  // Desktop table
  const tbody=document.getElementById('tbl-body');
  tbody.innerHTML='';
  page.forEach(b=>{
    const tr=document.createElement('tr');
    const pc=probCfg(b.problem);
    const rl=b._risk||getRiskLevel(b.age,b.type,b.problem);
    const rlCls = rl==='วิกฤต'?'age-over':rl==='ต้องเร่งจัดการ'?'age-over':rl==='เริ่มเสี่ยง'?'age-slow':rl==='ปกติ'?'age-ok':'';
    const rlIcon = rl==='วิกฤต'?'fa-bolt':rl==='ต้องเร่งจัดการ'?'fa-triangle-exclamation':rl==='เริ่มเสี่ยง'?'fa-circle-exclamation':rl==='ปกติ'?'fa-circle-check':rl.startsWith('กลุ่ม Clear')?'fa-flag-checkered':'fa-circle-question';
    const rlStyle = rl==='วิกฤต'?'background:#fce8e8;color:#7a0000':rl==='ต้องเร่งจัดการ'?'background:var(--red-light);color:var(--red)':rl==='เริ่มเสี่ยง'?'background:var(--yellow-light);color:#854F0B':rl==='ปกติ'?'background:var(--green-light);color:var(--green)':rl==='กลุ่ม Clear วิกฤต'?'background:#fce8e8;color:#7a0000':rl==='กลุ่ม Clear ต้องเร่งจัดการ'?'background:var(--red-light);color:var(--red)':rl.startsWith('กลุ่ม Clear')?'background:#e8f0ff;color:#2b55b8':'background:var(--gray-light);color:var(--mid)';
    const grpHtml=b.dcGroupRef==='DC ปัจจุบัน'
      ?`<span class="dcgrp-badge dcgrp-curr"><i class="fa-solid fa-warehouse"></i>DC ปัจจุบัน</span>`
      :`<span class="dcgrp-badge dcgrp-dest"><i class="fa-solid fa-location-arrow"></i>DC ปลายทาง</span>`;
    tr.innerHTML=`
      <td style="font-weight:600;font-size:12px">${b.no}</td>
      <td>${b.dateStr}</td>
      <td style="font-weight:500">${b.dcFocus}</td>
      <td>${grpHtml}</td>
      <td style="font-size:11px;color:var(--mid);max-width:160px;white-space:normal;line-height:1.4">${b.status}</td>
      <td><span class="type-badge ${typeCls(b.type)}">${typeLabel(b.type)}</span></td>
      <td>${b.sla}</td>
      <td><span class="age-badge ${ageCls(b.ageStatus)}">${b.age} วัน</span></td>
      <td><span class="age-badge" style="${rlStyle};gap:4px"><i class="fa-solid ${rlIcon}" style="font-size:9px"></i>${rl}</span></td>
      <td><span class="prob-badge" style="background:${pc.bg};color:${pc.color}">${pc.label}</span></td>`;
    tbody.appendChild(tr);
  });

  // Mobile cards
  const mc=document.getElementById('mob-cards');
  mc.innerHTML='';
  page.forEach(b=>{
    const cls=b.ageStatus==='เกิน KPI'?'over':b.ageStatus==='เริ่มช้า'?'slow':'ok';
    const pc=probCfg(b.problem);
    const rl2=b._risk||getRiskLevel(b.age,b.type,b.problem);
    const rlStyle2 = rl2==='วิกฤต'?'background:#fce8e8;color:#7a0000':rl2==='ต้องเร่งจัดการ'?'background:var(--red-light);color:var(--red)':rl2==='เริ่มเสี่ยง'?'background:var(--yellow-light);color:#854F0B':rl2==='ปกติ'?'background:var(--green-light);color:var(--green)':'background:var(--gray-light);color:var(--mid)';
    const card=document.createElement('div');
    card.className='mob-card '+cls;
    card.innerHTML=`<div class="mob-head" onclick="toggleMob(this)">
      <div class="mob-head-left">
        <div class="mob-billno">${b.no}</div>
        <div class="mob-dc"><i class="fa-solid fa-warehouse" style="font-size:10px;color:var(--teal)"></i> ${b.dcFocus}</div>
      </div>
      <div class="mob-head-right">
        <span class="age-badge ${ageCls(b.ageStatus)}">${b.age} วัน</span>
        <span class="age-badge" style="${rlStyle2};font-size:10px;padding:2px 7px">${rl2}</span>
        <span class="type-badge ${typeCls(b.type)}">${typeLabel(b.type)}</span>
      </div>
      <i class="fa-solid fa-chevron-down mob-chev"></i>
    </div>
    <div class="mob-body">
      <div class="mob-field"><div class="mob-flbl">สถานะบิล</div><div class="mob-fval" style="font-size:11px">${b.status}</div></div>
      <div class="mob-field"><div class="mob-flbl">สถานะของ DC</div><div class="mob-fval">${b.dcGroupRef}</div></div>
      <div class="mob-field"><div class="mob-flbl">วันที่บิล</div><div class="mob-fval">${b.dateStr}</div></div>
      <div class="mob-field"><div class="mob-flbl">กำหนดส่ง (SLA)</div><div class="mob-fval">${b.sla}</div></div>
      <div class="mob-field"><div class="mob-flbl">ประเภทปัญหา</div><div class="mob-fval"><span style="background:${pc.bg};color:${pc.color};padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600">${pc.label}</span></div></div>
    </div>`;
    mc.appendChild(card);
  });

  renderPagination(totalPages);
}

function toggleMob(head){
  head.nextElementSibling.classList.toggle('open');
  head.querySelector('.mob-chev').classList.toggle('open');
}

function renderPagination(totalPages){
  const pg=document.getElementById('pagination');
  pg.innerHTML='';
  if(totalPages<=1) return;
  const prev=document.createElement('button');
  prev.className='page-btn';prev.textContent='←';prev.disabled=currentPage===1;
  prev.onclick=()=>{currentPage--;renderBills();};
  pg.appendChild(prev);
  const info=document.createElement('span');
  info.className='page-info';info.textContent=`หน้า ${currentPage} / ${totalPages}`;
  pg.appendChild(info);
  const next=document.createElement('button');
  next.className='page-btn';next.textContent='→';next.disabled=currentPage===totalPages;
  next.onclick=()=>{currentPage++;renderBills();};
  pg.appendChild(next);
}

// Init
populateDCDropdown();
renderOverview();
renderBills();

// ── เอกสารนำกลับ Data ──
const RETURNS_DATA_B64 = "eNrtnd1vHcd1wP8V4T4rysyZMzNn9Go/tyjyWPRBsYjUQCy5Eh0gKApUtgEpQlI0sFWLUmFUIoTEMgQ4st0u/5v9U4r9IrW83L1Xd0meOZwD6OHSnJWvdn443x//+K+rO3dXN1chOQjGmxiAwur66vat/b1f7d9b3VyBD+kXxv/C0jVjbrZ/VtdX9/fu3N5rfr26vrq399Hex7/bu/d3tz7Z6/7Lrdu37+3dv9/9sH/rk1/fvdP/4pNP//luf+jTe3d/9/Gdj/qfbn/09/c+/s3Hd9rvYq9d++DDD67V1bO6eltXD+vqoK7etqc+3Lu/v7q5st5cu9YcOfr3unpcVz/X1cvm4NEXdfV9Xb2ojx61xz/47N69vTvbP3F//9b+Z80XN+Hatbp6XVc/tf/zL+ujP7Tf5VFd/a2uvm5+dfSo/Wr/VVf/2354UVf/V1dv6uq/6+qoPX/YHn5WV8/r6lX7+Mu6+qb/NzXf43D4Hs+az80jb5ofjx4055sf/9J8p89+/avha62ur/5l//erm/b6av/u/q3f/kPzA8brq4/u3l7dNNdX+7//tHmjZ331b5pv03zpv9RHX9bV8+av/u2t5orNL/0vm3s+uczbH97aHy7zN3urm775za373T3+2/VjaqCjJgHR2dQkpSYjauK72Njk/UJwYCM4OAsOYQh4JjhgFJxMxY21S7FxG7FxE9jYBhtrEJI/W96AYpOrlsJl1FjcSI21s9gQJqvSJn9sPLzLjXfWXLiaOlveOPCtmjIhGM9s3zjw3RU37/twuK6f21fwrK6q7n0rRicY4YgiIm5bx9hgRRjJtgftVV39WFffNjdVHayhMnVKpHJaKmHsznD0fjdZCwpHnnA0+oibDnRKRzZ0uJE75AM/Ht4oHio8zqYjGYhKh9Jxio7OtSGLgEqH0nFmxMQZihN0oNLBQIcZWR4GF/otNmwEJG3I/ISgpkc+gMAYkAiGK+oBQ6iegD3qAcO1di/+4fAKnhSvYaxxF57L2QAI2YAKyNUFBBZaqMkmOlvFgM1LxcDo4p93B9fwmDolJjtznnHTzXDAvPuCaKyIlF4ZcGRWKJDATZiniof8sjXYmY5eszT1R6pZ8gyrO1wqPPyuuqW3TK13yXLjsaVlWqJ2CZ7N+Oi1i4sORGgX11/8m7ZQ5El7BV93HDVXefTHNVS2eUIKNmEkVwCZjRKP0YCIGnvsq4EetG7s4VkFQ2ceERMtG3u64cLliZ8FI3pMToQ8uepg4LhOPrEZqn3hqnMoI0l31cEYJ2A8soXXE3bxD4guiBAZQ/XqQfsi3p4VOD3ziEhdYrhMjCGonjyxh8W2dF2uOhgjpyUAm/E51HsAykjYhv7Sv62rH9obeDkceReNqVNl0rG8GmiysUrpKJgO29HhEqWz6bBKh3A6tmmvmw+HeW+djNkBZeBxztENuzC64b2bkh6KBzceiZjpsDFNeCzWKR0MuoXexSOmpdplczKuCa3MxcBg0vhQ05QBkBEfLnB111pvWjyQ+Hv7t224LlnRAOGNmFKii1c4syEyE8KkOQK5hcgKdGessRevceyG0nV0IKQyuUhC+CqT+85Kl6aiZerRcCua4BPbVLw+nU/JBBEWazzTbOmnzLxc42TjcZEFh3wjQLBvpUvGKS5S1E8iZu1Ddqp6WXnJkJcIzH1UkWJUXsTUqXoM3J2ZLpEX4v+oiMmjmRdtdIpMSU0Uy5EBh4qMSpn3QgatIqPIvA8yDoIio8hsRuZk6LNPSeDQZ8WnxYe4JM5xlx/KqIYL5ri6vvqyff+vm9fRfDhs39Rac+hWT8gM0jjmnEEKzjoJIwkKp+ZUgyCydaL3s+U9eJLQBhaGvvIn7ZEHa5Cs/16kICHP1jLaZwdi9CJmm1xhIkbpRfDs4yqS8V6RyEdvAFy8kQqbJiB5p0jkg4RDw4aEHSbqTe2aUCRE7pc4h84uJCdiYk0xTCzuBTWLu7mMCYpERg1+FrnrHT3aqE5oRlLCsTVZnCARkyKRUxuwYUaC0EejSOSkOBIbEkOsCqNTJDIKTNjAHL6M5JOIiXdXGInRoH+3OKK9fMthQFIkMhp/SIGrZ+a46xuM4RYT79v1XUoKzMMNImOMtRful26ExFqFJNMVIfZGcCmlxATJMA6AEGhCkvjMCgSLYWNpbbpNG6GgWShSTPxxb4XifBsWloY5KcQoYutD6CdtN2+nqo8+r6vP+/eyXga64azMiYjcU5htMPz7hbYUH4Wzsrzc3C8t4YOp5Q+5ubf+ZEzIT3X1XV19NXDw6izFs/F4mcN4dzZYe16SDc6KKN1RXi6p0RI2ABNtUGAUmO2BIQAFRldLbFlfjOAxcYdQlJet876QuMIrx9UhU4HZ3DzpUoE5VU5kuPegheC8AlNOZclyYMg5BUbMFoLAzUsEGev0VCO1AgaBHRgHpMDIKX+1zMCkEKOG7QQBA9xduyGRhu3KSTou5YWIrJq8BY15haVZarIUhWSpVcScS2ZgdxnTbx0nG7zqJDHARMsODIAaMWKAAUfcVm/EiTXluQHzzvzEb9vS7sP2+FH74auz5qBt84TILYC4eA7azinIk5VdlmSMeS0cnNzmA6cE7JklBSfHIhm3CRxMCo6C895utwdwQtxuBSeLQvFj5zsFNY2FeVSWuzovGi8iUwluaC950w64f9beSzeO/nFdPW0/HAxT70/geZ/nhE6ZBi6VNSAUnPUCWlQUoalspotsSwgHhDAkRUgwQtazIxSjU4QEI3QJRTibEKKJFm5FSEaVBbIR1HfruuCCEiRLCJlTG6IMN0SRghPhkg1pzpdtavN1C8DhGjJTp3Rf9y7eFrpATkA7XSl0jJ3xuNCTsrS0ea6ZTqTCIxs80igT7jx7rCZEFGGglIHHZfc54QbdAhPp7tx0S+jv/XE3X6iu/qdNB7yoq5/WGJk/K5MUx6xmfDBT69lJScmqO5t9/0dARyJUTnmojI1XCvxpAPSKioSMkWNGhWJwIMLPKR0Vy91bG6I3aqsIWCYB0TDbKgZhog3bQlao4LA1/fP2VR+0r/pB+1IOTqOy4azIMCwu7ESxmwMpjdyaQyU4bxQVARu2iZGVLqPjwYYJF8gpK8wayIx3by/dhLfNWl0z3+QGwYowbQukZRzOt8hs2vpgooQNzIB2VDfwdXsF02UGm4/LTB5fvNe8KRZHECUEWIrl5VRtN3uYBcGLSCergGkFTGRTSJ2lG1OUEcEtlpdRxAU9X9m274rdDEy50QpMftHcCIZt3+uxRkpRhEYaVqt93/7yTXvqy+5q1miZPytSFxH71F70lpQUAWX7xEZK3zsNIcmwcuPJjrX2HXcvaL0wbu6gGEZGExENe+VksiJaFItiZFzr5Pk6yPpl9BEhiYjHFSVIRkGV6MOFm7Abo3BORBE2Un/5/Z234zcO6urFGiUzB0VG3uASBnzPO8YhhCnHOOQEiQNzUonyqj1YdbdwCpLZgzKLEC6+2SeezYg1/RD4yYG7l2e3WnMy7LRq/7VP2zv5qq7+3L7+190NXHOKTV/m5G9QMuYSRia4WWuFHIGEtTZlsQLjkbt8y9X6AC06mxSSnI0VDNwb+BJMGSt5DZ8rCxKXy7T3XpKQE7GypixI4ihmbzz3hHeKoJIk71mnln3RyHTzj0KSS9sP8kMSnEKSdYrYs02/7RlJnlSQXHEPeHdIupq2ZJ2ItVYlOzcpcc/RRrRGwyR5D+eCC0/8ubl4PRgfEbklya7x+nd2QvzQXkZTe7QGzdQpmZ4OODax0ofoY0woQvcUiEeIbC4ODOYryDBf3YnM+Vv7Rl4OR96lY+qUhkl2C7gmh17xKDezt0G3JDKoeOS5NDMBn9vre7eXXFA8rqpyWWqZJmutVTwUjwnbAwxKKJd3MIwQfj4sMnjUXsHBbGxky4cKXYK5tMfPo7FBQBm9wnP+K1gWF9cbQC8iEKvsnHfHqF1Y6xhTChIaMzC+M/3xh/Zl/3iKlIkjhVozdulKHvIiagkUjEtP+7kgoYT+6oMB5zvK3C6tiA4GVGLkVyiAxF2WFshHBSO7pixjuGvRyFJSMLJzSrgFRowpSdhKi2RPN4H/dbiEp+2Hw/Ya+22hp5F576dF0sQ3Peu4m48kzERSmCZgcnnMxOnjJQREKprE0hTHw4nZw/4ByQsI+ytO20xQiYY5E0COMKmuuxqGEwbuycYUkVQ4iaXJ5yKchpGTiWQIJxgVxjxs/7xdw2bqlMy8guHa043UdooYS4m4pxwjDZ0i3zSp5f52Xg9l/WUD4rgBSQasApIvIMTsmxMasqpg8sHDjxfoBs8MSABjzs5QWswLkKE0t91w2lzCg/roYV09WWNk5mCZQzRs2AhJmg/JmGRAhNdTEiRutLPQhcC9Nzd4oKSY5KZyRiaJN3xzr4/njUYZJgmeDD2vhmDHd3X1H+0F/HGNlY3HpRBzrhsX/NKNCxFMEJFdKhWX8Z5liBdu0eIGYFwiBUYMMIsV0lJgKNJUkaYqpPwUknN8BQ/DOBZvFJisbd6Ra+SRz4jp04Zhqos+N8+oVGK8OTWWw7At6e5Tg26q+1WFTI6hfu+5V9M5QiPC7h2WiT0YJoA9a67g6NEaKjMHRULi+WrrXL9OCqbmMWS1TgqTOVlw+ra5xqMv2s9/OgOTDWdFkpLihcdy4yZSJkoPlJSrtX4sLSQlJjMxGDkzvVMgKXSekdyluwwjwUTgX0HRHoCxLZu6h7N3fgpEBc63hHap20PJJqeo5B/od5bdQ44QSBWQgJyQ49u7fJxEjKioCGgw89yokCMfVAEVMMNhsamCBoySIsCqhcC8SpfQTO2IUVSyyvs4y44KkEoVEXMKHTsqHryiIqFxDLlRiRFUAUkoh0NuVGKMoAkgCUll4g7rx+hASRGgf5LhR0XE5hBFBRM/Kj4oKhJWymSAysQEf0VFpcppVKJRVCSEVbjNWiLjtVqlCKmyOKxCJmiyUFHZomeMrLFagiAAFQd8zvJxr5hRBSRhv4h33FLFAMgIwa2t4n3VNgw+XONk5qBuh9ihSawxVbyAFTTBmpObr9o38rS9tq/q6s/tDb3uLumaO8XM+z0psoTFsO2raQ1dMNZPTGFRiMpJGC3dhpWMM6gUyabIgmPDaBjYEikqRrIxWtroukCl9bOUCaOqNHkUjbuQ0HOv/ow2qnktXBhFforQGqVItpNmPbObZhOhVwNbhdEyyyiZqBRJpMiME+meb/t1D5I1oI5a8VrNLQ4+OnKKkTiMRlNoPHjmsFGygFYxku3wQw4YTS15VIyKsbGXm0YUZdjYvmfhVYvDs2HM789r0Mwc1ETHjpAgRoVEc6ozFUDJJrDKSM6MBLjwfQUbUl2ISUL3d8nKhnGc3vHy8uAVkqxHXnnufofAv8FcGZmvqwjMY9FSsIbUIMk6pOsct9UKGNRqzXudOVn2/BF4dEpJ1vOKANmcm2FiOIjolirYJlk81NfubJP4fv1NAAmLkoKlk3VqxzuypjCZP1vm+hvaef0N9KSkEJUUJWUbUsgqKUrKDCldZC0gGaOkKClbrOlzSoqSMkvKsUU7tdFESVFSxtoHlBQlZSvtY9X3UVK2kilOfR8lZbOXnEBKC0iBpJiMRsxYj2AmtA8pKRl1ckDCC99m7+dLDNBFq0JFQMFS4G6IRsSkpAgoSSHgRsWnCIqKgHJqw09KCkqKhDo3dv0TrPWKSv59pTax658w5f8oKnlJFeP5UbGoqAiQKkjsqCCpq6yobIVKcCpVJKDikB8VVKkiwVaxiRuV5IOatRKWmaBjQ6XLFcbgp5aZ5JUBAttff3c1D4fX9OQ0J3MHixxlYNPOqZ9hanckEVHaohjJawwuGAAZ20rKFSRsA7gwhlaQOBM8MbcNYgz9tT5ujYg3dfWj8tFljiPXqAtrurbSmME4lPcc4afYEF+n6bAR1k5lkY2qnmI2TM+3Izc7Q0TM4wLs7/4PjX5qruBx+5q66/imvZG3a8Bs+VCZa4uWjtehaMFIYMcNcqN9zY36etp+WONl7qBMJ5mYx3Q1Vfoiqg6KYoTGjCD7lg8TFZKsh+v4SxjmNj/s3Ps0MczNuqwgiebESn3bWhzT0fsNZ0tcEGxxIyhNt8gMKRGSCxKC90oKUwS/D6z4aCaGul1i7+COgZUC2RkP8uIee+ADeK/6SEAgzrEppF7ORAphQiEllTOZpxDDxbcY4oZuVDcRZlFzJrPC/cDcjRrRQ5AQkSsQFRyhEgNzdihhMCLaUYuXKo6/x8MkUFQklNjyo4JWUdHO5a1IkbF1sHih4vlbPLxXU0VAkmj5OJ6lmcQYI2noX4ADBJbPV+4GB6IPfgIVUFRyGgdH6RJSinY+pWjMVLA/KCxZVVQ65tG1kVIy3MH+rVAZalQetEf+1F7owSww2zwhsgYqgWGL8ncdh2SAULGR5RuB48OmkzbkhKxBLRybbDYs99gE70S0wis2l4vNfCQGbJhaNOUUm2zH+diFJnHYvSJzyEu7pFqquNk+i3PUjmJSLVVawdQ5TNomNW6kGTeGDZu+SjM1tjE3NrtWacLJFKiqffiw/fPVLExbPiRSezlDzMYyYQARrdUKD8esuo19syTD9FF4sts0EpyMdlplZ62CwgOz1krBk1F4ipw4tHzYXQJQdqRYPGbsf5FhEz39LKIEKGKZTXQ9Ce17aW7geV39Z129WENm5qBMrwq5UxDJJyGGcUmQjIopXGCfumodWIUkN4UTTvnYfCNluhJQAutltEviienxYggMHg7BwIaHNV62eULoziO+tFRfPBFjlOEilY3N2Dnia43rqSHjglJTmr27OJhHlkixUWHzfq40BafU5E+NH4+04sMGB8sGFRthOQOHwI1NwqimjTBpg+CZJ7qGAAklNNXNnXmHleljRc6XX9BJ14mVgFH5UD4mW+ZCSFH5UD6me+OISEJ4t0w+DFMY1/pu7Rr4NNXMdGkdt9aHk3rfbkPNS6Wj9WoiV2dtXw7u0E0kmi+x123HcvAykVm67NP6pZsHyKMxqnGyDcvybVvrPBpAR2dX5pqofPBbrAsjIpv3UTRTr+ZmUhFaK2EmVTF8jEsPli5Bsm73QVR9U1EyDlTDXNld0rv3DfVjhLwF9XkzXhEQ2QFBFSA5T9vlCouA63wYayaHLlwaIOCGcte/Di/29RAfeVBX3xWqacbVAjbe8NzbowlJRKehWiOXXBjQKZvGaA3KR64lAM445hKAZIKM6sYyzVVgqxHB2CVpnLHEPUQD45CkedwYIc2b/FG1y80EbAm8LkMTDCbuOU/W9xma5r0+Ht7rw/roi7r6vrmco0eKStNczFxGb21KQSOr2QKCyB1ZDSmRiLntheZmAlM9AKDp9j0bh9yN54BDPcDn7Vs8aN/ig/YffKCQNNGzG82uDhOZO4sR0TpVN7lyAi7xqZt+U1UCp+om3zh8NMxrv4ksJU3UZKtqIF2y+/tP/w+iM7yI";
let RETURNS_BILLS = [];
(function(){
  try {
    const bin_str = atob(RETURNS_DATA_B64);
    const arr = new Uint8Array(bin_str.length);
    for(let i=0;i<bin_str.length;i++) arr[i]=bin_str.charCodeAt(i);
    const json_str = pako.inflate(arr, {to:'string'});
    RETURNS_BILLS = JSON.parse(json_str);
    // ── คำนวณอายุบิล (วัน) จาก dateStr เทียบกับ refDate ──
    // refDate อยู่ในรูปแบบ "DD/MM/YYYY" (พ.ศ. เช่น 21/05/2569)
    // dateStr อยู่ในรูปแบบ "YYYY-MM-DD HH:mm:ss" (พ.ศ. เช่น 2569-05-07 00:00:00)
    (function(){
      try {
        // แปลง refDate (พ.ศ.) → วันที่ค.ศ.
        const rParts = refDate.split('/');
        // rParts = [DD, MM, YYYY_BE]
        const rDay = parseInt(rParts[0], 10);
        const rMon = parseInt(rParts[1], 10) - 1; // 0-based
        const rYearCE = parseInt(rParts[2], 10) - 543;
        const refDateObj = new Date(rYearCE, rMon, rDay);
        refDateObj.setHours(0, 0, 0, 0);

        RETURNS_BILLS.forEach(function(b) {
          try {
            // dateStr เช่น "2569-05-07 00:00:00"
            const dStr = (b.dateStr || '').trim();
            if(!dStr) { b.age = 0; return; }
            const datePart = dStr.split(' ')[0]; // "2569-05-07"
            const dp = datePart.split('-');
            const bYearCE = parseInt(dp[0], 10) - 543;
            const bMon    = parseInt(dp[1], 10) - 1;
            const bDay    = parseInt(dp[2], 10);
            const billDateObj = new Date(bYearCE, bMon, bDay);
            billDateObj.setHours(0, 0, 0, 0);
            const diffMs = refDateObj - billDateObj;
            const diffDays = Math.max(0, Math.floor(diffMs / 86400000));
            b.age = diffDays;
          } catch(err) { b.age = 0; }
        });
      } catch(err) { console.warn('Returns age calc error:', err); }
    })();
  } catch(e){ console.error('Returns decompress error:', e); }
})();

// ── Returns Tab State ──
let retAgeFilter = 'all';  // 'all' | 'le3' | '4to7' | 'over7'
let retSortField = 'age';
let retSortAsc = false;
let retCurrentPage = 1;
const RET_PAGE_SIZE = 50;

function setRetFilter(filterKey, btn) {
  retAgeFilter = retAgeFilter === filterKey ? 'all' : filterKey;
  document.querySelectorAll('#ret-sum-all,#ret-sum-le3,#ret-sum-4to7,#ret-sum-over7').forEach(el => el.classList.remove('active'));
  if(retAgeFilter !== 'all') (btn || document.getElementById('ret-sum-'+filterKey))?.classList.add('active');
  retCurrentPage = 1;
  renderReturns();
}

function sortRetBy(f) {
  if(retSortField === f) retSortAsc = !retSortAsc;
  else { retSortField = f; retSortAsc = false; }
  retCurrentPage = 1;
  renderReturns();
}

function getRetFiltered() {
  const ftype = document.getElementById('ret-f-type')?.value || '';
  const fdc   = document.getElementById('ret-f-dc')?.value || '';
  const fs    = (document.getElementById('ret-f-search')?.value || '').trim().toLowerCase();
  return RETURNS_BILLS.filter(b => {
    const typeOk = !ftype || b.type === ftype;
    const dcOk   = !fdc   || b.dcCurrent === fdc;
    const searchOk = !fs || b.no.includes(fs) || b.sender.toLowerCase().includes(fs) || b.receiverName.toLowerCase().includes(fs);
    let ageOk = true;
    if(retAgeFilter === 'le3')   ageOk = b.age <= 3;
    else if(retAgeFilter === '4to7')  ageOk = b.age >= 4 && b.age <= 7;
    else if(retAgeFilter === 'over7') ageOk = b.age > 7;
    return typeOk && dcOk && searchOk && ageOk;
  });
}

function renderReturns() {
  const filtered = getRetFiltered();
  filtered.sort((a, b) => {
    let va = a[retSortField], vb = b[retSortField];
    if(retSortField === 'age') { va = Number(va)||0; vb = Number(vb)||0; }
    if(va < vb) return retSortAsc ? -1 : 1;
    if(va > vb) return retSortAsc ? 1 : -1;
    return 0;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / RET_PAGE_SIZE));
  if(retCurrentPage > totalPages) retCurrentPage = 1;
  const page = filtered.slice((retCurrentPage-1)*RET_PAGE_SIZE, retCurrentPage*RET_PAGE_SIZE);

  // Update counter badges
  const all = RETURNS_BILLS;
  document.getElementById('ret-hero-total').textContent = all.length.toLocaleString();
  document.getElementById('ret-n-all').textContent    = all.length.toLocaleString();
  document.getElementById('ret-n-le3').textContent    = all.filter(b=>b.age<=3).length.toLocaleString();
  document.getElementById('ret-n-4to7').textContent   = all.filter(b=>b.age>=4&&b.age<=7).length.toLocaleString();
  document.getElementById('ret-n-over7').textContent  = all.filter(b=>b.age>7).length.toLocaleString();
  document.getElementById('ret-badge-dry').textContent  = all.filter(b=>!b.type.includes('Cold')).length;
  document.getElementById('ret-badge-cold').textContent = all.filter(b=>b.type.includes('Cold')).length;
  document.getElementById('ret-f-count').textContent = filtered.length + ' รายการ';

  // Desktop table
  const tbody = document.getElementById('ret-tbl-body');
  tbody.innerHTML = '';
  page.forEach(b => {
    const tr = document.createElement('tr');
    const isCold = b.type.includes('Cold');
    const typeHtml = isCold
      ? '<span class="type-badge type-cold"><i class="fa-solid fa-snowflake" style="font-size:9px;margin-right:3px;color:#006BB6"></i>สินค้าคุมอุณหภูมิ</span>'
      : '<span class="type-badge type-dry"><i class="fa-solid fa-cubes" style="font-size:9px;margin-right:3px;color:#f0a500"></i>สินค้าทั่วไป</span>';
    const ageStyle = b.age>7 ? 'background:#fce8e8;color:#7a0000'
                   : b.age>=4 ? 'background:var(--yellow-light);color:#854F0B'
                   : 'background:var(--green-light);color:var(--green)';
    tr.innerHTML = `
      <td style="font-weight:600;font-size:12px">${b.no}</td>
      <td>${b.dateStr}</td>

      <td style="font-size:11.5px;font-weight:500">${b.dcCurrent}</td>
      <td style="font-size:11.5px">${b.dcDest}</td>
      <td>${typeHtml}</td>
      <td style="font-size:12px">${b.sla}</td>
      <td><span class="age-badge" style="${ageStyle}">${b.age} วัน</span></td>`;
    tbody.appendChild(tr);
  });

  // Mobile cards
  const mc = document.getElementById('ret-mob-cards');
  mc.innerHTML = '';
  page.forEach(b => {
    const ageCls = b.age>7?'over':b.age>=4?'slow':'ok';
    const card = document.createElement('div');
    card.className = 'mob-card ' + ageCls;
    card.innerHTML = `<div class="mob-head" onclick="toggleMob(this)">
      <div class="mob-head-left">
        <div class="mob-billno">${b.no}</div>
        <div class="mob-dc"><i class="fa-solid fa-warehouse" style="font-size:10px;color:var(--teal)"></i> ${b.dcCurrent}</div>
      </div>
      <div class="mob-head-right">
        <span class="age-badge ${b.age>7?'age-over':b.age>=4?'age-slow':'age-ok'}">${b.age} วัน</span>
        <span class="type-badge ${b.type.includes('Cold')?'type-cold':'type-dry'}" style="font-size:10px">${b.type.includes('Cold')?'CC':'AB'}</span>
      </div>
      <i class="fa-solid fa-chevron-down mob-chev"></i>
    </div>
    <div class="mob-body">

      <div class="mob-field"><div class="mob-flbl">DC ต้นทาง → ปลายทาง</div><div class="mob-fval" style="font-size:11px">${b.dcOrigin} → ${b.dcDest}</div></div>
      <div class="mob-field"><div class="mob-flbl">กำหนดส่ง (SLA)</div><div class="mob-fval">${b.sla}</div></div>
    </div>`;
    mc.appendChild(card);
  });

  renderRetPagination(totalPages);
}

function renderRetPagination(totalPages) {
  const pg = document.getElementById('ret-pagination');
  pg.innerHTML = '';
  if(totalPages <= 1) return;
  const prev = document.createElement('button');
  prev.className = 'page-btn'; prev.textContent = '←'; prev.disabled = retCurrentPage===1;
  prev.onclick = () => { retCurrentPage--; renderReturns(); };
  pg.appendChild(prev);
  const info = document.createElement('span');
  info.className = 'page-info'; info.textContent = `หน้า ${retCurrentPage} / ${totalPages}`;
  pg.appendChild(info);
  const nxt = document.createElement('button');
  nxt.className = 'page-btn'; nxt.textContent = '→'; nxt.disabled = retCurrentPage===totalPages;
  nxt.onclick = () => { retCurrentPage++; renderReturns(); };
  pg.appendChild(nxt);
}

renderReturns();

// ═══════════════════════════════════════════
//  RANKING TAB  — dept-based concept
// ═══════════════════════════════════════════

const RK_DEPT_CFG = {
  '': {
    label: 'รวมทั้งหมด',
    icon: '<i class="fa-solid fa-layer-group" style="color:var(--teal)"></i>',
    color: 'var(--teal)'
  },
  'สถานะบิลคงค้างขนย้าย': {
    label: 'หน่วยงานขนย้าย',
    icon: '<i class="fa-solid fa-truck-arrow-right" style="color:#c85000"></i>',
    color: '#c85000'
  },
  'สถานะบิลคงค้างกระจาย': {
    label: 'หน่วยงานกระจาย',
    icon: '<i class="fa-solid fa-diagram-project" style="color:#2b55b8"></i>',
    color: '#2b55b8'
  },
  'สถานะบิลคงค้างDC แผนกธุรการสาขา': {
    label: 'ธุรการสาขา',
    icon: '<i class="fa-solid fa-pen-to-square" style="color:#6b2bb8"></i>',
    color: '#6b2bb8'
  }
};

let rkDeptFilter = '';
let rkTopN = 5;

function setRkDept(dept, btn){
  rkDeptFilter = dept;
  document.querySelectorAll('#rk-seg-dept .seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRanking();
}

function setRkN(n, btn){
  rkTopN = n;
  document.querySelectorAll('#rk-seg-topn .seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRanking();
}

function renderRanking(){
  const cfg = RK_DEPT_CFG[rkDeptFilter] || RK_DEPT_CFG[''];

  // Update dept banner
  const banner = document.getElementById('rk-dept-banner');
  const deptIcon  = document.getElementById('rk-dept-icon');
  const deptLabel = document.getElementById('rk-dept-label');
  if(rkDeptFilter && banner){
    banner.style.display = '';
    if(deptIcon) deptIcon.innerHTML = cfg.icon;
    if(deptLabel){ deptLabel.textContent = cfg.label; deptLabel.style.color = cfg.color; }
  } else if(banner){
    banner.style.display = 'none';
  }

  // Filter source bills by dept
  const src = rkDeptFilter
    ? bills.filter(b => b.problem === rkDeptFilter)
    : bills;

  // Compute _risk lazily
  src.forEach(b => { b._risk = b._risk || getRiskLevel(b.age, b.type, b.problem); });

  // Build DC map
  const dcMap = {};
  src.forEach(b => {
    const dc = b.dcFocus;
    if(!dcMap[dc]) dcMap[dc] = {total:0, maxAge:0, sumAge:0, rCrit:0, rUrge:0, rWarn:0, rOk:0, rClear:0, rClearOk:0, rClearUrge:0, rClearCrit:0, dryTotal:0, coldTotal:0};
    const m = dcMap[dc];
    m.total++;
    const age = b.age||0;
    if(age > m.maxAge) m.maxAge = age;
    m.sumAge += age;
    const rl = b._risk;
    if(rl==='วิกฤต') m.rCrit++;
    else if(rl==='ต้องเร่งจัดการ') m.rUrge++;
    else if(rl==='เริ่มเสี่ยง') m.rWarn++;
    else if(rl==='ปกติ') m.rOk++;
    else if(rl.startsWith('กลุ่ม Clear')){
      m.rClear++;
      if(rl==='กลุ่ม Clear วิกฤต') m.rClearCrit++;
      else if(rl==='กลุ่ม Clear ต้องเร่งจัดการ') m.rClearUrge++;
      else m.rClearOk++;
    }
    if(b.type && b.type.includes('Cold')) m.coldTotal++;
    else m.dryTotal++;
  });

  const dcList = Object.keys(dcMap).map(dc => ({dc, ...dcMap[dc]}));

  // ── Update subtitle chips on charts to show dept context ──
  const deptShort = rkDeptFilter
    ? (rkDeptFilter.includes('ขนย้าย') ? 'ขนย้าย' : rkDeptFilter.includes('กระจาย') ? 'กระจาย' : 'ธุรการ')
    : 'ทุกหน่วยงาน';

  ['crit','urge','age','total','rate','warn'].forEach(k => {
    const el = document.getElementById('rk-sub-'+k);
    if(!el) return;
    const isAdminLabel = rkDeptFilter==='สถานะบิลคงค้างDC แผนกธุรการสาขา';
    const base = isAdminLabel ? {
      crit:  'Clear วิกฤต (8+ วัน) สูงสุด ต้องเร่งดำเนินการ',
      urge:  'Clear ต้องเร่งจัดการ (6–7 วัน) สะสมสูง',
      age:   'บิลค้างนานที่สุดในสาขา',
      total: 'สาขาที่มีภาระงานธุรการรวมมากที่สุด',
      rate:  '% Clear วิกฤต+เร่ง ต่อบิลรวมของสาขา (≥3 บิล)',
      warn:  'Clear ปกติ (1–5 วัน) สะสมมาก'
    }[k] : {
      crit:  'บิลระดับวิกฤต สูงสุด ต้องแก้ไขทันที',
      urge:  'บิลระดับเร่งด่วน สะสมสูง ควรลงพื้นที่',
      age:   'บิลค้างนานที่สุดในสาขา',
      total: 'สาขาที่มีภาระงานรวมมากที่สุด',
      rate:  '% วิกฤต+เร่ง ต่อบิลรวมของสาขา (≥3 บิล)',
      warn:  'สะสมมาก ควรเฝ้าระวัง'
    }[k];
    el.textContent = rkDeptFilter ? base + ' · ' + deptShort : base;
  });
  const heatSub = document.getElementById('rk-heat-sub');
  if(heatSub) heatSub.textContent = 'เรียงจากอันตรายสูงสุด' + (rkDeptFilter ? ' · ' + deptShort : ' · ทุกหน่วยงาน');

  // ── Meta strip ──
  const totalBills   = src.length;
  const totalBranches = dcList.length;
  const isAdminMeta = rkDeptFilter==='สถานะบิลคงค้างDC แผนกธุรการสาขา';
  const critBranches = isAdminMeta ? dcList.filter(d=>d.rClearCrit>0).length : dcList.filter(d=>d.rCrit>0).length;
  const urgeBranches = isAdminMeta ? dcList.filter(d=>d.rClearCrit>0||d.rClearUrge>0).length : dcList.filter(d=>d.rUrge>0||d.rCrit>0).length;
  const metaStrip = document.getElementById('rk-meta-strip');
  if(metaStrip){
    const meta = [
      {num:totalBills.toLocaleString(), lbl:'บิลคงค้าง', sub: rkDeptFilter?deptShort:'ทุกหน่วยงาน', color:cfg.color},
      {num:totalBranches, lbl:'สาขาที่มีบิล', sub:'ในมุมมองนี้', color:'#7c3aed'},
      {num:critBranches, lbl:'สาขาวิกฤต', sub:'มีบิลวิกฤต ≥ 1 ใบ', color:'#7a0000'},
      {num:urgeBranches, lbl:'สาขาเร่งด่วน', sub:'มีบิลวิกฤต/เร่ง ≥ 1 ใบ', color:'var(--red)'},
    ];
    metaStrip.innerHTML = meta.map(m=>`
      <div style="background:var(--white);border-radius:var(--r);box-shadow:var(--sh);padding:10px 12px;border-top:3px solid ${m.color};text-align:center">
        <div style="font-size:22px;font-weight:800;line-height:1;margin-bottom:2px;color:${m.color}">${m.num}</div>
        <div style="font-size:10.5px;font-weight:700;color:var(--dark)">${m.lbl}</div>
        <div style="font-size:9.5px;color:var(--mid);margin-top:1px">${m.sub}</div>
      </div>
    `).join('');
  }

  // ── Helper: build horizontal bar chart ──
  function buildBars(containerId, sorted, valFn, colorFn, unitFn, maxVal){
    const el = document.getElementById(containerId);
    if(!el) return;
    const top = sorted.filter(d=>valFn(d)>0).slice(0, rkTopN);
    if(!top.length){
      el.innerHTML = '<div style="font-size:12px;color:var(--green);padding:8px 4px;display:flex;align-items:center;gap:6px"><i class="fa-solid fa-circle-check"></i>ไม่มีข้อมูลในมิตินี้</div>';
      return;
    }
    const mx = maxVal || Math.max(...top.map(valFn), 1);
    el.innerHTML = top.map((d,i)=>{
      const val = valFn(d);
      const pct = Math.max(5, Math.round(val/mx*100));
      const rankCls = i===0?'rk-rank-1':i===1?'rk-rank-2':i===2?'rk-rank-3':'rk-rank-n';
      const fillColor = colorFn(d,i);
      return `<div class="rk-bar-row">
        <div class="rk-rank-badge ${rankCls}">${i+1}</div>
        <div class="rk-dc-name">${d.dc}</div>
        <div class="rk-bar-track">
          <div class="rk-bar-fill" style="width:${pct}%;background:${fillColor}"></div>
        </div>
        <div class="rk-bar-val" style="color:${fillColor}">${unitFn(d,val)}</div>
      </div>`;
    }).join('');
  }

  // ── Render 6 charts ──

  // 1. วิกฤต
  const isAdmin = rkDeptFilter==='สถานะบิลคงค้างDC แผนกธุรการสาขา';
  buildBars('rk-bars-crit',
    [...dcList].sort((a,b)=>(isAdmin?b.rClearCrit:b.rCrit)-(isAdmin?a.rClearCrit:a.rCrit)),
    d=>isAdmin?d.rClearCrit:d.rCrit,
    (d,i)=>i===0?'#7a0000':'#c0392b',
    (d,v)=>v+' บิล'
  );

  // 2. ต้องเร่ง
  buildBars('rk-bars-urge',
    [...dcList].sort((a,b)=>(isAdmin?b.rClearUrge:b.rUrge)-(isAdmin?a.rClearUrge:a.rUrge)),
    d=>isAdmin?d.rClearUrge:d.rUrge,
    ()=>'var(--red)',
    (d,v)=>v+' บิล'
  );

  // 3. Max Age
  buildBars('rk-bars-age',
    [...dcList].sort((a,b)=>b.maxAge-a.maxAge),
    d=>d.maxAge,
    (d)=>{const a=d.maxAge; return a>7?'#7c3aed':a>5?'#9b5de5':'#b794f4';},
    (d,v)=>v+' วัน',
    Math.max(...dcList.map(d=>d.maxAge), 1)
  );

  // 4. Total
  buildBars('rk-bars-total',
    [...dcList].sort((a,b)=>b.total-a.total),
    d=>d.total,
    ()=>cfg.color||'var(--teal)',
    (d,v)=>v+' บิล',
    Math.max(...dcList.map(d=>d.total), 1)
  );

  // 5. Urgency Rate (≥3 บิล)
  const eligible = dcList.filter(d=>d.total>=3);
  buildBars('rk-bars-rate',
    [...eligible].sort((a,b)=>((isAdmin?(b.rClearCrit+b.rClearUrge):(b.rCrit+b.rUrge))/b.total)-((isAdmin?(a.rClearCrit+a.rClearUrge):(a.rCrit+a.rUrge))/a.total)),
    d=>Math.round((isAdmin?(d.rClearCrit+d.rClearUrge):(d.rCrit+d.rUrge))/d.total*100),
    (d)=>{const r=Math.round((d.rCrit+d.rUrge)/d.total*100); return r>=50?'#c2410c':r>=25?'#f97316':'#fb923c';},
    (d,v)=>v+'%',
    100
  );
  if(!eligible.length) {
    const el = document.getElementById('rk-bars-rate');
    if(el) el.innerHTML = '<div style="font-size:12px;color:var(--mid);padding:8px 4px">ไม่มีสาขาที่มี ≥3 บิล</div>';
  }

  // 6. เริ่มเสี่ยง / Clear ปกติ
  buildBars('rk-bars-warn',
    [...dcList].sort((a,b)=>(isAdmin?b.rClearOk:b.rWarn)-(isAdmin?a.rClearOk:a.rWarn)),
    d=>isAdmin?d.rClearOk:d.rWarn,
    ()=>isAdmin?'#2b55b8':'#f0a500',
    (d,v)=>v+' บิล'
  );

  // ── Heatmap ──
  renderRkHeatmap(dcList, cfg);
}

function renderRkHeatmap(dcList, cfg){
  const tbl = document.getElementById('rk-heat-tbl');
  if(!tbl) return;

  const isAdmHeat = rkDeptFilter==='สถานะบิลคงค้างDC แผนกธุรการสาขา';
  function tier(d){
    if(isAdmHeat){
      if(d.rClearCrit>0) return 1;
      if(d.rClearUrge>0) return 2;
      if(d.rClearOk>0)   return 3;
      return 6;
    }
    if(d.rCrit>0) return 1; if(d.rUrge>0) return 2;
    if(d.rWarn>0) return 3; if(d.rOk>0) return 4;
    if(d.rClear>0) return 5; return 6;
  }
  const sorted = [...dcList].sort((a,b)=>{
    const ta=tier(a), tb=tier(b);
    if(ta!==tb) return ta-tb;
    if(isAdmHeat){
      if(ta===1) return b.rClearCrit-a.rClearCrit;
      if(ta===2) return b.rClearUrge-a.rClearUrge;
      return b.rClearOk-a.rClearOk;
    }
    if(ta===1) return b.rCrit-a.rCrit;
    if(ta===2) return b.rUrge-a.rUrge;
    if(ta===3) return b.rWarn-a.rWarn;
    return b.total-a.total;
  });

  function hCell(val, cls){
    if(val===0) return `<td style="text-align:center"><span class="heat-cell heat-0">—</span></td>`;
    return `<td style="text-align:center"><span class="heat-cell ${cls}">${val}</span></td>`;
  }

  const rows = sorted.map((d,i)=>{
    const isAdm = rkDeptFilter==='สถานะบิลคงค้างDC แผนกธุรการสาขา';
    const urgRate = d.total>0 ? Math.round((isAdm?(d.rClearCrit+d.rClearUrge):(d.rCrit+d.rUrge))/d.total*100) : 0;
    const rateCls = urgRate>=50?'color:#c2410c;font-weight:800':urgRate>=25?'color:#f97316;font-weight:700':'color:var(--mid)';
    const rankBadgeCls = i===0?'rk-rank-1':i===1?'rk-rank-2':i===2?'rk-rank-3':'rk-rank-n';
    const avgAge = d.total>0 ? (d.sumAge/d.total).toFixed(1) : '—';
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:6px">
        <div class="rk-rank-badge ${rankBadgeCls}" style="min-width:22px;flex-shrink:0">${i+1}</div>
        <span style="font-weight:700;font-size:12px">${d.dc}</span>
      </div></td>
      <td style="text-align:center;font-weight:700">${d.total}</td>
      ${hCell(d.rCrit,'heat-crit')}
      ${hCell(d.rUrge,'heat-urge')}
      ${hCell(d.rWarn,'heat-warn')}
      ${hCell(d.rOk,'heat-ok')}
      ${isAdm
        ? `<td style="text-align:center">
            ${d.rClearCrit>0?`<span class="heat-cell heat-crit" style="margin:0 1px">${d.rClearCrit}</span>`:''}
            ${d.rClearUrge>0?`<span class="heat-cell heat-urge" style="margin:0 1px">${d.rClearUrge}</span>`:''}
            ${d.rClearOk>0?`<span class="heat-cell heat-ok" style="margin:0 1px">${d.rClearOk}</span>`:''}
            ${d.rClear===0?`<span class="heat-cell heat-0">—</span>`:''}
           </td>`
        : hCell(d.rClear,'heat-clear')}
      <td style="text-align:center"><span style="${rateCls}">${urgRate}%</span></td>
      <td style="text-align:center;color:#7c3aed;font-weight:700">${d.maxAge} วัน</td>
      <td style="text-align:center;color:var(--mid)">${avgAge} วัน</td>
    </tr>`;
  }).join('');

  tbl.innerHTML = `<thead><tr>
    <th>สาขา (DC)</th>
    <th style="text-align:center">รวม</th>
    <th style="text-align:center"><i class="fa-solid fa-bolt" style="color:#7a0000"></i> วิกฤต</th>
    <th style="text-align:center"><i class="fa-solid fa-triangle-exclamation" style="color:var(--red)"></i> เร่ง</th>
    <th style="text-align:center"><i class="fa-solid fa-circle-exclamation" style="color:var(--yellow)"></i> เสี่ยง</th>
    <th style="text-align:center"><i class="fa-solid fa-circle-check" style="color:var(--green)"></i> ปกติ</th>
    <th style="text-align:center"><i class="fa-solid fa-flag-checkered" style="color:#2b55b8"></i> Clear</th>
    <th style="text-align:center">Urgency%</th>
    <th style="text-align:center">Max Age</th>
    <th style="text-align:center">Avg Age</th>
  </tr></thead><tbody>${rows}</tbody>`;
}



function exportExcel(){
  const filtered = getFiltered();
  filtered.sort((a,b)=>{
    let va=a[sortField],vb=b[sortField];
    if(sortField==='age'){va=a.age;vb=b.age;}
    if(va<vb) return sortAsc?-1:1;
    if(va>vb) return sortAsc?1:-1;
    return 0;
  });

  const rows = filtered.map(b=>{
    const rl = b._risk || getRiskLevel(b.age, b.type, b.problem);
    return {
      'เลขที่บิล': b.no,
      'วันที่บิล': b.dateStr,
      'DC (โฟกัส)': b.dcFocus,
      'DC ปลายทาง': b.dcDest,
      'DC ปัจจุบัน': b.dcCurrent,
      'สถานะของ DC': b.dcGroupRef,
      'สถานะบิล': b.status,
      'ประเภทสินค้า': b.type,
      'กำหนดส่ง (SLA)': b.sla || '',
      'อายุบิล (วัน)': b.age,
      'สถานะอายุ': b.ageStatus,
      'ระดับความเสี่ยง': rl,
      'ประเภทปัญหา': b.problem
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  // Column widths
  ws['!cols'] = [
    {wch:16},{wch:12},{wch:22},{wch:22},{wch:22},{wch:14},
    {wch:40},{wch:18},{wch:13},{wch:14},{wch:12},{wch:18},{wch:30}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'รายการบิล');

  const today = refDate.replace(/\//g,'-');
  XLSX.writeFile(wb, `nimex_bills_${today}.xlsx`);
}

// ══ Bill Detail ══
// ══ ข้อมูลรายบิล ══

let BD_RAW = [];
let bdInited = false;
let bdFiltered = [];
let bdSortField = 'เลขที่บิล';
let bdSortAsc = true;
let bdPage = 1;
const BD_PAGE_SIZE = 100;
const BD_DCS = ["150  DC เชียงใหม่", "151  DC ลำพูน", "152  DC ลำปาง", "153  DC อุตรดิตถ์", "154  DC แพร่", "155  DC น่าน", "156  DC พะเยา", "157  DC เชียงราย", "158  DC แม่ฮ่องสอน", "159  DC ฝาง", "160  DC นครสวรรค์", "163  DC ตาก", "164  DC สุโขทัย", "165  DC พิษณุโลก", "166  DC พิจิตร", "167  DC เพชรบูรณ์", "170  DC ชัยนาท", "171  DC แม่สาย", "230  DC โคราช", "231  DC บุรีรัมย์", "232  DC สุรินทร์", "233  DC ศรีสะเกษ", "234  DC อุบลราชธานี", "235  DC ยโสธร", "236  DC ชัยภูมิ", "240  DC ขอนแก่น", "241  DC อุดรธานี", "243  DC หนองคาย", "245  DC ร้อยเอ็ด", "246  DC กาฬสินธุ์", "247  DC สกลนคร", "248  DC นครพนม", "249  DC มุกดาหาร", "251  DC ปากช่อง", "320  DC ชลบุรี", "321  DC ระยอง", "322  DC จันทบุรี", "323  DC พัทยา", "325  DC ปราจีนบุรี", "476  DC ชะอำ", "480  DC ทุ่งสง", "481  DC นครศรีธรรมราช", "482  DC พังงา", "483  DC ภูเก็ต", "484  DC สุราษฎร์", "486  DC ชุมพร", "487  DC กระบี่", "490  DC หาดใหญ่", "493  DC พัทลุง", "610  DC พุทธมณฑลสาย 3", "615  DC ลพบุรี", "618  DC สระบุรี", "621  DC รังสิต", "624  DC ฉะเชิงเทรา", "631  DC อยุธยา", "670  DC ราชบุรี", "671  DC กาญจนบุรี", "672  DC สุพรรณบุรี", "673  DC นครปฐม", "674  DC สมุทรสาคร", "691  CDC บางนา", "900  DC เวียงจันทน์"];

function initBillDetail(){
  if(bdInited) return;
  bdInited = true;
  try{
    const bin = atob(BD_DATA_B64);
    const arr = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    BD_RAW = JSON.parse(pako.inflate(arr,{to:'string'}));
  }catch(e){console.error('BD decompress error',e);BD_RAW=[];}

  // populate DC dropdown
  const dcSel = document.getElementById('bd-f-dc');
  BD_DCS.forEach(d=>{ const o=document.createElement('option');o.value=d;o.textContent=d;dcSel.appendChild(o); });

  // populate status dropdown
  const stSel = document.getElementById('bd-f-status');
  const statuses = [...new Set(BD_RAW.map(r=>r['สถานะบิล']).filter(Boolean))].sort();
  statuses.forEach(s=>{ const o=document.createElement('option');o.value=s;o.textContent=s.length>45?s.substring(0,45)+'…':s;stSel.appendChild(o); });

  // populate type dropdown
  const tySel = document.getElementById('bd-f-type');
  const types = [...new Set(BD_RAW.map(r=>r['ประเภทบิล']).filter(Boolean))].sort();
  types.forEach(t=>{ const o=document.createElement('option');o.value=t;o.textContent=t;tySel.appendChild(o); });

  bdFiltered = [...BD_RAW];
  bdPage = 1;
  renderBillDetail();
}

function bdStatusBadge(s){
  if(!s) return '<span class="bd-status-badge bd-s-default">-</span>';
  let cls='bd-s-default';
  if(s.startsWith('06')) cls='bd-s-ok';
  else if(s.startsWith('05199')) cls='bd-s-err';
  else if(s.startsWith('051')) cls='bd-s-warn';
  else if(s.startsWith('031')||s.startsWith('033')||s.startsWith('034')) cls='bd-s-transit';
  else if(s.startsWith('02')) cls='bd-s-transit';
  else if(s.startsWith('CLEAR')) cls='bd-s-clear';
  return `<span class="bd-status-badge ${cls}" title="${s}">${s}</span>`;
}

function bdTypeBadge(t){
  if(!t) return '';
  if(t.includes('Cold')) return `<span class="type-badge type-cold"><i class="fa-solid fa-snowflake" style="font-size:9px"></i>${t}</span>`;
  return `<span class="type-badge type-dry"><i class="fa-solid fa-cubes" style="font-size:9px"></i>${t}</span>`;
}

function renderBillDetail(){
  const dc = document.getElementById('bd-f-dc').value;
  const st = document.getElementById('bd-f-status').value;
  const ty = document.getElementById('bd-f-type').value;
  const q  = document.getElementById('bd-f-search').value.trim().toLowerCase();

  bdFiltered = BD_RAW.filter(r=>{
    if(dc && r['DC ปลายทาง']!==dc) return false;
    if(st && r['สถานะบิล']!==st) return false;
    if(ty && r['ประเภทบิล']!==ty) return false;
    if(q && !String(r['เลขที่บิล']).toLowerCase().includes(q) && !r['ชื่อผู้รับ'].toLowerCase().includes(q)) return false;
    return true;
  });

  bdFiltered.sort((a,b)=>{
    let va=a[bdSortField], vb=b[bdSortField];
    if(bdSortField==='จำนวน'||bdSortField==='COD'){va=+va||0;vb=+vb||0;}
    if(va<vb) return bdSortAsc?-1:1;
    if(va>vb) return bdSortAsc?1:-1;
    return 0;
  });

  // update stats
  const total = bdFiltered.length;
  const success = bdFiltered.filter(r=>r['ประเภทบิล']==='สินค้าทั่วไป').length;
  const transit = bdFiltered.filter(r=>r['ประเภทบิล']==='สินค้า Coldchain').length;

  document.getElementById('bd-stat-total').textContent=total.toLocaleString('th');
  document.getElementById('bd-stat-success').textContent=success.toLocaleString('th');
  document.getElementById('bd-stat-transit').textContent=transit.toLocaleString('th');

  document.getElementById('bd-f-count').textContent=total.toLocaleString('th')+' รายการ';

  const totalPages=Math.max(1,Math.ceil(total/BD_PAGE_SIZE));
  if(bdPage>totalPages) bdPage=1;
  const page=bdFiltered.slice((bdPage-1)*BD_PAGE_SIZE,bdPage*BD_PAGE_SIZE);

  // Desktop table
  const tbody=document.getElementById('bd-tbl-body');
  tbody.innerHTML='';
  page.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td style="font-weight:600;font-size:12px;font-family:monospace">${r['เลขที่บิล']}</td>
      <td>${r['วันที่บิล']}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r['ชื่อผู้รับ']}">${r['ชื่อผู้รับ']}</td>
      <td>${r['ตำบล']}</td>
      <td>${r['อำเภอ']}</td>
      <td>${r['จังหวัด']}</td>
      <td style="font-size:11px;color:var(--mid)">${r['DC ต้นทาง']}</td>
      <td style="font-size:11px;font-weight:600">${r['DC ปลายทาง']}</td>
      <td style="font-size:11px;color:var(--mid)">${r['DC ปัจจุบัน']}</td>
      <td>${bdStatusBadge(r['สถานะบิล'])}</td>
      <td class="td-num">${r['จำนวน']}</td>
      <td class="td-num">${(+r['COD']||0).toLocaleString('th-TH',{maximumFractionDigits:0})}</td>
      <td>${bdTypeBadge(r['ประเภทบิล'])}</td>
      <td>${r['กำหนดส่ง (SLA)']}</td>`;
    tbody.appendChild(tr);
  });

  // Mobile cards
  const mc=document.getElementById('bd-mob-cards');
  mc.innerHTML='';
  page.forEach(r=>{
    const card=document.createElement('div');
    const isOk=r['สถานะบิล'].startsWith('06');
    const isWarn=r['สถานะบิล'].startsWith('051');
    const cls=isOk?'ok':isWarn?'slow':'';
    card.className='mob-card '+cls;
    card.innerHTML=`<div class="mob-head" onclick="toggleMob(this)">
      <div class="mob-head-left">
        <div class="mob-billno">${r['เลขที่บิล']}</div>
        <div class="mob-dc"><i class="fa-solid fa-location-dot" style="font-size:10px;color:var(--teal)"></i> ${r['DC ปลายทาง']}</div>
      </div>
      <div class="mob-head-right">
        ${bdStatusBadge(r['สถานะบิล'])}
        ${bdTypeBadge(r['ประเภทบิล'])}
      </div>
      <i class="fa-solid fa-chevron-down mob-chev"></i>
    </div>
    <div class="mob-body">
      <div class="mob-field"><div class="mob-flbl">ชื่อผู้รับ</div><div class="mob-fval">${r['ชื่อผู้รับ']}</div></div>
      <div class="mob-field"><div class="mob-flbl">วันที่บิล</div><div class="mob-fval">${r['วันที่บิล']}</div></div>
      <div class="mob-field"><div class="mob-flbl">ตำบล / อำเภอ / จังหวัด</div><div class="mob-fval">${r['ตำบล']} ${r['อำเภอ']} ${r['จังหวัด']}</div></div>
      <div class="mob-field"><div class="mob-flbl">DC ต้นทาง</div><div class="mob-fval">${r['DC ต้นทาง']}</div></div>
      <div class="mob-field"><div class="mob-flbl">DC ปัจจุบัน</div><div class="mob-fval">${r['DC ปัจจุบัน']}</div></div>
      <div class="mob-field"><div class="mob-flbl">จำนวน / COD</div><div class="mob-fval">${r['จำนวน']} ชิ้น &nbsp;|&nbsp; ฿${(+r['COD']||0).toLocaleString('th-TH',{maximumFractionDigits:0})}</div></div>
      <div class="mob-field"><div class="mob-flbl">กำหนดส่ง (SLA)</div><div class="mob-fval">${r['กำหนดส่ง (SLA)']}</div></div>
    </div>`;
    mc.appendChild(card);
  });

  bdRenderPagination(totalPages);
}

function bdSortBy(f){
  if(bdSortField===f) bdSortAsc=!bdSortAsc; else {bdSortField=f;bdSortAsc=true;}
  bdPage=1; renderBillDetail();
}

function bdRenderPagination(totalPages){
  const pg=document.getElementById('bd-pagination');
  pg.innerHTML='';
  if(totalPages<=1) return;
  const prev=document.createElement('button');
  prev.className='page-btn';prev.textContent='←';prev.disabled=bdPage===1;
  prev.onclick=()=>{bdPage--;renderBillDetail();};
  pg.appendChild(prev);
  const info=document.createElement('span');
  info.className='page-info';info.textContent=`หน้า ${bdPage} / ${totalPages} (แสดงทีละ ${BD_PAGE_SIZE} รายการ)`;
  pg.appendChild(info);
  const next=document.createElement('button');
  next.className='page-btn';next.textContent='→';next.disabled=bdPage===totalPages;
  next.onclick=()=>{bdPage++;renderBillDetail();};
  pg.appendChild(next);
}

function exportBillDetailCSV(){
  const cols=['เลขที่บิล','วันที่บิล','ชื่อผู้รับ','ตำบล','อำเภอ','จังหวัด','DC ต้นทาง','DC ปลายทาง','DC ปัจจุบัน','สถานะบิล','จำนวน','COD','ประเภทบิล','กำหนดส่ง (SLA)'];
  const rows=[cols.join(',')].concat(bdFiltered.map(r=>cols.map(c=>'"'+(r[c]||'').toString().replace(/"/g,'""')+'"').join(',')));
  const blob=new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='ข้อมูลรายบิล.csv';a.click();
}

// ══ Dist Management ══
// ══ การจัดการงานกระจาย ══

const DM_DCS = ["150  DC เชียงใหม่", "151  DC ลำพูน", "152  DC ลำปาง", "153  DC อุตรดิตถ์", "154  DC แพร่", "155  DC น่าน", "156  DC พะเยา", "157  DC เชียงราย", "158  DC แม่ฮ่องสอน", "159  DC ฝาง", "160  DC นครสวรรค์", "163  DC ตาก", "164  DC สุโขทัย", "165  DC พิษณุโลก", "166  DC พิจิตร", "167  DC เพชรบูรณ์", "170  DC ชัยนาท", "171  DC แม่สาย", "230  DC โคราช", "231  DC บุรีรัมย์", "232  DC สุรินทร์", "233  DC ศรีสะเกษ", "234  DC อุบลราชธานี", "235  DC ยโสธร", "236  DC ชัยภูมิ", "240  DC ขอนแก่น", "241  DC อุดรธานี", "243  DC หนองคาย", "245  DC ร้อยเอ็ด", "246  DC กาฬสินธุ์", "247  DC สกลนคร", "248  DC นครพนม", "249  DC มุกดาหาร", "251  DC ปากช่อง", "320  DC ชลบุรี", "321  DC ระยอง", "322  DC จันทบุรี", "323  DC พัทยา", "325  DC ปราจีนบุรี", "476  DC ชะอำ", "480  DC ทุ่งสง", "481  DC นครศรีธรรมราช", "482  DC พังงา", "483  DC ภูเก็ต", "484  DC สุราษฎร์", "486  DC ชุมพร", "487  DC กระบี่", "490  DC หาดใหญ่", "493  DC พัทลุง", "610  DC พุทธมณฑลสาย 3", "615  DC ลพบุรี", "618  DC สระบุรี", "621  DC รังสิต", "624  DC ฉะเชิงเทรา", "631  DC อยุธยา", "670  DC ราชบุรี", "671  DC กาญจนบุรี", "672  DC สุพรรณบุรี", "673  DC นครปฐม", "674  DC สมุทรสาคร", "691  CDC บางนา"];
let DM_RAW = [];
let dmInited = false;
let dmView = 'dc';          // 'dc' | 'area' | 'bill'
let dmGrp = 'ตำบล';        // 'ตำบล' | 'อำเภอ' | 'จังหวัด'
let dmFiltered = [];
let dmDrillArea = null;     // drill-down area value
let dmDrillDC = null;
let dmDCSortF = 'total'; let dmDCSortAsc = false;
let dmAreaSortF = 'total'; let dmAreaSortAsc = false;
let dmBillSortF = 'จำนวนวันคงค้างตามสถานะ'; let dmBillSortAsc = false;
let dmBillPage = 1; const DM_PAGE = 100;

function initDistMgmt(){
  if(dmInited) return;
  dmInited = true;
  try{
    const bin=atob(DM_DATA_B64);
    const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    DM_RAW=JSON.parse(pako.inflate(arr,{to:'string'}));
  }catch(e){console.error('DM decompress',e);DM_RAW=[];}

  const dcSel=document.getElementById('dm-f-dc');
  DM_DCS.forEach(d=>{const o=document.createElement('option');o.value=d;o.textContent=d;dcSel.appendChild(o);});

  dmFiltered=[...DM_RAW];
  dmRender();
}

function dmGetFiltered(){
  const dc=document.getElementById('dm-f-dc').value;
  const prob=document.getElementById('dm-f-prob').value;
  const ty=document.getElementById('dm-f-type').value;
  const q=document.getElementById('dm-f-search').value.trim().toLowerCase();
  return DM_RAW.filter(r=>{
    if(dc && r['DC ปลายทาง']!==dc) return false;
    if(prob){
      if(prob==='ส่งไม่ได้' && !r['ประเภทปัญหา'].startsWith('ส่งไม่ได้')) return false;
      else if(prob!=='ส่งไม่ได้' && r['ประเภทปัญหา']!==prob) return false;
    }
    if(ty && r['ประเภทบิล']!==ty) return false;
    if(q && !r['เลขที่บิล'].includes(q) && !r['ชื่อผู้รับ'].toLowerCase().includes(q) && !r['ตำบล'].includes(q) && !r['อำเภอ'].includes(q)) return false;
    if(dmDrillArea && r[dmGrp]!==dmDrillArea) return false;
    if(dmDrillDC && r['DC ปลายทาง']!==dmDrillDC) return false;
    return true;
  });
}

function dmRender(){
  dmFiltered=dmGetFiltered();
  const total=dmFiltered.length;
  const wait=dmFiltered.filter(r=>r['ประเภทปัญหา']==='รอกระจาย').length;
  const fail=dmFiltered.filter(r=>r['ประเภทปัญหา'].startsWith('ส่งไม่ได้')).length;
  const ret=dmFiltered.filter(r=>r['ประเภทปัญหา']==='รอส่งกลับ').length;
  document.getElementById('dm-stat-total').textContent=total.toLocaleString('th');
  document.getElementById('dm-stat-wait').textContent=wait.toLocaleString('th');
  document.getElementById('dm-stat-fail').textContent=fail.toLocaleString('th');
  document.getElementById('dm-stat-ret').textContent=ret.toLocaleString('th');
  document.getElementById('dm-f-count').textContent=total.toLocaleString('th')+' รายการ';

  if(dmView==='dc') dmRenderDC();
  else if(dmView==='area') dmRenderArea();
  else dmRenderBills();
}

function dmSetView(v){
  dmView=v;
  ['dc','area','bill'].forEach(x=>{
    document.getElementById('dm-panel-'+x).style.display=x===v?'':'none';
  });
  document.querySelectorAll('.dm-view-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('dm-view-'+v).classList.add('active');
  dmRender();
}

function dmSetGrp(g){
  dmGrp=g;
  document.getElementById('dm-area-th').textContent=g;
  document.querySelectorAll('.dm-grp-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('dm-grp-'+{ตำบล:'tambon',อำเภอ:'amphoe',จังหวัด:'province'}[g]).classList.add('active');
  dmDrillArea=null; dmDrillDC=null;
  document.getElementById('dm-area-dc-label').textContent='';
  dmRender();
}

function dmSetProb(p,card){
  document.getElementById('dm-f-prob').value=p;
  dmDrillArea=null; dmDrillDC=null;
  dmRender();
}

function dmLevelBadge(fail,total){
  const pct=total>0?fail/total:0;
  if(fail>=3||pct>=0.15) return '<span class="dm-badge dm-crit"><i class="fa-solid fa-bolt" style="font-size:9px"></i> วิกฤต</span>';
  if(fail>=2||pct>=0.08) return '<span class="dm-badge dm-hi"><i class="fa-solid fa-triangle-exclamation" style="font-size:9px"></i> สูง</span>';
  if(fail>=1||pct>=0.03) return '<span class="dm-badge dm-mid"><i class="fa-solid fa-circle-exclamation" style="font-size:9px"></i> ปานกลาง</span>';
  return '<span class="dm-badge dm-lo"><i class="fa-solid fa-circle-check" style="font-size:9px"></i> ปกติ</span>';
}

function dmHeatBar(val,max){
  const pct=max>0?Math.round(val/max*100):0;
  const col=pct>=60?'var(--red)':pct>=30?'var(--yellow)':pct>=10?'var(--teal)':'var(--green)';
  return `<div class="dm-heat-bar"><div class="dm-heat-fill" style="width:${pct}%;background:${col}"></div></div>`;
}

function dmProbBadge(p){
  if(p==='รอกระจาย') return '<span class="dm-badge" style="background:var(--teal-light);color:var(--teal2)">รอกระจาย</span>';
  if(p==='ส่งไม่ได้ครั้งที่ 1') return '<span class="dm-badge dm-mid">ส่งไม่ได้ ครั้ง 1</span>';
  if(p==='ส่งไม่ได้ครั้งที่ 2') return '<span class="dm-badge dm-hi">ส่งไม่ได้ ครั้ง 2</span>';
  if(p==='ส่งไม่ได้ครั้งที่ 3+') return '<span class="dm-badge dm-crit">ส่งไม่ได้ ครั้ง 3+</span>';
  if(p==='รอส่งกลับ') return '<span class="dm-badge dm-crit">รอส่งกลับ</span>';
  return `<span class="dm-badge" style="background:var(--gray-light);color:var(--mid)">${p}</span>`;
}

// ── DC view ──
function dmRenderDC(){
  const grpMap={};
  dmFiltered.forEach(r=>{
    const dc=r['DC ปลายทาง']||'ไม่ระบุ';
    if(!grpMap[dc]) grpMap[dc]={dc,total:0,wait:0,fail1:0,fail2:0,fail3:0,ret:0};
    const g=grpMap[dc]; g.total++;
    const p=r['ประเภทปัญหา'];
    if(p==='รอกระจาย') g.wait++;
    else if(p==='ส่งไม่ได้ครั้งที่ 1') g.fail1++;
    else if(p==='ส่งไม่ได้ครั้งที่ 2') g.fail2++;
    else if(p==='ส่งไม่ได้ครั้งที่ 3+') g.fail3++;
    else if(p==='รอส่งกลับ') g.ret++;
  });
  let rows=Object.values(grpMap);
  rows.sort((a,b)=>{
    const va=a[dmDCSortF]||0,vb=b[dmDCSortF]||0;
    if(typeof va==='string') return dmDCSortAsc?va.localeCompare(vb,'th'):vb.localeCompare(va,'th');
    return dmDCSortAsc?va-vb:vb-va;
  });
  const maxTotal=Math.max(...rows.map(r=>r.total),1);
  const tbody=document.getElementById('dm-dc-body');
  tbody.innerHTML='';
  const dmDCMob=document.getElementById('dm-dc-mob');
  dmDCMob.innerHTML='';
  rows.forEach(r=>{
    const fail=r.fail1+r.fail2+r.fail3+r.ret;
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td style="font-weight:600">${r.dc}</td>
      <td style="text-align:right;font-weight:700;color:var(--teal)">${r.total.toLocaleString('th')}</td>
      <td style="text-align:right">${r.wait.toLocaleString('th')}</td>
      <td style="text-align:right;color:${r.fail1>0?'var(--yellow)':'var(--mid)'};font-weight:${r.fail1>0?700:400}">${r.fail1||'-'}</td>
      <td style="text-align:right;color:${r.fail2>0?'var(--red)':'var(--mid)'};font-weight:${r.fail2>0?700:400}">${r.fail2||'-'}</td>
      <td style="text-align:right;color:${r.fail3>0?'#7a0000':'var(--mid)'};font-weight:${r.fail3>0?700:400}">${r.fail3||'-'}</td>
      <td style="text-align:right;color:${r.ret>0?'var(--red)':'var(--mid)'};font-weight:${r.ret>0?700:400}">${r.ret||'-'}</td>
      <td style="text-align:center">${dmLevelBadge(fail,r.total)}</td>
      <td style="text-align:center"><button class="dm-drill-btn" onclick="dmDrillDCToArea('${r.dc.replace(/'/g,"\'")}')"><i class="fa-solid fa-map-pin"></i> พื้นที่</button></td>`;
    tbody.appendChild(tr);
    // mobile card
    const _pct=r.total>0?Math.round((r.fail1+r.fail2+r.fail3+r.ret)/r.total*100):0;
    const _lvl=_pct>=15?'crit':_pct>=8?'hi':'lo';
    const _card=document.createElement('div');
    _card.className='dm-sum-card '+_lvl;
    const _fail=r.fail1+r.fail2+r.fail3+r.ret;
    _card.innerHTML='<div class="dm-sum-title"><i class="fa-solid fa-warehouse" style="color:var(--teal);margin-right:6px;font-size:11px"></i>'+r.dc+'</div>'
      +'<div class="dm-sum-stat"><span style="color:var(--mid)">รวมทั้งหมด</span><span style="font-weight:700;color:var(--teal)">'+r.total.toLocaleString('th')+'</span></div>'
      +'<div class="dm-sum-stat"><span style="color:var(--mid)">รอกระจาย</span><span>'+r.wait.toLocaleString('th')+'</span></div>'
      +(r.fail1?'<div class="dm-sum-stat"><span style="color:var(--yellow)">ส่งไม่ได้ครั้ง 1</span><span style="font-weight:700;color:var(--yellow)">'+r.fail1+'</span></div>':'')
      +(r.fail2?'<div class="dm-sum-stat"><span style="color:var(--red)">ส่งไม่ได้ครั้ง 2</span><span style="font-weight:700;color:var(--red)">'+r.fail2+'</span></div>':'')
      +(r.fail3?'<div class="dm-sum-stat"><span style="color:#7a0000">ส่งไม่ได้ครั้ง 3+</span><span style="font-weight:700;color:#7a0000">'+r.fail3+'</span></div>':'')
      +(r.ret?'<div class="dm-sum-stat"><span style="color:var(--red)">รอส่งกลับ</span><span style="font-weight:700;color:var(--red)">'+r.ret+'</span></div>':'')
      +'<div class="dm-sum-pills" style="margin-top:8px">'+dmLevelBadge(_fail,r.total)
      +'<button class="dm-drill-btn" onclick="dmDrillDCToArea(this.dataset.dc)" data-dc="'+r.dc+'"><i class="fa-solid fa-map-pin"></i> ดูพื้นที่</button></div>';
    dmDCMob.appendChild(_card);
  });
}

function dmDCSortBy(f){
  if(dmDCSortF===f) dmDCSortAsc=!dmDCSortAsc; else {dmDCSortF=f;dmDCSortAsc=false;}
  dmRenderDC();
}

function dmDrillDCToArea(dc){
  document.getElementById('dm-f-dc').value=dc;
  dmDrillDC=null;
  document.getElementById('dm-area-dc-label').textContent='DC: '+dc;
  dmSetView('area');
}

// ── Area view ──
function dmRenderArea(){
  const dcFilter=document.getElementById('dm-f-dc').value;
  const src=dcFilter?dmFiltered:dmFiltered;
  const grpMap={};
  src.forEach(r=>{
    const key=r[dmGrp]||'ไม่ระบุ';
    if(!grpMap[key]) grpMap[key]={area:key,dc:r['DC ปลายทาง'],total:0,wait:0,fail:0,ret:0};
    const g=grpMap[key]; g.total++;
    const p=r['ประเภทปัญหา'];
    if(p==='รอกระจาย') g.wait++;
    else if(p.startsWith('ส่งไม่ได้')) g.fail++;
    else if(p==='รอส่งกลับ') g.ret++;
    // track all DCs for this area
    if(!g.dcs) g.dcs=new Set();
    g.dcs.add(r['DC ปลายทาง']);
  });
  let rows=Object.values(grpMap);
  // if multi-DC, join
  rows.forEach(r=>{ r.dcLabel=r.dcs?[...r.dcs].slice(0,2).join(', ')+(r.dcs.size>2?'…':''):r.dc; });
  rows.sort((a,b)=>{
    const va=a[dmAreaSortF],vb=b[dmAreaSortF];
    if(typeof va==='string') return dmAreaSortAsc?va.localeCompare(vb,'th'):vb.localeCompare(va,'th');
    return dmAreaSortAsc?va-vb:vb-va;
  });
  const maxTotal=Math.max(...rows.map(r=>r.total),1);
  const tbody=document.getElementById('dm-area-body');
  tbody.innerHTML='';
  const dmAreaMob=document.getElementById('dm-area-mob');
  dmAreaMob.innerHTML='';
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td style="font-weight:600">${r.area}</td>
      <td style="font-size:11px;color:var(--mid)">${r.dcLabel}</td>
      <td style="text-align:right;font-weight:700;color:var(--teal)">${r.total.toLocaleString('th')}</td>
      <td style="text-align:right">${r.wait.toLocaleString('th')}</td>
      <td style="text-align:right;color:${r.fail>0?'var(--red)':'var(--mid)'};font-weight:${r.fail>0?700:400}">${r.fail||'-'}</td>
      <td style="text-align:right;color:${r.ret>0?'var(--red)':'var(--mid)'}">${r.ret||'-'}</td>
      <td style="min-width:80px">${dmHeatBar(r.total,maxTotal)}</td>
      <td style="text-align:center"><button class="dm-drill-btn" onclick="dmDrillToBills('${r.area.replace(/'/g,"\'")}')"><i class="fa-solid fa-list"></i> บิล</button></td>`;
    tbody.appendChild(tr);
    // mobile card
    const _afail=r.fail;
    const _apct=r.total>0?Math.round(_afail/r.total*100):0;
    const _alvl=_apct>=15?'crit':_apct>=8?'hi':'lo';
    const _ac=document.createElement('div');
    _ac.className='dm-sum-card '+_alvl;
    _ac.innerHTML='<div class="dm-sum-title"><i class="fa-solid fa-map-pin" style="color:var(--teal);margin-right:6px;font-size:11px"></i>'+r.area+'</div>'
      +'<div class="dm-sum-stat"><span style="color:var(--mid)">DC</span><span style="font-size:11px;color:var(--mid)">'+r.dcLabel+'</span></div>'
      +'<div class="dm-sum-stat"><span style="color:var(--mid)">รวม</span><span style="font-weight:700;color:var(--teal)">'+r.total.toLocaleString('th')+'</span></div>'
      +'<div class="dm-sum-stat"><span style="color:var(--mid)">รอกระจาย</span><span>'+r.wait.toLocaleString('th')+'</span></div>'
      +(_afail?'<div class="dm-sum-stat"><span style="color:var(--red)">ส่งไม่ได้</span><span style="font-weight:700;color:var(--red)">'+_afail+'</span></div>':'')
      +(r.ret?'<div class="dm-sum-stat"><span style="color:var(--red)">รอส่งกลับ</span><span style="font-weight:700;color:var(--red)">'+r.ret+'</span></div>':'')
      +'<div class="dm-sum-pills" style="margin-top:8px">'
      +'<button class="dm-drill-btn" onclick="dmDrillToBills(this.dataset.a)" data-a="'+r.area+'"><i class="fa-solid fa-list"></i> ดูบิล</button></div>';
    dmAreaMob.appendChild(_ac);
  });
}

function dmAreaSortBy(f){
  if(dmAreaSortF===f) dmAreaSortAsc=!dmAreaSortAsc; else {dmAreaSortF=f;dmAreaSortAsc=false;}
  dmRenderArea();
}

function dmDrillToBills(area){
  dmDrillArea=area;
  document.getElementById('dm-drill-label').innerHTML=`<i class="fa-solid fa-filter" style="color:var(--teal)"></i> กรองตาม ${dmGrp}: <b>${area}</b> &nbsp;<button onclick="dmClearDrill()" style="padding:2px 8px;border-radius:6px;border:1.5px solid var(--border);background:var(--white);font-size:11px;cursor:pointer;font-family:var(--font)">✕ ล้าง</button>`;
  dmBillPage=1;
  dmSetView('bill');
}

function dmClearDrill(){
  dmDrillArea=null;
  document.getElementById('dm-drill-label').textContent='';
  dmRender();
}

// ── Bill list view ──
function dmRenderBills(){
  let src=[...dmFiltered];
  src.sort((a,b)=>{
    let va=a[dmBillSortF],vb=b[dmBillSortF];
    if(dmBillSortF==='จำนวนวันคงค้างตามสถานะ'){va=+va||0;vb=+vb||0;}
    if(va<vb) return dmBillSortAsc?-1:1;
    if(va>vb) return dmBillSortAsc?1:-1;
    return 0;
  });
  const totalPages=Math.max(1,Math.ceil(src.length/DM_PAGE));
  if(dmBillPage>totalPages) dmBillPage=1;
  const page=src.slice((dmBillPage-1)*DM_PAGE,dmBillPage*DM_PAGE);
  const tbody=document.getElementById('dm-bill-body');
  tbody.innerHTML='';
  page.forEach(r=>{
    const days=+r['จำนวนวันคงค้างตามสถานะ']||0;
    const dayCls=days>=5?'age-over':days>=3?'age-slow':'age-ok';
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td style="font-weight:600;font-size:12px;font-family:monospace">${r['เลขที่บิล']}</td>
      <td>${r['วันที่บิล']}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r['ชื่อผู้รับ']}">${r['ชื่อผู้รับ']}</td>
      <td style="font-weight:500">${r['ตำบล']}</td>
      <td>${r['อำเภอ']}</td>
      <td>${r['จังหวัด']}</td>
      <td style="font-size:11px;font-weight:600;color:var(--teal2)">${r['DC ปลายทาง']}</td>
      <td style="font-size:10px;color:var(--mid);max-width:160px;white-space:normal;line-height:1.4">${r['สถานะบิล']}</td>
      <td style="text-align:center">${dmProbBadge(r['ประเภทปัญหา'])}</td>
      <td style="text-align:right"><span class="age-badge ${dayCls}">${days} วัน</span></td>
      <td>${r['กำหนดส่ง (SLA)']}</td>`;
    tbody.appendChild(tr);
  });

  // mobile cards
  const mc=document.getElementById('dm-mob-cards');
  mc.innerHTML='';
  page.forEach(r=>{
    const days=+r['จำนวนวันคงค้างตามสถานะ']||0;
    const cls=days>=5?'over':days>=3?'slow':'ok';
    const card=document.createElement('div');
    card.className='mob-card '+cls;
    card.innerHTML=`<div class="mob-head" onclick="toggleMob(this)">
      <div class="mob-head-left">
        <div class="mob-billno">${r['เลขที่บิล']}</div>
        <div class="mob-dc"><i class="fa-solid fa-map-pin" style="font-size:10px;color:var(--teal)"></i> ${r['ตำบล']} ${r['อำเภอ']} — ${r['DC ปลายทาง']}</div>
      </div>
      <div class="mob-head-right">
        ${dmProbBadge(r['ประเภทปัญหา'])}
        <span class="age-badge ${days>=5?'age-over':days>=3?'age-slow':'age-ok'}">${days} วัน</span>
      </div>
      <i class="fa-solid fa-chevron-down mob-chev"></i>
    </div>
    <div class="mob-body">
      <div class="mob-field"><div class="mob-flbl">ชื่อผู้รับ</div><div class="mob-fval">${r['ชื่อผู้รับ']}</div></div>
      <div class="mob-field"><div class="mob-flbl">จังหวัด</div><div class="mob-fval">${r['จังหวัด']}</div></div>
      <div class="mob-field"><div class="mob-flbl">สถานะบิล</div><div class="mob-fval" style="font-size:11px">${r['สถานะบิล']}</div></div>
      <div class="mob-field"><div class="mob-flbl">กำหนดส่ง (SLA)</div><div class="mob-fval">${r['กำหนดส่ง (SLA)']}</div></div>
    </div>`;
    mc.appendChild(card);
  });

  dmRenderBillPG(totalPages);
}

function dmBillSortBy(f){
  if(dmBillSortF===f) dmBillSortAsc=!dmBillSortAsc; else {dmBillSortF=f;dmBillSortAsc=false;}
  dmBillPage=1; dmRenderBills();
}

function dmRenderBillPG(totalPages){
  const pg=document.getElementById('dm-bill-pg');
  pg.innerHTML='';
  if(totalPages<=1) return;
  const prev=document.createElement('button');
  prev.className='page-btn';prev.textContent='←';prev.disabled=dmBillPage===1;
  prev.onclick=()=>{dmBillPage--;dmRenderBills();};
  pg.appendChild(prev);
  const info=document.createElement('span');
  info.className='page-info';info.textContent=`หน้า ${dmBillPage} / ${totalPages}`;
  pg.appendChild(info);
  const next=document.createElement('button');
  next.className='page-btn';next.textContent='→';next.disabled=dmBillPage===totalPages;
  next.onclick=()=>{dmBillPage++;dmRenderBills();};
  pg.appendChild(next);
}

function dmExportCSV(){
  const cols=['เลขที่บิล','วันที่บิล','ชื่อผู้รับ','ตำบล','อำเภอ','จังหวัด','DC ปลายทาง','DC ปัจจุบัน','สถานะบิล','ประเภทปัญหา','จำนวนวันคงค้างตามสถานะ','ประเภทบิล','กำหนดส่ง (SLA)'];
  const rows=[cols.join(',')].concat(dmFiltered.map(r=>cols.map(c=>'"'+(r[c]||'').replace(/"/g,'""')+'"').join(',')));
  const blob=new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='งานกระจาย.csv';a.click();
}
