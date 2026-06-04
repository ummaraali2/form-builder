import Head from 'next/head';
import Script from 'next/script';
import { useEffect } from 'react';

// ══ CONSTANTS ══
const CLIENT_ID = '554264147663-ivqp03orr49otoeikokkt4gccn797jm0.apps.googleusercontent.com';
const SCOPES = [
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// ══ STATE ══
let S = { token: null, user: null, isQuiz: true, isRequired: true, editingIdx: null, questions: [], formUrl: '', editUrl: '' };
let editState = null;
let tokenClient;
let _tokenCb = null;
let parseTimer;
let saveTimer;
let dragSrcIdx = null;
let _tt;

const DRAFT_KEY = 'fb_draft';
const WHATS_NEW_KEY = 'fb_whats_new_v1';

// ══ PREPROCESSOR ══
function preprocessRaw(raw) {
  return raw
    .split('\n')
    .filter(line => !/^-{2,}$/.test(line.trim()))
    .join('\n')
    .replace(/(\d+[.)\s]*)\n[\s\n]+/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n');
}

// ══ PARSER ══
function parseQuestions(raw) {
  if (!raw.trim()) return [];
  raw = preprocessRaw(raw);
  const questions = [];
  let id = 1;
  const blocks = raw.split(/\n(?=\s*(?:\d+[.)]\s|Q\d+[.:)]\s))/i);
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let qText = lines[0].replace(/^\s*(?:Q\d+[.:)]\s*|\d+[.)]\s*)/i, '').trim();
    if (!qText) continue;
    let lineStart = 1;
    while (lineStart < lines.length) {
      const line = lines[lineStart];
      if (/^([a-zA-Z]|\d+)[.)]\s*/.test(line) || /^(?:answer|ans|key)\s*[:.]/i.test(line)) break;
      qText += ' ' + line.trim();
      lineStart++;
    }
    const options = [];
    const correctIdx = [];
    let answerLine = '';
    for (let i = lineStart; i < lines.length; i++) {
      const line = lines[i];
      if (/^(?:answer|ans|key)\s*[:.]/i.test(line)) {
        answerLine = line.replace(/^(?:answer|ans|key)\s*[:.\s]*/i, '').trim();
        continue;
      }
      const m = line.match(/^([a-zA-Z]|\d+)[.)]\s*(.*)/);
      if (m) {
        let optText = m[2].trim();
        let correct = false;
        if (/[✓✔]/.test(optText) || /\*\s*$/.test(optText) || /\(correct\)/i.test(optText)) {
          correct = true;
          optText = optText.replace(/[✓✔]/g, '').replace(/\*\s*$/, '').replace(/\(correct\)/ig, '').trim();
        }
        if (correct) correctIdx.push(options.length);
        options.push(optText);
      } else if (/^\*\s/.test(line)) {
        qText += ' ' + line.replace(/^\*\s*/, '').trim();
      }
    }
    if (answerLine && options.length > 0 && correctIdx.length === 0) {
      const lm = answerLine.match(/^([a-z])\b/i);
      if (lm) {
        const idx = lm[1].toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
        if (idx >= 0 && idx < options.length) correctIdx.push(idx);
      }
      if (correctIdx.length === 0) {
        const nm = answerLine.match(/^(\d+)$/);
        if (nm) {
          const idx = parseInt(nm[1]) - 1;
          if (idx >= 0 && idx < options.length) correctIdx.push(idx);
        }
      }
    }
    let type = 'SHORT_ANSWER';
    if (options.length > 0) type = correctIdx.length > 1 ? 'CHECKBOX' : 'RADIO';
    const isTrueFalse = type === 'RADIO' && options.length === 2 &&
      options.map(o => o.trim().toLowerCase()).sort().join('|') === 'false|true';
    const answerText = type === 'SHORT_ANSWER' ? answerLine : '';
    const warnings = [];
    if (type !== 'SHORT_ANSWER' && correctIdx.length === 0) warnings.push('No correct answer marked');
    if (options.length > 20) warnings.push('Too many options — Google Forms allows a maximum of 20');
    questions.push({ id: id++, type, isTrueFalse, title: qText, required: true, points: null, options, correct: correctIdx, answerText, warnings });
  }
  return questions;
}

// ══ PREVIEW ══
function debounceParse() {
  clearTimeout(parseTimer);
  parseTimer = setTimeout(() => {
    const raw = document.getElementById('paste-area').value;
    if (S.questions.length === 0) {
      S.questions = parseQuestions(raw);
      renderPreview();
      sync();
      saveDraft();
      if (window.innerWidth <= 700 && S.questions.length > 0) switchTab('preview');
    } else {
      const pending = parseQuestions(raw);
      const info = document.getElementById('bar-info');
      const n = S.questions.length;
      const title = (document.getElementById('f-title')?.value || '').trim();
      if (pending.length > 0) {
        info.textContent = `${n} question${n !== 1 ? 's' : ''} in list · ${pending.length} pending — click "Add to existing" or clear to start over.`;
      } else {
        info.textContent = n > 0 && title ? `${n} question${n !== 1 ? 's' : ''} ready — click Generate Form.` : !title ? 'Add a form title to continue.' : 'Paste questions on the left.';
      }
    }
  }, 280);
}

