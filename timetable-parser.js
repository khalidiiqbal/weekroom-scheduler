// Text/layout parsing is independent of PDF.js and the planner DOM.
// PDFs have no standard timetable format, so every result must be reviewed.
const TimetableParser = (function() {
    const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const dayPattern = /\b(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi;
    const rangePattern = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–—]|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;

    function findDays(text) {
        const matches = text.match(dayPattern) || [];
        return [...new Set(matches.map(function(day) {
            return dayNames.find(function(name) { return name.startsWith(day.slice(0, 3).toLowerCase()); });
        }))];
    }

    function toTime(hour, minute, period) {
        hour = Number(hour);
        minute = Number(minute || 0);
        if (minute > 59 || hour > 23 || (period && (hour < 1 || hour > 12))) return "";
        if (period) hour = hour % 12 + (period.toLowerCase() === "pm" ? 12 : 0);
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    function findTimeRange(text) {
        const match = text.match(rangePattern);
        if (!match) return null;
        // Bare numbers such as course codes or dates are not meeting times.
        if (!match[2] && !match[3] && !match[5] && !match[6]) return null;
        let startPeriod = match[3] || match[6];
        let start = toTime(match[1], match[2], startPeriod);
        const end = toTime(match[4], match[5], match[6] || match[3]);
        // Common shorthand: 11:00-1:00 PM means 11 AM to 1 PM.
        if (!match[3] && match[6] && start >= end) {
            startPeriod = match[6].toLowerCase() === "pm" ? "am" : "pm";
            start = toTime(match[1], match[2], startPeriod);
        }
        return { startTime: start, endTime: end, text: match[0] };
    }

    function parseEntry(text, defaultDay = "", source = "") {
        const time = findTimeRange(text);
        if (!time) return [];
        const foundDays = findDays(text);
        const entryDays = foundDays.length ? foundDays : [defaultDay];
        let name = text.replace(time.text, "").replace(dayPattern, "");
        let location = "";
        const place = name.match(/(?:\b(?:location|room)\s*:?\s*|@\s*)(.+)$/i);
        if (place) {
            location = place[0].replace(/^location\s*:?\s*/i, "").replace(/^@\s*/, "").trim();
            name = name.slice(0, place.index);
        }
        name = name.replace(/^[\s|,;:/-]+|[\s|,;:/-]+$/g, "").replace(/\s*[|;]\s*/g, " ").replace(/\s+/g, " ").trim();
        return entryDays.map(function(day) {
            return { name, day, type: "class", startTime: time.startTime, endTime: time.endTime,
                location, details: "", source: source || text };
        });
    }

    // Group PDF text fragments by their baseline, then order them left to right.
    function groupLines(items) {
        const lines = [];
        const ordered = items.filter(function(item) { return item.text.trim(); }).slice().sort(function(a, b) {
            return a.y - b.y || a.x - b.x;
        });
        for (const item of ordered) {
            let line = lines[lines.length - 1];
            if (!line || Math.abs(line.y - item.y) > 3) {
                line = { y: item.y, items: [] };
                lines.push(line);
            }
            line.items.push(item);
        }
        for (const line of lines) {
            line.items.sort(function(a, b) { return a.x - b.x; });
            line.text = line.items.map(function(item) { return item.text; }).join(" ");
        }
        return lines;
    }

    function parseLines(lines, defaultDay = "", pageNumber = 1) {
        const entries = [];
        let currentDay = defaultDay;
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            const lineDays = findDays(line.text);
            if (!findTimeRange(line.text)) {
                if (lineDays.length === 1 && line.text.replace(dayPattern, "").trim() === "") currentDay = lineDays[0];
                continue;
            }
            let text = line.text;
            // Timetables often put a course title immediately above its time.
            const previous = lines[index - 1];
            const bare = parseEntry(text, currentDay)[0];
            if (bare && !bare.name && previous && line.y - previous.y <= 22 &&
                !findTimeRange(previous.text) && !findDays(previous.text).length) {
                text = `${previous.text} ${text}`;
            }
            const next = lines[index + 1];
            if (next && next.y - line.y <= 22 && /^(room\b|location\b|@)/i.test(next.text)) text += ` ${next.text}`;
            entries.push(...parseEntry(text, currentDay, `Page ${pageNumber}: ${text}`));
        }
        return entries;
    }

    // ACORN prints course code, section, delivery mode, time, and room on separate lines.
    // Its afternoon clock has no AM/PM; the left-hand axis supplies that context.
    function parseAcornColumn(lines, day, axis, pageNumber) {
        const coursePattern = /^[A-Z]{3}\d{3}[HY]\d\b/;
        const entries = [];
        for (let index = 0; index < lines.length; index++) {
            if (!coursePattern.test(lines[index].text.trim())) continue;
            const title = lines[index];
            const block = [title];
            while (index + 1 < lines.length && !coursePattern.test(lines[index + 1].text.trim())) block.push(lines[++index]);
            const timeIndex = block.findIndex(function(line) { return findTimeRange(line.text); });
            if (timeIndex < 0) continue;
            const range = findTimeRange(block[timeIndex].text);
            const sectionText = block.slice(1, timeIndex).map(function(line) { return line.text; }).join(" ");
            const section = sectionText.match(/\b(?:LEC|TUT|PRA|LAB|SEM)\s*\d+/i);
            let startTime = range.startTime;
            let endTime = range.endTime;
            let warning = "";
            if (!/\b(?:am|pm)\b/i.test(range.text)) {
                const row = axis.slice().sort(function(a, b) { return Math.abs(a.y - title.y) - Math.abs(b.y - title.y); })[0];
                if (row && Math.abs(row.y - title.y) < 15 && Number(startTime.slice(0, 2)) % 12 === row.hour % 12) {
                    startTime = `${String(row.hour).padStart(2, "0")}:${startTime.slice(3)}`;
                    let endHour = Number(endTime.slice(0, 2)) % 12;
                    while (endHour * 60 + Number(endTime.slice(3)) <= row.hour * 60 + Number(startTime.slice(3))) endHour += 12;
                    endTime = endHour < 24 ? `${String(endHour).padStart(2, "0")}:${endTime.slice(3)}` : "";
                } else {
                    startTime = "";
                    endTime = "";
                    warning = "Confirm the times: the timetable's AM/PM context could not be determined.";
                }
            }
            const alternating = /alternating\s+weeks/i.test(sectionText);
            if (alternating) warning += " Alternating weeks: include only if this class meets in the week you are planning. The planner does not track alternating weeks automatically.";
            const location = block.slice(timeIndex + 1).filter(function(line) {
                return line.y - block[timeIndex].y < 40 && /^(?:[A-Z]{2,5}\s+[A-Z]?\d|Online\b|TBA\b)/.test(line.text.trim());
            }).map(function(line) { return line.text.trim(); }).join(" ");
            entries.push({ name: `${title.text.trim()}${section ? ` ${section[0]}` : ""}`, day, type: "class",
                startTime, endTime, location, details: [sectionText, warning.trim()].filter(Boolean).join("\n"),
                selected: !alternating && !warning, source: `Page ${pageNumber}: ${title.text} · ${day} · ${range.text}${warning ? ` — ${warning.trim()}` : ""}` });
        }
        return entries;
    }

    function parsePage(items, pageNumber) {
        const lines = groupLines(items);
        // Recognize weekday columns only when the header contains separate day labels.
        const header = lines.find(function(line) {
            return line.items.filter(function(item) {
                return findDays(item.text).length === 1 && item.text.replace(dayPattern, "").trim() === "";
            }).length >= 2;
        });
        if (!header) return parseLines(lines, "", pageNumber);
        const columns = header.items.filter(function(item) {
            return findDays(item.text).length === 1 && item.text.replace(dayPattern, "").trim() === "";
        }).map(function(item) { return { day: findDays(item.text)[0], center: item.x + item.width / 2 }; });
        const firstBoundary = columns[0].center - (columns[1].center - columns[0].center) / 2;
        const axis = [];
        for (const item of items.slice().sort(function(a, b) { return a.y - b.y; })) {
            if (item.x + item.width < firstBoundary && item.y > header.y && /^\d{1,2}:\d{2}$/.test(item.text.trim())) {
                let hour = Number(item.text.split(":")[0]);
                if (axis.length) while (hour <= axis[axis.length - 1].hour) hour += 12;
                if (hour < 24) axis.push({ y: item.y, hour });
            }
        }
        const isAcorn = items.some(function(item) { return /ACORN/.test(item.text); }) &&
            items.some(function(item) { return /^[A-Z]{3}\d{3}[HY]\d\b/.test(item.text); });
        const entries = [];
        for (let index = 0; index < columns.length; index++) {
            const column = columns[index];
            const left = index ? (columns[index - 1].center + column.center) / 2 : column.center - (columns[1].center - column.center) / 2;
            const right = index < columns.length - 1 ? (column.center + columns[index + 1].center) / 2 : Infinity;
            const columnItems = items.filter(function(item) {
                const center = item.x + item.width / 2;
                return item.y > header.y + 3 && center >= left && center < right;
            });
            const columnLines = groupLines(columnItems);
            entries.push(...(isAcorn ? parseAcornColumn(columnLines, column.day, axis, pageNumber) : parseLines(columnLines, column.day, pageNumber)));
        }
        return entries;
    }

    function parseText(text) {
        return parseLines(text.split(/\r?\n/).map(function(text, index) {
            return { text, y: index * 16 };
        }));
    }

    return { findDays, findTimeRange, parseEntry, groupLines, parsePage, parseText };
})();

// Allows dependency-free command-line tests; the application uses the browser global.
if (typeof module !== "undefined") module.exports = TimetableParser;
