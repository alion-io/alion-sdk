// The relay against https://alion.io/mcp/open, driven by the official MCP SDK client over stdio.
// npm run test:live
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const BIN = fileURLToPath(new URL('../bin/alion-mcp.js', import.meta.url));

test('an MCP client connects, lists tools and calls one', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [BIN], env: { ...process.env, ALION_API_KEY: '' }, stderr: 'pipe' });
    const client = new Client({ name: 'alion-mcp-live-test', version: '1.0.0' });
    await client.connect(transport);
    try {
        const info = client.getServerVersion();
        assert.match(info?.name || '', /^alion/);
        const { tools } = await client.listTools();
        assert.ok(tools.some((t) => t.name === 'search_companies'));
        const r = await client.callTool({ name: 'resolve_company', arguments: { domain: 'stripe.com' } });
        assert.ok(!r.isError);
        assert.equal(r.structuredContent?.match?.name, 'Stripe');
        const prompts = await client.listPrompts().catch(() => ({ prompts: [] }));
        assert.ok(Array.isArray(prompts.prompts));
    } finally {
        await client.close();
    }
});
