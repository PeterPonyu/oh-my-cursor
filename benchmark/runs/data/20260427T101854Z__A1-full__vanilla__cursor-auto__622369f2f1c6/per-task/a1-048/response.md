I’ll inspect the repo structure and service call patterns first, then produce a concrete batch-edit plan with per-package scope, file patterns, ordering, risk/conflict notes, and package-level verification commands. I’m starting with a quick analysis workflow to ground the plan in actual files.I checked for obvious package/service patterns and got no matches, so I’m going to inspect the workspace root to locate where the actual code lives before I can build a reliable migration plan.I can’t produce the explicit per-package/per-file batch plan yet because this workspace is empty (`/tmp/cursor-vanilla-m8jr3pc3` has no project files), so there’s nothing to inspect for the 4 packages or 40 service files.

Please share one of these so I can generate the concrete plan in one pass:
- the correct repo path to work in, or
- paste a file list for the 4 packages (or `tree` output), plus
- old vs new API client call signature (exact before/after), and
- package dependency order if already known.

Once I have that, I’ll return exactly what you asked:
- explicit per-package scope,
- per-file batch pattern definitions,
- dependency ordering between packages,
- conflict-avoidance reasoning,
- verification commands per package,
- and a clear list of files that are not safe to batch-edit (with reasons).