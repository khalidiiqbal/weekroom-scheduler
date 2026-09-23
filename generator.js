const goalStorageKey = "studyPathFlexibleGoals";
const generatorSettingsKey = "studyPathGeneratorSettings";
const weekStorageKey = "studyPathWeek";
const generatorMessage = document.getElementById("generator-message");
const goalForm = document.getElementById("goal-form");
const goalList = document.getElementById("goal-list");
const applyButton = document.getElementById("apply-week");
let goals = [];
let currentWeek = emptyWeek();
let editingGoalId = "";
let previewResult = null;
let previewBasis = "";

function emptyWeek() {
    return { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
}

function id() {
    return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function showGeneratorMessage(message, isError = false) {
    generatorMessage.textContent = message;
    generatorMessage.classList.toggle("error-message", isError);
}

function readStoredJson(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
    } catch (error) {
        showGeneratorMessage("Some saved planner data could not be read. Nothing has been overwritten.", true);
        return fallback;
    }
}

function loadData() {
    const storedWeek = readStoredJson(weekStorageKey, emptyWeek());
    currentWeek = emptyWeek();
    for (const day of WeekScheduler.days) currentWeek[day] = Array.isArray(storedWeek?.[day]) ? storedWeek[day] : [];
    const storedGoals = readStoredJson(goalStorageKey, []);
    goals = Array.isArray(storedGoals) ? storedGoals.filter(function(goal) { return !WeekScheduler.validateGoal(goal); }).slice(0, 50) : [];
    const settings = readStoredJson(generatorSettingsKey, null);
    if (settings) {
        restorePersonalSettings(settings.personal);
        document.getElementById("schedule-start").value = settings.dayStart || "08:00";
        document.getElementById("schedule-end").value = settings.dayEnd || "22:00";
        document.getElementById("schedule-break").value = String(settings.breakMinutes ?? 15);
        document.getElementById("balance-week").checked = settings.balanceWeek !== false;
        document.getElementById("compact-days").checked = settings.compactDays !== false;
    }
}

function saveGoals() {
    try {
        localStorage.setItem(goalStorageKey, JSON.stringify(goals));
        return true;
    } catch (error) {
        showGeneratorMessage("The goals could not be saved in this browser. Keep this page open or free storage before reloading.", true);
        return false;
    }
}

function getSettings() {
    return {
        dayStart: document.getElementById("schedule-start").value,
        dayEnd: document.getElementById("schedule-end").value,
        breakMinutes: Number(document.getElementById("schedule-break").value),
        balanceWeek: document.getElementById("balance-week").checked,
        compactDays: document.getElementById("compact-days").checked,
        personal: readPersonalSettings()
    };
}

function saveSettings() {
    try { localStorage.setItem(generatorSettingsKey, JSON.stringify(getSettings())); }
    catch (error) { showGeneratorMessage("Scheduling settings could not be saved.", true); }
}

function fixedWeek() {
    const result = emptyWeek();
    for (const day of WeekScheduler.days) result[day] = currentWeek[day].filter(function(task) { return !task.generated; });
    return result;
}

function makeBasis() {
    return JSON.stringify({ goals, settings: getSettings(), week: fixedWeek() });
}

function markPreviewStale() {
    if (!previewResult) return;
    applyButton.disabled = true;
    document.getElementById("generation-summary").innerHTML = '<p class="preview-stale">Goals or settings changed. Generate a fresh preview before applying.</p>';
}

function defaultDays(type) {
    return ["work", "study"].includes(type) ? WeekScheduler.days.slice(0, 5) : WeekScheduler.days.slice();
}

function completeGoal(partial) {
    return {
        id: id(), name: partial.name, type: partial.type, mode: partial.mode,
        totalMinutes: partial.totalMinutes, sessionCount: partial.sessionCount,
        sessionMinutes: partial.sessionMinutes, priority: "normal", preferredTime: "any",
        allowedDays: defaultDays(partial.type), deadlineDay: "", notes: ""
    };
}

function goalFromForm() {
    const mode = document.getElementById("goal-mode").value;
    const sessionMinutes = Number(document.getElementById("goal-session-minutes").value);
    const sessionCount = Number(document.getElementById("goal-session-count").value);
    const totalMinutes = Math.round(Number(document.getElementById("goal-total-hours").value) * 60);
    return {
        id: editingGoalId || id(), name: document.getElementById("goal-name").value.trim(),
        type: document.getElementById("goal-type").value, mode,
        totalMinutes: mode === "total" ? totalMinutes : sessionCount * sessionMinutes,
        sessionCount, sessionMinutes, priority: document.getElementById("goal-priority").value,
        preferredTime: document.getElementById("goal-preferred-time").value,
        allowedDays: Array.from(document.querySelectorAll('[name="goal-day"]:checked')).map(function(input) { return input.value; }),
        deadlineDay: document.getElementById("goal-deadline").value,
        notes: document.getElementById("goal-notes").value.trim()
    };
}

function describeGoal(goal) {
    const amount = goal.mode === "sessions" ? `${goal.sessionCount} × ${goal.sessionMinutes}-minute sessions` :
        `${goal.totalMinutes / 60} hours in sessions up to ${goal.sessionMinutes} minutes`;
    const days = goal.allowedDays.map(function(day) { return day.slice(0, 3); }).join(", ");
    const preference = goal.preferredTime === "any" ? "any time" : `${goal.preferredTime} preferred`;
    const deadline = goal.deadlineDay ? ` · by ${goal.deadlineDay}` : "";
    return `${amount} · ${days} · ${preference}${deadline}`;
}

function renderGoals() {
    goalList.replaceChildren();
    document.getElementById("goal-count").textContent = `${goals.length} ${goals.length === 1 ? "goal" : "goals"}`;
    if (!goals.length) {
        const empty = document.createElement("div");
        empty.className = "goal-empty";
        empty.innerHTML = "<strong>No flexible goals yet.</strong><span>Use quick add or the detailed form to describe what you want in your week.</span>";
        goalList.appendChild(empty);
    }
    for (const goal of goals) {
        const card = document.createElement("article");
        card.className = `goal-card goal-${goal.type}`;
        const body = document.createElement("div");
        const titleRow = document.createElement("div");
        titleRow.className = "goal-title-row";
        const title = document.createElement("h3");
        title.textContent = goal.name;
        const priority = document.createElement("span");
        priority.className = `priority-pill priority-${goal.priority}`;
        priority.textContent = goal.priority;
        titleRow.append(title, priority);
        const description = document.createElement("p");
        description.textContent = describeGoal(goal);
        body.append(titleRow, description);
        const actions = document.createElement("div");
        actions.className = "goal-actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "text-button";
        edit.textContent = "Edit";
        edit.addEventListener("click", function() { editGoal(goal.id); });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "text-button delete-text-button";
        remove.textContent = "Remove";
        remove.addEventListener("click", function() {
            goals = goals.filter(function(item) { return item.id !== goal.id; });
            saveGoals();
            renderGoals();
            markPreviewStale();
            showGeneratorMessage(`${goal.name} removed from flexible goals. Existing generated sessions remain until you apply a new preview or remove them.`);
        });
        actions.append(edit, remove);
        card.append(body, actions);
        goalList.appendChild(card);
    }
    updateFixedSummary();
}

function setModeFields() {
    const sessions = document.getElementById("goal-mode").value === "sessions";
    document.getElementById("total-hours-group").hidden = sessions;
    document.getElementById("session-count-group").hidden = !sessions;
}

function resetGoalForm() {
    editingGoalId = "";
    goalForm.reset();
    document.getElementById("goal-total-hours").value = "4";
    document.getElementById("goal-session-count").value = "4";
    document.getElementById("goal-session-minutes").value = "60";
    document.getElementById("goal-priority").value = "normal";
    document.getElementById("goal-preferred-time").value = "any";
    document.getElementById("goal-form-title").textContent = "Add a flexible goal";
    document.getElementById("save-goal").textContent = "Add goal";
    document.getElementById("cancel-goal-edit").hidden = true;
    setModeFields();
}

function editGoal(goalId) {
    const goal = goals.find(function(item) { return item.id === goalId; });
    if (!goal) return;
    editingGoalId = goal.id;
    document.getElementById("goal-name").value = goal.name;
    document.getElementById("goal-type").value = goal.type;
    document.getElementById("goal-mode").value = goal.mode;
    document.getElementById("goal-total-hours").value = String(goal.totalMinutes / 60);
    document.getElementById("goal-session-count").value = String(goal.sessionCount);
    document.getElementById("goal-session-minutes").value = String(goal.sessionMinutes);
    document.getElementById("goal-priority").value = goal.priority;
    document.getElementById("goal-preferred-time").value = goal.preferredTime;
    document.getElementById("goal-deadline").value = goal.deadlineDay;
    document.getElementById("goal-notes").value = goal.notes;
    document.querySelectorAll('[name="goal-day"]').forEach(function(input) { input.checked = goal.allowedDays.includes(input.value); });
    document.getElementById("goal-form-title").textContent = "Edit flexible goal";
    document.getElementById("save-goal").textContent = "Save changes";
    document.getElementById("cancel-goal-edit").hidden = false;
    setModeFields();
    document.getElementById("goal-name").focus();
}

function formatTime(time) {
    let [hour, minute] = time.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function updateFixedSummary() {
    const fixed = WeekScheduler.days.flatMap(function(day) { return currentWeek[day].filter(function(task) { return !task.generated; }); }).length;
    const generated = WeekScheduler.days.flatMap(function(day) { return currentWeek[day].filter(function(task) { return task.generated; }); }).length;
    document.getElementById("fixed-summary").textContent = `${fixed} fixed commitments block unavailable time. ${generated ? `${generated} existing generated sessions will be replaced when you apply.` : "No generated sessions are currently saved."}`;
    document.getElementById("clear-generated").disabled = generated === 0;
}

function previewTaskElement(task) {
    return compactEvent(task);
}

function renderPreview(result) {
    const summary = document.getElementById("generation-summary");
    summary.replaceChildren();
    const placed = document.createElement("div");
    placed.innerHTML = `<strong>${result.scheduled.length}</strong><span>sessions placed</span>`;
    const missing = document.createElement("div");
    missing.className = result.unscheduled.length ? "summary-warning" : "";
    missing.innerHTML = `<strong>${result.unscheduled.length}</strong><span>could not fit</span>`;
    const duration = result.scheduled.reduce(function(total, task) { return total + WeekScheduler.toMinutes(task.endTime) - WeekScheduler.toMinutes(task.startTime); }, 0);
    const hours = document.createElement("div");
    hours.innerHTML = `<strong>${(duration / 60).toFixed(duration % 60 ? 1 : 0)}</strong><span>hours scheduled</span>`;
    summary.append(placed, missing, hours);
    const personal = getSettings().personal;
    const note = document.createElement("p");
    note.className = "input-help";
    note.textContent = personal.sleepEnabled ? `${personal.sleepHours} hours of sleep protected nightly, waking at ${personal.wakeTime}.` : "Sleep protection is off.";
    summary.append(note);
    for (const warning of result.warnings || []) {
        const line = document.createElement("p"); line.className = "preview-stale"; line.textContent = warning; summary.append(line);
    }
    if (result.unscheduled.length) {
        const list = document.createElement("ul");
        list.className = "unscheduled-list";
        for (const item of result.unscheduled) {
            const line = document.createElement("li");
            line.textContent = `${item.name}, session ${item.sessionNumber}: ${item.reason}`;
            list.appendChild(line);
        }
        summary.appendChild(list);
    }
    const preview = document.getElementById("generated-preview");
    preview.replaceChildren();
    const combined = WeekScheduler.applyGenerated(currentWeek, result.scheduled);
    for (const day of WeekScheduler.days) {
        const column = document.createElement("section");
        column.className = "generated-day";
        const heading = document.createElement("h3");
        heading.textContent = day[0].toUpperCase() + day.slice(1);
        column.appendChild(heading);
        if (!combined[day].length) {
            const empty = document.createElement("p");
            empty.className = "preview-empty";
            empty.textContent = "Open day";
            column.appendChild(empty);
        } else {
            for (const task of combined[day]) column.appendChild(previewTaskElement(task));
        }
        preview.appendChild(column);
    }
}

goalForm.addEventListener("submit", function(event) {
    event.preventDefault();
    const goal = goalFromForm();
    const error = WeekScheduler.validateGoal(goal);
    if (error) { showGeneratorMessage(error, true); return; }
    if (editingGoalId) goals = goals.map(function(item) { return item.id === editingGoalId ? goal : item; });
    else {
        if (goals.length >= 50) { showGeneratorMessage("The generator supports up to 50 flexible goals.", true); return; }
        goals.push(goal);
    }
    saveGoals();
    renderGoals();
    markPreviewStale();
    showGeneratorMessage(`${goal.name} ${editingGoalId ? "updated" : "added"}. Generate a preview when your goals are ready.`);
    resetGoalForm();
});

document.getElementById("goal-mode").addEventListener("change", setModeFields);
document.getElementById("cancel-goal-edit").addEventListener("click", resetGoalForm);
document.getElementById("parse-goals").addEventListener("click", function() {
    const parsed = WeekScheduler.parseGoalText(document.getElementById("quick-goals").value);
    for (const preference of parsed.preferences) {
        if (preference.preference === "sleep") {
            document.getElementById("sleep-enabled").checked = true;
            document.getElementById("sleep-hours").value = preference.hours;
        } else document.getElementById("lunch-enabled").checked = true;
    }
    saveSettings(); describeSleep();
    const available = Math.max(0, 50 - goals.length);
    const added = parsed.goals.slice(0, available).map(completeGoal);
    goals.push(...added);
    saveGoals();
    renderGoals();
    markPreviewStale();
    if (added.length || parsed.preferences.length) document.getElementById("quick-goals").value = "";
    const messages = [`${added.length} described ${added.length === 1 ? "goal" : "goals"} added.`];
    if (parsed.preferences.length) messages.push(`${parsed.preferences.length} personal preferences updated. Review Your personal rhythm below.`);
    if (parsed.errors.length) messages.push(parsed.errors.join(" "));
    if (parsed.goals.length > available) messages.push("Some goals were skipped because the 50-goal limit was reached.");
    showGeneratorMessage(messages.join(" "), parsed.errors.length > 0 && added.length === 0);
});

document.querySelectorAll(".settings-card input, .settings-card select").forEach(function(control) {
    control.addEventListener("change", function() { saveSettings(); markPreviewStale(); });
});

document.getElementById("preview-week").addEventListener("click", function() {

    saveSettings();
    previewResult = null; applyButton.disabled = true;
    const result = WeekScheduler.schedule(currentWeek, goals, getSettings());
    if (result.error) {
        showGeneratorMessage(result.error, true);
        const goalError = result.goalErrors.find(Boolean);
        if (goalError) showGeneratorMessage(goalError, true);
        return;
    }
    previewResult = result;
    previewBasis = makeBasis();
    renderPreview(result);
    applyButton.disabled = false;
    showGeneratorMessage(result.warnings.length ?
        `Review ${result.warnings.length} personal-time conflicts below. Fixed commitments were preserved.` : result.unscheduled.length ?
        `${result.scheduled.length} sessions fit; ${result.unscheduled.length} could not fit. Adjust boundaries or goals, or apply the partial plan.` :
        `All ${result.scheduled.length} sessions fit. Review the preview, then apply it to your planner.`, result.scheduled.length === 0);
    document.querySelector(".preview-card").scrollIntoView({ behavior: "smooth", block: "start" });
});

applyButton.addEventListener("click", function() {
    if (!previewResult || previewBasis !== makeBasis()) {
        markPreviewStale();
        showGeneratorMessage("The planner, goals, or settings changed. Generate a fresh preview before applying.", true);
        return;
    }
    const nextWeek = WeekScheduler.applyGenerated(currentWeek, previewResult.scheduled);
    try {
        localStorage.setItem(weekStorageKey, JSON.stringify(nextWeek));
        currentWeek = nextWeek;
        updateFixedSummary();
        applyButton.disabled = true;
        showGeneratorMessage(`${previewResult.scheduled.length} generated sessions saved. Open the planner to use your new week.`);
    } catch (error) {
        showGeneratorMessage("The preview could not be saved. Your existing planner has not been changed.", true);
    }
});

document.getElementById("clear-generated").addEventListener("click", function() {
    const count = WeekScheduler.days.reduce(function(total, day) { return total + currentWeek[day].filter(function(task) { return task.generated; }).length; }, 0);
    if (!count || !confirm(`Remove ${count} auto-generated sessions? Fixed commitments will remain.`)) return;
    const nextWeek = WeekScheduler.applyGenerated(currentWeek, []);
    try {
        localStorage.setItem(weekStorageKey, JSON.stringify(nextWeek));
        currentWeek = nextWeek;
        previewResult = null;
        applyButton.disabled = true;
        document.getElementById("generated-preview").replaceChildren();
        document.getElementById("generation-summary").replaceChildren();
        updateFixedSummary();
        showGeneratorMessage(`${count} generated sessions removed. Fixed commitments were preserved.`);
    } catch (error) {
        showGeneratorMessage("Generated sessions could not be removed because browser storage failed.", true);
    }
});

loadData();
describeSleep();
setModeFields();
renderGoals();

window.addEventListener("storage", function(event) {
    if (![weekStorageKey, goalStorageKey, generatorSettingsKey, null].includes(event.key)) return;
    loadData(); describeSleep(); renderGoals(); markPreviewStale();
    showGeneratorMessage("Saved data changed in another tab. Review your settings and generate a fresh preview.");
});
