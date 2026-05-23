## User prompt

Review for bugs. Output severity-rated findings, line:issue, root cause, and the smallest fix. Do not refactor stylistically — only flag correctness issues.

```java
 1 public class Cache {
 2   private Map<User, byte[]> store = new HashMap<>();
 3   public byte[] get(String userId, String region) {
 4     User k = new User(userId, region);
 5     return store.get(k);
 6   }
 7   public void put(String userId, String region, byte[] data) {
 8     User k = new User(userId, region);
 9     store.put(k, data);
10   }
11 }
12 // User does not override equals/hashCode.
```
