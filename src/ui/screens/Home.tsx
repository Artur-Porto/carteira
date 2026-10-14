import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/instance';
import type { Bucket, PensionPlan, Position } from '../../domain/types';
import { Money } from '../discreet';
import { formatDateTime } from '../format';

const BACKUP_MAX_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

const costOf = (positions: Position[], bucket: Bucket) =>
  positions.filter(p => p.bucket === bucket).reduce((sum, p) => sum + p.costBasisCents, 0);

/** Own plus company part of each plan's latest balance. */
const pensionOf = (plans: PensionPlan[]) =>
  plans.reduce((sum, plan) => {
    const latest = plan.balances.reduce<PensionPlan['balances'][number] | null>(
      (last, b) => (!last || b.date > last.date ? b : last),
      null,
    );
    return sum + (latest ? latest.ownCents + latest.companyCents : 0);
  }, 0);

export function Home() {
  const data = useLiveQuery(async () => {
    const [positions, plans, settings, policy] = await Promise.all([
      db.positions.toArray(),
      db.pensionPlans.toArray(),
      db.settings.get('settings'),
      db.policies.get('policy'),
    ]);
    return { positions, plans, settings, policy };
  });
  if (!data?.settings) return null;
  const { positions, plans, settings, policy } = data;

  const reserve = costOf(positions, 'reserva');
  const free = costOf(positions, 'livre');
  const pension = pensionOf(plans);
  const monthlyCost = policy?.reserve.monthlyCostCents ?? 0;
  // Tenths of a month, from integer centavos.
  const coveredMonths = monthlyCost > 0 ? Math.floor((reserve * 10) / monthlyCost) / 10 : null;
  const backupAgeDays = settings.lastBackupAt ? Math.floor((Date.now() - Date.parse(settings.lastBackupAt)) / DAY_MS) : null;

  return (
    <>
      {settings.demoData && (
        <p className="notice">Você está vendo dados fictícios. Para usar com os seus dados, apague-os em Ajustes.</p>
      )}

      <section className="card">
        <h2>Valor aplicado</h2>
        <p className="big">
          <Money cents={reserve + free + pension} />
        </p>
        <dl className="rows">
          <div>
            <dt>Reserva</dt>
            <dd>
              <Money cents={reserve} />
            </dd>
          </div>
          <div>
            <dt>Carteira livre</dt>
            <dd>
              <Money cents={free} />
            </dd>
          </div>
          <div>
            <dt>Previdência</dt>
            <dd>
              <Money cents={pension} />
            </dd>
          </div>
        </dl>
        <p className="muted">Pelo valor aplicado. Os preços de mercado chegam no marco 2.</p>
      </section>

      <section className="card">
        <h2>Reserva</h2>
        {coveredMonths === null ? (
          <p>O custo de vida mensal ainda não foi informado.</p>
        ) : (
          <p>
            <strong>{coveredMonths.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} meses</strong> de custo de vida
            cobertos, para uma meta de {policy?.reserve.months} meses.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Backup</h2>
        {backupAgeDays === null || backupAgeDays > BACKUP_MAX_AGE_DAYS ? (
          <p className="notice">
            {backupAgeDays === null ? 'Nenhum backup salvo ainda.' : `O último backup tem ${backupAgeDays} dias.`}{' '}
            <a href="#/ajustes">Fazer backup</a>
          </p>
        ) : (
          <p>Último backup em {formatDateTime(settings.lastBackupAt!)}.</p>
        )}
      </section>

      <a className="button primary" href="#/aporte">
        Aporte do mês
      </a>
    </>
  );
}
