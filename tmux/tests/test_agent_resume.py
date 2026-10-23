"""Unit checks plus a real, isolated resurrect cycle using fake agent binaries."""

import importlib.util
from contextlib import closing, redirect_stdout
import io
import json
import os
from pathlib import Path
import shlex
import shutil
import sqlite3
import subprocess
import tempfile
import time
import tomllib
import unittest
from unittest.mock import patch
import uuid


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = Path(
    os.environ.get("DOTFILE_RESURRECT", Path.home() / ".tmux/plugins/tmux-resurrect")
)
FIRST = "01a16542-5a21-7192-8f2b-b14ea70adc5e"
SECOND = "01a168ea-7506-7a12-b8b2-a1b0b1b30aab"
THIRD = "a6ee6dce-89c1-457c-9658-00f9a5b1ce5b"


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


resume = load("agent_resume", "agent-resume.py")
setup = load("setup_agent_resume", "setup-agent-resume.py")


def pane(title, command="codex --yolo", current="codex", index="0"):
    return (
        "\t".join(
            [
                "pane",
                "work",
                "0",
                "1",
                ":*",
                index,
                title,
                ":/tmp/project",
                "1",
                current,
                ":" + command,
            ]
        )
        + "\n"
    )


def catalog(home, ids):
    home.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(home / "state_5.sqlite")) as db, db:
        db.execute("CREATE TABLE threads (id TEXT, archived INTEGER)")
        db.executemany("INSERT INTO threads VALUES (?, 0)", [(sid,) for sid in ids])


class ResumeTests(unittest.TestCase):
    def test_two_chats_with_same_name_and_directory_keep_distinct_ids(self):
        title = "Readable conversation | project | "
        source = pane(title + FIRST[:29] + "...") + pane(title + SECOND, index="1")
        output, skipped = resume.rewrite_snapshot(source, {FIRST, SECOND}, {}, {})
        self.assertEqual(skipped, [])
        self.assertIn(":codex --yolo resume " + FIRST, output)
        self.assertIn(":codex --yolo resume " + SECOND, output)
        self.assertIn(title, output)

    def test_title_switch_overrides_stale_process_resume_id(self):
        source = pane("Readable | project | " + SECOND, "codex --yolo resume " + FIRST)
        output, _ = resume.rewrite_snapshot(source, {FIRST, SECOND}, {}, {})
        self.assertEqual(
            output.split("\t")[-1], ":codex --yolo resume " + SECOND + "\n"
        )

    def test_ambiguous_missing_and_unsaved_ids_restore_shells(self):
        collision = FIRST[:29] + "0000000"
        for title, ids in [
            ("Readable | project", {FIRST}),
            ("Readable | " + FIRST, set()),
            ("Readable | " + FIRST[:29] + "...", {FIRST, collision}),
        ]:
            with self.subTest(title=title, ids=ids):
                output, skipped = resume.rewrite_snapshot(
                    pane(title, "codex resume " + FIRST), ids, {}, {}
                )
                self.assertEqual(output.split("\t")[-1], ":\n")
                self.assertEqual(len(skipped), 1)

    def test_unrelated_records_are_preserved_byte_for_byte(self):
        source = (
            "grouped_session\tother\twork\t:0\t:1\n"
            + pane("Shell", "", "zsh")
            + "window\twork\t0\t:Name with spaces\nstate\twork\n"
        )
        self.assertEqual(resume.rewrite_snapshot(source, set(), {}, {})[0], source)

    def test_claude_requires_live_direct_child_of_correct_pane(self):
        state = json.dumps({"pid": 20, "id": FIRST})
        source = pane("Claude chat", "claude", "2.1.309")
        panes = {("work", "0", "0"): (10, state)}
        output, skipped = resume.rewrite_snapshot(
            source, set(), panes, {20: (10, "claude --resume " + FIRST)}
        )
        self.assertIn(
            ":claude --dangerously-skip-permissions --resume " + FIRST, output
        )
        self.assertEqual(skipped, [])
        for processes in [{}, {20: (11, "claude")}, {20: (10, "codex")}]:
            self.assertEqual(
                resume.rewrite_snapshot(source, set(), panes, processes)[0].split("\t")[
                    -1
                ],
                ":\n",
            )

    def test_catalog_uses_latest_database_and_excludes_archived(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            catalog(home, [FIRST, SECOND])
            with closing(sqlite3.connect(home / "state_5.sqlite")) as db, db:
                db.execute("UPDATE threads SET archived = 1 WHERE id = ?", (SECOND,))
            with closing(sqlite3.connect(home / "state_4.sqlite")) as db, db:
                db.execute("CREATE TABLE threads (id TEXT, archived INTEGER)")
                db.execute("INSERT INTO threads VALUES (?, 0)", (SECOND,))
            self.assertEqual(resume.codex_ids(home), {FIRST})
            self.assertFalse((home / "state_5.sqlite-journal").exists())

    def test_codex_setup_preserves_other_values_and_comments(self):
        examples = [
            "# keep this\nmodel = 'example'\n",
            "[tui]\nstatus_line = ['model']\n",
            "[tui]\nterminal_title = [\n  'project',\n]\n# keep this\n[tui.other]\nx = true\n",
            "[tui]\nstatus_line = ['model']",
        ]
        for original in examples:
            with self.subTest(original=original):
                expected = tomllib.loads(original)
                expected.setdefault("tui", {})["terminal_title"] = setup.TITLE_ITEMS
                output = setup.codex_config(original)
                self.assertEqual(tomllib.loads(output), expected)
                self.assertEqual(setup.codex_config(output), output)
                if "# keep this" in original:
                    self.assertIn("# keep this", output)

    def test_install_preserves_existing_hooks_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / ".claude").mkdir()
            settings = home / ".claude/settings.json"
            original = {
                "model": "example",
                "hooks": {
                    "SessionStart": [
                        {"hooks": [{"type": "command", "command": "existing-hook"}]}
                    ]
                },
            }
            settings.write_text(json.dumps(original))
            with (
                patch.dict(
                    os.environ,
                    {
                        "HOME": directory,
                        "CODEX_HOME": str(home / ".codex"),
                        "CLAUDE_CONFIG_DIR": str(home / ".claude"),
                    },
                ),
                redirect_stdout(io.StringIO()),
            ):
                setup.install()
                first = settings.read_bytes()
                setup.install()
            self.assertEqual(settings.read_bytes(), first)
            updated = json.loads(first)
            self.assertEqual(updated["model"], "example")
            self.assertEqual(
                updated["hooks"]["SessionStart"][0],
                original["hooks"]["SessionStart"][0],
            )
            self.assertEqual(len(updated["hooks"]["SessionStart"]), 2)
            self.assertTrue((home / ".config/tmux/agent-resume.py").is_symlink())


