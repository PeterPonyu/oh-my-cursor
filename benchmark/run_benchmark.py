#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
from pathlib import Path

EVIDENCE_MARKERS = (
    "CURSOR_AUTH_OK",
    "CURSOR_MODEL_AUTO_OK",
    "CURSOR_AGENT_OK",
)


@dataclass
class CheckResult:
    name: str
    command: str
    success: bool
    duration_sec: float
    output_tail: str
    markers: list[str]


@dataclass
class EvaluationDimension:
    name: str
    description: str
    weight: int
    required: bool
    passed: bool
    evidence: str


@dataclass
class EvaluationContract:
    profile: str
    variant: str
    score: int
    max_score: int
    threshold_score: int
    passed: bool
    release_blocking: bool
    expected_baseline_score: int
    required_delta_vs_baseline: int
    actual_delta_vs_baseline: int
    dimensions: list[EvaluationDimension]


@dataclass
class HistoryEntry:
    timestamp: str
    repo: str
    git_branch: str
    git_sha: str
    profile: str
    variant: str
    score: int
    max_score: int
    threshold_score: int
    passed: bool
    release_blocking: bool
    output_dir: str


def run(cmd: str, cwd: Path, env: dict[str, str]) -> CheckResult:
    start = time.time()
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        shell=True,
        text=True,
        capture_output=True,
        env=env,
    )
    duration = time.time() - start
    combined_output = (proc.stdout + proc.stderr).strip()
    tail = combined_output.splitlines()[-12:]
    return CheckResult(
        name="",
        command=cmd,
        success=proc.returncode == 0,
        duration_sec=round(duration, 2),
        output_tail="\n".join(tail),
        markers=[marker for marker in EVIDENCE_MARKERS if marker in combined_output],
    )


def determine_variant(run_agent_smoke: bool, variant_arg: str) -> str:
    if variant_arg == "auto":
        return "enhanced" if run_agent_smoke else "baseline"
    return variant_arg


def git_value(root: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(root),
        text=True,
        capture_output=True,
        check=True,
    )
    return proc.stdout.strip()


