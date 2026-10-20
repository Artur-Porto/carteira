import { useState } from 'react';
import { deletePensionBalance, deletePensionPlan, savePensionBalance, savePensionPlan, type Draft } from '../../data/entries';
import { db } from '../../data/instance';
import { latestBalance } from '../../domain/pension';
import { ASSET_CLASS_LABELS } from '../../domain/policy';
import { SCENARIO_CLASSES, TAX_REGIMES, type IsoDate, type PensionPlan, type ScenarioClass, type TaxRegime } from '../../domain/types';
import { ConfirmButton } from '../components/ConfirmButton';
import { DateField, NumberField, SelectField, TextField } from '../components/fields';
import { Money } from '../discreet';
import { formatCents, formatDate } from '../format';
import { centsInput, readCents, readDecimal } from '../input';
import { TAX_REGIME_LABELS } from '../labels';
import { usePortfolio } from '../hooks';
import { goBack, hrefFor } from '../routes';

const BACK = hrefFor('previdencia');
const CLASS_LABELS: Record<ScenarioClass, string> = { ...ASSET_CLASS_LABELS, creditoPrivado: 'Crédito privado' };
const pctText = (n: number) => String(n).replace('.', ',');
const readPct = (text: string) => {
  const v = readDecimal(text, 4);
  return v === null ? null : Number(v);
};

interface Step {
  years: string;
  pct: string;
}

