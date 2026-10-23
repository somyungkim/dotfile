#!/usr/bin/env python3
"""Save exact agent resume commands in tmux-resurrect's own snapshot."""

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import re
import shlex
import sqlite3
import subprocess
import sys
import tempfile


UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
TITLE_ID = re.compile(
    rf"(?:{UUID}|[0-9a-f]{{8}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{5}}(?:\.\.\.|…))",
    re.I,
)
CLAUDE_OPTION = "@dotfile-claude-session"


def tmux(*args):
    return subprocess.check_output(["tmux", *args], text=True).strip()


def tool_for(command, current=""):
    if current == "codex":
        return "codex"
    try:
        argv = shlex.split(command)
    except ValueError:
        return None
    if not argv:
        return None
    name = Path(argv[0]).name
    if name in {"codex", "claude"}:
        return name
    if name in {"node", "bash", "sh", "zsh"} and len(argv) > 1:
        script = Path(argv[1])
        if script.name in {"codex", "codex.js", "claude"}:
            return "codex" if script.name.startswith("codex") else "claude"
        if script.name == "cli.js" and "claude-code" in str(script):
            return "claude"
    return None


def codex_ids(home):
    """Read saved identities, never infer a session from its cwd or recency."""
    ids = set()
    databases = sorted(
        (
            path
            for path in home.glob("state_*.sqlite")
            if re.fullmatch(r"state_\d+\.sqlite", path.name)
        ),
        key=lambda path: int(path.stem.removeprefix("state_")),
        reverse=True,
    )
    for path in databases:
        try:
            with closing(
                sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
            ) as db:
                ids.update(
                    row[0]
                    for row in db.execute("SELECT id FROM threads WHERE archived = 0")
                )
            return {
                sid.lower()
                for sid in ids
                if isinstance(sid, str) and re.fullmatch(UUID, sid, re.I)
            }
        except sqlite3.Error:
            continue
    # Also support installations without the state database. Archived sessions
    # are intentionally excluded, as they are not an active restore target.
    for path in (home / "sessions").rglob("rollout-*.jsonl"):
        match = re.search(rf"({UUID})\.jsonl$", path.name, re.I)
        if match:
            ids.add(match[1])
    return {
        sid.lower()
        for sid in ids
        if isinstance(sid, str) and re.fullmatch(UUID, sid, re.I)
    }


def codex_session(title, ids):
    # Setup puts Thread ID last, leaving the conversation and project readable.
    token = title.rsplit(" | ", 1)[-1].strip().lower()
    if not TITLE_ID.fullmatch(token):
        return None
    prefix = token.removesuffix("...").removesuffix("…")
    matches = [sid for sid in ids if sid.startswith(prefix)]
    return matches[0] if len(matches) == 1 else None


def processes():
    rows = subprocess.check_output(["ps", "-axo", "pid=,ppid=,args="], text=True)
    result = {}
    for line in rows.splitlines():
        fields = line.split(None, 2)
        if len(fields) == 3:
            result[int(fields[0])] = (int(fields[1]), fields[2])
    return result


def claude_panes():
    rows = tmux(
        "list-panes",
        "-a",
        "-F",
        "#{session_name}\t#{window_index}\t#{pane_index}\t#{pane_pid}\t#{"
        + CLAUDE_OPTION
        + "}",
    )
    return {
        tuple(fields[:3]): (int(fields[3]), fields[4])
        for line in rows.splitlines()
        if len(fields := line.split("\t")) == 5
    }


def claude_session(pane, procs):
    if not pane:
        return None
    shell_pid, raw = pane
    try:
        state = json.loads(raw)
        pid, sid = state["pid"], state["id"]
    except (ValueError, KeyError, TypeError):
        return None
    # A later agent in the same pane must never inherit the old session ID.
    if not isinstance(sid, str) or not re.fullmatch(UUID, sid, re.I):
        return None
    if (
        pid not in procs
        or procs[pid][0] != shell_pid
        or tool_for(procs[pid][1]) != "claude"
    ):
        return None
    return sid.lower()


def record_claude():
    """Claude's SessionStart hook; Codex deliberately uses no agent hook."""
    pane = os.environ.get("TMUX_PANE")
    if not pane or not os.environ.get("TMUX"):
        return
    event = json.load(sys.stdin)
    sid = event.get("session_id", "")
    if event.get("hook_event_name") != "SessionStart" or not re.fullmatch(
        UUID, sid, re.I
    ):
        return
    shell_pid = int(tmux("display-message", "-p", "-t", pane, "#{pane_pid}"))
    procs = processes()
    pid = os.getppid()
    while pid in procs and pid != shell_pid:
        parent, command = procs[pid]
        if parent == shell_pid and tool_for(command) == "claude":
            tmux(
                "set-option",
                "-p",
                "-t",
                pane,
                CLAUDE_OPTION,
                json.dumps({"pid": pid, "id": sid}),
            )
            return
        pid = parent


def rewrite_snapshot(text, ids, panes, procs):
    lines, skipped = [], []
    for line in text.splitlines(keepends=True):
        fields = line.rstrip("\n").split("\t")
        if len(fields) != 11 or fields[0] != "pane":
            lines.append(line)
            continue
        tool = tool_for(fields[10].removeprefix(":"), fields[9])
        if not tool:
            lines.append(line)
            continue
        target = (fields[1], fields[2], fields[5])
        sid = (
            codex_session(fields[6], ids)
            if tool == "codex"
            else claude_session(panes.get(target), procs)
        )
        if sid:
            fields[9] = tool
            fields[10] = (
                f":codex --yolo resume {sid}"
                if tool == "codex"
                else f":claude --dangerously-skip-permissions --resume {sid}"
            )
        else:
            # Replaying a bare launch or stale resume would open the wrong chat.
            fields[10] = ":"
            skipped.append(f"{fields[1]}:{fields[2]}.{fields[5]} ({tool})")
        lines.append("\t".join(fields) + ("\n" if line.endswith("\n") else ""))
    return "".join(lines), skipped


def save(path):
    original = path.read_text()
    home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    has_claude = any(
        tool_for(f[-1].removeprefix(":"), f[9]) == "claude"
        for line in original.splitlines()
        if len(f := line.split("\t")) == 11 and f[0] == "pane"
    )
    try:
        ids = codex_ids(home)
    except OSError:
        ids = set()
    try:
        panes, procs = (claude_panes(), processes()) if has_claude else ({}, {})
    except (OSError, subprocess.SubprocessError):
        panes, procs = {}, {}
    updated, skipped = rewrite_snapshot(original, ids, panes, procs)
    # Publish all changes together; retain every unrelated snapshot record.
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".")
    try:
        with os.fdopen(fd, "w") as out:
            out.write(updated)
        os.chmod(temporary, path.stat().st_mode & 0o777)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)
    for target in skipped:
        print(
            f"agent-resume: {target}: no verified session ID; will restore as a shell",
            file=sys.stderr,
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("claude-start")
    commands.add_parser("save").add_argument("snapshot", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "save":
            save(args.snapshot)
        else:
            record_claude()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"agent-resume: {error}", file=sys.stderr)
        sys.exit(1)
