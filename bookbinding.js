import { splitGraphemes, restoreDraft } from './engine.js';
import { restoreCommission, MAX_MANUSCRIPT_LENGTH } from './commissions.js';

export const BOOKS_KEY = 'sometimes-bananas:books:v1';
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const whole = value => Number.isSafeInteger(value) && value >= 0;
const label = (value, fallback, limit = 80) => splitGraphemes(String(value ?? '').normalize('NFC').trim()).slice(0, limit).join('') || fallback;
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => value.toLocaleString('ko-KR');

export function paginateManuscript(text, { maxChars = 144, maxNewlines = 6 } = {}) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1 || !Number.isSafeInteger(maxNewlines) || maxNewlines < 1) throw new RangeError('Invalid page size.');
  const pages = [];
  let current = '', length = 0, newlines = 0;
  for (const char of splitGraphemes(String(text))) {
    if (length >= maxChars || (char === '\n' && newlines >= maxNewlines)) {
      pages.push(current); current = ''; length = 0; newlines = 0;
    }
    current += char; length++;
    if (char === '\n') newlines++;
  }
  if (current || !pages.length) pages.push(current);
  return pages;
}

export function makeBook(input) {
  const commission = restoreCommission(input);
  if (!commission || !commission.chunks.length || commission.cursor !== splitGraphemes(commission.manuscript).length || commission.chunks.some(chunk => chunk.status !== 'completed')) {
    throw new Error('외주 원고의 모든 묶음을 마친 뒤 제본할 수 있습니다.');
  }
  const stats = {attempts:0, activeMs:0, bananas:0, typedCharacters:0, chunks:commission.chunks.length};
  for (const chunk of commission.chunks) {
    stats.attempts += chunk.summary.attempts;
    stats.activeMs += chunk.summary.activeMs;
    stats.bananas += chunk.summary.bananas;
    stats.typedCharacters += splitGraphemes(chunk.target).length;
  }
  const completedAt = commission.chunks.reduce((date,chunk) => Date.parse(chunk.summary.completedAt) > Date.parse(date) ? chunk.summary.completedAt : date, commission.chunks[0].summary.completedAt);
  return {
    version:1, id:`commission:${commission.id}`, kind:'commission',
    title:commission.title, client:commission.client, worker:'원숭이 직원',
    manuscript:commission.chunks.map(chunk=>chunk.source).join(''), stats,
    completedAt, boundAt:new Date().toISOString(),
  };
}

function hash(text) {
  let code = 2166136261;
  for (const char of text) { code ^= char.codePointAt(0); code = Math.imul(code,16777619); }
  return (code >>> 0).toString(36);
}

export function makeDraftBook(input) {
  const draft = restoreDraft(input);
  if (!draft?.completedAt) throw new Error('원고를 완성한 뒤 제본할 수 있습니다.');
  return {
    version:1, id:`draft:${draft.createdAt}:${hash(draft.target)}`, kind:'draft',
    title:label(draft.target.replace(/\s+/g,' '),'한 문장의 책',30), client:'사장님의 원고', worker:draft.monkeyName,
    manuscript:draft.target,
    stats:{attempts:draft.attempts,activeMs:draft.activeMs,bananas:draft.bananas,typedCharacters:draft.letters.length,chunks:1},
    completedAt:draft.completedAt,boundAt:new Date().toISOString(),
  };
}

export function restoreBook(saved) {
  try {
    const value = typeof saved === 'string' ? JSON.parse(saved) : saved;
    if (!value || value.version !== 1 || !['commission','draft'].includes(value.kind) || typeof value.id !== 'string' || !value.id.startsWith(value.kind + ':') || value.id.length > 200) return null;
    if (!validDate(value.completedAt) || !validDate(value.boundAt)) return null;
    for (const [key,max] of [['title',80],['client',80],['worker',24]]) {
      if (typeof value[key] !== 'string' || !value[key] || label(value[key],'',max) !== value[key]) return null;
    }
    const text = value.manuscript;
    if (typeof text !== 'string' || !text.trim() || text !== text.normalize('NFC').replace(/\r\n?/g,'\n')) return null;
    const length = splitGraphemes(text).length;
    if (length > MAX_MANUSCRIPT_LENGTH) return null;
    const stats = value.stats;
    if (!stats || !whole(stats.attempts) || !whole(stats.bananas) || !whole(stats.typedCharacters) || !whole(stats.chunks) || !stats.chunks || !stats.typedCharacters || stats.typedCharacters > length || stats.attempts < stats.typedCharacters || stats.chunks > stats.typedCharacters || !Number.isFinite(stats.activeMs) || stats.activeMs < 0) return null;
    return {version:1,id:value.id,kind:value.kind,title:value.title,client:value.client,worker:value.worker,manuscript:text,stats:{attempts:stats.attempts,activeMs:stats.activeMs,bananas:stats.bananas,typedCharacters:stats.typedCharacters,chunks:stats.chunks},completedAt:value.completedAt,boundAt:value.boundAt};
  } catch { return null; }
}

