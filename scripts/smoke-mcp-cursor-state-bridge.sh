#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# AC-109 fast-path: gate on env var FIRST, before any other work
# ---------------------------------------------------------------------------
if [[ "${RUN_MCP_BRIDGE_SMOKE:-0}" != "1" ]]; then
  echo "bounded: smoke gated by RUN_MCP_BRIDGE_SMOKE=1"
  exit 0
fi

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MODE_FULL=0
MODE_JAIL_ESCAPE=0
MODE_FROM_EXAMPLE=0
MODE_AUTH=0

if [[ $# -eq 0 ]]; then
  MODE_FULL=1
fi

while (($#)); do
  case "$1" in
    --full)         MODE_FULL=1;        shift ;;
    --jail-escape)  MODE_JAIL_ESCAPE=1; shift ;;
    --from-example) MODE_FROM_EXAMPLE=1; shift ;;
    --auth)         MODE_AUTH=1;        shift ;;
    *)
      echo "FAIL: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Python helper: send one JSON-RPC request and read one response line
# Embedded as a heredoc so bash stays self-contained.
# ---------------------------------------------------------------------------

PYTHON_HELPER="$(cat <<'PYEOF'
import json, subprocess, sys, os, tempfile

def send_recv(proc, obj):
    line = json.dumps(obj) + "\n"
    proc.stdin.write(line.encode())
    proc.stdin.flush()
    resp_line = proc.stdout.readline()
    if not resp_line:
        raise RuntimeError("bridge closed stdout without responding")
    return json.loads(resp_line.decode())

def spawn_bridge(workspace, extra_args=None):
    cmd = [sys.executable,
           os.path.join(workspace, "mcp", "cursor-state-bridge", "__main__.py"),
           "--workspace", workspace]
    if extra_args:
        cmd.extend(extra_args)
    return subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

def spawn_bridge_from_cmd(command, args, workspace):
    # Substitute ${workspaceFolder} -> workspace in each arg
    resolved_args = [a.replace("${workspaceFolder}", workspace) for a in args]
    cmd = [command] + resolved_args
    return subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

INIT_REQ   = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
TOOLS_LIST = {"jsonrpc": "2.0", "id": 2, "method": "tools/list",  "params": {}}

mode = sys.argv[1]
workspace = sys.argv[2]

if mode == "full":
    proc = spawn_bridge(workspace)
    try:
        r1 = send_recv(proc, INIT_REQ)
        assert "result" in r1, f"initialize failed: {r1}"
        r2 = send_recv(proc, TOOLS_LIST)
        assert "result" in r2, f"tools/list failed: {r2}"
        tools = r2["result"].get("tools", [])
        n = len(tools)
        assert n == 6, f"expected 6 tools, got {n}: {[t['name'] for t in tools]}"
        print(f"tools={n}")
    finally:
        proc.stdin.close()
        proc.wait(timeout=5)

elif mode == "jail-escape":
    proc = spawn_bridge(workspace)
    try:
        send_recv(proc, INIT_REQ)
        evil = {
            "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": {"name": "state_read", "arguments": {"task_id": "../../etc/passwd"}},
        }
        r = send_recv(proc, evil)
        assert "error" in r, f"expected error response, got: {r}"
        code = r["error"]["code"]
        assert code == -32602, f"expected code -32602, got {code}"
        print(f"jail-escape: rejected ({code})")
    finally:
        proc.stdin.close()
        proc.wait(timeout=5)

elif mode == "from-example":
    import pathlib
    example_path = pathlib.Path(workspace) / ".cursor" / "mcp.example.json"
    data = json.loads(example_path.read_text(encoding="utf-8"))
    servers = data.get("mcpServers", {})
    if not servers:
        raise RuntimeError("mcp.example.json has no mcpServers")
    # Use first server entry
    srv = next(iter(servers.values()))
    command = srv["command"]
    args = srv.get("args", [])
    proc = spawn_bridge_from_cmd(command, args, workspace)
    try:
        r1 = send_recv(proc, INIT_REQ)
        assert "result" in r1, f"initialize failed: {r1}"
        print("from-example: ok")
    finally:
        proc.stdin.close()
        proc.wait(timeout=5)

else:
    raise SystemExit(f"unknown mode: {mode}")
PYEOF
)"

# ---------------------------------------------------------------------------
# Modes
# ---------------------------------------------------------------------------

if [[ "$MODE_FULL" == "1" ]]; then
  python3 -c "$PYTHON_HELPER" full "$ROOT"
fi

if [[ "$MODE_JAIL_ESCAPE" == "1" ]]; then
  python3 -c "$PYTHON_HELPER" jail-escape "$ROOT"
fi

if [[ "$MODE_FROM_EXAMPLE" == "1" ]]; then
  python3 -c "$PYTHON_HELPER" from-example "$ROOT"
fi

if [[ "$MODE_AUTH" == "1" ]]; then
  echo "auth mode: deferred to Phase 6"
fi

echo "MCP_BRIDGE_SMOKE_OK"
