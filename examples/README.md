# Examples

Runnable recipes. The ones marked free work without an account; the others need `ALION_API_KEY` ([get one](https://alion.io/developers/keys), $1 of free data every month) and cap their own spend with `maxCredits` / `max_credits`.

| Recipe | Python | JavaScript | Cost |
|---|---|---|---|
| A prospect list to CSV | [prospect_list.py](python/prospect_list.py) | [prospect-list.mjs](js/prospect-list.mjs) | free |
| Lookalikes of a customer | [lookalikes.py](python/lookalikes.py) | [lookalikes.mjs](js/lookalikes.mjs) | free |
| What a company is hiring for | [hiring_signals.py](python/hiring_signals.py) | | free |
| Enrich a CRM export | [enrich_csv.py](python/enrich_csv.py) | [enrich.mjs](js/enrich.mjs) | $0.01 a company + $0.005 a slice |
| Funding round alerts | [funding_alerts.py](python/funding_alerts.py) | [funding-alerts.mjs](js/funding-alerts.mjs) | $0.005 an event |
| A webhook receiver | [webhook_receiver.py](python/webhook_receiver.py) | [webhook-receiver.mjs](js/webhook-receiver.mjs) | free |
| An agent with the Vercel AI SDK | | [ai-agent.mjs](js/ai-agent.mjs) | free tools without a key, plus your model |
| An agent crew with CrewAI | [crewai/](crewai) | | free tools without a key, plus your model |
| A notebook: lists, lookalikes, enrichment, events | [quickstart.ipynb](notebooks/quickstart.ipynb) [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/alion-io/alion-sdk/blob/main/examples/notebooks/quickstart.ipynb) | | |

JavaScript in the browser: [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/alion-io/alion-sdk/tree/main/examples/js)

```bash
pip install alion && python python/prospect_list.py
cd js && npm install && npm run prospects
```

The free examples run in CI against https://alion.io every week, so they stay working.
