// The Vercel AI SDK adapter (@alion-io/sdk/ai-sdk): tools by key, a call and a refusal handed back to the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Alion } from '../dist/esm/index.js';
import { alionTools, ALION_AGENT_TOOLS } from '../dist/esm/ai-sdk.js';

const answer = (structured, isError = false) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { isError, structuredContent: structured, content: [] } }), { headers: { 'content-type': 'application/json' } });

test('free tools without a key, all of them with one', () => {
    const free = Object.keys(alionTools({ apiKey: null }));
    assert.ok(free.includes('alion_search_companies') && !free.includes('alion_get_company'));
    assert.equal(Object.keys(alionTools({ apiKey: 'k' })).length, ALION_AGENT_TOOLS.length);
});

test('a call, and a refusal the model can read', async () => {
    const queue = [answer({ match: { name: 'Stripe' } }), answer({ error: 'account_required', message: 'get_company is paid' }, true)];
    const client = new Alion({ apiKey: null, fetch: async () => queue.shift() });
    const tools = alionTools({ client, include: ['resolve_company', 'get_company'] });
    const ctx = { toolCallId: '1', messages: [] };
    assert.equal((await tools.alion_resolve_company.execute({ domain: 'stripe.com' }, ctx)).match.name, 'Stripe');
    const refused = await tools.alion_get_company.execute({ domain: 'stripe.com' }, ctx);
    assert.equal(refused.error, 'account_required');
    assert.match(refused.hint, /developers\/keys/);
});
