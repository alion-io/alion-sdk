/**
 * Alion's company and job data as tools for the Vercel AI SDK (`ai` 5 and later).
 *
 * ```ts
 * import { generateText, stepCountIs } from 'ai';
 * import { alionTools } from '@alion-io/sdk/ai-sdk';
 *
 * const { text } = await generateText({
 *   model: 'anthropic/claude-sonnet-5-5',
 *   tools: alionTools(),                   // no key: the free tools; ALION_API_KEY: all of them
 *   stopWhen: stepCountIs(5),
 *   prompt: 'Which fintech startups in Germany raised money this month, and are they hiring?',
 * });
 * ```
 */
import { jsonSchema, tool } from 'ai';
import type { Tool } from 'ai';
import { Alion } from './client.js';
import type { AlionOptions } from './client.js';
import { AlionError } from './errors.js';
import { AGENT_TOOLS } from './agent-tools.generated.js';

export interface AlionToolsOptions extends AlionOptions {
    /** A client to reuse (its key, budget and app name); otherwise one is made from the options. */
    client?: Alion;
    /** Only these tools (by Alion name: "search_companies", "get_company_money"...). Default: every tool the key allows. */
    include?: string[];
    /** Tool name prefix in the model's tool list. Default "alion_". */
    prefix?: string;
}

/** The names of the tools {@link alionTools} can give. */
export const ALION_AGENT_TOOLS: ReadonlyArray<string> = AGENT_TOOLS.map((t) => t.name);

/**
 * The tools for `generateText` / `streamText` / agents: company search and profiles, lookalikes, the money ledger, owners,
 * the public record, company events, public contracts, investors, job postings and market statistics. Without a key only
 * the tools free on Alion's open address are given. A refusal (no key, a limit, a bad argument) comes back to the model as
 * `{ error, message, hint }` instead of throwing, so it can recover.
 */
export function alionTools(options: AlionToolsOptions = {}): Record<string, Tool> {
    const client = options.client ?? new Alion({ ...options, appName: options.appName ?? 'alion-ai-sdk' });
    const prefix = options.prefix ?? 'alion_';
    const out: Record<string, Tool> = {};
    for (const t of AGENT_TOOLS) {
        if (options.include ? !options.include.includes(t.name) : !client.apiKey && !t.free) continue;
        out[prefix + t.name] = tool({
            description: t.description,
            inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
            execute: async (input: unknown) => {
                try {
                    return await client.call(t.name, (input || {}) as Record<string, unknown>);
                } catch (e) {
                    if (e instanceof AlionError) return { error: e.code, message: e.message, hint: e.hint ?? null };
                    throw e;
                }
            },
        } as unknown as Parameters<typeof tool>[0]) as unknown as Tool;
    }
    return out;
}
