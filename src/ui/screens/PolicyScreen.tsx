import { useState, type ReactNode } from 'react';
import { savePolicy, setConglomerate } from '../../data/entries';
import { db } from '../../data/instance';
import { dec } from '../../domain/decimal';
import { ASSET_CLASS_LABELS, TERM_OF_CLASS, bandFor, bandsFor, initialPolicy, policyErrors, type PolicyField } from '../../domain/policy';
import { grossByClass } from '../../domain/portfolio';
import { FGC_GUARANTEE, TAX_RULES } from '../../domain/tax';
import { ASSET_CLASSES, SCENARIO_CLASSES, type AssetClass, type Institution, type Policy, type Scenario, type ScenarioClass } from '../../domain/types';
import { allocation } from '../../engine/allocation';
import { scenarioResults, withinTolerance, worstScenario } from '../../engine/scenarios';
import { TILT_HIGH, TILT_LOW, effectiveTargets } from '../../engine/thermometer';
import type { ThermometerFile } from '../../market/files';
import { shareText } from '../components/AllocationBars';
import { CheckField, NumberField, TextField } from '../components/fields';
import { Money } from '../discreet';
import { formatDate, formatPct } from '../format';
import { usePortfolio } from '../hooks';
import { centsInput, readCents, readDecimal } from '../input';

type Field = Exclude<PolicyField, 'targets'> | 'monthlyContribution';
type Errors = Partial<Record<Field | 'targets', string>>;
type Texts = Record<Field, string>;
type ShockTexts = Record<string, Record<ScenarioClass, string>>;
type Draft = Omit<Policy, 'id' | 'bands' | 'createdAt' | 'updatedAt'>;

const SCENARIO_CLASS_LABELS: Record<ScenarioClass, string> = { ...ASSET_CLASS_LABELS, creditoPrivado: 'Crédito privado, só na previdência' };
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
    monthlyContribution: policy.monthlyContributionCents ? centsInput(policy.monthlyContributionCents) : '',
  };
}

const shockTextsOf = (scenarios: readonly Scenario[]): ShockTexts =>
  Object.fromEntries(scenarios.map(s => [s.id, Object.fromEntries(SCENARIO_CLASSES.map(c => [c, pctInput(s.shocks[c] ?? 0)])) as Record<ScenarioClass, string>]));

const pct = (text: string) => {
  const value = readDecimal(text, 2);
  return value === null ? null : Number(value);
};

/** The draft typed so far, with what stops it from being saved. */
function read(texts: Texts, shocks: ShockTexts, tilt: boolean, base: Policy): { draft: Draft | null; errors: Errors; shockErrors: Record<string, string> } {
  const errors: Errors = {};
  const shockErrors: Record<string, string> = {};
  const number = (field: Field, value: number | null) => {
    if (value === null) errors[field] = 'Digite um número, como 12 ou 12,5.';
    return value ?? 0;
  };
  const months = readDecimal(texts.months, 0);
  const monthlyCost = texts.monthlyCost.trim() ? readCents(texts.monthlyCost) : 0;
  const monthly = texts.monthlyContribution.trim() ? readCents(texts.monthlyContribution) : 0;
  if (monthly !== null && monthly < 0) errors.monthlyContribution = 'O aporte não pode ser negativo.';
  const scenarios = base.scenarios.map(s => ({
    ...s,
    shocks: Object.fromEntries(
      SCENARIO_CLASSES.map(cls => {
        const value = pct(shocks[s.id]?.[cls] ?? '');
        if (value === null || value < -100 || value > 100) shockErrors[`${s.id}:${cls}`] = 'Use um choque de -100 a 100.';
        return [cls, value ?? 0];
      }),
    ) as Record<ScenarioClass, number>,
  }));
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
    scenarios,
    tiltEnabled: tilt,
    maxDrawdown: number('maxDrawdown', pct(texts.maxDrawdown)),
    monthlyContributionCents: number('monthlyContribution', monthly),
  };
  if (Object.keys(errors).length > 0 || Object.keys(shockErrors).length > 0) return { draft: null, errors, shockErrors };
  return { draft, errors: policyErrors(draft), shockErrors };
}

function Issuers({ institutions }: { institutions: readonly Institution[] }) {
  const banks = institutions.filter(i => i.fgcCovered);
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(banks.map(i => [i.id, i.conglomerate])));
  const [saved, setSaved] = useState<string | null>(null);
  if (banks.length === 0) return null;
  return (
    <>
      <h3>Conglomerado de cada banco</h3>
      <p className="muted small">Bancos do mesmo grupo somam no limite do FGC. Use o mesmo nome de conglomerado para eles.</p>
      {banks.map(bank => (
        <div key={bank.id} className="inline-fields two">
          <TextField
            label={bank.name}
            value={names[bank.id] ?? ''}
            onChange={v => {
              setNames(prev => ({ ...prev, [bank.id]: v }));
              setSaved(null);
            }}
            maxLength={200}
          />
          <button
            type="button"
            className="button small-button"
            disabled={!(names[bank.id] ?? '').trim() || names[bank.id] === bank.conglomerate}
            onClick={async () => {
              await setConglomerate(db, bank.id, names[bank.id]!);
              setSaved(bank.id);
            }}
          >
            Salvar
          </button>
        </div>
      ))}
      {saved && (
        <p role="status" className="muted small">
          Conglomerado salvo.
        </p>
      )}
    </>
  );
}

