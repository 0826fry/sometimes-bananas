import { EditingDesk } from './editors.js';
import { applyFatigue } from './fatigue.js';
import { createBookbinder } from './bookbinding.js';
import { TypewriterSound } from './sound.js';
import { createInbox } from './inbox-ui.js';
import { createReceiptArt, receiptArtCaption } from './receipt-art.js';
import { createDraft, restoreDraft, splitGraphemes, makeAlphabet, typeOne, paperCount, KEYS_PER_SHEET, MAX_TARGET_LENGTH } from './engine.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'manuscript-fee:draft:v1';
const SETTINGS_KEY = 'manuscript-fee:settings:v1';
const WORKER_KEY = 'sometimes-bananas:worker:v1';
let workerEnergy = 100;
let draft = null;
let mode = 'idle';
let typingTimer = null;
let clockMark = 0;
let savedAt = 0;
let historyPage = 0;
let toastTimer;
let feedTimer;
const sounds = new TypewriterSound();
let inbox;
let desk;
let books;
let lastAcceptedAttempt = 0;
let thoughtHoldUntil = 0;
let lastThought = '';
let settings = { theme: 'auto', sound: false };
let storageAvailable = true;

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
}

function storageFailure() {
  if (!storageAvailable) return;
  storageAvailable = false;
  $('save-note').textContent = '자동 저장을 사용할 수 없습니다. 이 화면을 닫으면 기록이 사라질 수 있습니다.';
  notify('자동 저장이 되지 않습니다. 완성한 원고는 영수증으로 간직해주세요.');
}

function save() {
  if (draft) workerEnergy = draft.energy;
  try {
    // Store the employee before removing/replacing a manuscript, including idle time.
    localStorage.setItem(WORKER_KEY, JSON.stringify({version:1, energy:workerEnergy}));
    if (draft) localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    else localStorage.removeItem(STORAGE_KEY);
    savedAt = performance.now();
  } catch { storageFailure(); }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { storageFailure(); }
}

