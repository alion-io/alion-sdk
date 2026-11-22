// Funding round alerts: prints every new round in a country as it lands, polling every 15 minutes.
// Needs ALION_API_KEY: $0.005 an event.
//
//   npm install @alion-io/sdk
//   ALION_API_KEY=... node funding-alerts.mjs DE
import { Alion } from '@alion-io/sdk';

const country = process.argv[2] ?? 'DE';
const alion = new Alion({ maxCredits: 20 });

for await (const event of alion.events({ type: 'funding_round', country, since: '7d' })) {
    const c = event.company;
    console.log(event.date, c.name, c.domain ?? '', event.title ?? '', c.url);
}
