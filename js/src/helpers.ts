/**
 * Helpers that do not need a client: webhook signatures and CSV.
 */

/**
 * Checks the signature Alion puts on every agent webhook (the `X-Alion-Signature: sha256=<hex>` header of a
 * `watch.events` or `message.*` delivery) against the raw request body and your webhook secret (from set_webhook).
 *
 * ```ts
 * const ok = await verifyWebhook(rawBody, req.headers['x-alion-signature'], process.env.ALION_WEBHOOK_SECRET);
 * ```
 */
export async function verifyWebhook(body: string | Uint8Array, signature: string | null | undefined, secret: string): Promise<boolean> {
    if (!signature || !secret) return false;
    const want = signature.trim().replace(/^sha256=/i, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(want)) return false;
    const subtle = await webSubtle();
    const enc = new TextEncoder();
    const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const data = typeof body === 'string' ? enc.encode(body) : body;
    const mac = new Uint8Array(await subtle.sign('HMAC', key, data as unknown as ArrayBuffer));
    const got = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
    // (constant time over equal lengths)
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
