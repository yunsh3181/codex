const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ops=require('../admin-operations.js');

const admin=fs.readFileSync(path.resolve(__dirname,'../admin.js'),'utf8');
const rules=fs.readFileSync(path.resolve(__dirname,'../firestore.rules'),'utf8');

test('audit ids are deterministic and contain no customer data',()=>{
 assert.equal(ops.transitionAuditId('reservation_o1_100','cooking','ready'),'reservation_o1_100__cooking__ready');
 const source=ops.writeTransitionAudit.toString();
 for(const forbidden of ['customerDisplayName','phoneLast4','phone','items','payment','seat'])assert.doesNotMatch(source,new RegExp(`\\b${forbidden}\\b`));
});

test('every automatic and manual caller passes an explicit transition source',()=>{
 for(const source of ['reservation_timer','reservation_catch_up','admin_manual_ready','admin_manual_pickup','admin_manual_cancel','takeout_auto_ready','takeout_auto_retry'])assert.ok(admin.includes(`'${source}'`)||admin.includes(`?\'${source}\'`),source);
 assert.doesNotMatch(ops.advanceReservationLifecycleTransaction.toString(),/transitionSource\s*=/);
 assert.doesNotMatch(ops.autoCompleteTakeoutTransaction.toString(),/transitionSource\s*=/);
});

test('rules keep lifecycle audit append-only, private, allowlisted, and transaction-bound',()=>{
 assert.match(rules,/match \/orders\/\{orderId\}\/lifecycleAudit\/\{auditId\}/);
 assert.match(rules,/allow get, list: if isAdmin\(\)/);
 assert.match(rules,/allow update, delete: if false/);
 assert.match(rules,/request\.resource\.data\.keys\(\)\.hasOnly/);
 assert.match(rules,/request\.resource\.data\.actorUid == request\.auth\.uid/);
 assert.match(rules,/request\.resource\.data\.transitionedAt == request\.time/);
 assert.match(rules,/request\.resource\.data\.fromStatus == before\.status/);
 assert.match(rules,/request\.resource\.data\.toStatus == after\.status/);
});
