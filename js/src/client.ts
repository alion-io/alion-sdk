import { AlionTools, PAGED_TOOLS, READ_ONLY_TOOLS } from './tools.generated.js';
import type { CallOptions, PagedToolName, ToolMap, ToolName } from './tools.generated.js';
import { AlionError } from './errors.js';
import { VERSION } from './version.js';

/** The protocol revision this client speaks (the server also accepts older ones). */
export const PROTOCOL_VERSION = '2025-11-25';

export interface AlionOptions {
    /**
     * An API key from https://alion.io/developers/keys. Defaults to the ALION_API_KEY environment variable.
     * Without a key the client uses the open address (https://alion.io/mcp/open): compact searches, job
     * postings, people tools and the agent tools are free within a daily allowance per network.
     */
    apiKey?: string | null;
    /** Defaults to https://alion.io. */
    baseUrl?: string;
    /** A fetch implementation (defaults to the global one: Node 18+, Deno, Bun, browsers, edge runtimes). */
    fetch?: typeof fetch;
    /** Per-call timeout in milliseconds. Defaults to 60 000. */
    timeoutMs?: number;
    /** Retries after a rate limit, a network error or (for read-only tools) a server error. Defaults to 2. */
    maxRetries?: number;
    /** Appended to the User-Agent, e.g. "my-agent/1.2". Lets Alion tell your agent apart in its logs. */
    appName?: string;
    /** Extra headers sent with every call (e.g. x402 or Web Bot Auth headers). */
    headers?: Record<string, string>;
    /**
     * A spending cap for this client, in credits (1 credit = $0.10). Once the calls it made have cost this much, the next
     * call throws AlionError "budget_exceeded" instead of running. `creditsSpent` tells where you are.
     */
    maxCredits?: number;
}

/** One company of {@link Alion.enrichCompanies}: what you asked for, then the card and the slices. */
export interface EnrichedCompany {
    query: string;
    id: number;
    name: string;
    domain: string | null;
    url: string;
    [field: string]: unknown;
}

/** What {@link Alion.enrichCompanies} returns. */
export interface EnrichResult {
    items: EnrichedCompany[];
    /** The domains, names or ids that matched no company (not charged). */
    not_found: string[];
    /** Credits the batch cost (1 credit = $0.10). */
    credits_charged: number;
}

interface RpcResponse {
    jsonrpc?: string;
    id?: number | string | null;
    result?: { content?: Array<{ type: string; text?: string }>; structuredContent?: unknown; isError?: boolean; [k: string]: unknown };
    error?: { code: number; message: string; data?: unknown };
}

const env = (name: string): string | undefined => {
    try {
        const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
        return p?.env?.[name] || undefined;
    } catch {
        return undefined;
    }
};

const sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
        const t = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason ?? new Error('aborted')); }, { once: true });
    });

/**
 * The Alion client: every tool of the Alion MCP server as a typed method.
 *
 * ```ts
 * import { Alion } from '@alion-io/sdk';
 * const alion = new Alion();                       // no key: the free open address
 * const { items } = await alion.searchCompanies({ industry: 'Fintech', country: 'DE', startup: true, limit: 10 });
 * ```
 */
export class Alion extends AlionTools {
    readonly apiKey: string | null;
    readonly baseUrl: string;
    readonly endpoint: string;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    private readonly fetchImpl: typeof fetch;
    private readonly userAgent: string;
    private readonly extraHeaders: Record<string, string>;
    private nextId = 1;
    readonly maxCredits: number | null;
    /** Credits this client has spent so far (from each answer's meta.credits_charged). */
    creditsSpent = 0;

