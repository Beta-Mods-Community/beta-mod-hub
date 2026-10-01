"use client";

import { useActionState, useId } from "react";

import type { BetaModFormState } from "@lib/definitions";

type BetaModFormAction = (
  state: BetaModFormState,
  formData: FormData,
) => Promise<BetaModFormState>;

type Props = {
  action: BetaModFormAction;
  submitLabel: string;
  modId?: string;
  initial?: {
    title?: string;
    game?: string;
    tags?: string;
    description?: string;
    status?: string;
  };
};

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--text-soft)]";
const errorClass = "mt-1.5 text-sm text-rose-300";

export default function BetaModForm({
  action,
  submitLabel,
  modId,
  initial,
}: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const prefix = useId();

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {modId ? <input type="hidden" name="id" value={modId} /> : null}

      <fieldset className="form-section">
        <legend className="mb-4 text-base font-semibold text-text">Listing details</legend>
        <div className="space-y-5">
          <div>
            <label htmlFor={`${prefix}-title`} className={labelClass}>
              Title
            </label>
            <input
              id={`${prefix}-title`}
              name="title"
              type="text"
              defaultValue={initial?.title}
              placeholder="Mod name"
              className={inputClass}
              aria-invalid={Boolean(state?.errors?.title)}
              aria-describedby={state?.errors?.title ? `${prefix}-title-error` : undefined}
            />
            {state?.errors?.title && (
              <p id={`${prefix}-title-error`} className={errorClass}>{state.errors.title.join(", ")}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${prefix}-game`} className={labelClass}>
                Game
              </label>
              <input
                id={`${prefix}-game`}
                name="game"
                type="text"
                defaultValue={initial?.game}
                placeholder="Skyrim"
                className={inputClass}
                list="beta-mod-games"
                aria-invalid={Boolean(state?.errors?.game)}
                aria-describedby={state?.errors?.game ? `${prefix}-game-error` : undefined}
              />
              {state?.errors?.game && (
                <p id={`${prefix}-game-error`} className={errorClass}>{state.errors.game.join(", ")}</p>
              )}
            </div>
            <div>
              <label htmlFor={`${prefix}-status`} className={labelClass}>
                Status
              </label>
              <select
                id={`${prefix}-status`}
                name="status"
                defaultValue={initial?.status ?? "alpha"}
                className={inputClass}
                aria-invalid={Boolean(state?.errors?.status)}
                aria-describedby={state?.errors?.status ? `${prefix}-status-error` : undefined}
              >
                <option value="alpha">Alpha</option>
                <option value="beta">Beta</option>
                <option value="rc">Release candidate</option>
                <option value="abandoned">Abandoned</option>
              </select>
              {state?.errors?.status && (
                <p id={`${prefix}-status-error`} className={errorClass}>{state.errors.status.join(", ")}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor={`${prefix}-tags`} className={labelClass}>
              Tags
            </label>
            <input
              id={`${prefix}-tags`}
              name="tags"
              type="text"
              defaultValue={initial?.tags}
              placeholder="combat, magic, balance"
              className={inputClass}
              aria-invalid={Boolean(state?.errors?.tags)}
              aria-describedby={
                [state?.errors?.tags ? `${prefix}-tags-error` : null, "tags-help"].filter(Boolean).join(" ") || undefined
              }
            />
            <p id="tags-help" className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Comma-separated, up to 8.
            </p>
            {state?.errors?.tags && (
              <p id={`${prefix}-tags-error`} className={errorClass}>{state.errors.tags.join(", ")}</p>
            )}
          </div>
        </div>
      </fieldset>

      <div className="min-w-0 border-t border-line pt-6">
        <label htmlFor={`${prefix}-description`} className={labelClass}>
          Description
        </label>
        <textarea
          id={`${prefix}-description`}
          name="description"
          defaultValue={initial?.description}
          rows={10}
          placeholder={"## About\nWhat this mod changes.\n\n## Installation\nRequired game version, dependencies, and install/uninstall steps.\n\n## Testing\nKnown issues and the specific things you want testers to check."}
          className={inputClass}
          aria-invalid={Boolean(state?.errors?.description)}
          aria-describedby={
            [state?.errors?.description ? `${prefix}-description-error` : null, "description-help"].filter(Boolean).join(" ") || undefined
          }
        />
        <div id="description-help" className="mt-3 space-y-1 text-sm leading-6 text-[var(--muted)]">
          <p>Include installation instructions, the supported game version, known issues, and what you need tested.</p>
          <p className="text-xs">Markdown headings, lists, links, and emphasis are supported.</p>
        </div>
        {state?.errors?.description && (
          <p id={`${prefix}-description-error`} className={errorClass}>{state.errors.description.join(", ")}</p>
        )}
      </div>

      {state?.message && (
        <p role="alert" className="notice notice-error">{state.message}</p>
      )}

      <div className="form-actions">
        <button
          type="submit"
          disabled={pending}
          className="button-primary w-full sm:w-auto"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
