import { useState, type ReactNode } from 'react';

/** A destructive action that asks once more on the spot, instead of a browser dialog. */
export function ConfirmButton({
  label,
  confirmLabel,
  warning,
  onConfirm,
  small = false,
}: {
  label: string;
  confirmLabel: string;
  warning?: ReactNode;
  onConfirm: () => void | Promise<void>;
  small?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const className = `button danger${small ? ' small-button' : ''}`;
  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="confirm">
      {warning && <p className="notice">{warning}</p>}
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className={`button${small ? ' small-button' : ''}`} onClick={() => setAsking(false)}>
        Cancelar
      </button>
    </div>
  );
}
