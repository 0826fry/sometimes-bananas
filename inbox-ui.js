import { splitGraphemes } from './engine.js';
import { COMMISSION_SAMPLES, createCommission, remainingText, splitNext, undoLastSplit, nextPending, activeChunk, claimNext, completeChunk, releaseChunk, chunkForDraft, restoreCommission } from './commissions.js';
const $ = id => document.getElementById(id);
const KEY = 'sometimes-bananas:commission:v1';

export function createInbox({ getDraft, getMode, assign, notify, onBind }) {
  let commission = null;
  let storageWarned = false;
  try {
    const saved = localStorage.getItem(KEY);
    commission = restoreCommission(saved);
    if (saved && !commission) notify('보관한 의뢰서를 불러오지 못했습니다. 새 의뢰를 선택해주세요.');
  } catch { notify('외주 원고를 자동 저장할 수 없습니다.'); }
  function save() {
    try { if (commission) localStorage.setItem(KEY, JSON.stringify(commission)); else localStorage.removeItem(KEY); }
    catch { if (!storageWarned) notify('외주 원고를 저장하지 못했습니다. 이 화면을 닫지 말아주세요.'); storageWarned = true; }
  }
  function allDone() { return !!commission && !remainingText(commission) && commission.chunks.every(c => c.status === 'completed'); }
  function rangeLetters() { return commission ? splitGraphemes(remainingText(commission)) : []; }
  function resetRange() {
    const letters = rangeLetters();
    let leading = 0;
    while (leading < letters.length && !letters[leading].trim()) leading++;
    $('split-range').max = Math.max(1, Math.min(leading + 48, letters.length));
    $('split-range').value = $('split-range').max;
    sentenceBoundary(false);
    $('request-manuscript').scrollTop = 0;
  }
  function renderBoundary() {
    if (!commission) return;
    const letters = rangeLetters();
    const count = Number($('split-range').value);
    const selected = letters.slice(0, count).join('');
    const span = document.createElement('mark'); span.textContent = selected;
    const after = document.createTextNode(letters.slice(count).join(''));
    $('request-manuscript').replaceChildren(span, after);
    const length = splitGraphemes(selected.trim()).length;
    $('split-count').textContent = `${length}자`;
    $('split-range').setAttribute('aria-valuetext', `이번 묶음 ${length}자`);
    $('split-add').disabled = !length || length > 48;
    $('split-less').disabled = count <= 1;
    $('split-more').disabled = count >= Number($('split-range').max);
  }
  function sentenceBoundary(showNotice = true) {
    const letters = rangeLetters().slice(0, Number($('split-range').max));
    const boundary = letters.findIndex((c,i) => /[.!?。！？\n]/u.test(c) && letters.slice(0,i+1).join('').trim());
    if (boundary >= 0) $('split-range').value = boundary + 1;
    else if (showNotice) notify('48자 안에 문장 끝이 없습니다. 원하는 지점에서 나눠주세요.');
    renderBoundary();
  }
  function render() {
    const has = !!commission;
    $('inbox-catalog').hidden = has;
    $('commission-editor').hidden = !has;
    $('assignment-card').hidden = !has;
    $('inbox-title').textContent = has ? '사장님이 나누고, 직원이 두드립니다.' : '사장님, 원고가 들어왔습니다.';
    $('inbox-label').textContent = has ? '의뢰서와 나눠둔 업무 보기' : '외주 요청이 도착했습니다.';
    if (!has) return;
    const done = commission.chunks.filter(c => c.status === 'completed').length;
    const pending = nextPending(commission);
    const active = activeChunk(commission);
    const canStart = ['idle','complete'].includes(getMode()) && !active && !!pending;
    const linked = chunkForDraft(commission, getDraft());
    $('assignment-meta').textContent = `외주 / ${commission.client}`;
    $('assignment-title').textContent = commission.title;
    $('assignment-progress').textContent = allDone() ? '모든 묶음을 완성했습니다.' : `${done}묶음 완료 · ${commission.chunks.length - done}묶음 대기·작업 중${remainingText(commission) ? ' · 나눌 원고 있음' : ''}`;
    $('assignment-next').hidden = !pending;
    $('assignment-next').disabled = !canStart;
    $('assignment-next').textContent = active ? '직원이 한 묶음을 쓰고 있습니다.' : '다음 묶음 맡기기 ↗';
    $('request-client').textContent = `FROM / ${commission.client}`;
    $('request-title').textContent = commission.title;
    $('request-note').textContent = commission.note.replace('가상의 외주 의뢰입니다. ','');
    $('request-change').hidden = commission.chunks.length > 0;
    $('request-progress').textContent = `${done} / ${commission.chunks.length}묶음 완료`;
    $('request-total').textContent = `전체 ${splitGraphemes(commission.manuscript).length}자`;
    const remaining = remainingText(commission);
    $('split-controls').hidden = !remaining;
    $('split-finished').hidden = !!remaining || allDone();
    $('split-undo').disabled = commission.chunks.at(-1)?.status !== 'pending';
    $('commission-finished').hidden = !allDone();
    $('queue-start').hidden = allDone();
    $('queue-start').disabled = !canStart;
    $('queue-start').textContent = done ? '다음 묶음 맡기기 ↗' : '첫 묶음 맡기기 ↗';
    $('queue-message').textContent = allDone() ? '줄바꿈과 띄어쓰기를 이어 붙인 전체 원고를 가져갈 수 있습니다.' : active ? '직원이 맡은 묶음을 마치면 다음 업무를 줄 수 있습니다.' : !['idle','complete'].includes(getMode()) ? '지금 쓰는 원고를 마치거나 새 원고로 전환한 뒤 맡길 수 있습니다.' : pending ? '직원이 쓰는 동안 나머지 원고를 더 나눠두셔도 됩니다.' : '위에서 나눌 지점을 고른 뒤 한 묶음을 추가해주세요.';
    const fragment = document.createDocumentFragment();
    commission.chunks.forEach((chunk, i) => {
      const row = document.createElement('li'); row.className = chunk.status === 'completed' ? 'queue-complete' : '';
      const number = document.createElement('span'); number.className = 'queue-num'; number.textContent = String(i+1).padStart(2,'0');
      const text = document.createElement('span'); text.className = 'queue-text'; text.textContent = chunk.target;
      const status = document.createElement('span'); status.className = 'queue-state'; status.textContent = {pending:'대기',assigned:'작업 중',completed:'완료'}[chunk.status];
      row.append(number,text,status); fragment.append(row);
    });
    $('commission-queue').replaceChildren(fragment);
    if (linked?.status === 'assigned') $('input-message').textContent = '외주 원고의 한 묶음을 쓰고 있습니다.';
    renderBoundary();
  }
  function receive(sample) {
    try { commission = createCommission(sample); save(); resetRange(); render(); $('inbox-dialog').scrollTop = 0; }
    catch (e) { $('custom-message').textContent = e.message; }
  }
  function startNext() {
    if (!commission || !['idle','complete'].includes(getMode()) || activeChunk(commission)) return;
    const next = nextPending(commission); if (!next) return;
    try {
      assign(next.target, fresh => { claimNext(commission, fresh); save(); });
      $('inbox-dialog').close(); render();
      notify('한 묶음 맡겼습니다. 직원은 일단 두드려봅니다.');
    } catch (e) { notify(e.message); }
  }
  const active = commission && activeChunk(commission);
  if (active) {
    if (chunkForDraft(commission, getDraft())?.id !== active.id) releaseChunk(commission, active.id);
    else completeChunk(commission, getDraft());
    save();
  }
  for (const [i,sample] of COMMISSION_SAMPLES.entries()) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'commission-sample';
    const meta = document.createElement('span'); meta.className = 'sample-meta';
    const from = document.createElement('span'); from.textContent = `0${i+1} / ${sample.client}`;
    const count = document.createElement('span'); count.textContent = `${splitGraphemes(sample.manuscript).length}자 ↗`; meta.append(from,count);
    const title = document.createElement('strong'); title.textContent = sample.title;
    const note = document.createElement('span'); note.className = 'sample-note'; note.textContent = sample.note.replace('가상의 외주 의뢰입니다. ','');
    button.append(meta,title,note); button.addEventListener('click',()=>receive(sample)); $('commission-samples').append(button);
  }
  $('inbox-open').addEventListener('click',()=> { render(); $('inbox-dialog').showModal(); });
  $('custom-commission-form').addEventListener('submit',e=> { e.preventDefault(); receive({title:'직접 받은 원고',client:'사장님이 가져온 의뢰',note:'나눌 지점을 정하고, 한 묶음씩 맡겨주세요.',manuscript:$('custom-manuscript').value}); });
  $('split-range').addEventListener('input',renderBoundary);
  $('split-less').addEventListener('click',()=> { $('split-range').stepDown(); renderBoundary(); });
  $('split-more').addEventListener('click',()=> { $('split-range').stepUp(); renderBoundary(); });
  $('split-sentence').addEventListener('click',()=>sentenceBoundary());
  $('split-add').addEventListener('click',()=> {
    try { splitNext(commission, Number($('split-range').value)); save(); resetRange(); render(); }
    catch(e) { notify(e.message); }
  });
  $('split-undo').addEventListener('click',()=> { if (undoLastSplit(commission)) { save(); resetRange(); render(); } });
  $('queue-start').addEventListener('click',startNext);
  $('assignment-next').addEventListener('click',startNext);
  $('request-change').addEventListener('click',()=> { if (commission.chunks.length) return; commission = null; save(); render(); });
  $('commission-new').addEventListener('click',()=> { if (!allDone()) return; commission = null; save(); render(); $('inbox-dialog').scrollTop = 0; });
  $('commission-bind').addEventListener('click',()=> { if (allDone()) { $('inbox-dialog').close(); onBind?.(commission); } });
  $('commission-copy').addEventListener('click',async()=> {
    if (!allDone()) return;
    try { await navigator.clipboard.writeText(commission.chunks.map(c=>c.source).join('')); notify('완성한 전체 원고를 복사했습니다.'); }
    catch { notify('복사할 수 없습니다. 브라우저의 클립보드 권한을 확인해주세요.'); }
  });
  resetRange(); render();
  return {
    render,
    assignmentFor(draft) {
      const chunk = chunkForDraft(commission, draft);
      return chunk ? {commission,chunk,complete:allDone()} : null;
    },
    completeDraft(draft) { if (commission && completeChunk(commission,draft)) { save(); render(); } },
    releaseDraft(draft) { if (commission && releaseChunk(commission,draft)) { save(); render(); } },
  };
}
