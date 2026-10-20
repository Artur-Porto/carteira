import { useState } from 'react';
import { institutionFor, savePosition, type Draft } from '../../data/entries';
import { db } from '../../data/instance';
import { addYears } from '../../domain/calendar';
import { toCents } from '../../domain/decimal';
import type { Market } from '../../domain/market';
import { ASSET_CLASS_LABELS, BUCKET_LABELS } from '../../domain/policy';
import {
  ASSET_CLASSES,
  BUCKETS,
  instrumentFamily,
  type AssetClass,
  type Bucket,
  type Indexer,
  type Institution,
  type InstrumentType,
  type IsoDate,
  type Liquidity,
  type Position,
} from '../../domain/types';
import { marketPrice } from '../../domain/valuation';
import { CheckField, DateField, NumberField, SelectField, TextField } from '../components/fields';
import { formatCents, formatDate } from '../format';
import { decimalBr, readCents, readDecimal } from '../input';
import { INDEXER_LABELS, INSTRUMENT_LABELS, LIQUIDITY_LABELS } from '../labels';
import { usePortfolio } from '../hooks';
import { rateText } from '../positionText';
import { goBack, hrefFor, positionHref } from '../routes';

const GROUPS: readonly (readonly [string, readonly InstrumentType[]])[] = [
  ['Renda fixa de banco', ['CDB', 'RDB', 'LCI', 'LCA']],
  [
    'Tesouro Direto',
    ['TesouroSelic', 'TesouroReserva', 'TesouroPrefixado', 'TesouroPrefixadoJuros', 'TesouroIPCA', 'TesouroIPCAJuros', 'TesouroEducaMais', 'TesouroRendaMais', 'TesouroIGPMJuros'],
  ],
  ['Bolsa', ['Acao', 'FII', 'ETF', 'BDR']],
  ['Cripto', ['Cripto']],
];

const BANK: readonly InstrumentType[] = ['CDB', 'RDB', 'LCI', 'LCA'];
const TESOURO = 'Tesouro Nacional';

/** The indexer each Tesouro bond follows; IGP-M has none of the app's indexers. */
const TESOURO_INDEXER: Partial<Record<InstrumentType, Indexer | null>> = {
  TesouroSelic: 'SELIC',
  TesouroReserva: 'SELIC',
  TesouroPrefixado: 'PRE',
  TesouroPrefixadoJuros: 'PRE',
  TesouroIPCA: 'IPCA',
  TesouroIPCAJuros: 'IPCA',
  TesouroEducaMais: 'IPCA',
  TesouroRendaMais: 'IPCA',
  TesouroIGPMJuros: null,
};

const RATE_LABELS: Record<Indexer, string> = {
  CDI: 'Percentual do CDI',
  SELIC: 'Taxa acima da Selic, ao ano',
  IPCA: 'Taxa acima do IPCA, ao ano',
  PRE: 'Taxa ao ano',
};

/** SPEC classes: IPCA+ up to 5 years is medium term, longer is long term. */
function suggestedClass(type: InstrumentType, indexer: Indexer | null, maturity: IsoDate, today: IsoDate): AssetClass {
  switch (type) {
    case 'Acao':
    case 'ETF':
      return 'acoesBrasil';
    case 'FII':
      return 'fiis';
    case 'BDR':
      return 'exterior';
    case 'Cripto':
      return 'cripto';
    default:
      if (indexer === 'PRE') return 'rfPrefixada';
      if (indexer === 'IPCA' || type === 'TesouroIGPMJuros') return maturity && maturity > addYears(today, 5) ? 'rfIpcaLonga' : 'rfIpcaCurta';
      return 'rfPosFixada';
  }
}

interface State {
  bucket: Bucket;
  type: InstrumentType;
  assetClass: AssetClass;
  classTouched: boolean;
  name: string;
  nameTouched: boolean;
  institution: string;
  fgc: boolean;
  indexer: Indexer | '';
  rate: string;
  maturity: string;
  liquidity: Liquidity;
  ticker: string;
  date: string;
  amount: string;
  quantity: string;
  fees: string;
}

function suggestedName(s: State): string {
  const family = instrumentFamily(s.type);
  if (family === 'market') return s.ticker.trim().toUpperCase();
  if (s.type === 'TesouroReserva') return 'Tesouro Reserva';
  if (family === 'bond') return s.maturity ? `${INSTRUMENT_LABELS[s.type]} ${s.maturity.slice(0, 4)}` : INSTRUMENT_LABELS[s.type];
  const rate = s.indexer ? rateText({ indexer: s.indexer, rate: readDecimal(s.rate, 4) }) : null;
  return [INSTRUMENT_LABELS[s.type], s.institution.trim(), rate].filter(Boolean).join(' ');
}

