- **High — `snippet.go:8` — Data race on shared slice `results`**
  - **Root cause:** multiple goroutines concurrently execute `append` on the same slice variable without synchronization; `append` mutates slice header/underlying array and is not thread-safe.
  - **Smallest fix:** guard the append with a mutex.
  ```go
  var mu sync.Mutex
  go func(it Item) {
      defer wg.Done()
      r := process(it)
      mu.Lock()
      results = append(results, r)
      mu.Unlock()
  }(it)
  ```

- **High — `snippet.go:6` / `snippet.go:8` — Loop variable capture bug (`it`)**
  - **Root cause:** closure captures the loop variable by reference; goroutines may run after `it` changes, so they can process the wrong item (often last value).
  - **Smallest fix:** pass `it` as a parameter to the goroutine (or shadow-copy inside loop).
  ```go
  go func(it Item) {
      defer wg.Done()
      // ...
  }(it)
  ```

- **Medium — `snippet.go:8` / `snippet.go:12` — Result order is nondeterministic**
  - **Root cause:** concurrent completion order determines append order, not input order.
  - **Smallest fix:** preallocate and write by index.
  ```go
  results := make([]Result, len(items))
  for i, it := range items {
      wg.Add(1)
      go func(i int, it Item) {
          defer wg.Done()
          results[i] = process(it)
      }(i, it)
  }
  ```

If you want, I can provide a single corrected version that fixes all three issues at once.