@unittest.skipUnless(
    shutil.which("tmux") and (PLUGIN / "scripts/restore.sh").is_file(),
    "tmux and tmux-resurrect are required for the isolated restore test",
)
class ResurrectTests(unittest.TestCase):
    def test_real_save_stop_restore_cycle_keeps_each_conversation(self):
        with tempfile.TemporaryDirectory(prefix="dotfile-resume-") as directory:
            root = Path(directory).resolve()
            home = root / "home"
            home.mkdir()
            codex_home = root / "codex"
            catalog(codex_home, [FIRST, SECOND])
            binaries = root / "bin"
            binaries.mkdir()
            log = root / "launches"
            fake = binaries / "codex"
            fake.write_text("""#!/bin/bash
agent="${0##*/}"
printf '%s %s\\n' "$agent" "$*" >> "$AGENT_TEST_LOG"
sid="${AGENT_TEST_SID:-}"
if [ -n "${AGENT_TEST_TITLE:-}" ]; then
  title="$AGENT_TEST_TITLE"
else
  while [ "$#" -gt 0 ] && [ "$1" != resume ] && [ "$1" != --resume ]; do shift; done
  shift
  sid="$1"
  title="Readable conversation | project | ${sid:0:29}..."
fi
if [ "$agent" = claude ]; then
  printf '{"session_id":"%s","hook_event_name":"SessionStart"}\\n' "$sid" | python3 "$AGENT_TEST_HELPER" claude-start
fi
printf '\\033]2;%s\\007' "$title"
exec -a "$agent" /bin/sleep 120
""")
            fake.chmod(0o755)
            shutil.copy2(fake, binaries / "claude")
            socket = "dotfile-resume-" + uuid.uuid4().hex
            env = {
                **os.environ,
                "HOME": str(home),
                "CODEX_HOME": str(codex_home),
                "PATH": str(binaries) + os.pathsep + os.environ["PATH"],
                "AGENT_TEST_LOG": str(log),
                "AGENT_TEST_HELPER": str(ROOT / "agent-resume.py"),
            }
            env.pop("TMUX", None)
            env.pop("TMUX_PANE", None)

            def tmux(*args):
                return subprocess.check_output(
                    ["tmux", "-L", socket, *args],
                    env=env,
                    text=True,
                    stderr=subprocess.STDOUT,
                ).strip()

            def configure():
                tmux("set-option", "-g", "default-shell", "/bin/sh")
                tmux("set-option", "-g", "@resurrect-dir", str(root / "snapshots"))
                tmux("set-option", "-g", "@resurrect-processes", "codex claude")
                tmux(
                    "set-option",
                    "-g",
                    "@resurrect-hook-post-save-layout",
                    shlex.join(
                        [os.sys.executable, str(ROOT / "agent-resume.py"), "save"]
                    ),
                )

            def save():
                tmux(
                    "run-shell", shlex.quote(str(PLUGIN / "scripts/save.sh")) + " quiet"
                )
                return (root / "snapshots/last").read_text()

            def await_titles(count):
                for _ in range(100):
                    rows = tmux("list-panes", "-a", "-F", "#{pane_pid}\t#{pane_title}")
                    procs = resume.processes()
                    # Resurrect restores the saved title before the process is
                    # ready. macOS can report "bash" for these mock processes,
                    # so wait for their final direct-child argv instead.
                    if (
                        sum(
                            "Readable conversation" in title
                            and any(
                                parent == int(pid)
                                and command in {"codex 120", "claude 120"}
                                for parent, command in procs.values()
                            )
                            for pid, title in (
                                line.split("\t", 1) for line in rows.splitlines()
                            )
                        )
                        >= count
                    ):
                        return
                    time.sleep(0.05)
                self.fail(f"Fake agents did not start: {rows}\n{log.read_text()}")

            try:
                tmux(
                    "-f",
                    "/dev/null",
                    "new-session",
                    "-d",
                    "-s",
                    "bootstrap",
                    "exec /bin/sh",
                )
                configure()
                for i, sid in enumerate([FIRST, SECOND]):
                    title = "Readable conversation | project | " + sid[:29] + "..."
                    command = (
                        shlex.join(
                            ["env", "AGENT_TEST_TITLE=" + title, str(fake), "--yolo"]
                        )
                        + "; exec /bin/sh"
                    )
                    if i == 0:
                        tmux(
                            "new-session", "-d", "-s", "work", "-c", str(root), command
                        )
                    else:
                        tmux(
                            "split-window",
                            "-h",
                            "-t",
                            "work:0",
                            "-c",
                            str(root),
                            command,
                        )
                claude_command = (
                    shlex.join(
                        [
                            "env",
                            "AGENT_TEST_TITLE=Readable conversation | project",
                            "AGENT_TEST_SID=" + THIRD,
                            str(binaries / "claude"),
                            "--dangerously-skip-permissions",
                        ]
                    )
                    + "; exec /bin/sh"
                )
                tmux(
                    "split-window",
                    "-h",
                    "-t",
                    "work:0",
                    "-c",
                    str(root),
                    claude_command,
                )
                await_titles(3)
                first_snapshot = save()
                self.assertIn(":codex --yolo resume " + FIRST, first_snapshot)
                self.assertIn(":codex --yolo resume " + SECOND, first_snapshot)
                self.assertIn(
                    ":claude --dangerously-skip-permissions --resume " + THIRD,
                    first_snapshot,
                )
                tmux("kill-server")
                tmux("-f", "/dev/null", "new-session", "-d", "-s", "0", "exec /bin/sh")
                configure()
                tmux("run-shell", shlex.quote(str(PLUGIN / "scripts/restore.sh")))
                await_titles(3)
                launches = log.read_text().splitlines()
                self.assertEqual(launches.count("codex --yolo resume " + FIRST), 1)
                self.assertEqual(launches.count("codex --yolo resume " + SECOND), 1)
                self.assertEqual(
                    launches.count(
                        "claude --dangerously-skip-permissions --resume " + THIRD
                    ),
                    1,
                )
                self.assertEqual(
                    tmux(
                        "list-panes", "-t", "work:0", "-F", "#{pane_current_path}"
                    ).splitlines(),
                    [str(root)] * 3,
                )
                second_snapshot = save()
                self.assertIn(":codex --yolo resume " + FIRST, second_snapshot)
                self.assertIn(":codex --yolo resume " + SECOND, second_snapshot)
                self.assertIn(
                    ":claude --dangerously-skip-permissions --resume " + THIRD,
                    second_snapshot,
                )
            finally:
                subprocess.run(
                    ["tmux", "-L", socket, "kill-server"], env=env, capture_output=True
                )


if __name__ == "__main__":
    unittest.main()