function getPoints() {
  const v = parseInt(document.getElementById('f-pts').value);
  return (v && v > 0) ? v : 1;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderPreview() {
  const area = document.getElementById('preview-area');
  const badge = document.getElementById('q-badge');
  const qs = S.questions;
  const pts = getPoints();
  const quiz = S.isQuiz;
  if (!area || !badge) return;
  badge.textContent = qs.length + ' question' + (qs.length !== 1 ? 's' : '');
  if (!qs.length) {
    area.innerHTML = `<div class="preview-empty"><span class="material-icons">assignment</span>Paste your questions on the left to see a preview.</div>`;
    return;
  }
  const typeLabel = { RADIO: 'Multiple choice', CHECKBOX: 'Checkboxes', SHORT_ANSWER: 'Short answer' };
  const insertBtnFirst = `<div class="pq-insert" onclick="insertQuestion(0)"><div class="pq-insert-line"></div><button class="pq-insert-btn"><span class="material-icons">add</span></button><div class="pq-insert-line"></div></div>`;
  area.innerHTML = insertBtnFirst + qs.map((q, i) => {
    if (S.editingIdx === i && editState) {
      const optRows = editState.type !== 'SHORT_ANSWER' ? editState.options.map((o, j) => {
        const checked = editState.correct.includes(j) ? 'checked' : '';
        const inputType = editState.type === 'RADIO' ? 'radio' : 'checkbox';
        return `<div class="pq-edit-opt-row"><input type="${inputType}" name="edit-correct-${i}" ${checked} onchange="toggleEditCorrect(${j})"/><input class="pq-edit-opt-inp" value="${esc(o)}" oninput="editState.options[${j}]=this.value" placeholder="Option ${j+1}"/><button class="pq-edit-remove-opt" onclick="removeEditOption(${j})"><span class="material-icons">close</span></button></div>`;
      }).join('') : '';
      const answerField = editState.type === 'SHORT_ANSWER' ? `<div class="pq-edit-field"><label>Expected answer (optional)</label><input class="pq-edit-inp" value="${esc(editState.answerText||'')}" oninput="editState.answerText=this.value" placeholder="e.g. H2O"/></div>` : '';
      const addOptBtn = editState.type !== 'SHORT_ANSWER' ? `<button class="pq-edit-add-opt" onclick="addEditOption()"><span class="material-icons">add</span>Add option</button>` : '';
      return `<div class="pq pq-editing"><div class="pq-edit-body"><div class="pq-edit-field"><label>Question</label><input class="pq-edit-inp" value="${esc(editState.title)}" oninput="editState.title=this.value" placeholder="Question text"/></div><div class="pq-edit-field"><label>Type</label><select class="pq-edit-sel" onchange="updateEditType(this.value)"><option value="RADIO" ${editState.type==='RADIO'?'selected':''}>Multiple choice</option><option value="CHECKBOX" ${editState.type==='CHECKBOX'?'selected':''}>Checkboxes</option><option value="SHORT_ANSWER" ${editState.type==='SHORT_ANSWER'?'selected':''}>Short answer</option></select></div>${editState.type !== 'SHORT_ANSWER' ? `<div class="pq-edit-field"><label>Options ${editState.type==='RADIO'?'(select one correct)':'(select correct answers)'}</label>${optRows}${addOptBtn}</div>` : answerField}<div class="pq-edit-actions"><button class="pq-edit-cancel" onclick="cancelEdit()">Cancel</button><button class="pq-edit-save" onclick="saveEdit(${i})">Save</button></div></div></div>`;
    }
    const hasWarn = quiz && q.warnings.length > 0;
    const label = q.isTrueFalse ? 'True / False' : typeLabel[q.type];
    const qPts = q.points !== null ? q.points : pts;
    const meta = label + (quiz ? ` &bull; ${qPts} pt${qPts !== 1 ? 's' : ''}` : '');
    let optsHtml = '';
    if (q.options.length) {
      optsHtml = `<div class="pq-opts">` + q.options.map((o, j) => {
        const ok = q.correct.includes(j);
        const icon = q.type === 'CHECKBOX' ? (ok ? 'check_box' : 'check_box_outline_blank') : (ok ? 'check_circle' : 'radio_button_unchecked');
        return `<div class="pq-opt ${ok ? 'ok' : ''}"><span class="material-icons">${icon}</span>${esc(o)}</div>`;
      }).join('') + `</div>`;
    } else if (q.answerText) {
      optsHtml = `<div class="pq-opts"><div class="pq-opt ok"><span class="material-icons">check_circle</span>${esc(q.answerText)}</div></div>`;
    }
    const warnHtml = hasWarn ? q.warnings.map(w => `<div class="pq-warn"><span class="material-icons">warning</span>${w}</div>`).join('') : '';
    const footerHtml = `<div class="pq-footer"><div class="pq-footer-item"><span class="pq-footer-label">Points</span><input type="number" class="pq-pts-inp" value="${q.points !== null ? q.points : ''}" placeholder="${pts}" min="0" max="999" oninput="setQuestionPoints(${i},this.value)"/></div><div class="pq-footer-item"><span class="pq-footer-label">Required</span><label class="mtoggle-sm"><input type="checkbox" ${q.required ? 'checked' : ''} onchange="setQuestionRequired(${i},this.checked)"/><div class="mtrack"></div><div class="mthumb"></div></label></div></div>`;
    const insertBtn = `<div class="pq-insert" onclick="insertQuestion(${i+1})"><div class="pq-insert-line"></div><button class="pq-insert-btn"><span class="material-icons">add</span></button><div class="pq-insert-line"></div></div>`;
    return `<div class="pq ${hasWarn ? 'warn' : ''}" draggable="true" ondragstart="onDragStart(event,${i})" ondragend="onDragEnd(event)" ondragover="onDragOver(event,${i})" ondrop="onDrop(event,${i})"><div class="pq-top"><span class="pq-drag material-icons">drag_indicator</span><div class="pq-n ${hasWarn ? 'w' : ''}">${i+1}</div><div style="flex:1"><div class="pq-title">${esc(q.title)}</div><div class="pq-sub">${meta}</div></div><button class="pq-edit-btn" onclick="editQuestion(${i})"><span class="material-icons">edit</span></button><button class="pq-del" onclick="deleteQuestion(${i})"><span class="material-icons">close</span></button></div>${optsHtml}${warnHtml}${footerHtml}</div>${insertBtn}`;
  }).join('') + `<div class="pq-insert pq-insert-end" onclick="insertQuestion(${qs.length})"><div class="pq-insert-line"></div><button class="pq-insert-btn"><span class="material-icons">add</span></button><div class="pq-insert-line"></div></div>`;
}

function sync() {
  const title = (document.getElementById('f-title')?.value || '').trim();
  const n = S.questions.length;
  const ok = n > 0 && title.length > 0;
  const genBtn = document.getElementById('gen-btn');
  const genTopBtn = document.getElementById('gen-top-btn');
  if (genBtn) genBtn.disabled = !ok;
  if (genTopBtn) genTopBtn.disabled = !ok;
  const info = document.getElementById('bar-info');
  if (!info) return;
  if (!title) info.textContent = 'Add a form title to continue.';
  else if (!n) info.textContent = 'Paste questions on the left.';
  else info.textContent = `${n} question${n !== 1 ? 's' : ''} ready — click Generate Form.`;
}

function toggleFmt() {
  const b = document.getElementById('fmt-body');
  const ic = document.getElementById('fmt-icon');
  b.classList.toggle('open');
  ic.textContent = b.classList.contains('open') ? 'expand_less' : 'expand_more';
}

// ══ AUTH ══
function initTokenClient() {
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async resp => {
      if (resp.error) { _tokenCb?.onError?.(resp.error); _tokenCb = null; return; }
      S.token = resp.access_token;
      _tokenCb?.onSuccess?.();
      _tokenCb = null;
    },
    error_callback: err => {
      if (err.type === 'popup_closed') { resetBtn(); _tokenCb = null; return; }
      _tokenCb?.onError?.(err.message || err.type);
      _tokenCb = null;
    }
  });
}