function applySettings() {
  if (settings.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
  $('theme-toggle').textContent = '화면 ' + ({ auto: '자동', light: '밝게', dark: '어둡게' }[settings.theme]);
  $('sound-toggle').textContent = settings.sound ? '소리 켬' : '소리 끔';
  $('sound-toggle').setAttribute('aria-pressed', String(settings.sound));
  if (draft && $('receipt-dialog').open) renderReceiptArt();
}

async function ensureAudio(sample = false) {
  if (!settings.sound) return false;
  const ready = await sounds.unlock();
  if (!settings.sound) return false;
  $('sound-toggle').dataset.audioState = sounds.status().state;
  if (!ready) {
    settings.sound = false; sounds.disable(); applySettings(); saveSettings();
    notify('소리를 켜지 못했습니다. 소리 버튼을 다시 눌러주세요.');
    return false;
  }
  if (sample) keySound();
  return true;
}

function keySound(accepted = false) {
  if (!settings.sound) return;
  sounds.key(accepted);
  $('sound-toggle').dataset.audioState = sounds.status().state;
  $('sound-toggle').dataset.played = sounds.status().scheduledCount;
}

function timeText(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function actualTimeText(ms) {
  const s = Math.floor(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;
}

function accrueTime() {
  if (mode !== 'running' || !draft) return;
  const now = performance.now();
  draft.activeMs += Math.max(0, now - clockMark);
  clockMark = now;
}

function buildTarget() {
  const letters = draft?.letters ?? splitGraphemes($('target-input').value.normalize('NFC').trim());
  const fragment = document.createDocumentFragment();
  for (const [index, letter] of letters.entries()) {
    const span = document.createElement('span');
    span.className = 'target-char' + (index < (draft?.index ?? 0) ? ' accepted' : '');
    span.textContent = letter;
    fragment.append(span);
  }
  $('target-output').replaceChildren(fragment);
  lastAcceptedAttempt = 0;
  if (draft) {
    for (let i=draft.history.length-1; i>=0; i--) {
      if (draft.history[i].accepted) { lastAcceptedAttempt = i+1; break; }
    }
  }
  updateTarget();
  desk?.reset(draft);
}

function updateTarget(event) {
  const index = draft?.index ?? 0;
  const children = $('target-output').children;
  for (let i = 0; i < children.length; i++) {
    children[i].classList.toggle('accepted', i < index);
    children[i].classList.toggle('next', i === index && mode !== 'idle');
    if (!desk && event?.accepted && i === event.index) children[i].classList.add('just-matched');
  }
  $('progress-fraction').textContent = `${index} / ${children.length}`;
  $('stat-length').textContent = `/ ${children.length}`;
  $('target-output').setAttribute('aria-label', `완성 중인 문장: ${draft ? draft.letters.slice(0, index).join('') : '아직 없음'}. ${children.length}자 중 ${index}자 완성`);
  $('progress-caption').textContent = mode === 'complete' ? '원고가 나왔습니다, 사장님.' : index ? '우연히 맞은 글자만 골라 남깁니다.' : '아직 아무 글자도 쓰지 않았습니다.';
}

function renderHistoryCharacters(container, entries, fresh = false) {
  const fragment = document.createDocumentFragment();
  entries.forEach((entry, index) => {
    const span = document.createElement('span');
    span.textContent = entry.char === ' ' ? '·' : entry.char === '\n' ? '↵' : entry.char;
    if (entry.accepted) span.classList.add('kept');
    if (fresh && index === entries.length - 1) span.classList.add('fresh');
    fragment.append(span);
  });
  container.replaceChildren(fragment);
}

function renderRaw(event) {
  if (!draft?.attempts) return;
  renderHistoryCharacters($('raw-stream'), draft.history.slice(-160), mode === 'running');
  $('raw-stream').scrollTop = $('raw-stream').scrollHeight;
  if (event) $('live-key').textContent = event.char === ' ' ? '␣' : event.char === '\n' ? '↵' : event.char;
  $('paper-no').textContent = `원고 NO. ${String(Math.max(1, paperCount(draft))).padStart(3, '0')}`;
  $('history-open').disabled = false;
}

function renderStats() {
  $('stat-attempts').textContent = String(draft?.attempts ?? 0).padStart(6, '0');
  $('stat-matches').textContent = String(draft?.index ?? 0).padStart(2, '0');
  $('stat-time').textContent = timeText(draft?.activeMs ?? 0);
  $('stat-bananas').textContent = String(draft?.bananas ?? 0).padStart(2, '0');
  const energy = Math.round(draft?.energy ?? workerEnergy);
  $('energy-value').textContent = energy;
  $('energy-fill').style.width = `${draft?.energy ?? workerEnergy}%`;
  document.querySelector('.energy-track').setAttribute('aria-valuenow', energy);
  $('feed-button').disabled = !draft || draft.energy > 98 || mode === 'complete';
  $('feed-button').title = draft?.energy > 98 ? '아직 배가 부릅니다.' : '기운 +30. 글자가 나올 확률은 그대로입니다.';
  applyFatigue($('monkey-scene'), draft?.energy ?? workerEnergy, mode);
}

function setThought(text) {
  if (text === lastThought) return;
  lastThought = text;
  const caption = $('scene-caption');
  caption.textContent = text;
  caption.classList.remove('thought-arrived');
  requestAnimationFrame(() => caption.classList.add('thought-arrived'));
}

function updateThought() {
  if (performance.now() < thoughtHoldUntil) return;
  if (mode === 'complete') { setThought('“끝났다고? 뭐가?”'); return; }
  if (mode === 'paused') { setThought(draft?.energy <= 0 ? '“바나나부터.”' : '“잠깐. 손가락도 쉬어야지.”'); return; }
  if ((draft?.energy ?? workerEnergy) < 15) { setThought('“손이 자꾸 내려간다. 바나나는?”'); return; }
  if ((draft?.energy ?? workerEnergy) < 35) { setThought('“이 종이 아까 끝낸 거 아니었나.”'); return; }
  if (mode === 'idle' || draft.attempts < 90) {
    setThought('“뭘 하는지는 모르겠다.\n두드리면 가끔 바나나가 나온다.”'); return;
  }
  const thoughts = ['“이건 아까도 누른 것 같은데.”', '“읽는 건 사장님이 하겠지.”', '“다른 것도 눌러볼까.”', '“그래서, 바나나는?”'];
  setThought(thoughts[Math.floor((draft.attempts - 90) / 100) % thoughts.length]);
}

function peelSummary() {
  if (!draft.bananas) return '바나나 껍질 없음 · 지급 0개';
  return draft.bananas <= 6 ? `바나나 껍질 ${draft.bananas}개` : `바나나 ${draft.bananas}개를 먹고 남긴 껍질 더미`;
}

function renderReceiptArt() {
  if (!draft) return;
  const colors = getComputedStyle(document.documentElement);
  $('receipt-art').innerHTML = createReceiptArt(draft, {
    ink: colors.getPropertyValue('--ink').trim(),
    paper: colors.getPropertyValue('--paper').trim(),
  });
  $('receipt-art').setAttribute('aria-label', `키를 ${draft.attempts}번 누른 뒤 타자기 옆에서 쉬는 원숭이. ${peelSummary()}.`);
  $('receipt-peels').textContent = peelSummary();
  $('receipt-thought').textContent = receiptArtCaption(draft);
}

function receiptImage() {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([createReceiptArt(draft)], {type:'image/svg+xml;charset=utf-8'}));
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Receipt illustration could not load')); };
    image.src = url;
  });
}

