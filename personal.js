// Personal rhythm controls share the generator's saved settings and preview lifecycle.
const rhythm = document.createElement('section');
rhythm.className = 'generator-card settings-card rhythm-card';
rhythm.innerHTML = `
<p class="small-label">BUILT AROUND YOU</p><h2>Your personal rhythm</h2>
<p>Protect the essentials before fitting in your flexible goals.</p>
<div class="rhythm-section">
<label class="rhythm-toggle"><input id="sleep-enabled" type="checkbox" checked> Protect my sleep every night</label>
<div class="settings-grid">
<div class="form-group"><label for="sleep-hours">Hours per night</label><input id="sleep-hours" type="number" min="4" max="12" step="0.25" value="8"></div>
<div class="form-group"><label for="wake-time">Wake up at</label><input id="wake-time" type="time" value="07:00"></div>
</div><p id="sleep-description" class="input-help"></p>
</div>
<div class="rhythm-section">
<label class="rhythm-toggle"><input id="lunch-enabled" type="checkbox"> Leave lunch time while I'm on campus</label>
<div class="settings-grid">
<div class="form-group"><label for="lunch-minutes">Lunch length</label><select id="lunch-minutes"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45" selected>45 minutes</option><option value="60">1 hour</option><option value="90">90 minutes</option></select></div>
<div class="form-group"><label for="lunch-start">Between</label><input id="lunch-start" type="time" value="11:30"></div>
<div class="form-group"><label for="lunch-end">And</label><input id="lunch-end" type="time" value="14:30"></div>
</div><p class="input-help">Campus time runs from your first to last class or commitment with “campus” in its location. Lunch needs a free gap within that stay.</p>
</div>
<div class="rhythm-section"><h3>Other time to keep for yourself</h3><p class="input-help">Add dinner, family time, prayer, or a daily wind-down. These times are protected on your chosen days.</p>
<div id="routine-list"></div><button type="button" class="text-button" id="add-routine">+ Add protected time</button></div>`;
document.querySelector('.generator-workspace .settings-card').before(rhythm);
const personalFields = { sleepEnabled:'sleep-enabled', sleepHours:'sleep-hours', wakeTime:'wake-time', lunchEnabled:'lunch-enabled', lunchMinutes:'lunch-minutes', lunchStart:'lunch-start', lunchEnd:'lunch-end' };
function addRoutineRow(value = {}) {
    const row = document.createElement('fieldset');
    row.className = 'routine-row';
    row.innerHTML = `<legend>Protected time</legend><div class="settings-grid"><div class="form-group"><label>Name<input class="routine-name" maxlength="80" placeholder="Dinner / family time"></label></div><div class="form-group"><label>Start<input class="routine-start" type="time" value="18:00"></label></div><div class="form-group"><label>End<input class="routine-end" type="time" value="19:00"></label></div></div><div class="day-options"></div><button type="button" class="text-button delete-text-button">Remove</button>`;
    row.querySelector('.routine-name').value = value.name || '';
    row.querySelector('.routine-start').value = value.start || '18:00';
    row.querySelector('.routine-end').value = value.end || '19:00';
    for (const day of WeekScheduler.days) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox'; input.value = day; input.checked = (value.days || WeekScheduler.days).includes(day);
        label.append(input, day.slice(0,3)); row.querySelector('.day-options').append(label);
    }
    row.querySelector('button').onclick = () => { row.remove(); saveSettings(); markPreviewStale(); };
    document.getElementById('routine-list').append(row);
}
function readPersonalSettings() {
    const result = {};
    for (const [key, id] of Object.entries(personalFields)) {
        const input = document.getElementById(id);
        result[key] = input.type === 'checkbox' ? input.checked : input.value;
    }
    result.routines = Array.from(document.querySelectorAll('.routine-row')).map(row => ({
        name: row.querySelector('.routine-name').value.trim(), start: row.querySelector('.routine-start').value,
        end: row.querySelector('.routine-end').value,
        days: Array.from(row.querySelectorAll('input[type=checkbox]:checked')).map(input => input.value)
    }));
    return result;
}
function restorePersonalSettings(settings) {
    if (!settings) return;
    for (const [key, id] of Object.entries(personalFields)) {
        if (settings[key] === undefined) continue;
        const input = document.getElementById(id);
        if (input.type === 'checkbox') input.checked = settings[key] === true;
        else input.value = settings[key];
    }
    document.getElementById('routine-list').replaceChildren();
    if (Array.isArray(settings.routines)) settings.routines.slice(0,30).forEach(addRoutineRow);
}
function describeSleep() {
    const personal = readPersonalSettings();
    const wake = WeekScheduler.toMinutes(personal.wakeTime);
    const bedtime = (wake - Number(personal.sleepHours) * 60 + 1440) % 1440;
    document.getElementById('sleep-description').textContent = personal.sleepEnabled && Number.isFinite(bedtime)
        ? `Protected nightly: ${WeekScheduler.toTime(bedtime)}–${personal.wakeTime}. Sleep stays off the calendar to keep it compact; fixed conflicts are flagged in the preview.` : 'Sleep protection is off.';
}
rhythm.addEventListener('input', () => { describeSleep(); markPreviewStale(); });
rhythm.addEventListener('change', () => { saveSettings(); markPreviewStale(); });
document.getElementById('add-routine').onclick = () => { addRoutineRow(); saveSettings(); markPreviewStale(); };
