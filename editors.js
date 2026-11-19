// The monkey types independently. The editing desk only selects the next match.
export function editorRecord(draft) {
  let previousAttempt = 0;
  let latest = null;
  let pasted = 0;
  for (const [i, entry] of (draft?.history ?? []).entries()) {
    if (!entry.accepted) continue;
    const attempt = i + 1;
    latest = { char: entry.char, index: pasted, attempt, waited: attempt - previousAttempt };
    pasted++;
    previousAttempt = attempt;
  }
  return { latest, pasted, next: draft?.letters?.[pasted] ?? null, complete: !!draft?.completedAt };
}

function letterLabel(char) {
  if (char === ' ') return '공백';
  if (char === '\n') return '줄바꿈';
  return `‘${char}’`;
}

const scissors = `<svg viewBox="0 0 100 68" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path class="editor-blade-a" d="M38 37 77 20"/><path class="editor-blade-b" d="M37 35 76 49"/><circle cx="29" cy="29" r="9"/><circle cx="29" cy="44" r="9"/><circle cx="39" cy="36" r="2"/><path d="m7 60 8-7 1-12c0-4 5-5 6-1l1 5 5-9c2-3 6-1 5 2l-3 8 6-4c3-2 6 2 3 4L26 59l-6 7" fill="var(--paper)"/></g></svg>`;
const pressHand = `<svg viewBox="0 0 66 85" fill="none" aria-hidden="true"><path d="m50 84-4-16 1-20c0-5-6-6-7-2l-1 7 1-18c0-5-6-6-7-1l-2 16 1-21c0-5-6-5-7-1l-2 21-1-34c0-5-7-5-7 0l1 45-5-7c-3-4-8-1-6 3l12 19 6 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="var(--paper)"/></svg>`;

function visibleRect(rect) {
  return rect && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
}

export class EditingDesk {
  constructor({ raw, target, mount, onCut } = {}) {
    this.raw = raw;
    this.target = target;
    this.onCut = onCut;
    this.active = new Set();
    this.latest = null;
    this.pasted = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.layer = document.createElement('div');
    this.layer.className = 'editor-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    document.body.append(this.layer);
    this.raw?.classList.add('edited-raw');
    this.target?.classList.add('edited-target');
    if (mount) this.buildPanel(mount);
    this.onViewportChange = event => {
      // The raw strip scrolls as new keys arrive; the lifted copy is already detached.
      if (event?.type === 'scroll' && event.target === this.raw) return;
      this.cancel();
    };
    addEventListener('resize', this.onViewportChange, { passive: true });
    addEventListener('scroll', this.onViewportChange, { passive: true, capture: true });
    document.addEventListener('visibilitychange', this.onViewportChange);
    this.reduced.addEventListener('change', this.onViewportChange);
    this.dialogObserver = new MutationObserver(() => {
      if (document.querySelector('dialog[open]')) this.cancel();
    });
    this.dialogObserver.observe(document.body, {subtree:true, attributes:true, attributeFilter:['open']});
  }

  buildPanel(mount) {
    this.panel = document.createElement('details');
    this.panel.className = 'editing-desk';
    const summary = document.createElement('summary');
    const name = document.createElement('span'); name.textContent = '편집부';
    this.status = document.createElement('span'); this.status.className = 'editing-status';
    summary.append(name, this.status);
    const body = document.createElement('div'); body.className = 'editing-note';
    this.lastNote = document.createElement('p');
    this.totalNote = document.createElement('p'); this.totalNote.className = 'editing-count';
    const rule = document.createElement('p'); rule.className = 'editing-rule';
    rule.textContent = '다음에 필요한 글자가 나왔을 때만 오려 붙입니다. 원숭이는 이 일을 모릅니다.';
    body.append(this.lastNote, this.totalNote, rule);
    this.panel.append(summary, body);
    mount.replaceChildren(this.panel);
    this.renderPanel(null);
  }

  renderPanel(next, complete = false) {
    if (!this.panel) return;
    this.status.textContent = complete ? '원고 정리 완료' : next != null ? `다음은 ${letterLabel(next)}` : '원고를 기다립니다';
    this.lastNote.textContent = this.latest
      ? `${letterLabel(this.latest.char)} 한 칸을 찾는 동안 ${this.latest.waited.toLocaleString('ko-KR')}번 두드렸습니다.`
      : '필요한 글자가 나오면, 이곳에서 오려 붙입니다.';
    this.totalNote.textContent = this.latest
      ? `${this.latest.attempt.toLocaleString('ko-KR')}번째 타이핑에서 발견 · 지금까지 ${this.pasted}칸 붙임`
      : '아직 오려 붙인 글자가 없습니다.';
  }

  decorateTargets() {
    for (const [index, element] of Array.from(this.target?.children ?? []).entries()) {
      element.style.setProperty('--scrap-angle', `${((index * 7 + 3) % 9 - 4) * .35}deg`);
      element.style.setProperty('--scrap-shift', `${((index * 3 + 1) % 5 - 2) * .35}px`);
      element.classList.toggle('paper-whitespace', !element.textContent.trim());
      if (element.classList.contains('accepted')) element.classList.add('is-pasted');
    }
  }