function PlanEditor({ plan, today }: { plan: PensionPlan | undefined; today: IsoDate }) {
  const [name, setName] = useState(plan?.name ?? 'PGBL da empresa');
  const [startDate, setStartDate] = useState(plan?.startDate ?? '');
  const [own, setOwn] = useState(plan ? centsInput(plan.ownMonthlyCents) : '');
  const [match, setMatch] = useState(plan ? pctText(plan.matchPct) : '100');
  const [steps, setSteps] = useState<Step[]>(plan?.vestingTable.map(s => ({ years: String(s.years), pct: pctText(s.pct) })) ?? []);
  const [composition, setComposition] = useState<Record<ScenarioClass, string>>(
    () => Object.fromEntries(SCENARIO_CLASSES.map(c => [c, plan?.composition[c] !== undefined ? pctText(plan.composition[c]!) : ''])) as Record<ScenarioClass, string>,
  );
  const [admin, setAdmin] = useState(plan ? pctText(plan.fees.adminPct) : '');
  const [loading, setLoading] = useState(plan ? pctText(plan.fees.loadingPct) : '0');
  const [regime, setRegime] = useState<TaxRegime>(plan?.taxRegime ?? 'indefinido');
  const [balanceDate, setBalanceDate] = useState(today);
  const [ownBalance, setOwnBalance] = useState('');
  const [companyBalance, setCompanyBalance] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const compositionTotal = SCENARIO_CLASSES.reduce((sum, c) => sum + (readPct(composition[c]) ?? 0), 0);

  async function submit() {
    const e: Record<string, string> = {};
    if (!name.trim()) e['name'] = 'Dê um nome ao plano.';
    if (!startDate) e['startDate'] = 'Informe quando você entrou no plano.';
    else if (startDate > today) e['startDate'] = 'A data não pode ser futura.';
    const ownCents = readCents(own);
    if (ownCents === null || ownCents < 0) e['own'] = 'Informe a contribuição, como 800,00.';
    const matchPct = readPct(match);
    if (matchPct === null || matchPct < 0) e['match'] = 'Informe a contrapartida, como 100.';
    const table = steps
      .filter(s => s.years.trim() || s.pct.trim())
      .map(s => {
        const years = readDecimal(s.years, 0);
        return { years: years === null ? Number.NaN : Number(years), pct: readPct(s.pct) };
      });
    if (table.some(s => !Number.isInteger(s.years) || s.years < 0 || s.pct === null || s.pct < 0 || s.pct > 100)) {
      e['steps'] = 'Cada degrau precisa de anos inteiros e de um percentual entre 0 e 100.';
    }
    const filled = SCENARIO_CLASSES.filter(c => composition[c].trim());
    if (filled.some(c => readPct(composition[c]) === null)) e['composition'] = 'Percentual inválido.';
    else if (filled.length > 0 && Math.abs(compositionTotal - 100) > 0.01) e['composition'] = `A composição soma ${pctText(Math.round(compositionTotal * 100) / 100)}%, e precisa somar 100%.`;
    const adminPct = admin.trim() ? readPct(admin) : 0;
    const loadingPct = loading.trim() ? readPct(loading) : 0;
    if (adminPct === null || adminPct < 0 || loadingPct === null || loadingPct < 0) e['fees'] = 'Taxa inválida.';
    const ownStart = ownBalance.trim() ? readCents(ownBalance) : 0;
    const companyStart = companyBalance.trim() ? readCents(companyBalance) : 0;
    if (!plan && (ownStart === null || companyStart === null || ownStart < 0 || companyStart < 0)) e['balance'] = 'Saldo inválido.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const draft: Draft<PensionPlan> = {
      id: plan?.id,
      name: name.trim(),
      startDate,
      ownMonthlyCents: ownCents!,
      matchPct: matchPct!,
      vestingTable: table.map(s => ({ years: s.years, pct: s.pct! })).sort((a, b) => a.years - b.years),
      balances: plan?.balances ?? (ownStart! + companyStart! > 0 ? [{ date: balanceDate, ownCents: ownStart!, companyCents: companyStart! }] : []),
      composition: Object.fromEntries(filled.map(c => [c, readPct(composition[c])!])),
      fees: { adminPct: adminPct!, loadingPct: loadingPct! },
      taxRegime: regime,
    };
    setBusy(true);
    try {
      await savePensionPlan(db, draft);
      goBack(BACK);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card form"
      onSubmit={e => {
        e.preventDefault();
        void submit();
      }}
    >
      <TextField label="Nome do plano" value={name} onChange={setName} error={errors['name']} />
      <DateField label="Entrada no plano" value={startDate} max={today} onChange={setStartDate} error={errors['startDate']} hint="A carência conta os anos a partir desta data." />
      <NumberField label="Sua contribuição mensal" value={own} onChange={setOwn} placeholder="0,00" error={errors['own']} hint={readCents(own) ? `Lido como ${formatCents(readCents(own)!)}.` : undefined} />
      <NumberField label="Contrapartida da empresa, em % da sua contribuição" value={match} onChange={setMatch} error={errors['match']} />

      <fieldset className="group">
        <legend>Tabela de carência</legend>
        <p className="muted small">Anos de plano e o percentual da parte da empresa liberado em cada degrau. Sem degraus intermediários, vale o último atingido.</p>
        {steps.map((step, i) => (
          <div key={i} className="inline-fields">
            <NumberField label="Anos" value={step.years} onChange={years => setSteps(s => s.map((x, j) => (j === i ? { ...x, years } : x)))} />
            <NumberField label="% liberado" value={step.pct} onChange={pct => setSteps(s => s.map((x, j) => (j === i ? { ...x, pct } : x)))} />
            <button type="button" className="icon-text-button" aria-label={`Remover o degrau ${i + 1}`} onClick={() => setSteps(s => s.filter((_, j) => j !== i))}>
              Remover
            </button>
          </div>
        ))}
        {errors['steps'] && <p className="field-error">{errors['steps']}</p>}
        <button type="button" className="button" onClick={() => setSteps(s => [...s, { years: '', pct: '' }])}>
          Adicionar degrau
        </button>
      </fieldset>

      {!plan && (
        <fieldset className="group">
          <legend>Saldo atual (opcional)</legend>
          <DateField label="Data do saldo" value={balanceDate} max={today} onChange={setBalanceDate} />
          <NumberField label="Parte própria" value={ownBalance} onChange={setOwnBalance} placeholder="0,00" />
          <NumberField label="Parte da empresa" value={companyBalance} onChange={setCompanyBalance} placeholder="0,00" error={errors['balance']} />
        </fieldset>
      )}

      <fieldset className="group">
        <legend>Composição do fundo (opcional)</legend>
        <p className="muted small">Em percentual de cada classe, para o teste de cenários. Deve somar 100%.</p>
        {SCENARIO_CLASSES.map(c => (
          <NumberField key={c} label={CLASS_LABELS[c]} value={composition[c]} onChange={v => setComposition(prev => ({ ...prev, [c]: v }))} placeholder="0" />
        ))}
        <p className="small">Soma: {pctText(Math.round(compositionTotal * 100) / 100)}%</p>
        {errors['composition'] && <p className="field-error">{errors['composition']}</p>}
      </fieldset>

      <NumberField label="Taxa de administração, % ao ano" value={admin} onChange={setAdmin} placeholder="0,8" />
      <NumberField label="Taxa de carregamento, %" value={loading} onChange={setLoading} placeholder="0" error={errors['fees']} />
      <SelectField label="Regime de tributação" value={regime} onChange={setRegime} options={TAX_REGIMES.map(r => [r, TAX_REGIME_LABELS[r]] as const)} />

      <button type="submit" className="button primary" disabled={busy}>
        {plan ? 'Salvar' : 'Cadastrar plano'}
      </button>
      <button type="button" className="button" onClick={() => goBack(BACK)}>
        Cancelar
      </button>
      {plan && (
        <ConfirmButton
          label="Excluir plano"
          confirmLabel="Excluir de vez"
          warning="O plano sai do app, com todos os saldos informados."
          onConfirm={async () => {
            await deletePensionPlan(db, plan.id);
            goBack(BACK);
          }}
        />
      )}
    </form>
  );
}

