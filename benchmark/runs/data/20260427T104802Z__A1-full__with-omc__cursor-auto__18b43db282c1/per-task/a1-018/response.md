### High Severity

- **`4–5, 8–9`: Cache lookups will fail for logically identical users**
  - **Issue:** `get()` and `put()` each create a new `User` instance, but `User` does not override `equals()`/`hashCode()`. `HashMap` then compares by object identity, so a `get()` key won’t match a previously `put()` key unless it is the same instance.
  - **Root cause:** Key type used in hash-based map lacks value-based equality/hash semantics.
  - **Smallest fix:** Implement `equals()` and `hashCode()` in `User` using `userId` and `region` (or use a key type that already has correct value equality, e.g. a record).

### Medium Severity

- **`5, 9`: External mutation can silently corrupt cached values**
  - **Issue:** `put()` stores the caller’s `byte[]` reference directly and `get()` returns the internal `byte[]` directly. Any caller mutation changes cached data unexpectedly.
  - **Root cause:** Mutable array references are shared across API boundary without defensive copying.
  - **Smallest fix:** Copy on write/read:
    - in `put`: `store.put(k, Arrays.copyOf(data, data.length));`
    - in `get`: return a copy of stored bytes (or `null` if absent).