// PDF.js only loads when a user chooses a file. Normal planning needs no PDF library.
const timetableFile = document.getElementById("timetable-file");
const importStatus = document.getElementById("import-status");
const importReview = document.getElementById("import-review");
const importRows = document.getElementById("import-rows");
const importText = document.getElementById("import-text");
const importButton = document.getElementById("confirm-import");
const selectionStatus = document.getElementById("import-selection-status");
const importWarnings = document.getElementById("import-warnings");
const importTextHelp = document.getElementById("import-text-help");
const calendarWeek = document.getElementById("calendar-week");
const calendarTimezone = document.getElementById("calendar-timezone");
let importDrafts = [];
let importRequest = 0;
let activePdf = null;
let pdfLibrary = null;
let lastCalendarText = "";

calendarWeek.value = new Date().toISOString().slice(0, 10);
calendarTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function setImportStatus(message, isError = false) {
    importStatus.textContent = message;
    importStatus.classList.toggle("error-message", isError);
}

function resetImportPreview() {
    importDrafts = [];
    importRows.replaceChildren();
    importText.value = "";
    importReview.hidden = true;
    importButton.disabled = true;
    selectionStatus.textContent = "";
    importWarnings.replaceChildren();
    importWarnings.hidden = true;
    importTextHelp.hidden = false;
    lastCalendarText = "";
}

function showCalendarWarnings(warnings) {
    importWarnings.replaceChildren();
    importWarnings.hidden = warnings.length === 0;
    if (!warnings.length) return;
    const heading = document.createElement("strong");
    heading.textContent = `${warnings.length} calendar items need manual review:`;
    const list = document.createElement("ul");
    for (const warning of warnings.slice(0, 50)) {
        const item = document.createElement("li");
        item.textContent = warning;
        list.appendChild(item);
    }
    if (warnings.length > 50) {
        const item = document.createElement("li");
        item.textContent = `${warnings.length - 50} additional warnings were omitted.`;
        list.appendChild(item);
    }
    importWarnings.append(heading, list);
}

async function readTimetablePdf(file, request) {
    if (location.protocol === "file:") throw new Error("Open the planner with Live Server or a local web server to import PDFs.");
    if (!/\.pdf$/i.test(file.name)) throw new Error("Choose a PDF file.");
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Choose a non-empty PDF smaller than 20 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-")) throw new Error("This file does not appear to be a PDF.");
    if (!pdfLibrary) {
        try {
            pdfLibrary = await import("./vendor/pdfjs/build/pdf.mjs");
            pdfLibrary.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/build/pdf.worker.mjs";
        } catch (error) {
            throw new Error("The PDF reader could not load. Use a current browser and serve this project with Live Server or a local web server.");
        }
    }
    if (request !== importRequest) return null;
    const loading = pdfLibrary.getDocument({ data: bytes, isEvalSupported: false,
        cMapUrl: "./vendor/pdfjs/cmaps/", cMapPacked: true,
        standardFontDataUrl: "./vendor/pdfjs/standard_fonts/", useWasm: false });
    activePdf = loading;
    let timeout;
    try {
        // A malformed/complex PDF must not leave the import screen busy indefinitely.
        return await Promise.race([
            extractTimetable(loading, request),
            new Promise(function(resolve, reject) {
                timeout = setTimeout(function() {
                    reject(new Error("This PDF took too long to read. Try a smaller timetable export."));
                }, 45000);
            })
        ]);
    } finally {
        clearTimeout(timeout);
        await loading.destroy();
        if (activePdf === loading) activePdf = null;
    }
}

async function extractTimetable(loading, request) {
    const pdf = await loading.promise;
    if (pdf.numPages > 40) throw new Error("This PDF has more than 40 pages. Export just the timetable pages and try again.");
    const entries = [];
    const textPages = [];
    let textLength = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (request !== importRequest) return null;
        setImportStatus(`Reading page ${pageNumber} of ${pdf.numPages}…`);
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        const items = content.items.filter(function(item) { return typeof item.str === "string"; }).map(function(item) {
            const point = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
            return { text: item.str, x: point[0], y: point[1], width: item.width };
        });
        const text = TimetableParser.groupLines(items).map(function(line) { return line.text; }).join("\n");
        textLength += text.length;
        if (textLength > 80000) throw new Error("This PDF contains too much text. Export just the timetable pages.");
        textPages.push(text);
        entries.push(...TimetableParser.parsePage(items, pageNumber));
        if (entries.length > 300) throw new Error("More than 300 meetings were detected. Export a single weekly timetable instead.");
        page.cleanup();
    }
    return { entries, text: textPages.join("\n\n") };
}

