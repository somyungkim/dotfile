# Personal configuration

Terminal, shell, and agent configs for Apple Silicon macOS (Homebrew at
`/opt/homebrew`) and Fedora Linux. The same files work on both: configs detect
installed tools and the OS at runtime. After setup, edit files here; live configs
are symlinks to this checkout. Recreate the links if you move it.

## Setup

Install packages for the included configs, then clone the repository.

**macOS:** install [Homebrew](https://brew.sh/) and Git first.

```sh
brew install tmux starship pyenv nvm zsh-autosuggestions zsh-syntax-highlighting
brew install --cask ghostty wezterm font-jetbrains-mono
mkdir -p "$HOME/.nvm"
```

**Fedora:** Ghostty and WezTerm are not in the Fedora repositories; install them
from their websites. Install starship, nvm, and pyenv with their install scripts.
Run the nvm script with `PROFILE=/dev/null` so it does not append to the symlinked
`.zshrc`. Log out and back in after changing the shell.

```sh
sudo dnf install zsh git tmux jetbrains-mono-fonts google-noto-color-emoji-fonts \
  zsh-autosuggestions zsh-syntax-highlighting poppler-utils util-linux-user
chsh -s "$(command -v zsh)"
curl -sS https://starship.rs/install.sh | sh -s -- -b "$HOME/.local/bin"
PROFILE=/dev/null bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash'
curl -fsSL https://pyenv.run | bash
```

**Both:**

```sh
mkdir -p "$HOME/workspace"
git clone https://github.com/somyungkim/dotfile.git "$HOME/workspace/dotfile"
cd "$HOME/workspace/dotfile"
```

Ghostty and WezTerm are alternatives; install whichever you use. Install agent
clients/plugins separately; Claude's rules expect the Context7 plugin and `mac-ocr`
on macOS or `pdftotext` on Linux.
WezTerm fetches [tabline.wez](https://github.com/michaelbrusegard/tabline.wez) on first use.

Review the shell files before applying: they differ from the original Mac's live
copies. Node/Python versions and global packages are installed separately.

Run the following block from the repository root in **zsh**. It backs up existing
destinations, including directories and symlinks, then creates the links. Save the
printed backup path. For partial setup, omit the corresponding backup entries and
`ln` commands; agent clients still need the shared `.config/agents/AGENTS.md` link.

```sh
(
set -e
dotfile_repo="$(pwd -P)"
test -f "$dotfile_repo/agents/AGENTS.md"
dotfile_paths=(
  .tmux.conf .wezterm.lua .zshrc .zprofile
  .config/ghostty .config/starship.toml .config/agents/AGENTS.md
  .claude/CLAUDE.md .codex/AGENTS.md
  .copilot/copilot-instructions.md .pi/agent/AGENTS.md
)
mkdir -p "$HOME/.dotfile-backups"
dotfile_backup="$(mktemp -d "$HOME/.dotfile-backups/install-XXXXXXXX")"
printf 'Backup: %s\n' "$dotfile_backup"
for dotfile_rel in "${dotfile_paths[@]}"; do
  if [ -e "$HOME/$dotfile_rel" ] || [ -L "$HOME/$dotfile_rel" ]; then
    mkdir -p "$dotfile_backup/$(dirname "$dotfile_rel")"
    mv "$HOME/$dotfile_rel" "$dotfile_backup/$dotfile_rel"
  fi
done
mkdir -p "$HOME/.config/agents" "$HOME/.claude" "$HOME/.codex" \
  "$HOME/.copilot" "$HOME/.pi/agent"
ln -s "$dotfile_repo/tmux/tmux.conf" "$HOME/.tmux.conf"
ln -s "$dotfile_repo/wezterm/wezterm.lua" "$HOME/.wezterm.lua"
ln -s "$dotfile_repo/zsh/.zshrc" "$HOME/.zshrc"
ln -s "$dotfile_repo/zsh/.zprofile" "$HOME/.zprofile"
ln -s "$dotfile_repo/ghostty" "$HOME/.config/ghostty"
ln -s "$dotfile_repo/starship/starship.toml" "$HOME/.config/starship.toml"
ln -s "$dotfile_repo/agents/AGENTS.md" "$HOME/.config/agents/AGENTS.md"
ln -s "$dotfile_repo/claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
ln -s "$HOME/.config/agents/AGENTS.md" "$HOME/.codex/AGENTS.md"
ln -s "$HOME/.config/agents/AGENTS.md" "$HOME/.copilot/copilot-instructions.md"
ln -s "$HOME/.config/agents/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
)
```

## Configuration map

| Source | Destination |
| --- | --- |
| `tmux/tmux.conf` | `~/.tmux.conf` |
| `wezterm/wezterm.lua` | `~/.wezterm.lua` |
| `ghostty/` | `~/.config/ghostty/` |
| `zsh/.zshrc` | `~/.zshrc` |
| `zsh/.zprofile` | `~/.zprofile` |
| `starship/starship.toml` | `~/.config/starship.toml` |
| `agents/AGENTS.md` | `~/.config/agents/AGENTS.md` |
| `claude/CLAUDE.md` | `~/.claude/CLAUDE.md` |
| `~/.config/agents/AGENTS.md` | `~/.codex/AGENTS.md` |
| `~/.config/agents/AGENTS.md` | `~/.copilot/copilot-instructions.md` |
| `~/.config/agents/AGENTS.md` | `~/.pi/agent/AGENTS.md` |

Claude imports the shared file and appends Claude-specific rules.

Ghostty reads `~/.config/ghostty/config` on both macOS and Linux. On macOS, do not
also keep a config in `~/Library/Application Support/com.mitchellh.ghostty/`;
Ghostty loads both.

## Notes

- **tmux plugins:** if TPM is absent, run
  `git clone https://github.com/tmux-plugins/tpm "$HOME/.tmux/plugins/tpm"`.
  Start tmux, then press **Ctrl+b**, followed by **Shift+i**, to install plugins.
  The config enables automatic session saving and restoration at server startup.
- **Reload:** tmux **Ctrl+b**, then **r**; Ghostty **Reload Configuration**;
  WezTerm reloads automatically. Open a new shell or agent session for their changes.
- **Restore:** remove the destination symlink with `unlink`, then move its original
  from the printed backup directory back into place. Backups mirror paths relative
  to your home directory. If no original existed, only remove the new symlink.
