// The week object is the source of truth; the DOM only displays it.
const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const taskTypes = ["class", "study", "commute", "gym", "work", "appointment", "hobby", "other"];
const storageKey = "studyPathWeek";
let week = createEmptyWeek();
let editingTaskId = null;

function createEmptyWeek() {
    return { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
}

// Form controls and feedback.
const taskForm = document.getElementById("task-form");
const taskNameInput = document.getElementById("task-name");
const taskTypeInput = document.getElementById("task-type");
const taskDayInput = document.getElementById("task-day");
const startTimeInput = document.getElementById("start-time");
const endTimeInput = document.getElementById("end-time");
const taskLocationInput = document.getElementById("task-location");
const taskDetailsInput = document.getElementById("task-details");
const clearWeekButton = document.getElementById("clear-week-button");
const formMessage = document.getElementById("form-message");
const storageMessage = document.getElementById("storage-message");

function showMessage(message, isError = false) {
    formMessage.textContent = message;
    formMessage.classList.toggle("error-message", isError);
}

// Restore existing data without letting malformed storage crash the page.
function loadWeek() {
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved === null) return;
        const data = JSON.parse(saved);
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid week");
        const restored = createEmptyWeek();
        const ids = new Set();
        let skipped = false;
        for (const day of days) {
            if (!Array.isArray(data[day])) {
                skipped = true;
                continue;
            }
            for (const task of data[day]) {
                if (!task || validateTask(task) || task.day !== day ||
                    !["string", "number"].includes(typeof task.id) ||
                    !String(task.id) || ids.has(String(task.id)) ||
                    typeof task.location !== "string" || typeof task.details !== "string") {
                    skipped = true;
                    continue;
                }
                ids.add(String(task.id));
                restored[day].push(task);
            }
            sortTasks(restored[day]);
        }
        week = restored;
        if (skipped) storageMessage.textContent = "Some saved entries could not be restored. Valid tasks are shown; the original saved data remains until your next change.";
    } catch (error) {
        storageMessage.textContent = "Saved data could not be read. You can plan here, but the next successful save will replace the unreadable data.";
    }
}

function saveWeek() {
    try {
        localStorage.setItem(storageKey, JSON.stringify(week));
        storageMessage.textContent = "Saved in this browser. Your schedule stays on this device.";
    } catch (error) {
        storageMessage.textContent = "Changes are visible but could not be saved. Keep this page open; reloading may lose your changes.";
    }
}

