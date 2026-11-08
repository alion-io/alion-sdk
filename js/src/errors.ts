/**
 * Every failure of a call: a refusal by a tool (code from the server, e.g. "account_required", "rate_limited",
 * "invalid_params"), an HTTP error, a JSON-RPC error, a timeout or a network error.
 *
 * ```ts
 * try { await alion.getCompany({ company: 'stripe.com' }); }
 * catch (e) { if (e instanceof AlionError && e.code === 'account_required') ... }
 * ```
 */
export class AlionError extends Error {
    /** A machine-readable code: the server's error code, or timeout / network_error / http_<status> / rpc_<code>. */
    readonly code: string;
    /** The HTTP status, when the server answered with an error status. */
    readonly status?: number;
    /** The tool that refused, for a tool error. */
    readonly tool?: string;
    /** The whole error payload from the server (hints, free_tools, examples, ...). */
    readonly data?: unknown;
    /** Seconds to wait before retrying, when the server said so. */
    readonly retryAfter?: number;

    constructor(message: string, init: { code: string; status?: number; tool?: string; data?: unknown; retryAfter?: number; cause?: unknown }) {
        super(message, init.cause !== undefined ? { cause: init.cause } : undefined);
        this.name = 'AlionError';
        this.code = init.code;
        this.status = init.status;
        this.tool = init.tool;
        this.data = init.data;
        this.retryAfter = init.retryAfter;
    }

    /** True when the call needs an API key (or an x402 payment): the tool is not free on the open address. */
    get needsAccount(): boolean {
        return ['account_required', 'payment_required', 'auth_required', 'unauthorized', 'http_401', 'http_402'].includes(this.code);
    }

    /** @internal */
    static fromToolError(tool: string, payload: unknown): AlionError {
        const p = (payload && typeof payload === 'object' ? payload : { message: String(payload ?? '') }) as Record<string, unknown>;
        const code = typeof p.error === 'string' ? p.error : typeof p.code === 'string' ? p.code : 'tool_error';
        const msg = typeof p.message === 'string' ? p.message : typeof p.error === 'string' ? p.error : `${tool} failed`;
        const ra = typeof p.retry_after === 'number' ? p.retry_after : undefined;
        return new AlionError(`${tool}: ${msg}`, { code, tool, data: payload, retryAfter: ra });
    }

    /** @internal */
    static fromRpc(err: { code: number; message: string; data?: unknown }): AlionError {
        return new AlionError(err.message || `JSON-RPC error ${err.code}`, { code: `rpc_${err.code}`, data: err.data ?? err });
    }

    /** @internal */
    static fromHttp(status: number, data: unknown, headers: Headers): AlionError {
        const ra = Number(headers.get('retry-after'));
        const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined;
        if (data && typeof data === 'object') {
            const d = data as Record<string, unknown>;
            const rpc = d.error && typeof d.error === 'object' ? (d.error as { code?: number; message?: string; data?: unknown }) : null;
            if (rpc) return new AlionError(rpc.message || `HTTP ${status}`, { code: codeFor(status, rpc.code), status, data: rpc.data ?? d, retryAfter });
            const code = typeof d.error === 'string' ? d.error : `http_${status}`;
            const msg = typeof d.message === 'string' ? d.message : typeof d.detail === 'string' ? d.detail : `HTTP ${status}`;
            return new AlionError(msg, { code, status, data, retryAfter });
        }
        const text = typeof data === 'string' && data.length < 300 ? `: ${data}` : '';
        return new AlionError(`HTTP ${status}${text}`, { code: `http_${status}`, status, data, retryAfter });
    }
}

function codeFor(status: number, rpcCode?: number): string {
    if (status === 401) return 'unauthorized';
    if (status === 402) return 'payment_required';
    if (status === 429) return 'rate_limited';
    return rpcCode !== undefined ? `rpc_${rpcCode}` : `http_${status}`;
}
