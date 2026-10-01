import type { ReactNode } from "react";

type ErrorField = { id: string; label: string; errors?: string[] };

/** Returned field validation is an error even when the action has no message. */
export default function FormErrorSummary({
  message,
  fields,
  children,
}: {
  message?: string;
  fields: ErrorField[];
  children?: ReactNode;
}) {
  const invalidFields = fields.filter(field => field.errors?.length);
  if (!message && !invalidFields.length) return null;

  return (
    <div role="alert" className="notice notice-error">
      <div className="min-w-0 space-y-2">
        <p className="font-medium">{message || "Please correct the following fields."}</p>
        {invalidFields.length > 0 && (
          <ul className="list-disc space-y-1 pl-5">
            {invalidFields.map(field => (
              <li key={field.id}>
                <a href={`#${field.id}`} className="underline underline-offset-2">
                  {field.label}: {field.errors!.join(", ")}
                </a>
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </div>
  );
}
