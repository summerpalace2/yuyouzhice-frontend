import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../../app-core/state.js';
import { invalidateAuthentication } from '../../app-core/workspace-lifecycle.js';
import { restoreDraftBackup } from './save-service.js';
import { removeStop } from '../trip-replan/replan-service.js';
import { planView } from '../../pages/plan-page.js';
import { loadUserPlan, saveUserPlan } from '../../app-core/user-store.js';

function setup() {
  invalidateAuthentication();
  const storage = new Map(), calls = [];
  globalThis.window = { localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
  }, setTimeout: () => 1, clearTimeout() {} };
  globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  Object.assign(state, { user: { id: 'owner' }, csrfToken: 'fixture', savedTripId: 'formal-a',
    sessionId: 'current-session', sessionAccessToken: 'capability',
    trip: { title: '云端行程', subtitle: '原稿', version: 1, sourceTripVersion: 1,
      constraints: {}, days: [{ day: 1, stops: [{ id: 'a' }, { id: 'b' }] }] },
    draftBackupAvailable: true, draftBackupFailed: false, draftRestorePending: false,
    chatMessages: [], tripChatHistories: {}, selectedStopIds: new Set(), view: 'planning' });
  storage.set('draft_conflict_backup_owner_formal-a', JSON.stringify({ plan: {
    savedTripId: 'formal-a', sessionId: 'old-unavailable-session',
    trip: { version: 2, sourceTripVersion: 1, days: [{ day: 1, stops: [{ id: 'a' }] }] }
  } }));
  return { storage, calls };
}

test('backup control is visible and restoring uses the current server session for the next mutation', async () => {
  const { storage, calls } = setup();
  const html = planView();
  assert.match(html, /data-action="restore-draft-backup"/);
  assert.match(html, /data-action="discard-draft-backup"/);
  globalThis.fetch = async (path, options) => {
    const body = JSON.parse(options.body);
    calls.push({ path, body });
    if (path.endsWith('/draft/restore')) return { ok: true, status: 200, json: async () => ({
      sessionId: 'current-session', trip: { title: '本地草稿', version: 2, sourceTripVersion: 1,
        days: [{ day: 1, stops: [{ id: 'a' }] }] } }) };
    assert.equal(body.sessionId, 'current-session');
    assert.equal(body.expectedVersion, 2);
    return { ok: true, status: 200, json: async () => ({ trip: {
      title: '本地草稿', version: 3, sourceTripVersion: 1, days: [{ day: 1, stops: [] }] } }) };
  };
  assert.equal(await restoreDraftBackup('formal-a'), true);
  assert.equal(calls[0].body.sessionId, 'current-session');
  assert.equal(calls[0].body.expectedVersion, 1);
  assert.deepEqual(calls[0].body.trip.days[0].stops.map(x => x.id), ['a']);
  assert.equal(storage.has('draft_conflict_backup_owner_formal-a'), false);
  await removeStop('a');
  assert.equal(calls.length, 2);
  assert.deepEqual(state.trip.days[0].stops, []);
});

test('server conflict retains the backup and current visible trip', async () => {
  const { storage } = setup();
  globalThis.fetch = async () => ({ ok: false, status: 409,
    json: async () => ({ message: '正式行程已更新，请先查看最新版本。' }) });
  assert.equal(await restoreDraftBackup('formal-a'), false);
  assert.equal(state.trip.version, 1);
  assert.deepEqual(state.trip.days[0].stops.map(x => x.id), ['a', 'b']);
  assert.equal(storage.has('draft_conflict_backup_owner_formal-a'), true);
  assert.equal(state.draftBackupAvailable, true);
});

test('failed backup keeps the original active plan even after opening another trip', () => {
  setup();
  saveUserPlan('owner', { savedTripId: 'formal-a', sessionId: 'old-session',
    trip: { version: 2, days: [{ day: 1, stops: [{ id: 'a' }] }] } });
  state.draftBackupFailed = true;
  state.draftBackupFailedTripId = 'formal-a';
  state.savedTripId = 'formal-b';
  saveUserPlan('owner', { savedTripId: 'formal-b', sessionId: 'new-session', trip: state.trip });
  assert.equal(loadUserPlan('owner').savedTripId, 'formal-a');
  assert.match(planView(), /data-action="retry-draft-backup" data-id="formal-a"/);
});
