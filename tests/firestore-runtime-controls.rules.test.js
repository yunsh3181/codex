const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} = require('firebase/firestore');

const STORE = 'pangyo2-techno-valley';
const KIOSK = 'mobile-01';
const OTHER_STORE = 'other-store';
const OTHER_KIOSK = 'mobile-02';
const SESSION = 'session-01';
const PROJECT_ID = 'runtime-controls-rules-test';
const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (!emulatorAvailable) {
  test('Firestore runtimeControls rules (run with npm run test:rules)', { skip: true }, () => {});
} else {
  let environment;

  test.before(async () => {
    environment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8')
      }
    });
  });

  test.beforeEach(async () => {
    await environment.clearFirestore();
  });

  test.after(async () => {
    await environment.cleanup();
  });

  const unauthenticatedDb = () => environment.unauthenticatedContext().firestore();
  const adminDb = () => environment.authenticatedContext('admin-01', { admin: true }).firestore();
  const userDb = () => environment.authenticatedContext('user-01', {}).firestore();
  const kioskDb = (storeId = STORE, kioskId = KIOSK) =>
    environment.authenticatedContext(`kiosk:${storeId}:${kioskId}`, {
      role: 'kiosk', storeId, kioskId
    }).firestore();
  const presenceRef = (db, storeId = STORE, kioskId = KIOSK) =>
    doc(db, 'runtimeControls', storeId, 'kiosks', kioskId);
  const commandRef = (db, storeId = STORE, kioskId = KIOSK) =>
    doc(db, 'runtimeControls', storeId, 'commands', kioskId);
  const presence = (overrides = {}) => ({
    storeId: STORE,
    kioskId: KIOSK,
    sessionId: SESSION,
    role: 'kiosk',
    heartbeatAt: serverTimestamp(),
    ...overrides
  });
  const command = (uid = 'admin-01', overrides = {}) => ({
    storeId: STORE,
    kioskId: KIOSK,
    targetSessionId: SESSION,
    action: 'enable',
    requestId: 'request-01',
    requestedBy: uid,
    requestedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
    ack: null,
    acknowledgedAt: null,
    ...overrides
  });

  async function seedPresence() {
    await environment.withSecurityRulesDisabled(context =>
      setDoc(presenceRef(context.firestore()), {
        storeId: STORE, kioskId: KIOSK, sessionId: SESSION, role: 'kiosk',
        heartbeatAt: Timestamp.now()
      })
    );
  }

  async function seedCommand() {
    await environment.withSecurityRulesDisabled(context =>
      setDoc(commandRef(context.firestore()), {
        storeId: STORE, kioskId: KIOSK, targetSessionId: SESSION,
        action: 'enable', requestId: 'request-01', requestedBy: 'admin-01',
        requestedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
        ack: null, acknowledgedAt: null
      })
    );
  }

  test('1. unauthenticated users cannot read or write runtimeControls', async () => {
    await assertFails(getDoc(presenceRef(unauthenticatedDb())));
    await assertFails(setDoc(presenceRef(unauthenticatedDb()), presence()));
  });

  test('2. admin=true can read presence', async () => {
    await seedPresence();
    await assertSucceeds(getDoc(presenceRef(adminDb())));
  });

  test('3. admin can create a test-mode command', async () => {
    await assertSucceeds(setDoc(commandRef(adminDb()), command()));
  });

  test('4-5. kiosk can create and heartbeat its own presence', async () => {
    const ref = presenceRef(kioskDb());
    await assertSucceeds(setDoc(ref, presence()));
    await assertSucceeds(updateDoc(ref, { heartbeatAt: serverTimestamp() }));
  });

  test('6. kiosk cannot write another kiosk path', async () => {
    await assertFails(setDoc(
      presenceRef(kioskDb(), STORE, OTHER_KIOSK),
      presence({ kioskId: OTHER_KIOSK })
    ));
  });

  test('7. kiosk cannot write another store path', async () => {
    await assertFails(setDoc(
      presenceRef(kioskDb(), OTHER_STORE, KIOSK),
      presence({ storeId: OTHER_STORE })
    ));
  });

  test('8. kiosk cannot modify administrator command fields', async () => {
    await seedCommand();
    await assertFails(updateDoc(commandRef(kioskDb()), { action: 'disable' }));
  });

  test('9. kiosk can read its own command', async () => {
    await seedCommand();
    await assertSucceeds(getDoc(commandRef(kioskDb())));
  });

  test('10. kiosk can write a matching ACK only', async () => {
    await seedCommand();
    await assertSucceeds(updateDoc(commandRef(kioskDb()), {
      ack: {
        requestId: 'request-01', kioskId: KIOSK, sessionId: SESSION,
        action: 'enable', applied: true, enabled: true
      },
      acknowledgedAt: serverTimestamp()
    }));
  });

  test('11. ordinary authenticated users cannot access runtimeControls', async () => {
    await assertFails(getDoc(presenceRef(userDb())));
    await assertFails(setDoc(commandRef(userDb()), command('user-01')));
  });

  test('12. malformed runtime IDs are denied', async () => {
    await assertFails(setDoc(
      presenceRef(kioskDb(STORE, 'invalid id'), STORE, 'invalid id'),
      presence({ kioskId: 'invalid id' })
    ));
    await assertFails(getDoc(presenceRef(adminDb(), STORE, 'invalid id')));
  });

  test('13. unapproved fields are denied', async () => {
    await assertFails(setDoc(presenceRef(kioskDb()), presence({ admin: true })));
  });

  test('14. only admins can delete runtime documents', async () => {
    await seedPresence();
    await assertFails(deleteDoc(presenceRef(kioskDb())));
    await assertSucceeds(deleteDoc(presenceRef(adminDb())));
    await seedCommand();
    await assertFails(deleteDoc(commandRef(kioskDb())));
    await assertSucceeds(deleteDoc(commandRef(adminDb())));
  });

  test('15. catch-all deny remains effective outside declared paths', async () => {
    await assertFails(getDoc(doc(adminDb(), 'notAllowed', 'document')));
    assert.match(
      fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      /match \/\{document=\*\*\} \{ allow read, write: if false; \}/
    );
  });
}
