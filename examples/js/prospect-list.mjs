// A prospect list to CSV: fintech startups in Germany that are hiring. Free without a key (up to 20 rows a page).
//
//   npm install @alion-io/sdk
//   node prospect-list.mjs > prospects.csv
import { Alion, toCSV } from '@alion-io/sdk';

const alion = new Alion();
const rows = [];
for await (const company of alion.paginate('search_companies', { industry: 'Fintech', country: 'DE', startup: true, hiring: true }, { maxItems: 40 })) {
    rows.push(company);
}
process.stdout.write(toCSV(rows, ['name', 'domain', 'size_band', 'founded_year', 'open_jobs', 'url']));
