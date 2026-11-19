import test from 'node:test';
import assert from 'node:assert/strict';
import {editorRecord} from '../editors.js';

test('editor provenance counts actual attempts between retained letters',()=>{
 const draft={letters:['가',' ','나'],history:[{char:'x',accepted:false},{char:'가',accepted:true},{char:'가',accepted:false},{char:'z',accepted:false},{char:' ',accepted:true},{char:'y',accepted:false}],completedAt:null};
 assert.deepEqual(editorRecord(draft),{latest:{char:' ',index:1,attempt:5,waited:3},pasted:2,next:'나',complete:false});
 draft.history.push({char:'나',accepted:true}); draft.completedAt='done';
 assert.deepEqual(editorRecord(draft),{latest:{char:'나',index:2,attempt:7,waited:2},pasted:3,next:null,complete:true});
});
test('an empty manuscript has no invented editorial work',()=>{
 assert.deepEqual(editorRecord(null),{latest:null,pasted:0,next:null,complete:false});
 assert.deepEqual(editorRecord({letters:['👨‍👩‍👧‍👦'],history:[]}),{latest:null,pasted:0,next:'👨‍👩‍👧‍👦',complete:false});
});