timetableFile.addEventListener("change", async function() {
    const file = timetableFile.files[0];
    if (!file) return;
    const request = ++importRequest;
    if (activePdf) await activePdf.destroy();
    if (request !== importRequest) return;
    resetImportPreview();
    setImportStatus(`Reading ${file.name}…`);
    try {
        if (/\.ics$/i.test(file.name) || file.type === "text/calendar") {
            if (file.size > 5 * 1024 * 1024) throw new Error("Choose an .ics file smaller than 5 MB.");
            const text = await file.text();
            lastCalendarText = text;
            const detectedZone = IcsParser.defaultTimeZone(text);
            if (detectedZone) calendarTimezone.value = detectedZone;
            const result = IcsParser.parse(text, calendarWeek.value, calendarTimezone.value.trim());
            if (request !== importRequest) return;
            importTextHelp.hidden = true;
            showImportDrafts(result.entries);
            showCalendarWarnings(result.warnings);
            const warningText = result.warnings.length ? ` ${result.warnings.length} items need manual review.` : "";
            setImportStatus(`${result.entries.length} meetings occur from ${result.monday} through ${result.sunday}.${warningText} Review the snapshot before importing. Recurrence rules are not saved.` , result.entries.length === 0);
            return;
        }
        if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error("Choose a PDF or .ics calendar file.");
        const result = await readTimetablePdf(file, request);
        if (!result || request !== importRequest) return;
        importText.value = result.text;
        showImportDrafts(result.entries);
        importTextHelp.hidden = false;
        if (!result.text.trim()) {
            setImportStatus("No readable text was found. This may be a scanned PDF. Use a text-based export, paste timetable text below, or add the missing commitments manually.", true);
        } else if (!result.entries.length) {
            setImportStatus("Text was extracted, but no meeting times were recognized. Correct the extracted text below or add missing commitments manually.", true);
        } else {
            setImportStatus(`${result.entries.length} possible commitments found in ${file.name}. Review every day, time, and name; some classes may not have been detected.`);
        }
    } catch (error) {
        if (request !== importRequest) return;
        const message = error.name === "PasswordException" ? "This PDF is password-protected. Export an unlocked copy and try again." :
            error.name === "InvalidPDFException" ? "This PDF is damaged or unsupported. Try exporting it again." : error.message;
        setImportStatus(message || "The timetable could not be read. Try another PDF.", true);
    } finally {
        if (request === importRequest) timetableFile.value = "";
    }
});

// Each control updates a draft object. The DOM is never the import database.
function createImportField(draft, key, label, options) {
    const wrapper = document.createElement("label");
    wrapper.className = "form-group";
    const caption = document.createElement("span");
    caption.textContent = label;
    const control = document.createElement(options ? "select" : "input");
    if (options) {
        for (const value of options) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value ? value[0].toUpperCase() + value.slice(1) : "Choose a day";
            control.appendChild(option);
        }
    } else {
        control.type = key.endsWith("Time") ? "time" : "text";
    }
    control.value = draft[key];
    control.addEventListener("input", function() {
        draft[key] = control.value;
        updateImportValidation();
    });
    wrapper.append(caption, control);
    return wrapper;
}

function showImportDrafts(entries) {
    importDrafts = entries.map(function(entry) { return { ...entry, selected: entry.selected !== false }; });
    renderImportDrafts();
}