    constructor(options: AlionOptions = {}) {
        super();
        this.apiKey = options.apiKey === null ? null : options.apiKey || env('ALION_API_KEY') || null;
        this.baseUrl = (options.baseUrl || env('ALION_BASE_URL') || 'https://alion.io').replace(/\/+$/, '');
        this.endpoint = this.baseUrl + (this.apiKey ? '/mcp' : '/mcp/open');
        this.timeoutMs = options.timeoutMs ?? 60_000;
        this.maxRetries = Math.max(0, options.maxRetries ?? 2);
        const f = options.fetch || (globalThis.fetch as typeof fetch | undefined);
        if (!f) throw new Error('alion: no fetch available. Use Node 18+ or pass options.fetch.');
        this.fetchImpl = f.bind(globalThis);
        // (" ci" in a pipeline: Alion counts people, not test runs - yours or ours)
        this.userAgent = `alion-js/${VERSION}` + (options.appName ? ` ${options.appName}` : '') + (env('CI') && env('CI') !== 'false' ? ' ci' : '');
        this.maxCredits = typeof options.maxCredits === 'number' && options.maxCredits >= 0 ? options.maxCredits : null;
        this.extraHeaders = { ...(options.headers || {}) };
    }

    /** Calls a tool by name. The typed methods (searchCompanies, getCompany, ...) are shortcuts for this. */
    async call<N extends ToolName>(name: N, args?: ToolMap[N]['args'], options?: CallOptions): Promise<ToolMap[N]['result']>;
    async call(name: string, args?: Record<string, unknown>, options?: CallOptions): Promise<unknown>;
    async call(name: string, args: Record<string, unknown> = {}, options: CallOptions = {}): Promise<unknown> {
        this.checkBudget(name);
        const res = await this.rpc('tools/call', { name, arguments: stripUndefined(args) }, options, READ_ONLY_TOOLS.has(name));
        const result = res.result || {};
        const payload = result.structuredContent ?? parseText(result.content);
        if (result.isError) throw AlionError.fromToolError(name, payload);
        this.count(payload);
        return payload;
    }

    /**
     * Enriches many companies at once (a CRM column, a spreadsheet): domains, names or ids, each answered with its card
     * and the slices asked for, in batches of 100 (25 with the offices or visa slice). Needs an API key; the ones not found
     * cost nothing. Prices: https://alion.io/developers/pricing
     *
     * ```ts
     * const { items, not_found } = await alion.enrichCompanies(['stripe.com', 'adyen.com'], { slices: 'funding,hiring' });
     * ```
     */
    async enrichCompanies(companies: string[], options: CallOptions & { slices?: string | string[] } = {}): Promise<EnrichResult> {
        if (!this.apiKey) throw new AlionError('enrichCompanies needs an API key: create one at https://alion.io/developers/keys', { code: 'account_required' });
        const slices = Array.isArray(options.slices) ? options.slices.join(',') : options.slices || '';
        const size = /(^|,)\s*(offices|visa|all|standard)\s*(,|$)/.test(slices) ? 25 : 100;
        const list = Array.from(new Set(companies.map((c) => String(c).trim()).filter(Boolean)));
        const out: EnrichResult = { items: [], not_found: [], credits_charged: 0 };
        for (let i = 0; i < list.length; i += size) {
            this.checkBudget('company.getBatch');
            const res = (await this.rest('company.getBatch', { domains: list.slice(i, i + size), ...(slices ? { slices } : {}) }, options)) as {
                items?: EnrichedCompany[]; not_found?: string[]; meta?: { credits_charged?: number };
            };
            out.items.push(...(res.items || []));
            out.not_found.push(...(res.not_found || []));
            out.credits_charged += Number(res.meta?.credits_charged || 0);
            this.count(res);
        }
        return out;
    }

