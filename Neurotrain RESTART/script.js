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

game_screen.onclick = function() {
    // This event handler catches clicks on the game background.
    // Clicks on targets themselves are stopped and don't trigger this.
    // We only count a miss if there was a 'click' target on the screen that was missed.
    var click_target = game_screen.querySelector('.target:not(.hold)');
    if (game_active && click_target) {
        record_miss();
        click_target.remove(); // remove the missed target
        spawn_target();      // move on to the next target
    }
};

// metric and feedback functions

function record_hit() {
    hits++;
    give_feedback(true);
    update_accuracy_history();
}

function record_miss() {
    misses++;
    give_feedback(false);
    update_accuracy_history();
}

function update_accuracy_history() {
    var current_accuracy = (hits + misses > 0) ? (hits / (hits + misses)) * 100 : 0;
    accuracy_history.push(current_accuracy);
}

function give_feedback(is_hit) {
    var feedback_div = document.createElement('div');
    feedback_div.className = is_hit ? 'feedback hit-feedback' : 'feedback miss-feedback';
    game_screen.appendChild(feedback_div);
    setTimeout(function() { if(feedback_div) feedback_div.remove(); }, 300);
}

function get_random_position(element_size) {
    var rect = game_screen.getBoundingClientRect();
    var buffer = 10;
    return {
        x: Math.random() * (rect.width - element_size.w - buffer * 2) + buffer,
        y: Math.random() * (rect.height - element_size.h - buffer * 2) + buffer
    };
}

// display functions

function display_results(data) {
    var final_accuracy = (data.hits + data.misses > 0) ? (data.hits / (data.hits + data.misses)) * 100 : 0;
    var avg_reaction = data.reaction_times.length > 0 ? data.reaction_times.reduce(function(a, b) { return a + b; }, 0) / data.reaction_times.length : 0;
    var avg_tremor = data.tremor_data.length > 0 ? data.tremor_data.reduce(function(a, b) { return a + b; }, 0) / data.tremor_data.length : 0;
    var avg_drag = data.drag_efficiencies.length > 0 ? (data.drag_efficiencies.reduce(function(a, b) { return a + b; }, 0) / data.drag_efficiencies.length) * 100 : 0;
    
    document.getElementById('res-hits').textContent = data.hits;
    document.getElementById('res-misses').textContent = data.misses;
    document.getElementById('res-accuracy').textContent = final_accuracy.toFixed(1) + '%';
    document.getElementById('res-reaction').textContent = avg_reaction.toFixed(0) + ' ms';
    document.getElementById('res-tremor').textContent = avg_tremor.toFixed(2) + ' px';
    document.getElementById('res-drag').textContent = avg_drag.toFixed(1) + '%';
    
    var tips = '';
    if (final_accuracy < 75) tips += '<li>focus on precision over speed. consider using a larger target size.</li>';
    if (avg_reaction > 600) tips += '<li>practice quick, decisive clicks. anticipating the target\'s appearance can help.</li>';
    if (avg_drag > 0 && avg_drag < 70) tips += '<li>for drag targets, try to make your movements in a single, smooth line.</li>';
    if (tips === '') tips = '<li>great work! consistent practice is key to improvement.</li>';
    document.getElementById('res-feedback').innerHTML = '<h3>Drills & Tips</h3><ul>' + tips + '</ul>';

    draw_line_chart(document.getElementById('res-accuracy-chart'), data.accuracy_history, '%');
    draw_line_chart(document.getElementById('res-reaction-chart'), data.reaction_times, 'ms');
    draw_line_chart(document.getElementById('res-tremor-chart'), data.tremor_data, 'px');
    draw_bar_chart(document.getElementById('res-drag-chart'), data.drag_efficiencies.map(function(d){ return d*100; }), '%');
}

function show_history_screen() {
    history_list_div.innerHTML = '';
    selected_session_div.style.display = 'none';

    if (sessions_history.length === 0) {
        history_list_div.innerHTML = '<p>no past sessions found.</p>';
    } else {
        var reversed_history = sessions_history.slice().reverse();
        reversed_history.forEach(function(session) {
            var item = document.createElement('div');
            item.className = 'history-item';
            item.textContent = new Date(session.timestamp).toLocaleString();
            item.onclick = function() { display_history_details(session); };
            history_list_div.appendChild(item);
        });
    }
    show_screen(history_screen);
}

