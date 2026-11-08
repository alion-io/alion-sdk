import Alion, { AlionError, type SearchCompaniesResult } from '../../dist/esm/index.js';
const alion = new Alion();
async function main() {
    const r: SearchCompaniesResult = await alion.searchCompanies({ industry: 'Fintech', startup: true, hiring_level: 'A', limit: 5 });
    const d: string | null | undefined = r.items?.[0]?.domain;
    for await (const job of alion.paginate('search_jobs', { query: 'rust' })) { const t: string | null | undefined = job.title; void t; }
    const g = await alion.call('get_company', { domain: 'stripe.com' }); void g.funding;
    // @ts-expect-error unknown argument value for an enum
    await alion.searchCompanies({ hiring_level: 'Z' });
    // @ts-expect-error similar_companies needs company
    await alion.similarCompanies({});
    try { await alion.getCompany({ domain: 'x' }); } catch (e) { if (e instanceof AlionError) void e.code; }
    void d;
}
void main;
