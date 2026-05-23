- **MEDIUM** — `addItem` mutates the caller-owned array in place (`list.push(item)`), which can cause hidden side effects if callers expect a pure function.  
  **Issue line:** `2`

- **LOW** — `defaults` is reused and mutated across calls, so state accumulates globally (`['a', 'b']`) and can leak between usages/tests if this pattern is copied into shared/module scope.  
  **Issue lines:** `5`, `6`, `7`

If you want this safer, return a new array instead of mutating:

```javascript
function addItem(list, item) {
  return [...list, item];
}
```