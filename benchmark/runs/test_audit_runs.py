import json
import tempfile
import unittest
from pathlib import Path

from benchmark.runs.audit_runs import audit_run, audits_to_markdown


class AuditRunsTests(unittest.TestCase):
    def test_accepts_event_event_type_and_type_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = Path(tmp)
            (run / "manifest.json").write_text(json.dumps({"status": "ok"}), encoding="utf-8")
            events = [
                {"event_type": "run_start", "ts": "2026-04-28T00:00:00Z"},
                {"event": "task_start", "task_id": "t1", "ts": "2026-04-28T00:00:01Z"},
                {"type": "request", "task_id": "t1", "ts": "2026-04-28T00:00:02Z"},
                {"event_type": "response", "task_id": "t1", "ts": "2026-04-28T00:00:03Z"},
                {"event": "task_end", "task_id": "t1", "status": "ok", "ts": "2026-04-28T00:00:04Z"},
                {"type": "run_end", "status": "ok", "ts": "2026-04-28T00:00:05Z"},
            ]
            (run / "events.jsonl").write_text("\n".join(json.dumps(e) for e in events) + "\n", encoding="utf-8")
            (run / "summary.csv").write_text("header\n", encoding="utf-8")
            (run / "replay.txt").write_text("replay\n", encoding="utf-8")

            audit = audit_run(run)

        self.assertEqual(audit.disposition, "complete")
        self.assertEqual(audit.task_start_count, 1)
        self.assertEqual(audit.task_end_count, 1)
        self.assertTrue(audit.has_run_end)

    def test_flags_stale_run_without_rewriting_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = Path(tmp)
            (run / "manifest.json").write_text(json.dumps({"status": "running"}), encoding="utf-8")
            (run / "events.jsonl").write_text(
                "\n".join(
                    json.dumps(e)
                    for e in [
                        {"event": "run_start"},
                        {"event": "task_start", "task_id": "t1"},
                        {"event": "request", "task_id": "t1"},
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            audit = audit_run(run)
            markdown = audits_to_markdown([audit])

        self.assertEqual(audit.disposition, "stale/superseded")
        self.assertIn("missing run_end event", audit.problems)
        self.assertIn("summary.csv", audit.missing_artifacts)
        self.assertIn("stale/superseded", markdown)


if __name__ == "__main__":
    unittest.main()
