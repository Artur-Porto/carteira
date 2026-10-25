// Writes of the owner's records. Each runs in one IndexedDB transaction, so nothing is left half
// done. Quantities, costs and lots are never written: domain/valuation.ts derives them.
import { bandsFor, initialPolicy } from '../domain/policy';
import type {
  Cents,
  ContributionPlan,
  Entity,
  Institution,
  PensionBalance,
  PensionPlan,
  Policy,
  Position,
  Reconciliation,
  Transaction,
} from '../domain/types';
import type { CarteiraDb } from './db';

export type Draft<T extends Entity> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export const newId = () => crypto.randomUUID();

/** Keeps the id and creation time of an existing record and refreshes its update time. */
function stamped<T extends Entity>(draft: Draft<T>, existing: T | undefined, now: string): T {
  return { ...draft, id: existing?.id ?? draft.id ?? newId(), createdAt: existing?.createdAt ?? now, updatedAt: now } as T;
}

/** Creates or updates a position; a new one may come with its first movement. Returns the id. */
export async function savePosition(
  db: CarteiraDb,
  draft: Draft<Position>,
  firstMovement?: Omit<Draft<Transaction>, 'positionId'>,
): Promise<string> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.positions, db.transactions, async () => {
    const existing = draft.id ? await db.positions.get(draft.id) : undefined;
    const position = stamped<Position>(draft, existing, now);
    await db.positions.put(position);
    if (firstMovement && !existing) await db.transactions.put(stamped<Transaction>({ ...firstMovement, positionId: position.id }, undefined, now));
    return position.id;
  });
}

/** Deletes a position with its movements, reconciliations and thesis. */
export async function deletePosition(db: CarteiraDb, id: string): Promise<void> {
  await db.transaction('rw', db.positions, db.transactions, db.reconciliations, db.theses, async () => {
    await db.transactions.where('positionId').equals(id).delete();
    await db.reconciliations.where('positionId').equals(id).delete();
    await db.theses.where('positionId').equals(id).delete();
    await db.positions.delete(id);
  });
}

export async function saveTransaction(db: CarteiraDb, draft: Draft<Transaction>): Promise<string> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.transactions, async () => {
    const existing = draft.id ? await db.transactions.get(draft.id) : undefined;
    const tx = stamped<Transaction>(draft, existing, now);
    await db.transactions.put(tx);
    return tx.id;
  });
}

export async function deleteTransaction(db: CarteiraDb, id: string): Promise<void> {
  await db.transactions.delete(id);
}

export async function saveReconciliation(db: CarteiraDb, draft: Draft<Reconciliation>): Promise<string> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.reconciliations, async () => {
    // One balance per position and day: a new one on the same day replaces the old.
    const sameDay = await db.reconciliations.where('positionId').equals(draft.positionId).filter(r => r.date === draft.date).first();
    const existing = draft.id ? await db.reconciliations.get(draft.id) : sameDay;
    const rec = stamped<Reconciliation>({ ...draft, id: existing?.id }, existing, now);
    await db.reconciliations.put(rec);
    return rec.id;
  });
}

export async function deleteReconciliation(db: CarteiraDb, id: string): Promise<void> {
  await db.reconciliations.delete(id);
}

/** The institution with this name, created when it does not exist yet. Null for an empty name. */
export async function institutionFor(db: CarteiraDb, name: string, fgcCovered: boolean): Promise<string | null> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  return db.transaction('rw', db.institutions, async () => {
    const all = await db.institutions.toArray();
    const found = all.find(i => i.name.localeCompare(clean, 'pt-BR', { sensitivity: 'base' }) === 0);
    if (found) return found.id;
    const now = new Date().toISOString();
    const institution: Institution = { id: newId(), name: clean, conglomerate: clean, fgcCovered, createdAt: now, updatedAt: now };
    await db.institutions.add(institution);
    return institution.id;
  });
}

export async function savePensionPlan(db: CarteiraDb, draft: Draft<PensionPlan>): Promise<string> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.pensionPlans, async () => {
    const existing = draft.id ? await db.pensionPlans.get(draft.id) : undefined;
    const plan = stamped<PensionPlan>(draft, existing, now);
    await db.pensionPlans.put(plan);
    return plan.id;
  });
}

/** Records the balance of a date; another one on the same date replaces it. */
export async function savePensionBalance(db: CarteiraDb, planId: string, balance: PensionBalance): Promise<void> {
  await db.transaction('rw', db.pensionPlans, async () => {
    const plan = await db.pensionPlans.get(planId);
    if (!plan) throw new Error('plano não encontrado');
    const balances = [...plan.balances.filter(b => b.date !== balance.date), balance].sort((a, b) => a.date.localeCompare(b.date));
    await db.pensionPlans.update(planId, { balances, updatedAt: new Date().toISOString() });
  });
}

export async function deletePensionBalance(db: CarteiraDb, planId: string, date: string): Promise<void> {
  await db.transaction('rw', db.pensionPlans, async () => {
    const plan = await db.pensionPlans.get(planId);
    if (!plan) return;
    await db.pensionPlans.update(planId, { balances: plan.balances.filter(b => b.date !== date), updatedAt: new Date().toISOString() });
  });
}

export async function deletePensionPlan(db: CarteiraDb, id: string): Promise<void> {
  await db.pensionPlans.delete(id);
}

/** Saves the policy edited on the Política screen, with the bands recomputed from the targets. */
export async function savePolicy(db: CarteiraDb, policy: Omit<Policy, 'id' | 'bands' | 'createdAt' | 'updatedAt'>): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.policies, async () => {
    const existing = await db.policies.get('policy');
    await db.policies.put({ ...policy, id: 'policy', bands: bandsFor(policy.targets), createdAt: existing?.createdAt ?? now, updatedAt: now });
  });
}

/** Records a contribution plan (SPEC, step 7: "O plano vira histórico"). Returns its id. */
export async function saveContributionPlan(db: CarteiraDb, draft: Draft<ContributionPlan>): Promise<string> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.contributionPlans, async () => {
    const existing = draft.id ? await db.contributionPlans.get(draft.id) : undefined;
    const plan = stamped<ContributionPlan>(draft, existing, now);
    await db.contributionPlans.put(plan);
    return plan.id;
  });
}

export async function setContributionPlanStatus(db: CarteiraDb, id: string, status: ContributionPlan['status']): Promise<void> {
  await db.contributionPlans.update(id, { status, updatedAt: new Date().toISOString() });
}

export async function deleteContributionPlan(db: CarteiraDb, id: string): Promise<void> {
  await db.contributionPlans.delete(id);
}

/** The monthly living cost behind the reserve target; creates the initial policy if needed. */
export async function setMonthlyCost(db: CarteiraDb, cents: Cents): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.policies, async () => {
    const policy = (await db.policies.get('policy')) ?? initialPolicy(now);
    await db.policies.put({ ...policy, reserve: { ...policy.reserve, monthlyCostCents: cents }, updatedAt: now });
  });
}
