#!/usr/bin/env node
// Regenerates the typed tool layer of every client from the live tool list.
//
//   node scripts/generate.mjs            fetch https://alion.io/mcp/tools, write schema/tools.json, regenerate
//   node scripts/generate.mjs --offline  regenerate from the schema/tools.json snapshot
//
// The server is the source of truth: a new tool or a new argument on alion.io reaches the packages by running this
// script and releasing. Nothing in the generated files is edited by hand.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.env.ALION_TOOLS_URL || 'https://alion.io/mcp/tools';
const SNAPSHOT = join(ROOT, 'schema', 'tools.json');

async function load() {
    if (process.argv.includes('--offline')) return JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    const res = await fetch(SOURCE, { headers: { Accept: 'application/json', 'User-Agent': 'alion-sdk-generator' } });
    if (!res.ok) throw new Error(`GET ${SOURCE} -> HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.tools) || !data.tools.length) throw new Error('the tool list is empty');
    mkdirSync(dirname(SNAPSHOT), { recursive: true });
    writeFileSync(SNAPSHOT, JSON.stringify(data, null, 2) + '\n');
    return data;
}

// names

const pascal = (s) => s.split(/[_\-\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const camel = (s) => { const p = pascal(s); return p[0].toLowerCase() + p.slice(1); };
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (k) => (IDENT.test(k) ? k : JSON.stringify(k));

// doc comments (one paragraph, no comment terminators inside)

function doc(text, indent) {
    if (!text) return '';
    const clean = String(text).replace(/\*\//g, '* /').replace(/\s+/g, ' ').trim();
    const words = clean.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
        if (line && (line + ' ' + w).length > 110) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w;
    }
    if (line) lines.push(line);
    if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;
    return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`).join('\n')}\n${indent} */\n`;
}

// JSON Schema -> TypeScript

function tsType(s, indent, optionalProps) {
    if (!s || typeof s !== 'object' || Object.keys(s).length === 0) return 'unknown';
    if (s.anyOf || s.oneOf) return [...new Set((s.anyOf || s.oneOf).map((x) => tsType(x, indent, optionalProps)))].join(' | ');
    if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
    const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
    if (!types.length) return s.properties ? objectType(s, indent, optionalProps) : 'unknown';
    const parts = types.map((t) => {
        switch (t) {
            case 'string': return 'string';
            case 'integer': case 'number': return 'number';
            case 'boolean': return 'boolean';
            case 'null': return 'null';
            case 'array': {
                const inner = s.items ? tsType(s.items, indent, optionalProps) : 'unknown';
                return /[|&\s{]/.test(inner) && !inner.startsWith('{') ? `Array<${inner}>` : `${inner}[]`;
            }
            case 'object': return objectType(s, indent, optionalProps);
            default: return 'unknown';
        }
    });
    return [...new Set(parts)].join(' | ');
}

function objectType(s, indent, optionalProps) {
    const props = s.properties || {};
    const names = Object.keys(props);
    const ap = s.additionalProperties;
    if (!names.length) {
        if (ap && typeof ap === 'object') return `Record<string, ${tsType(ap, indent, optionalProps)}>`;
        return 'Record<string, unknown>';
    }
    const req = new Set(s.required || []);
    const inner = indent + '    ';
    let out = '{\n';
    for (const n of names) {
        const p = props[n] || {};
        out += doc(p.description, inner);
        const opt = optionalProps || !req.has(n) ? '?' : '';
        out += `${inner}${key(n)}${opt}: ${tsType(p, inner, optionalProps)};\n`;
    }
    if (ap && typeof ap === 'object') out += `${inner}[key: string]: unknown;\n`;
    return out + indent + '}';
}

// JSON Schema -> Python (TypedDict, total=False for results; required keys kept in inputs via Required[])

function pyType(s, ctx, hint) {
    if (!s || typeof s !== 'object' || Object.keys(s).length === 0) return 'Any';
    if (s.anyOf || s.oneOf) return union((s.anyOf || s.oneOf).map((x, i) => pyType(x, ctx, hint + 'Variant' + (i + 1))));
    if (s.enum) return `Literal[${s.enum.map((v) => (v === null ? 'None' : JSON.stringify(v))).join(', ')}]`;
    const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
    if (!types.length) return s.properties ? pyObject(s, ctx, hint) : 'Any';
    return union(types.map((t) => {
        switch (t) {
            case 'string': return 'str';
            case 'integer': return 'int';
            case 'number': return 'float';
            case 'boolean': return 'bool';
            case 'null': return 'None';
            case 'array': return `List[${s.items ? pyType(s.items, ctx, hint + 'Item') : 'Any'}]`;
            case 'object': return pyObject(s, ctx, hint);
            default: return 'Any';
        }
    }));
}

function union(parts) {
    const u = [...new Set(parts)];
    if (u.length === 1) return u[0];
    const nonNull = u.filter((x) => x !== 'None');
    if (nonNull.length === 1 && u.includes('None')) return `Optional[${nonNull[0]}]`;
    return `Union[${u.join(', ')}]`;
}

function pyObject(s, ctx, name) {
    const props = s.properties || {};
    const names = Object.keys(props);
    if (!names.length) {
        const ap = s.additionalProperties;
        return ap && typeof ap === 'object' ? `Dict[str, ${pyType(ap, ctx, name + 'Value')}]` : 'Dict[str, Any]';
    }
    let cls = name;
    for (let i = 2; ctx.names.has(cls); i++) cls = name + i;
    ctx.names.add(cls);
    const req = new Set(ctx.input ? s.required || [] : []);
    const fields = names.map((n) => {
        const t = pyType(props[n] || {}, ctx, cls + pascal(n));
        return { n, t: req.has(n) ? `Required[${t}]` : t, d: (props[n] || {}).description };
    });
    const valid = fields.every((f) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(f.n) && !PY_KEYWORDS.has(f.n));
    let out;
    if (valid) {
        out = `class ${cls}(TypedDict, total=False):\n`;
        if (s.description) out += `    """${pyDoc(s.description)}"""\n\n`;
        for (const f of fields) {
            out += `    ${f.n}: ${f.t}\n`;
            if (f.d) out += `    """${pyDoc(f.d)}"""\n`;
        }
    } else {
        out = `${cls} = TypedDict(${JSON.stringify(cls)}, {${fields.map((f) => `${JSON.stringify(f.n)}: ${f.t}`).join(', ')}}, total=False)\n`;
    }
    ctx.blocks.push(out);
    return cls;
}

const PY_KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);
const pyDoc = (t) => String(t).replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"').replace(/\s+/g, ' ').trim();

// emitters

const HEADER = (src, server) => `This file is generated by scripts/generate.mjs from ${src} (server ${server.name} ${server.version}). Do not edit it by hand.`;

function emitTs(data) {
    const tools = data.tools;
    let out = `// ${HEADER(SOURCE, data.server)}\n\n/* eslint-disable */\n\n`;
    for (const t of tools) {
        const P = pascal(t.name);
        out += doc(`Arguments of ${t.name}: ${t.title || ''}`.trim(), '');
        const argsType = objectType(t.inputSchema || {}, '', false);
        out += argsType.startsWith('{') ? `export interface ${P}Args ${argsType}\n\n` : `export type ${P}Args = ${argsType};\n\n`;
        out += doc(`Result of ${t.name}.`, '');
        const res = t.outputSchema ? objectType(t.outputSchema, '', true) : '{\n    [key: string]: unknown;\n}';
        out += res.startsWith('{') ? `export interface ${P}Result ${res}\n\n` : `export type ${P}Result = ${res};\n\n`;
    }
    out += `/** Every tool the server lists. */\nexport type ToolName =\n${tools.map((t) => `    | ${JSON.stringify(t.name)}`).join('\n')};\n\n`;
    out += `/** Arguments and result types by tool name. */\nexport interface ToolMap {\n${tools.map((t) => `    ${t.name}: { args: ${pascal(t.name)}Args; result: ${pascal(t.name)}Result };`).join('\n')}\n}\n\n`;
    const paged = tools.filter((t) => t.outputSchema?.properties?.next_cursor && t.inputSchema?.properties?.cursor).map((t) => t.name);
    out += `/** Tools that page with next_cursor / cursor. */\nexport type PagedToolName = ${paged.map((n) => JSON.stringify(n)).join(' | ')};\n\n`;
    out += `export const PAGED_TOOLS: readonly PagedToolName[] = ${JSON.stringify(paged)};\n\n`;
    const ro = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    out += `/** Tools that only read: safe to retry after a server error. */\nexport const READ_ONLY_TOOLS: ReadonlySet<string> = new Set(${JSON.stringify(ro)});\n\n`;
    out += `/** The tool methods; Alion implements call(). */\nexport abstract class AlionTools {\n`;
    out += `    abstract call<N extends ToolName>(name: N, args?: ToolMap[N]['args'], options?: CallOptions): Promise<ToolMap[N]['result']>;\n\n`;
    for (const t of tools) {
        const P = pascal(t.name);
        const reqArgs = (t.inputSchema?.required || []).length > 0;
        out += doc(t.description, '    ');
        out += `    ${camel(t.name)}(args${reqArgs ? '' : '?'}: ${P}Args, options?: CallOptions): Promise<${P}Result> {\n        return this.call(${JSON.stringify(t.name)}, args ?? {}, options);\n    }\n\n`;
    }
    out = out.replace(/\n\n$/, '\n') + `}\n\n`;
    out += `/** Per-call options. */\nexport interface CallOptions {\n    /** Abort the call (and its retries). */\n    signal?: AbortSignal;\n    /** Override the client's timeout for this call, in milliseconds. */\n    timeoutMs?: number;\n}\n`;
    return out;
}

