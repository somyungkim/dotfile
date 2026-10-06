vim.g.mapleader = " "

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"

if not vim.uv.fs_stat(lazypath) then
  local result = vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "--branch=stable",
    "https://github.com/folke/lazy.nvim.git",
    lazypath,
  })

  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { result, "WarningMsg" },
    }, true, {})
    return
  end
end

vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
  {
    "rose-pine/neovim",
    name = "rose-pine",
    lazy = false,
    priority = 1000,
    opts = {
      variant = "moon",
    },
    config = function(_, opts)
      require("rose-pine").setup(opts)
      vim.cmd("colorscheme rose-pine-moon")
    end,
  },
  {
    "stevearc/oil.nvim",
    lazy = false,
    opts = {
      view_options = {
        show_hidden = true,
      },
    },
    keys = {
      { "<leader>e", "<cmd>Oil<cr>", desc = "File Browser" },
    },
  },
  {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    opts = {
      picker = { enabled = true },
      lazygit = { enabled = true, configure = false },
    },
    keys = {
      { "<leader>f", function() Snacks.picker.files() end, desc = "Find Files" },
      { "<leader>s", function() Snacks.picker.grep() end, desc = "Search Text" },
      { "<leader>b", function() Snacks.picker.buffers() end, desc = "Buffers" },
      { "<leader>g", function() Snacks.lazygit() end, desc = "Lazygit" },
    },
  },
})
