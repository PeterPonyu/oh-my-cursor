- **HIGH** — `fetchAll` returns before any `fetch` completes (`line 3` + `line 7`).  
  `Array.forEach` does not await async callbacks, so `results` is usually returned empty.

- **LOW** — `results.push(...)` inside async callbacks can produce completion-order rather than input-order (`line 5`).  
  If response times differ, pushes happen as requests finish.

Smallest safe fix is to await all promises directly and return them in input order:

```typescript
async function fetchAll(urls: string[]): Promise<string[]> {
  return Promise.all(
    urls.map(async (url) => {
      const r = await fetch(url);
      return r.text();
    })
  );
}
```

This fixes both timing and ordering correctness.