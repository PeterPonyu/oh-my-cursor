I’ll run this end-to-end and implement the `posts.tags` JSONB change with migration + serializer updates, then report back in the exact phased format you requested (including gates, verification commands, security trigger, and QA retry budget). I’m first loading the relevant execution skill guidance, then I’ll locate the Django app and apply the changes.I’ve loaded the autopilot workflow constraints and will now locate the Django `posts` model and serializer so I can implement the migration cleanly and verify it with project commands.I can’t auto-apply this in the current workspace because there is no Django project here (`manage.py`, Django models, and serializers are absent).  
Below is an end-to-end execution package you can run in your Django repo immediately.

## Phase 0: Expansion

- **Goal:** Add `tags` as JSONB-backed field on `posts` table and expose it safely via serializer.
- **Scope:** model update, migration, serializer update, tests.
- **Gate (must pass):**
  - `Post` model file and serializer are identified.
  - PostgreSQL backend confirmed (JSONB support path).
- **Verification commands:**
  - `python manage.py check`
  - `python -c "import django; print(django.get_version())"`

## Phase 1: Planning

- **Implementation plan:**
  1. Add `tags = models.JSONField(default=list, blank=True)` to `Post`.
  2. Generate + inspect migration.
  3. Add `tags` to serializer fields and validate shape.
  4. Add tests for create/read/update with tags.
- **Gate (must pass):**
  - Migration is additive and non-destructive.
  - Default is safe (`list`, not mutable literal).
- **Verification commands:**
  - `python manage.py makemigrations --check --dry-run`
  - `python manage.py sqlmigrate <app_name> <migration_number>`

## Phase 2: Execution

- **Model change (`posts/models.py`):**
```python
tags = models.JSONField(default=list, blank=True)
```

- **Serializer change (`posts/serializers.py`):**
  - Add `tags` to `fields`.
  - Optional guard:
```python
def validate_tags(self, value):
    if not isinstance(value, list):
        raise serializers.ValidationError("tags must be a list")
    if not all(isinstance(v, str) for v in value):
        raise serializers.ValidationError("each tag must be a string")
    return value
```

- **Migration generation:**
  - `python manage.py makemigrations posts`
  - `python manage.py migrate`

- **Gate (must pass):**
  - Migration applies cleanly on empty and existing DBs.
  - Serializer accepts `[]` and list-of-strings payloads.

## Phase 3: QA

- **Verification commands:**
  - `python manage.py test`
  - `python manage.py test posts`
  - `python manage.py check`
- **Gate (must pass):**
  - All tests pass.
  - No migration drift.
- **Bounded QA retry budget:**
  - Max **5** QA cycles total.
  - If same root error repeats **3** times, stop and escalate as fundamental issue.

## Phase 4: Review

- **Code review gate:**
  - No breaking API changes to existing fields.
  - Backward compatibility preserved (default `[]`).
- **Security-review trigger condition:**
  - **Triggered: Yes** — serializer accepts untrusted client input for `tags`.
- **Security checks:**
  - Enforce list + string-only validation.
  - Optional max count/length limits to prevent abuse.
  - Ensure no dynamic SQL/path usage from `tags`.

## Phase 5: Cleanup

- **Post-run cleanup:**
  - Remove debug prints/temp fixtures.
  - Ensure migration file is committed with model+serializer changes.
- **Gate (must pass):**
  - `git diff` shows only intended files.
  - Fresh DB + migrate + test pass workflow is reproducible.
- **Final verification commands:**
  - `python manage.py migrate --plan`
  - `python manage.py test posts`
  - `git status`

If you point me to your actual Django repo path (or open it here), I’ll execute these phases directly and deliver the exact file edits + migration output.