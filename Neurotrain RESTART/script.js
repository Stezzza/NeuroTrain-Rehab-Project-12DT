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

// simplified persistent mouse listeners
document.onmousemove = handle_mouse_move;
document.onmouseup = handle_mouse_up;

// local storage for session history
var sessions_history = JSON.parse(localStorage.getItem('neurotrain_history')) || [];

// core functions

function show_screen(screen_element) {
    menu_screen.style.display = 'none';
    game_screen.style.display = 'none';
    results_screen.style.display = 'none';
    history_screen.style.display = 'none';
    screen_element.style.display = 'flex';
}

function start_game() {
    // reset all metrics for the new session
    hits = 0;
    misses = 0;
    reaction_times = [];
    tremor_data = [];
    accuracy_history = [];
    drag_efficiencies = [];
    game_active = true;

    show_screen(game_screen);

    var end_time = Date.now() + 30000;
    countdown_interval = setInterval(function() {
        var time_left = Math.max(0, (end_time - Date.now()) / 1000);
        timer_display.textContent = time_left.toFixed(1);
    }, 100);

    setTimeout(end_game, 30000);
    spawn_target();
}

function end_game() {
    if (!game_active) return; // prevent running twice
    game_active = false;
    clearInterval(countdown_interval);

    var active_targets = game_screen.querySelectorAll('.target, .drag-obj, .drag-zone');
    active_targets.forEach(function(t) { t.remove(); });

    var session_data = {
        timestamp: Date.now(),
        hits: hits,
        misses: misses,
        reaction_times: reaction_times,
        tremor_data: tremor_data,
        accuracy_history: accuracy_history,
        drag_efficiencies: drag_efficiencies
    };
    sessions_history.push(session_data);
    localStorage.setItem('neurotrain_history', JSON.stringify(sessions_history));

    display_results(session_data);
    show_screen(results_screen);
}

function spawn_target() {
    if (!game_active) return;

    setTimeout(function() {
        if (!game_active) return;
        var target_type = Math.random();

        if (target_type < 0.5) create_click_target();
        else if (target_type < 0.8) create_hold_target();
        else create_drag_target();

        target_appear_time = Date.now();
    }, Math.random() * 800 + 400);
}

// target creation functions

function create_click_target() {
    var size = parseInt(target_size_select.value);
    var pos = get_random_position({w: size, h: size});
    var target = document.createElement('div');
    target.className = 'target';
    target.style.width = size + 'px';
    target.style.height = size + 'px';
    target.style.lineHeight = size + 'px';
    target.style.left = pos.x + 'px';
    target.style.top = pos.y + 'px';
    target.textContent = 'click';
    target.onclick = function(event) {
        event.stopPropagation();
        record_hit();
        reaction_times.push(Date.now() - target_appear_time);
        target.remove();
        spawn_target();
    };
    game_screen.appendChild(target);
}

function create_hold_target() {
    var size = parseInt(target_size_select.value);
    var pos = get_random_position({w: size, h: size});
    var target = document.createElement('div');
    target.className = 'target hold';
    target.style.width = size + 'px';
    target.style.height = size + 'px';
    target.style.lineHeight = size + 'px';
    target.style.left = pos.x + 'px';
    target.style.top = pos.y + 'px';
    target.textContent = 'hold';
    target.onmousedown = function(event) {
        event.stopPropagation();
        if (is_holding) return;
        is_holding = true;
        target.classList.add('holding');
        reaction_times.push(Date.now() - target_appear_time);
        current_tremor_samples = []; // reset tremor samples for this hold
        hold_timer = setTimeout(function() { // success timer
            if (!is_holding) return;
            is_holding = false;
            record_hit();
            var avg_tremor = current_tremor_samples.length > 0 ? current_tremor_samples.reduce(function(a,b){return a+b;},0) / current_tremor_samples.length : 0;
            tremor_data.push(avg_tremor);
            target.remove();
            spawn_target();
        }, parseInt(difficulty_select.value));
    };
    game_screen.appendChild(target);
}

function create_drag_target() {
    var obj_size = { w: 80, h: 40 };
    var zone_size = parseInt(target_size_select.value);
    var obj_pos = get_random_position(obj_size);
    var zone_pos = get_random_position({w: zone_size, h: zone_size});

    drag_object = document.createElement('div');
    drag_object.className = 'drag-obj';
    drag_object.style.width = obj_size.w + 'px';
    drag_object.style.height = obj_size.h + 'px';
    drag_object.style.left = obj_pos.x + 'px';
    drag_object.style.top = obj_pos.y + 'px';
    drag_object.textContent = 'drag me';
    
    drag_zone_object = document.createElement('div');
    drag_zone_object.className = 'drag-zone';
    drag_zone_object.style.width = zone_size + 'px';
    drag_zone_object.style.height = zone_size + 'px';
    drag_zone_object.style.left = zone_pos.x + 'px';
    drag_zone_object.style.top = zone_pos.y + 'px';
    
    drag_object.onmousedown = function(event) {
        event.stopPropagation();
        is_dragging = true;
        reaction_times.push(Date.now() - target_appear_time);
        drag_start_pos = { x: event.clientX, y: event.clientY };
        drag_mouse_path = [drag_start_pos];
    };
    game_screen.appendChild(drag_zone_object);
    game_screen.appendChild(drag_object);
}

// input handling

function handle_mouse_move(event) {
    if (is_dragging && drag_object) {
        var game_rect = game_screen.getBoundingClientRect();
        drag_object.style.left = (event.clientX - game_rect.left - 40) + 'px';
        drag_object.style.top = (event.clientY - game_rect.top - 20) + 'px';
        drag_mouse_path.push({x: event.clientX, y: event.clientY});
    }
    if (is_holding) {
        var target = game_screen.querySelector('.target.holding');
        if (!target) return;
        var rect = target.getBoundingClientRect();
        var size = rect.width;
        var mouse_x = event.clientX - rect.left;
        var mouse_y = event.clientY - rect.top;
        var dist = Math.sqrt(Math.pow(mouse_x - size / 2, 2) + Math.pow(mouse_y - size / 2, 2));
        current_tremor_samples.push(dist);
    }
}

function handle_mouse_up() {
    if (is_dragging) {
        is_dragging = false;
        if (!drag_object || !drag_zone_object) return;
        var obj_rect = drag_object.getBoundingClientRect();
        var zone_rect = drag_zone_object.getBoundingClientRect();
        var is_overlap = !(obj_rect.right < zone_rect.left || obj_rect.left > zone_rect.right || obj_rect.bottom < zone_rect.top || obj_rect.top > zone_rect.bottom);

        if (is_overlap) {
            record_hit();
            var start = drag_start_pos;
            var end = {x: zone_rect.left + zone_rect.width/2, y: zone_rect.top + zone_rect.height/2};
            var straight_dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            var actual_dist = 0;
            for (var i = 1; i < drag_mouse_path.length; i++) {
                actual_dist += Math.sqrt(Math.pow(drag_mouse_path[i].x - drag_mouse_path[i-1].x, 2) + Math.pow(drag_mouse_path[i].y - drag_mouse_path[i-1].y, 2));
            }
            if (actual_dist > 0) drag_efficiencies.push(straight_dist / actual_dist);

        } else {
            record_miss();
        }
        drag_object.remove();
        drag_zone_object.remove();
        drag_object = null;
        spawn_target();
    }

    if (is_holding) {
        is_holding = false;
        clearTimeout(hold_timer);
        record_miss();
        var target = game_screen.querySelector('.target.hold');
        if (target) target.remove();
        spawn_target();
    }
}