function renderMode(message) {
  document.body.classList.remove('is-idle', 'is-running', 'is-paused', 'is-complete');
  document.body.classList.add(`is-${mode}`);
  const started = mode !== 'idle';
  $('target-input').disabled = started;
  $('monkey-name').disabled = started;
  $('suggestions').hidden = started;
  $('start-button').hidden = started;
  $('input-message').hidden = started;
  $('care-panel').hidden = !started;
  $('receipt-open').hidden = mode !== 'complete';
  $('pause-button').disabled = mode === 'complete';
  $('pause-label').textContent = mode === 'running' ? '쉬게 하기' : '계속 쓰기';
  $('pause-button').querySelector('.pause-symbol').textContent = mode === 'running' ? 'Ⅱ' : '▷';
  $('monkey-label').textContent = `02 / 직원 ${draft?.monkeyName ?? '몽'}`;
  $('state-label').textContent = ({ idle: '업무 대기', running: '근무 중', paused: '휴게시간', complete: '업무 종료' })[mode];
  $('monkey-scene').classList.toggle('is-typing', mode === 'running');
  $('monkey-scene').classList.toggle('is-sleeping', mode === 'paused');
  $('status-dot').classList.toggle('running', mode === 'running');
  $('thought-speaker').textContent = `직원 ${draft?.monkeyName ?? ($('monkey-name').value.trim() || '몽')}의 생각`;
  thoughtHoldUntil = 0;
  updateThought();
  const comments = { running: '직원은 타이핑 중. 편집은 출판사가 맡습니다.', paused: '휴게시간입니다. 사장님도 잠깐 쉬세요.', complete: '원고가 나왔습니다, 사장님. 직원은 아직 모릅니다.' };
  $('monkey-comment').textContent = message || comments[mode] || '';
  $('paper-stamp').textContent = mode === 'complete' ? 'ACCIDENTALLY, A MANUSCRIPT.' : 'NOT YET A MASTERPIECE';
  updateTarget();
  renderStats();
  inbox?.render();
  desk?.sync(draft);
  const assignment = inbox?.assignmentFor(draft);
  $('bind-current').hidden = mode !== 'complete' || (!!assignment && !assignment.complete);
  $('bind-current').textContent = assignment ? '전체 원고 제본하기 ↗' : '이 원고 제본하기 ↗';
}

