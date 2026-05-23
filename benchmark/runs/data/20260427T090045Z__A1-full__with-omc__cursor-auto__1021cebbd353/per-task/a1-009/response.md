Understood — I’ll hold off on implementation and start by surfacing key assumptions/ambiguities, then ask one focused question on the weakest area first. I’m quickly checking the interview workflow guidance to keep this structured.To avoid a misaligned build, these are the key assumptions/ambiguities I need resolved first:

- **Search target unclear**: what users should be able to search (products, docs, users, orders, etc.).
- **Entry surface unclear**: where search lives (global header, dedicated page, in-table filter, API-only).
- **Matching behavior unclear**: exact match vs partial/fuzzy, typo tolerance, ranking expectations.
- **Scope boundary unclear**: MVP depth (basic keyword only vs facets/sorting/highlighting/saved queries).
- **Data/scale constraints unclear**: expected data size, latency target, and whether existing backend/search infra must be reused.
- **Success criteria unclear**: what “done” means (e.g., top-3 relevance quality, p95 latency, conversion impact).

Weakest dimension is **search target** (everything else depends on it).

**Focused question #1:**  
What exact entities should users be able to search in the first version?