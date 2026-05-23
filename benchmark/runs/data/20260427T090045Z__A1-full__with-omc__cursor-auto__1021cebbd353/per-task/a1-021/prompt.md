## User prompt

Security-review this Express handler. Output: OWASP class, severity, attack scenario, line, remediation.

```javascript
1 app.get('/fetch', async (req, res) => {
2   const url = req.query.url;
3   const r = await fetch(url);
4   res.send(await r.text());
5 });
```
