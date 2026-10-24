/**
 * How long edits settle before the work is written.
 *
 * Long enough that typing a name into a form is one write rather than one per
 * keystroke, and short enough that a phone call arriving in the moment after an
 * edit costs nothing worth noticing. The Site's Layouts and the visitor's
 * Collections wait the same length of time: they are written the same way, for
 * the same reason, and there is no policy that wants them to disagree.
 *
 * Shell state rather than a rule. `src/core/` has no clock and no timers, and
 * how long a browser waits before writing is not something the domain decides.
 */
export const WRITE_AFTER_MILLISECONDS = 400
