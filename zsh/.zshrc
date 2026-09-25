export PATH="$HOME/.local/bin:$PATH"

# Starship configuration
command -v starship >/dev/null && eval "$(starship init zsh)"

# nvm: Homebrew on macOS, install script under $NVM_DIR on Linux
export NVM_DIR="$HOME/.nvm"
for nvm_dir in "${HOMEBREW_PREFIX:+$HOMEBREW_PREFIX/opt/nvm}" "$NVM_DIR"; do
  if [ -s "$nvm_dir/nvm.sh" ]; then
    \. "$nvm_dir/nvm.sh"
    [ -s "$nvm_dir/etc/bash_completion.d/nvm" ] && \. "$nvm_dir/etc/bash_completion.d/nvm"
    [ -s "$nvm_dir/bash_completion" ] && \. "$nvm_dir/bash_completion"
    break
  fi
done
unset nvm_dir
export PATH="$HOME/bin:$PATH"

# pyenv
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
command -v pyenv >/dev/null && eval "$(pyenv init -)"

# claude thinking token cap
export MAX_THINKING_TOKENS=8000

# zsh plugins: Homebrew on macOS, /usr/share on Fedora
for zsh_plugin in zsh-autosuggestions zsh-syntax-highlighting; do
  for plugin_dir in "${HOMEBREW_PREFIX:+$HOMEBREW_PREFIX/share}" /usr/share; do
    if [ -r "$plugin_dir/$zsh_plugin/$zsh_plugin.zsh" ]; then
      source "$plugin_dir/$zsh_plugin/$zsh_plugin.zsh"
      break
    fi
  done
done
unset zsh_plugin plugin_dir
