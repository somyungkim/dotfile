# Personal configuration

Edit the files here. Their original locations are symlinks to this directory.

| File or directory here | Original location |
| --- | --- |
| `tmux/tmux.conf` | `~/.tmux.conf` |
| `wezterm/wezterm.lua` | `~/.wezterm.lua` |
| `ghostty/config` | `~/Library/Application Support/com.mitchellh.ghostty/config` |
| `ghostty/assets/` | `~/.config/ghostty/` |
| `zsh/.zshrc` | `~/.zshrc` |
| `zsh/.zprofile` | `~/.zprofile` |
| `starship/starship.toml` | `~/.config/starship.toml` |

Ghostty assets include the custom icon and existing theme files. The main config
keeps its macOS location through a separate symlink.

After editing tmux, press **Ctrl+b**, then **r** to reload. For Ghostty, use
**Reload Configuration**. WezTerm reloads its config automatically. Open a new
shell after editing zsh startup files.

## Original backup

The pre-migration files are saved under:

`~/.dotfile-backups/20260909-001540-472717/`

The backup mirrors the original paths relative to your home directory. To restore
an original, remove its symlink and copy the corresponding backup file or
directory into that location. Restoring the backup discards subsequent edits
for that config.

The WezTerm config was added later and is not in that backup.

All config contents were preserved during migration. The symlinks use absolute
paths, so update them if this directory moves.
