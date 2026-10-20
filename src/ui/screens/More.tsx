import { ChevronIcon } from '../components/icons';
import { MORE_ROUTES, TITLES, hrefFor } from '../routes';

const DESCRIPTIONS: Record<(typeof MORE_ROUTES)[number], string> = {
  reserva: 'Saldos, rendimento e conciliação',
  previdencia: 'Carência, saldo garantido e dedução',
  politica: 'Alvos, faixas, limites e cenários',
  cenarios: 'Perda da carteira em cada crise testada',
  mesa: 'Checklist de compra, tamanho máximo e treino',
  ferramentas: 'Comparador, equivalência e projeção',
  claude: 'Resumo para colar na conversa',
  ajustes: 'Backup, modo discreto e dados',
};

export function More() {
  return (
    <ul className="menu">
      {MORE_ROUTES.map(route => (
        <li key={route}>
          <a href={hrefFor(route)}>
            <span>
              <strong>{TITLES[route]}</strong>
              <span className="muted small">{DESCRIPTIONS[route]}</span>
            </span>
            <ChevronIcon />
          </a>
        </li>
      ))}
    </ul>
  );
}
