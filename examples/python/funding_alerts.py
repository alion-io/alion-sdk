"""Funding round alerts: prints every new round in a country as it lands, polling every 15 minutes.
Needs ALION_API_KEY: $0.005 an event.

    pip install alion
    export ALION_API_KEY=...
    python funding_alerts.py DE
"""

import sys

from alion import Alion

country = sys.argv[1] if len(sys.argv) > 1 else "DE"

alion = Alion(max_credits=20)
for event in alion.events(type="funding_round", country=country, since="7d"):
    c = event["company"]
    print(event["date"], c["name"], c.get("domain") or "", event.get("title") or "", c["url"], flush=True)
