import app from './app';
import util from './utils';

// Lines: what a key does to the line the caret is on. Tasks (⌘Enter ticks, ⌘⇧Enter
// makes one), headings (⌘⌥1–6), moving a line (⌥↑↓), indenting (⌘] ⌘[, Tab), the
// slash commands, list continuation on Enter, and the caret kept across an edit.
export default (function () {
    // TASKS: a task is a line "- [ ] …"; ticking it writes [x] into the text (and
    // back). In the text: ⌘Enter on the line, through the browser so ⌘Z undoes it.
    // In the preview: a click on the box, which changes the text node directly and
    // reports an input, since the text is not focused there.

    const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;

    // The text node and offset of the character between the brackets, or null
    function taskBox(block) {
        const match = TASK_LINE.exec(block.textContent.replace(/\xa0/g, ' '));

        if (!match) {
            return null;
        }

        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        let offset = match[1].length;
        let node = walker.nextNode();

        while (node && offset >= node.data.length) {
            offset -= node.data.length;
            node = walker.nextNode();
        }

        return node ? { node, offset, done: match[2] !== ' ' } : null;
    }

    function taskBlocks() {
        return Array.from(app.article.children).filter(block => TASK_LINE.test(block.textContent.replace(/\xa0/g, ' ')));
    }

    // ⌘Enter: the task on the caret's line, through the browser's own edit; with
    // lines selected, every task among them
    function toggleTaskAtCaret() {
        app.wrapLooseLines();

        const selected = selectedBlocks();

        if (selected.length > 1) {
            return tickTaskLines(selected);
        }

        const selection = window.getSelection();
        let block = selection.rangeCount ? selection.anchorNode : null;

        if (block === app.article) {
            block = app.article.childNodes[Math.max(0, selection.anchorOffset - 1)];
        }

        while (block && block.parentNode !== app.article) {
            block = block.parentNode;
        }

        const box = block && taskBox(block);

        if (!box) {
            return false;
        }

        const caret = caretPath();
        const range = document.createRange();

        range.setStart(box.node, box.offset);
        range.setEnd(box.node, box.offset + 1);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('insertText', false, box.done ? ' ' : 'x');
        restoreCaret(caret);

        return true;
    }

    // LINES: edits to the line the caret is on: its start (a heading mark, a task
    // box), its place (moved up or down). All through the browser's own edit, so
    // ⌘Z knows, and the caret keeps its place in the words.

    // The block the caret is in; lines are blocks here (the first may be bare text)
    function caretBlock() {
        app.wrapLooseLines();

        const selection = window.getSelection();
        let block = selection.rangeCount ? selection.anchorNode : null;

        if (block === app.article) {
            block = app.article.childNodes[Math.max(0, selection.anchorOffset - 1)];
        }

        while (block && block.parentNode !== app.article) {
            block = block.parentNode;
        }

        return block && block.nodeType === 1 ? block : null;
    }

    function lineText(block) {
        return block.textContent.replace(/\xa0/g, ' ');
    }

    // Replace `take` characters after `indent` at the start of the block with `insert`
    function editLineStart(block, indent, take, insert) {
        const selection = window.getSelection();
        const first = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
        const range = document.createRange();

        // where the caret is, as a character offset in the line (null: not in its text)
        const was = selection.rangeCount && selection.anchorNode.nodeType === 3 && block.contains(selection.anchorNode)
            ? charOffset(block, selection.anchorNode, selection.anchorOffset)
            : null;

        if (first) {
            range.setStart(first, Math.min(indent, first.length));
            range.setEnd(first, Math.min(indent + take, first.length));
        } else {
            range.setStart(block, 0);
            range.collapse(true);
        }

        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('insertText', false, insert);

        // the browser leaves empty text nodes behind, and a line with nothing in it
        // needs its <br>, or it has no height: the caret cannot sit in it, Backspace
        // cannot remove it, its number draws over the next one (⌘⇧Enter on an empty
        // task, 2026-10-09)
        block.normalize();

        if (!block.textContent && !block.querySelector('br')) {
            block.appendChild(document.createElement('br'));
        }

        // the caret back to its place in the words, or after what was written
        placeInBlock(block, was !== null && was >= indent ? Math.max(indent, was - take + insert.length) : was !== null ? was : indent + insert.length);
    }

    function charOffset(block, node, offset) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        let count = 0;

        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            if (text === node) {
                return count + offset;
            }

            count += text.length;
        }

        return count;
    }

    function placeInBlock(block, offset) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let left = offset;
        let last = null;

        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            if (left <= text.length) {
                range.setStart(text, left);
                range.collapse(true);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                return;
            }

            left -= text.length;
            last = text;
        }

        if (last) {
            range.setStart(last, last.length);
        } else {
            range.setStart(block, 0);
        }

        range.collapse(true);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    }

    // The blocks a selection touches, first to last
    function selectedBlocks() {
        const selection = window.getSelection();

        if (!selection.rangeCount || selection.isCollapsed) {
            return [];
        }

        const range = selection.getRangeAt(0);
        const blocks = Array.from(app.article.children);
        const of = node => blocks.find(block => block === node || block.contains(node));
        const first = blocks.indexOf(of(range.startContainer));
        const last = blocks.indexOf(of(range.endContainer));

        return first < 0 || last < 0 ? [] : blocks.slice(first, last + 1);
    }

    // Every selected line rewritten by `change`, as one edit; the lines stay selected
    function rewriteLines(blocks, change) {
        const lines = blocks.map(lineText).map(change);
        const selection = window.getSelection();
        const range = document.createRange();

        range.setStart(blocks[0], 0);
        range.setEnd(blocks[blocks.length - 1], blocks[blocks.length - 1].childNodes.length);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('insertText', false, lines.join('\n'));

        // the same lines, selected again
        const after = Array.from(app.article.children);
        const first = after.indexOf(blocks[0]) >= 0 ? after.indexOf(blocks[0]) : Math.max(0, after.length - lines.length);
        const again = document.createRange();

        again.setStart(after[first], 0);
        again.setEnd(after[Math.min(after.length - 1, first + lines.length - 1)], after[Math.min(after.length - 1, first + lines.length - 1)].childNodes.length);
        selection.removeAllRanges();
        selection.addRange(again);
    }

    // Selected lines: all tasks become plain lines; otherwise every line with text
    // becomes a task
    function toggleTaskLines(blocks) {
        const task = /^(\s*)((?:[-*+]|\d+[.)])\s+\[[ xX]\]\s?)(.*)$/;
        const item = /^(\s*)([-*+]\s+)(.*)$/;
        const allTasks = blocks.map(lineText).filter(text => text.trim()).every(text => task.test(text));

        rewriteLines(blocks, (text) => {
            if (allTasks) {
                return text.replace(task, '$1$3');
            }

            if (!text.trim() || task.test(text)) {
                return text;
            }

            const list = item.exec(text);

            return list ? `${list[1]}- [ ] ${list[3]}` : text.replace(/^(\s*)/, '$1- [ ] ');
        });
    }

    // Selected lines: every task ticked; if all are ticked already, all unticked
    function tickTaskLines(blocks) {
        const tasks = blocks.map(lineText).filter(text => TASK_LINE.test(text));

        if (!tasks.length) {
            return false;
        }

        const allDone = tasks.every(text => TASK_LINE.exec(text)[2] !== ' ');

        rewriteLines(blocks, text => text.replace(TASK_LINE, `$1${allDone ? ' ' : 'x'}$3`));

        return true;
    }

    // ⌘⇧Enter: the caret's line becomes a task; a list item becomes a task; a task
    // becomes a plain line again. With lines selected, all of them.
    function toggleTaskLine() {
        app.wrapLooseLines();

        const selected = selectedBlocks();

        if (selected.length > 1) {
            toggleTaskLines(selected);
            return true;
        }

        const block = caretBlock();

        if (!block) {
            return false;
        }

        const text = lineText(block);
        const task = /^(\s*)((?:[-*+]|\d+[.)])\s+\[[ xX]\]\s?)/.exec(text);
        const item = /^(\s*)([-*+]\s+)/.exec(text);
        const indent = (task || item || /^(\s*)/.exec(text))[1].length;

        editLineStart(block, indent, task ? task[2].length : item ? item[2].length : 0, task ? '' : '- [ ] ');

        return true;
    }

    // ⌘⌥1–6: the caret's line as a heading of that level; ⌘⌥0: plain text again
    function setHeading(level) {
        const block = caretBlock();

        if (!block) {
            return;
        }

        const match = /^(\s*)(#{1,6}\s)?/.exec(lineText(block));

        editLineStart(block, match[1].length, (match[2] || '').length, level ? `${'#'.repeat(level)} ` : '');
    }

    // ⌥↑ / ⌥↓: the caret's line swaps with the one above or below, as one edit
    function moveLine(direction) {
        const block = caretBlock();
        const other = block && (direction < 0 ? block.previousElementSibling : block.nextElementSibling);

        if (!other) {
            return false;
        }

        const [upper, lower] = direction < 0 ? [other, block] : [block, other];
        const caret = caretPath();
        const selection = window.getSelection();
        const range = document.createRange();

        range.setStart(upper, 0);
        range.setEnd(lower, lower.childNodes.length);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('insertText', false, `${lineText(lower)}\n${lineText(upper)}`);

        if (caret) {
            caret.path[0] += direction;
        }

        restoreCaret(caret);

        // the line keeps on screen as it goes, so the eye can follow it
        const moved = app.article.childNodes[caret ? caret.path[0] : 0];

        if (moved && moved.scrollIntoView) {
            moved.scrollIntoView({ block: 'nearest' });
        }

        app.caretMoved();

        return true;
    }

    // Tab / ⇧Tab and ⌘] / ⌘[: four spaces in or out, on the selection's lines or the
    // caret's, from wherever the caret is in it (Tab wrote them at the caret until
    // 2026-10-24). A numbered item takes its number from its new depth.
    function indent(out) {
        const selectedText = util.getSelectedText();
        const block = caretBlock();

        if (selectedText.length > 0) {
            util.replaceText(selectedText.split('\n').map(line => (out ? util.trimTabs(line) : '\xa0'.repeat(4) + line)).join('\n'));
        } else if (block) {
            const line = lineText(block);
            const take = out ? line.match(/^ {0,4}/)[0].length : 0;

            if (out && !take) {
                return;
            }

            if (/^\s*\d+[.)] /.test(line)) {
                renumber(block, out ? -take : 4);
            } else {
                editLineStart(block, 0, take, out ? '' : '\xa0'.repeat(4));
            }
        }
    }

    // A box in the preview: the n-th box is the n-th task line of the text
    function toggleTaskFromPreview(checkbox) {
        const index = Array.from(app.showcase.querySelectorAll('.task-list-item-checkbox')).indexOf(checkbox);
        const box = taskBlocks()[index] && taskBox(taskBlocks()[index]);

        if (!box) {
            return;
        }

        box.node.replaceData(box.offset, 1, box.done ? ' ' : 'x');
        app.article.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // SLASH COMMANDS: "/" at the start of a line or after a space opens a list of
    // things to insert, under the caret; the text keeps the focus, the typed word
    // filters the list, Enter inserts, Esc or a space leaves the slash as typed.
    // Inserting goes through the browser, so its undo knows about it.

    // The slash word before the caret ("/ta", or "/code js": a row's full name may
    // take one more word); null when the caret is not in one
    function slashWord() {
        const before = textBeforeCaret();
        const match = before === null ? null : /(?:^|\s)(\/([a-z0-9]*)(?: ([a-z0-9+#.-]*))?)$/i.exec(before);

        if (!match) {
            return null;
        }

        // a space ends the word unless it follows a full name: "/code js" yes, "/co js" no
        if (match[3] !== undefined && !slashItems().some(item => item.label === `/${match[2]}`)) {
            return null;
        }

        return match[1];
    }

    function slashItems() {
        const atCaret = text => document.execCommand('insertText', false, text);
        const back = (count, extend) => { for (let i = 0; i < count; i++) window.getSelection().modify(extend ? 'extend' : 'move', 'backward', 'character'); };
        const lineHasText = () => textBeforeCaret().trim() !== '';
        const block = text => atCaret((lineHasText() ? '\n' : '') + text);
        const heading = level => () => setHeading(level);

        return [
            { label: '/date', hint: new Date().toLocaleDateString(), run: () => atCaret(new Date().toLocaleDateString()) },
            { label: '/time', hint: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), run: () => atCaret(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) },
            { label: '/table', hint: 'a 3×3 markdown table', run: () => { block('| | | |\n|---|---|---|\n| | | |\n| | | |'); back(35); } },
            { label: '/code', hint: 'a code block; /code js names the language', run: (word) => { block('```' + word + '\n\n```'); back(4); } },
            { label: '/task', hint: '- [ ] a task; ⌘Enter ticks it', run: () => atCaret('- [ ] ') },
            { label: '/link', hint: '[text](url)', run: () => { atCaret('[text](url)'); back(6); back(4, true); } },
            { label: '/image', hint: '![caption](address), in the preview', run: () => { atCaret('![caption](address)'); back(1); back(7, true); } },
            { label: '/h1', hint: 'this line as a heading', run: heading(1) },
            { label: '/h2', hint: 'this line as a heading', run: heading(2) },
            { label: '/h3', hint: 'this line as a heading', run: heading(3) },
            { label: '/fm', hint: 'a frontmatter block', run: () => { block('---\ntitle: \n---\n'); back(5); } },
        ];
    }

    // After every input: open, filter or close the list by what is before the caret
    function updateSlash() {
        const word = slashWord();

        if (word === null) {
            if (app.picker.kind === 'slash') {
                app.closePicker(false);
            }

            return;
        }

        // "/code js": the first word picks the row, the rest goes to it
        const [name] = word.slice(1).split(/\s+/);

        if (app.picker.kind !== 'slash') {
            const rect = app.caretRect();

            if (!rect) {
                return;
            }

            // under the slash, not the caret: one character back per typed letter
            const charWidth = rect.height * 0.6;

            app.openPicker({
                kind: 'slash',
                at: { left: rect.left - word.length * charWidth, top: rect.top + rect.height + 6, above: rect.top - 6 },
                filter: false,
                items: slashItems(),
                foot: app.is.touch ? '' : '↑↓ select · enter insert · esc close',
            });
        }

        const changed = app.picker.input.value !== name;

        app.picker.input.value = name;
        app.filterPicker(changed);

        // nothing it could mean: a path or a fraction, not a command
        if (!app.picker.shown.length) {
            app.closePicker(false);
        }
    }

    // Enter on a row: the typed slash word goes, the row's text comes, through the browser
    function runSlash(item) {
        const word = slashWord() || '';
        const extra = word.slice(1).split(/\s+/).slice(1).join(' ');

        app.closePicker(false);

        for (let i = 0; i < word.length; i++) {
            window.getSelection().modify('extend', 'backward', 'character');
        }

        document.execCommand('delete', false);
        item.run(extra);
    }

    // Keys while the list is open: the list's, not the text's
    function onSlashKeyDown(event) {
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                event.preventDefault();
                app.setPickerIndex(app.picker.index + (event.key === 'ArrowDown' ? 1 : -1));
                app.scrollPickerSelection();
                return true;

            case 'Enter':
            case 'Tab':
                event.preventDefault();
                runSlash(app.picker.shown[app.picker.index]);
                return true;

            case 'Escape':
                event.preventDefault();
                app.closePicker(false);
                return true;

            default:
                return false;
        }
    }

    // After [text](https://) is inserted, put the caret after "https://" so the address can be typed
    function placeCaretInLink() {
        const selection = window.getSelection();

        selection.modify('move', 'backward', 'character');
    }

    // Text of the current paragraph up to the caret
    function textBeforeCaret() {
        const selection = window.getSelection();

        if (!selection.rangeCount || !selection.isCollapsed) {
            return null;
        }

        let block = selection.anchorNode;

        if (block === app.article) {
            block = app.article.childNodes[Math.max(0, selection.anchorOffset - 1)];
        }

        while (block && block.parentNode !== app.article) {
            block = block.parentNode;
        }

        if (!block) {
            return null;
        }

        const range = document.createRange();

        range.setStart(block, 0);
        range.setEnd(selection.anchorNode, selection.anchorOffset);

        return range.toString().replace(/\xa0/g, ' ');
    }

    function continueListOnEnter(event) {
        const before = textBeforeCaret();

        if (before === null) {
            return;
        }

        const match = before.match(/^(\s*)(- \[[ xX]\] |[-*+] |\d+[.)] |> )(.*)$/);

        if (!match) {
            return;
        }

        const [, indent, marker, rest] = match;

        // Enter on an empty item: end the list instead of adding another marker
        if (rest.trim() === '') {
            event.preventDefault();

            const selection = window.getSelection();

            for (let i = 0; i < (indent + marker).length; i++) {
                selection.modify('extend', 'backward', 'character');
            }

            document.execCommand('delete', false);
            return;
        }

        let next = marker;

        if (/^\d/.test(marker)) {
            next = marker.replace(/^\d+/, (number) => String(parseInt(number, 10) + 1));
        } else if (marker.startsWith('- [')) {
            next = '- [ ] ';
        }

        const prefix = (indent + next).replace(/ /g, '\xa0');

        // Let the browser make the new line first, then put the marker on it
        setTimeout(() => {
            document.execCommand('insertText', false, prefix);

            if (/^\d/.test(next)) {
                renumber(caretBlock());
            }
        }, 0);
    }

    // The numbers of the list around `block`, after its line was added (Enter) or
    // moved `shift` spaces (Tab, ⇧Tab). A list is a run of items and indented lines.
    // At each depth an item counts on from the one above it; an inner list starts
    // at 1; the outer list keeps its first number (a list may start at 7). One edit,
    // so ⌘Z takes it back whole, and the caret keeps its place in the words.
    // (1 2 3 3 after Enter, asked 2026-10-22; nesting, 2026-10-24.)
    function renumber(block, shift = 0) {
        const inList = /^(\s*(?:\d+[.)]|[-*+]) |\s+\S)/;
        const all = Array.from(app.article.children);
        const index = all.indexOf(block);
        const counters = new Map();     // depth -> the last number at it
        const lines = [];
        let first = index;
        let from = -1;
        let to = -1;
        let delta = 0;

        while (first > 0 && inList.test(lineText(all[first - 1]))) {
            first--;
        }

        for (let i = first; i < all.length && inList.test(lineText(all[i])); i++) {
            const was = lineText(all[i]);
            let line = i === index && shift ? (shift > 0 ? ' '.repeat(shift) + was : was.slice(-shift)) : was;
            const depth = line.search(/\S/);
            const match = line.match(/^(\s*)(\d+)([.)] )/);

            for (const d of [...counters.keys()]) {
                if (d > depth) {
                    counters.delete(d);
                }
            }

            if (match) {
                const number = counters.has(depth) ? counters.get(depth) + 1 : counters.size ? 1 : parseInt(match[2], 10);

                counters.set(depth, number);
                line = match[1] + number + match[3] + line.slice(match[0].length);
            }

            if (i === index) {
                delta = line.length - was.length;
            }

            if (line !== was) {
                from = from < 0 ? i : from;
                to = i;
            }

            lines.push(line.replace(/^ +/, lead => '\xa0'.repeat(lead.length)));
        }

        if (from < 0) {
            return;
        }

        const selection = window.getSelection();
        const caret = selection.rangeCount && selection.anchorNode.nodeType === 3 && block.contains(selection.anchorNode)
            ? charOffset(block, selection.anchorNode, selection.anchorOffset) + delta
            : null;

        rewriteLines(all.slice(from, to + 1), (text, i) => lines[from - first + i]);

        if (caret !== null) {
            placeInBlock(app.article.children[index], Math.max(0, caret));
        }
    }

    // Where the caret is, as a path from the article, so it can be put back after
    // the document is replaced
    function caretPath() {
        const selection = window.getSelection();

        if (!selection.rangeCount || !app.article.contains(selection.anchorNode)) {
            return null;
        }

        const path = [];
        let node = selection.anchorNode;

        while (node !== app.article) {
            path.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
            node = node.parentNode;
        }

        return { path, offset: selection.anchorOffset };
    }

    function restoreCaret(saved) {
        let node = app.article;

        (saved ? saved.path : []).forEach((index) => { node = node.childNodes[index] || node; });

        const range = document.createRange();

        range.setStart(node, Math.min(saved ? saved.offset : 0, node.nodeType === 3 ? node.length : node.childNodes.length));
        range.collapse(true);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    }

    return {
        toggleTaskAtCaret,
        toggleTaskLine,
        toggleTaskFromPreview,
        setHeading,
        moveLine,
        indent,
        continueListOnEnter,
        placeCaretInLink,
        caretPath,
        restoreCaret,
        lineText,
        charOffset,
        placeInBlock,
        rewriteLines,
        slash: { update: updateSlash, onKeyDown: onSlashKeyDown },
    };
})();
