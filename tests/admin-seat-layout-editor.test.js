const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const layout=require('../seat-layout');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'seats.js'),'utf8');
const html=fs.readFileSync(path.join(root,'seat/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'seat-layout.css'),'utf8');

test('requested default layout maps 13 stable seat IDs into 18 slots',()=>{
 assert.deepEqual(layout.copyDefault(),{'papa-2':0,'papa-bar4':1,'outdoor-1':2,'outdoor-2':3,'outdoor-3':4,'outdoor-4':5,'annex-1':6,'annex-2':7,'annex-3':8,'annex-4':9,'room-1':12,'room-2':13,'room-3':14});
 const entries=layout.slotEntries(layout.copyDefault());
 assert.equal(entries.length,18);assert.equal(entries.filter(entry=>entry.seatId).length,13);assert.deepEqual(entries.filter(entry=>!entry.seatId).map(entry=>entry.slot),[10,11,15,16,17]);
 assert.equal(new Set(entries.filter(entry=>entry.seatId).map(entry=>entry.seatId)).size,13);
});

test('movement supports empty slots, swaps occupied slots, and crosses rows',()=>{
 const original=layout.copyDefault(),intoEmpty=layout.moveSeat(original,'annex-4',10);
 assert.equal(intoEmpty['annex-4'],10);assert.equal(Object.values(intoEmpty).includes(9),false);
 const swapped=layout.moveSeat(original,'papa-2',7);assert.equal(swapped['papa-2'],7);assert.equal(swapped['annex-2'],0);
 const crossRow=layout.moveSeat(original,'outdoor-1',14);assert.equal(crossRow['outdoor-1'],14);assert.equal(crossRow['room-3'],2);
 assert.deepEqual(original,layout.copyDefault(),'moves do not mutate the saved layout');
});

test('validation rejects missing, duplicate, unknown, and out-of-range entries',()=>{
 const valid=layout.copyDefault();assert.equal(layout.validatePositions(valid).valid,true);
 const missing={...valid};delete missing['room-3'];assert.equal(layout.validatePositions(missing).valid,false);
 assert.equal(layout.validatePositions({...valid,'unknown-seat':17}).valid,false);
 assert.equal(layout.validatePositions({...valid,'room-3':13}).valid,false);
 assert.equal(layout.validatePositions({...valid,'room-3':18}).valid,false);
 assert.equal(layout.moveSeat(valid,'papa-2',18),null);
});

test('editor UI and transaction boundaries preserve seat-state writes',()=>{
 for(const id of ['editSeatLayout','saveSeatLayout','cancelSeatLayout','resetSeatLayout','seatLayoutNotice'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);assert.match(css,/grid-template-rows:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(source,/db\.collection\('adminSettings'\)\.doc\('seatLayout'\)/);
 assert.match(source,/currentRevision!==expectedRevision/);assert.match(source,/throw new Error\('SEAT_LAYOUT_STALE'\)/);
 assert.match(source,/if\(layoutEditing\)return;const action=/,'state actions are blocked while editing');
 assert.match(source,/if\(!layoutEditing\|\|layoutSaving\)return false/);assert.match(source,/layoutSaving=true;renderLayoutControls\(\)/);
 assert.match(source,/if\(!layoutEditing\)draftPositions=\{\.\.\.savedPositions\}/,'snapshots preserve the editing draft');
 const updateSeat=source.match(/async function updateSeat[\s\S]*?\nasync function transitionReservation/)?.[0]||'';
 assert.doesNotMatch(updateSeat,/adminSettings|positions|revision/,'seat status writes never include layout data');
});

test('keyboard, drag, focus, reset confirmation, and unsaved navigation protections are present',()=>{
 for(const token of ["'dragstart'","'dragover'","'drop'","'dragend'","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","beforeunload","data-seat-move-handle"])assert.ok(source.includes(token),`${token} is implemented`);
 assert.match(source,/confirm\('요청된 기본 좌석 배열/);assert.match(source,/document\.getElementById\('editSeatLayout'\)\?\.focus\(\)/);
 assert.match(source,/event\.stopPropagation\(\)/);assert.match(source,/event\.preventDefault\(\)/);
});
