// Live tests against https://alion.io without a key (the open address and its free allowance).
// npm run test:live
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Alion, AlionError } from '../dist/esm/index.js';

const alion = new Alion({ apiKey: null, appName: 'alion-sdk-tests' });

test('resolveCompany: a domain resolves to its company', async () => {
    const r = await alion.resolveCompany({ query: 'stripe.com' });
    assert.equal(r.match?.domain, 'stripe.com');
    assert.equal(r.match?.name, 'Stripe');
});

test('searchCompanies: compact rows with a cursor', async () => {
    const r = await alion.searchCompanies({ query: 'stripe', limit: 2 });
    assert.ok(Array.isArray(r.items) && r.items.length > 0);
    assert.ok(r.items.some((c) => c.domain === 'stripe.com'));
    assert.equal(r.meta?.tier, 'open');
});

test('getCompany without a key: a clear account_required error', async () => {
    await assert.rejects(alion.getCompany({ domain: 'stripe.com' }), (e) => {
        assert.ok(e instanceof AlionError);
        assert.equal(e.code, 'account_required');
        assert.equal(e.needsAccount, true);
        return true;
    });
});

test('paginate: search_jobs rows across pages', async () => {
    const rows = [];
    for await (const job of alion.paginate('search_jobs', { query: 'engineer', limit: 2 }, { maxItems: 3 })) rows.push(job);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((j) => j.id && j.title));
});

test('listTools: the open address lists its tools', async () => {
    const tools = await alion.listTools();
    assert.ok(tools.length >= 10);
    assert.ok(tools.some((t) => t.name === 'search_companies'));
});
