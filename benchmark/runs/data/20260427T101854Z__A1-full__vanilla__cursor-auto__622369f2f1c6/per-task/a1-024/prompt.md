## User prompt

Security-review this auth middleware. Output: at least two OWASP-class findings, severity each, attack scenarios, line citations, and ranked remediations.

```javascript
1 const SECRET = 'changeme';
2 function authenticate(req, res, next) {
3   const token = req.headers.authorization?.split(' ')[1];
4   const payload = jwt.decode(token);
5   if (payload && payload.user_id) {
6     req.user = payload;
7     return next();
8   }
9   return res.status(401).end();
10 }
```
