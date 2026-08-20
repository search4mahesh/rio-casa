"use client";

import { useId } from "react";

/**
 * A labelled form control.
 *
 * The label and the control are tied together by a generated id, so assistive
 * technology announces the control by name and clicking the label focuses it.
 * Admin forms previously emitted a bare `<label>` beside an id-less input,
 * which reads to a screen reader as an unlabelled text box — staff could not
 * tell Phone from Email.
 *
 * The id comes from `useId()` rather than the label text, so the same form
 * rendered twice on one page cannot produce duplicate ids.
 *
 * ```tsx
 * <Field label="Phone *">
 *   {(id) => <input id={id} value={phone} onChange={…} />}
 * </Field>
 * ```
 *
 * The render prop is what makes the association impossible to forget: there is
 * no way to render the control without being handed the id it must carry.
 */
export function Field({
  label,
  hint,
  labelClassName = "block text-sm font-medium text-gray-700 mb-1",
  className,
  children,
}: {
  label: React.ReactNode;
  /** Helper text below the control, announced with it. */
  hint?: React.ReactNode;
  labelClassName?: string;
  className?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className={className}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      {children(id)}
      {hint ? (
        <p id={hintId} className="text-xs text-gray-500 mt-1">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