/** Fields that follow from the instrument type, applied when the type changes. */
function withType(s: State, type: InstrumentType, today: IsoDate): State {
  const next: State = { ...s, type };
  if (BANK.includes(type)) {
    next.indexer = s.indexer || 'CDI';
    if (!s.rate && next.indexer === 'CDI') next.rate = '100';
    if (s.liquidity === 'bolsa') next.liquidity = 'diaria';
    next.fgc = true;
  } else if (instrumentFamily(type) === 'market') {
    next.indexer = '';
    next.rate = '';
    next.liquidity = 'bolsa';
    next.maturity = '';
    next.fgc = false;
  } else {
    next.indexer = TESOURO_INDEXER[type] ?? '';
    next.rate = type === 'TesouroReserva' ? '0' : s.type === type ? s.rate : '';
    next.liquidity = 'diaria';
    next.institution = TESOURO;
    next.fgc = false;
    if (type === 'TesouroReserva') next.maturity = '';
  }
  return refresh(next, today);
}

function refresh(s: State, today: IsoDate): State {
  const assetClass = s.classTouched ? s.assetClass : s.bucket === 'reserva' ? 'rfPosFixada' : suggestedClass(s.type, s.indexer || null, s.maturity, today);
  return { ...s, assetClass };
}

interface Errors {
  [field: string]: string | undefined;
}

function validate(s: State, isNew: boolean, today: IsoDate): Errors {
  const e: Errors = {};
  const family = instrumentFamily(s.type);
  if (!s.name.trim()) e['name'] = 'Dê um nome à posição.';
  if (family === 'market' && !/^[A-Z0-9]{2,12}$/.test(s.ticker.trim().toUpperCase())) e['ticker'] = 'Informe o código, como BOVA11 ou BTC.';
  if (BANK.includes(s.type)) {
    if (!s.indexer) e['indexer'] = 'Escolha o indexador.';
    const rate = readDecimal(s.rate, 4);
    if (rate === null || Number(rate) <= 0) e['rate'] = 'Informe a taxa contratada, como 110 ou 12,5.';
  }
  if (family === 'bond' && !s.maturity) e['maturity'] = 'Escolha o vencimento do título.';
  if (s.rate && readDecimal(s.rate, 4) === null) e['rate'] = 'Taxa inválida. Use vírgula para as casas decimais.';
  if (isNew) {
    if (!s.date) e['date'] = 'Informe a data.';
    else if (s.date > today) e['date'] = 'A data não pode ser futura.';
    const amount = readCents(s.amount);
    if (amount === null || amount <= 0) e['amount'] = 'Informe o valor, como 1.500,00.';
    if (family !== 'amount') {
      const q = readDecimal(s.quantity, 8);
      if (q === null || Number(q) <= 0) e['quantity'] = 'Informe a quantidade.';
    }
    if (s.fees && readCents(s.fees) === null) e['fees'] = 'Valor inválido.';
  }
  return e;
}

function lookupHint(s: State, market: Market): string | null {
  const ticker = s.ticker.trim().toUpperCase();
  if (instrumentFamily(s.type) !== 'market' || !ticker) return null;
  const quote = marketPrice({ ticker, instrumentType: s.type }, market);
  if (s.type === 'Cripto') {
    return quote ? `Cotação de ${formatCents(toCents(quote.price))} em ${formatDate(quote.date!)}.` : 'Sem cotação no arquivo de cripto: o valor ficará pelo aplicado.';
  }
  const item = market.b3.get(ticker);
  if (!item || !quote) return market.b3AsOf ? `Não está no fechamento da B3 de ${formatDate(market.b3AsOf)}: o valor ficará pelo aplicado.` : null;
  return `${item.name} ${item.spec} · fechamento de ${formatCents(toCents(quote.price))} em ${formatDate(quote.date!)}.`;
}

const readHint = (cents: number | null) => (cents !== null && cents > 0 ? `Lido como ${formatCents(cents)}.` : undefined);

