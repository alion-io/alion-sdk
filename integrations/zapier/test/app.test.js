'use strict';

// The Zapier app through zapier-platform-core's own tester: the auth test, a REST hook subscribed, a signed delivery taken, a
// forged one dropped, the samples, the unsubscribe, the job order dropdown and an action's refusal. Against a running Alion:
//   ALION_BASE=http://127.0.0.1:8099 ALION_TEST_KEY=alion_... npm test
// Without them only the offline checks run.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zapier = require('zapier-platform-core');
const App = require('../index');
const { verify, flatten } = require('../lib/api');

const appTester = zapier.createAppTester(App);
const KEY = process.env.ALION_TEST_KEY;
const live = Boolean(process.env.ALION_BASE && KEY);
const sign = (raw, secret, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;

test('the app: every live event is a REST hook trigger, actions and a search', () => {
  const keys = Object.keys(App.triggers);
  for (const k of ['candidate_replied', 'candidate_consented', 'candidate_consent_revoked', 'candidate_erased', 'shortlist_candidate_added', 'order_new_matches', 'role_became_hard', 'window_opened'])
    assert.ok(keys.includes(k) && App.triggers[k].operation.type === 'hook', k);
  assert.ok(App.creates.add_to_shortlist && App.creates.move_on_shortlist && App.searches.find_person);
});

test('signature and flatten', () => {
  const raw = '{"id":"evt_1"}';
  assert.equal(verify(raw, sign(raw, 's1'), 's1'), true);
  assert.equal(verify(raw, sign(raw, 's2'), 's1'), false);
  assert.equal(verify(raw, sign(raw, 's1', 1000), 's1'), false);
  assert.deepEqual(flatten({ id: 'evt_1', event: 'a.b', created: 'x', data: { k: 1 } }), { id: 'evt_1', event: 'a.b', created: 'x', test: false, k: 1 });
});

test('against Alion: auth, subscribe, deliveries, samples, unsubscribe, dropdown, a refusal', { skip: !live }, async () => {
  const authData = { api_key: KEY };
  await appTester(App.authentication.test, { authData });
  await assert.rejects(appTester(App.authentication.test, { authData: { api_key: 'alion_wrong' } }), /refused|key/i);

  const t = App.triggers.shortlist_candidate_added.operation;
  const sub = await appTester(t.performSubscribe, { authData, targetUrl: `https://example.com/zap-${Date.now()}` });
  assert.ok(sub.id > 0 && String(sub.secret).startsWith('whsec_') && sub.source === 'zapier');

  const env = { id: 'evt_z', event: 'shortlist.candidate_added', created: '2026-11-23T12:00:00Z', data: { source: 'applied', person: { person_id: 'p_3f9a1c2e7b6d4a80' } } };
  const raw = JSON.stringify(env);
  const ok = await appTester(t.perform, { authData, subscribeData: sub, cleanedRequest: env, rawRequest: { content: raw, headers: { 'Http-X-Alion-Signature': sign(raw, sub.secret) } } });
  assert.equal(ok.length, 1);
  assert.equal(ok[0].source, 'applied');
  const forged = await appTester(t.perform, { authData, subscribeData: sub, cleanedRequest: env, rawRequest: { content: raw, headers: { 'Http-X-Alion-Signature': sign(raw, 'whsec_x') } } });
  assert.equal(forged.length, 0);

  const samples = await appTester(t.performList, { authData });
  assert.ok(samples.length >= 1 && samples[0].event === 'shortlist.candidate_added');

  const gone = await appTester(t.performUnsubscribe, { authData, subscribeData: sub });
  assert.equal(gone.deleted, true);

  const orders = await appTester(App.triggers.job_order.operation.perform, { authData });
  assert.ok(Array.isArray(orders));
  await assert.rejects(appTester(App.creates.add_to_shortlist.operation.perform, { authData, inputData: { order_id: 1, person: 'nobody-here' } }), /yours|not found|vacancy/i);
  const none = await appTester(App.searches.find_person.operation.perform, { authData, inputData: { person: 'no-such-person-zz' } });
  assert.deepEqual(none, []);
});
