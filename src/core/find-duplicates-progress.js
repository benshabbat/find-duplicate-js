// Progress reporting for long scans.
//
// Everything here writes to stderr, never stdout: the human report and the
// --json document both go to stdout, and a progress line interleaved with
// either would corrupt output that gets piped into a file or a parser.

// Repainting on every one of tens of thousands of callbacks costs more than
// the work being reported on. One update per interval is plenty for a human.
const REPAINT_INTERVAL_MS = 100;

const PHASE_LABELS = {
  parse: 'Parsing files',
  compare: 'Comparing functions'
};

/**
 * Creates an `onProgress` callback for findDuplicates() that paints a
 * single-line progress indicator on stderr.
 * @param {{stream?: NodeJS.WriteStream}} [options] - Optional stream override
 *   (defaults to process.stderr); used by tests
 * @returns {{onProgress: Function, done: Function}|null} The callback and a
 *   `done()` that erases the line, or null when progress should not be shown
 * @description Returns null unless stderr is a TTY. A non-TTY stderr means the
 * output is being captured - a CI log, a file, a pipe - where a carriage-return
 * animation turns into thousands of junk lines rather than a progress bar.
 */
function createProgressReporter(options = {}) {
  const stream = options.stream || process.stderr;

  if (!stream || !stream.isTTY) {
    return null;
  }

  let lastPaint = 0;
  let lastWidth = 0;

  const paint = (text) => {
    stream.write(`\r${text}${' '.repeat(Math.max(0, lastWidth - text.length))}`);
    lastWidth = text.length;
  };

  return {
    onProgress({ phase, current, total }) {
      const now = Date.now();
      // Always paint the final tick of a phase, so the line never freezes
      // part-way through and leaves the user guessing.
      if (now - lastPaint < REPAINT_INTERVAL_MS && current !== total) {
        return;
      }
      lastPaint = now;

      const label = PHASE_LABELS[phase] || phase;
      const percent = total > 0 ? Math.floor((current / total) * 100) : 100;
      paint(`⏳ ${label}: ${current}/${total} (${percent}%)`);
    },

    done() {
      if (lastWidth > 0) {
        stream.write(`\r${' '.repeat(lastWidth)}\r`);
        lastWidth = 0;
      }
    }
  };
}

export { createProgressReporter };
