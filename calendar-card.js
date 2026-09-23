// Native disclosures work with mouse, touch, and keyboard; hover opens a temporary preview.
function compactEvent(task, extraActions) {
    const card = document.createElement('details');
    card.className = `compact-event task-${task.type}`;
    const summary = document.createElement('summary');
    const name = document.createElement('strong'); name.textContent = task.name;
    const time = document.createElement('span'); time.textContent = `${task.startTime}–${task.endTime}`;
    summary.append(name, time);
    const body = document.createElement('div'); body.className = 'event-detail';
    for (const text of [task.routine ? 'Protected personal time' : task.generated ? 'Auto-scheduled · ' + task.type : task.type, task.location, task.details]) {
        if (!text) continue;
        const p = document.createElement('p'); p.textContent = text; body.append(p);
    }
    if (extraActions) extraActions(body);
    card.append(summary, body);
    let pinned = false;
    summary.addEventListener('click', event => { event.preventDefault(); pinned = !pinned; card.open = pinned; });
    card.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') card.open = true; });
    card.addEventListener('pointerleave', () => { if (!pinned && !card.contains(document.activeElement)) card.open = false; });
    card.addEventListener('keydown', event => { if (event.key === 'Escape') { pinned = false; card.open = false; summary.focus(); } });
    return card;
}
