#!/usr/bin/env python3
"""Install dotfile's agent-resume helper and merge only its client settings."""

from datetime import datetime
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys
import tempfile
import tomllib


TITLE_ITEMS = ["activity", "thread-title", "project-name", "thread-id"]


def codex_config(text):
    before = tomllib.loads(text)
    if before.get("tui", {}).get("terminal_title") == TITLE_ITEMS:
        return text
    # Replace just this key, including multiline arrays, without serializing the
    # rest of the user's TOML (comments, models, credentials, and profiles).
    lines = (text + ("\n" if text and not text.endswith("\n") else "")).splitlines(
        keepends=True
    )
    section = None
    replacement = "terminal_title = " + json.dumps(TITLE_ITEMS) + "\n"
    for i, line in enumerate(lines):
        if re.fullmatch(r"\s*\[tui\]\s*(?:#.*)?\n?", line):
            section = i
            continue
        if section is not None:
            if line.lstrip().startswith("["):
                lines.insert(i, replacement)
                break
            if re.match(r"\s*terminal_title\s*=", line):
                end = i + 1
                while True:
                    try:
                        tomllib.loads("[tui]\n" + "".join(lines[i:end]))
                        break
                    except tomllib.TOMLDecodeError:
                        end += 1
                        if end > len(lines):
                            raise ValueError("Could not isolate tui.terminal_title")
                lines[i:end] = [replacement]
                break
    else:
        if section is None:
            lines.append("\n[tui]\n" + replacement)
        else:
            lines.append(replacement)
    updated = "".join(lines)
    expected = dict(before)
    expected["tui"] = {**before.get("tui", {}), "terminal_title": TITLE_ITEMS}
    if tomllib.loads(updated) != expected:
        raise ValueError("Refusing to change unrelated Codex settings")
    return updated


def install():
    home = Path.home()
    helper = Path(__file__).resolve().with_name("agent-resume.py")
    link = home / ".config/tmux/agent-resume.py"
    if (link.exists() or link.is_symlink()) and link.resolve() != helper:
        raise ValueError(f"Existing helper belongs to another installation: {link}")
    codex = Path(os.environ.get("CODEX_HOME", home / ".codex")) / "config.toml"
    claude = (
        Path(os.environ.get("CLAUDE_CONFIG_DIR", home / ".claude")) / "settings.json"
    )
    old_codex = codex.read_text() if codex.exists() else ""
    new_codex = codex_config(old_codex)
    old_claude = claude.read_text() if claude.exists() else "{}\n"
    settings = json.loads(old_claude)
    hook_command = shlex.join([sys.executable, str(link), "claude-start"])
    hooks = settings.setdefault("hooks", {}).setdefault("SessionStart", [])
    present = any(
        hook.get("command") == hook_command
        for group in hooks
        for hook in group.get("hooks", [])
    )
    if not present:
        hooks.append(
            {"hooks": [{"type": "command", "command": hook_command, "timeout": 5}]}
        )
    new_claude = old_claude if present else json.dumps(settings, indent=2) + "\n"
    changes = [
        (path, content)
        for path, old, content in [
            (codex, old_codex, new_codex),
            (claude, old_claude, new_claude),
        ]
        if old != content
    ]
    if changes:
        backup_root = home / ".dotfile-backups"
        backup_root.mkdir(exist_ok=True)
        backup = Path(
            tempfile.mkdtemp(
                prefix=datetime.now().strftime("agent-resume-%Y%m%d-%H%M%S-"),
                dir=backup_root,
            )
        )
        for path, _ in changes:
            if path.exists():
                shutil.copy2(
                    path,
                    backup
                    / (
                        "codex-config.toml" if path == codex else "claude-settings.json"
                    ),
                )
        print(f"Backup: {backup}")
    link.parent.mkdir(parents=True, exist_ok=True)
    if not link.is_symlink():
        link.symlink_to(helper)
    for path, content in changes:
        path.parent.mkdir(parents=True, exist_ok=True)
        target = path.resolve()
        fd, temporary = tempfile.mkstemp(dir=target.parent, prefix=target.name + ".")
        try:
            with os.fdopen(fd, "w") as out:
                out.write(content)
            os.chmod(
                temporary, target.stat().st_mode & 0o777 if target.exists() else 0o600
            )
            os.replace(temporary, target)
        finally:
            Path(temporary).unlink(missing_ok=True)
        if path.read_text() != content:
            raise OSError(f"Read-back mismatch: {path}")
        print(f"Updated: {path}")
    print(f"Helper: {link} -> {helper}")


if __name__ == "__main__":
    install()
