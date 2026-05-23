Understood — I’ll run this end-to-end in the repo and structure the result by phases with gates, verification commands, security trigger, and a bounded QA retry budget. First I’m checking the project layout to locate the Django app, models, migrations, and serializers before applying changes.I found a very small workspace (no Django project scaffolding yet), so next I’m inspecting existing files to see whether this is a minimal simulation where we should add the Django-style pieces directly.I confirmed there isn’t an existing Django scaffold, so I’m going to add a focused `posts` app slice (`models`, `migrations`, `serializers`) and rewrite `PHASES.md` to match your requested phase/gate format for this specific `tags` JSONB change.I’ve applied the Django-side changes and phase document rewrite; next I’m running the verification commands (compile + tests + structural greps) and will report any QA gate failures with retry status.The batch run was rejected by the tool wrapper, so I’m rerunning the same checks sequentially to complete QA gating.Implemented end-to-end by adding a Django `posts` app slice with model, migration, and serializer support for `tags` as JSONB-compatible data, and produced the requested phase-by-phase delivery output in `PHASES.md`.

### What I changed

- Added `Post.tags` as Django JSON field in `posts/models.py`:
  - `tags = models.JSONField(default=list, blank=True)` (maps to `jsonb` on PostgreSQL).
- Added migration in `posts/migrations/0002_post_tags_jsonb.py`:
  - `migrations.AddField(model_name="post", name="tags", field=models.JSONField(blank=True, default=list))`.
- Added DRF serializer support in `posts/serializers.py`:
  - Explicit `tags` validation as `ListField(CharField(...))`.
- Added package scaffolding:
  - `posts/__init__.py`
  - `posts/migrations/__init__.py`
- Updated dependencies in `requirements.txt`:
  - added `django`, `djangorestframework`.
- Rewrote `PHASES.md` to include explicit:
  - `expansion`, `planning`, `execution`, `QA`, `review`, `cleanup`
  - per-phase gates
  - verification commands
  - security-review trigger condition
  - bounded QA retry budget.

### Security-review trigger condition

- **Does this touch untrusted input?** **Yes**.
- Reason: `tags` is API client-supplied via serializer; input shape is constrained in `posts/serializers.py`.

### Bounded QA retry budget

- Documented in `PHASES.md`:
  - max QA retries: **5**
  - escalate when same error signature repeats **3** times.

### Verification status

- Structural verification of model/migration/serializer wiring was completed using code searches.
- Runtime commands (`python3 -m py_compile`, `pytest`) are listed in `PHASES.md`, but shell execution for those commands was blocked in this environment, so they are provided as the exact commands to run locally.

Run these locally from workspace root:

- `python3 -m py_compile posts/models.py posts/serializers.py posts/migrations/0002_post_tags_jsonb.py`
- `python3 -m pytest -q`
- `rg "class Post|tags = models.JSONField" posts/models.py`
- `rg "AddField|name=\"tags\"|JSONField" posts/migrations/0002_post_tags_jsonb.py`
- `rg "class PostSerializer|tags = serializers.ListField" posts/serializers.py`