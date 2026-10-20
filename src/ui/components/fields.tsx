// Form fields: a label around each control, so a tap on the label focuses it and screen readers
// read them together. 16px text keeps iOS from zooming in.
import type { InputHTMLAttributes, ReactNode } from 'react';

interface Common {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

function Wrap({ label, hint, error, children }: Common & { children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

export function TextField({ label, hint, error, value, onChange, ...rest }: Common & InputProps & { value: string; onChange: (v: string) => void }) {
  return (
    <Wrap label={label} hint={hint} error={error}>
      <input value={value} onChange={e => onChange(e.target.value)} aria-invalid={error ? true : undefined} {...rest} />
    </Wrap>
  );
}

/** Amounts and other numbers typed in Brazilian format, with the numeric keyboard. */
export function NumberField(props: Common & InputProps & { value: string; onChange: (v: string) => void }) {
  return <TextField inputMode="decimal" autoComplete="off" enterKeyHint="next" {...props} />;
}

export function DateField({ label, hint, error, value, onChange, ...rest }: Common & InputProps & { value: string; onChange: (v: string) => void }) {
  return (
    <Wrap label={label} hint={hint} error={error}>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} aria-invalid={error ? true : undefined} {...rest} />
    </Wrap>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  error,
  value,
  onChange,
  options,
}: Common & { value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[] }) {
  return (
    <Wrap label={label} hint={hint} error={error}>
      <select value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

export function CheckField({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </span>
    </label>
  );
}