function scheduleKey() {
  if (mode !== 'running') return;
  // Rhythm varies. Letter selection remains uniformly random in engine.js.
  const base = 65 + (100 - draft.energy) * 1.6;
  const hesitation = Math.random() < .035 ? 220 + Math.random() * 480 : 0;
  typingTimer = setTimeout(advance, base * (.65 + Math.random() * .85) + hesitation);
}

function advance() {
  if (mode !== 'running' || document.hidden) { if (mode === 'running') pause(); return; }
  accrueTime();
  let event;
  try { event = typeOne(draft); }
  catch { pause('타이핑을 시작할 수 없습니다. 브라우저를 새로 열어주세요.'); return; }
  if (!event) { pause('기운이 다 떨어졌습니다. 바나나가 필요합니다.'); return; }
  keySound(event.accepted);
  updateTarget(event);
  renderRaw(event);
  if (event.accepted) {
    desk?.accept({char:event.char,index:event.index,attempt:draft.attempts,
      waited:draft.attempts-lastAcceptedAttempt,
      sourceElement:$('raw-stream').lastElementChild,
      targetElement:$('target-output').children[event.index]});
    lastAcceptedAttempt = draft.attempts;
  }
  desk?.sync(draft);
  renderStats();
  updateThought();
  if (event.complete) {
    mode = 'complete';
    if (settings.sound) sounds.complete();
    save();
    inbox?.completeDraft(draft);
    renderMode();
    renderRaw();
    save();
    notify('원고가 나왔습니다, 사장님. 오늘의 근무 영수증을 확인해보세요.');
    return;
  }
  if (draft.energy <= 0) { pause('기운이 다 떨어졌습니다. 바나나가 필요합니다.'); return; }
  if (performance.now() - savedAt > 1800 || event.accepted) save();
  scheduleKey();
}

function run() {
  if (!draft || mode === 'complete') return;
  clearTimeout(typingTimer);
  if (draft.energy <= 0) {
    mode = 'paused';
    renderMode('앞선 업무에서 기운을 다 썼습니다. 바나나를 먹고 시작할까요?');
    save();
    notify('먼저 바나나 하나를 건네주세요.');
    return;
  }
  ensureAudio();
  mode = 'running';
  clockMark = performance.now();
  renderMode();
  save();
  scheduleKey();
}

function pause(message) {
  if (mode !== 'running') return;
  accrueTime();
  clearTimeout(typingTimer);
  mode = 'paused';
  renderMode(message);
  renderRaw();
  save();
}

function inputChanged() {
  const length = splitGraphemes($('target-input').value.normalize('NFC').trim()).length;
  $('target-count').textContent = `${length} / ${MAX_TARGET_LENGTH}`;
  $('input-message').textContent = length > MAX_TARGET_LENGTH ? '한 번에 48자까지 맡길 수 있습니다. 긴 원고는 외주함에서 나눠주세요.' : workerEnergy < 100 ? `원고가 바뀌어도 직원은 그대로입니다. 남은 기운 ${Math.round(workerEnergy)}.` : '직원은 두드리고, 출판사는 맞은 글자를 골라냅니다.';
  $('start-button').disabled = !length || length > MAX_TARGET_LENGTH;
  $('target-input').setAttribute('aria-invalid', String(length > MAX_TARGET_LENGTH));
  if (!draft) buildTarget();
}

function resetDraft({ focus = true } = {}) {
  clearTimeout(typingTimer);
  desk?.cancel();
  if (draft) workerEnergy = draft.energy;
  inbox?.releaseDraft(draft);
  draft = null;
  mode = 'idle';
  $('raw-stream').replaceChildren();
  const placeholder = document.createElement('p');
  placeholder.className = 'empty-manuscript';
  placeholder.append('이 아래로 수많은 틀린 글자가 쌓입니다.', document.createElement('br'), '그중 몇 글자만 당신의 문장이 됩니다.');
  $('raw-stream').append(placeholder);
  $('live-key').textContent = '_';
  $('paper-no').textContent = '원고 NO. 001';
  $('history-open').disabled = true;
  $('reset-dialog').close();
  buildTarget();
  renderMode();
  inputChanged();
  save();
  if (focus) { $('target-input').focus(); $('target-input').select(); }
}

