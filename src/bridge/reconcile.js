// A bridge revision proves ancestry; wall-clock timestamps do not.
export function resolveOperation(current, operation, epoch) {
    const incoming = {...operation.note};
    if (current?.note.received) incoming.received = true;
    if (!current) return {outcome:'accepted',note:incoming};

    const existing = current.note;
    const same = existing.state === incoming.state &&
        (existing.state === 'removed' || existing.html === incoming.html) &&
        !!existing.received === !!incoming.received;
    if (same) return {outcome:'unchanged',note:existing};

    const base = operation.base;
    if (base && base.epoch === epoch && current.revision.epoch === epoch && base.sequence === current.revision.sequence)
        return {outcome:'accepted',note:incoming};

    const isDeleted = note => note.state === 'trash' || note.state === 'removed';
    let note = existing, conflict = incoming;
    if (!isDeleted(existing) && isDeleted(incoming)) {
        note = incoming;
        conflict = existing;
    }
    if (isDeleted(existing) && isDeleted(incoming) && incoming.state === 'removed') {note=incoming;conflict=existing;}
    conflict = {...conflict,id:`conflict-${operation.opId}`,state:'active',received:!!(existing.received || incoming.received)};
    delete conflict.deleted;
    return {outcome:'conflict',note,conflict,authorDocId:note===incoming?incoming.id:conflict.id};
}