export function PensionPlanForm({ id }: { id: string | null }) {
  const p = usePortfolio();
  if (!p) return null;
  const plan = id ? p.pensionPlans.find(x => x.id === id) : undefined;
  if (id && !plan) return <p className="card">Este plano não existe mais.</p>;
  return <PlanEditor key={id ?? 'novo'} plan={plan} today={p.today} />;
}

function BalanceEditor({ plan, today }: { plan: PensionPlan; today: IsoDate }) {
  const last = latestBalance(plan);
  const [date, setDate] = useState(today);
  const [own, setOwn] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const ownCents = readCents(own);
    const companyCents = readCents(company);
    if (!date || date > today) return setError('Informe uma data até hoje.');
    if (ownCents === null || companyCents === null || ownCents < 0 || companyCents < 0) return setError('Informe as duas partes, como 31.000,00.');
    setBusy(true);
    try {
      await savePensionBalance(db, plan.id, { date, ownCents, companyCents });
      goBack(BACK);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form
        className="card form"
        onSubmit={e => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="muted">{plan.name}</p>
        <p className="small">Use o extrato do plano, com a parte própria e a da empresa separadas.</p>
        <DateField label="Data do saldo" value={date} max={today} onChange={setDate} />
        <NumberField label="Parte própria" value={own} onChange={setOwn} placeholder={last ? centsInput(last.ownCents) : '0,00'} />
        <NumberField label="Parte da empresa" value={company} onChange={setCompany} placeholder={last ? centsInput(last.companyCents) : '0,00'} error={error} />
        <button type="submit" className="button primary" disabled={busy}>
          Salvar saldo
        </button>
        <button type="button" className="button" onClick={() => goBack(BACK)}>
          Cancelar
        </button>
      </form>
      {plan.balances.length > 0 && (
        <section className="card" aria-labelledby="balances-title">
          <h2 id="balances-title">Saldos informados</h2>
          <ul className="rows">
            {[...plan.balances].reverse().map(b => (
              <li key={b.date}>
                <span className="name">{formatDate(b.date)}</span>
                <span className="amount">
                  <Money cents={b.ownCents + b.companyCents} />
                </span>
                <ConfirmButton small label="Apagar" confirmLabel="Apagar este saldo" onConfirm={() => deletePensionBalance(db, plan.id, b.date)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function PensionBalanceForm({ planId }: { planId: string }) {
  const p = usePortfolio();
  if (!p) return null;
  const plan = p.pensionPlans.find(x => x.id === planId);
  if (!plan) return <p className="card">Este plano não existe mais.</p>;
  return <BalanceEditor plan={plan} today={p.today} />;
}