function timeLabel(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
  return `${Math.floor(seconds / 3600)}시간 ${Math.floor(seconds / 60) % 60}분 ${seconds % 60}초`;
}

function colophonRows(book) {
  return [
    ['골라 붙인 글자', `${number(book.stats.typedCharacters)}자`],
    ['누른 키', `${number(book.stats.attempts)}번`],
    ['실제 근무 시간', timeLabel(book.stats.activeMs)],
    ['지급한 급여', `바나나 ${number(book.stats.bananas)}개`],
    ['맡긴 묶음', `${number(book.stats.chunks)}묶음`],
  ];
}

function pastedLetters(text, offset = 0) {
  return splitGraphemes(text).map((char,i)=> {
    if (/^\s+$/u.test(char)) return escapeHTML(char);
    const turn = (((i+offset)*17)%7-3)*.35;
    return `<span class="bound-letter" style="--letter-turn:${turn}deg">${escapeHTML(char)}</span>`;
  }).join('');
}

function coverMarkup(book) {
  return `<div class="bound-cover"><span class="bound-imprint">무작위 출판사<br>가끔 바나나</span><div class="bound-cover-title"><span class="bound-edition">ONE ACCIDENTAL EDITION</span><h3>${escapeHTML(book.title)}</h3><p>${escapeHTML(book.client)}</p></div><div class="bound-cover-bottom"><span>타이핑 · ${escapeHTML(book.worker)}</span><span>편집 · 무작위 출판사</span></div><span class="bound-stitch" aria-hidden="true"></span></div>`;
}

