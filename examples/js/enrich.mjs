// Enrich domains with funding and hiring. Needs ALION_API_KEY: $0.01 a company + $0.005 a slice; unknown domains are free.
//
//   npm install @alion-io/sdk
//   ALION_API_KEY=... node enrich.mjs stripe.com adyen.com mollie.com
import { Alion, AlionError } from '@alion-io/sdk';

const domains = process.argv.slice(2).length ? process.argv.slice(2) : ['stripe.com', 'adyen.com', 'mollie.com'];
const alion = new Alion({ maxCredits: 20 }); // stop before $2 is spent

try {
    const { items, not_found, credits_charged } = await alion.enrichCompanies(domains, { slices: 'funding,hiring' });
    for (const c of items) console.log(c.name, c.domain, c.funding?.last_round ?? '', c.open_jobs ?? '');
    console.error(`not found: ${not_found.join(', ') || 'none'}; charged ${credits_charged} credits`);
} catch (e) {
    if (e instanceof AlionError) console.error(`${e.code}: ${e.message}\n${e.hint ?? ''}`);
    else throw e;
}