function emitPy(data) {
    const tools = data.tools;
    const blocks = [];
    const names = new Set();
    for (const t of tools) {
        const P = pascal(t.name);
        pyObject(t.inputSchema && Object.keys(t.inputSchema.properties || {}).length ? t.inputSchema : { properties: { _: {} } }, { names, blocks, input: true }, P + 'Args');
        if (t.outputSchema && Object.keys(t.outputSchema.properties || {}).length) pyObject(t.outputSchema, { names, blocks, input: false }, P + 'Result');
        else { names.add(P + 'Result'); blocks.push(`${P}Result = Dict[str, Any]\n`); }
    }
    let out = `# ${HEADER(SOURCE, data.server)}\n# fmt: off\n# ruff: noqa\n\nfrom __future__ import annotations\n\nimport sys\nfrom typing import Any, Dict, List, Optional, Union\n\nif sys.version_info >= (3, 11):\n    from typing import Literal, NotRequired, Required, TypedDict\nelse:\n    from typing_extensions import Literal, NotRequired, Required, TypedDict\n\n\n`;
    out += blocks.join('\n\n') + '\n\n';
    out += `TOOL_NAMES = ${pyList(tools.map((t) => t.name))}\n\n`;
    out += `PAGED_TOOLS = frozenset(${pyList(tools.filter((t) => t.outputSchema?.properties?.next_cursor && t.inputSchema?.properties?.cursor).map((t) => t.name))})\n\n`;
    out += `READ_ONLY_TOOLS = frozenset(${pyList(tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name))})\n\n`;
    out += `TOOLS = {\n${tools.map((t) => `    ${JSON.stringify(t.name)}: {"method": ${JSON.stringify(snake(t.name))}, "title": ${JSON.stringify(t.title || '')}, "required": ${pyList(t.inputSchema?.required || [])}},`).join('\n')}\n}\n`;
    return out;
}