function showHistory() {
  const count = paperCount(draft);
  historyPage = Math.max(0, Math.min(historyPage, count - 1));
  renderHistoryCharacters($('history-page'), draft.history.slice(historyPage * KEYS_PER_SHEET, (historyPage + 1) * KEYS_PER_SHEET));
  $('history-page-number').textContent = `${String(historyPage + 1).padStart(3, '0')} / ${String(count).padStart(3, '0')}장`;
  $('history-prev').disabled = historyPage === 0;
  $('history-next').disabled = historyPage >= count - 1;
}

function receiptRows() {
  return [
    ['담당 직원', draft.monkeyName],
    ['누른 키', `${draft.attempts.toLocaleString('ko-KR')}번`],
    ['골라 남긴 글자', `${draft.index}자`],
    ['남겨진 원고', `${paperCount(draft)}장`],
    ['실제 근무 시간', actualTimeText(draft.activeMs)],
    ['지급한 급여', `바나나 ${draft.bananas}개`],
  ];
}

function showReceipt() {
  if (mode !== 'complete') return;
  $('receipt-date').textContent = new Date(draft.completedAt).toLocaleString('ko-KR', {dateStyle:'medium',timeStyle:'short'});
  $('receipt-quote').textContent = draft.target;
  const fragment = document.createDocumentFragment();
  receiptRows().forEach(([label, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    row.append(dt, dd);
    fragment.append(row);
  });
  $('receipt-details').replaceChildren(fragment);
  renderReceiptArt();
  $('receipt-dialog').showModal();
}

async function downloadReceipt() {
  if (mode !== 'complete') return;
  const button = $('receipt-download');
  button.disabled = true;
  try {
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    const ctx = canvas.getContext('2d');
    ctx.font = '38px Sunflower';
    const lines = []; let line = '';
    for (const letter of draft.letters) {
      if (letter === '\n' || ctx.measureText(line + letter).width > 740) { lines.push(line); line = letter === '\n' ? '' : letter; }
      else line += letter;
    }
    if (line) lines.push(line);
    const quoteBottom = Math.max(600, 305 + lines.length * 60 + 80);
    const lowerOffset = quoteBottom - 600;
    canvas.height = quoteBottom + 1100;
    ctx.fillStyle = '#fcfbf8'; ctx.fillRect(0, 0, 1000, canvas.height);
    ctx.fillStyle = '#20201e'; ctx.textAlign = 'center';
    ctx.font = '22px Sunflower'; ctx.fillText('무작위 출판사 · RANDOM PRESS', 500, 110);
    ctx.font = '700 62px Sunflower'; ctx.fillText('업무 종료 영수증', 500, 205);
    ctx.font = '20px Sunflower'; ctx.fillStyle = '#777773';
    ctx.fillText(new Date(draft.completedAt).toLocaleString('ko-KR'), 500, 255);
    ctx.strokeStyle = '#aaa9a2'; ctx.setLineDash([8, 9]);
    ctx.beginPath();ctx.moveTo(110, 305);ctx.lineTo(890, 305);ctx.stroke();
    ctx.font = '38px Sunflower'; ctx.fillStyle = '#20201e';
    const quoteY = 305 + (quoteBottom - 305 - lines.length * 60) / 2 + 43;
    lines.forEach((text, i) => ctx.fillText(text, 500, quoteY + i * 60));
    ctx.beginPath();ctx.moveTo(110, quoteBottom);ctx.lineTo(890, quoteBottom);ctx.stroke();ctx.setLineDash([]);
    ctx.font = '26px Sunflower';
    receiptRows().forEach(([label, value], i) => {
      const y = 665 + lowerOffset + i * 53;
      ctx.textAlign = 'left';ctx.fillStyle = '#777773';ctx.fillText(label, 120, y);
      ctx.textAlign = 'right';ctx.fillStyle = '#20201e';ctx.fillText(value, 880, y);
    });
    const illustration = await receiptImage();
    const artScale = Math.min(800 / illustration.naturalWidth, 400 / illustration.naturalHeight);
    const artWidth = illustration.naturalWidth * artScale;
    const artHeight = illustration.naturalHeight * artScale;
    ctx.drawImage(illustration, (1000 - artWidth) / 2, 970 + lowerOffset + (400 - artHeight) / 2, artWidth, artHeight);
    ctx.textAlign = 'center';ctx.font = '21px Sunflower';ctx.fillStyle = '#777773';
    ctx.fillText(peelSummary(), 500, 1390 + lowerOffset);
    ctx.font = '27px Sunflower';ctx.fillStyle = '#20201e';
    ctx.fillText(receiptArtCaption(draft), 500, 1455 + lowerOffset);
    ctx.font = '21px Sunflower';ctx.fillStyle = '#777773';
    ctx.fillText('사장님은 원고 한 편을 얻었습니다.', 500, 1530 + lowerOffset);
    ctx.fillText('직원은 무슨 글인지 끝내 몰랐습니다.', 500, 1568 + lowerOffset);
    ctx.font = '15px Sunflower';ctx.fillText('1장 = 240번의 키 입력 · 쉬는 시간은 제외', 500, 1640 + lowerOffset);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Image generation failed');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');link.href = url;link.download = 'sometimes-bananas-receipt.png';document.body.append(link);link.click();link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notify('영수증 이미지를 만들었습니다. 다운로드를 확인해주세요.');
  } catch { notify('영수증을 저장하지 못했습니다. 다시 한 번 눌러주세요.'); }
  finally { button.disabled = false; }
}

