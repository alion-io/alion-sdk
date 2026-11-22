// Lookalikes of your best customer, optionally only those operating in a country you sell to. Free without a key.
//
//   npm install @alion-io/sdk
//   node lookalikes.mjs stripe.com DE
import { Alion } from '@alion-io/sdk';

const [company = 'stripe.com', country] = process.argv.slice(2);
const alion = new Alion();
const { items } = await alion.similarCompanies({ company, country, limit: 10 });
console.table(items.map((c) => ({ name: c.name, domain: c.domain, hq: c.hq_country, size: c.size_band, open_jobs: c.open_jobs })));
