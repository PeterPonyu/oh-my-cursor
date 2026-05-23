- **CRITICAL** — `line 3` uses `urls.forEach(async ...)`, but `forEach` does not await async callbacks, so `line 7` returns before any fetch completes (often `[]`), and rejections become unobserved.
  - **Smallest fix:** await all promises from `map` (or use `for...of` + `await`).

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

This preserves input order, waits for completion, and correctly propagates errors.