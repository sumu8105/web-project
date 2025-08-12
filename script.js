/* ---------- AUTH (register/login/logout/check) ---------- */

function showTab(t){
  document.getElementById('login').style.display = t==='login' ? '' : 'none';
  document.getElementById('register').style.display = t==='register' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active', t==='login');
  document.getElementById('tab-register').classList.toggle('active', t==='register');
}

/* Register a new user in localStorage (demo only) */
function registerUser(){
  const u = document.getElementById('reg-username').value.trim();
  const p = document.getElementById('reg-password').value.trim();
  const msg = document.getElementById('reg-message');
  msg.style.color = '#ef4444';

  if(!u || !p){ msg.textContent = 'Please provide both username and password.'; return; }
  const users = JSON.parse(localStorage.getItem('ss_users') || '{}');
  if(users[u]){ msg.textContent = 'Username already exists.'; return; }

  users[u] = p;
  localStorage.setItem('ss_users', JSON.stringify(users));
  msg.style.color = '#16a34a';
  msg.textContent = 'Account created — you can login now.';
  setTimeout(()=> { showTab('login'); msg.textContent = ''; }, 1000);
}

/* Login */
function login(){
  const u = document.getElementById('login-username').value.trim();
  const p = document.getElementById('login-password').value.trim();
  const err = document.getElementById('login-error');
  err.textContent = '';
  const users = JSON.parse(localStorage.getItem('ss_users') || '{}');

  if(users[u] && users[u] === p){
    localStorage.setItem('ss_loggedIn', 'true');
    localStorage.setItem('ss_user', u);
    window.location.href = 'dashboard.html';
  } else {
    err.textContent = 'Invalid username or password.';
  }
}

/* Logout */
function logout(){
  localStorage.removeItem('ss_loggedIn');
  localStorage.removeItem('ss_user');
  window.location.href = 'index.html';
}

/* check login on dashboard */
function checkLoginAndInit(){
  if(localStorage.getItem('ss_loggedIn') !== 'true'){
    window.location.href = 'index.html';
    return;
  }
  // set user in sidebar/header
  const u = localStorage.getItem('ss_user') || 'User';
  const sidebar = document.getElementById('sidebar-user');
  if(sidebar) sidebar.textContent = u;

  loadHistory();
  // preload object detection model
  initModels();
}

/* ---------- SEARCH HISTORY ---------- */
function saveHistory(q){
  if(!q) return;
  const hist = JSON.parse(localStorage.getItem('ss_history') || '[]');
  hist.unshift({ q, at: new Date().toISOString() });
  if(hist.length>50) hist.length = 50;
  localStorage.setItem('ss_history', JSON.stringify(hist));
  loadHistory();
}
function loadHistory(){
  const ul = document.getElementById('historyList');
  if(!ul) return;
  const hist = JSON.parse(localStorage.getItem('ss_history') || '[]');
  ul.innerHTML = hist.length ? hist.map(h=>`<li><strong>${escapeHtml(h.q)}</strong><div class="muted user-small">${new Date(h.at).toLocaleString()}</div></li>`).join('') : '<li class="muted">No history yet</li>';
}
function showHistory(){ alert('Search history shown in the sidebar card.'); }

/* ---------- CORE SEARCH ---------- */
function doSearch(){
  const q = document.getElementById('globalSearch').value.trim();
  if(!q){ alert('Type a query or upload an image.'); return; }
  document.getElementById('results-query').textContent = `Query: ${q}`;
  renderResultsFromQuery(q);
  saveHistory(q);
}

/* render fake results (demo) — replace with real search engine or API as needed */
function renderResultsFromQuery(q){
  const container = document.getElementById('results');
  container.innerHTML = `
    <h4>Top results for "${escapeHtml(q)}"</h4>
    <ol>
      <li><a target="_blank" href="https://www.google.com/search?q=${encodeURIComponent(q)}">Google Search for "${escapeHtml(q)}"</a></li>
      <li>Related article: <em>Sample result — replace with API integration</em></li>
      <li>Related image results: <em>Sample item</em></li>
    </ol>
  `;
}

/* ---------- VOICE (webkitSpeechRecognition) ---------- */
function triggerVoice(){
  if(!('webkitSpeechRecognition' in window)){ alert("Voice input not supported in this browser."); return; }
  const recognition = new webkitSpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.onresult = evt => {
    const s = evt.results[0][0].transcript;
    document.getElementById('globalSearch').value = s;
    doSearch();
  };
  recognition.start();
}

/* ---------- IMAGE: OCR + OBJECT DETECTION ---------- */
let cocoModel = null;
async function initModels(){
  try{
    document.getElementById('image-status').textContent = 'Loading object detection model...';
    cocoModel = await cocoSsd.load();
    document.getElementById('image-status').textContent = 'Models ready.';
  }catch(e){
    console.error('Model load failed', e);
    document.getElementById('image-status').textContent = 'Object model failed to load (offline?)';
  }
}

function handleImage(evt){
  const file = evt.target.files && evt.target.files[0];
  if(!file) return;
  const url = URL.createObjectURL(file);
  const img = document.getElementById('preview');
  img.onload = ()=> URL.revokeObjectURL(url);
  img.src = url;
  img.style.display = 'block';
  document.getElementById('image-status').textContent = 'Processing image (OCR)...';
  runOCR(file).then(text=>{
    const cleaned = (text || '').trim();
    if(cleaned.length >= 3){
      document.getElementById('globalSearch').value = cleaned;
      document.getElementById('image-status').textContent = 'Text extracted from image — searching...';
      doSearch();
    } else {
      // fallback to object detection
      document.getElementById('image-status').textContent = 'No text found — running object detection...';
      runObjectDetection(img).then(labels=>{
        if(labels && labels.length){
          const query = labels.slice(0,3).join(' ');
          document.getElementById('globalSearch').value = query;
          document.getElementById('image-status').textContent = `Detected: ${labels.join(', ')}`;
          doSearch();
        } else {
          document.getElementById('image-status').textContent = 'No meaningful objects detected.';
        }
      });
    }
  }).catch(err=>{
    console.error(err);
    document.getElementById('image-status').textContent = 'Image processing failed.';
  });
}

/* OCR using Tesseract.js */
async function runOCR(file){
  try{
    const { data: { text } } = await Tesseract.recognize(file, 'eng', { logger: m => {/*console.log(m)*/} });
    return text;
  }catch(e){
    console.error('Tesseract error', e);
    return '';
  }
}

/* Object detection using coco-ssd */
async function runObjectDetection(imgElement){
  if(!cocoModel) {
    document.getElementById('image-status').textContent = 'Object model not ready.';
    return [];
  }
  try{
    const predictions = await cocoModel.detect(imgElement);
    const labels = predictions
      .filter(p => p.score > 0.35)
      .sort((a,b)=> b.score - a.score)
      .map(p => p.class);
    // unique
    return [...new Set(labels)];
  }catch(e){
    console.error('Detection error', e);
    return [];
  }
}

/* ---------- UTILS ---------- */
function escapeHtml(s){
  if(!s) return '';
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}
