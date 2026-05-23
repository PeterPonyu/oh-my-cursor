To add search well, these are the key assumptions/ambiguities I’d need resolved first:

- **Search target**: what entities are searchable (products only, or categories/brands/content too)?
- **Match behavior**: exact, prefix, fuzzy, typo-tolerant, synonym-aware?
- **Scope and filters**: should search respect stock status, region, user permissions, hidden items?
- **Ranking goals**: relevance vs popularity vs margin vs recency; any business boosts/buries?
- **Latency/scale**: expected catalog size, QPS, acceptable response time, and peak traffic.
- **UX contract**: autocomplete, “did you mean,” zero-results behavior, pagination, sort options.
- **Freshness**: how quickly index/search must reflect product updates.
- **Observability**: what success metrics matter (CTR, conversion, zero-result rate, latency).

Weakest/highest-risk dimension is usually **relevance definition** (because wrong relevance makes every implementation feel broken).

**Focused question #1:**  
What should determine result order for a query when multiple products match (e.g., strict text relevance only, or relevance blended with business factors like popularity/availability/margin)?