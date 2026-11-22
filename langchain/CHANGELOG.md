# Changelog: langchain-alion

## 0.3.0 - 2026-11-23

- Needs `alion>=0.3.0`: refusals carry a `hint` (where to get a key, when to retry), the client can take `max_credits`, and CI runs are marked in the User-Agent.

## 0.2.0 - 2026-11-23

- Tools for the company slices of 2026-11-23: company money, ownership and record, company events, public contracts; `AlionGetCompany` takes `slices`.

## 0.1.0 - 2026-11-08

- First release: `AlionToolkit` and one tool class per Alion tool for LangChain and LangGraph; without a key the toolkit gives the tools free on Alion's open address.
