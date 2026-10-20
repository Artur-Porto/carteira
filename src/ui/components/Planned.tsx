import type { ReactNode } from 'react';

/** Stand-in for a screen that a later milestone builds; `milestone` is "3" or "3, 7 e 8". */
export function Planned({ milestone, children }: { milestone: string; children: ReactNode }) {
  const several = /[ ,]/.test(milestone);
  return (
    <section className="card">
      <p>{children}</p>
      <p className="muted">
        Chega {several ? 'nos marcos' : 'no marco'} {milestone}.
      </p>
    </section>
  );
}
