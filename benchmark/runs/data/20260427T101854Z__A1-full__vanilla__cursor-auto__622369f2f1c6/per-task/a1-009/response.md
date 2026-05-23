To add search well, these are the key assumptions/ambiguities I’d want to resolve first:

- **Search target**: what entities are searchable (products only, or also categories/brands/content)?
- **Query semantics**: exact match vs partial, typo tolerance, stemming/synonyms, multilingual handling.
- **Ranking goals**: relevance only vs business signals (popularity, margin, inventory, promotions, personalization).
- **Filters/facets**: which dimensions must be filterable and how they interact with ranking.
- **Latency/SLA**: acceptable response time and traffic scale (QPS, catalog size, update frequency).
- **Data freshness**: near-real-time indexing vs batch updates.
- **UI/UX scope**: autocomplete, suggestions, “no results” behavior, pagination/infinite scroll.
- **Access control**: any role/region/tenant visibility constraints.
- **Observability**: metrics for success (CTR, conversion, zero-result rate) and feedback loop.
- **Build vs buy constraints**: stack preferences, budget, ops ownership, compliance limits.

The weakest dimension is usually **ranking intent**, because everything else depends on what “good results” means.

**Focused question #1:**  
When a user searches, what should determine result order first: textual relevance, business priorities (e.g., promoted/high-margin/in-stock), or user personalization?