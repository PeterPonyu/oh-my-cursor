---
name: parallel-batch
description: Parallel execution pattern for independent tasks, using the cursor-agent CLI when available and downgrading to sequential otherwise.
---

# Parallel Batch

> **Cursor host note.** OMC's `ultrawork` fires multiple sub-agents in one
> turn via Claude Code's `Task` tool. Cursor's checked-in skill model does
> **not** document a sub-agent / Task primitive this repo can own as a
> repo-shipped surface. The verified host primitive for spawning parallel
> work is the **`cursor-agent` CLI** (a real Cursor product binary). This
> skill therefore expresses parallelism as **N background `cursor-agent`
> processes**, with an explicit downgrade path to sequential execution when
> the CLI is not available. Verify against the Cursor CLI version installed
> on the user's machine (`cursor-agent --version`) before relying on flags.

## Use when

- The work decomposes into independent tasks that do not share files.
- Total wall-clock time matters and the tasks are slow individually.
- The user said "in parallel", "fan out", "ultrawork", "parallel-batch".

## Skip when

- The tasks have ordering dependencies - run them sequentially.
- The tasks all touch the same files - parallelism would just create merge
  conflicts.
- There is only one task - just do it.

## Preflight

1. Check the CLI:
   ```bash
   cursor-agent --version
   ```
   - If the binary exists and reports a version, **parallel mode** is
     available.
   - If not, this skill **downgrades to sequential mode** and runs each task
     in order in the current chat. Tell the user about the downgrade
     plainly; do not pretend parallelism happened.

2. Confirm the task list with the user. List the tasks numerically and ask
   for an explicit "go".

## Parallel mode (cursor-agent available)

For each independent task, spawn a background agent. The exact flag set
depends on the installed CLI version, so consult `cursor-agent --help`
first. A typical pattern (verify against your CLI):

```bash
cursor-agent --print "<task 1 description>" > .cursor-agent-logs/task-1.log 2>&1 &
cursor-agent --print "<task 2 description>" > .cursor-agent-logs/task-2.log 2>&1 &
cursor-agent --print "<task 3 description>" > .cursor-agent-logs/task-3.log 2>&1 &
wait
```

Rules:
- Cap concurrency at a sensible number for the host (default 3-5; ask if the
  user wants higher).
- Always redirect each agent's stdout/stderr to a per-task log file under a
  workspace-local directory like `.cursor-agent-logs/` so the orchestrator
  can review them.
- Do not invent flags. If a flag like `--print` or a non-interactive mode is
  not present in `cursor-agent --help`, replace it with the documented flag
  for the installed version. Mark unverified flags with a `# verify against
  cursor-agent vX.Y` comment.
- Respect the workspace: each spawned agent inherits the same working
  directory. If two tasks would touch the same files, do not parallelize
  them - sequence them or merge them into one task.

After `wait`, read each log file and report:
- which tasks succeeded,
- which failed (with the failing output snippet), and
- a short merged summary.

## Sequential mode (downgrade)

When `cursor-agent` is unavailable:

1. Run task 1 in the current chat to completion. Show the output.
2. Run task 2. Show the output.
3. Continue.
4. At the end, give the same merged summary you would have given in
   parallel mode, plus a one-line note that parallel mode was unavailable.

## Verification (lightweight)

After a batch completes:
- Run the project's build / typecheck once across the workspace.
- Run the affected tests if they are fast.
- Report any new errors. Do not declare success without fresh evidence.

If the user wants reviewer-grade verification, hand off to the `review`
skill in a follow-up turn.

## Boundaries

- This skill explicitly does **not** use tmux (per scope) and does not claim
  Cursor's background-agent product feature as repo-owned. It uses the
  `cursor-agent` CLI as a documented host primitive, nothing more.
- It does not promise that parallel-spawned agents share state. Each one is
  independent; pass the task description in the prompt rather than relying
  on shared memory.
- It does not retry failed tasks automatically. If a task fails, report it
  and let the user decide - re-running with a fix or escalating to
  `iterate-loop` for persistence.
- It does not guarantee the cost or quota implications of N concurrent
  agents. The user owns those costs; this skill only orchestrates.

## Stop conditions

- All tasks reported success and verification passed.
- Any task failed in a way that blocks the rest (e.g. broken build the
  others depend on).
- The user says "stop" - kill background `cursor-agent` processes with
  `kill %1 %2 %3 ...` (or `kill $(jobs -p)`) and report the partial state.
