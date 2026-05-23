Great direction. Before implementation, these are the key assumptions/ambiguities I’d want to lock down:

- **Search scope**: what entities are searchable (`products` only, or also categories/brands/SKUs/tags/descriptions)?
- **Match behavior**: exact vs partial vs fuzzy typo-tolerance; should ranking prioritize name/SKU/popularity?
- **Data size + performance target**: expected product count and acceptable response time (this drives architecture most).
- **Search surface**: where search appears (global header, product list page, admin) and whether it updates live as user types.
- **Filtering/sorting integration**: how search combines with existing filters/facets/sort/pagination.
- **Index freshness**: real-time updates vs periodic indexing after product changes.
- **Access/security**: should results differ by user role, store, region, or inventory visibility.
- **Observability**: what analytics matter (top queries, zero-result rate, CTR).

The weakest dimension right now is **data scale + latency target**, because it determines whether a simple DB query is enough or you need a dedicated search index.

**Focused question 1:**  
Approximately how many products must this search handle today (and in 12 months), and what max response time feels acceptable for users (e.g., p95 under 200ms, 500ms, 1s)?