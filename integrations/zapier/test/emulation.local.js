'use strict';

// A run of the Zapier app against https://alion.io through zapier-platform-core's own tester, as Zapier would run it: the
// connection test, the job order dropdown, a REST hook subscribed, a person added to the order (the real event is emitted and
// read back through performList, then taken by perform with its signature), moved, removed, found, the hook removed.
//   ALION_BASE=https://alion.io ALION_TEST_KEY=... ALION_TEST_ORDER=<job id> ALION_TEST_PERSON=<handle> node test/emulation.local.js
const crypto = require('node:crypto');
const zapier = require('zapier-platform-core');
const App = require('../index');

const appTester = zapier.createAppTester(App);
const authData = { api_key: process.env.ALION_TEST_KEY };
const ORDER = Number(process.env.ALION_TEST_ORDER);
const PERSON = process.env.ALION_TEST_PERSON;
const sign = (raw, secret, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
const ok = (cond, label, extra) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${extra !== undefined ? ' ' + JSON.stringify(extra) : ''}`); if (!cond) process.exitCode = 1; };

(async () => {
  // 1. connection
  const auth = await appTester(App.authentication.test, { authData });
  ok(Array.isArray(auth.items), 'connection test (webhook.list)');
  ok(App.authentication.connectionLabel({}, { authData }).startsWith('Alion key …'), 'connection label shows only the last 4');
  let refused = false;
  try { await appTester(App.authentication.test, { authData: { api_key: 'alion_wrong_key' } }); } catch (e) { refused = /refused|key/i.test(e.message); }
  ok(refused, 'a wrong key is refused with a clear message');

  // 2. dropdown
  const orders = await appTester(App.triggers.job_order.operation.perform, { authData });
  ok(orders.some((o) => o.id === ORDER), 'job order dropdown lists the test order', orders.map((o) => [o.id, o.status, o.title]));

  // 3. subscribe
  const t = App.triggers.shortlist_candidate_added.operation;
  const sub = await appTester(t.performSubscribe, { authData, targetUrl: `https://example.com/alion-zapier-emulation-${Date.now()}` });
  ok(sub.id > 0 && String(sub.secret).startsWith('whsec_') && sub.source === 'zapier', 'trigger subscribes (REST hook)', { id: sub.id, events: sub.events });

  try {
    // 4. add a person: the real event
    const added = await appTester(App.creates.add_to_shortlist.operation.perform, { authData, inputData: { order_id: String(ORDER), person: PERSON } });
    ok(added.added === true && added.stage === 'new' && /^p_/.test(added.person_id), 'Add Person to Shortlist', added);
    await new Promise((r) => setTimeout(r, 1500));
    const list = await appTester(t.performList, { authData });
    const real = list.find((i) => i.test !== true && i.order && i.order.id === ORDER);
    ok(Boolean(real) && real.source === 'sourced' && real.person && real.person.person_id === added.person_id, 'the real shortlist.candidate_added event reads back (performList)', real && { event: real.event, source: real.source, person: real.person.person_id, order: real.order.id });

    // 5. the delivery as Zapier receives it, signed with the subscription's secret
    const env = { id: real ? real.id : 'evt_x', event: 'shortlist.candidate_added', created: real ? real.created : '', data: real ? { order: real.order, person: real.person, source: real.source, stage: real.stage } : {} };
    const raw = JSON.stringify(env);
    const got = await appTester(t.perform, { authData, subscribeData: sub, cleanedRequest: env, rawRequest: { content: raw, headers: { 'Http-X-Alion-Signature': sign(raw, sub.secret) } } });
    ok(got.length === 1 && got[0].event === 'shortlist.candidate_added', 'a signed delivery becomes one Zap item');
    const forged = await appTester(t.perform, { authData, subscribeData: sub, cleanedRequest: env, rawRequest: { content: raw, headers: { 'Http-X-Alion-Signature': sign(raw, 'whsec_forged') } } });
    ok(forged.length === 0, 'a forged delivery is dropped');

    // 6. move, remove
    const moved = await appTester(App.creates.move_on_shortlist.operation.perform, { authData, inputData: { order_id: String(ORDER), person: PERSON, stage: 'interview' } });
    ok(moved.stage === 'interview' && moved.was === 'new', 'Move Person on Shortlist', moved);
    const removed = await appTester(App.creates.move_on_shortlist.operation.perform, { authData, inputData: { order_id: String(ORDER), person: PERSON, remove: 'true' } });
    ok(removed.removed === true, 'Remove Instead', removed);

    // 7. find
    const found = await appTester(App.searches.find_person.operation.perform, { authData, inputData: { person: PERSON } });
    ok(found.length === 1 && found[0].person === PERSON && /^p_/.test(found[0].id), 'Find Person', found[0] && { person: found[0].person, headline: found[0].headline });
    const none = await appTester(App.searches.find_person.operation.perform, { authData, inputData: { person: 'no-such-person-zzq' } });
    ok(Array.isArray(none) && none.length === 0, 'Find Person: nobody is an empty result, not an error');

    // 8. other triggers' samples
    for (const key of ['candidate_replied', 'order_new_matches', 'candidate_erased']) {
      const s = await appTester(App.triggers[key].operation.performList, { authData });
      ok(s.length >= 1 && s[0].event === key.replace('_', '.'), `${key}: sample for the Zap editor`);
    }
  } finally {
    const gone = await appTester(t.performUnsubscribe, { authData, subscribeData: sub });
    ok(gone.deleted === true, 'trigger unsubscribes');
  }
})().catch((e) => { console.log('FAIL', e.message); process.exitCode = 1; });
