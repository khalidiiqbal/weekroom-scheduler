// A bounded iCalendar reader for importing ONE week's actual meetings.
// Unsupported recurrence rules are reported, never silently treated as weekly.
const IcsParser = (function() {
    const DAY = 86400000;
    const codes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    function decodeText(value) {
        return value.replace(/\\([nN,;\\])/g, function(match, character) {
            return /n/i.test(character) ? "\n" : character;
        });
    }

    function readProperty(line) {
        let quoted = false;
        let colon = -1;
        for (let index = 0; index < line.length; index++) {
            if (line[index] === '"') quoted = !quoted;
            if (line[index] === ":" && !quoted) { colon = index; break; }
        }
        if (colon < 1) throw new Error("Malformed calendar property.");
        const parts = line.slice(0, colon).split(";");
        const params = {};
        for (const part of parts.slice(1)) {
            const equal = part.indexOf("=");
            if (equal > 0) params[part.slice(0, equal).toUpperCase()] = part.slice(equal + 1).replace(/^"|"$/g, "");
        }
        return { name: parts[0].toUpperCase(), params, value: line.slice(colon + 1) };
    }

    function readCalendar(text) {
        // Folded lines may split a date or escaped text in the middle.
        const lines = text.replace(/^\uFEFF/, "").replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
        const stack = [];
        const events = [];
        let event = null;
        let calendarFound = false;
        for (const line of lines) {
            if (!line.trim()) continue;
            const property = readProperty(line);
            if (property.name === "BEGIN") {
                const component = property.value.toUpperCase();
                if (component === "VCALENDAR") calendarFound = true;
                if (component === "VEVENT" && stack[stack.length - 1] === "VCALENDAR") event = {};
                stack.push(component);
            } else if (property.name === "END") {
                if (stack.pop() !== property.value.toUpperCase()) throw new Error("The calendar has mismatched or incomplete sections.");
                if (property.value.toUpperCase() === "VEVENT" && event) { events.push(event); event = null; }
            } else if (event && stack[stack.length - 1] === "VEVENT") {
                // Ignore nested VALARM descriptions, reminders, and actions.
                if (!event[property.name]) event[property.name] = [];
                event[property.name].push(property);
            }
        }
        if (!calendarFound || stack.length) throw new Error("Choose a complete .ics calendar file.");
        if (events.length > 1000) throw new Error("This calendar has more than 1,000 event series. Export only your courses.");
        return events;
    }

    function first(event, name) { return event[name] && event[name][0]; }
    function value(event, name) { return first(event, name)?.value || ""; }

    function readDate(property) {
        if (!property) throw new Error("Missing start or end time.");
        const match = property.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
        if (!match) throw new Error("Unsupported calendar date/time.");
        const [,year,month,day,hour = "00",minute = "00",second = "00",utc] = match;
        const stamp = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
        const date = new Date(stamp);
        if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day ||
            +hour > 23 || +minute > 59 || +second > 59) throw new Error("Invalid calendar date/time.");
        return { stamp, date: stamp - (+hour * 3600 + +minute * 60 + +second) * 1000,
            allDay: !match[4] || property.params.VALUE === "DATE", utc: Boolean(utc), zone: property.params.TZID || "", second: +second };
    }

    function wallTime(stamp, zone) {
        const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(stamp));
        const fields = {};
        for (const part of parts) fields[part.type] = part.value;
        return Date.UTC(+fields.year, +fields.month - 1, +fields.day, +fields.hour, +fields.minute, +fields.second);
    }

    function dateLabel(stamp) { return new Date(stamp).toISOString().slice(0, 10); }
    function timeLabel(stamp) { return new Date(stamp).toISOString().slice(11, 16); }
    function weekStart(date) { return date - ((new Date(date).getUTCDay() + 6) % 7) * DAY; }

    function defaultTimeZone(text) {
        const zones = readCalendar(text).map(function(event) { return first(event, "DTSTART")?.params.TZID; }).filter(Boolean);
        return zones[0] || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    }

    function recurrenceDates(event, start, lastDate) {
        if (!event.RRULE) return [start.stamp];
        if (event.RRULE.length !== 1) throw new Error("Multiple recurrence rules are not supported.");
        const rule = {};
        for (const part of value(event, "RRULE").split(";")) {
            const [key, text] = part.split("=");
            rule[key.toUpperCase()] = text;
        }
        if (Object.keys(rule).some(function(key) { return !["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "WKST"].includes(key); }) ||
            !["WEEKLY", "DAILY"].includes(rule.FREQ)) throw new Error("Only daily/weekly recurrence with weekday filters is supported.");
        const interval = Number(rule.INTERVAL || 1);
        const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
        if (!Number.isInteger(interval) || interval < 1 || (rule.COUNT && (!Number.isInteger(count) || count < 1)) ||
            (rule.WKST && !codes.includes(rule.WKST))) throw new Error("Invalid recurrence interval, count, or week start.");
        const byDays = rule.BYDAY ? rule.BYDAY.split(",") : [codes[new Date(start.date).getUTCDay()]];
        if (byDays.some(function(day) { return !codes.includes(day); })) throw new Error("Numbered or invalid recurrence weekdays are not supported.");
        if (rule.BYDAY && !byDays.includes(codes[new Date(start.date).getUTCDay()])) throw new Error("The first event date does not match its recurrence weekdays.");
        let until = Infinity;
        if (rule.UNTIL) {
            const end = readDate({ value: rule.UNTIL, params: {} });
            until = end.utc && !start.utc && start.zone ? wallTime(end.stamp, start.zone) : end.stamp;
            if (end.allDay) until += DAY - 1;
        }
        const dates = [];
        const weekDay = codes.indexOf(rule.WKST || "MO");
        const anchor = start.date - ((new Date(start.date).getUTCDay() - weekDay + 7) % 7) * DAY;
        if ((lastDate - start.date) / DAY > 366 * 50) throw new Error("Recurrence begins more than 50 years before the selected week.");
        for (let date = start.date; date <= lastDate && dates.length < count; date += DAY) {
            const weekday = codes[new Date(date).getUTCDay()];
            const intervalMatches = rule.FREQ === "DAILY" ? (date - start.date) / DAY % interval === 0 : Math.floor((date - anchor) / DAY / 7) % interval === 0;
            const dayMatches = rule.FREQ === "DAILY" && !rule.BYDAY ? true : byDays.includes(weekday);
            const stamp = date + start.stamp - start.date;
            if (stamp > until) break;
            if (intervalMatches && dayMatches) dates.push(stamp);
        }
        return dates;
    }

    function parse(text, selectedDate, zone) {
        // Validate the requested display zone even when the calendar is empty.
        try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); }
        catch (error) { throw new Error("Enter a valid time zone, such as America/Toronto."); }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) throw new Error("Choose a date in the week to import.");
        const selected = readDate({ value: selectedDate.replace(/-/g, ""), params: {} });
        const monday = weekStart(selected.date);
        const endOfWeek = monday + 7 * DAY;
        const events = readCalendar(text);
        const entries = [];
        const warnings = [];
        // Do not guess at detached/modified recurring instances. Report affected series.
        const overridden = new Set(events.filter(function(event) { return event["RECURRENCE-ID"]; }).map(function(event) { return value(event, "UID"); }));
        for (const event of events) {
            const name = decodeText(value(event, "SUMMARY")) || "Untitled event";
            if (value(event, "STATUS") === "CANCELLED" && !event["RECURRENCE-ID"]) continue;
            try {
                if (overridden.has(value(event, "UID"))) throw new Error("Modified recurring instances need manual review; this series was not imported.");
                const start = readDate(first(event, "DTSTART"));
                if (start.allDay) throw new Error("All-day events need a scheduled time; add this event manually.");
                if (start.zone && start.zone !== zone) throw new Error(`Uses ${start.zone}; select that time zone to import this event.`);
                let duration;
                if (event.DTEND) {
                    const end = readDate(first(event, "DTEND"));
                    if (end.utc !== start.utc || end.zone !== start.zone || end.allDay || end.second) throw new Error("Start/end time zones or time formats differ.");
                    duration = end.stamp - start.stamp;
                } else {
                    const match = value(event, "DURATION").match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
                    if (!match) throw new Error("A same-day end time or hour/minute duration is required.");
                    duration = (Number(match[1] || 0) * 60 + Number(match[2] || 0)) * 60000;
                }
                if (start.second || duration <= 0 || duration >= DAY) throw new Error("Only positive, same-day events at minute precision are supported.");
                const dates = recurrenceDates(event, start, endOfWeek + DAY);
                for (const property of event.RDATE || []) {
                    for (const date of property.value.split(",")) {
                        const extra = readDate({ value: date, params: property.params });
                        if (extra.utc !== start.utc || extra.zone !== start.zone || extra.allDay) throw new Error("Additional dates use a different time zone or format.");
                        dates.push(extra.stamp);
                    }
                }
                const excluded = new Set();
                for (const property of event.EXDATE || []) {
                    for (const date of property.value.split(",")) {
                        const exception = readDate({ value: date, params: property.params });
                        if (exception.utc !== start.utc || exception.zone !== start.zone || exception.allDay) throw new Error("Excluded dates use a different time zone or format.");
                        excluded.add(exception.stamp);
                    }
                }
                const eventEntries = [];
                for (const stamp of new Set(dates)) {
                    if (excluded.has(stamp)) continue;
                    const localStart = start.utc ? wallTime(stamp, zone) : stamp;
                    const localEnd = start.utc ? wallTime(stamp + duration, zone) : stamp + duration;
                    if (localStart < monday || localStart >= endOfWeek) continue;
                    if (dateLabel(localStart) !== dateLabel(localEnd) || localEnd <= localStart) throw new Error("An overnight event cannot fit in a single planner day.");
                    eventEntries.push({ name, day: names[new Date(localStart).getUTCDay()], type: "class",
                        startTime: timeLabel(localStart), endTime: timeLabel(localEnd), location: decodeText(value(event, "LOCATION")),
                        details: [decodeText(value(event, "DESCRIPTION")), `Imported occurrence: ${dateLabel(localStart)} (${zone}). Snapshot only; does not repeat automatically.`].filter(Boolean).join("\n"),
                        source: `${dateLabel(localStart)} · ${zone} · ${event.RRULE ? "Recurring event evaluated for this week" : "Single event"}`, selected: true });
                }
                entries.push(...eventEntries);
            } catch (error) { warnings.push(`${name}: ${error.message}`); }
        }
        // ACORN may export one VEVENT per room for a single multi-room practical.
        // Merge only otherwise-identical occurrences, preserving every distinct room.
        const merged = [];
        for (const entry of entries) {
            const sameMeeting = merged.find(function(other) {
                return other.name === entry.name && other.day === entry.day &&
                    other.startTime === entry.startTime && other.endTime === entry.endTime &&
                    other.details === entry.details;
            });
            if (!sameMeeting) {
                merged.push(entry);
            } else {
                const locations = [...new Set(`${sameMeeting.location} / ${entry.location}`.split(" / ").filter(Boolean))];
                sameMeeting.location = locations.join(" / ");
                sameMeeting.source += `; combined location: ${entry.location || "unspecified"}`;
            }
        }
        if (merged.length > 300) throw new Error("More than 300 meetings occur in this week. Export a smaller calendar.");
        return { entries: merged, warnings: [...new Set(warnings)], monday: dateLabel(monday), sunday: dateLabel(endOfWeek - DAY) };
    }

    return { parse, readCalendar, defaultTimeZone, decodeText };
})();
if (typeof module !== "undefined") module.exports = IcsParser;