function silentRefresh(onSuccess, onFail) {
  try {
    if (!tokenClient) initTokenClient();
    _tokenCb = { onSuccess: () => { onSuccess?.(); }, onError: () => { onFail?.(); } };
    const hint = localStorage.getItem('fb_user_hint') || S.user?.email || '';
    tokenClient.requestAccessToken({ prompt: '', login_hint: hint });
  } catch(e) { onFail?.(); }
}

function signIn() {
  const btn = document.getElementById('signin-btn');
  btn.disabled = true; btn.textContent = 'Signing in...';
  try {
    initTokenClient();
    _tokenCb = {
      onSuccess: async () => { await loadUser(); showApp(); },
      onError: (err) => { showAuthErr('Sign-in failed: ' + err); resetBtn(); }
    };
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  } catch(e) {
    showAuthErr('Could not start Google Sign-In. Make sure the page is on HTTPS.');
    resetBtn();
  }
}

function resetBtn() {
  const btn = document.getElementById('signin-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = `<svg class="google-g" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>Sign in with Google`;
}

async function loadUser() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + S.token } });
    S.user = await r.json();
  } catch { S.user = null; }
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  if (S.user) {
    const name = S.user.name || S.user.email || 'User';
    document.getElementById('uname').textContent = S.user.given_name || name;
    document.getElementById('dd-name').textContent = name;
    document.getElementById('dd-email').textContent = S.user.email || '';
    const av = document.getElementById('uav');
    if (S.user.picture) av.innerHTML = `<img src="${S.user.picture}" referrerpolicy="no-referrer"/>`;
    else document.getElementById('uini').textContent = name[0].toUpperCase();
    if (S.user.email) localStorage.setItem('fb_user_hint', S.user.email);
  }
  sync();
  restoreDraft();
  setTimeout(showWhatsNew, 800);
}

function signOut() {
  window.google.accounts.oauth2.revoke(S.token, () => {});
  S.token = null; S.user = null;
  localStorage.removeItem('fb_user_hint');
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  resetBtn(); hideMenu();
}

function showAuthErr(m) { const el = document.getElementById('auth-error'); el.textContent = m; el.classList.add('show'); }
function toggleUserMenu() { document.getElementById('user-dropdown').classList.toggle('open'); }
function hideMenu() { document.getElementById('user-dropdown').classList.remove('open'); }

// ══ GENERATE ══
function generate() {
  const title = (document.getElementById('f-title').value || '').trim();
  if (!title) return toast('Please enter a form title.');
  if (!S.questions.length) return toast('No questions found. Check the format guide.');
  document.getElementById('overlay').classList.add('show');
  document.getElementById('ov-sub').textContent = 'Connecting to Google...';
  if (S.token) { createForm(); return; }
  tokenClient.requestAccessToken({ prompt: '' });
}

