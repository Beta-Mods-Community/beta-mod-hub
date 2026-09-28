"use client";

import { useActionState } from "react";

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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {modId ? <input type="hidden" name="id" value={modId} /> : null}

      <div>
        <label htmlFor="title" className={labelClass}>
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          defaultValue={initial?.title}
          placeholder="My Awesome Mod — Beta 2"
          className={inputClass}
        />
        {state?.errors?.title && (
          <p className={errorClass}>{state.errors.title.join(", ")}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="game" className={labelClass}>
            Game
          </label>
          <input
            id="game"
            name="game"
            type="text"
            defaultValue={initial?.game}
            placeholder="Skyrim"
            className={inputClass}
            list="beta-mod-games"
          />
          {state?.errors?.game && (
            <p className={errorClass}>{state.errors.game.join(", ")}</p>
          )}
        </div>
        <div>
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={initial?.status ?? "alpha"}
            className={inputClass}
          >
            <option value="alpha">Alpha</option>
            <option value="beta">Beta</option>
            <option value="rc">Release candidate</option>
            <option value="abandoned">Abandoned</option>
          </select>
          {state?.errors?.status && (
            <p className={errorClass}>{state.errors.status.join(", ")}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="tags" className={labelClass}>
          Tags
        </label>
        <input
          id="tags"
          name="tags"
          type="text"
          defaultValue={initial?.tags}
          placeholder="combat, magic, balance"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          Comma-separated, up to 8.
        </p>
        {state?.errors?.tags && (
          <p className={errorClass}>{state.errors.tags.join(", ")}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={initial?.description}
          rows={8}
          placeholder="What it does, its current state, known issues, and what kind of testing you want."
          className={inputClass}
        />
        {state?.errors?.description && (
          <p className={errorClass}>{state.errors.description.join(", ")}</p>
        )}
      </div>

      {state?.message && (
        <p className="text-sm text-rose-300">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="button-primary mt-2"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
