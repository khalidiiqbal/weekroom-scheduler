# Weekroom

A student-focused weekly planner for classes, study sessions, commute time, work, and life outside school. Weekroom is built around a simple promise: **you have more time than you think**. It uses plain HTML, CSS, and JavaScript so the scheduling logic stays understandable before a future framework migration.

## Run locally

Serve this folder using VS Code Live Server or `python -m http.server 8000`, then visit `http://localhost:8000`. No npm, build step, or backend is needed. Use the same browser and address to restore your saved week. Opening the HTML files directly works for manual planning, but PDF import requires HTTP(S) to load its local module and worker.

## Current features

- Seven-day planner with eight color-coded commitment types.
- Required-input and same-day time validation.
- General overlap detection; back-to-back commitments are allowed.
- Chronological rendering from the JavaScript `week` object.
- Edit fixed commitments, individual deletion, and clear-week confirmation.
- Browser localStorage persistence, guarded loading, and visible save-failure feedback.
- Optional location and notes displayed safely as text.
- Compact responsive calendars with hover previews, click-to-pin details, keyboard disclosures, and touch support.
- Personal rhythm: nightly sleep protection, campus lunch gaps, and named protected routines on selected days.
- Local PDF and iCalendar (`.ics`) import with editable preview, selection, duplicate detection, and batch conflict checks.
- Automatic week generation from flexible goals, with priorities, deadlines, preferred times, day availability, session splitting, and a reviewable preview.

## Files

```text
study-path-transit/
├── index.html       # Existing landing page and planner links
├── planner.html     # Fixed commitments and final seven-day schedule
├── generate.html    # Flexible-goal form, generator settings, and preview
├── style.css        # Shared styles and responsive layouts
├── index.js         # Reserved for homepage behavior
├── planner.js       # State, validation, persistence, and rendering
├── generator.js     # Goal editing, generator UI, previews, and applying plans
├── scheduler.js     # Parsing, validation, session splitting, and placement logic
├── timetable-parser.js # Text, weekday-column, and ACORN grid parsing
├── ics-parser.js    # Calendar events, recurrence, exclusions, and time zones
├── pdf-import.js    # Local PDF/ICS reading and editable import preview
├── vendor/pdfjs/    # Pinned Mozilla PDF.js library, worker, resources, licenses
├── tests/          # Parser, scheduler, batch regression tests, and PDF fixtures
└── README.md
```

## How the planner works

`loadWeek()` restores the `studyPathWeek` storage key. `createTaskFromForm()` builds a task with a unique ID. `validateTask()` checks its fields, and `hasConflict()` uses strict interval comparisons to reject overlaps. `addTask()` updates state, sorts, saves, and renders. `deleteTask()` removes by ID. `createTaskElement()`, `renderDay()`, and `renderWeek()` turn state into DOM elements using textContent for user text.

## Generate a week

1. Add classes, shifts, appointments, imports, and other fixed commitments in the planner.
2. Open **Generate Week** and use Quick Add for phrases such as `4 hours of job searching`, `4 1-hour gym sessions`, or `play guitar for 2 hours`. Use the detailed form when you want to set exact days, priority, preferred time, a deadline, or an exact number of sessions.
3. Choose the usable part of the day and the break between generated sessions. You can balance work across the week or prefer fewer, more focused days.
4. Generate a preview. The scheduler treats fixed commitments as hard constraints, splits total-time goals into manageable sessions, spreads repeated sessions, scores open times by preferences and workload, and explains anything it cannot fit.
5. Select **Apply to Planner**. Generated sessions are marked `AUTO`. Regenerating replaces earlier automatic sessions while preserving every fixed commitment.

Goals are stored under `studyPathFlexibleGoals`; the final schedule continues to use `studyPathWeek`. Clearing generated sessions removes only automatic sessions. The generator is deterministic, so unchanged goals, settings, and commitments produce the same plan.

## Import a timetable

1. Expand **Import a timetable** and choose a PDF or `.ics` file. PDFs can be up to 20 MB and 40 pages; calendar files can be up to 5 MB.
2. For `.ics`, choose a date in the week you want and confirm the detected time zone. The importer evaluates recurrences and exclusions for that Monday-Sunday window.
3. Review all detected commitments against your original timetable. Correct names, weekdays, times, types, locations, and notes; uncheck unwanted entries.
4. Use **Add missing commitment** for missed classes, or correct extracted PDF text and rebuild the preview. Rebuilding replaces preview edits only.
5. Select **Add selected to week**. Every selected entry is checked against existing tasks and the rest of the batch before any task is added. A conflict or duplicate blocks the entire selection until corrected or unchecked. Existing tasks are never replaced.

