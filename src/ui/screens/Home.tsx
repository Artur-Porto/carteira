import { reserveMonths } from '../../domain/portfolio';
import { Money } from '../discreet';
import { formatDate, formatDateTime } from '../format';
import { usePortfolio } from '../hooks';
import { KEY_SOURCES, SOURCE_LABELS, freshness } from '../marketStatus';
import { hrefFor } from '../routes';

const BACKUP_MAX_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

export function Home() {
  const p = usePortfolio();
  if (!p?.settings) return null;
  const { settings, policy, value } = p;

  const total = value.reserve.grossCents + value.free.grossCents + value.pensionCents;
  const months = reserveMonths(value.reserve.netCents, policy?.reserve.monthlyCostCents ?? 0);
  const backupAgeDays = settings.lastBackupAt ? Math.floor((Date.now() - Date.parse(settings.lastBackupAt)) / DAY_MS) : null;
  const sources = freshness(p.files, p.market, p.today).filter(s => KEY_SOURCES.includes(s.source));
  const noData = sources.every(s => s.asOf === null);
  const stale = sources.filter(s => s.stale && s.asOf !== null);
  const dates = sources.flatMap(s => (s.asOf ? [s.asOf] : [])).sort();
  const oldest = dates[0];
  const newest = dates.at(-1);

  return (
    <>
      {settings.demoData && (
        <p className="notice">Você está vendo dados fictícios. Para usar com os seus dados, apague-os em Ajustes.</p>
      )}

      <section className="card" aria-labelledby="home-wealth-title">
        <h2 id="home-wealth-title">Patrimônio</h2>
        <p className="big">
          <Money cents={total} />
        </p>
        <dl className="rows">
          <div>
            <dt>Reserva</dt>
            <dd>
              <Money cents={value.reserve.grossCents} />
            </dd>
          </div>
          <div>
            <dt>Carteira livre</dt>
            <dd>
              <Money cents={value.free.grossCents} />
            </dd>
          </div>
          <div>
            <dt>Previdência</dt>
            <dd>
              <Money cents={value.pensionCents} />
            </dd>
          </div>
        </dl>
        <p className="muted small">
          Valores brutos de hoje, antes do IR. A previdência entra pelo último saldo informado.
          {value.unpricedCount > 0 &&
            ` ${value.unpricedCount === 1 ? 'Uma posição sem preço entra' : `${value.unpricedCount} posições sem preço entram`} pelo valor aplicado.`}
        </p>
        {noData ? (
          <p className="notice">Ainda não há dados de mercado neste aparelho: os valores são os aplicados. Conecte-se à internet para baixá-los.</p>
        ) : stale.length > 0 ? (
          <p className="notice">
            Dados de mercado desatualizados: {stale.map(s => `${SOURCE_LABELS[s.source]}, de ${formatDate(s.asOf!)}`).join('; ')}. Confira em{' '}
            <a href={hrefFor('ajustes')}>Ajustes</a>.
          </p>
        ) : (
          oldest &&
          newest && (
            <p className="muted small">
              Dados de mercado {oldest === newest ? `de ${formatDate(newest)}` : `de ${formatDate(oldest).slice(0, 5)} a ${formatDate(newest)}`}.
            </p>
          )
        )}
      </section>

      <section className="card" aria-labelledby="home-reserve-title">
        <h2 id="home-reserve-title">Reserva</h2>
        {months === null ? (
          <p>
            O custo de vida mensal ainda não foi informado. <a href={hrefFor('reserva')}>Informar</a>
          </p>
        ) : (
          <p>
            <strong>{months.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} meses</strong> de custo de vida
            cobertos, para uma meta de {policy?.reserve.months} meses. Conta pelo valor líquido, depois do IR.
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="home-backup-title">
        <h2 id="home-backup-title">Backup</h2>
        {backupAgeDays === null || backupAgeDays > BACKUP_MAX_AGE_DAYS ? (
          <p className="notice">
            {backupAgeDays === null ? 'Nenhum backup salvo ainda.' : `O último backup tem ${backupAgeDays} dias.`}{' '}
            <a href={hrefFor('ajustes')}>Fazer backup</a>
          </p>
        ) : (
          <p>Último backup em {formatDateTime(settings.lastBackupAt!)}.</p>
        )}
      </section>

      <a className="button primary" href={hrefFor('aporte')}>
        Aporte do mês
      </a>
    </>
  );
}