$('commission-form').addEventListener('submit', event => {
  event.preventDefault();
  if (mode !== 'idle') return;
  try { draft = createDraft($('target-input').value, {monkeyName:$('monkey-name').value, energy:workerEnergy}); }
  catch (error) { $('input-message').textContent = error.message; $('target-input').focus(); return; }
  $('target-input').value = draft.target;
  $('monkey-name').value = draft.monkeyName;
  buildTarget();run();
  if (matchMedia('(max-width:720px)').matches) document.querySelector('.studio').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center'});
});
$('target-input').addEventListener('input', inputChanged);
$('monkey-name').addEventListener('input', () => { if (mode === 'idle') $('thought-speaker').textContent = `직원 ${$('monkey-name').value.trim() || '몽'}의 생각`; });
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => { $('target-input').value = button.dataset.example; inputChanged(); }));
$('pause-button').addEventListener('click', () => mode === 'running' ? pause() : run());
$('feed-button').addEventListener('click', () => {
  if (!draft || mode === 'complete' || draft.energy > 98) return;
  if (settings.sound) ensureAudio().then(ready => { if (ready) sounds.feed(); });
  accrueTime();draft.energy = Math.min(100, draft.energy + 30);draft.bananas += 1;
  renderStats();save();
  $('monkey-scene').classList.remove('is-fed');
  requestAnimationFrame(() => $('monkey-scene').classList.add('is-fed'));
  clearTimeout(feedTimer);feedTimer = setTimeout(() => $('monkey-scene').classList.remove('is-fed'), 1500);
  $('monkey-comment').textContent = `바나나 1개 지급 완료. 지금까지 ${draft.bananas}개를 먹었습니다.`;
  thoughtHoldUntil = performance.now() + 6500;
  setThought('“역시. 계속 누르면 되는 거였어.”');
  notify('바나나 1개. 기운은 오르고, 확률은 그대로입니다.');
});
$('new-button').addEventListener('click', () => { if (mode === 'complete') resetDraft(); else { pause(); $('reset-dialog').showModal(); } });
$('reset-confirm').addEventListener('click', resetDraft);
$('about-open').addEventListener('click', () => {
  const alphabet = draft?.alphabet ?? makeAlphabet($('target-input').value.trim());
  $('alphabet-preview').textContent = alphabet.map(char => char === ' ' ? '␣' : char === '\n' ? '↵' : char).join(' ');
  $('probability-note').textContent = `지금 키보드는 ${alphabet.length}개 키. 다음 글자를 맞힐 확률은 매번 1/${alphabet.length}입니다.`;
  $('about-dialog').showModal();
});
$('history-open').addEventListener('click', () => { if (!draft?.attempts) return; historyPage = paperCount(draft) - 1; showHistory(); $('history-dialog').showModal(); });
$('history-prev').addEventListener('click', () => { historyPage--;showHistory(); });
$('history-next').addEventListener('click', () => { historyPage++;showHistory(); });
$('receipt-open').addEventListener('click', showReceipt);
$('bookshelf-open').addEventListener('click', () => books?.openShelf());
$('bind-current').addEventListener('click', () => {
  if (mode !== 'complete') return;
  const assignment = inbox?.assignmentFor(draft);
  if (assignment) { if (assignment.complete) books.bind(assignment.commission); }
  else books.bindDraft(draft);
});
$('receipt-download').addEventListener('click', downloadReceipt);
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close(); } }));
$('theme-toggle').addEventListener('click', () => { const themes = ['auto','light','dark'];settings.theme = themes[(themes.indexOf(settings.theme)+1)%themes.length];applySettings();saveSettings(); });
$('sound-toggle').addEventListener('click', () => { settings.sound=!settings.sound; if (settings.sound) ensureAudio(true); else { sounds.disable(); $('sound-toggle').dataset.audioState = 'muted'; } applySettings();saveSettings(); });
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => { if (settings.theme === 'auto' && $('receipt-dialog').open) renderReceiptArt(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'running') pause('자리를 비운 동안 함께 쉬었습니다. 계속 써볼까요?'); });
window.addEventListener('pagehide', () => { if (mode === 'running') pause(); });
setInterval(() => { if (mode === 'running') { accrueTime();$('stat-time').textContent=timeText(draft.activeMs); } updateThought(); }, 250);