def record_history(root: Path, outdir: Path, evaluation: EvaluationContract) -> None:
    history_dir = (root / "benchmark" / "results").resolve()
    history_dir.mkdir(parents=True, exist_ok=True)
    history_path = history_dir / "history.jsonl"
    history_md = history_dir / "history.md"

    entry = HistoryEntry(
        timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        repo=root.name,
        git_branch=git_value(root, "branch", "--show-current"),
        git_sha=git_value(root, "rev-parse", "--short", "HEAD"),
        profile=evaluation.profile,
        variant=evaluation.variant,
        score=evaluation.score,
        max_score=evaluation.max_score,
        threshold_score=evaluation.threshold_score,
        passed=evaluation.passed,
        release_blocking=evaluation.release_blocking,
        output_dir=os.path.relpath(outdir, root),
    )

    with history_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(asdict(entry), ensure_ascii=False) + "\n")

    entries = [json.loads(line) for line in history_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    entries = sorted(entries, key=lambda item: item["timestamp"], reverse=True)

    md_lines = [
        "# Cursor Benchmark History",
        "",
        "| Timestamp | Branch | SHA | Profile | Variant | Score | Threshold | Gate | Output |",
        "| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |",
    ]
    for item in entries:
        md_lines.append(
            f"| `{item['timestamp']}` | `{item['git_branch']}` | `{item['git_sha']}` | "
            f"`{item['profile']}` | `{item['variant']}` | {item['score']}/{item['max_score']} | "
            f"{item['threshold_score']}/{item['max_score']} | "
            f"{'PASS' if item['passed'] else 'FAIL'} | `{item['output_dir']}` |"
        )
    history_md.write_text("\n".join(md_lines) + "\n", encoding="utf-8")


def build_evaluation(profile: str, variant: str, results: list[CheckResult]) -> EvaluationContract:
    results_by_name = {result.name: result for result in results}
    auth_result = results_by_name.get("default_auth")
    auth_evidence = auth_result.output_tail if auth_result else "(default auth result missing)"
    auth_markers = set(auth_result.markers if auth_result else [])
    smoke_result = results_by_name.get("smoke_cursor")
    smoke_evidence = smoke_result.output_tail if smoke_result else "(smoke result missing)"
    smoke_markers = set(smoke_result.markers if smoke_result else [])

    weight_map = {
        "default_auth": ("check", "default Cursor auth is available", 20),
        "CURSOR_MODEL_AUTO_OK": ("marker", "cursor-agent exposes the auto model", 15),
        "surface_visibility": ("check", "visible repo-native surfaces match the intended backbone", 20),
        "state_contract": ("check", "repo/user state contract stays bounded and explicit", 20),
        "backbone_verify": ("check", "backbone verification passes", 25),
        "CURSOR_AGENT_OK": ("marker", "model-backed cursor smoke returns CURSOR_AGENT_OK", 20),
    }

    required_names = (
        "default_auth",
        "CURSOR_MODEL_AUTO_OK",
        "surface_visibility",
        "state_contract",
        "backbone_verify",
    )
    if variant == "enhanced":
        required_names = tuple(weight_map.keys())

    dimensions: list[EvaluationDimension] = []
    for name, (kind, description, weight) in weight_map.items():
        if kind == "check":
            result = results_by_name.get(name)
            passed = bool(result and result.success)
            evidence = result.output_tail if result else "(result missing)"
        elif name == "CURSOR_MODEL_AUTO_OK":
            passed = name in auth_markers
            evidence = auth_evidence
        else:
            passed = name in smoke_markers
            evidence = smoke_evidence

        dimensions.append(
            EvaluationDimension(
                name=name,
                description=description,
                weight=weight,
                required=name in required_names,
                passed=passed,
                evidence=evidence,
            )
        )

    score = sum(d.weight for d in dimensions if d.passed)
    max_score = sum(d.weight for d in dimensions)
    threshold_score = sum(d.weight for d in dimensions if d.required)
    expected_baseline_score = sum(
        weight for name, (_, _, weight) in weight_map.items() if name != "CURSOR_AGENT_OK"
    )
    actual_delta_vs_baseline = score - expected_baseline_score
    required_delta_vs_baseline = max_score - expected_baseline_score
    passed = score >= threshold_score and all(d.passed for d in dimensions if d.required)

    return EvaluationContract(
        profile=profile,
        variant=variant,
        score=score,
        max_score=max_score,
        threshold_score=threshold_score,
        passed=passed,
        release_blocking=not passed,
        expected_baseline_score=expected_baseline_score,
        required_delta_vs_baseline=required_delta_vs_baseline,
        actual_delta_vs_baseline=actual_delta_vs_baseline,
        dimensions=dimensions,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=["backbone"], default="backbone")
    parser.add_argument("--root", default=".")
    parser.add_argument("--output-dir", default="benchmark/results")
    parser.add_argument("--run-agent-smoke", action="store_true")
    parser.add_argument("--variant", choices=["auto", "baseline", "enhanced"], default="auto")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    outdir = (root / args.output_dir).resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    if args.run_agent_smoke:
        env["RUN_CURSOR_AGENT_SMOKE"] = "1"

    variant = determine_variant(args.run_agent_smoke, args.variant)

    checks: list[tuple[str, str]] = [
        ("default_auth", "./scripts/check-default-auth.sh"),
        ("surface_visibility", "./scripts/validate-surface-visibility.sh"),
        ("state_contract", "./scripts/validate-state-contract.sh"),
        ("backbone_verify", "./scripts/verify-backbone.sh"),
    ]

    if args.run_agent_smoke:
        checks.append(("smoke_cursor", "./scripts/smoke-cursor-agent.sh --run-agent-prompt"))
    else:
        checks.append(("smoke_cursor", "./scripts/smoke-cursor-agent.sh"))

    results: list[CheckResult] = []
    for name, cmd in checks:
        result = run(cmd, root, env)
        result.name = name
        print(("PASS" if result.success else "FAIL"), name)
        results.append(result)

    evaluation = build_evaluation(args.profile, variant, results)

    results_json = outdir / f"{args.profile}_results.json"
    results_json.write_text(json.dumps([asdict(r) for r in results], indent=2) + "\n")

    evaluation_json = outdir / f"{args.profile}_evaluation.json"
    evaluation_json.write_text(json.dumps(asdict(evaluation), indent=2) + "\n")

    md_lines = [
        f"# Cursor Backbone Benchmark ({args.profile})",
        "",
        f"Root: `{root}`",
        "",
        f"Variant: `{evaluation.variant}`",
        "",
        "| Check | Result | Duration (s) | Markers |",
        "| --- | --- | ---: | --- |",
    ]
    for r in results:
        markers = ", ".join(f"`{marker}`" for marker in r.markers) or "—"
        md_lines.append(f"| `{r.name}` | {'PASS' if r.success else 'FAIL'} | {r.duration_sec} | {markers} |")
    md_lines.extend(
        [
            "",
            "## Evaluation contract",
            "",
            f"- Score: **{evaluation.score}/{evaluation.max_score}**",
            f"- Threshold: **{evaluation.threshold_score}/{evaluation.max_score}**",
            f"- Release gate: **{'PASS' if evaluation.passed else 'FAIL'}**",
            f"- Baseline floor: **{evaluation.expected_baseline_score}/{evaluation.max_score}**",
            f"- Actual delta vs baseline floor: **{evaluation.actual_delta_vs_baseline}**",
            f"- Required delta vs baseline floor: **{evaluation.required_delta_vs_baseline}**",
            "",
            "| Dimension | Required | Passed | Weight | Description |",
            "| --- | --- | --- | ---: | --- |",
        ]
    )
    for d in evaluation.dimensions:
        md_lines.append(
            f"| `{d.name}` | {'yes' if d.required else 'no'} | {'PASS' if d.passed else 'FAIL'} | {d.weight} | {d.description} |"
        )

    report_md = outdir / f"{args.profile}_report.md"
    report_md.write_text("\n".join(md_lines) + "\n")

    record_history(root, outdir, evaluation)

    return 0 if all(r.success for r in results) and evaluation.passed else 1


if __name__ == "__main__":
    sys.exit(main())
