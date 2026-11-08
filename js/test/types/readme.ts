import { Alion, AlionError } from '../../dist/esm/index.js';
async function main() {
  const alion = new Alion();
  const { items } = await alion.searchCompanies({ industry: 'Fintech', country: 'DE', startup: true, funding_stage: 'early', limit: 10 });
  const { match } = await alion.resolveCompany({ domain: 'stripe.com' });
  const jobs = await alion.searchJobs({ query: 'data engineer', country: 'PL', work_mode: 'remote' });
  const k = new Alion({ apiKey: "k" });
  const stripe = await k.getCompany({ domain: 'stripe.com' });
  const pay = await k.marketStats({ role: 'Backend Developer', country: 'US' });
  const fund = await k.getInvestor({ domain: 'sequoiacap.com' });
  for await (const company of alion.paginate('search_companies', { technology: 'Snowflake', hiring: true }, { maxItems: 50 })) { console.log(company.name, company.domain); }
  try { await alion.getCompany({ domain: 'stripe.com' }); } catch (e) { if (e instanceof AlionError) { e.code; e.needsAccount; e.data; } }
  const result = await alion.call('check_counterparty', { target: 'acme.com' });
  const tools = await alion.listTools();
  void [items, match, jobs, stripe, pay, fund, result, tools];
}
void main;
