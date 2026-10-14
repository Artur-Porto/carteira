import type { ReactNode } from 'react';

/** Stand-in for a screen that a later milestone builds. */
export function Planned({ milestone, children }: { milestone: string; children: ReactNode }) {
  return (
    <section className="card">
      <p>{children}</p>
      <p className="muted">Chega no marco {milestone}.</p>
    </section>
  );
}
