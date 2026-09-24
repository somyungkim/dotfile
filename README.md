# Personal configuration

Terminal, shell, and agent configs for Apple Silicon macOS with Homebrew at
`/opt/homebrew`. After setup, edit files here; live configs are symlinks to this
checkout. Recreate the links if you move it.

## Setup

Install [Homebrew](https://brew.sh/) and Git first. Packages for the included configs:

```sh
brew install tmux starship pyenv nvm zsh-autosuggestions zsh-syntax-highlighting
brew install --cask ghostty wezterm font-jetbrains-mono
mkdir -p "$HOME/.nvm"
mkdir -p "$HOME/workspace"
git clone https://github.com/somyungkim/dotfile.git "$HOME/workspace/dotfile"
cd "$HOME/workspace/dotfile"
```

Ghostty and WezTerm are alternatives; install whichever you use. Install agent
clients/plugins separately; Claude's rules expect the Context7 plugin and `mac-ocr`.
WezTerm fetches [tabline.wez](https://github.com/michaelbrusegard/tabline.wez) on first use.

Before linking, replace `/Users/somyung.kim` with your home directory in:

- `zsh/.zshrc`: `NVM_DIR`.
- `wezterm/wezterm.lua`: `config.default_cwd`.
- `ghostty/config`: `working-directory` and `macos-custom-icon`.

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
  'Library/Application Support/com.mitchellh.ghostty/config'
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
  "$HOME/.copilot" "$HOME/.pi/agent" \
  "$HOME/Library/Application Support/com.mitchellh.ghostty"
ln -s "$dotfile_repo/tmux/tmux.conf" "$HOME/.tmux.conf"
ln -s "$dotfile_repo/wezterm/wezterm.lua" "$HOME/.wezterm.lua"
ln -s "$dotfile_repo/zsh/.zshrc" "$HOME/.zshrc"
ln -s "$dotfile_repo/zsh/.zprofile" "$HOME/.zprofile"
ln -s "$dotfile_repo/ghostty/config" "$HOME/Library/Application Support/com.mitchellh.ghostty/config"
ln -s "$dotfile_repo/ghostty/assets" "$HOME/.config/ghostty"
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
| `ghostty/config` | `~/Library/Application Support/com.mitchellh.ghostty/config` |
| `ghostty/assets/` | `~/.config/ghostty/` |
| `zsh/.zshrc` | `~/.zshrc` |
| `zsh/.zprofile` | `~/.zprofile` |
| `starship/starship.toml` | `~/.config/starship.toml` |
| `agents/AGENTS.md` | `~/.config/agents/AGENTS.md` |
| `claude/CLAUDE.md` | `~/.claude/CLAUDE.md` |
| `~/.config/agents/AGENTS.md` | `~/.codex/AGENTS.md` |
| `~/.config/agents/AGENTS.md` | `~/.copilot/copilot-instructions.md` |
| `~/.config/agents/AGENTS.md` | `~/.pi/agent/AGENTS.md` |

Claude imports the shared file and appends Claude-specific rules.

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
