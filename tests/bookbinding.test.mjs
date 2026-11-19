import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, typeOne, splitGraphemes } from '../engine.js';
import { createCommission, splitNext, claimNext, completeChunk } from '../commissions.js';
import { makeBook, makeDraftBook, restoreBook, paginateManuscript, bookHTML } from '../bookbinding.js';

function finish(text, index = 0) {
  const draft = createDraft(text);
  draft.createdAt = new Date(1700000000000 + index * 1000).toISOString();
  draft.activeMs = 1234 + index * 100;
  draft.bananas = index + 1;
  typeOne(draft, () => draft.alphabet.indexOf('z'));
  while (!draft.completedAt) typeOne(draft, () => draft.alphabet.indexOf(draft.letters[draft.index]));
  return draft;
}
function completedCommission() {
  const commission = createCommission({title:'원고의 이름',client:'책방',manuscript:'  한 글.\n다음 👨‍👩‍👧‍👦 글.  '});
  splitNext(commission,6);
  splitNext(commission,splitGraphemes(commission.manuscript).length - commission.cursor);
  commission.chunks.forEach((chunk,index)=> {
    const draft = createDraft(chunk.target);
    draft.createdAt = new Date(1700000000000+index*1000).toISOString();
    claimNext(commission,draft);
    draft.activeMs = 2000 + index*300;
    draft.bananas = index+1;
    typeOne(draft,()=>draft.alphabet.indexOf('z'));
    while(!draft.completedAt)typeOne(draft,()=>draft.alphabet.indexOf(draft.letters[draft.index]));
    completeChunk(commission,draft);
  });
  return commission;
}

test('only a complete commission can become a book; exact source and real totals survive binding',()=> {
  const commission=completedCommission();
  const book=makeBook(commission);
  assert.equal(book.manuscript,commission.manuscript);
  assert.equal(book.title,commission.title);
  assert.equal(book.stats.attempts,commission.chunks.reduce((s,c)=>s+c.summary.attempts,0));
  assert.equal(book.stats.activeMs,4300);
  assert.equal(book.stats.bananas,3);
  assert.equal(book.stats.chunks,2);
  assert.equal(book.id,makeBook(commission).id);
  assert.deepEqual(restoreBook(JSON.stringify(book)),book);
  const unfinished=createCommission({title:'아직',manuscript:'끝나지 않았다.'});
  assert.throws(()=>makeBook(unfinished));
  splitNext(unfinished,2);
  assert.throws(()=>makeBook(unfinished));
});

test('pagination preserves every original grapheme, space and newline across all pages',()=> {
  const text='  👨‍👩‍👧‍👦 한글\n\n중간\n끝  '.repeat(35);
  const pages=paginateManuscript(text,{maxChars:31,maxNewlines:3});
  assert.equal(pages.join(''),text);
  for(const page of pages) {
    assert.ok(splitGraphemes(page).length<=31);
    assert.ok((page.match(/\n/g)||[]).length<=3);
    assert.ok(!page.includes('\ufffd'));
  }
  assert.throws(()=>paginateManuscript(text,{maxChars:0}));
});

test('single manuscript books retain actual production records and deterministic identity',()=> {
  const draft=finish('한 문장.');
  const book=makeDraftBook(draft);
  assert.equal(book.manuscript,draft.target);
  assert.equal(book.stats.attempts,draft.attempts);
  assert.equal(book.stats.bananas,draft.bananas);
  assert.equal(book.worker,draft.monkeyName);
  assert.equal(book.id,makeDraftBook(draft).id);
  assert.deepEqual(restoreBook(book),book);
  assert.throws(()=>makeDraftBook(createDraft('미완성')));
});

test('stored books reject corrupt dates, mismatched counts and invalid source',()=> {
  const book=makeBook(completedCommission());
  assert.equal(restoreBook({...book,completedAt:'yesterday'}),null);
  assert.equal(restoreBook({...book,manuscript:'  '}),null);
  assert.equal(restoreBook({...book,stats:{...book.stats,attempts:0}}),null);
  assert.equal(restoreBook({...book,stats:{...book.stats,activeMs:-1}}),null);
  assert.equal(restoreBook({...book,stats:{...book.stats,bananas:NaN}}),null);
  assert.equal(restoreBook({...book,stats:{...book.stats,typedCharacters:9999}}),null);
  assert.equal(restoreBook('{'),null);
});

test('downloaded book escapes manuscript and metadata and accepts only embedded font data',()=> {
  const book=makeDraftBook(finish('<script> & "끝"'));
  book.title='<img src=x onerror=alert(1)>';
  const html=bookHTML(book,{fontData:"');}</style><script>alert(1)</script>"});
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('직원은 이 책을'));
  assert.ok(!html.includes('https://'));
  assert.ok(bookHTML(book,{fontData:'data:font/woff2;base64,AAAA'}).includes("src:url('data:font/woff2;base64,AAAA')"));
});
