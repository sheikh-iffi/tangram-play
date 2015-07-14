// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

import CodeMirror from 'codemirror';

let noOptions = { indent: true };
let nonWS = /[^\s\u00a0]/;
let Pos = CodeMirror.Pos;

function firstNonWS(str) {
    let found = str.search(nonWS);
    return found == -1 ? 0 : found;
}

CodeMirror.commands.toggleComment = function(cm) {
    let minLine = Infinity, ranges = cm.listSelections(), mode = null;
    for (let i = ranges.length - 1; i >= 0; i--) {
        let from = ranges[i].from(), to = ranges[i].to();
        if (from.line >= minLine) continue;
        if (to.line >= minLine) to = Pos(minLine, 0);
        minLine = from.line;
        if (mode == null) {
            if (cm.uncomment(from, to)) mode = "un";
            else { cm.lineComment(from, to); mode = "line"; }
        } else if (mode == "un") {
            cm.uncomment(from, to);
        } else {
            cm.lineComment(from, to);
        }
    }
};

CodeMirror.defineExtension("lineComment", function(from, to, options) {
    if (!options) options = noOptions;
    let self = this, mode = self.getModeAt(from);
    let commentString = options.lineComment || mode.lineComment;
    if (!commentString) {
        if (options.blockCommentStart || mode.blockCommentStart) {
            options.fullLines = true;
            self.blockComment(from, to, options);
        }
        return;
    }
    let firstLine = self.getLine(from.line);
    if (firstLine == null) return;
    let end = Math.min(to.ch != 0 || to.line == from.line ? to.line + 1 : to.line, self.lastLine() + 1);
    let pad = options.padding == null ? " " : options.padding;
    let blankLines = options.commentBlankLines || from.line == to.line;

    self.operation(function() {
        if (options.indent) {
            let baseString = firstLine.slice(0, firstNonWS(firstLine));
            for (let i = from.line; i < end; ++i) {
                let line = self.getLine(i), cut = baseString.length;
                if (!blankLines && !nonWS.test(line)) continue;
                if (line.slice(0, cut) != baseString) cut = firstNonWS(line);
                self.replaceRange(baseString + commentString + pad, Pos(i, 0), Pos(i, cut));
            }
        } else {
            for (let i = from.line; i < end; ++i) {
                if (blankLines || nonWS.test(self.getLine(i)))
                    self.replaceRange(commentString + pad, Pos(i, 0));
            }
        }
    });
});

CodeMirror.defineExtension("blockComment", function(from, to, options) {
    if (!options) options = noOptions;
        let self = this, mode = self.getModeAt(from);
        let startString = options.blockCommentStart || mode.blockCommentStart;
        let endString = options.blockCommentEnd || mode.blockCommentEnd;
        if (!startString || !endString) {
        if ((options.lineComment || mode.lineComment) && options.fullLines != false)
            self.lineComment(from, to, options);
            return;
        }

        let end = Math.min(to.line, self.lastLine());
        if (end != from.line && to.ch == 0 && nonWS.test(self.getLine(end))) --end;

        let pad = options.padding == null ? " " : options.padding;
        if (from.line > end) return;

        self.operation(function() {
        if (options.fullLines != false) {
            let lastLineHasText = nonWS.test(self.getLine(end));
            self.replaceRange(pad + endString, Pos(end));
            self.replaceRange(startString + pad, Pos(from.line, 0));
            let lead = options.blockCommentLead || mode.blockCommentLead;
            if (lead != null) for (let i = from.line + 1; i <= end; ++i)
                if (i != end || lastLineHasText)
                    self.replaceRange(lead + pad, Pos(i, 0));
        } else {
            self.replaceRange(endString, to);
            self.replaceRange(startString, from);
        }
    });
});