    /**
     * Follows the company event feed (rounds, new offices, leadership hires, Buying windows...): yields each new event once,
     * polling every `intervalMs` (default 15 minutes) until `signal` aborts. Each event costs $0.005 with a key.
     *
     * ```ts
     * for await (const e of alion.events({ type: 'funding_round', country: 'DE' })) console.log(e.date, e.company.name, e.detail);
     * ```
     */
    async *events(
        args: Record<string, unknown> = {},
        options: CallOptions & { intervalMs?: number; follow?: boolean } = {},
    ): AsyncGenerator<Record<string, unknown>, void, undefined> {
        const seen = new Set<string>();
        let since = (args.since as string | undefined) || '24h';
        const follow = options.follow ?? true;
        for (;;) {
            const started = new Date();
            let cursor: string | undefined;
            const fresh: Array<Record<string, unknown>> = [];
            do {
                const page = (await this.call('search_company_events', { ...args, since, limit: 50, ...(cursor ? { cursor } : {}) }, options)) as {
                    items?: Array<Record<string, unknown>>; next_cursor?: string | null;
                };
                for (const e of page.items || []) if (!seen.has(String(e.id))) { seen.add(String(e.id)); fresh.push(e); }
                cursor = page.next_cursor || undefined;
            } while (cursor);
            // (oldest first: a consumer sees the feed in the order it happened)
            for (const e of fresh.reverse()) yield e;
            if (!follow) return;
            if (seen.size > 5000) { const keep = Array.from(seen).slice(-2000); seen.clear(); keep.forEach((k) => seen.add(k)); }
            // (the next read starts a little before this one began: an event dated late is not lost, the seen set drops repeats)
            since = new Date(started.getTime() - 10 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
            await sleep(options.intervalMs ?? 15 * 60_000, options.signal);
        }
    }

    private checkBudget(what: string): void {
        if (this.maxCredits !== null && this.creditsSpent >= this.maxCredits)
            throw new AlionError(`alion: maxCredits (${this.maxCredits}) reached after ${this.creditsSpent.toFixed(3)} credits; ${what} was not called`, { code: 'budget_exceeded' });
    }

    private count(payload: unknown): void {
        const c = (payload as { meta?: { credits_charged?: unknown } } | null)?.meta?.credits_charged;
        if (typeof c === 'number' && Number.isFinite(c)) this.creditsSpent += c;
    }

    /** A call of the REST API (https://alion.io/api/<route>, key only): the response object, or an AlionError. */
    private async rest(route: string, body: Record<string, unknown>, options: CallOptions): Promise<unknown> {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(new AlionError(`alion: ${route} timed out`, { code: 'timeout' })), options.timeoutMs ?? this.timeoutMs);
        try {
            const r = await this.fetchImpl(`${this.baseUrl}/api/${route}`, {
                method: 'POST', signal: ctrl.signal,
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': this.userAgent, Authorization: `Bearer ${this.apiKey}`, ...this.extraHeaders },
                body: JSON.stringify(body),
            });
            const data = parseBody(await r.text(), r.headers.get('content-type') || '') as { success?: boolean; response?: unknown; error?: { error_code?: number; error_msg?: string; error_data?: unknown } };
            if (data && typeof data === 'object' && data.success === true) return data.response;
            const e = data && typeof data === 'object' ? data.error : undefined;
            const code = r.status === 402 || e?.error_code === 9 ? 'insufficient_credits' : r.status === 429 || e?.error_code === 7 ? 'rate_limited' : r.status === 401 ? 'unauthorized' : `http_${r.status}`;
            throw new AlionError(`${route}: ${e?.error_msg || `HTTP ${r.status}`}`, { code, status: r.status, data: e?.error_data ?? data });
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Walks every page of a search, yielding one row at a time.
     *
     * ```ts
     * for await (const job of alion.paginate('search_jobs', { role: 'Data Engineer', country: 'PL' })) { ... }
     * ```
     * Searches stop at row 100 on the server; maxItems stops earlier.
     */
    async *paginate<N extends PagedToolName>(
        name: N,
        args: ToolMap[N]['args'] = {} as ToolMap[N]['args'],
        options: CallOptions & { maxItems?: number } = {},
    ): AsyncGenerator<NonNullable<ToolMap[N]['result']['items']>[number], void, undefined> {
        if (!PAGED_TOOLS.includes(name)) throw new TypeError(`alion: ${name} does not page`);
        let cursor: string | undefined;
        let seen = 0;
        const max = options.maxItems ?? Infinity;
        for (;;) {
            const page = (await this.call(name, { ...(args as object), ...(cursor ? { cursor } : {}) } as ToolMap[N]['args'], options)) as {
                items?: unknown[];
                next_cursor?: string | null;
                has_more?: boolean;
            };
            for (const item of page.items || []) {
                yield item as NonNullable<ToolMap[N]['result']['items']>[number];
                if (++seen >= max) return;
            }
            if (!page.next_cursor || page.has_more === false || !(page.items || []).length) return;
            cursor = page.next_cursor;
        }
    }

    /** The tools this address offers, with their input and output schemas. */
    async listTools(options: CallOptions = {}): Promise<Array<{ name: string; title?: string; description?: string; inputSchema: unknown; outputSchema?: unknown; annotations?: Record<string, unknown> }>> {
        const tools: Array<{ name: string; inputSchema: unknown }> = [];
        let cursor: string | undefined;
        do {
            const res = await this.rpc('tools/list', cursor ? { cursor } : {}, options, true);
            const r = (res.result || {}) as { tools?: Array<{ name: string; inputSchema: unknown }>; nextCursor?: string };
            tools.push(...(r.tools || []));
            cursor = r.nextCursor || undefined;
        } while (cursor);
        return tools;
    }

    private async rpc(method: string, params: Record<string, unknown>, options: CallOptions, retryOnServerError: boolean): Promise<RpcResponse> {
        const id = this.nextId++;
        const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'User-Agent': this.userAgent,
            ...this.extraHeaders,
        };
        if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
        const timeoutMs = options.timeoutMs ?? this.timeoutMs;

        for (let attempt = 0; ; attempt++) {
            const ctrl = new AbortController();
            const onAbort = () => ctrl.abort(options.signal?.reason);
            options.signal?.addEventListener('abort', onAbort, { once: true });
            const timer = setTimeout(() => ctrl.abort(new AlionError(`alion: ${method} timed out after ${timeoutMs} ms`, { code: 'timeout' })), timeoutMs);
            let response: Response;
            try {
                response = await this.fetchImpl(this.endpoint, { method: 'POST', headers, body, signal: ctrl.signal });
            } catch (e) {
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', onAbort);
                if (options.signal?.aborted) throw e;
                if (e instanceof AlionError) throw e;
                if (attempt < this.maxRetries) { await sleep(backoff(attempt), options.signal); continue; }
                throw new AlionError(`alion: network error calling ${this.endpoint}: ${(e as Error)?.message || e}`, { code: 'network_error', cause: e });
            }
            let text: string;
            try {
                text = await response.text();
            } finally {
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', onAbort);
            }
            const retryable = response.status === 429 || (retryOnServerError && response.status >= 500);
            if (retryable && attempt < this.maxRetries) {
                await sleep(retryAfter(response) ?? backoff(attempt), options.signal);
                continue;
            }
            const data = parseBody(text, response.headers.get('content-type') || '');
            if (!response.ok) throw AlionError.fromHttp(response.status, data, response.headers);
            if (!data || typeof data !== 'object') throw new AlionError(`alion: unreadable answer from ${this.endpoint} (HTTP ${response.status})`, { code: 'bad_response', status: response.status });
            const rpc = data as RpcResponse;
            if (rpc.error) throw AlionError.fromRpc(rpc.error);
            return rpc;
        }
    }
}

function stripUndefined(args: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args || {})) if (v !== undefined) out[k] = v;
    return out;
}

function parseText(content: Array<{ type: string; text?: string }> | undefined): unknown {
    const text = (content || []).find((c) => c.type === 'text')?.text;
    if (text === undefined) return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function parseBody(text: string, contentType: string): unknown {
    if (!text) return undefined;
    // (an SSE answer: the last data line carries the JSON-RPC response)
    if (contentType.includes('text/event-stream')) {
        const lines = text.split(/\r?\n/).filter((l) => l.startsWith('data:'));
        text = lines.length ? lines[lines.length - 1].slice(5).trim() : '';
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function backoff(attempt: number): number {
    return Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

function retryAfter(res: Response): number | undefined {
    const h = res.headers.get('retry-after');
    if (!h) return undefined;
    const s = Number(h);
    if (Number.isFinite(s)) return Math.min(60_000, Math.max(0, s * 1000));
    const at = Date.parse(h);
    return Number.isFinite(at) ? Math.min(60_000, Math.max(0, at - Date.now())) : undefined;
}
