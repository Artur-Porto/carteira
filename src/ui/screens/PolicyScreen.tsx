import { useState, type ReactNode } from 'react';
import { savePolicy } from '../../data/entries';
import { db } from '../../data/instance';
import { dec } from '../../domain/decimal';
import { ASSET_CLASS_LABELS, TERM_OF_CLASS, bandFor, initialPolicy, policyErrors, type PolicyField } from '../../domain/policy';
import { grossByClass } from '../../domain/portfolio';
import { FGC_GUARANTEE, TAX_RULES } from '../../domain/tax';
import { ASSET_CLASSES, type AssetClass, type Policy } from '../../domain/types';
import { allocation } from '../../engine/allocation';
import { scenarioResults, withinTolerance, worstScenario } from '../../engine/scenarios';
import { shareText } from '../components/AllocationBars';
import { NumberField } from '../components/fields';
import { Money } from '../discreet';
import { formatDate, formatPct } from '../format';
import { usePortfolio } from '../hooks';
import { centsInput, readCents, readDecimal } from '../input';

type Field = Exclude<PolicyField, 'targets'>;
type Texts = Record<Field, string>;
type Draft = Omit<Policy, 'id' | 'bands' | 'createdAt' | 'updatedAt'>;

const pctInput = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });

function textsOf(policy: Policy): Texts {
  return {
    months: String(policy.reserve.months),
    monthlyCost: policy.reserve.monthlyCostCents > 0 ? centsInput(policy.reserve.monthlyCostCents) : '',
    minCdi: pctInput(policy.reserve.minCdiPct),
    ...(Object.fromEntries(ASSET_CLASSES.map(cls => [cls, pctInput(policy.targets[cls])])) as Record<AssetClass, string>),
    criptoMaxPct: pctInput(policy.limits.criptoMaxPct),
    issuerFgcPct: pctInput(policy.limits.issuerFgcPct),
    singleFiiMaxPctOfClass: pctInput(policy.limits.singleFiiMaxPctOfClass),
    maxDrawdown: pctInput(policy.maxDrawdown),
  };
}

const pct = (text: string) => {
  const value = readDecimal(text, 2);
  return value === null ? null : Number(value);
};

/** The draft typed so far, or the fields that are not numbers. */
function read(texts: Texts, base: Policy): { draft: Draft | null; errors: Partial<Record<PolicyField, string>> } {
  const errors: Partial<Record<PolicyField, string>> = {};
  const number = (field: Field, value: number | null) => {
    if (value === null) errors[field] = 'Digite um número, como 12 ou 12,5.';
    return value ?? 0;
  };
  const months = readDecimal(texts.months, 0);
  const monthlyCost = texts.monthlyCost.trim() ? readCents(texts.monthlyCost) : 0;
  const draft: Draft = {
    reserve: {
      months: number('months', months === null ? null : Number(months)),
      monthlyCostCents: number('monthlyCost', monthlyCost),
      minCdiPct: number('minCdi', pct(texts.minCdi)),
    },
    targets: Object.fromEntries(ASSET_CLASSES.map(cls => [cls, number(cls, pct(texts[cls]))])) as Record<AssetClass, number>,
    limits: {
      criptoMaxPct: number('criptoMaxPct', pct(texts.criptoMaxPct)),
      issuerFgcPct: number('issuerFgcPct', pct(texts.issuerFgcPct)),
      singleStockMaxPct: base.limits.singleStockMaxPct,
      singleFiiMaxPctOfClass: number('singleFiiMaxPctOfClass', pct(texts.singleFiiMaxPctOfClass)),
    },
    scenarios: base.scenarios,
    tiltEnabled: base.tiltEnabled,
    maxDrawdown: number('maxDrawdown', pct(texts.maxDrawdown)),
  };
  if (Object.keys(errors).length > 0) return { draft: null, errors };
  return { draft, errors: policyErrors(draft) };
}

