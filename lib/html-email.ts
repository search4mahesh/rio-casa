// ─────────────────────────────────────────────────────────────
// Escaping for the HTML emails this application sends.
//
// Three routes build an email body by interpolating values straight into a
// template literal, and none of them escaped anything (B-63). The values are
// not ours: a guest's name, phone and free-text message come off a public
// form, and `specialRequests` off the booking wizard.
//
// The worst of the three is `/api/contact`, because the reader is **staff**:
// a name of `<a href="http://…">Approve refund</a>` renders as a live link in
// the inbox of the person handling the enquiry. The others are a guest
// receiving their own input back, which is milder but still means a booking
// confirmation whose markup the booker chose.
//
// Email clients are not browsers — most strip <script> — so this is not
// "XSS in an email" so much as letting a stranger write markup into a message
// the property appears to have sent. Links, images and hidden text are all
// reachable that way, and all of them are phishing primitives.
// ─────────────────────────────────────────────────────────────

/**
 * Escape a value for interpolation into HTML.
 *
 * Handles the five characters that matter, `'` included: attribute values in
 * these templates are single-quoted in places, and escaping only `"` leaves
 * those breakable.
 *
 * Non-strings are coerced first, so a number or a Date can be passed without
 * every call site remembering to `String()` it. `null`/`undefined` become an
 * empty string rather than the words "null" and "undefined".
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";

  return String(value)
    // `&` first — otherwise the entities introduced below get double-escaped.
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape a value, then turn its newlines into `<br/>`.
 *
 * The order is the whole point. `text.replace(/\n/g, "<br/>")` followed by an
 * escape would escape the `<br/>` too and print it to the reader; escaping
 * after inserting real markup is how the tag survives while the text around it
 * does not. Doing it in one function means no call site has to get the
 * sequence right.
 */
export function escapeHtmlWithBreaks(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}
