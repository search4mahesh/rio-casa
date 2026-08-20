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
describe("admin forms", () => {
  const files = execSync('grep -rl "<label" --include=*.tsx components/admin app/admin', { encoding: "utf8" })
    .trim().split("\n").filter(Boolean);

  it("finds the admin files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("has no <label> that names nothing", () => {
    const offenders: string[] = [];

    for (const f of files) {
      const lines = readFileSync(f, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!/<label\b/.test(lines[i])) continue;
        if (/htmlFor=/.test(lines[i])) continue;

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

  it("pairs every generated id with exactly one control", () => {
    const unpaired: string[] = [];

    for (const f of files) {
      const s = readFileSync(f, "utf8");
      const counts: Record<string, number> = {};
      for (const m of s.matchAll(/\$\{fieldId\}-([a-z0-9-]+)`/g)) {
        counts[m[1]] = (counts[m[1]] ?? 0) + 1;
      }
      for (const [id, n] of Object.entries(counts)) {
        // Exactly two: the label's htmlFor and the control's id. Three would
        // mean two controls fighting over one label.
        if (n !== 2) unpaired.push(`${f}: ${id} appears ${n}×`);
      }
    }

    expect(unpaired, unpaired.join("\n")).toEqual([]);
  });

  it("declares useId in every component that generates ids", () => {
    const missing: string[] = [];

    for (const f of files) {
      const s = readFileSync(f, "utf8");
      if (!/\$\{fieldId\}/.test(s)) continue;
      if (!/const fieldId = useId\(\)/.test(s)) missing.push(`${f}: uses fieldId without declaring it`);
      if (!/\buseId\b[^\n]*from "react"/.test(s)) missing.push(`${f}: useId not imported`);
    }

    expect(missing, missing.join("\n")).toEqual([]);
  });
});