function generateTaskId() {
    if (globalThis.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(time) {

    const parts =
        time.split(":");

    let hour =
        Number(parts[0]);

    const minutes =
        parts[1];

    let period =
        "AM";

    if (hour >= 12) {
        period = "PM";
    }

    if (hour === 0) {
        hour = 12;
    }

    else if (hour > 12) {
        hour = hour - 12;
    }

    return `${hour}:${minutes} ${period}`;
}


function createTaskFromForm() {
    return {
        id: editingTaskId || generateTaskId(),
        name: taskNameInput.value.trim(),
        type: taskTypeInput.value,
        day: taskDayInput.value,
        startTime: startTimeInput.value,
        endTime: endTimeInput.value,
        location: taskLocationInput.value.trim(),
        details: taskDetailsInput.value.trim()
    };
}

// Return an error message, or an empty string when the task is valid.
function validateTask(task) {
    if (typeof task.name !== "string" || !task.name.trim()) return "Please enter a task name.";
    if (!days.includes(task.day)) return "Please select a valid weekday.";
    if (!taskTypes.includes(task.type)) return "Please select a valid task type.";
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(task.startTime) || !timePattern.test(task.endTime)) return "Please select a start and end time.";
    if (task.endTime <= task.startTime) return "End time must be after start time on the same day.";
    return "";
}

function hasConflict(task, existingTask) {
    // Strict comparisons allow back-to-back events. HH:MM strings sort by time.
    return task.day === existingTask.day &&
        task.startTime < existingTask.endTime && task.endTime > existingTask.startTime;
}

function addTask(task) {
    const error = validateTask(task);
    if (error) {
        showMessage(error, true);
        return false;
    }
    const conflict = week[task.day].find(function(existingTask) {
        return existingTask.id !== editingTaskId && hasConflict(task, existingTask);
    });
    if (conflict) {
        showMessage(`Conflicts with ${conflict.name} on ${task.day}, ${formatTime(conflict.startTime)} – ${formatTime(conflict.endTime)}. Choose another time.`, true);
        return false;
    }
    if (editingTaskId) for (const day of days) week[day] = week[day].filter(item => item.id !== editingTaskId);
    week[task.day].push(task);
    sortTasks(week[task.day]);
    saveWeek();
    renderWeek();
    showMessage(`${task.name} ${editingTaskId ? "updated" : "added"} on ${task.day}.`);
    return true;
}

function deleteTask(day, taskId) {
    const task = week[day].find(function(task) { return task.id === taskId; });
    if (!task) return;
    if (editingTaskId === taskId) clearForm();
    week[day] = week[day].filter(function(task) { return task.id !== taskId; });
    saveWeek();
    renderWeek();
    showMessage(`${task.name} deleted.`);
    document.getElementById(`${day}-tasks`).focus();
}

// Check the entire PDF selection before changing the week. Nothing is partially imported.
function validateImportTasks(tasks) {
    const accepted = [];
    return tasks.map(function(task) {
        const error = validateTask(task);
        if (error) return error;
        const existing = week[task.day].concat(accepted);
        const conflict = existing.find(function(other) { return hasConflict(task, other); });
        if (conflict) {
            if (task.name === conflict.name && task.startTime === conflict.startTime && task.endTime === conflict.endTime) {
                return "This commitment is already scheduled or selected twice. Uncheck this row.";
            }
            return `Overlaps ${conflict.name} (${formatTime(conflict.startTime)} – ${formatTime(conflict.endTime)}). Edit or uncheck this row.`;
        }
        accepted.push(task);
        return "";
    });
}

function importTasks(tasks) {
    if (!tasks.length || validateImportTasks(tasks).some(function(error) { return error; })) return false;
    for (const task of tasks) {
        // Only planner fields are saved; PDF source text stays in the temporary preview.
        week[task.day].push({ id: generateTaskId(), name: task.name.trim(), type: task.type,
            day: task.day, startTime: task.startTime, endTime: task.endTime,
            location: task.location.trim(), details: task.details.trim() });
    }
    for (const day of days) sortTasks(week[day]);
    saveWeek();
    renderWeek();
    showMessage(`${tasks.length} commitments imported from your timetable.`);
    return true;
}

function sortTasks(tasks) {
    tasks.sort(function(first, second) { return first.startTime.localeCompare(second.startTime); });
}

function createTaskElement(task, day) {
    return compactEvent(task, function(body) {
        if (!task.generated) {
            const edit = document.createElement("button");
            edit.type = "button"; edit.className = "text-button"; edit.textContent = "Edit";
            edit.addEventListener("click", function() {
                editingTaskId = task.id;
                taskNameInput.value = task.name; taskTypeInput.value = task.type;
                taskDayInput.value = task.day; startTimeInput.value = task.startTime;
                endTimeInput.value = task.endTime; taskLocationInput.value = task.location;
                taskDetailsInput.value = task.details;
                taskForm.querySelector('[type="submit"]').textContent = "Save changes";
                cancelTaskEdit.hidden = false; taskNameInput.focus();
                showMessage(`Editing ${task.name}. Save changes or cancel.`);
            });
            body.append(edit);
        }
        const remove = document.createElement("button");
        remove.type = "button"; remove.className = "text-button delete-text-button";
        remove.textContent = "Delete";
        remove.setAttribute("aria-label", `Delete ${task.name} on ${day}`);
        remove.addEventListener("click", () => deleteTask(day, task.id));
        body.append(remove);
    });
}

// -------------------------------------
// RENDER ONE DAY
// -------------------------------------

function renderDay(day) {

    const container =
        document.getElementById(
            `${day}-tasks`
        );


    // Clear old HTML

    container.innerHTML = "";


    const tasks =
        week[day];


    // Show empty message

    if (tasks.length === 0) {

        const emptyMessage =
            document.createElement("p");

        emptyMessage.classList.add(
            "empty-day-message"
        );

        emptyMessage.textContent =
            "No tasks yet";

        container.appendChild(
            emptyMessage
        );

        return;
    }


    // Sort by time

    sortTasks(tasks);


    // Create task elements

    tasks.forEach(
        function(task) {

            const taskElement =
                createTaskElement(
                    task,
                    day
                );

            container.appendChild(
                taskElement
            );

        }
    );

}


// -------------------------------------
// RENDER WHOLE WEEK
// -------------------------------------

function renderWeek() {

    for (const day in week) {

        renderDay(day);

    }

}


// -------------------------------------
// CLEAR FORM
// -------------------------------------

function clearForm() {
    editingTaskId = null;
    taskForm.querySelector('[type="submit"]').textContent = "Add to Schedule";
    cancelTaskEdit.hidden = true;

    taskNameInput.value = "";

    taskLocationInput.value = "";

    taskDetailsInput.value = "";

    startTimeInput.value = "";

    endTimeInput.value = "";

    taskNameInput.focus();

}


// User actions.
const cancelTaskEdit = document.createElement("button");
cancelTaskEdit.type = "button"; cancelTaskEdit.className = "text-button";
cancelTaskEdit.textContent = "Cancel edit"; cancelTaskEdit.hidden = true;
cancelTaskEdit.addEventListener("click", () => { clearForm(); showMessage("Edit cancelled."); });
taskForm.append(cancelTaskEdit);

taskForm.addEventListener("submit", function(event) {
    event.preventDefault();
    if (addTask(createTaskFromForm())) clearForm();
});

clearWeekButton.addEventListener("click", function() {
    if (!confirm("Clear every task from this week? This cannot be undone.")) return;
    week = createEmptyWeek();
    clearForm();
    saveWeek();
    renderWeek();
    showMessage("Your week has been cleared.");
});

loadWeek();
renderWeek();
