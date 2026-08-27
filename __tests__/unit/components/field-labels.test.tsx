// @vitest-environment jsdom
/**
 * B-23 — admin form labels were not associated with their inputs.
 *
 * A bare `<label>` beside an id-less `<input>` reads to a screen reader as an
 * unlabelled text box: staff could not tell Phone from Email. Clicking the
 * label also failed to focus its control, which is the everyday tell.
 *
 * `getByLabelText` performs the same lookup assistive technology does, so
 * these tests fail for exactly the reason a screen-reader user would suffer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { Field } from "@/components/ui/Field";

describe("Field", () => {
  it("ties the label to the control it renders", () => {
    render(<Field label="Phone">{(id) => <input id={id} />}</Field>);
    expect(screen.getByLabelText("Phone")).toBeTruthy();
  });

  it("focuses the control when the label is clicked", async () => {
    const user = userEvent.setup();
    render(<Field label="Email">{(id) => <input id={id} />}</Field>);

    await user.click(screen.getByText("Email"));
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("gives two instances different ids, so a form rendered twice still works", () => {
    render(
      <>
        <Field label="Notes">{(id) => <input id={id} data-testid="a" />}</Field>
        <Field label="Remarks">{(id) => <input id={id} data-testid="b" />}</Field>
      </>
    );
    const a = screen.getByTestId("a") as HTMLInputElement;
    const b = screen.getByTestId("b") as HTMLInputElement;

    expect(a.id).not.toBe(b.id);
    expect(screen.getByLabelText("Notes")).toBe(a);
    expect(screen.getByLabelText("Remarks")).toBe(b);
  });

  it("renders a hint when given one", () => {
    render(<Field label="Rate" hint="Blank uses the tariff">{(id) => <input id={id} />}</Field>);
    expect(screen.getByText("Blank uses the tariff")).toBeTruthy();
  });
});

/**
 * A guard, not a snapshot: the codemod that fixed ~70 call sites is easy to
 * regress one hand-written form at a time.
 */
/**
 * Scoped to `components/admin app/admin` for a long time, which is how the
 * booking wizard — the one form every guest passes through — came to have
 * eight bare labels and not a single `htmlFor` (B-49). It covers every
 * component and page now. `components/ui/Field.tsx` is excluded because it is
 * the primitive that emits the correct label, and it is tested directly above.
 */
describe("every form on the site", () => {
  const files = execSync('grep -rl "<label" --include=*.tsx components app', { encoding: "utf8" })
    .trim().split("\n").filter(Boolean)
    .filter((f) => !/Field\.tsx$/.test(f));

  it("finds the files to check, on both sides of the site", () => {
    expect(files.length).toBeGreaterThan(10);
    // Guest-facing forms are in scope now, not only admin ones.
    expect(files.some((f) => !/admin/.test(f))).toBe(true);
  });

  it("has no <label> that names nothing", () => {
    const offenders: string[] = [];

    for (const f of files) {
      const lines = readFileSync(f, "utf8").split(/\r?\n/);
      // Prose about labels is not a label. A comment explaining *why* a
      // control group uses `role="group"` legitimately mentions the tag, and
      // flagging those would push people into rewording their documentation to
      // appease a regex. Block state is tracked across lines, because the
      // mention is usually on a continuation line rather than the opener.
      let inComment = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const opens = /\/\*/.test(line);
        const closes = /\*\//.test(line);
        const wasInComment = inComment;
        if (opens && !closes) inComment = true;
        else if (closes) inComment = false;
        if (wasInComment || (opens && !closes)) continue;

        if (!/<label\b/.test(line)) continue;
        if (/htmlFor=/.test(line)) continue;
        if (/^\s*\/\//.test(line)) continue;

        // A label may instead wrap its control — also correct.
        let buf = lines[i];
        for (let k = i + 1; k < Math.min(i + 8, lines.length) && !/<\/label>/.test(buf); k++) buf += "\n" + lines[k];
        if (/<(input|select|textarea)\b/.test(buf)) continue;

        offenders.push(`${f}:${i + 1}  ${lines[i].trim().slice(0, 72)}`);
      }
    }

    expect(
      offenders,
      "A <label> must either carry htmlFor or wrap its control. For a group of\n" +
        "controls (radios, button rows) use a <span> plus role/aria-labelledby —\n" +
        "a label that names nothing is worse than no label.\n" +
        offenders.join("\n")
    ).toEqual([]);
  });

  /**
   * Prose about ids is not an id, for the same reason prose about labels is
   * not a label — the `<label>` check above already strips comments and says
   * why. A comment explaining a past id bug legitimately quotes the broken
   * template, and flagging that pushes people into rewording documentation to
   * appease a regex.
   */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  /**
   * Every id-bearing template literal in a file, as [holder, suffix] — so
   * `${roleFieldId}-role` and `${fieldId}-role` are counted apart.
   *
   * Matches any identifier rather than the literal name `fieldId`: a component
   * with two id sources has to name one of them something else, and a guard
   * that only knows one name silently stops covering the file the moment it is
   * renamed.
   *
   * `aria-labelledby` counts as a referrer alongside `htmlFor`. A *group* of
   * controls — a radio set, a row of buttons — is named by a `<span id>` and
   * `role="radiogroup"`, not by a `<label>` (see CLAUDE.md), so requiring
   * `htmlFor` there would fail the pattern this file exists to encourage.
   */
  function templateIds(src: string): Array<[string, string]> {
    const pattern = /(?:id|htmlFor|aria-labelledby|aria-describedby)=\{`\$\{(\w+)\}-([a-z0-9-]+)`\}/g;
    return [...stripComments(src).matchAll(pattern)].map((m) => [m[1], m[2]] as [string, string]);
  }

  it("pairs every generated id with exactly one control", () => {
    const unpaired: string[] = [];

    for (const f of files) {
      const counts: Record<string, number> = {};
      for (const [holder, suffix] of templateIds(readFileSync(f, "utf8"))) {
        const key = `${holder}-${suffix}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      for (const [id, n] of Object.entries(counts)) {
        // Exactly two: the control's id, and the one thing that points at it
        // (a label's htmlFor, or a group's aria-labelledby). Three would
        // mean two controls fighting over one label — and one shared across
        // four is how every field in the Add Staff modal came to point at the
        // Name input (B-65).
        if (n !== 2) unpaired.push(`${f}: ${id} appears ${n}×`);
      }
    }

    expect(unpaired, unpaired.join("\n")).toEqual([]);
  });

  it("declares useId in every component that generates ids", () => {
    const missing: string[] = [];

    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const bare = stripComments(src);
      const holders = new Set(templateIds(src).map(([holder]) => holder));
      if (holders.size === 0) continue;

      for (const holder of holders) {
        if (!new RegExp(`const ${holder} = useId\(\)`).test(bare)) {
          missing.push(`${f}: uses ${holder} without declaring it with useId()`);
        }
      }
      if (!/\buseId\b[^\n]*from "react"/.test(bare)) missing.push(`${f}: useId not imported`);
    }

    expect(missing, missing.join("\n")).toEqual([]);
  });
});
