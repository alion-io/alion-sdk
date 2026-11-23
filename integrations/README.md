# Alion in Zapier, Make and n8n

The same three things in each tool, on top of Alion's REST API (https://alion.io/developers/docs):

- **Triggers on Alion's webhook events**: candidate replied, consented, consent revoked, erased; shortlist candidate added; new matches for a job order; role became hard to fill; buying window opened. Turning a trigger on subscribes its address at Alion (`webhook.subscribe`, the address shows up on alion.io/developers/webhooks marked with the tool), turning it off removes it (`webhook.unsubscribe`). A tool's subscriptions are counted apart from the five addresses of the page (up to 50).
- **Job orders**: the vacancies the account posted on Alion and their shortlists - list them, read a shortlist, add a person, move a person between stages or remove one.
- **People**: find a person by `person_id`, handle or link; match people to a vacancy's own text.

Contacts come only where a person gave them to the account (applied to its vacancy, or shared them in Messages), never the email. Every call needs an API key from alion.io/developers/keys.

| Tool | Folder | State |
|---|---|---|
| n8n | [alion-io/n8n-nodes-alion](https://github.com/alion-io/n8n-nodes-alion) 0.2.0 | Published to npm from CI. Alion Trigger + Person + Job Order |
| Zapier | [`zapier/`](zapier) | Built and tested against the API; needs `zapier push` from the Alion Zapier account |
| Make | [`make/`](make) | Blocks written for Make's app editor; not run yet - needs the Alion Make account |

## Zapier

```bash
cd integrations/zapier
npm install
npm test                                        # offline checks
ALION_BASE=https://alion.io ALION_TEST_KEY=alion_... npm test   # the whole life of a trigger and the actions, against Alion
npx zapier-platform-cli login                   # the Alion Zapier account
npx zapier-platform-cli register "Alion"        # once
npx zapier-platform-cli push
```

Then in the Zapier developer platform: invite testers, and when ready submit the integration for the public directory (Zapier reviews it; it needs a few live users first).

What it has: 8 REST hook triggers (one per live event; `performList` shows the account's last real events, else a sample), a hidden job order trigger that feeds the dropdowns, the actions **Add Person to Shortlist** and **Move Person on Shortlist**, the search **Find Person**. Each delivery's `X-Alion-Signature` is checked with the secret Alion gave that subscription; a forged one is dropped.

## Make

Make apps are built in Make's own editor (Make, Custom Apps, Create a new app) or with the Make Apps Editor extension for VS Code. Each file in [`make/`](make) is one block of the editor:

| File | Editor block |
|---|---|
| `base.imljson` | Base |
| `connection/api.imljson`, `connection/parameters.imljson` | Connections: a new connection of type API key - Communication, Parameters |
| `webhooks/alion-events/*.imljson` | Webhooks: a new dedicated webhook "Alion events" with Attach and Detach - Communication (`api`), Parameters, Attach, Detach |
| `modules/watch-events/*` | An Instant trigger on that webhook - Communication, Interface, Samples |
| `modules/add-to-shortlist/*`, `move-on-shortlist/*`, `find-person/*` | Actions - Communication, Mappable parameters, Interface |
| `modules/get-shortlist/*`, `match-people/*` | Searches - Communication, Mappable parameters, Interface |
| `rpcs/list-orders/api.imljson` | RPC `list-orders` (the job order dropdown) |

Make's webhook URLs are secret per scenario; the Make app does not check `X-Alion-Signature` (IML has no HMAC). Test each module in a scenario with a real key before publishing the app.