function Editor({
  policy,
  current,
  thermometer,
  institutions,
}: {
  policy: Policy;
  current: Partial<Record<AssetClass, string>>;
  thermometer: ThermometerFile | undefined;
  institutions: readonly Institution[];
}) {
  const [texts, setTexts] = useState<Texts>(() => textsOf(policy));
  const [shocks, setShocks] = useState<ShockTexts>(() => shockTextsOf(policy.scenarios));
  const [tilt, setTilt] = useState(policy.tiltEnabled);
  const [shown, setShown] = useState<Errors>({});
  const [shockErrors, setShockErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const set = (field: Field) => (value: string) => {
    setTexts(prev => ({ ...prev, [field]: value }));
    setShown(prev => ({ ...prev, [field]: undefined, targets: undefined }));
    setSaved(false);
  };

  const targets = Object.fromEntries(ASSET_CLASSES.map(cls => [cls, pct(texts[cls])])) as Record<AssetClass, number | null>;
  const typed = ASSET_CLASSES.every(cls => targets[cls] !== null && targets[cls]! >= 0);
  const sumHundredths = ASSET_CLASSES.reduce((sum, cls) => sum + Math.round((targets[cls] ?? 0) * 100), 0);
  const complete = typed && sumHundredths === 10_000;
  const termSum = (term: 'medio' | 'longo') =>
    ASSET_CLASSES.filter(cls => TERM_OF_CLASS[cls] === term).reduce((sum, cls) => sum + Math.round((targets[cls] ?? 0) * 100), 0) / 100;
  const draftScenarios = policy.scenarios.map(s => ({
    ...s,
    shocks: Object.fromEntries(SCENARIO_CLASSES.map(c => [c, pct(shocks[s.id]?.[c] ?? '') ?? 0])) as Record<ScenarioClass, number>,
  }));
  const results = complete ? scenarioResults(Object.fromEntries(ASSET_CLASSES.map(cls => [cls, dec(targets[cls]!)])), draftScenarios) : [];
  const worst = worstScenario(results);
  const moved = complete ? effectiveTargets({ targets: targets as Record<AssetClass, number>, bands: bandsFor(targets as Record<AssetClass, number>), tiltEnabled: tilt }, thermometer) : null;
  const movedWorst = moved?.applied
    ? worstScenario(scenarioResults(Object.fromEntries(ASSET_CLASSES.map(cls => [cls, dec(moved.targets[cls])])), draftScenarios))
    : undefined;
  const tolerance = pct(texts.maxDrawdown);
  const issuerPct = pct(texts.issuerFgcPct);
  const cost = texts.monthlyCost.trim() ? readCents(texts.monthlyCost) : 0;
  const months = readDecimal(texts.months, 0);
  const loss = (r: { pct: { abs: () => { toFixed: (n: number) => string } } }) => formatPct(Number(r.pct.abs().toFixed(2)));

  const field = (f: Field, label: string, hint?: ReactNode) => <NumberField label={label} value={texts[f]} onChange={set(f)} hint={hint} error={shown[f] ?? null} />;

  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        const result = read(texts, shocks, tilt, policy);
        setShown(result.errors);
        setShockErrors(result.shockErrors);
        if (!result.draft || Object.keys(result.errors).length > 0) return;
        await savePolicy(db, result.draft);
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
          const shifted = moved?.applied && moved.targets[cls] !== target ? moved.targets[cls] : null;
          return (
            <div key={cls}>
              {field(
                cls,
                ASSET_CLASS_LABELS[cls],
                <>
                  {band ? `Faixa de ${formatPct(band.min)} a ${formatPct(band.max)}` : 'Faixa: digite o alvo'}
                  {current[cls] && ` · hoje ${current[cls]}`}
                  {` · ${TERM_OF_CLASS[cls] === 'medio' ? 'médio prazo' : 'longo prazo'}`}
                  {shifted !== null && ` · com o termômetro, ${formatPct(shifted)}`}
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

      <section className="card" aria-labelledby="policy-thermometer-title">
        <h2 id="policy-thermometer-title">Termômetro de taxas</h2>
        <CheckField
          label="Usar o termômetro nos alvos"
          hint={`No percentil ${TILT_HIGH} ou acima, o alvo da classe sobe metade da faixa; no ${TILT_LOW} ou abaixo, desce. A diferença sai da pós-fixada ou volta para ela.`}
          checked={tilt}
          onChange={v => {
            setTilt(v);
            setSaved(false);
          }}
        />
        {thermometer ? (
          <ul className="rows">
            {(moved ?? effectiveTargets(policy, thermometer)).tilts.map(t => (
              <li key={t.assetClass}>
                <span>
                  <span className="name">{ASSET_CLASS_LABELS[t.assetClass]}</span>
                  <span className="muted small">
                    {t.bond}, {t.rate?.replace('.', ',')}% ao ano: percentil {t.percentile?.toLocaleString('pt-BR')} em 10 anos.{' '}
                    {!tilt || !moved?.applied || t.shiftPct === 0
                      ? 'O alvo fica onde está.'
                      : `O alvo ${t.shiftPct > 0 ? 'sobe' : 'desce'} ${Math.abs(t.shiftPct).toLocaleString('pt-BR')} ${Math.abs(t.shiftPct) === 1 ? 'ponto' : 'pontos'}.`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">O termômetro aparece quando os dados de mercado chegarem.</p>
        )}
        {thermometer && <p className="muted small">Taxas do Tesouro Direto de {formatDate(thermometer.asOf)}.</p>}
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
        <Issuers institutions={institutions} />
      </section>

      <section className="card" aria-labelledby="policy-risk-title">
        <h2 id="policy-risk-title">Cenários e tolerância a perdas</h2>
        {field('maxDrawdown', 'Perda máxima no pior cenário, em %')}
        {worst ? (
          <p>
            O pior cenário com estes alvos é {worst.scenario.name}, com perda de {loss(worst)}
            {tolerance === null ? '.' : withinTolerance(worst, tolerance) ? ', dentro da tolerância.' : ', acima da tolerância.'}
            {movedWorst && ` Com o termômetro, ${loss(movedWorst)}.`}
          </p>
        ) : (
          <p className="muted">O pior cenário aparece quando os alvos somarem 100%.</p>
        )}
        {results.length > 0 && (
          <dl className="rows">
            {results.map(r => (
              <div key={r.scenario.id}>
                <dt>{r.scenario.name}</dt>
                <dd className="num">{formatPct(Number(r.pct.toFixed(2)))}</dd>
              </div>
            ))}
          </dl>
        )}
        {policy.scenarios.map(s => (
          <details key={s.id}>
            <summary>Choques de {s.name}</summary>
            <p className="muted small">Variação de cada classe no cenário, em %: -20 é uma queda de 20%.</p>
            {SCENARIO_CLASSES.map(cls => (
              <NumberField
                key={cls}
                label={SCENARIO_CLASS_LABELS[cls]}
                value={shocks[s.id]?.[cls] ?? ''}
                inputMode="text"
                onChange={v => {
                  setShocks(prev => ({ ...prev, [s.id]: { ...prev[s.id]!, [cls]: v } }));
                  setShockErrors(prev => ({ ...prev, [`${s.id}:${cls}`]: '' }));
                  setSaved(false);
                }}
                error={shockErrors[`${s.id}:${cls}`] || null}
              />
            ))}
          </details>
        ))}
        <p className="muted small">Os choques são premissas inspiradas em crises passadas, não previsões.</p>
      </section>

      <section className="card" aria-labelledby="policy-rebalance-title">
        <h2 id="policy-rebalance-title">Rebalanceamento</h2>
        {field(
          'monthlyContribution',
          'Aporte mensal previsto',
          'Diz em quantos meses os aportes trazem uma classe de volta à faixa. A venda só é sugerida quando levariam mais de 6 meses.',
        )}
      </section>

      <button type="submit" className="button primary">
        Salvar política
      </button>
      {saved && (
        <p role="status" className="muted">
          Política salva.
        </p>
      )}
      {(Object.values(shown).some(Boolean) || Object.values(shockErrors).some(Boolean)) && <p className="error">Corrija os campos marcados para salvar.</p>}
      <button
        type="button"
        className="button"
        onClick={() => {
          const initial = initialPolicy(new Date().toISOString(), policy.reserve.monthlyCostCents);
          setTexts({ ...textsOf(initial), monthlyContribution: texts.monthlyContribution });
          setShocks(shockTextsOf(initial.scenarios));
          setTilt(initial.tiltEnabled);
          setShown({});
          setShockErrors({});
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
  const rows = allocation(grossByClass(p.value), p.activePolicy.targets, p.activePolicy.bands);
  const current = p.value.free.grossCents > 0 ? Object.fromEntries(rows.map(r => [r.assetClass, shareText(r)])) : {};
  // The form keeps what is typed; it reads the saved policy again each time the screen opens.
  return <Editor policy={policy} current={current} thermometer={p.files.thermometer} institutions={p.institutions} />;
}