const snake = (s) => s;
const pyList = (a) => `[${a.map((x) => JSON.stringify(x)).join(', ')}]`;

function emitPyMethods(data) {
    // the sync and async tool methods, as mixins over call() / acall()
    let sync = `# ${HEADER(SOURCE, data.server)}\n# fmt: off\n# ruff: noqa\n\nfrom __future__ import annotations\n\nfrom typing import Any, Optional, TYPE_CHECKING\n\nfrom . import _types as t\n\nif TYPE_CHECKING:\n    from typing_extensions import Unpack\n\n\nclass SyncTools:\n    def call(self, name: str, args: Optional[dict] = None, *, timeout: Optional[float] = None) -> Any:  # pragma: no cover\n        raise NotImplementedError\n\n`;
    let asyn = `class AsyncTools:\n    async def call(self, name: str, args: Optional[dict] = None, *, timeout: Optional[float] = None) -> Any:  # pragma: no cover\n        raise NotImplementedError\n\n`;
    for (const tool of data.tools) {
        const P = pascal(tool.name);
        const hasArgs = Object.keys(tool.inputSchema?.properties || {}).length > 0;
        const docText = pyDoc(tool.description || tool.title || tool.name);
        const sig = hasArgs ? `self, *, timeout: Optional[float] = None, **args: "Unpack[t.${P}Args]"` : `self, *, timeout: Optional[float] = None`;
        const pass = hasArgs ? 'dict(args)' : '{}';
        sync += `    def ${tool.name}(${sig}) -> "t.${P}Result":\n        """${docText}"""\n        return self.call(${JSON.stringify(tool.name)}, ${pass}, timeout=timeout)\n\n`;
        asyn += `    async def ${tool.name}(${sig}) -> "t.${P}Result":\n        """${docText}"""\n        return await self.call(${JSON.stringify(tool.name)}, ${pass}, timeout=timeout)\n\n`;
    }
    return sync.replace(/\n\n$/, '\n') + '\n\n' + asyn.replace(/\n\n$/, '\n');
}

const data = await load();
writeFileSync(join(ROOT, 'js', 'src', 'tools.generated.ts'), emitTs(data));
// (the Python package joins once python/pyproject.toml exists)
if (existsSync(join(ROOT, 'python', 'pyproject.toml'))) {
    const pyDir = join(ROOT, 'python', 'src', 'alion');
    mkdirSync(pyDir, { recursive: true });
    writeFileSync(join(pyDir, '_types.py'), emitPy(data));
    writeFileSync(join(pyDir, '_tools.py'), emitPyMethods(data));
}
console.log(`${data.tools.length} tools from ${data.server?.name} ${data.server?.version}`);
