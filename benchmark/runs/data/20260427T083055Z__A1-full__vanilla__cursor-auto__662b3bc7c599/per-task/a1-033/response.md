I’ll run a focused investigation and produce three distinct root-cause hypotheses with evidence, rebuttals, ranking, and one high-value probe to discriminate between them. I’m starting by scanning the repo for webhook signature verification and anything time-window-specific around UTC handling.I checked the workspace and there’s no project code or config present to inspect, so I can’t ground this in repository artifacts yet. I’ll proceed with a structured incident-style causal analysis from your observed pattern and clearly separate observed evidence from inference.### Question
Why does a payment-confirm webhook show ~2% `signature mismatch` failures only between `02:00–03:00 UTC`, while the rest of the day is clean?

### Ranked synthesis

| Rank | Hypothesis (deliberately different lane) | Confidence | Basis |
|---|---|---|---|
| 1 | **Time-bound payload mutation in transit** (WAF/CDN/proxy behavior active in that hour alters body bytes or headers used for signing) | **Medium** | Strongly matches narrow hourly window + low partial failure rate |
| 2 | **Clock/time-window validation edge case** (verifier applies timestamp tolerance incorrectly around a scheduled time sync/rotation window) | **Medium-Low** | Hourly periodicity fits, but pure clock skew usually causes broader impact than 2% |
| 3 | **Multi-path verifier inconsistency** (only one pod/worker/version active during autoscaling/cron window canonicalizes payload differently) | **Low-Medium** | Explains small fraction failures; time window requires a scheduled traffic/routing topology change |

### Evidence vs inference (per lane)

#### Lane 1: Transit/body mutation in one hour
- **Evidence (from your observation):**
  - Failures are constrained to a tight UTC hour.
  - Failure rate is small (~2%), not total outage.
- **Inference:**
  - This pattern is classic for a conditional edge rule (e.g., bot mitigation, decompression, chunk normalization, header rewrite) hitting only a subset of requests.
  - Signature mismatch is highly sensitive to byte-level body differences.
- **Against:**
  - If the provider signs over raw body and your app always verifies raw body directly, intermediaries *should* be transparent. This requires a specific non-transparent component.
  - Need proof that failing requests saw different `Content-Encoding`, transfer mode, or body hash at ingress vs app.

#### Lane 2: Timestamp/tolerance bug around 02:00–03:00
- **Evidence:**
  - Time-constrained failures often imply scheduler-driven behavior (NTP correction, key cache refresh, secret reload, daylight/time conversion logic).
  - Signature schemes commonly include timestamp headers and replay windows.
- **Inference:**
  - A verifier bug that mis-parses or rounds timestamps during a maintenance/sync window could reject a small subset.
- **Against:**
  - UTC window makes DST less likely unless local-time conversion is involved.
  - Clock/tolerance bugs usually show a sharper cliff (higher fail %) unless only one shard/path applies the buggy check.

#### Lane 3: Mixed verifier implementations during scaling/rollout
- **Evidence:**
  - 2% is consistent with one small fleet segment (e.g., 1/50 pods) using divergent canonicalization.
  - Time-only window suggests that segment appears only during scheduled jobs, scale events, or canary windows.
- **Inference:**
  - During 02:00–03:00, traffic distribution may include a minority path with different framework/body parser behavior (e.g., parsed JSON re-serialized before HMAC).
- **Against:**
  - If deployment is static and no autoscaling/cron-driven topology changes happen then this weakens.
  - Would expect stable per-instance correlation in logs (same host/pod repeatedly failing).

### Rebuttal round (cross-challenge)

- **Rebuttal to Lane 1:**  
  “If proxy mutation were real, why only 2%?”  
  -> Could be only specific content-types, chunked requests, or specific edge POP/routes during that hour. Still needs ingress-vs-app byte hash comparison.

- **Rebuttal to Lane 2:**  
  “Clock issues should hit more than 2%.”  
  -> True for global skew; still plausible if only one verifier subset has skew or tolerance differs by worker runtime.

- **Rebuttal to Lane 3:**  
  “Why exactly 02:00–03:00?”  
  -> Requires an independent scheduler trigger (autoscaling, nightly batch load, canary). Without such trigger, this lane drops behind Lane 1.

### Critical unknown
Whether the **raw request bytes used by the sender signature** are identical to the bytes your verifier uses on failing requests in that hour.

### Single discriminating probe
Instrument one temporary, read-only diagnostic for `01:45–03:15 UTC`:

- Log for every webhook (success + fail):
  - `provider signature header`, `timestamp header`, `local receive time (UTC)`, `server clock offset if available`,
  - `sha256(raw_body_bytes_at_ingress)` and `sha256(raw_body_bytes_at_verifier_input)`,
  - `instance/pod id`, `route/edge metadata`, `content-encoding`, `transfer-encoding`.
- **Discriminator outcome:**
  - If ingress hash != verifier hash only on failures -> **Lane 1 wins**.
  - If hashes match but timestamp delta spikes on failures -> **Lane 2 wins**.
  - If failures cluster by instance/version with matching hashes/timestamps -> **Lane 3 wins**.

If you want, I can turn this into a concrete logging checklist/query template for your stack (Nginx/Envoy + app runtime + provider).