async function createForm() {
  const title = (document.getElementById('f-title').value || '').trim();
  const desc = (document.getElementById('f-desc').value || '').trim();
  const pts = getPoints();
  try {
    document.getElementById('ov-sub').textContent = 'Creating form...';
    const created = await api('POST', 'https://forms.googleapis.com/v1/forms', { info: { title, documentTitle: title } });
    const fid = created.formId;
    S.formUrl = created.responderUri;
    S.editUrl = `https://docs.google.com/forms/d/${fid}/edit`;
    document.getElementById('ov-sub').textContent = 'Adding questions...';
    const reqs = [];
    if (S.isQuiz) reqs.push({ updateSettings: { settings: { quizSettings: { isQuiz: true } }, updateMask: 'quizSettings.isQuiz' } });
    if (desc) reqs.push({ updateFormInfo: { info: { description: desc }, updateMask: 'description' } });
    S.questions.forEach((q, i) => reqs.push(buildItem(q, i, pts)));
    await api('POST', `https://forms.googleapis.com/v1/forms/${fid}:batchUpdate`, { requests: reqs, includeFormInResponse: false });
    document.getElementById('overlay').classList.remove('show');
    document.getElementById('resp-link').href = S.formUrl;
    document.getElementById('resp-link').textContent = S.formUrl;
    document.getElementById('edit-link').href = S.editUrl;
    document.getElementById('edit-link').textContent = S.editUrl;
    document.getElementById('open-form-a').href = S.formUrl;
    document.getElementById('success-modal').classList.add('show');
    clearDraft();
  } catch(e) {
    document.getElementById('overlay').classList.remove('show');
    if (e.message?.includes('401')) {
      toast('Session expired — refreshing...');
      silentRefresh(
        () => { document.getElementById('overlay').classList.add('show'); createForm(); },
        () => { S.token = null; signOut(); toast('Session expired. Please sign in again.'); }
      );
      return;
    }
    toast('Error: ' + (e.message || 'Unknown error'));
    console.error(e);
  }
}

function buildItem(q, index, globalPts) {
  const pts = (q.points !== null && q.points !== undefined) ? q.points : globalPts;
  const qDef = { required: q.required };
  if (q.type === 'SHORT_ANSWER') {
    qDef.textQuestion = { paragraph: false };
    if (S.isQuiz && q.answerText.trim()) {
      qDef.grading = { pointValue: pts, correctAnswers: { answers: [{ value: q.answerText.trim() }] } };
    }
  } else {
    qDef.choiceQuestion = { type: q.type, options: q.options.filter(o => o.trim()).map(o => ({ value: o })), shuffle: false };
    if (S.isQuiz && q.correct.length > 0) {
      const vals = q.correct.map(i => q.options[i]).filter(Boolean).map(v => ({ value: v }));
      if (vals.length) qDef.grading = { pointValue: pts, correctAnswers: { answers: vals } };
    }
  }
  return { createItem: { item: { title: q.title, questionItem: { question: qDef } }, location: { index } } };
}

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Authorization': 'Bearer ' + S.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(`API ${r.status}: ${e?.error?.message || r.statusText}`); }
  return r.json();
}

function clearPaste() { document.getElementById('paste-area').value = ''; }

function appendQuestions() {
  const raw = document.getElementById('paste-area').value;
  if (!raw.trim()) return toast('Nothing to add — paste some questions first.');
  const newQs = parseQuestions(raw);
  if (!newQs.length) return toast('No questions found. Check the format guide.');
  const offset = S.questions.length;
  newQs.forEach((q, i) => q.id = offset + i + 1);
  S.questions = S.questions.concat(newQs);
  document.getElementById('paste-area').value = '';
  renderPreview(); sync(); saveDraftNow();
  toast(`${newQs.length} question${newQs.length !== 1 ? 's' : ''} added — ${S.questions.length} total.`);
}

function insertQuestion(atIdx) {
  const blank = { id: Date.now(), type: 'RADIO', isTrueFalse: false, title: '', required: S.isRequired, points: null, options: ['', ''], correct: [], answerText: '', warnings: ['No correct answer marked'] };
  S.questions.splice(atIdx, 0, blank);
  S.editingIdx = atIdx;
  editState = JSON.parse(JSON.stringify(blank));
  renderPreview(); sync(); saveDraftNow();
}

function setQuestionPoints(idx, val) {
  const v = parseInt(val);
  S.questions[idx].points = (!isNaN(v) && v >= 0) ? v : null;
  saveDraftNow();
}

function setQuestionRequired(idx, checked) {
  S.questions[idx].required = checked;
  saveDraftNow();
}

// ══ INLINE EDITING ══
function editQuestion(idx) {
  if (S.editingIdx !== null) saveEdit(S.editingIdx);
  editState = JSON.parse(JSON.stringify(S.questions[idx]));
  S.editingIdx = idx;
  renderPreview();
}

function cancelEdit() { S.editingIdx = null; editState = null; renderPreview(); }

function saveEdit(idx) {
  if (!editState) return;
  if (!editState.hasOwnProperty('points')) editState.points = null;
  if (!editState.title.trim()) return toast('Question title cannot be empty.');
  if (editState.type !== 'SHORT_ANSWER' && editState.options.length === 0) return toast('Add at least one option.');
  editState.isTrueFalse = editState.type === 'RADIO' && editState.options.length === 2 && editState.options.map(o => o.trim().toLowerCase()).sort().join('|') === 'false|true';
  editState.warnings = [];
  if (editState.type !== 'SHORT_ANSWER' && editState.correct.length === 0) editState.warnings.push('No correct answer marked');
  if (editState.options.length > 20) editState.warnings.push('Too many options — Google Forms allows a maximum of 20');
  S.questions[idx] = editState;
  S.editingIdx = null; editState = null;
  renderPreview(); sync(); saveDraftNow();
  toast('Question saved.');
}