function renderImportDrafts() {
    importRows.replaceChildren();
    importReview.hidden = false;
    for (let index = 0; index < importDrafts.length; index++) {
        const draft = importDrafts[index];
        const card = document.createElement("fieldset");
        card.className = "import-draft";
        const legend = document.createElement("legend");
        legend.textContent = `Commitment ${index + 1}`;
        const choose = document.createElement("label");
        choose.className = "import-choose";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = draft.selected;
        checkbox.addEventListener("change", function() { draft.selected = checkbox.checked; updateImportValidation(); });
        choose.append(checkbox, document.createTextNode(" Include in import"));
        const fields = document.createElement("div");
        fields.className = "import-fields";
        fields.append(createImportField(draft, "name", "Task name"), createImportField(draft, "day", "Day", ["", ...days]),
            createImportField(draft, "startTime", "Start time"), createImportField(draft, "endTime", "End time"),
            createImportField(draft, "type", "Type", taskTypes), createImportField(draft, "location", "Location"),
            createImportField(draft, "details", "Notes"));
        const source = document.createElement("p");
        source.className = "import-source";
        source.textContent = draft.source;
        const error = document.createElement("p");
        error.className = "import-row-error";
        error.id = `import-error-${index}`;
        card.setAttribute("aria-describedby", error.id);
        card.append(legend, choose, fields, source, error);
        importRows.appendChild(card);
    }
    updateImportValidation();
}

function updateImportValidation() {
    const selected = importDrafts.filter(function(draft) { return draft.selected; });
    const errors = validateImportTasks(selected);
    let selectedIndex = 0;
    importDrafts.forEach(function(draft, index) {
        document.getElementById(`import-error-${index}`).textContent = draft.selected ? errors[selectedIndex++] : "Not selected.";
    });
    const errorCount = errors.filter(Boolean).length;
    importButton.disabled = selected.length === 0 || errorCount > 0;
    importButton.textContent = `Add ${selected.length} selected to week`;
    selectionStatus.textContent = `${selected.length} selected. ${errorCount ? `${errorCount} rows need attention before import.` : "Ready for your review."}`;
}

document.getElementById("reparse-import").addEventListener("click", function() {
    const entries = TimetableParser.parseText(importText.value);
    if (entries.length > 300) { setImportStatus("Please limit the preview to 300 commitments.", true); return; }
    showImportDrafts(entries);
    setImportStatus(`${entries.length} possible commitments found in the edited text. Review the rebuilt preview.`);
});

function rebuildCalendarPreview() {
    if (!lastCalendarText) return;
    try {
        const result = IcsParser.parse(lastCalendarText, calendarWeek.value, calendarTimezone.value.trim());
        showImportDrafts(result.entries);
        showCalendarWarnings(result.warnings);
        setImportStatus(`${result.entries.length} meetings occur from ${result.monday} through ${result.sunday}. Review the rebuilt snapshot.`, result.entries.length === 0);
    } catch (error) {
        setImportStatus(error.message || "The calendar could not be rebuilt.", true);
    }
}

calendarWeek.addEventListener("change", rebuildCalendarPreview);
calendarTimezone.addEventListener("change", rebuildCalendarPreview);

document.getElementById("add-import-row").addEventListener("click", function() {
    if (importDrafts.length >= 300) { setImportStatus("The preview is limited to 300 commitments.", true); return; }
    importDrafts.push({ name: "", day: "", type: "class", startTime: "", endTime: "", location: "", details: "", source: "Manually added", selected: true });
    renderImportDrafts();
    importRows.lastElementChild.querySelector('input[type="text"]').focus();
});

document.getElementById("discard-import").addEventListener("click", function() {
    resetImportPreview();
    setImportStatus("Preview discarded. Your saved week has not changed.");
    timetableFile.focus();
});

importButton.addEventListener("click", function() {
    // Recheck against the current week, which may have changed since extraction.
    updateImportValidation();
    const selected = importDrafts.filter(function(draft) { return draft.selected; });
    if (importButton.disabled || !importTasks(selected)) return;
    resetImportPreview();
    setImportStatus(`${selected.length} commitments added to your week. Check the save status below the page heading.`);
    timetableFile.focus();
});

// Keep duplicate/conflict feedback current when the regular planner changes.
document.getElementById("task-form").addEventListener("submit", updateImportValidation);
document.getElementById("clear-week-button").addEventListener("click", updateImportValidation);
document.querySelector(".week-calendar").addEventListener("click", updateImportValidation);
