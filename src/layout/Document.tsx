import type { ReactNode } from "react";

/** A bulleted list in a page set for reading, such as the accessibility statement or About. */
export const LIST = "list-disc space-y-1.5 pl-5";

/** A headed part of a page set for reading. */
export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-heading text-xl font-medium">{heading}</h2>
      {children}
    </section>
  );
}