  reset(draft) {
    this.cancel();
    const record = editorRecord(draft);
    this.latest = record.latest;
    this.pasted = record.pasted;
    this.decorateTargets();
    this.renderPanel(record.next, record.complete);
  }

  sync(draft) {
    this.pasted = draft?.index ?? 0;
    this.renderPanel(draft?.letters?.[this.pasted] ?? null, !!draft?.completedAt);
  }

  accept({ char, index, attempt, waited, sourceElement, targetElement }) {
    this.latest = { char, index, attempt, waited };
    this.pasted = Math.max(this.pasted, index + 1);
    if (!targetElement) return;
    const settleImmediately = () => {
      targetElement.classList.remove('editor-in-transit', 'just-matched');
      targetElement.classList.add('is-pasted');
    };
    const sourceRect = sourceElement?.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const rawRect = this.raw?.getBoundingClientRect();
    if (this.reduced.matches || document.hidden || document.querySelector('dialog[open]') ||
        !visibleRect(sourceRect) || !visibleRect(targetRect) || !rawRect ||
        sourceRect.top < rawRect.top || sourceRect.bottom > rawRect.bottom + 1 ||
        this.active.size >= 4 || !Element.prototype.animate) {
      settleImmediately(); return;
    }
    targetElement.classList.remove('is-pasted', 'just-matched');
    targetElement.classList.add('editor-in-transit');
    const glyph = char === ' ' ? '␣' : char === '\n' ? '↵' : char;
    const width = Math.max(15, sourceRect.width + 6);
    const height = Math.max(19, Math.min(28, sourceRect.height + 4));
    const fromX = sourceRect.left + sourceRect.width / 2;
    const fromY = sourceRect.top + sourceRect.height / 2;
    const toX = targetRect.left + targetRect.width / 2;
    const toY = targetRect.top + targetRect.height / 2;
    const scale = Math.min(2.6, Math.max(1, targetRect.height / height * .8));
    const scrap = document.createElement('span');
    scrap.className = 'editor-flying-scrap';
    scrap.textContent = glyph;
    scrap.style.cssText = `left:${fromX - width/2}px;top:${fromY - height/2}px;width:${width}px;height:${height}px;font-size:${getComputedStyle(this.raw).fontSize}`;
    const cut = document.createElement('span'); cut.className = 'editor-scissors'; cut.innerHTML = scissors;
    cut.style.cssText = `left:${fromX - 65}px;top:${fromY - 36}px`;
    const press = document.createElement('span'); press.className = 'editor-press-hand'; press.innerHTML = pressHand;
    press.style.cssText = `left:${toX - 17}px;top:${toY - 10}px`;
    this.layer.append(scrap, cut, press);
    const record = { nodes: [scrap,cut,press], animations: [], target: targetElement, timer: null };
    this.active.add(record);
    const dx = toX - fromX;
    const dy = toY - fromY;
    const duration = 840;
    record.animations.push(scrap.animate([
      {transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1,offset:0},
      {transform:'translate(0,0) rotate(-5deg) scale(1)',opacity:1,offset:.25},
      {transform:`translate(${dx*.45}px,${dy*.45-22}px) rotate(6deg) scale(${1+(scale-1)*.45})`,opacity:1,offset:.53},
      {transform:`translate(${dx}px,${dy}px) rotate(0deg) scale(${scale})`,opacity:1,offset:.78},
      {transform:`translate(${dx}px,${dy}px) rotate(0deg) scale(${scale})`,opacity:0,offset:1}
    ],{duration,easing:'cubic-bezier(.25,.7,.25,1)',fill:'both'}));
    record.animations.push(cut.animate([
      {opacity:0,transform:'translate(-11px,5px) rotate(-7deg)',offset:0},
      {opacity:1,transform:'translate(0,0) rotate(0deg)',offset:.16},
      {opacity:1,transform:'translate(4px,0) rotate(4deg)',offset:.55},
      {opacity:0,transform:'translate(-7px,8px) rotate(-5deg)',offset:1}
    ],{duration:360,easing:'ease-in-out',fill:'both'}));
    record.animations.push(press.animate([
      {opacity:0,transform:'translate(7px,17px)',offset:0},
      {opacity:1,transform:'translate(0,0)',offset:.35},
      {opacity:1,transform:'translate(0,3px)',offset:.65},
      {opacity:0,transform:'translate(8px,15px)',offset:1}
    ],{duration:300,delay:565,easing:'ease-in-out',fill:'both'}));
    if (typeof this.onCut === 'function') this.onCut();
    record.timer = setTimeout(() => this.settle(record), duration);
  }

  settle(record) {
    if (!this.active.has(record)) return;
    clearTimeout(record.timer);
    record.target.classList.remove('editor-in-transit', 'just-matched');
    record.target.classList.add('is-pasted');
    record.animations.forEach(animation => animation.cancel());
    record.nodes.forEach(node => node.remove());
    this.active.delete(record);
  }

  cancel() { for (const record of Array.from(this.active)) this.settle(record); }
  destroy() {
    this.cancel(); this.layer.remove(); this.panel?.remove();
    removeEventListener('resize', this.onViewportChange);
    removeEventListener('scroll', this.onViewportChange, true);
    document.removeEventListener('visibilitychange', this.onViewportChange);
    this.reduced.removeEventListener('change', this.onViewportChange);
    this.dialogObserver.disconnect();
  }
}
