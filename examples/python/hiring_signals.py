"""What a company is hiring for right now: open roles by family and work mode, and the latest postings. Free without a key.

    pip install alion
    python hiring_signals.py stripe.com
"""

import sys
from collections import Counter

from alion import Alion

company = sys.argv[1] if len(sys.argv) > 1 else "stripe.com"

alion = Alion()
jobs = list(alion.paginate("search_jobs", company=company, max_items=60))
print(f"{len(jobs)} open postings read at {company}")
print("By role family:")
for family, n in Counter(j.get("role_family") or "other" for j in jobs).most_common(6):
    print(f"  {n:>3}  {family}")
print("By work mode:", dict(Counter(j.get("work_mode") or "unknown" for j in jobs)))
print("Latest:")
for j in jobs[:8]:
    print(f"  {(j.get('first_seen_at') or '')[:10]}  {j['title']}")
