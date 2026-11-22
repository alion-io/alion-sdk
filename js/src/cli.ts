#!/usr/bin/env node
/**
 * The Alion command line: company and job data in one command, no code.
 *
 *   npx @alion-io/sdk company stripe.com
 *   npx @alion-io/sdk companies --industry Fintech --country DE --startup
 *   npx @alion-io/sdk events --type funding_round --country DE --since 7d --format csv > rounds.csv
 *
 * Free without a key for searches; set ALION_API_KEY for full profiles, money, owners, events and contracts.
 */
import { Alion } from './client.js';
import { AlionError } from './errors.js';
import { flatten, toCSV } from './helpers.js';
import { VERSION } from './version.js';

// (the few Node globals the command line uses: the library itself stays runtime-neutral, no @types/node)
declare const process: { argv: string[]; stdout: { isTTY?: boolean; write(s: string): boolean }; stderr: { write(s: string): boolean }; exit(code: number): never };

type Flags = Record<string, string | boolean>;

const HELP = `alion ${VERSION} - company and job data from https://alion.io

Usage: alion <command> [argument] [--flag value ...] [--format table|json|csv]

Free without a key:
  resolve <domain|name|lei:...>     which company it is
  companies [--industry --country --size --technology --startup --funding_stage --list ...]
  similar <domain>                  lookalike companies (--mode competitors)
  jobs [--query --role --country --work_mode --salary_min_usd ...]
  market --role <role> [--country]  pay percentiles, demand, top employers

With ALION_API_KEY (prices: https://alion.io/developers/pricing):
  company <domain> [--slices summary|money,ownership,...]
  money <domain> [--direction in|out --kind equity]
  owners <domain>                   legal entities, group, owners, subsidiaries
  record <domain>                   court cases, regulators, insolvency (counterparty check)
  events [--type funding_round --country DE --since 7d]
  contracts [--company <domain> | --buyer <domain> | --ending_within 90d | --country DE]
  enrich <domain> <domain> ... [--slices funding,hiring]

Any tool:
  call <tool> [--arg value ...]     e.g. alion call get_index --index ai-hiring
  tools                             every tool with its description

Options: --key <api key> (or ALION_API_KEY), --limit <n>, --all (every page), --format, --app <name>
Docs: https://alion.io/developers/docs`;

function parse(argv: string[]): { cmd: string; pos: string[]; flags: Flags } {
    const pos: string[] = [];
    const flags: Flags = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const [k, v] = a.slice(2).split('=', 2);
            if (v !== undefined) flags[k] = v;
            else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
            else flags[k] = true;
        } else pos.push(a);
    }
    return { cmd: pos.shift() || 'help', pos, flags };
}

// flags to tool arguments: numbers and booleans typed, our own options left out
function toolArgs(flags: Flags): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(flags)) {
        if (['key', 'format', 'all', 'app', 'help'].includes(k)) continue;
        out[k] = v === true ? true : v === 'true' ? true : v === 'false' ? false : /^-?\d+$/.test(String(v)) && !['country', 'query', 'since'].includes(k) ? Number(v) : v;
    }
    return out;
}

function table(rows: Array<Record<string, unknown>>): string {
    if (!rows.length) return '(nothing found)';
    const flat = rows.map((r) => flatten(r));
    const prefer = ['date', 'type', 'name', 'company.name', 'domain', 'company.domain', 'title', 'industry', 'size_band', 'size', 'hq_country', 'country', 'open_jobs', 'founded_year',
        'salary', 'kind', 'direction', 'stage', 'counterparty', 'amount_usd', 'status', 'value_usd', 'url'];
    const keys = new Set(flat.flatMap((r) => Object.keys(r)));
    let cols = prefer.filter((c) => keys.has(c));
    if (cols.length < 3) cols = Array.from(keys).filter((k) => flat.some((r) => r[k] !== null && r[k] !== undefined && String(r[k]).length < 60)).slice(0, 6);
    cols = cols.slice(0, 7);
    const cut = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return s.length > 42 ? s.slice(0, 40) + '...' : s; };
    const width = cols.map((c) => Math.max(c.length, ...flat.map((r) => cut(r[c]).length)));
    const line = (vals: string[]) => vals.map((v, i) => v.padEnd(width[i])).join('  ').trimEnd();
    return [line(cols), line(width.map((w) => '-'.repeat(w))), ...flat.map((r) => line(cols.map((c) => cut(r[c]))))].join('\n');
}

