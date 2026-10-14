import type { IsoDate } from './types';

const saoPauloDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date in São Paulo for an instant (SPEC: dates are São Paulo dates). */
export function saoPauloDay(instant: Date): IsoDate {
  return saoPauloDate.format(instant);
}