The browser extracts text using the bundled [Mozilla PDF.js](https://mozilla.github.io/pdf.js/) 6.3.289. PDF bytes and extracted source text are never uploaded or stored in localStorage; only confirmed task fields are saved. No external service, CDN, API key, or framework is involved.

Recognized PDF formats include lines such as `Monday | ECE231 Lecture | 10:00-12:00 | Room BA123`, multiple weekdays (`Mon / Wed`), standalone weekday headings, weekday columns, and University of Toronto ACORN timetable grids. ACORN's time axis is used to distinguish morning and afternoon meetings, and multi-line course blocks are combined into one commitment. Alternating-week ACORN meetings are detected, explained, and left unchecked for deliberate review.

The `.ics` reader follows the core iCalendar content-line format, including folded lines, escaped text, `DTSTART`/`DTEND`, simple durations, `RRULE` daily/weekly recurrence, `BYDAY`, `COUNT`, `UNTIL`, `RDATE`, and `EXDATE`. It imports only occurrences in the chosen week. UTC times are converted to the selected zone; local or `TZID` events must match it. Multi-room ACORN events exported as separate but otherwise identical records are combined into one commitment. Calendar recurrences are imported as a one-week snapshot because the planner stores a reusable weekday template, not dates or recurrence rules.

PDF layout is heuristic: names or locations can be missed or combined, so review every row. Scanned/image-only PDFs need a text-based export or manual entry; no OCR is included. Non-ACORN grids with times only on a separate axis, single-letter weekday codes, date ranges, and overnight meetings are not automatically interpreted. Password-protected PDFs require an unlocked export. Large/complex files fail with a message instead of importing partially; previews are limited to 300 commitments and 80,000 extracted characters.

Calendar all-day events, overnight events, monthly/yearly or complex recurrence rules, detached recurrence overrides, conflicting time-zone formats, and events without a usable end time are skipped with visible warnings. Imported calendar events do not update automatically if the source calendar later changes.

## Import regression checks

Optionally run `node tests/timetable-parser.test.cjs`, `node tests/ics-parser.test.cjs`, and `node tests/scheduler.test.cjs` if Node is available for development. These use only built-in test utilities; Node is not an application dependency. They cover PDF grid extraction, ACORN afternoon times and alternating weeks, calendar folding, escaping, time zones, recurrence/exclusions, multi-room merging, invalid fields, duplicate and batch conflicts, back-to-back events, quick goal parsing, preferences, deadlines, breaks, balancing, partial plans, session splitting, and safe regeneration.

For browser testing, use `tests/fixtures/list-timetable.pdf` (five meetings across two pages), `grid-timetable.pdf` (three weekday columns), `no-text.pdf` (image-only fallback), and `protected.pdf` (password error). Import on a separate local origin/profile to avoid changing your personal week. Confirm that preview edits, deselection, discard, reimport rejection, and reload persistence work.

## Limitations and roadmap

This is one reusable weekly template, not a date-based calendar. Overnight events are unsupported. Existing valid saved events are preserved even if they overlap; new additions are checked. Automatic scheduling works on a 15-minute grid within one preferred time window per goal. It does not calculate travel time or optimize across specific calendar dates. Malformed saved entries are skipped with a warning. Data is local to a browser and origin; there is no account, synchronization, backup, or multi-tab merge. If storage is blocked or full, changes remain in memory and a warning explains that they may be lost on reload.

Possible next steps include commute-aware placement, date-based recurrence, accounts, synchronization, and external calendar integration.

## Manual verification

Add Monday 10:00–12:00, reject 11:00–13:00, contained and enclosing intervals, and accept 12:00–13:00. Add an earlier task and check time order. Add the same time on Tuesday. Reload to verify persistence. Delete one card, cancel Clear Week, then confirm it and reload. Generate several goals around fixed tasks, apply the preview, regenerate, and verify that automatic sessions are replaced rather than duplicated. Remove generated sessions and confirm fixed commitments remain. Check blank names, missing times, equal/reversed times, optional notes, keyboard navigation, and a narrow viewport. Use a separate browser origin when testing malformed storage or storage failures.

## Personal rhythm

Use **Generate → Your personal rhythm** to set sleep hours (4–12 in quarter-hour steps) and wake-up time. Eight hours waking at 07:00 protects 23:00–07:00 every night, including the Sunday/Monday boundary. Sleep is a scheduling constraint, not a calendar card. Fixed commitments remain unchanged, and interruptions appear as warnings in the preview.

Enable campus lunch to reserve a 15–90 minute gap in your chosen lunch window. Campus stays are inferred from the first and last fixed class or commitment with “campus” in its location each day. If no gap fits, the preview explains it rather than moving classes. Add other protected routines with a name, start/end time, and selected weekdays. These are placed before flexible goals, even outside the flexible scheduling window; conflicts with sleep or fixed events are reported.

Quick Add understands `8 hours of sleep each night` and `leave lunch time during my time on campus`, alongside existing flexible-goal phrases. This is a local phrase parser, not a general-purpose AI assistant. Preferences persist in the browser. Generate works with routines alone; applying a preview replaces all prior generated blocks. Review warnings before accepting a partial plan.

Calendar cards show only names and times by default. Hover to preview, click or press Enter to keep details open, and press Escape to close. Fixed cards include Edit and Delete. Changes in another tab invalidate a generator preview.

New shared files: `personal.js` supplies preference controls; `calendar-card.js` supplies accessible event disclosures.
