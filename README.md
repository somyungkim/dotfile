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
clients/plugins separately; Claude's PDF rules expect `mac-ocr` on macOS or
`pdftotext` on Linux.
WezTerm fetches [tabline.wez](https://github.com/michaelbrusegard/tabline.wez) on first use.
For the Neovim setup, install Neovim, ripgrep, and Lazygit separately.

Review the shell files before applying: they differ from the original Mac's live
copies. Node/Python versions and global packages are installed separately.

If migrating Pi from `pi-mcp-adapter`, run `pi remove npm:pi-mcp-adapter`
**before linking** the configuration below. The checked-in Pi settings use built-in
MCP support instead; see the Pi notes below for package setup and sign-in.

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
  .config/ghostty .config/nvim .config/starship.toml .config/agents/AGENTS.md
  .claude/CLAUDE.md .codex/AGENTS.md
  .copilot/copilot-instructions.md .pi/agent/AGENTS.md
  .pi/agent/settings.json .pi/agent/mcp.json .pi/agent/keybindings.json
  .pi/agent/extensions/queue-editor.ts .pi/agent/extensions/queue-editor
  .pi/agent/extensions/compact-tools.ts .pi/agent/themes/dark-flat.json
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
  "$HOME/.copilot" "$HOME/.pi/agent/extensions" "$HOME/.pi/agent/themes"
ln -s "$dotfile_repo/tmux/tmux.conf" "$HOME/.tmux.conf"
ln -s "$dotfile_repo/wezterm/wezterm.lua" "$HOME/.wezterm.lua"
ln -s "$dotfile_repo/zsh/.zshrc" "$HOME/.zshrc"
ln -s "$dotfile_repo/zsh/.zprofile" "$HOME/.zprofile"
ln -s "$dotfile_repo/ghostty" "$HOME/.config/ghostty"
ln -s "$dotfile_repo/nvim" "$HOME/.config/nvim"
ln -s "$dotfile_repo/starship/starship.toml" "$HOME/.config/starship.toml"
ln -s "$dotfile_repo/agents/AGENTS.md" "$HOME/.config/agents/AGENTS.md"
ln -s "$dotfile_repo/claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
ln -s "$HOME/.config/agents/AGENTS.md" "$HOME/.codex/AGENTS.md"
ln -s "$HOME/.config/agents/AGENTS.md" "$HOME/.copilot/copilot-instructions.md"
ln -s "$HOME/.config/agents/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
ln -s "$dotfile_repo/pi/settings.json" "$HOME/.pi/agent/settings.json"
ln -s "$dotfile_repo/pi/mcp.json" "$HOME/.pi/agent/mcp.json"
ln -s "$dotfile_repo/pi/keybindings.json" "$HOME/.pi/agent/keybindings.json"
ln -s "$dotfile_repo/pi/extensions/queue-editor" "$HOME/.pi/agent/extensions/queue-editor"
ln -s "$dotfile_repo/pi/extensions/compact-tools.ts" "$HOME/.pi/agent/extensions/compact-tools.ts"
ln -s "$dotfile_repo/pi/themes/dark-flat.json" "$HOME/.pi/agent/themes/dark-flat.json"
)
```

## Configuration map

| Source | Destination |
| --- | --- |
| `tmux/tmux.conf` | `~/.tmux.conf` |
| `wezterm/wezterm.lua` | `~/.wezterm.lua` |
| `ghostty/` | `~/.config/ghostty/` |
| `nvim/` | `~/.config/nvim/` |
| `zsh/.zshrc` | `~/.zshrc` |
| `zsh/.zprofile` | `~/.zprofile` |
| `starship/starship.toml` | `~/.config/starship.toml` |
| `lazygit/config.yml` | `$(lazygit --print-config-dir)/config.yml` |
| `agents/AGENTS.md` | `~/.config/agents/AGENTS.md` |
| `claude/CLAUDE.md` | `~/.claude/CLAUDE.md` |
| `~/.config/agents/AGENTS.md` | `~/.codex/AGENTS.md` |
| `~/.config/agents/AGENTS.md` | `~/.copilot/copilot-instructions.md` |
| `~/.config/agents/AGENTS.md` | `~/.pi/agent/AGENTS.md` |
| `pi/settings.json` | `~/.pi/agent/settings.json` |
| `pi/mcp.json` | `~/.pi/agent/mcp.json` |
| `pi/keybindings.json` | `~/.pi/agent/keybindings.json` |
| `pi/extensions/queue-editor/` | `~/.pi/agent/extensions/queue-editor/` |
| `pi/extensions/compact-tools.ts` | `~/.pi/agent/extensions/compact-tools.ts` |
| `pi/themes/dark-flat.json` | `~/.pi/agent/themes/dark-flat.json` |

Claude imports the shared file and appends Claude-specific rules.

Ghostty reads `~/.config/ghostty/config` on both macOS and Linux. On macOS, do not
also keep a config in `~/Library/Application Support/com.mitchellh.ghostty/`;
Ghostty loads both.

## Notes

- **Pi:** `pi/settings.json` selects the `dark-flat` theme, GPT-6 Astra through GitHub
  Copilot, and medium reasoning. After linking, install the declared packages:

  ```sh
  pi install npm:pi-web-access
  pi install npm:@datadog/pi-plugin@0.7.21
  pi install npm:@juicesharp/rpiv-ask-user-question@2.12.0
  ```

  The Datadog and questionnaire versions are pinned; change the package specs
  deliberately when upgrading. Restart Pi after installation.
  Built-in MCP remains enabled for Atlassian only, via `pi/mcp.json`, with its
  default `codemode` exposure. Run `pi mcp list` to check it and
  `pi mcp login atlassian` if sign-in is required. Do not install `pi-mcp-adapter`
  or add `-builtin:mcp` to `extensions`.
  Keep credentials (`auth.json`, `mcp-auth.json`), sessions, and caches local,
  outside this repository. Use environment-variable references for any future
  secrets in `mcp.json`. Pi settings and MCP edits through the CLI/UI can update
  these symlinked repository files; review the diff before committing.
  Local footer, recap, and fork-chat extensions are not managed here.
- **Datadog:** `@datadog/pi-plugin` owns the Datadog connection instead of built-in
  MCP. Open `/datadog`, choose the Datadog site, and sign in. Its separate OAuth
  grant is stored under `~/.pi/agent/datadog/`, not in this repository; existing
  built-in MCP credentials are not reused. Removing the old MCP entry leaves its
  unused credentials local, without revoking the remote grant.
  The first connection becomes the default for new sessions; `/datadog toolsets`
  manages capabilities. The plugin defaults to `core,visualizations` and exposes
  `datadog`, `ddconfig`, and `ddtoolsets`. Datadog account permissions still govern
  access; the plugin is not a read-only permission boundary.
  For the optional macOS visualization preview, start `DDVIZ_ENABLED=1 pi`.
  `/datadog ddviz` checks prerequisites; Shift+Right Arrow opens the panel after a
  chart-producing call. This feature requires macOS 13+ and Xcode Command Line
  Tools and is not enabled globally by these dotfiles.
- **Structured questions:** `@juicesharp/rpiv-ask-user-question` adds the
  `ask_user_question` tool, with up to four questions, choices, and free-text
  answers. It does not replace the main editor or require another model/API key.
  Dialog text input follows Pi's newline binding, including Option+Enter; Tab
  navigates questionnaire tabs rather than queueing a chat message. The tool is
  hidden in non-interactive runs. Optional overrides remain local at
  `~/.config/rpiv-ask-user-question/config.json`; none are needed for this setup.
- **Pi tool presentation:** `dark-flat` copies Pi 1.1's dark theme, changing only
  the three tool background colors to the terminal default. User-message and
  selection backgrounds stay unchanged. `compact-tools.ts` adds a presentation-only
  wrapper for built-in tools and codemode: one collapsed call row and up to three
  result-preview rows, with expansion hints and explicit status/error indicators.
  Click a completed tool or press Ctrl+O for the native expanded output, commands,
  and diffs. Normal tool truncation limits still apply; truncation is indicated.
  Pi still owns one separator line between tool calls. Plugin-specific renderers,
  including Datadog charts and questionnaires, keep their layouts; plugins using
  the standard tool background colors also become background-free. No tool
  implementations, permissions, or model-facing results are changed.
  Run `/reload` after setup. Foregrounds pass AA against the configured Rose Pine
  Moon background, including color-vision simulations, but Ghostty's 0.6 opacity
  makes actual contrast depend on the desktop/window behind it.
- **Pi keyboard:** Option/Alt+Enter inserts a newline; Shift+Enter and Ctrl+J remain
  available. Enter submits while idle and steers while working, without cancelling
  running tools. Tab queues a follow-up while working with a nonempty draft.
  The `queue-editor` extension keeps Tab completion when idle, when a completion
  menu is open, or in a slash-command/explicit path context. While working, use
  `@file` or `./file` to complete a bare filename; add a space after a completed path
  to queue the draft with Tab. Option/Alt+Up still restores queued messages.
  An empty Enter does not send queued messages. Link both the keybindings and the
  extension: without the extension, the Tab binding would override completion.
  Run `/reload` in Pi after changes. This extension owns the main editor factory;
  do not combine it with another custom-editor extension.
  When upgrading from the earlier single-file extension, remove its old
  `~/.pi/agent/extensions/queue-editor.ts` link after backing it up; the setup block
  above backs up both old and new locations. Do not load both versions.
  Tests (requires npm-installed Pi and Node 22.19+):
  `node --test pi/tests/*.test.mjs` from this repository's root.
- **Pi compact pastes:** copied images display as `[Image #N]`, and copied files
  as `[File #N: filename]`, in both the editor and delivered user messages. These
  are labels for the original paths, not new inline-image uploads. Only pastes
  consisting entirely of existing explicit file paths are treated as attachments;
  ordinary prose, missing paths, directories, and shell arguments stay literal.
  Both terminal paste and Ctrl+V text paste collapse above 10 lines or 1,000
  characters, using Pi's native paste storage. The full text still reaches Pi,
  including through Enter steering and Tab queueing; this does not save tokens.
  The transcript folds only recorded pasted spans, preserving surrounding text.
  Model context and normal session messages/exports retain full content. Small
  display-only metadata entries let folding survive session resume; they contain
  hashes, offsets, and labels, not another copy of the pasted content.
  Existing messages without that metadata and the native pending-queue preview
  are not rewritten. Use `/paste-view` to inspect a folded message (dialog edits
  are discarded), or Ctrl+G to open the full current draft in your external editor.
  A narrow compatibility adapter uses Pi 1.1's editor paste-storage internals for
  atomic attachment labels and undo. If those internals are unavailable, it warns
  and leaves paths visible rather than losing content. Re-run the tests after Pi
  upgrades. The extension uses existing theme colors without adding new ones.
- **Neovim:** uses Rosé Pine Moon, lazy.nvim, Oil, and Snacks. Plugins install on
  first launch; versions are recorded in `nvim/lazy-lock.json`. The leader is
  **Space**: `e` opens Oil, `f` finds files, `s` searches text, `b` lists buffers,
  and `g` opens Lazygit. Restart Neovim after changing its configuration.
- **Lazygit:** uses the [Rosé Pine Moon theme](https://github.com/rose-pine/lazygit).
  With Lazygit installed, run this from the repository root to back up an existing
  config and link the theme on either macOS or Linux:

  ```sh
  (
  set -e
  lazygit_config_dir="$(lazygit --print-config-dir)"
  mkdir -p "$lazygit_config_dir"
  if [ -e "$lazygit_config_dir/config.yml" ] || [ -L "$lazygit_config_dir/config.yml" ]; then
    lazygit_backup="$(mktemp -d "$lazygit_config_dir/backup-XXXXXXXX")"
    mv "$lazygit_config_dir/config.yml" "$lazygit_backup/config.yml"
    printf 'Backup: %s\n' "$lazygit_backup/config.yml"
  fi
  ln -s "$(pwd -P)/lazygit/config.yml" "$lazygit_config_dir/config.yml"
  )
  ```

  Reopen Lazygit to apply. The included Snacks.nvim setup uses `configure = false`
  to read this config instead of generating one. This also disables Snacks'
  automatic editor preset and icon configuration.
- **tmux keyboard:** the config requires tmux 3.5+ and enables extended keys with
  CSI-u encoding. To apply just the keyboard settings without stopping sessions,
  run `tmux set -s extended-keys on` and `tmux set -s extended-keys-format csi-u`,
  then restart the affected agent. If modified keys still collapse into Enter,
  save your work and restart tmux when convenient; do not kill active sessions.
- **tmux plugins:** if TPM is absent, run
  `git clone https://github.com/tmux-plugins/tpm "$HOME/.tmux/plugins/tpm"`.
  Start tmux, then press **Ctrl+b**, followed by **Shift+i**, to install plugins.
  The config enables automatic session saving and restoration at server startup.
- **Reload:** tmux **Ctrl+b**, then **r**; Ghostty **Reload Configuration**;
  WezTerm reloads automatically. Open a new shell or agent session for their changes.
- **Restore:** remove the destination symlink with `unlink`, then move its original
  from the printed backup directory back into place. Backups mirror paths relative
  to your home directory. If no original existed, only remove the new symlink.
