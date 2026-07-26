'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { authenticate } = require('../kiosk-runtime-auth.js');

const STORE = 'pangyo2-techno-valley';
const KIOSK = 'mobile-01';
const SESSION = 'session-a';
const now = 100000;
const rules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
const unauth = null;
const user = { uid: 'user-1', token: {} };
const admin = { uid: 'admin-1', token: { admin: true } };
const kiosk = { uid: 'kiosk-principal-a', token: { role: 'kiosk', storeId: STORE, kioskId: KIOSK } };
const otherKiosk = { uid: 'kiosk-principal-b', token: { role: 'kiosk', storeId: STORE, kioskId: 'other-kiosk' } };

const isAdmin = auth => auth?.token?.admin === true;
const isKiosk = (auth, storeId, kioskId) => auth?.token?.role === 'kiosk' &&
  auth.token.storeId === storeId && auth.token.kioskId === kioskId;

function presenceWrite(auth, pathKioskId, data) {
  return isKiosk(auth, STORE, pathKioskId) &&
    data.storeId === STORE && data.kioskId === pathKioskId && data.role === 'kiosk' &&
    typeof data.sessionId === 'string' && data.sessionId.length > 0 && data.sessionId.length <= 128 &&
    data.heartbeatAt === now &&
    Object.keys(data).sort().join(',') === ['heartbeatAt', 'kioskId', 'role', 'sessionId', 'storeId'].sort().join(',');
}

function runtimeRead(auth, pathKioskId) {
  return isAdmin(auth) || isKiosk(auth, STORE, pathKioskId);
}

const baseCommand = {
  storeId: STORE, kioskId: KIOSK, targetSessionId: SESSION, action: 'enable',
  requestId: 'request-a', requestedBy: 'admin-1', requestedAt: now - 10,
  expiresAt: now + 10000, ack: null, acknowledgedAt: null
};

function ackUpdate(auth, before, after) {
  if (!isKiosk(auth, STORE, KIOSK)) return false;
  const changed = Object.keys({ ...before, ...after }).filter(key =>
    JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const ack = after.ack;
  return changed.every(key => ['ack', 'acknowledgedAt'].includes(key)) &&
    after.acknowledgedAt === now && ack &&
    Object.keys(ack).sort().join(',') === ['requestId', 'kioskId', 'sessionId', 'action', 'applied', 'enabled'].sort().join(',') &&
    ack.requestId === before.requestId && ack.kioskId === KIOSK &&
    ack.sessionId === before.targetSessionId && ack.action === before.action &&
    typeof ack.applied === 'boolean' && typeof ack.enabled === 'boolean';
}

const presence = { storeId: STORE, kioskId: KIOSK, sessionId: SESSION, role: 'kiosk', heartbeatAt: now };
const validAck = {
  requestId: 'request-a', kioskId: KIOSK, sessionId: SESSION,
  action: 'enable', applied: true, enabled: true
};
const withAck = (command = baseCommand, ack = validAck, extra = {}) =>
  ({ ...command, ack, acknowledgedAt: now, ...extra });

test('Rules source uses authenticated kiosk claims and has no public runtime read', () => {
  const runtimeBlock = rules.slice(rules.indexOf('match /runtimeControls/'), rules.indexOf('match /customers/'));
  assert.match(rules, /request\.auth\.token\.role == 'kiosk'/);
  assert.match(rules, /request\.auth\.token\.storeId == storeId/);
  assert.match(rules, /request\.auth\.token\.kioskId == kioskId/);
  assert.doesNotMatch(runtimeBlock, /allow read: if true/);
});

test('Presence authorization matrix', () => {
  assert.equal(presenceWrite(unauth, KIOSK, presence), false, '1 unauthenticated create denied');
  assert.equal(presenceWrite(unauth, KIOSK, presence), false, '2 unauthenticated update denied');
  assert.equal(presenceWrite(user, KIOSK, presence), false, '3 general user write denied');
  assert.equal(presenceWrite(kiosk, KIOSK, presence), true, '4 own presence write allowed');
  assert.equal(presenceWrite(otherKiosk, KIOSK, presence), false, '5 other kiosk write denied');
  assert.equal(presenceWrite(admin, KIOSK, presence), false, 'admin cannot forge presence');
});

test('Runtime command read authorization matrix', () => {
  assert.equal(runtimeRead(unauth, KIOSK), false, '6 unauthenticated read denied');
  assert.equal(runtimeRead(user, KIOSK), false, '7 general user read denied');
  assert.equal(runtimeRead(admin, KIOSK), true, '8 admin read allowed');
  assert.equal(runtimeRead(kiosk, KIOSK), true, '9 target kiosk read allowed');
  assert.equal(runtimeRead(otherKiosk, KIOSK), false, '10 other kiosk read denied');
});

test('ACK authorization and immutable-field matrix', () => {
  assert.equal(ackUpdate(unauth, baseCommand, withAck()), false, '11 unauthenticated ACK denied');
  assert.equal(ackUpdate(user, baseCommand, withAck()), false, '12 general user ACK denied');
  assert.equal(ackUpdate(admin, baseCommand, withAck()), false, '13 admin ACK forgery denied');
  assert.equal(ackUpdate(kiosk, baseCommand, withAck()), true, '14 target kiosk ACK allowed');
  assert.equal(ackUpdate(otherKiosk, baseCommand, withAck()), false, '15 other kiosk ACK denied');
  assert.equal(ackUpdate(kiosk, baseCommand, withAck(baseCommand, { ...validAck, sessionId: 'wrong' })), false, '16 session mismatch denied');
  assert.equal(ackUpdate(kiosk, baseCommand, withAck(baseCommand, { ...validAck, requestId: 'wrong' })), false, '17 request mismatch denied');
  assert.equal(ackUpdate(kiosk, baseCommand, withAck(baseCommand, { ...validAck, action: 'disable' })), false, '18 action mismatch denied');
  assert.equal(ackUpdate(kiosk, baseCommand, withAck(baseCommand, validAck, { storeId: 'other' })), false, '19 non-ACK field denied');
  assert.equal(ackUpdate(kiosk, baseCommand, withAck(baseCommand, validAck, { requestedBy: 'forged' })), false, '20 requester change denied');
  assert.equal(ackUpdate(kiosk, baseCommand, withAck(baseCommand, validAck, { expiresAt: now + 20000 })), false, '21 expiresAt change denied');
  assert.equal(ackUpdate(kiosk, baseCommand, withAck(baseCommand, validAck, { targetSessionId: 'other' })), false, '22 target session change denied');
});

test('kiosk authentication accepts only matching custom claims', async () => {
  const makeFirebase = claims => ({
    auth: Object.assign(() => ({
      currentUser: {
        uid: 'kiosk-principal',
        getIdTokenResult: async () => ({ claims })
      },
      signOut: async () => {}
    }), {})
  });
  await assert.doesNotReject(authenticate({ firebase: makeFirebase(kiosk.token), storeId: STORE, kioskId: KIOSK }));
  await assert.rejects(authenticate({ firebase: makeFirebase(otherKiosk.token), storeId: STORE, kioskId: KIOSK }), /KIOSK_IDENTITY_MISMATCH/);
});