function display_history_details(data) {
    var final_accuracy = (data.hits + data.misses > 0) ? (data.hits / (data.hits + data.misses)) * 100 : 0;
    var avg_reaction = data.reaction_times.length > 0 ? data.reaction_times.reduce(function(a, b) { return a + b; }, 0) / data.reaction_times.length : 0;
    var avg_tremor = data.tremor_data.length > 0 ? data.tremor_data.reduce(function(a, b) { return a + b; }, 0) / data.tremor_data.length : 0;
    var avg_drag = data.drag_efficiencies.length > 0 ? (data.drag_efficiencies.reduce(function(a, b) { return a + b; }, 0) / data.drag_efficiencies.length) * 100 : 0;
    
    selected_session_div.innerHTML = '<hr style="margin: 20px 0;"><h3>Session Details</h3>' +
        '<div class="results-grid">' +
            '<p>Hits: <span>' + data.hits + '</span></p><p>Avg. Reaction: <span>' + avg_reaction.toFixed(0) + ' ms</span></p>' +
            '<p>Misses: <span>' + data.misses + '</span></p><p>Avg. Tremor: <span>' + avg_tremor.toFixed(2) + ' px</span></p>' +
            '<p>Accuracy: <span>' + final_accuracy.toFixed(1) + '%</span></p><p>Avg. Drag Efficiency: <span>' + avg_drag.toFixed(1) + '%</span></p>' +
        '</div><div class="chart-grid">' +
            '<div class="chart-container"><h3>Accuracy</h3><canvas id="hist-accuracy-chart"></canvas></div>' +
            '<div class="chart-container"><h3>Reaction Time</h3><canvas id="hist-reaction-chart"></canvas></div>' +
            '<div class="chart-container"><h3>Tremor Stability</h3><canvas id="hist-tremor-chart"></canvas></div>' +
            '<div class="chart-container"><h3>Drag Efficiency</h3><canvas id="hist-drag-chart"></canvas></div>' +
        '</div>';

    selected_session_div.style.display = 'block';
    draw_line_chart(document.getElementById('hist-accuracy-chart'), data.accuracy_history, '%');
    draw_line_chart(document.getElementById('hist-reaction-chart'), data.reaction_times, 'ms');
    draw_line_chart(document.getElementById('hist-tremor-chart'), data.tremor_data, 'px');
    draw_bar_chart(document.getElementById('hist-drag-chart'), data.drag_efficiencies.map(function(d){ return d*100; }), '%');
}

// chart drawing functions

function draw_line_chart(canvas, data, unit) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width = 350; var h = canvas.height = 200; var pad = 30;
    ctx.clearRect(0, 0, w, h);
    
    if (!data || data.length === 0) {
        ctx.font = "14px Arial"; ctx.fillStyle = "#888"; ctx.textAlign = "center";
        ctx.fillText("No data for this metric.", w / 2, h / 2); return;
    }

    var max_val = Math.max.apply(null, data); if (max_val < 100 && unit === '%') max_val = 100;
    if (max_val === 0) max_val = 100;

    ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, h - pad); ctx.lineTo(w - pad, h - pad);
    ctx.strokeStyle = '#aaa'; ctx.stroke();

    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#333'; ctx.font = '10px Arial';
    ctx.fillText(max_val.toFixed(0), pad - 5, pad);
    ctx.fillText('0', pad - 5, h - pad);
    
    ctx.beginPath(); ctx.strokeStyle = '#007bff'; ctx.lineWidth = 2;
    data.forEach(function(p, i) {
        var x = pad + (i / (data.length - 1 || 1)) * (w - 2 * pad);
        var y = h - pad - (p / max_val) * (h - 2 * pad);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function draw_bar_chart(canvas, data, unit) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width = 350; var h = canvas.height = 200; var pad = 30;
    ctx.clearRect(0, 0, w, h);

    if (!data || data.length === 0) {
        ctx.font = "14px Arial"; ctx.fillStyle = "#888"; ctx.textAlign = "center";
        ctx.fillText("No data for this metric.", w / 2, h / 2); return;
    }

    var max_val = 100; // Efficiency is always 0-100%

    ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, h - pad); ctx.lineTo(w - pad, h - pad);
    ctx.strokeStyle = '#aaa'; ctx.stroke();

    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#333'; ctx.font = '10px Arial';
    ctx.fillText(max_val.toFixed(0), pad - 5, pad);
    ctx.fillText('0', pad - 5, h - pad);

    var bar_width = (w - 2 * pad) / (data.length * 1.5);
    ctx.fillStyle = '#28a745';
    data.forEach(function(p, i) {
        var bar_height = (p / max_val) * (h - 2 * pad);
        var x = pad + i * (bar_width * 1.5);
        var y = h - pad - bar_height;
        ctx.fillRect(x, y, bar_width, bar_height);
    });
}