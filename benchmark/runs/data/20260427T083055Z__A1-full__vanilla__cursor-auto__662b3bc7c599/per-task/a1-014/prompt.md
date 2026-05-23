## User prompt

Review for bugs and rate by severity (CRITICAL/HIGH/MEDIUM/LOW). Cite the issue line.

```javascript
function addItem(list, item) {
  list.push(item);
  return list;
}
const defaults = [];
addItem(defaults, 'a');
addItem(defaults, 'b');
```
