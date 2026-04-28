from __future__ import annotations

import json
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

from benchmark.runs import host_client
from benchmark.runs import run_a1_full
from benchmark.runs.pilot import run_a1_pilot


class CursorAutoModeTests(unittest.TestCase):
    def test_build_cursor_command_includes_explicit_auto_model(self) -> None:
        cmd = host_client.build_cursor_command(
            "/bin/cursor-agent", "hello", model="auto"
        )

        self.assertEqual(
            cmd,
            [
                "/bin/cursor-agent",
                "--print",
                "--trust",
                "--output-format",
                "json",
                "--model",
                "auto",
                "hello",
            ],
        )

    def test_call_cursor_records_model_arg_and_forwards_auto(self) -> None:
        payload = {
            "type": "result",
            "subtype": "success",
            "result": "ok",
            "usage": {"inputTokens": 1, "outputTokens": 2},
            "session_id": "s1",
            "request_id": "r1",
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch.object(
                host_client, "_resolve_binary", return_value="/bin/cursor-agent"
            ), mock.patch.object(
                host_client.subprocess,
                "run",
                return_value=SimpleNamespace(
                    stdout=json.dumps(payload), stderr="", returncode=0
                ),
            ) as run:
                out = host_client.call_cursor(
                    "hello", workdir=tmpdir, model="auto", timeout=12
                )

        cmd = run.call_args.args[0]
        self.assertIn("--model", cmd)
        self.assertEqual(cmd[cmd.index("--model") + 1], "auto")
        self.assertEqual(out["request_body"]["model_arg"], "auto")
        self.assertIn("--model", out["request_body"]["cmd"])

    def test_pilot_cli_defaults_to_auto_both_arms(self) -> None:
        args = run_a1_pilot.parse_args([])

        self.assertEqual(args.model, "auto")
        self.assertEqual(args.arm, "both")
        self.assertEqual(run_a1_pilot._recorder_model(args.model), "cursor/auto")
        self.assertEqual(
            run_a1_pilot._selected_arms(args.arm), ("vanilla", "with-omc")
        )

    def test_full_cli_supports_limit_and_single_arm(self) -> None:
        args = run_a1_full.parse_args(
            ["--model", "auto", "--limit", "1", "--arm", "vanilla"]
        )

        self.assertEqual(args.model, "auto")
        self.assertEqual(args.limit, 1)
        self.assertEqual(run_a1_full._selected_arms(args.arm), ("vanilla",))
        self.assertEqual(
            run_a1_full._limited_tasks([{"id": "a"}, {"id": "b"}], 1),
            [{"id": "a"}],
        )

    def test_request_body_proves_explicit_model_argument(self) -> None:
        body = run_a1_full._request_body(
            "task prompt", run_a1_full.REPO_ROOT, "auto"
        )

        self.assertEqual(body["model"], "cursor/auto")
        self.assertEqual(body["model_arg"], "auto")
        self.assertIn("--model", body["cmd"])
        self.assertEqual(body["cmd"][body["cmd"].index("--model") + 1], "auto")


if __name__ == "__main__":
    unittest.main()
