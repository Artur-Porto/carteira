// Current share of each class against its target and band (SPEC, "Início"). Every number is also
// written out, so the bars only repeat the text; a class outside its band says so in words.
import { ASSET_CLASS_LABELS } from '../../domain/policy';
import type { AllocationRow } from '../../engine/allocation';
import { formatPct } from '../format';
import { BAND_STATUS_LABELS } from '../labels';

const pct = (value: number) => formatPct(value);

/** Shares as text with one decimal, such as "12,3%". */
export const shareText = (row: AllocationRow) => (row.pct ? formatPct(Number(row.pct.toFixed(1))) : '0%');

/** One scale for every row, so the bars compare: at least 30%, in steps of 10 points. */
function scaleOf(rows: readonly AllocationRow[]): number {
  const top = Math.max(30, ...rows.map(r => Math.max(r.band.max, r.pct ? r.pct.toNumber() : 0)));
  return Math.ceil(top / 10) * 10;
}

function Bar({ row, scale }: { row: AllocationRow; scale: number }) {
  const at = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;
  const share = row.pct ? Math.min(100, (row.pct.toNumber() / scale) * 100) : 0;
  return (
    <svg className="alloc-bar" width="100%" height="14" aria-hidden="true" focusable="false">
      <rect className="alloc-track" x="0" y="3" width="100%" height="8" rx="4" />
      <rect className="alloc-band" x={at(row.band.min)} y="3" width={at(row.band.max - row.band.min)} height="8" />
      {share > 0 && (
        <>
          {/* Rounded at the end of the share, square at the baseline. */}
          <rect className="alloc-share" x="0" y="3" width={`${share}%`} height="8" rx="4" />
          <rect className="alloc-share" x="0" y="3" width={`${Math.min(share, 1.5)}%`} height="8" />
        </>
      )}
      <rect className="alloc-target" x={at(row.targetPct)} y="0" width="2" height="14" transform="translate(-1 0)" />
    </svg>
  );
}

export function AllocationBars({ rows }: { rows: readonly AllocationRow[] }) {
  const scale = scaleOf(rows);
  return (
    <ul className="alloc">
      {rows.map(row => (
        <li key={row.assetClass}>
          <div className="alloc-head">
            <span>{ASSET_CLASS_LABELS[row.assetClass]}</span>
            <strong className="num">{shareText(row)}</strong>
          </div>
          <Bar row={row} scale={scale} />
          <div className="muted small">
            Alvo {pct(row.targetPct)}, faixa de {pct(row.band.min)} a {pct(row.band.max)}
            {row.status && row.status !== 'dentro' && (
              <>
                {' '}
                <span className="tag">{BAND_STATUS_LABELS[row.status]}</span>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