CodeMirror.defineExtension("uncomment", function(from, to, options) {
    if (!options) options = noOptions;
    let self = this, mode = self.getModeAt(from);
    let end = Math.min(to.ch != 0 || to.line == from.line ? to.line : to.line - 1, self.lastLine()), start = Math.min(from.line, end);

    // Try finding line comments
    let lineString = options.lineComment || mode.lineComment, lines = [];
    let pad = options.padding == null ? " " : options.padding, didSomething;
    lineComment: {
    if (!lineString) break lineComment;
    for (let i = start; i <= end; ++i) {
        let line = self.getLine(i);
        let found = line.indexOf(lineString);
        if (found > -1 && !/comment/.test(self.getTokenTypeAt(Pos(i, found + 1)))) found = -1;
        if (found == -1 && (i != end || i == start) && nonWS.test(line)) break lineComment;
        if (found > -1 && nonWS.test(line.slice(0, found))) break lineComment;
        lines.push(line);
    }
    self.operation(function() {
        for (let i = start; i <= end; ++i) {
            let line = lines[i - start];
            let pos = line.indexOf(lineString), endPos = pos + lineString.length;
            if (pos < 0) continue;
            if (line.slice(endPos, endPos + pad.length) == pad) endPos += pad.length;
            didSomething = true;
            self.replaceRange("", Pos(i, pos), Pos(i, endPos));
        }
    });
    if (didSomething) return true;
  }

    // Try block comments
    let startString = options.blockCommentStart || mode.blockCommentStart;
    let endString = options.blockCommentEnd || mode.blockCommentEnd;
    if (!startString || !endString) return false;
    let lead = options.blockCommentLead || mode.blockCommentLead;
    let startLine = self.getLine(start), endLine = end == start ? startLine : self.getLine(end);
    let open = startLine.indexOf(startString), close = endLine.lastIndexOf(endString);
    if (close == -1 && start != end) {
        endLine = self.getLine(--end);
        close = endLine.lastIndexOf(endString);
    }
    if (open == -1 || close == -1 ||
        !/comment/.test(self.getTokenTypeAt(Pos(start, open + 1))) ||
        !/comment/.test(self.getTokenTypeAt(Pos(end, close + 1))))
    return false;

    // Avoid killing block comments completely outside the selection.
    // Positions of the last startString before the start of the selection, and the first endString after it.
    let lastStart = startLine.lastIndexOf(startString, from.ch);
    let firstEnd = lastStart == -1 ? -1 : startLine.slice(0, from.ch).indexOf(endString, lastStart + startString.length);
    if (lastStart != -1 && firstEnd != -1 && firstEnd + endString.length != from.ch) return false;
    // Positions of the first endString after the end of the selection, and the last startString before it.
    firstEnd = endLine.indexOf(endString, to.ch);
    let almostLastStart = endLine.slice(to.ch).lastIndexOf(startString, firstEnd - to.ch);
    lastStart = (firstEnd == -1 || almostLastStart == -1) ? -1 : to.ch + almostLastStart;
    if (firstEnd != -1 && lastStart != -1 && lastStart != to.ch) return false;

    self.operation(function() {
        self.replaceRange("", Pos(end, close - (pad && endLine.slice(close - pad.length, close) == pad ? pad.length : 0)),
                            Pos(end, close + endString.length));
        let openEnd = open + startString.length;
        if (pad && startLine.slice(openEnd, openEnd + pad.length) == pad) openEnd += pad.length;
        self.replaceRange("", Pos(start, open), Pos(start, openEnd));
        if (lead) for (let i = start + 1; i <= end; ++i) {
            let line = self.getLine(i), found = line.indexOf(lead);
            if (found == -1 || nonWS.test(line.slice(0, found))) continue;
            let foundEnd = found + lead.length;
            if (pad && line.slice(foundEnd, foundEnd + pad.length) == pad) foundEnd += pad.length;
            self.replaceRange("", Pos(i, found), Pos(i, foundEnd));
        }
    });
    return true;
});