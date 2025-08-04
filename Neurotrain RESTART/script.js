// dom element variables
var menu_screen = document.getElementById('menu-screen');
var game_screen = document.getElementById('game-screen');
var results_screen = document.getElementById('results-screen');
var history_screen = document.getElementById('history-screen');

document.getElementById('start-button').onclick = function() { start_game(); };
document.getElementById('history-button').onclick = function() { show_history_screen(); };
document.getElementById('back-to-menu-button').onclick = function() { show_screen(menu_screen); };
document.getElementById('res-restart-button').onclick = function() { show_screen(menu_screen); };

var timer_display = document.getElementById('timer-display');
var target_size_select = document.getElementById('target-size');
var difficulty_select = document.getElementById('difficulty');

var history_list_div = document.getElementById('history-list');
var selected_session_div = document.getElementById('selected-session-view');

// game state variables
var game_active = false;
var countdown_interval;
var target_appear_time;

var is_holding = false;
var hold_timer;
var current_tremor_samples = [];
var is_dragging = false;
var drag_object = null;
var drag_zone_object = null;
var drag_start_pos = {x: 0, y: 0};
var drag_mouse_path = [];

// metric variables
var hits, misses;
var reaction_times, tremor_data, accuracy_history, drag_efficiencies;