function Editor({ initial, existing, institutions, market, today }: { initial: State; existing: Position | undefined; institutions: Institution[]; market: Market; today: IsoDate }) {
  const [s, setS] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const isNew = !existing;
  const family = instrumentFamily(s.type);
  const bank = BANK.includes(s.type);
  const parent = existing ? positionHref(existing.id) : s.bucket === 'reserva' ? hrefFor('reserva') : hrefFor('carteira');

  const update = (patch: Partial<State>) =>
    setS(prev => {
      const next = refresh({ ...prev, ...patch }, today);
      return next.nameTouched ? next : { ...next, name: suggestedName(next) };
    });
  const changeType = (type: InstrumentType) =>
    setS(prev => {
      const next = withType(prev, type, today);
      return next.nameTouched ? next : { ...next, name: suggestedName(next) };
    });

  const bonds = [...market.bonds.values()].filter(b => b.type === s.type);
  const maturityOptions: [string, string][] = bonds.map(b => [b.maturity, `${b.name}, vence em ${formatDate(b.maturity)}`]);
  if (s.maturity && !maturityOptions.some(([m]) => m === s.maturity)) maturityOptions.push([s.maturity, `Vence em ${formatDate(s.maturity)}`]);

  async function submit() {
    const found = validate(s, isNew, today);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setBusy(true);
    try {
      const institutionId = await institutionFor(db, s.institution, s.fgc);
      const draft: Draft<Position> = {
        id: existing?.id,
        bucket: s.bucket,
        assetClass: s.assetClass,
        instrumentType: s.type,
        name: s.name.trim(),
        institutionId,
        indexer: s.indexer || null,
        rate: readDecimal(s.rate, 4),
        startDate: existing ? existing.startDate : s.date,
        maturityDate: s.maturity || null,
        liquidity: s.liquidity,
        ticker: family === 'market' ? s.ticker.trim().toUpperCase() : null,
      };
      await savePosition(
        db,
        draft,
        isNew
          ? {
              date: s.date,
              type: family === 'amount' ? 'deposit' : 'buy',
              amountCents: readCents(s.amount)!,
              quantity: family === 'amount' ? null : readDecimal(s.quantity, 8),
              feesCents: readCents(s.fees) ?? 0,
              note: '',
            }
          : undefined,
      );
      goBack(parent);
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
      <datalist id="institutions">
        {institutions.map(i => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>
      <label className="field">
        Tipo
        <select value={s.type} onChange={e => changeType(e.target.value as InstrumentType)}>
          {GROUPS.map(([group, types]) => (
            <optgroup key={group} label={group}>
              {types.map(t => (
                <option key={t} value={t}>
                  {INSTRUMENT_LABELS[t]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {family === 'market' && (
        <TextField
          label={s.type === 'Cripto' ? 'Código do criptoativo' : 'Código na bolsa'}
          value={s.ticker}
          onChange={ticker => update({ ticker })}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder={s.type === 'Cripto' ? 'BTC' : 'BOVA11'}
          hint={lookupHint(s, market)}
          error={errors['ticker']}
        />
      )}

      {family === 'bond' && s.type !== 'TesouroReserva' && (
        maturityOptions.length > 0 ? (
          <SelectField
            label="Título"
            value={s.maturity}
            onChange={maturity => update({ maturity })}
            options={[['', 'Escolha o vencimento'], ...maturityOptions]}
            error={errors['maturity']}
          />
        ) : (
          <DateField label="Vencimento" value={s.maturity} onChange={maturity => update({ maturity })} error={errors['maturity']} />
        )
      )}

      {bank && (
        <>
          <TextField
            label="Banco emissor"
            value={s.institution}
            onChange={institution => update({ institution })}
            list="institutions"
            autoComplete="off"
            hint="O limite do FGC conta por conglomerado."
          />
          <CheckField label="Coberto pelo FGC" checked={s.fgc} onChange={fgc => update({ fgc })} />
          <SelectField
            label="Indexador"
            value={s.indexer || 'CDI'}
            onChange={indexer => update({ indexer, rate: indexer === 'CDI' && !s.rate ? '100' : s.rate })}
            options={(['CDI', 'PRE', 'IPCA'] as const).map(i => [i, INDEXER_LABELS[i]] as const)}
            error={errors['indexer']}
          />
        </>
      )}

      {s.indexer && s.type !== 'TesouroReserva' && (
        <NumberField
          label={family === 'bond' ? 'Taxa da compra, ao ano (opcional)' : RATE_LABELS[s.indexer]}
          value={s.rate}
          onChange={rate => update({ rate })}
          placeholder={s.indexer === 'CDI' ? '110' : '6,5'}
          error={errors['rate']}
        />
      )}

      {bank && (
        <>
          <SelectField
            label="Liquidez"
            value={s.liquidity}
            onChange={liquidity => update({ liquidity })}
            options={(['diaria', 'vencimento'] as const).map(l => [l, LIQUIDITY_LABELS[l]] as const)}
          />
          <DateField
            label={s.liquidity === 'diaria' ? 'Vencimento (opcional)' : 'Vencimento'}
            value={s.maturity}
            onChange={maturity => update({ maturity })}
          />
        </>
      )}

      {family === 'market' && (
        <TextField label="Corretora (opcional)" value={s.institution} onChange={institution => update({ institution })} list="institutions" autoComplete="off" />
      )}

      <SelectField
        label="Balde"
        value={s.bucket}
        onChange={bucket => update({ bucket, classTouched: bucket === 'reserva' ? false : s.classTouched })}
        options={BUCKETS.map(b => [b, BUCKET_LABELS[b]] as const)}
        hint="A reserva é o dinheiro de emergência, com liquidez diária."
      />
      <SelectField
        label="Classe"
        value={s.assetClass}
        onChange={assetClass => setS(prev => ({ ...prev, assetClass, classTouched: true }))}
        options={ASSET_CLASSES.map(c => [c, ASSET_CLASS_LABELS[c]] as const)}
        hint={s.type === 'ETF' ? 'ETF de ações de fora do Brasil, como os de S&P 500, vai em Exterior.' : undefined}
      />
      <TextField label="Nome" value={s.name} onChange={name => setS(prev => ({ ...prev, name, nameTouched: true }))} error={errors['name']} />

      {isNew && (
        <fieldset className="group">
          <legend>{family === 'amount' ? 'Primeira aplicação' : 'Primeira compra'}</legend>
          <DateField label={family === 'amount' ? 'Data da aplicação' : 'Data da compra'} value={s.date} max={today} onChange={date => update({ date })} error={errors['date']} />
          {family !== 'amount' && (
            <NumberField
              label={family === 'bond' ? 'Quantidade de títulos' : 'Quantidade'}
              value={s.quantity}
              onChange={quantity => update({ quantity })}
              hint={readDecimal(s.quantity, 8) ? `Lido como ${decimalBr(readDecimal(s.quantity, 8)!)}.` : undefined}
              error={errors['quantity']}
            />
          )}
          <NumberField
            label={family === 'amount' ? 'Valor aplicado' : 'Valor pago, sem os custos'}
            value={s.amount}
            onChange={amount => update({ amount })}
            placeholder="0,00"
            hint={readHint(readCents(s.amount)) ?? (family === 'amount' ? 'Sem o histórico das aplicações, informe o saldo de hoje; o saldo do banco corrige a estimativa depois.' : undefined)}
            error={errors['amount']}
          />
          {family === 'market' && (
            <NumberField label="Custos da operação (opcional)" value={s.fees} onChange={fees => update({ fees })} placeholder="0,00" error={errors['fees']} />
          )}
        </fieldset>
      )}

      <button type="submit" className="button primary" disabled={busy}>
        {isNew ? 'Adicionar posição' : 'Salvar'}
      </button>
      <button type="button" className="button" onClick={() => goBack(parent)}>
        Cancelar
      </button>
    </form>
  );
}

export function PositionForm({ id, bucket = 'livre' }: { id?: string; bucket?: Bucket }) {
  const p = usePortfolio();
  if (!p) return null;
  const existing = id ? p.positions.find(x => x.id === id) : undefined;
  if (id && !existing) return <p className="card">Esta posição não existe mais.</p>;
  const institution = existing?.institutionId ? (p.institutions.find(i => i.id === existing.institutionId) ?? null) : null;
  const base: State = existing
    ? {
        bucket: existing.bucket,
        type: existing.instrumentType,
        assetClass: existing.assetClass,
        classTouched: true,
        name: existing.name,
        nameTouched: true,
        institution: institution?.name ?? '',
        fgc: institution?.fgcCovered ?? false,
        indexer: existing.indexer ?? '',
        rate: existing.rate ? existing.rate.replace('.', ',') : '',
        maturity: existing.maturityDate ?? '',
        liquidity: existing.liquidity,
        ticker: existing.ticker ?? '',
        date: '',
        amount: '',
        quantity: '',
        fees: '',
      }
    : withType(
        {
          bucket,
          type: 'CDB',
          assetClass: 'rfPosFixada',
          classTouched: false,
          name: '',
          nameTouched: false,
          institution: '',
          fgc: true,
          indexer: 'CDI',
          rate: '100',
          maturity: '',
          liquidity: 'diaria',
          ticker: '',
          date: p.today,
          amount: '',
          quantity: '',
          fees: '',
        },
        'CDB',
        p.today,
      );
  const initial = existing ? base : { ...base, name: suggestedName(base) };
  return <Editor key={id ?? `nova-${bucket}`} initial={initial} existing={existing} institutions={p.institutions} market={p.market} today={p.today} />;
}