try {
  const worker = JSON.parse(localStorage.getItem(WORKER_KEY));
  if (worker?.version === 1 && Number.isFinite(worker.energy) && worker.energy >= 0 && worker.energy <= 100) workerEnergy = worker.energy;
} catch { /* An existing valid manuscript still supplies the employee's energy. */ }

try {
  const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  if (savedSettings) { if (['auto','light','dark'].includes(savedSettings.theme))settings.theme=savedSettings.theme;settings.sound=savedSettings.sound===true; }
  const storedDraft = localStorage.getItem(STORAGE_KEY);
  if (storedDraft) {
    draft = restoreDraft(storedDraft);
    if (draft) {
      workerEnergy = draft.energy;
      mode = draft.completedAt ? 'complete' : 'paused';
      $('target-input').value = draft.target;$('monkey-name').value=draft.monkeyName;
    } else notify('이전 원고를 불러오지 못했습니다. 새 문장으로 시작해주세요.');
  }
} catch { storageFailure(); }
desk = new EditingDesk({raw:$('raw-stream'), target:$('target-output'), mount:$('editor-mount')});
books = createBookbinder({notify,onChange:count => { $('bookshelf-open').textContent = `출판한 책 · ${count}`; }});
$('bookshelf-open').textContent = `출판한 책 · ${books.count()}`;
inbox = createInbox({
  onBind: commission => books.bind(commission),
  getDraft: () => draft, getMode: () => mode, notify,
  assign(target, onCreated) {
    const fresh = createDraft(target, {monkeyName: $('monkey-name').value, energy:draft?.energy ?? workerEnergy});
    resetDraft({focus:false});
    draft = fresh;
    onCreated(fresh);
    $('target-input').value = fresh.target;
    inputChanged(); buildTarget(); run();
    if (matchMedia('(max-width:720px)').matches) document.querySelector('.studio').scrollIntoView({behavior:'smooth',block:'center'});
  }
});
applySettings();inputChanged();buildTarget();renderMode(draft && mode==='paused'?'보관해 둔 원고를 꺼냈습니다. 이어서 써볼까요?':undefined);renderRaw();