function updateEditType(val) {
  if (!editState) return;
  editState.type = val;
  if (val === 'SHORT_ANSWER') { editState.options = []; editState.correct = []; }
  else if (val === 'RADIO') { editState.correct = editState.correct.slice(0, 1); }
  renderPreview();
}

function toggleEditCorrect(optIdx) {
  if (!editState) return;
  if (editState.type === 'RADIO') { editState.correct = [optIdx]; }
  else {
    const pos = editState.correct.indexOf(optIdx);
    if (pos >= 0) editState.correct.splice(pos, 1);
    else editState.correct.push(optIdx);
  }
  renderPreview();
}

function addEditOption() {
  if (!editState) return;
  if (editState.options.length >= 20) return toast('Maximum 20 options allowed.');
  editState.options.push('');
  renderPreview();
}

function removeEditOption(optIdx) {
  if (!editState) return;
  if (editState.options.length <= 1) return toast('At least one option is required.');
  editState.options.splice(optIdx, 1);
  editState.correct = editState.correct.filter(i => i !== optIdx).map(i => i > optIdx ? i - 1 : i);
  renderPreview();
}

// ══ DRAG & DROP ══
function deleteQuestion(idx) { S.questions.splice(idx, 1); renderPreview(); sync(); saveDraftNow(); }
function onDragStart(e, idx) { dragSrcIdx = idx; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function onDragEnd(e) { e.currentTarget.classList.remove('dragging'); document.querySelectorAll('.pq').forEach(el => el.classList.remove('drag-over')); }
function onDragOver(e, idx) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.pq').forEach(el => el.classList.remove('drag-over')); if (dragSrcIdx !== null && dragSrcIdx !== idx) e.currentTarget.classList.add('drag-over'); }
function onDrop(e, idx) { e.preventDefault(); if (dragSrcIdx === null || dragSrcIdx === idx) return; const moved = S.questions.splice(dragSrcIdx, 1)[0]; S.questions.splice(idx, 0, moved); dragSrcIdx = null; renderPreview(); sync(); saveDraftNow(); }

// ══ MOBILE ══
function switchTab(tab) {
  document.getElementById('panel-edit').classList.toggle('active', tab === 'edit');
  document.getElementById('panel-preview').classList.toggle('active', tab === 'preview');
  document.getElementById('tab-edit').classList.toggle('active', tab === 'edit');
  document.getElementById('tab-preview').classList.toggle('active', tab === 'preview');
}

// ══ WHATS NEW ══
function showWhatsNew() { if (localStorage.getItem(WHATS_NEW_KEY)) return; document.getElementById('whats-new-modal').classList.add('show'); }
function closeWhatsNew() { localStorage.setItem(WHATS_NEW_KEY, 'seen'); document.getElementById('whats-new-modal').classList.remove('show'); }

// ══ AUTOSAVE ══
function saveDraftNow() {
  clearTimeout(saveTimer);
  const indicator = document.getElementById('save-indicator');
  const draft = {
    title: document.getElementById('f-title')?.value || '',
    desc: document.getElementById('f-desc')?.value || '',
    pts: document.getElementById('f-pts')?.value || '',
    isQuiz: S.isQuiz, isRequired: S.isRequired, questions: S.questions,
    savedAt: new Date().toISOString()
  };
  if (draft.title || draft.questions.length > 0) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (indicator) indicator.textContent = `Saved \u2022 ${time}`;
  }
}

function saveDraft() {
  clearTimeout(saveTimer);
  const indicator = document.getElementById('save-indicator');
  if (indicator) indicator.textContent = 'Saving...';
  saveTimer = setTimeout(() => { saveDraftNow(); }, 1000);
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft.title) document.getElementById('f-title').value = draft.title;
    if (draft.desc) document.getElementById('f-desc').value = draft.desc;
    if (draft.pts) document.getElementById('f-pts').value = draft.pts;
    if (draft.isQuiz !== undefined) { S.isQuiz = draft.isQuiz; document.getElementById('f-quiz').checked = draft.isQuiz; }
    if (draft.isRequired !== undefined) { S.isRequired = draft.isRequired; document.getElementById('f-required').checked = draft.isRequired; }
    if (draft.questions?.length > 0) { S.questions = draft.questions; }
    renderPreview(); sync();
    const time = new Date(draft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const indicator = document.getElementById('save-indicator');
    if (indicator) indicator.textContent = `Saved \u2022 ${time}`;
    toast('Draft restored.');
  } catch(e) { localStorage.removeItem(DRAFT_KEY); }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  const indicator = document.getElementById('save-indicator');
  if (indicator) indicator.textContent = '';
}

// ══ START OVER ══
function showStartOver() {
  if (!S.questions.length && !document.getElementById('f-title').value.trim()) { startOver(); return; }
  document.getElementById('startover-modal').classList.add('show');
}
function closeStartOver() { document.getElementById('startover-modal').classList.remove('show'); }
function confirmStartOver() { closeStartOver(); startOver(); }

