const LS_KEY = 'nt_entries_v1';
const PREFS_KEY = 'nt_prefs_v1';

// Utils
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const fmt = (d) => new Date(d).toLocaleDateString('pt-BR');
const clamp01 = (n) => Math.max(0, Math.min(10, Number(n)||0));

function loadEntries(){
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch { return []; }
}
function saveEntries(arr){
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
}
function loadPrefs(){ try { return JSON.parse(localStorage.getItem(PREFS_KEY))||{} } catch {return{}} }
function savePrefs(p){ localStorage.setItem(PREFS_KEY, JSON.stringify(p)) }

function serializeForm(){
  const date = $('#date').value || new Date().toISOString().slice(0,10);
  return {
    id: crypto.randomUUID(),
    date,
    mood: clamp01($('#mood').value),
    energy: clamp01($('#energy').value),
    sleep: clamp01($('#sleep').value),
    sens: {
      sound: clamp01($('#sens_sound').value),
      light: clamp01($('#sens_light').value),
      touch: clamp01($('#sens_touch').value),
      smell: clamp01($('#sens_smell').value),
    },
    social: $('#social').value,
    exposure: $('#exposure').value,
    exercise: Number($('#exercise').value)||0,
    meds: $('#meds').value,
    triggers: ($('#triggers').value||'').split(',').map(s=>s.trim()).filter(Boolean),
    helps: ($('#helps').value||'').split(',').map(s=>s.trim()).filter(Boolean),
    notes: $('#notes').value||''
  };
}

function renderTable(data){
  const t = $('#table');
  if (!data.length){ t.innerHTML = '<tr><td>Nenhum registro ainda.</td></tr>'; return; }
  const head = `<tr><th>Data</th><th>Humor</th><th>Energia</th><th>Social</th><th>Gatilhos</th><th>Ajuda</th><th></th></tr>`;
  const rows = data.slice().reverse().map(e=> `
    <tr>
      <td>${fmt(e.date)}</td>
      <td>${e.mood}</td>
      <td>${e.energy}</td>
      <td>${e.social}</td>
      <td>${(e.triggers||[]).join(', ')}</td>
      <td>${(e.helps||[]).join(', ')}</td>
      <td><button data-del="${e.id}" class="ghost">Excluir</button></td>
    </tr>`).join('');
  t.innerHTML = head + rows;
  t.addEventListener('click', (ev)=>{
    const id = ev.target?.dataset?.del;
    if (!id) return;
    const arr = loadEntries().filter(x=>x.id!==id);
    saveEntries(arr);
    refresh();
  }, { once:true });
}

// Risk model (heuristic)
function computeRisk(today, last7){
  if (!last7.length) return {score: '-', why: 'Sem dados ainda.'};
  const avgSens = last7.reduce((a,e)=> a + e.sens.sound + e.sens.light + e.sens.touch + e.sens.smell, 0) / (last7.length*4);
  const lowSleepDays = last7.filter(e=> e.sleep <= 5).length;
  const hiExposure = today?.exposure === 'alta' ? 2 : today?.exposure === 'média' ? 1 : 0;
  const draining = last7.filter(e=> e.social==='desgastante').length;
  const base = (avgSens*0.5) + (lowSleepDays*0.8) + (draining*0.4) + (hiExposure*1.0);
  const scaled = Math.min(10, Math.round(base));
  let why = [];
  if (avgSens>=6) why.push('sensibilidade alta');
  if (lowSleepDays>=2) why.push('sono baixo');
  if (draining>=2) why.push('interações desgastantes');
  if (hiExposure) why.push('exposição sensorial elevada');
  return {score: scaled, why: why.join(', ') || 'estável'};
}

function topTriggerOf(entries){
  const map = {};
  entries.forEach(e => (e.triggers||[]).forEach(t => map[t]=(map[t]||0)+1));
  const top = Object.entries(map).sort((a,b)=>b[1]-a[1])[0];
  return top ? top[0] : '—';
}

function tipsForTrigger(t){
  if (!t || t==='—') return '';
  const base = {
    'barulho': 'Prepare fone com cancelamento e rotas silenciosas.',
    'multidão': 'Evite horários de pico; combine saídas com ponto de fuga.',
    'luz': 'Óculos escuros/boné e apps de temperatura de cor.',
    'calor': 'Roupas leves, água e locais ventilados.',
  };
  return base[t.toLowerCase()] || 'Planeje um “pit stop” e recursos sensoriais à mão.';
}