function Editor({ policy, current }: { policy: Policy; current: Partial<Record<AssetClass, string>> }) {
  const [texts, setTexts] = useState<Texts>(() => textsOf(policy));
  const [shown, setShown] = useState<Partial<Record<PolicyField, string>>>({});
  const [saved, setSaved] = useState(false);
  const set = (field: Field) => (value: string) => {
    setTexts(prev => ({ ...prev, [field]: value }));
    setShown(prev => ({ ...prev, [field]: undefined, targets: undefined }));
    setSaved(false);
  };

  const targets = Object.fromEntries(ASSET_CLASSES.map(cls => [cls, pct(texts[cls])])) as Record<AssetClass, number | null>;
  const typed = ASSET_CLASSES.every(cls => targets[cls] !== null);
  const sumHundredths = ASSET_CLASSES.reduce((sum, cls) => sum + Math.round((targets[cls] ?? 0) * 100), 0);
  const termSum = (term: 'medio' | 'longo') =>
    ASSET_CLASSES.filter(cls => TERM_OF_CLASS[cls] === term).reduce((sum, cls) => sum + Math.round((targets[cls] ?? 0) * 100), 0) / 100;
  const worst =
    typed && sumHundredths === 10_000
      ? worstScenario(scenarioResults(Object.fromEntries(ASSET_CLASSES.map(cls => [cls, dec(targets[cls]!)])), policy.scenarios))
      : undefined;
  const tolerance = pct(texts.maxDrawdown);
  const issuerPct = pct(texts.issuerFgcPct);
  const cost = texts.monthlyCost.trim() ? readCents(texts.monthlyCost) : 0;
  const months = readDecimal(texts.months, 0);

  const field = (f: Field, label: string, hint?: ReactNode) => (
    <NumberField label={label} value={texts[f]} onChange={set(f)} hint={hint} error={shown[f] ?? null} />
  );

  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        const { draft, errors } = read(texts, policy);
        setShown(errors);
        if (!draft || Object.keys(errors).length > 0) return;
        await savePolicy(db, draft);
        setSaved(true);
      }}
    >
      <section className="card" aria-labelledby="policy-reserve-title">
        <h2 id="policy-reserve-title">Reserva</h2>
        {field('months', 'Meta, em meses de custo de vida')}
        {field(
          'monthlyCost',
          'Custo de vida mensal',
          cost && months !== null ? (
            <>
              Meta de <Money cents={cost * Number(months)} />.
            </>
          ) : (
            'Sem o custo de vida, o aporte não calcula a parte da reserva.'
          ),
        )}
        {field('minCdi', 'Piso de rendimento, em % do CDI', 'Abaixo dele, a tela Reserva avisa.')}
        <p className="muted small">
          No aporte, a reserva recebe 100% abaixo de metade da meta, 50% até completar a meta e nada com a meta cheia.
        </p>
      </section>

      <section className="card" aria-labelledby="policy-targets-title">
        <h2 id="policy-targets-title">Alvos da carteira livre</h2>
        <p className="muted small">A faixa de cada classe segue a regra 5/25: o alvo, para mais e para menos, a menor distância entre 5 pontos e 25% dele.</p>
        {ASSET_CLASSES.map(cls => {
          const target = targets[cls];
          const band = target !== null && target >= 0 ? bandFor(target) : null;
          return (
            <div key={cls}>
              {field(
                cls,
                ASSET_CLASS_LABELS[cls],
                <>
                  {band ? `Faixa de ${formatPct(band.min)} a ${formatPct(band.max)}` : 'Faixa: digite o alvo'}
                  {current[cls] && ` · hoje ${current[cls]}`}
                  {` · ${TERM_OF_CLASS[cls] === 'medio' ? 'médio prazo' : 'longo prazo'}`}
                </>,
              )}
            </div>
          );
        })}
        <p>
          Soma dos alvos: {formatPct(sumHundredths / 100)}. Médio prazo, {formatPct(termSum('medio'))}; longo prazo, {formatPct(termSum('longo'))}.
        </p>
        {shown.targets && <p className="field-error">{shown.targets}</p>}
      </section>

      <section className="card" aria-labelledby="policy-limits-title">
        <h2 id="policy-limits-title">Limites</h2>
        {field('criptoMaxPct', 'Teto de cripto, em % da carteira livre')}
        {field(
          'issuerFgcPct',
          'Limite por emissor bancário, em % da garantia do FGC',
          issuerPct !== null && issuerPct > 0 ? (
            <>
              <Money cents={Math.round((FGC_GUARANTEE.value.perConglomerateCents * issuerPct) / 100)} /> por conglomerado, somando todos os produtos com
              FGC, inclusive os da reserva.
            </>
          ) : undefined,
        )}
        {field('singleFiiMaxPctOfClass', 'Limite por FII, em % da classe FIIs')}
        <p>
          Ação individual: até {formatPct(policy.limits.singleStockMaxPct)} da carteira livre.
          <span className="hint">
            Vem do orçamento de risco do aditivo 1: nenhuma ação pode custar mais de 2% da carteira livre numa queda de 70%. Fica editável no
            marco 7.
          </span>
        </p>
      </section>

      <section className="card" aria-labelledby="policy-risk-title">
        <h2 id="policy-risk-title">Tolerância a perdas</h2>
        {field('maxDrawdown', 'Perda máxima no pior cenário, em %')}
        {worst ? (
          <p>
            O pior cenário com estes alvos é {worst.scenario.name}, com perda de {formatPct(Number(worst.pct.abs().toFixed(2)))}
            {tolerance === null ? '.' : withinTolerance(worst, tolerance) ? ', dentro da tolerância.' : ', acima da tolerância.'}
          </p>
        ) : (
          <p className="muted">O pior cenário aparece quando os alvos somarem 100%.</p>
        )}
        <details>
          <summary>Perda dos alvos em cada cenário</summary>
          {typed && sumHundredths === 10_000 && (
            <dl className="rows">
              {scenarioResults(Object.fromEntries(ASSET_CLASSES.map(cls => [cls, dec(targets[cls]!)])), policy.scenarios).map(r => (
                <div key={r.scenario.id}>
                  <dt>{r.scenario.name}</dt>
                  <dd className="num">{formatPct(Number(r.pct.toFixed(2)))}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="muted small">Os choques de cada cenário e o termômetro de taxas ficam editáveis no marco 4. Até lá, o aporte usa os alvos sem deslocamento.</p>
        </details>
      </section>

      <button type="submit" className="button primary">
        Salvar política
      </button>
      {saved && (
        <p role="status" className="muted">
          Política salva.
        </p>
      )}
      {Object.keys(shown).some(k => shown[k as PolicyField]) && <p className="error">Corrija os campos marcados para salvar.</p>}
      <button
        type="button"
        className="button"
        onClick={() => {
          setTexts({ ...textsOf(initialPolicy(new Date().toISOString(), policy.reserve.monthlyCostCents)) });
          setShown({});
          setSaved(false);
        }}
      >
        Usar os valores iniciais
      </button>

      <section className="card" aria-labelledby="policy-tax-title">
        <h2 id="policy-tax-title">Parâmetros fiscais</h2>
        <ul className="rows">
          {TAX_RULES.map(rule => (
            <li key={rule.id}>
              <span>
                <span className="name">{rule.label}</span>
                <span className="muted small">
                  Conferido em {formatDate(rule.verifiedAt)} em {rule.source.title}.
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="muted small">As regras ficam no código do app, cada uma com a data da conferência na fonte oficial.</p>
      </section>
    </form>
  );
}

export function PolicyScreen() {
  const p = usePortfolio();
  if (!p?.settings) return null;
  const policy = p.policy ?? initialPolicy(p.settings.createdAt);
  const rows = allocation(grossByClass(p.value), policy.targets, policy.bands);
  const current = p.value.free.grossCents > 0 ? Object.fromEntries(rows.map(r => [r.assetClass, shareText(r)])) : {};
  // The form keeps what is typed; it reads the saved policy again each time the screen opens.
  return <Editor policy={policy} current={current} />;
}
