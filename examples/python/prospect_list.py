"""A prospect list to CSV: fintech startups in Germany that are hiring. Free without a key (up to 20 rows a page).

    pip install alion
    python prospect_list.py > prospects.csv
"""

from alion import Alion, to_csv

alion = Alion()
rows = list(alion.paginate("search_companies", industry="Fintech", country="DE", startup=True, hiring=True, max_items=40))
print(to_csv(rows, columns=["name", "domain", "size_band", "founded_year", "open_jobs", "url"]), end="")