// Charts
let chartMood, chartSens;
function drawCharts(entries){
  const sorted = entries.slice().sort((a,b)=> a.date.localeCompare(b.date));
  const labels = sorted.map(e=> fmt(e.date));
  const mood = sorted.map(e=> e.mood);
  const sensAvg = sorted.map(e=> (e.sens.sound+e.sens.light+e.sens.touch+e.sens.smell)/4);
  chartMood?.destroy();
  chartSens?.destroy();
  const ctx1 = document.getElementById('chartMood').getContext('2d');
  chartMood = new Chart(ctx1, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Humor', data: mood }] },
    options: { responsive: true, plugins:{legend:{display:false}} }
  });
  const ctx2 = document.getElementById('chartSens').getContext('2d');
  chartSens = new Chart(ctx2, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Sensibilidade média', data: sensAvg }] },
    options: { responsive: true, plugins:{legend:{display:false}} }
  });
}

// Export / Import
function download(filename, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'application/octet-stream'}));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function exportJson(){
  download('neurotrack.json', JSON.stringify(loadEntries(), null, 2));
}
function exportCsv(){
  const head = ['date','mood','energy','sleep','sound','light','touch','smell','social','exposure','exercise','meds','triggers','helps','notes'];
  const rows = loadEntries().map(e=> [
    e.date, e.mood, e.energy, e.sleep, e.sens.sound, e.sens.light, e.sens.touch, e.sens.smell,
    e.social, e.exposure, e.exercise, e.meds,
    (e.triggers||[]).join('|'), (e.helps||[]).join('|'), (e.notes||'').replaceAll('\n',' ')
  ]);
  const csv = [head.join(','), ...rows.map(r=> r.map(v => `"${String(v).replaceAll('"','""')}"`).join(','))].join('\n');
  download('neurotrack.csv', csv);
}
function importJsonFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(Array.isArray(data)){
        saveEntries(data);
        refresh();
      } else {
        alert('Arquivo inválido.');
      }
    }catch(e){ alert('Erro ao importar.'); }
  };
  reader.readAsText(file);
}

function setToday(){
  $('#date').value = new Date().toISOString().slice(0,10);
}

function refresh(){
  const entries = loadEntries();
  renderTable(entries);
  drawCharts(entries);
  const last7 = entries.filter(e=> (new Date() - new Date(e.date)) <= 8.64e7*7);
  const today = entries.find(e=> e.date === new Date().toISOString().slice(0,10));
  const {score, why} = computeRisk(today, last7);
  $('#riskKpi').textContent = score;
  $('#riskWhy').textContent = why;
  const avgMood = last7.length ? Math.round(last7.reduce((a,e)=>a+e.mood,0)/last7.length*10)/10 : '–';
  $('#kpiMood').textContent = avgMood;
  const t = topTriggerOf(entries);
  $('#topTrigger').textContent = t;
  $('#topTriggerTips').textContent = tipsForTrigger(t);
}

function initTabs(){
  const tabs = $$('.tab');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    $$('#log, #dashboard, #trends, #settings').forEach(sec => sec.classList.add('hidden'));
    const id = btn.dataset.tab;
    document.getElementById(id).classList.remove('hidden');
  }));
}

function bind(){
  $('#entryForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const entry = serializeForm();
    const arr = loadEntries();
    // overwrite if same date exists
    const idx = arr.findIndex(x=> x.date === entry.date);
    if (idx>=0) arr[idx] = {...arr[idx], ...entry, id: arr[idx].id};
    else arr.push(entry);
    saveEntries(arr);
    refresh();
  });
  $('#exportJson').addEventListener('click', exportJson);
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#importJson').addEventListener('change', (e)=> importJsonFile(e.target.files[0]));
  $('#wipe').addEventListener('click', ()=>{
    if (confirm('Tem certeza que deseja apagar todos os dados?')){
      localStorage.removeItem(LS_KEY);
      refresh();
    }
  });
  $('#savePrefs').addEventListener('click', ()=>{
    savePrefs({ sleepAt: $('#sleepAt').value, wakeAt: $('#wakeAt').value });
    alert('Preferências salvas.');
  });
}

function firstRun(){
  const prefs = loadPrefs();
  if (prefs.sleepAt) $('#sleepAt').value = prefs.sleepAt;
  if (prefs.wakeAt) $('#wakeAt').value = prefs.wakeAt;
  setToday();
  refresh();
}

// Start
initTabs();
bind();
firstRun();