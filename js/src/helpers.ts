/**
 * Helpers that do not need a client: webhook signatures and CSV.
 */

/**
 * Checks the `X-Alion-Signature` header Alion puts on every webhook against the raw request body and the secret:
 * - an account webhook (https://alion.io/developers/webhooks): `t=<unix seconds>,v1=<hex>`, HMAC-SHA256 of
 *   `"<t>.<raw body>"` with the address's secret (`whsec_...`); a timestamp more than `toleranceSec` (300) off fails;
 * - an agent webhook (set_webhook, a watch with deliver=webhook): `sha256=<hex>`, HMAC-SHA256 of the body.
 *
 * ```ts
 * const ok = await verifyWebhook(rawBody, req.headers['x-alion-signature'], process.env.ALION_WEBHOOK_SECRET);
 * ```
 */
export async function verifyWebhook(
    body: string | Uint8Array,
    signature: string | null | undefined,
    secret: string,
    options: VerifyWebhookOptions = {},
): Promise<boolean> {
    if (!signature || !secret) return false;
    const enc = new TextEncoder();
    const raw = typeof body === 'string' ? enc.encode(body) : body;
    const header = signature.trim();
    // the account webhooks (/developers/webhooks): t=<unix seconds>,v1=<hex HMAC of "<t>.<body>">
    if (/^t=\d+,/.test(header)) {
        const parts = new Map<string, string[]>();
        for (const p of header.split(',')) {
            const i = p.indexOf('=');
            if (i > 0) parts.set(p.slice(0, i).trim(), [...(parts.get(p.slice(0, i).trim()) ?? []), p.slice(i + 1).trim()]);
        }
        const t = Number(parts.get('t')?.[0] ?? 0);
        const now = options.now ?? Math.floor(Date.now() / 1000);
        if (!t || Math.abs(now - t) > (options.toleranceSec ?? 300)) return false;
        const signed = new Uint8Array(enc.encode(t + '.').length + raw.length);
        signed.set(enc.encode(t + '.'));
        signed.set(raw, enc.encode(t + '.').length);
        const got = await hmacHex(secret, signed);
        return (parts.get('v1') ?? []).some((v) => sameHex(v.toLowerCase(), got));
    }
    // the agent webhooks (set_webhook, watch_search deliver=webhook): sha256=<hex HMAC of the body>
    const want = header.replace(/^sha256=/i, '').toLowerCase();
    return sameHex(want, await hmacHex(secret, raw));
}

/** Options of {@link verifyWebhook} for the account webhooks' timestamped signature. */
export interface VerifyWebhookOptions {
    /** How far the request's timestamp may be from now, in seconds (a replayed request is older). Defaults to 300. */
    toleranceSec?: number;
    /** "Now" in unix seconds (tests). */
    now?: number;
}

async function hmacHex(secret: string, data: Uint8Array): Promise<string> {
    const subtle = await webSubtle();
    const key = await subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await subtle.sign('HMAC', key, data as unknown as ArrayBuffer));
    return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

// (constant time over equal lengths)
function sameHex(want: string, got: string): boolean {
    if (!/^[0-9a-f]{64}$/.test(want) || want.length !== got.length) return false;
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
    return diff === 0;
}

async function webSubtle(): Promise<SubtleCrypto> {
    const g = (globalThis as { crypto?: Crypto }).crypto;
    if (g?.subtle) return g.subtle;
    // (Node 18 without the global: the same WebCrypto from node:crypto)
    const mod = (await import('node:crypto' as string)) as { webcrypto: Crypto };
    return mod.webcrypto.subtle;
}

/**
 * Rows (a search's `items`, an events page, a batch) as CSV text. Nested objects become dotted columns
 * (`hq.country`), arrays are joined with "; ". Pass `columns` to pick and order them.
 */
export function toCSV(rows: ReadonlyArray<Record<string, unknown>>, columns?: string[]): string {
    const flat = rows.map((r) => flatten(r));
    const cols = columns ?? Array.from(flat.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>()));
    const cell = (v: unknown): string => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [cols.map(cell).join(','), ...flat.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

/** One row as a flat object: nested keys dotted, arrays of scalars joined, arrays of objects as JSON. */
export function flatten(row: Record<string, unknown>, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
    for (const [k, v] of Object.entries(row || {})) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out);
        else if (Array.isArray(v)) out[key] = v.every((x) => x === null || typeof x !== 'object') ? v.join('; ') : JSON.stringify(v);
        else out[key] = v;
    }
    return out;
}
