#!/usr/bin/env node
// @alion-io/mcp (command alion-mcp): the Alion MCP server for clients that start a local command (stdio).
//
// It relays every JSON-RPC message from stdin to the hosted server and writes its answers to stdout, one per line.
// The hosted server is stateless (no session, no stream), so a relay this thin is the whole server: new tools on
// alion.io reach you without updating this package.
//
//   npx -y @alion-io/mcp                    free open address (https://alion.io/mcp/open), no account
//   ALION_API_KEY=... npx -y @alion-io/mcp  everything your account allows (https://alion.io/mcp)
//
// Options (or environment variables):
//   --api-key <key>   ALION_API_KEY    key from https://alion.io/developers/keys
//   --scope <name>    ALION_MCP_SCOPE  a narrower tool set without a key: jobs, companies or people
//   --url <url>       ALION_MCP_URL    another endpoint (overrides the two above)
//   --timeout <s>     ALION_TIMEOUT    seconds per request, default 120
//   --version, --help
//
// Logs go to stderr only; stdout carries nothing but protocol messages.

'use strict';

const { createInterface } = require('node:readline');
const VERSION = require('../package.json').version;

function arg(name) {
    const i = process.argv.indexOf(name);
    if (i !== -1 && i + 1 < process.argv.length) return process.argv[i + 1];
    const eq = process.argv.find((a) => a.startsWith(name + '='));
    return eq ? eq.slice(name.length + 1) : undefined;
}

if (process.argv.includes('--version') || process.argv.includes('-v')) {
    process.stdout.write(VERSION + '\n');
    process.exit(0);
}
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(
        [
            `alion-mcp ${VERSION} - the Alion MCP server over stdio`,
            '',
            'Usage: npx -y @alion-io/mcp [--api-key KEY] [--scope jobs|companies|people] [--url URL] [--timeout SECONDS]',
            '',
            'Without a key: the free open address (compact company and job searches, job postings, people, agent tools).',
            'With a key (https://alion.io/developers/keys): full company and investor profiles, statistics, everything.',
            'Docs: https://alion.io/developers',
            '',
        ].join('\n'),
    );
    process.exit(0);
}

const apiKey = arg('--api-key') || process.env.ALION_API_KEY || '';
const scope = (arg('--scope') || process.env.ALION_MCP_SCOPE || '').toLowerCase();
const base = (process.env.ALION_BASE_URL || 'https://alion.io').replace(/\/+$/, '');
if (scope && !['jobs', 'companies', 'people', 'open'].includes(scope)) {
    process.stderr.write(`alion-mcp: unknown --scope "${scope}" (jobs, companies or people)\n`);
    process.exit(2);
}
const url = arg('--url') || process.env.ALION_MCP_URL || (apiKey ? `${base}/mcp${scope && scope !== 'open' ? '/' + scope : ''}` : `${base}/mcp/${scope || 'open'}`);
const timeoutMs = Math.max(1, Number(arg('--timeout') || process.env.ALION_TIMEOUT || 120)) * 1000;

if (typeof fetch !== 'function') {
    process.stderr.write('alion-mcp: Node 18 or newer is required (global fetch).\n');
    process.exit(1);
}

const log = (msg) => process.stderr.write(`alion-mcp: ${msg}\n`);
log(`relaying to ${url}${apiKey ? ' with an API key' : ' (no key: the free open address)'}`);

let protocolVersion = '';
// the app on the other end of stdin, from its initialize (clientInfo): it goes into the User-Agent beside ours, so the
// hosted server's journal tells Claude Desktop from Zed from a test run
let clientName = '';
let pending = 0;
let closing = false;
const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

function errorFor(msg, code, message, data) {
    // (only requests get an answer; a failed notification is just logged)
    if (msg && msg.id !== undefined && msg.id !== null && typeof msg.method === 'string') out({ jsonrpc: '2.0', id: msg.id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
    else log(message);
}

async function relay(line) {
    let msg;
    try {
        msg = JSON.parse(line);
    } catch {
        out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: a line on stdin is not JSON.' } });
        return;
    }
    // (responses from the client to server requests: the hosted server sends none, so there is nothing to relay)
    const messages = Array.isArray(msg) ? msg : [msg];
    if (messages.every((m) => m && m.method === undefined)) return;
    for (const m of messages) {
        const ci = m && m.method === 'initialize' && m.params && m.params.clientInfo;
        if (ci && typeof ci.name === 'string' && ci.name) clientName = `${ci.name}/${ci.version || ''}`.replace(/[^\w.@/+-]+/g, '-').replace(/\/$/, '').slice(0, 48);
    }

    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'User-Agent': `alion-mcp/${VERSION} node/${process.versions.node}` + (clientName ? ` ${clientName}` : ''),
    };
    if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    let text;
    try {
        res = await fetch(url, { method: 'POST', headers, body: line, signal: ctrl.signal });
        text = await res.text();
    } catch (e) {
        const why = ctrl.signal.aborted ? `no answer from ${url} in ${timeoutMs / 1000} s` : `cannot reach ${url}: ${e && e.message ? e.message : e}`;
        for (const m of messages) errorFor(m, -32000, why);
        return;
    } finally {
        clearTimeout(timer);
    }

    if (res.status === 202 || !text.trim()) return; // a notification was accepted

    // (an SSE answer: every data line is a message)
    let payloads;
    if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
        payloads = text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
    } else payloads = [text];

    for (const p of payloads) {
        let data;
        try {
            data = JSON.parse(p);
        } catch {
            for (const m of messages) errorFor(m, -32000, `HTTP ${res.status} from ${url}: not a JSON answer`, p.slice(0, 300));
            continue;
        }
        // an HTTP error with a JSON-RPC error body but no id (401 with a bad key, 400 ...): give each request its own id
        const list = Array.isArray(data) ? data : [data];
        for (const d of list) {
            if (d && d.jsonrpc && (d.id === null || d.id === undefined) && d.error) {
                if (res.status === 401) d.error.message += apiKey ? '' : ' (or run without --url to use the free open address)';
                for (const m of messages) errorFor(m, d.error.code, d.error.message, d.error.data);
                continue;
            }
            if (d && d.jsonrpc) {
                if (d.result && typeof d.result.protocolVersion === 'string') protocolVersion = d.result.protocolVersion;
                out(d);
                continue;
            }
            // a non JSON-RPC error body (e.g. {"error":"rate_limited","message":...})
            const message = (d && (d.message || d.error)) || `HTTP ${res.status}`;
            for (const m of messages) errorFor(m, -32000, String(message), d);
        }
    }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
    if (!line.trim()) return;
    pending++;
    relay(line)
        .catch((e) => log(`unexpected: ${e && e.stack ? e.stack : e}`))
        .finally(() => {
            pending--;
            if (closing && pending === 0) process.exit(0);
        });
});
rl.on('close', () => {
    closing = true;
    if (pending === 0) process.exit(0);
});
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
