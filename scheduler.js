// Pure scheduling logic. It has no DOM or localStorage dependencies, so the
// algorithm can be tested separately from the webpage.
const WeekScheduler = (function() {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const typeWords = {
        gym: ["gym", "workout", "exercise", "run", "running", "fitness"],
        study: ["study", "assignment", "homework", "exam", "reading", "review"],
        work: ["job", "career", "resume", "interview", "work", "applications"],
        hobby: ["guitar", "piano", "music", "hobby", "paint", "drawing", "gaming", "photography"]
    };

    function toMinutes(time) {
        const match = /^(\d{2}):(\d{2})$/.exec(time || "");
        if (!match || +match[1] > 23 || +match[2] > 59) return NaN;
        return +match[1] * 60 + +match[2];
    }

    function toTime(minutes) {
        return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    }

    function inferType(name) {
        const lower = name.toLowerCase();
        for (const [type, words] of Object.entries(typeWords)) {
            if (words.some(function(word) { return lower.includes(word); })) return type;
        }
        return "other";
    }

    function cleanGoalName(name) {
        return name.trim().replace(/^(?:of|for|to)\s+/i, "").replace(/[.!]+$/, "");
    }

    function durationMinutes(number, unit) {
        return Math.round(Number(number) * (/^h/i.test(unit) ? 60 : 1));
    }

    function parseGoalLine(line) {
        const text = line.trim().replace(/^[-*]\s*/, "");
        if (!text) return null;
        const sleep = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*hours?\s+(?:of\s+)?sleep\s+(?:each|every|a|per)\s+night[.!]?$/i);
        if (sleep) return { preference: "sleep", hours: Number(sleep[1]) };
        if (/lunch/i.test(text) && /campus/i.test(text)) return { preference: "lunch" };
        let match = text.match(/^(\d+)\s+(?:(\d+(?:\.\d+)?)\s*[- ]?\s*(hours?|hrs?|minutes?|mins?)\s+)?(.+?)\s+sessions?$/i);
        if (match) {
            const count = Number(match[1]);
            const minutes = match[2] ? durationMinutes(match[2], match[3]) : 60;
            const name = cleanGoalName(match[4]);
            return { name, type: inferType(name), mode: "sessions", sessionCount: count,
                sessionMinutes: minutes, totalMinutes: count * minutes };
        }
        match = text.match(/^(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\s+(?:of\s+)?(.+)$/i);
        if (match) {
            const total = durationMinutes(match[1], match[2]);
            const name = cleanGoalName(match[3]);
            return { name, type: inferType(name), mode: "total", totalMinutes: total,
                sessionMinutes: Math.min(60, total), sessionCount: Math.ceil(total / Math.min(60, total)) };
        }
        match = text.match(/^(.+?)\s+for\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)$/i);
        if (match) {
            const total = durationMinutes(match[2], match[3]);
            const name = cleanGoalName(match[1]);
            return { name, type: inferType(name), mode: "total", totalMinutes: total,
                sessionMinutes: Math.min(60, total), sessionCount: Math.ceil(total / Math.min(60, total)) };
        }
        return { error: `Add an amount to “${text}”, such as “2 hours of ${text}”.` };
    }

    function parseGoalText(text) {
        const goals = [];
        const errors = [];
        const preferences = [];
        for (const line of text.split(/\r?\n|;/)) {
            const parsed = parseGoalLine(line);
            if (!parsed) continue;
            if (parsed.error) errors.push(parsed.error);
            else if (parsed.preference) preferences.push(parsed);
            else goals.push(parsed);
        }
        return { goals, errors, preferences };
    }

    function validateGoal(goal) {
        if (!goal || typeof goal.name !== "string" || !goal.name.trim()) return "Enter a goal name.";
        if (!["study", "gym", "work", "hobby", "other"].includes(goal.type)) return "Choose a valid goal type.";
        if (!["total", "sessions"].includes(goal.mode)) return "Choose a scheduling mode.";
        if (!Number.isInteger(goal.sessionMinutes) || goal.sessionMinutes < 15 || goal.sessionMinutes > 360 || goal.sessionMinutes % 15) return "Session length must be 15–360 minutes in 15-minute steps.";
        if (goal.mode === "total" && (!Number.isInteger(goal.totalMinutes) || goal.totalMinutes < 15 || goal.totalMinutes > 2400 || goal.totalMinutes % 15)) return "Total time must be 15 minutes to 40 hours in 15-minute steps.";
        if (goal.mode === "sessions" && (!Number.isInteger(goal.sessionCount) || goal.sessionCount < 1 || goal.sessionCount > 21)) return "Choose 1–21 sessions.";
        if (!["low", "normal", "high"].includes(goal.priority)) return "Choose a valid priority.";
        if (!["any", "morning", "afternoon", "evening"].includes(goal.preferredTime)) return "Choose a valid time preference.";
        if (!Array.isArray(goal.allowedDays) || !goal.allowedDays.length || goal.allowedDays.some(function(day) { return !days.includes(day); })) return "Choose at least one available day.";
        if (goal.deadlineDay && !days.includes(goal.deadlineDay)) return "Choose a valid deadline day.";
        return "";
    }

    function buildSessions(goal) {
        if (goal.mode === "sessions") return Array.from({ length: goal.sessionCount }, function(_, index) {
            return { goal, duration: goal.sessionMinutes, sessionNumber: index + 1, sessionTotal: goal.sessionCount };
        });
        const sessions = [];
        let remaining = goal.totalMinutes;
        while (remaining > 0) {
            const duration = Math.min(goal.sessionMinutes, remaining);
            sessions.push({ goal, duration, sessionNumber: sessions.length + 1 });
            remaining -= duration;
        }
        for (const session of sessions) session.sessionTotal = sessions.length;
        return sessions;
    }

    function overlaps(start, end, busy, buffer) {
        return busy.some(function(item) {
            const itemBuffer = item.generated ? buffer : 0;
            return start < item.end + itemBuffer && end > item.start - itemBuffer;
        });
    }

    function timePreferenceScore(preference, start, end) {
        if (preference === "any") return 0;
        const ranges = { morning: [8 * 60, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 22 * 60] };
        const range = ranges[preference];
        if (start >= range[0] && end <= range[1]) return 160;
        const midpoint = (start + end) / 2;
        const preferredMidpoint = (range[0] + range[1]) / 2;
        return -Math.abs(midpoint - preferredMidpoint) / 3;
    }

    function normalizeWeek(week) {
        const busy = {};
        for (const day of days) {
            busy[day] = (Array.isArray(week?.[day]) ? week[day] : []).filter(function(task) { return !task.generated; }).map(function(task) {
                return { start: toMinutes(task.startTime), end: toMinutes(task.endTime), generated: false, task };
            }).filter(function(item) { return Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start; });
        }
        return busy;
    }

    function schedule(week, goals, settings) {
        const errors = goals.map(validateGoal);
        if (errors.some(Boolean)) return { error: "One or more goals need attention.", goalErrors: errors, scheduled: [], unscheduled: [] };
        const startOfDay = toMinutes(settings.dayStart);
        const endOfDay = toMinutes(settings.dayEnd);
        const buffer = Number(settings.breakMinutes);
        if (!Number.isFinite(startOfDay) || !Number.isFinite(endOfDay) || endOfDay <= startOfDay || endOfDay - startOfDay < 30) {
            return { error: "The scheduling window must end at least 30 minutes after it starts.", goalErrors: errors, scheduled: [], unscheduled: [] };
        }
        if (![0, 15, 30, 45, 60].includes(buffer)) return { error: "Choose a valid break length.", goalErrors: errors, scheduled: [], unscheduled: [] };
        const busy = normalizeWeek(week);
        const scheduled = [];
        const unscheduled = [];
        const warnings = [];
        const personal = settings.personal || {};
        const protect = function(day, start, end, name, key, location = "") {
            if (overlaps(start, end, busy[day], 0)) {
                warnings.push(`${day}: ${name} conflicts with a fixed commitment or another protected routine.`);
                // Still protect this interval against flexible goals.
                busy[day].push({ start, end, generated: false });
                return;
            }
            const task = { id: `routine-${key}-${day}`, generated: true, routine: true,
                name, type: "other", day, startTime: toTime(start), endTime: toTime(end),
                location, details: "Protected personal time. Change this routine in Generate → Your personal rhythm." };
            scheduled.push(task);
            busy[day].push({ start, end, generated: false, task });
        };
        if (personal.sleepEnabled) {
            const wake = toMinutes(personal.wakeTime);
            const duration = Number(personal.sleepHours) * 60;
            if (!Number.isFinite(wake) || !Number.isFinite(duration) || duration < 240 || duration > 720 || duration % 15) {
                return { error: "Choose 4–12 hours of sleep in quarter-hour steps and a wake-up time.", goalErrors: [], scheduled: [], unscheduled: [] };
            }
            const bedtime = (wake - duration + 1440) % 1440;
            for (const day of days) {
                const ranges = bedtime < wake ? [[bedtime, wake]] : [[0, wake], [bedtime, 1440]];
                for (const [start, end] of ranges.filter(range => range[1] > range[0])) {
                    if (overlaps(start, end, busy[day], 0)) warnings.push(`${day}: a fixed commitment interrupts your ${personal.sleepHours}-hour sleep window.`);
                    busy[day].push({ start, end, generated: false });
                }
            }
        }
        for (const [index, routine] of (Array.isArray(personal.routines) ? personal.routines : []).entries()) {
            const start = toMinutes(routine.start), end = toMinutes(routine.end);
            if (!routine.name?.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
                !Array.isArray(routine.days) || !routine.days.length || routine.days.some(day => !days.includes(day))) {
                return { error: "Each protected routine needs a name, days, and a same-day start and end time.", goalErrors: [], scheduled: [], unscheduled: [] };
            }
            for (const day of routine.days) protect(day, start, end, routine.name, index);
        }
        if (personal.lunchEnabled) {
            const from = toMinutes(personal.lunchStart), until = toMinutes(personal.lunchEnd);
            const duration = Number(personal.lunchMinutes);
            if (!Number.isFinite(from) || !Number.isFinite(until) || ![15,30,45,60,90].includes(duration) || until - from < duration) {
                return { error: "Lunch must fit inside its preferred time window.", goalErrors: [], scheduled: [], unscheduled: [] };
            }
            for (const day of days) {
                const campus = busy[day].filter(item => item.task && !item.task.generated &&
                    (item.task.type === "class" || /campus/i.test(item.task.location || "")));
                if (!campus.length) continue;
                const start = Math.max(from, Math.min(...campus.map(item => item.start)));
                const end = Math.min(until, Math.max(...campus.map(item => item.end)));
                const candidates = [];
                for (let time = Math.ceil(start / 15) * 15; time + duration <= end; time += 15) {
                    if (!overlaps(time, time + duration, busy[day], 0)) candidates.push(time);
                }
                candidates.sort((a,b) => Math.abs(a - 720) - Math.abs(b - 720));
                if (candidates.length) protect(day, candidates[0], candidates[0] + duration, "Lunch on campus", "lunch", "Campus");
                else unscheduled.push({ name: "Lunch on campus", sessionNumber: day, duration,
                    reason: `No ${duration}-minute gap during your campus stay and lunch window. Adjust the window or your commitments.` });
            }
        }
        const dayLoads = Object.fromEntries(days.map(function(day) {
            return [day, busy[day].reduce(function(total, item) { return total + item.end - item.start; }, 0)];
        }));
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const orderedGoals = goals.slice().sort(function(a, b) {
            const deadlineA = a.deadlineDay ? days.indexOf(a.deadlineDay) : 7;
            const deadlineB = b.deadlineDay ? days.indexOf(b.deadlineDay) : 7;
            return deadlineA - deadlineB || priorityOrder[a.priority] - priorityOrder[b.priority] || b.sessionMinutes - a.sessionMinutes;
        });
        const sessions = orderedGoals.flatMap(buildSessions);
        if (sessions.length > 100) return { error: "The goals create more than 100 sessions. Reduce the session count or use longer sessions.", goalErrors: errors, scheduled: [], unscheduled: [] };

        for (const session of sessions) {
            const goal = session.goal;
            const deadlineIndex = goal.deadlineDay ? days.indexOf(goal.deadlineDay) : 6;
            const candidates = [];
            for (let dayIndex = 0; dayIndex <= deadlineIndex; dayIndex++) {
                const day = days[dayIndex];
                if (!goal.allowedDays.includes(day)) continue;
                for (let start = startOfDay; start + session.duration <= endOfDay; start += 15) {
                    const end = start + session.duration;
                    if (overlaps(start, end, busy[day], buffer)) continue;
                    const sameGoalToday = scheduled.filter(function(item) { return item.goalId === goal.id && item.day === day; }).length;
                    const distinctGoalDays = new Set(scheduled.filter(function(item) { return item.goalId === goal.id; }).map(function(item) { return item.day; }));
                    const nearCommitment = busy[day].some(function(item) { return Math.abs(item.end - start) <= 30 || Math.abs(end - item.start) <= 30; });
                    let score = timePreferenceScore(goal.preferredTime, start, end);
                    if (settings.balanceWeek) score -= dayLoads[day] / 6;
                    score -= sameGoalToday * 260;
                    if (!distinctGoalDays.has(day)) score += 90;
                    if (nearCommitment) score += settings.compactDays ? 35 : 0;
                    score += (6 - dayIndex) * 0.01 - start / 100000;
                    candidates.push({ day, dayIndex, start, end, score });
                }
            }
            candidates.sort(function(a, b) { return b.score - a.score || a.dayIndex - b.dayIndex || a.start - b.start; });
            const best = candidates[0];
            if (!best) {
                unscheduled.push({ goalId: goal.id, name: goal.name, duration: session.duration,
                    sessionNumber: session.sessionNumber, reason: `No ${session.duration}-minute opening within its allowed days and scheduling window.` });
                continue;
            }
            const task = { id: `generated-${goal.id}-${session.sessionNumber}`, goalId: goal.id, generated: true,
                name: goal.name, type: goal.type, day: best.day, startTime: toTime(best.start), endTime: toTime(best.end), location: "",
                details: [`Auto-scheduled session ${session.sessionNumber} of ${session.sessionTotal}.`,
                    `Priority: ${goal.priority}.`, goal.notes].filter(Boolean).join(" ") };
            scheduled.push(task);
            busy[best.day].push({ start: best.start, end: best.end, generated: true, task });
            dayLoads[best.day] += session.duration;
        }
        return { error: "", goalErrors: errors, scheduled, unscheduled, warnings };
    }

    function applyGenerated(week, generatedTasks) {
        const result = {};
        for (const day of days) result[day] = (Array.isArray(week?.[day]) ? week[day] : []).filter(function(task) { return !task.generated; });
        for (const task of generatedTasks) result[task.day].push({ ...task });
        for (const day of days) result[day].sort(function(a, b) { return a.startTime.localeCompare(b.startTime); });
        return result;
    }

    return { days, toMinutes, toTime, parseGoalLine, parseGoalText, inferType, validateGoal, buildSessions, schedule, applyGenerated };
})();
if (typeof module !== "undefined") module.exports = WeekScheduler;
