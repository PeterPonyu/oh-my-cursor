I’ll run a focused investigation and produce three competing root-cause hypotheses with evidence for/against, then a rebuttal and one decisive probe to separate them. I’m first pulling the repository context and any relevant logs/code paths around webhook signature verification and time handling.I found this workspace is empty (no code/log files to inspect), so I’ll ground the analysis on your observed pattern itself and give explicitly labeled evidence-vs-inference with one high-signal probe to isolate the real cause quickly.### Question
Trace why `payment-confirm` webhook signature verification fails about 2% of the time, only during `02:00–03:00 UTC`.

### Ranked Synthesis (3 Deliberately Different Lanes)

| Rank | Hypothesis | Confidence | Why it ranks here |
|---|---|---|---|
| 1 | **A daily rotation event (secret/key/cert/cache) occurs near 02:00 UTC, causing brief verifier/signer key skew** | **Medium-High** | Strongly explains the narrow time window + low nonzero failure rate |
| 2 | **DST/local-time conversion bug in canonicalization path triggered by 02:00 local-time transitions in part of fleet** | **Medium** | 02:00 is the canonical DST edge hour; can produce intermittent mismatches if date/header/body string differs |
| 3 | **Scheduled infra perturbation (autoscaling/redeploy/NTP step/leap smear) around 02:00 causes sporadic body/header mutation or stale config** | **Medium-Low** | Fits “small % + fixed window,” but less specific to signature mismatch than key-skew/canonicalization |

---

### Lane-by-Lane Evidence For / Against

#### 1) Rotation skew (secret/key/cert/cache split-brain)
- **Evidence (from your observation):**
  - Failures cluster in a **strict daily UTC hour** (`02:00–03:00`), classic for cron/rotation windows.
  - Failure rate is **partial (~2%)**, consistent with only some instances using old/new material during propagation.
- **Against:**
  - If rotation were clean and atomic, expected failure should be near 0.
  - If all signers and verifiers share same source-of-truth synchronously, this pattern should not appear.
- **Inference:**
  - Most likely a non-atomic rotation path (e.g., signer updated first, verifier cache stale; or mixed keyset acceptance bug).

#### 2) DST/local-time canonicalization defect
- **Evidence:**
  - `02:00` is exactly where DST transitions often hit (regional local times).
  - Signature mismatch can occur if either side includes formatted timestamps/date strings in canonical payload.
- **Against:**
  - You reported a **daily** issue; DST transitions are typically seasonal, not every day.
  - Window is in **UTC**, while DST bugs usually manifest in locale-specific timezones/dates unless code wrongly converts every day.
- **Inference:**
  - Possible only if there is recurring local-time formatting logic (not pure epoch) that behaves differently around 02:xx due to timezone handling or parser branch.

#### 3) Scheduled infra perturbation (deploy/scale/time sync)
- **Evidence:**
  - Many systems run maintenance/scaling/batch jobs in off-peak windows around 02:00 UTC.
  - Small intermittent failure could come from a subset of nodes with malformed request body decoding, stale env, or clock correction.
- **Against:**
  - Signature mismatch is usually deterministic per payload/key; infra jitter alone is a weaker direct cause unless it changes inputs.
  - A full-hour recurring window suggests a business-process event more than random infra noise.
- **Inference:**
  - Plausible as a second-order cause: scheduled events trigger temporary config divergence or altered canonicalization behavior.

---

### Rebuttal Round (Hypotheses Challenging Each Other)

- **H1 rebuts H2:** If this were DST-only, failures should spike on transition dates, not every day; daily UTC window favors rotation cadence.
- **H1 rebuts H3:** Infra events explain general errors better than signature-specific mismatches unless they induce key/config/body divergence.
- **H2 rebuts H1:** If key IDs always match during failures, rotation skew weakens; canonical string divergence becomes more likely.
- **H3 rebuts H1/H2:** If failures correlate exactly with deployment/scale events and disappear when change freezes are applied, infra-triggered divergence may be primary.

---

### Critical Unknown
Whether failing events are signed with a **different key identity/version** than what the verifier attempted at that exact second (and on which instance).

---

### Single Discriminating Probe (Most Decisive Next Step)
For **all webhook verifies during 01:50–03:10 UTC**, emit one structured log per request containing:
- `verify_result` (pass/fail)
- `signing_key_id` from header (or equivalent)
- `verifier_key_id/version` actually used
- `secret/config version hash`
- `canonical_string_hash` (or canonical bytes hash)
- `raw_body_hash`
- `verifier_instance_id` + deploy/version + timezone + clock offset

**Decision rule:**
- If failures show `signing_key_id != verifier_key_id/version` or mixed secret versions by instance/time => **H1 wins**.
- If key IDs match but `canonical_string_hash` diverges while `raw_body_hash` is stable => **H2 wins**.
- If failures cluster by instance/redeploy/clock step with no key/hash pattern => **H3 wins**.