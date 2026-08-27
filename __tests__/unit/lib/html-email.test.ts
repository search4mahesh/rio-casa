import { describe, it, expect } from "vitest";
import { escapeHtml, escapeHtmlWithBreaks } from "@/lib/html-email";

/**
 * B-63 — guest input was interpolated straight into the HTML of the emails
 * this application sends.
 *
 * The one that mattered was `/api/contact`, because the reader is staff: a
 * name of `<a href="…">Approve refund</a>` rendered as a live link in the
 * inbox of whoever was handling the enquiry.
 */

describe("escapeHtml", () => {
  it("neutralises a tag", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("neutralises an injected link — the contact-form case", () => {
    const name = '<a href="http://evil.example">Approve refund</a>';
    const out = escapeHtml(name);

    // The text `href=` survives, and harmlessly: what makes it an attribute is
    // the `<a` around it, and that is gone. Asserting on the angle brackets is
    // asserting on the thing that actually decides whether a tag forms.
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toContain("&lt;a href=&quot;");
  });

  it("escapes both quote characters, so attributes cannot be broken out of", () => {
    expect(escapeHtml(`" onmouseover="x`)).toBe("&quot; onmouseover=&quot;x");
    expect(escapeHtml("' onmouseover='x")).toBe("&#39; onmouseover=&#39;x");
  });

  // If `&` were escaped after the others, `<` would become `&amp;lt;` and the
  // reader would see the entity rather than the character.
  it("escapes & first, so entities are not double-escaped", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Asha Patil")).toBe("Asha Patil");
    expect(escapeHtml("Room 105 — 2 nights")).toBe("Room 105 — 2 nights");
  });

  it("renders an absent value as nothing, not as the word null", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("coerces non-strings so call sites need not", () => {
    expect(escapeHtml(4500)).toBe("4500");
    expect(escapeHtml(0)).toBe("0");
    expect(escapeHtml(false)).toBe("false");
  });
});

describe("escapeHtmlWithBreaks", () => {
  it("keeps line breaks as markup while escaping the text around them", () => {
    expect(escapeHtmlWithBreaks("line one\nline two")).toBe("line one<br/>line two");
  });

  // The ordering bug this function exists to prevent: escaping *after*
  // inserting <br/> would print the tag to the reader.
  it("does not escape the breaks it introduced", () => {
    const out = escapeHtmlWithBreaks("a\nb");

    expect(out).toContain("<br/>");
    expect(out).not.toContain("&lt;br");
  });

  it("still escapes markup in a multi-line message", () => {
    const message = "Is a room free?\n<img src=x onerror=alert(1)>";
    const out = escapeHtmlWithBreaks(message);

    expect(out).toContain("<br/>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("handles CRLF, which is what a browser textarea actually submits", () => {
    expect(escapeHtmlWithBreaks("a\r\nb")).toBe("a<br/>b");
  });
});
