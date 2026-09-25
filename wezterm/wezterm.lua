local wezterm = require("wezterm")
local tabline = wezterm.plugin.require("https://github.com/michaelbrusegard/tabline.wez")

local config = wezterm.config_builder()
local act = wezterm.action
local is_macos = wezterm.target_triple:find("darwin") ~= nil

config.automatically_reload_config = true
config.color_scheme = "rose-pine-moon"
config.font = wezterm.font_with_fallback({ "JetBrains Mono", is_macos and "Apple Color Emoji" or "Noto Color Emoji" })
config.font_size = 15.0
config.line_height = 1.08
config.harfbuzz_features = { "liga=0", "calt=0" }
config.window_background_opacity = 0.8
config.macos_window_background_blur = 50
config.default_cursor_style = "BlinkingBar"
config.cursor_blink_ease_in = "Constant"
config.cursor_blink_ease_out = "Constant"
config.default_cwd = wezterm.home_dir
config.enable_tab_bar = true
config.hide_tab_bar_if_only_one_tab = false
config.use_fancy_tab_bar = false
config.tab_max_width = 21
config.window_decorations = "TITLE|RESIZE|MACOS_USE_BACKGROUND_COLOR_AS_TITLEBAR_COLOR"
config.show_close_tab_button_in_tabs = false
config.show_tab_index_in_tab_bar = false
config.window_frame = {
	font = wezterm.font("JetBrains Mono", { weight = "Medium" }),
	font_size = 14.0,
	active_titlebar_bg = "#232136",
	inactive_titlebar_bg = "#232136",
}
config.colors = {
	tab_bar = {
		background = "#232136",
		active_tab = { bg_color = "#393552", fg_color = "#e0def4" },
		inactive_tab = { bg_color = "#232136", fg_color = "#908caa" },
		inactive_tab_hover = { bg_color = "#393552", fg_color = "#e0def4" },
		new_tab = { bg_color = "#232136", fg_color = "#908caa" },
		new_tab_hover = { bg_color = "#393552", fg_color = "#e0def4" },
		inactive_tab_edge = "#393552",
	},
}

local tab_counts = {}
local workspace_dir = wezterm.home_dir:gsub("\\", "/") .. "/workspace"

local function project_name(pane)
	local cwd = pane.current_working_dir
	if not cwd or cwd.scheme ~= "file" then
		return nil
	end

	local path = cwd.file_path:gsub("\\", "/")
	if path == workspace_dir or path == workspace_dir .. "/" then
		return "workspace"
	end
	if path:sub(1, #workspace_dir + 1) == workspace_dir .. "/" then
		return path:sub(#workspace_dir + 2):match("^[^/]+")
	end
end

local function tab_title(tab, pane)
	local index = tab.tab_index + 1
	local width = (tab_counts[tab.window_id] or 0) >= 6 and 14 or 21
	local title = tab.tab_title
	if not title or title == "" then
		title = project_name(pane) or pane.title
	end
	local label = wezterm.truncate_right(string.format("%d: %s", index, title), width - 2)
	local left_padding = math.floor((width - wezterm.column_width(label)) / 2)
	return wezterm.pad_right(string.rep(" ", left_padding) .. label, width)
end

wezterm.on("format-window-title", function()
	return " "
end)

wezterm.on("update-status", function(window)
	tab_counts[window:window_id()] = #window:mux_window():tabs()
end)

local UNFOCUSED_FOREGROUND_TEXT_HSB = { hue = 1.0, saturation = 0.25, brightness = 0.45 }
local UNFOCUSED_WINDOW_BACKGROUND_OPACITY = 0.62

local function same_text_hsb(actual, expected)
	if actual == nil or expected == nil then
		return actual == expected
	end
	return actual.hue == expected.hue
		and actual.saturation == expected.saturation
		and actual.brightness == expected.brightness
end

wezterm.on("window-focus-changed", function(window)
	local overrides = window:get_config_overrides() or {}
	local text_hsb, opacity
	if not window:is_focused() then
		text_hsb = UNFOCUSED_FOREGROUND_TEXT_HSB
		opacity = UNFOCUSED_WINDOW_BACKGROUND_OPACITY
	end

	if same_text_hsb(overrides.foreground_text_hsb, text_hsb) and overrides.window_background_opacity == opacity then
		return
	end

	overrides.foreground_text_hsb = text_hsb
	overrides.window_background_opacity = opacity
	window:set_config_overrides(overrides)
end)

local status_colors = {
	x = { fg = "#9ccfd8", bg = "#232136" },
	y = { fg = "#f6c177", bg = "#2a273f" },
	z = { fg = "#232136", bg = "#c4a7e7" },
}

tabline.setup({
	options = {
		icons_enabled = false,
		theme = "rose-pine-moon",
		section_separators = { left = "", right = wezterm.nerdfonts.ple_left_half_circle_thick },
		component_separators = "",
		tab_separators = "",
		theme_overrides = {
			normal_mode = status_colors,
			copy_mode = status_colors,
			search_mode = status_colors,
			tab = {
				active = { fg = "#e0def4", bg = "#393552" },
				inactive = { fg = "#908caa", bg = "#232136" },
				inactive_hover = { fg = "#e0def4", bg = "#393552" },
			},
		},
	},
	sections = {
		tabline_a = {},
		tabline_b = {},
		tabline_c = {},
		tab_active = { tab_title },
		tab_inactive = {
			tab_title,
		},
		tabline_x = { { "ram", icons_enabled = true } },
		tabline_y = { { "cpu", icons_enabled = true } },
		tabline_z = { { "hostname", icons_enabled = true, icon = wezterm.nerdfonts.md_laptop } },
	},
})

-- Mac-style line and word navigation; on Linux, Toshy provides these.
if is_macos then
	config.keys = {
		{ key = "Enter", mods = "OPT", action = act.DisableDefaultAssignment },
		{ key = "LeftArrow", mods = "CMD", action = act.SendString("\x01") },
		{ key = "RightArrow", mods = "CMD", action = act.SendString("\x05") },
		{ key = "Backspace", mods = "CMD", action = act.SendString("\x15") },
		{ key = "LeftArrow", mods = "OPT", action = act.SendKey({ key = "b", mods = "ALT" }) },
		{ key = "RightArrow", mods = "OPT", action = act.SendKey({ key = "f", mods = "ALT" }) },
	}
end

return config
