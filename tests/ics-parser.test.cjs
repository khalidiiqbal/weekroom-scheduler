const assert = require("node:assert/strict");
const parser = require("../ics-parser.js");

const calendar = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:course-1\r
SUMMARY:ECE231H1 LEC0103\r
DTSTART;TZID=America/Toronto:20260908T160000\r
DTEND;TZID=America/Toronto:20260908T170000\r
RRULE:FREQ=WEEKLY;UNTIL=20261208T235959\r
EXDATE;TZID=America/Toronto:20260922T160000\r
LOCATION:BA 1130\r
DESCRIPTION:Electronics\\nLecture\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:once\r
SUMMARY:One-off lab\r
DTSTART:20260923T140000Z\r
DTEND:20260923T160000Z\r
LOCATION:Online\r
END:VEVENT\r
END:VCALENDAR\r
`;

assert.equal(parser.defaultTimeZone(calendar), "America/Toronto");
assert.equal(parser.decodeText("A\\nB\\, C\\; D\\\\E"), "A\nB, C; D\\E");
let result = parser.parse(calendar, "2026-09-14", "America/Toronto");
assert.equal(result.entries.length, 1);
assert.equal(result.entries[0].name, "ECE231H1 LEC0103");
assert.equal(result.entries[0].day, "tuesday");
assert.equal(result.entries[0].startTime, "16:00");
assert.equal(result.entries[0].location, "BA 1130");
result = parser.parse(calendar, "2026-09-21", "America/Toronto");
assert.equal(result.entries.length, 1, "EXDATE removes the recurring class");
assert.equal(result.entries[0].day, "wednesday");
assert.equal(result.entries[0].startTime, "10:00", "UTC event is converted to Toronto daylight time");
assert.match(result.entries[0].details, /Snapshot only/);
assert.throws(() => parser.parse(calendar, "bad", "America/Toronto"), /Choose a date/);
assert.throws(() => parser.parse(calendar, "2026-09-21", "Not\/AZone"), /valid time zone/);

const folded = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nSUMMARY:Folded clas\n s\nDTSTART:20260921T090000\nDTEND:20260921T100000\nEND:VEVENT\nEND:VCALENDAR`;
assert.equal(parser.parse(folded, "2026-09-21", "UTC").entries[0].name, "Folded class");
const unsupported = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nSUMMARY:Monthly\nDTSTART:20260921T090000\nDTEND:20260921T100000\nRRULE:FREQ=MONTHLY\nEND:VEVENT\nEND:VCALENDAR`;
result = parser.parse(unsupported, "2026-09-21", "UTC");
assert.equal(result.entries.length, 0);
assert.match(result.warnings[0], /Only daily\/weekly/);

const multiRoom = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nSUMMARY:ECE PRA\nDTSTART:20260925T130000\nDTEND:20260925T160000\nLOCATION:BA 3155\nDESCRIPTION:Practice\nEND:VEVENT\nBEGIN:VEVENT\nUID:b\nSUMMARY:ECE PRA\nDTSTART:20260925T130000\nDTEND:20260925T160000\nLOCATION:BA 3165\nDESCRIPTION:Practice\nEND:VEVENT\nEND:VCALENDAR`;
result = parser.parse(multiRoom, "2026-09-21", "America/Toronto");
assert.equal(result.entries.length, 1);
assert.equal(result.entries[0].location, "BA 3155 / BA 3165");
console.log("PASS: ICS parsing, folding, text escaping, timezone conversion, recurrence, EXDATE, and unsupported-rule warnings.");