function print(result: unknown, format: string): void {
    const rows = Array.isArray(result) ? result : (result as { items?: unknown[] })?.items;
    if (format === 'json') { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return; }
    if (format === 'csv') { process.stdout.write(toCSV((rows as Array<Record<string, unknown>>) || [flatten(result as Record<string, unknown>)])); return; }
    if (Array.isArray(rows)) { process.stdout.write(table(rows as Array<Record<string, unknown>>) + '\n'); return; }
    // (one object: its scalar fields as "key: value", the rest as compact JSON)
    const flat = flatten((result || {}) as Record<string, unknown>);
    const keys = Object.keys(flat).filter((k) => !k.startsWith('meta.') && !k.startsWith('cite.') && flat[k] !== null && flat[k] !== '');
    const w = Math.min(36, Math.max(...keys.map((k) => k.length)));
    process.stdout.write(keys.slice(0, 80).map((k) => `${k.padEnd(w)}  ${String(flat[k]).slice(0, 140)}`).join('\n') + (keys.length > 80 ? `\n... ${keys.length - 80} more (use --format json)` : '') + '\n');
}

async function main(): Promise<number> {
    const { cmd, pos, flags } = parse(process.argv.slice(2));
    if (cmd === 'help' || flags.help || cmd === '--help' || cmd === '-h') { console.log(HELP); return 0; }
    if (cmd === 'version' || cmd === '--version') { console.log(VERSION); return 0; }
    const alion = new Alion({ apiKey: typeof flags.key === 'string' ? flags.key : undefined, appName: `alion-cli/${VERSION}` + (typeof flags.app === 'string' ? ` ${flags.app}` : '') });
    const format = typeof flags.format === 'string' ? flags.format : process.stdout.isTTY ? 'table' : 'json';
    const args = toolArgs(flags);
    const one = pos[0];
    const need = (what: string) => { if (!one) throw new AlionError(`${cmd} needs ${what}, e.g. alion ${cmd} stripe.com`, { code: 'invalid_params' }); return one; };
    const page = async (tool: string, a: Record<string, unknown>) => {
        if (!flags.all) return alion.call(tool, a);
        const items: unknown[] = [];
        for await (const row of alion.paginate(tool as never, a as never)) items.push(row);
        return { items };
    };
    let result: unknown;
    switch (cmd) {
        case 'resolve': {
            const v = need('a domain, a name or an identifier');
            result = await alion.call('resolve_company', /^[a-z_]+:/i.test(v) || /^\d{6,}$/.test(v) ? { identifier: v } : v.includes('.') ? { domain: v } : { name: v });
            break;
        }
        case 'company':
            if (!alion.apiKey) {
                // (no key: what is free - the company and which slices hold data, with their prices)
                result = await alion.call('resolve_company', { query: need('a domain') });
                process.stderr.write('No API key: showing the free match. Set ALION_API_KEY for the full profile (https://alion.io/developers/keys).\n');
            } else result = await alion.call('get_company', { domain: need('a domain'), ...args });
            break;
        case 'companies': result = await page('search_companies', { detail: 'compact', ...args }); break;
        case 'similar': result = await alion.call('similar_companies', { company: need('a domain'), detail: 'compact', ...args }); break;
        case 'jobs': result = await page('search_jobs', { detail: 'compact', ...args }); break;
        case 'market': result = await alion.call('market_stats', args); break;
        case 'money': result = await alion.call('get_company_money', { company: need('a domain'), ...args }); break;
        case 'owners': result = await alion.call('get_company_ownership', { company: need('a domain'), ...args }); break;
        case 'record': result = await alion.call('get_company_record', { company: need('a domain'), ...args }); break;
        case 'events': result = await page('search_company_events', args); break;
        case 'contracts': result = await page('search_contracts', args); break;
        case 'enrich': {
            if (!pos.length) throw new AlionError('enrich needs domains, e.g. alion enrich stripe.com adyen.com', { code: 'invalid_params' });
            result = await alion.enrichCompanies(pos, { slices: typeof flags.slices === 'string' ? flags.slices : undefined });
            break;
        }
        case 'call': result = await alion.call(need('a tool name'), args); break;
        case 'tools': result = (await alion.listTools()).map((t) => ({ name: t.name, title: t.title, description: (t.description || '').split('. ')[0] })); break;
        default:
            console.error(`Unknown command "${cmd}".\n\n${HELP}`);
            return 2;
    }
    print(result, format);
    if (alion.creditsSpent > 0) process.stderr.write(`credits spent: ${alion.creditsSpent.toFixed(3)} ($${(alion.creditsSpent / 10).toFixed(4)})\n`);
    return 0;
}

main().then((code) => process.exit(code), (e: unknown) => {
    if (e instanceof AlionError) {
        console.error(`error (${e.code}): ${e.message}`);
        if (e.hint) console.error(e.hint);
    } else console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});
