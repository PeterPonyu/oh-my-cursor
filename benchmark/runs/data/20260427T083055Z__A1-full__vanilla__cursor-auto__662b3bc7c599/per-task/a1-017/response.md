- **HIGH** — `forEach` does not await async callbacks, so function returns before fetches finish (`line 3`, `line 7`).  
  Smallest fix: await all tasks before returning.
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

- **MEDIUM** — `results.push(...)` records responses in completion order, not input order (`line 5`), so output may be shuffled.  
  Same fix above also preserves original `urls` order because `Promise.all` resolves by index.

- **LOW** — errors from `fetch`/`text` become unhandled in the original `forEach` callback (`line 3-5`) since nothing awaits them.  
  Same fix above routes failures through `fetchAll`’s returned promise (rejects properly).