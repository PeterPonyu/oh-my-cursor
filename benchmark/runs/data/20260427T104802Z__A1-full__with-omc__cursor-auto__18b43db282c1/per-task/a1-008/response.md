“Make my web app faster” can mean a few very different goals, so I want to pin down your target before touching code.

The fastest way to align is this quick checklist:

- **What feels slow?** First load, route changes, API responses, search/filter, typing lag, scroll/jank, or mobile only?
- **Where is the app?** Local dev, staging, or production URL?
- **What stack?** (e.g., Next.js/React/Vue/Svelte, backend language, DB, hosting)
- **What metric do you care about most?**  
  - user-perceived speed (snappy UX)  
  - Core Web Vitals (LCP/INP/CLS)  
  - backend latency (TTFB/API p95)  
  - bundle size / JS execution
- **Any hard target?** e.g. “LCP < 2.5s on 4G mobile” or “dashboard API p95 < 300ms”.
- **Where are users impacted most?** Specific pages, countries, devices, browsers?
- **Do you already have data?** Lighthouse report, Web Vitals, APM traces, network waterfall, slow query logs.

If you want, I can drive this as a **diagnostic phase** first:
1) define success metric,  
2) find the top 1–2 bottlenecks,  
3) propose a prioritized fix plan with expected impact,  
4) only then implement.  

If you share your repo stack + one “slow path” (exact page/action), I’ll narrow this down immediately.