function colophonMarkup(book) {
  return `<div class="bound-colophon"><span class="bound-imprint">COLOPHON / 만든 기록</span><h3>한 권이 되기까지.</h3><dl>${colophonRows(book).map(([key,value])=>`<div><dt>${escapeHTML(key)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl><p class="bound-final-line">직원은 이 책을<br>읽지 않았습니다.</p><p class="bound-date">${escapeHTML(new Date(book.completedAt).toLocaleDateString('ko-KR'))}<br>한 번의 우연을 모아, 무작위 출판사.</p></div>`;
}

function pageMarkup(book, pages, index) {
  if (index === 0) return coverMarkup(book);
  if (index === pages.length + 1) return colophonMarkup(book);
  const offset = pages.slice(0,index-1).reduce((sum,text)=>sum+splitGraphemes(text).length,0);
  return `<div class="bound-text-page"><span class="bound-running-title">${escapeHTML(book.title)}</span><p class="bound-text" aria-label="${escapeHTML(pages[index-1])}">${pastedLetters(pages[index-1],offset)}</p><span class="bound-page-number">${String(index).padStart(2,'0')}</span></div>`;
}

// Downloaded books are self-contained, script-free documents. Optional fonts are
// accepted only as base64 WOFF2 data URLs; all manuscript and metadata are escaped.
export function bookHTML(input, {fontData = '', boldFontData = ''} = {}) {
  const book = restoreBook(input);
  if (!book) throw new Error('책을 불러오지 못했습니다.');
  const safeFont = value => /^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/.test(value) ? value : '';
  const regular = safeFont(fontData), bold = safeFont(boldFontData);
  const pages = paginateManuscript(book.manuscript);
  const fonts = `${regular ? `@font-face{font-family:Sunflower;src:url('${regular}') format('woff2');font-weight:400 500}` : ''}${bold ? `@font-face{font-family:Sunflower;src:url('${bold}') format('woff2');font-weight:700}` : ''}`;
  const css = `${fonts}*{box-sizing:border-box}body{margin:0;background:#e7e6e1;color:#20201e;font-family:Sunflower,system-ui,sans-serif;line-height:1.8}.download-note{max-width:520px;margin:32px auto 20px;padding:0 25px;font-size:12px;color:#777773}.bound-leaf{width:520px;min-height:680px;background:#fcfbf8;margin:25px auto;padding:48px 46px;box-shadow:0 5px 20px #0001;position:relative;break-after:page}.bound-cover,.bound-colophon,.bound-text-page{min-height:584px;display:flex;flex-direction:column}.bound-imprint,.bound-edition,.bound-running-title,.bound-date,.bound-page-number,.bound-cover-bottom{font-size:11px;letter-spacing:.05em;color:#777773}.bound-cover-title{margin:auto 0}.bound-cover-title h3{font-size:38px;font-weight:500;line-height:1.6;word-break:keep-all;overflow-wrap:anywhere;margin:18px 0}.bound-cover-title p{font-size:14px}.bound-cover-bottom{display:flex;justify-content:space-between;gap:15px}.bound-stitch{position:absolute;left:19px;top:35%;bottom:35%;border-left:1px dashed #aaa9a2}.bound-text{font-size:20px;line-height:2.3;white-space:pre-wrap;overflow-wrap:anywhere;margin:42px 0 25px}.bound-letter{display:inline-block;padding:0 .015em;box-shadow:0 1px 0 #d1d0ca;transform:rotate(var(--letter-turn));background:#f7f6f2}.bound-page-number{margin-top:auto;text-align:center}.bound-colophon h3{font-size:27px;font-weight:500;margin:36px 0}.bound-colophon dl{font-size:14px;margin:0}.bound-colophon dl>div{display:flex;justify-content:space-between;gap:20px;padding:10px 0;border-bottom:1px solid #e5e4dd}.bound-colophon dt{color:#777773}.bound-colophon dd{margin:0}.bound-final-line{font-size:23px;line-height:1.8;margin:42px 0 20px}.bound-date{margin-top:auto}@media(max-width:560px){.bound-leaf{width:calc(100% - 28px);min-height:560px;padding:35px 27px}.bound-cover,.bound-colophon,.bound-text-page{min-height:490px}.bound-text{font-size:17px}.bound-cover-title h3{font-size:30px}}@media print{@page{size:A5;margin:0}body{background:white}.download-note{display:none}.bound-leaf{width:148mm;min-height:210mm;margin:0;padding:16mm 14mm;box-shadow:none;break-after:page}.bound-leaf:last-child{break-after:auto}.bound-cover,.bound-colophon,.bound-text-page{min-height:178mm}.bound-text{font-size:14pt}.bound-cover-title h3{font-size:27pt}}`;
  const leaves = Array.from({length:pages.length+2},(_,i)=>`<section class="bound-leaf" aria-label="${i===0?'표지':i===pages.length+1?'만든 기록':`본문 ${i}쪽`}">${pageMarkup(book,pages,i)}</section>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(book.title)} — 가끔 바나나</title><style>${css}</style></head><body><p class="download-note">무작위 출판사에서 제본한 한 권의 책입니다.<br>브라우저의 인쇄 메뉴에서 종이로 뽑거나 PDF로 저장할 수 있습니다.</p><main>${leaves}</main></body></html>`;
}

export function createBookbinder({notify = () => {}, onChange = () => {}} = {}) {
  let books = [];
  let current = null;
  let pages = [];
  let pageIndex = 0;
  let bindingTimer = null;
  const wide = matchMedia('(min-width:700px)');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  try {
    const stored = JSON.parse(localStorage.getItem(BOOKS_KEY));
    if (stored?.version === 1 && Array.isArray(stored.books)) {
      const ids = new Set();
      for (const value of stored.books) {
        const book = restoreBook(value);
        if (book && !ids.has(book.id)) { books.push(book); ids.add(book.id); }
      }
      if (books.length !== stored.books.length) notify('일부 책의 기록이 손상되어 불러오지 못했습니다.');
    }
  } catch { notify('책장을 불러오지 못했습니다.'); }

  const shelf = document.createElement('dialog');
  shelf.id = 'bookshelf-dialog'; shelf.className = 'dialog bookshelf-dialog'; shelf.setAttribute('aria-labelledby','bookshelf-title');
  shelf.innerHTML = '<button class="dialog-close book-close" type="button" aria-label="책장 닫기">×</button><p class="eyebrow">RANDOM PRESS / BOOKSHELF</p><h2 id="bookshelf-title">우연히 만든 책들.</h2><p class="bookshelf-intro">원고는 묶어두고, 직원은 다시 타자기 앞으로.</p><div id="bookshelf-list" class="bookshelf-list"></div><p class="fine-print">책은 이 브라우저에 보관됩니다. 파일로 내려받아 간직할 수도 있습니다.</p>';
  const reader = document.createElement('dialog');
  reader.id = 'book-dialog'; reader.className = 'dialog book-dialog'; reader.setAttribute('aria-labelledby','book-reader-title');
  reader.innerHTML = '<div class="book-reader-bar"><span id="book-reader-title">한 권의 책</span><button class="book-close" type="button" aria-label="책 닫기">×</button></div><p id="book-binding-status" class="book-binding-status" role="status" aria-live="polite"></p><div id="bound-book" class="bound-book"></div><div class="book-navigation"><button id="book-prev" type="button" aria-label="이전 페이지">←</button><span id="book-page-label" aria-live="polite"></span><button id="book-next" type="button" aria-label="다음 페이지">→</button></div><div class="book-reader-actions"><button id="book-download" type="button">책 파일로 간직하기 ↓</button><button id="book-to-shelf" type="button">책장 보기 ↗</button></div>';
  document.body.append(shelf,reader);
  const byId = id => document.getElementById(id);
  const bookStage = byId('bound-book');

  function storeBooks() {
    try { localStorage.setItem(BOOKS_KEY,JSON.stringify({version:1,books})); }
    catch { notify('책장을 저장하지 못했습니다. 책 파일을 내려받아 간직해주세요.'); }
    onChange(books.length);
  }
  function renderShelf() {
    const list = byId('bookshelf-list'); list.replaceChildren();
    if (!books.length) {
      const empty = document.createElement('p'); empty.className = 'bookshelf-empty'; empty.textContent = '아직 제본한 책이 없습니다. 원고를 완성한 뒤 한 권으로 묶어주세요.'; list.append(empty); return;
    }
    [...books].reverse().forEach((book,index)=> {
      const button = document.createElement('button'); button.className = 'bookshelf-item'; button.type = 'button';
      const no = document.createElement('span'); no.className = 'bookshelf-number'; no.textContent = String(books.length-index).padStart(2,'0');
      const info = document.createElement('span'); info.className = 'bookshelf-info';
      const title = document.createElement('strong'); title.textContent = book.title;
      const meta = document.createElement('small'); meta.textContent = `${book.client} · ${number(splitGraphemes(book.manuscript).length)}자`;
      info.append(title,meta);
      const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true');
      button.append(no,info,arrow); button.addEventListener('click',()=>{shelf.close();openBook(book);}); list.append(button);
    });
  }
  function renderPages() {
    if (!current) return;
    const count = pages.length + 2;
    pageIndex = Math.max(0,Math.min(pageIndex,count-1));
    const showTwo = wide.matches && pageIndex > 0;
    bookStage.classList.toggle('is-spread',showTwo);
    const indices = showTwo ? [pageIndex,pageIndex+1] : [pageIndex];
    bookStage.replaceChildren();
    indices.forEach(index=> {
      const leaf = document.createElement('section'); leaf.className = 'bound-leaf';
      if (index < count) {
        leaf.setAttribute('aria-label',index===0?'표지':index===count-1?'만든 기록':`본문 ${index}쪽`);
        leaf.innerHTML = pageMarkup(current,pages,index);
      } else { leaf.classList.add('bound-endpaper'); leaf.setAttribute('aria-hidden','true'); }
      bookStage.append(leaf);
    });
    byId('book-prev').disabled = pageIndex === 0;
    byId('book-next').disabled = pageIndex + indices.length >= count;
    byId('book-page-label').textContent = pageIndex===0 ? '표지' : `${pageIndex}${showTwo && pageIndex+1<count ? `–${pageIndex+1}` : ''} / ${count-1}`;
    reader.classList.remove('book-turn'); void reader.offsetWidth; reader.classList.add('book-turn');
  }
  function openBook(book, animate = false) {
    clearTimeout(bindingTimer);
    current = book; pages = paginateManuscript(book.manuscript); pageIndex = 0;
    byId('book-reader-title').textContent = book.title;
    byId('book-binding-status').textContent = animate ? '한 권으로 묶는 중입니다.' : '';
    reader.classList.toggle('is-binding',animate && !reduced.matches);
    renderPages();
    if (!reader.open) reader.showModal();
    reader.scrollTop = 0;
    if (animate) bindingTimer = setTimeout(()=> {
      reader.classList.remove('is-binding'); byId('book-binding-status').textContent = '책장에 한 권이 놓였습니다.';
    },reduced.matches?0:720);
  }
  function bindData(book) {
    if (!restoreBook(book)) throw new Error('제본할 원고의 기록을 확인할 수 없습니다.');
    const existing = books.find(item=>item.id===book.id);
    if (existing) { openBook(existing); return existing; }
    books.push(book); storeBooks(); renderShelf(); openBook(book,true); return book;
  }
  function navigate(direction) {
    if (!current) return;
    if (direction > 0) pageIndex = pageIndex === 0 ? 1 : pageIndex + (wide.matches?2:1);
    else pageIndex = pageIndex <= (wide.matches?2:1) ? 0 : pageIndex - (wide.matches?2:1);
    renderPages(); reader.scrollTop = 0;
  }
  byId('book-prev').addEventListener('click',()=>navigate(-1));
  byId('book-next').addEventListener('click',()=>navigate(1));
  reader.addEventListener('keydown',event=> {
    if (event.key === 'ArrowLeft' && !byId('book-prev').disabled) { event.preventDefault(); navigate(-1); }
    if (event.key === 'ArrowRight' && !byId('book-next').disabled) { event.preventDefault(); navigate(1); }
  });
  wide.addEventListener('change',()=> {
    // Keep the current leaf in view when a phone-sized page becomes a spread.
    if (wide.matches && pageIndex > 0) pageIndex = 1 + 2 * Math.floor((pageIndex - 1) / 2);
    renderPages();
  });
  byId('book-to-shelf').addEventListener('click',()=> { reader.close(); renderShelf(); if(!shelf.open)shelf.showModal(); });
  for (const dialog of [reader,shelf]) {
    dialog.querySelector('.book-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=> {
      if(event.target!==dialog)return; const r=dialog.getBoundingClientRect();
      if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
    });
  }
  reader.addEventListener('close',()=> { clearTimeout(bindingTimer); reader.classList.remove('is-binding'); });
  async function fontURL(path) {
    const response = await fetch(new URL(path,import.meta.url));
    if (!response.ok) throw new Error('font unavailable');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary=''; for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return `data:font/woff2;base64,${btoa(binary)}`;
  }
  byId('book-download').addEventListener('click',async()=> {
    if(!current)return;
    const book = current;
    const button=byId('book-download');button.disabled=true;button.textContent='책을 포장하는 중…';
    try {
      const fontResults=await Promise.allSettled([fontURL('./fonts/sunflower-medium.woff2'),fontURL('./fonts/sunflower-bold.woff2')]);
      const content=bookHTML(book,{fontData:fontResults[0].status==='fulfilled'?fontResults[0].value:'',boldFontData:fontResults[1].status==='fulfilled'?fontResults[1].value:''});
      const url=URL.createObjectURL(new Blob([content],{type:'text/html;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=`sometimes-bananas-${hash(book.id)}.html`;document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      notify('책 파일을 만들었습니다. 내려받은 HTML 파일을 열어보세요.');
    } catch { notify('책 파일을 만들지 못했습니다. 다시 눌러주세요.'); }
    finally { button.disabled=false;button.textContent='책 파일로 간직하기 ↓'; }
  });
  onChange(books.length);
  return {
    bind(commission) { try {return bindData(makeBook(commission));} catch(error){notify(error.message);return null;} },
    bindDraft(draft) { try {return bindData(makeDraftBook(draft));} catch(error){notify(error.message);return null;} },
    openShelf() { renderShelf(); if(!shelf.open)shelf.showModal(); },
    count() {return books.length;},
  };
}
