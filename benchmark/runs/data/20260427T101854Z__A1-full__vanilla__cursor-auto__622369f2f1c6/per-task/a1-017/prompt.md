## User prompt

Review this TypeScript snippet for correctness bugs. Severity-rate (CRITICAL/HIGH/MEDIUM/LOW), cite line, give smallest fix.

```typescript
1 async function fetchAll(urls: string[]): Promise<string[]> {
2   const results: string[] = [];
3   urls.forEach(async (url) => {
4     const r = await fetch(url);
5     results.push(await r.text());
6   });
7   return results;
8 }
```
