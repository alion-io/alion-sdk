// The relay against a local fake server: framing, notifications, errors without ids, headers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/alion-mcp.js', import.meta.url));

function fakeServer(handler) {
    return new Promise((resolve) => {
        const seen = [];
        const srv = createServer((req, res) => {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                seen.push({ url: req.url, headers: req.headers, body });
                handler(JSON.parse(body), req, res);
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve({ srv, seen, url: `http://127.0.0.1:${srv.address().port}` }));
    });
}

function run(env, lines, args = []) {
    return new Promise((resolve, reject) => {
        const p = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, ALION_API_KEY: '', ...env } });
        let out = '';
        let err = '';
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', (d) => (err += d));
        p.on('error', reject);
        p.on('close', (code) => resolve({ code, out: out.split('\n').filter(Boolean).map((l) => JSON.parse(l)), err }));
        for (const l of lines) p.stdin.write(l + '\n');
        p.stdin.end();
    });
}

const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

test('relays requests, skips notifications, keeps ids; open address without a key', async () => {
    const { srv, seen, url } = await fakeServer((msg, req, res) => {
        if (msg.method === 'notifications/initialized') { res.writeHead(202); return res.end(); }
        if (msg.method === 'initialize') return json(res, 200, { jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'alion', version: 'x' } } });
        return json(res, 200, { jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'search_jobs' }] } });
    });
    try {
        const r = await run({ ALION_BASE_URL: url }, [
            JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } }),
        ]);
        assert.equal(r.code, 0);
        assert.equal(r.out.length, 1);
        assert.equal(r.out[0].id, 1);
        assert.equal(seen[0].url, '/mcp/open');
        assert.equal(seen[0].headers.authorization, undefined);
        assert.match(seen[0].headers['user-agent'], /^alion-mcp\/\S+ node\/\S+ t\/1$/, 'the client app is named after ours');

        const r2 = await run({ ALION_BASE_URL: url, ALION_API_KEY: 'k_1' }, [
            JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
            JSON.stringify({ jsonrpc: '2.0', id: 'b', method: 'tools/list' }),
        ]);
        assert.equal(r2.out.length, 1, 'the notification gets no line');
        assert.equal(r2.out[0].id, 'b');
        assert.equal(seen[seen.length - 1].url, '/mcp');
        assert.equal(seen[seen.length - 1].headers.authorization, 'Bearer k_1');
    } finally {
        srv.close();
    }
});

test('an HTTP error without an id answers the request with its own id', async () => {
    const { srv, url } = await fakeServer((msg, req, res) => json(res, 401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Invalid, expired or revoked token.' } }));
    try {
        const r = await run({ ALION_BASE_URL: url, ALION_API_KEY: 'bad' }, [JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' })]);
        assert.equal(r.out.length, 1);
        assert.equal(r.out[0].id, 7);
        assert.equal(r.out[0].error.code, -32001);
    } finally {
        srv.close();
    }
});

test('a non JSON-RPC error body and an unreachable server become JSON-RPC errors', async () => {
    const { srv, url } = await fakeServer((msg, req, res) => json(res, 429, { error: 'rate_limited', message: 'Too many calls' }));
    try {
        const r = await run({ ALION_BASE_URL: url }, [JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_jobs', arguments: {} } })]);
        assert.equal(r.out[0].id, 3);
        assert.match(r.out[0].error.message, /Too many calls/);
    } finally {
        srv.close();
    }
    const r2 = await run({ ALION_MCP_URL: 'http://127.0.0.1:1/mcp' }, [JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' })]);
    assert.equal(r2.out[0].id, 4);
    assert.match(r2.out[0].error.message, /cannot reach/);
});

test('bad JSON on stdin -> parse error; stdout carries only JSON', async () => {
    const r = await run({ ALION_MCP_URL: 'http://127.0.0.1:1/mcp' }, ['not json']);
    assert.equal(r.out[0].error.code, -32700);
    assert.match(r.err, /relaying to/);
});

test('--scope picks the narrow address; --version prints the version', async () => {
    const { srv, seen, url } = await fakeServer((msg, req, res) => json(res, 200, { jsonrpc: '2.0', id: msg.id, result: {} }));
    try {
        await run({ ALION_BASE_URL: url }, [JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })], ['--scope', 'companies']);
        assert.equal(seen[0].url, '/mcp/companies');
    } finally {
        srv.close();
    }
    const v = await new Promise((resolve) => {
        const p = spawn(process.execPath, [BIN, '--version']);
        let o = '';
        p.stdout.on('data', (d) => (o += d));
        p.on('close', () => resolve(o.trim()));
    });
    assert.match(v, /^\d+\.\d+\.\d+/);
});
