// Offline tests: a fake fetch stands in for the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Alion, AlionError, VERSION, PAGED_TOOLS } from '../dist/esm/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function fake(answers) {
    const calls = [];
    const fn = async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        const a = answers.shift();
        if (a instanceof Error) throw a;
        const { status = 200, body, headers = {} } = typeof a === 'function' ? a(calls[calls.length - 1]) : a;
        return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
    };
    fn.calls = calls;
    return fn;
}

const ok = (structured) => ({ body: { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured } } });

test('VERSION matches package.json', () => {
    assert.equal(VERSION, pkg.version);
});

test('CommonJS build loads', () => {
    const require = createRequire(import.meta.url);
    const cjs = require('../dist/cjs/index.js');
    assert.equal(typeof cjs.Alion, 'function');
    assert.equal(cjs.VERSION, pkg.version);
});

test('no key -> the open address, with a key -> /mcp and a bearer', async () => {
    const f1 = fake([ok({ items: [] })]);
    await new Alion({ apiKey: null, fetch: f1 }).searchCompanies({ query: 'acme' });
    assert.equal(f1.calls[0].url, 'https://alion.io/mcp/open');
    assert.equal(f1.calls[0].init.headers.Authorization, undefined);

    const f2 = fake([ok({ items: [] })]);
    await new Alion({ apiKey: 'k_123', fetch: f2, baseUrl: 'https://example.test/' }).searchCompanies();
    assert.equal(f2.calls[0].url, 'https://example.test/mcp');
    assert.equal(f2.calls[0].init.headers.Authorization, 'Bearer k_123');
});

test('a call is one JSON-RPC tools/call with the tool arguments, undefined dropped', async () => {
    const f = fake([ok({ items: [{ id: 1 }], has_more: false })]);
    const alion = new Alion({ apiKey: null, fetch: f, appName: 'my-agent/2.0' });
    const res = await alion.searchCompanies({ industry: 'Fintech', country: undefined, limit: 5 });
    assert.deepEqual(res, { items: [{ id: 1 }], has_more: false });
    const { body, init } = f.calls[0];
    assert.equal(body.jsonrpc, '2.0');
    assert.equal(body.method, 'tools/call');
    assert.deepEqual(body.params, { name: 'search_companies', arguments: { industry: 'Fintech', limit: 5 } });
    assert.equal(init.headers['User-Agent'], `alion-js/${VERSION} my-agent/2.0`);
    assert.ok(init.headers['MCP-Protocol-Version']);
});

test('the text content is parsed when there is no structuredContent', async () => {
    const f = fake([{ body: { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"a":1}' }] } } }]);
    assert.deepEqual(await new Alion({ apiKey: null, fetch: f }).call('get_job', { id: 1 }), { a: 1 });
});

test('a tool refusal becomes an AlionError with the server code', async () => {
    const payload = { error: 'account_required', message: 'get_company is paid.', free_tools: ['search_jobs'] };
    const f = fake([{ body: { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: true } } }]);
    await assert.rejects(new Alion({ apiKey: null, fetch: f }).getCompany({ domain: 'stripe.com' }), (e) => {
        assert.ok(e instanceof AlionError);
        assert.equal(e.code, 'account_required');
        assert.equal(e.tool, 'get_company');
        assert.equal(e.needsAccount, true);
        assert.deepEqual(e.data.free_tools, ['search_jobs']);
        return true;
    });
});

test('HTTP 401 with a JSON-RPC error body -> unauthorized', async () => {
    const f = fake([{ status: 401, body: { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Invalid, expired or revoked token.' } } }]);
    await assert.rejects(new Alion({ apiKey: 'bad', fetch: f }).searchJobs(), (e) => e.code === 'unauthorized' && e.status === 401 && /revoked/.test(e.message));
});

test('429 is retried after Retry-After, then succeeds', async () => {
    const f = fake([{ status: 429, body: { error: 'rate_limited', message: 'slow down' }, headers: { 'retry-after': '0' } }, ok({ items: [] })]);
    const res = await new Alion({ apiKey: null, fetch: f }).searchJobs();
    assert.deepEqual(res, { items: [] });
    assert.equal(f.calls.length, 2);
});

test('429 past the retries -> rate_limited error', async () => {
    const r = { status: 429, body: { error: 'rate_limited', message: 'slow down' }, headers: { 'retry-after': '0' } };
    const f = fake([r, r]);
    await assert.rejects(new Alion({ apiKey: null, fetch: f, maxRetries: 1 }).searchJobs(), (e) => e.code === 'rate_limited' && e.status === 429);
});

test('a 500 is retried for a read-only tool, not for a writing one', async () => {
    const e500 = { status: 500, body: { error: 'internal_error', message: 'oops' } };
    const f1 = fake([e500, ok({ items: [] })]);
    await new Alion({ apiKey: null, fetch: f1 }).searchCompanies();
    assert.equal(f1.calls.length, 2);

    const f2 = fake([e500, ok({ status: 'sent' })]);
    await assert.rejects(new Alion({ apiKey: null, fetch: f2 }).sendMessage({ person: 'x', text: 'hi' }), (e) => e.status === 500);
    assert.equal(f2.calls.length, 1);
});

test('a network error is retried and then reported', async () => {
    const f = fake([new TypeError('fetch failed'), new TypeError('fetch failed')]);
    await assert.rejects(new Alion({ apiKey: null, fetch: f, maxRetries: 1 }).searchJobs(), (e) => e.code === 'network_error');
    assert.equal(f.calls.length, 2);
});

test('paginate follows next_cursor and stops at maxItems', async () => {
    const f = fake([
        ok({ items: [{ id: 1 }, { id: 2 }], has_more: true, next_cursor: 'c2' }),
        ok({ items: [{ id: 3 }], has_more: false, next_cursor: null }),
    ]);
    const ids = [];
    for await (const row of new Alion({ apiKey: null, fetch: f }).paginate('search_jobs', { role: 'x' })) ids.push(row.id);
    assert.deepEqual(ids, [1, 2, 3]);
    assert.equal(f.calls[1].body.params.arguments.cursor, 'c2');
    assert.equal(f.calls[1].body.params.arguments.role, 'x');

    const g = fake([ok({ items: [{ id: 1 }, { id: 2 }], has_more: true, next_cursor: 'c2' })]);
    const few = [];
    for await (const row of new Alion({ apiKey: null, fetch: g }).paginate('search_jobs', {}, { maxItems: 1 })) few.push(row.id);
    assert.deepEqual(few, [1]);
    assert.ok(PAGED_TOOLS.includes('search_companies'));
});

test('an SSE answer is read too', async () => {
    const sse = `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { structuredContent: { ok: true } } })}\n\n`;
    const f = async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    assert.deepEqual(await new Alion({ apiKey: null, fetch: f }).agentStatus(), { ok: true });
});

test('timeout -> AlionError timeout', async () => {
    const f = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    await assert.rejects(new Alion({ apiKey: null, fetch: f, timeoutMs: 30, maxRetries: 0 }).searchJobs(), (e) => e.code === 'timeout');
});
