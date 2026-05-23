## User prompt

Review this Go snippet. Report severity-rated findings with file:line (use the line numbers shown), root cause, and smallest fix.

```go
 1 func processAll(items []Item) []Result {
 2   var results []Result
 3   var wg sync.WaitGroup
 4   for _, it := range items {
 5     wg.Add(1)
 6     go func() {
 7       defer wg.Done()
 8       results = append(results, process(it))
 9     }()
10   }
11   wg.Wait()
12   return results
13 }
```