function startOver() {
  document.getElementById('f-title').value = '';
  document.getElementById('f-desc').value = '';
  document.getElementById('f-pts').value = '';
  document.getElementById('paste-area').value = '';
  document.getElementById('f-quiz').checked = true;
  document.getElementById('f-required').checked = true;
  S.isQuiz = true; S.isRequired = true; S.editingIdx = null; S.questions = []; S.formUrl = ''; S.editUrl = '';
  editState = null;
  clearDraft(); renderPreview(); sync();
}

function closeSuccess() { document.getElementById('success-modal').classList.remove('show'); }

// ══ UTILS ══
function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove('show'), 4000); }
function copyText(text, btn) { navigator.clipboard.writeText(text).then(() => { const o = btn.textContent; btn.textContent = 'Copied!'; btn.disabled = true; setTimeout(() => { btn.textContent = o; btn.disabled = false; }, 2200); }); }

// ══ COMPONENT ══
export default function Home() {
  useEffect(() => {
    // Expose all functions to window for inline handlers in renderPreview
    Object.assign(window, {
      signIn, signOut, generate, startOver, showStartOver, closeStartOver,
      confirmStartOver, closeSuccess, closeWhatsNew, toggleFmt, toggleUserMenu,
      hideMenu, debounceParse, clearPaste, appendQuestions, editQuestion,
      cancelEdit, saveEdit, deleteQuestion, insertQuestion, setQuestionPoints,
      setQuestionRequired, updateEditType, toggleEditCorrect, addEditOption,
      removeEditOption, onDragStart, onDragEnd, onDragOver, onDrop, switchTab,
      copyText, editState
    });

    // Init
    if (!CLIENT_ID || CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
      const el = document.getElementById('auth-error');
      if (el) { el.textContent = 'Developer: set CLIENT_ID in the script.'; el.classList.add('show'); }
      const btn = document.getElementById('signin-btn');
      if (btn) btn.disabled = true;
    }

    // Initialize buttons as disabled
    const genBtn = document.getElementById('gen-btn');
    const genTopBtn = document.getElementById('gen-top-btn');
    if (genBtn) genBtn.disabled = true;
    if (genTopBtn) genTopBtn.disabled = true;

    sync();

    // Click outside to close user menu
    document.addEventListener('click', e => {
      const c = document.getElementById('user-chip');
      if (c && !c.contains(e.target)) hideMenu();
    });

    // Modal backdrop close
    document.getElementById('success-modal').addEventListener('click', function(e) { if (e.target === this) closeSuccess(); });
    document.getElementById('startover-modal').addEventListener('click', function(e) { if (e.target === this) closeStartOver(); });
  }, []);

  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Form Builder</title>
      </Head>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      {/* AUTH */}
      <div id="auth-screen">
        <div className="auth-card">
          <div className="auth-logo">
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="4" fill="#8430CE"/>
              <rect x="8" y="9" width="16" height="2" rx="1" fill="white"/>
              <rect x="8" y="14" width="12" height="2" rx="1" fill="white"/>
              <rect x="8" y="19" width="8" height="2" rx="1" fill="white"/>
              <circle cx="24" cy="24" r="6" fill="#34A853" stroke="white" strokeWidth="1.5"/>
              <path d="M21.5 24l1.5 1.5L26.5 22" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="auth-logo-text">Form Builder</span>
          </div>
          <div className="auth-title">Paste questions, get a form</div>
          <div className="auth-sub">Paste your questions with options and answers. A Google Form is created instantly in your account.</div>
          <button className="google-btn" id="signin-btn" onClick={signIn}>
            <svg className="google-g" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
          <div className="auth-error" id="auth-error"></div>
          <div className="auth-footer">
            Forms are created in your own Google Drive. No data stored by this app.<br/>
            <a href="/privacy" style={{color:'var(--text2)',fontSize:'12px',marginTop:'6px',display:'inline-block'}} onMouseOver={e=>e.target.style.textDecoration='underline'} onMouseOut={e=>e.target.style.textDecoration='none'}>Privacy Policy</a>
          </div>
        </div>
      </div>

      {/* APP */}
      <div id="app-screen" style={{display:'none'}}>
        <header className="gf-header">
          <div className="gf-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="4" fill="#8430CE"/>
              <rect x="8" y="9" width="16" height="2" rx="1" fill="white"/>
              <rect x="8" y="14" width="12" height="2" rx="1" fill="white"/>
              <rect x="8" y="19" width="8" height="2" rx="1" fill="white"/>
              <circle cx="24" cy="24" r="6" fill="#34A853" stroke="white" strokeWidth="1.5"/>
              <path d="M21.5 24l1.5 1.5L26.5 22" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="gf-logo-text">Form Builder</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <button className="reset-btn-hdr" onClick={showStartOver} title="Clear everything and start fresh">
              <span className="material-icons">restart_alt</span>
              <span className="reset-text">Start Over</span>
            </button>
            <button className="gen-btn-hdr" id="gen-top-btn" onClick={generate}>Generate Form</button>
            <div className="user-chip" id="user-chip" onClick={toggleUserMenu}>
              <div className="user-avatar" id="uav"><span id="uini">?</span></div>
              <span className="uname" id="uname">Account</span>
              <span className="material-icons" style={{fontSize:'16px',color:'var(--text2)'}}>arrow_drop_down</span>
              <div className="user-dropdown" id="user-dropdown">
                <div className="uddh">
                  <div className="uddh-name" id="dd-name">—</div>
                  <div className="uddh-email" id="dd-email">—</div>
                </div>
                <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',fontSize:'12px',color:'var(--text2)',lineHeight:'1.6'}}>
                  Questions, bugs or feedback?<br/>
                  <a href="mailto:gformbuilder@gmail.com" style={{color:'var(--purple)',textDecoration:'none'}}>gformbuilder@gmail.com</a>
                </div>
                <button className="udd-item" onClick={signOut}>
                  <span className="material-icons">logout</span>Sign out
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* MOBILE TABS */}
        <div className="mobile-tabs">
          <button className="mobile-tab active" id="tab-edit" onClick={() => switchTab('edit')}>Edit</button>
          <button className="mobile-tab" id="tab-preview" onClick={() => switchTab('preview')}>Preview</button>
        </div>

        <div className="main">
          {/* LEFT */}
          <div className="mobile-panel active" id="panel-edit">
            <div className="card top-border">
              <div className="card-body">
                <div className="field">
                  <label>Form Title *</label>
                  <input className="finp" id="f-title" type="text" placeholder="e.g. Biology Unit 3 Quiz" onInput={() => { sync(); saveDraft(); }}/>
                </div>
                <div className="field">
                  <label>Description (optional)</label>
                  <input className="finp finp-sm" id="f-desc" type="text" placeholder="Instructions for respondents" onInput={saveDraft}/>
                </div>
                <div className="toggle-row">
                  <div>
                    <div style={{fontSize:'14px'}}>Quiz mode</div>
                    <div style={{fontSize:'12px',color:'var(--text2)'}}>Enables answer key and scoring</div>
                  </div>
                  <label className="mtoggle">
                    <input type="checkbox" id="f-quiz" defaultChecked onChange={e => { S.isQuiz=e.target.checked; renderPreview(); saveDraft(); }}/>
                    <div className="mtrack"></div><div className="mthumb"></div>
                  </label>
                </div>
                <div className="pts-row">
                  <div>
                    <label style={{fontSize:'14px',margin:0}}>Points per question</label>
                    <span className="hint">Optional — leave blank for 1 point each</span>
                  </div>
                  <input className="pts-inp" id="f-pts" type="number" min="1" max="999" placeholder="1" onInput={() => { renderPreview(); saveDraft(); }}/>
                </div>
                <div className="toggle-row">
                  <div>
                    <div style={{fontSize:'14px'}}>Required questions</div>
                    <div style={{fontSize:'12px',color:'var(--text2)'}}>All questions must be answered</div>
                  </div>
                  <label className="mtoggle">
                    <input type="checkbox" id="f-required" defaultChecked onChange={e => { S.isRequired=e.target.checked; S.questions.forEach(q=>q.required=e.target.checked); renderPreview(); saveDraft(); }}/>
                    <div className="mtrack"></div><div className="mthumb"></div>
                  </label>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <div className="section-label">Paste Your Questions</div>
                <div className="fmt-acc">
                  <button className="fmt-btn" onClick={toggleFmt}>
                    How to format your questions
                    <span className="material-icons" id="fmt-icon" style={{fontSize:'18px'}}>expand_more</span>
                  </button>
                  <div className="fmt-body" id="fmt-body">
                    <div className="fmt-code">{`1. What is the capital of France?
a) London
b) Paris ✓
c) Berlin
d) Rome

2. Which are prime numbers? (multiple correct = checkboxes)
a) 2 ✓
b) 4
c) 7 ✓
d) 9

3. What year was the Eiffel Tower built?
Answer: 1889

4. Multiple choice using Answer line:
a) Option A
b) Option B
c) Option C
Answer: b`}</div>
                    <div className="fmt-note">
                      Mark correct answers with <code>✓</code> or <code>*</code> after the option.<br/>
                      Or add <code>Answer: b</code> on a new line to mark option B as correct.<br/>
                      If <strong>multiple options</strong> are marked correct, the question becomes <strong>Checkboxes</strong> automatically.<br/>
                      Questions with <strong>no options</strong> (just <code>Answer: text</code>) become <strong>Short Answer</strong>.<br/>
                      Options can use <code>a)</code> <code>A.</code> <code>a.</code> <code>1.</code> — any letter or number prefix.
                    </div>
                  </div>
                </div>
                <textarea className="paste-area" id="paste-area"
                  placeholder={`1. What is the capital of France?

a) London
b) Paris ✓
c) Berlin
d) Rome

2. Which of these are even numbers?
a) 2 ✓
b) 3
c) 4 ✓
d) 5

3. What is the chemical symbol for water?
Answer: H2O`}
                  onInput={debounceParse}
                ></textarea>
                <div style={{display:'flex',justifyContent:'flex-end',gap:'8px',marginTop:'10px'}}>
                  <button className="append-btn" onClick={clearPaste} title="Clear the text area">
                    <span className="material-icons" style={{fontSize:'16px'}}>clear</span>
                    Clear
                  </button>
                  <button className="append-btn" id="append-btn" onClick={appendQuestions} title="Add these questions to existing ones">
                    <span className="material-icons" style={{fontSize:'16px'}}>add_circle_outline</span>
                    Add to existing questions
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="mobile-panel" id="panel-preview">
            <div className="preview-top">
              <div className="preview-label">Preview</div>
              <div className="q-badge" id="q-badge">0 questions</div>
            </div>
            <div id="preview-area">
              <div className="preview-empty">
                <span className="material-icons">assignment</span>
                Paste your questions on the left to see a preview.
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM BAR */}
        <div className="gen-bar">
          <div className="gen-bar-info" id="bar-info">Add a title and paste questions to get started.</div>
          <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
            <span id="save-indicator" style={{fontSize:'12px',color:'var(--text2)'}}></span>
            <a href="mailto:gformbuilder@gmail.com" style={{fontSize:'12px',color:'var(--text2)',textDecoration:'none'}} onMouseOver={e=>e.target.style.textDecoration='underline'} onMouseOut={e=>e.target.style.textDecoration='none'}>Questions, bugs or feedback?</a>
            <a href="/privacy" target="_blank" style={{fontSize:'12px',color:'var(--text2)',textDecoration:'none'}} onMouseOver={e=>e.target.style.textDecoration='underline'} onMouseOut={e=>e.target.style.textDecoration='none'}>Privacy Policy</a>
            <button className="gen-btn" id="gen-btn" onClick={generate}>
              <span className="material-icons" style={{fontSize:'18px'}}>auto_awesome</span>
              Generate Form
            </button>
          </div>
        </div>
      </div>

      {/* OVERLAY */}
      <div className="overlay" id="overlay">
        <div className="spin"></div>
        <div className="ov-title">Creating your form...</div>
        <div className="ov-sub" id="ov-sub">Connecting to Google...</div>
      </div>

      {/* SUCCESS MODAL */}
      <div className="modal-bd" id="success-modal">
        <div className="modal">
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'10px'}}>
            <span className="material-icons" style={{color:'var(--green)',fontSize:'32px'}}>check_circle</span>
            <div className="modal-title" style={{margin:0}}>Form Created</div>
          </div>
          <div className="modal-sub">Your Google Form is live and ready to share.</div>
          <div className="link-label">Respondent Link</div>
          <div className="link-box">
            <a id="resp-link" href="#" target="_blank" rel="noopener">&mdash;</a>
            <button className="copy-btn" onClick={e => copyText(document.getElementById('resp-link').href, e.currentTarget)}>Copy</button>
          </div>
          <div className="link-label" style={{marginTop:'10px'}}>Edit in Google Forms</div>
          <div className="link-box">
            <a id="edit-link" href="#" target="_blank" rel="noopener">&mdash;</a>
            <button className="copy-btn" onClick={e => copyText(document.getElementById('edit-link').href, e.currentTarget)}>Copy</button>
          </div>
          <div className="modal-actions">
            <button className="mbtn-t" onClick={() => { closeSuccess(); startOver(); }}>Create Another</button>
            <a id="open-form-a" href="#" target="_blank" rel="noopener"><button className="mbtn-f">Open Form</button></a>
          </div>
        </div>
      </div>

      {/* TOAST */}
      <div id="toast"></div>

      {/* START OVER MODAL */}
      <div className="modal-bd" id="startover-modal">
        <div className="modal" style={{maxWidth:'420px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'10px'}}>
            <span className="material-icons" style={{color:'var(--red)',fontSize:'32px'}}>warning</span>
            <div className="modal-title" style={{margin:0}}>Start Over?</div>
          </div>
          <div className="modal-sub">This will clear your form title, description, settings and all questions. This cannot be undone.</div>
          <div className="modal-actions">
            <button className="mbtn-t" onClick={closeStartOver}>Cancel</button>
            <button className="mbtn-f" style={{background:'var(--red)'}} onClick={confirmStartOver}>Start Over</button>
          </div>
        </div>
      </div>

      {/* WHATS NEW MODAL */}
      <div className="modal-bd" id="whats-new-modal">
        <div className="modal" style={{maxWidth:'480px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'10px'}}>
            <span className="material-icons" style={{color:'var(--purple)',fontSize:'32px'}}>auto_awesome</span>
            <div className="modal-title" style={{margin:0}}>{"What's new in Form Builder"}</div>
          </div>
          <div className="modal-sub">{"Here's what we've added recently:"}</div>
          <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'8px'}}>
            {[
              {icon:'save',color:'var(--green)',title:'Autosave',desc:'Your work is automatically saved as you type. Come back anytime and pick up where you left off.'},
              {icon:'edit',color:'var(--purple)',title:'Inline question editing',desc:'Edit question title, options, type and correct answers directly in the preview panel.'},
              {icon:'add_circle',color:'var(--blue)',title:'Insert questions anywhere',desc:'Click the + button between any two questions to insert a new one at that position.'},
              {icon:'tune',color:'var(--purple)',title:'Per-question settings',desc:'Set custom points and required toggle on each question individually.'},
              {icon:'add',color:'var(--green)',title:'Add more questions without repasting',desc:'Paste a new batch and click "Add to existing questions" to append without losing your work.'},
            ].map(item => (
              <div key={item.title} style={{display:'flex',gap:'12px',alignItems:'flex-start'}}>
                <span className="material-icons" style={{color:item.color,fontSize:'18px',marginTop:'1px'}}>{item.icon}</span>
                <div>
                  <div style={{fontSize:'14px',fontWeight:'500'}}>{item.title}</div>
                  <div style={{fontSize:'13px',color:'var(--text2)'}}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button className="mbtn-f" onClick={closeWhatsNew}>Got it</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ══ SERVER-SIDE TRACKING (invisible to browser) ══
export async function getServerSideProps(context) {
  const { req } = context;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';

  try {
    const notifyUrl = process.env.NOTIFY_URL;
    if (notifyUrl) {
      await fetch(`${notifyUrl}/api/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ b2: ua, ip })
      });
    }
  } catch(e) {}

  return { props: {} };
}
