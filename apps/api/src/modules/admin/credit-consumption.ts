import { creditCapacity, nextResetFor } from '../credits/credits.service'

// #4467 — la consommation de crédits, par espace ET par utilisateur. Les crédits
// sont implicites côté client (#4468) : cette lecture est le SEUL endroit où ils
// se voient. Module PUR (aucune requête, aucune horloge lue) : la fenêtre est
// calculée par le service, qui porte l'horloge.

/** Le plafond « illimité » posé en base (le même seuil que l'app web). */
export const UNLIMITED_ACCOUNTS_LIMIT = 999_999

/** Ce que la lecture a besoin de savoir de l'abonnement du propriétaire. */
interface PoolInput {
  plan: string
  accounts_limit: number
  accounts_used: number
  topup_analyses?: number | null
  rollover_credits?: number | null
  rollover_expires_at?: Date | string | null
  period_start?: Date | string | null
}

interface PoolReading {
  /** Capacité dépensable du cycle. `null` = illimité ou pas d'abonnement. */
  capacity: number | null
  /** Solde restant, jamais négatif. `null` = non mesurable, JAMAIS « 0 ». */
  remaining: number | null
  /** Solde atteint zéro : ce compte voit le frein doux. Faux si non mesurable. */
  exhausted: boolean
  unlimited: boolean
  /** Prochain renouvellement du cycle (ISO). `null` pour un essai ou sans date. */
  renewsAt: string | null
}

/**
 * Le solde du pool d'un espace. La capacité vient de `creditCapacity` — la seule
 * définition de « son plafond » (quota + recharge + report valide) : la refaire
 * ici donnerait deux plafonds, dont l'un oublierait le report.
 */
export function readPool(sub: PoolInput | null): PoolReading {
  if (!sub) return { capacity: null, remaining: null, exhausted: false, unlimited: false, renewsAt: null }
  const renewsAt = nextResetFor(sub)
  if (sub.accounts_limit >= UNLIMITED_ACCOUNTS_LIMIT) {
    return { capacity: null, remaining: null, exhausted: false, unlimited: true, renewsAt }
  }
  const capacity = creditCapacity(sub)
  const remaining = Math.max(0, capacity - Math.max(0, sub.accounts_used))
  return { capacity, remaining, exhausted: remaining === 0, unlimited: false, renewsAt }
}

interface ConsumptionWorkspaceInput {
  id: string
  name: string
  ownerUserId: string
  memberIds: string[]
  sub: PoolInput | null
}

/** Somme nette des débits du grand livre d'un (espace, auteur) sur la fenêtre. */
interface ConsumptionLedgerInput {
  workspaceId: string
  actorUserId: string | null
  consumed: number
}

interface WorkspaceConsumptionRow {
  workspaceId: string
  name: string
  ownerUserId: string
  plan: string | null
  memberCount: number
  capacity: number | null
  remaining: number | null
  /** Consommé sur la fenêtre (tous auteurs, y compris les débits sans auteur). */
  consumed: number
  renewsAt: string | null
  exhausted: boolean
  unlimited: boolean
}

interface UserConsumptionRow {
  userId: string
  email: string | null
  workspaceId: string
  workspaceName: string
  /** Consommé par CE membre sur la fenêtre. `null` = non mesuré (grand livre muet). */
  consumed: number | null
  /** Le solde du pool de son espace : le pool est partagé, il n'y a pas de solde individuel. */
  remaining: number | null
  renewsAt: string | null
  exhausted: boolean
}

export interface ConsumptionReport {
  windowDays: number
  workspaces: WorkspaceConsumptionRow[]
  users: UserConsumptionRow[]
  /** Les comptes dont l'espace a un solde épuisé — ceux qui voient le frein doux. */
  exhausted: UserConsumptionRow[]
}

export function buildConsumption(input: {
  windowDays: number
  workspaces: ConsumptionWorkspaceInput[]
  ledger: ConsumptionLedgerInput[]
  emails: ReadonlyMap<string, string | null>
}): ConsumptionReport {
  const byWorkspace = new Map<string, ConsumptionLedgerInput[]>()
  for (const entry of input.ledger) {
    const list = byWorkspace.get(entry.workspaceId) ?? []
    list.push(entry)
    byWorkspace.set(entry.workspaceId, list)
  }

  const workspaces: WorkspaceConsumptionRow[] = []
  const users: UserConsumptionRow[] = []

  for (const ws of input.workspaces) {
    const pool = readPool(ws.sub)
    const entries = byWorkspace.get(ws.id) ?? []
    workspaces.push({
      workspaceId: ws.id,
      name: ws.name,
      ownerUserId: ws.ownerUserId,
      plan: ws.sub?.plan ?? null,
      memberCount: ws.memberIds.length,
      capacity: pool.capacity,
      remaining: pool.remaining,
      consumed: entries.reduce((sum, entry) => sum + entry.consumed, 0),
      renewsAt: pool.renewsAt,
      exhausted: pool.exhausted,
      unlimited: pool.unlimited,
    })

    // Grand livre muet alors que le pool a débité = lacune d'écriture (l'écriture
    // est best-effort) : la consommation du membre n'est pas mesurée, pas nulle.
    const ledgerGap = entries.length === 0 && (ws.sub?.accounts_used ?? 0) > 0
    for (const userId of ws.memberIds) {
      const own = entries.filter(entry => entry.actorUserId === userId)
      users.push({
        userId,
        email: input.emails.get(userId) ?? null,
        workspaceId: ws.id,
        workspaceName: ws.name,
        consumed: ledgerGap ? null : own.reduce((sum, entry) => sum + entry.consumed, 0),
        remaining: pool.remaining,
        renewsAt: pool.renewsAt,
        exhausted: pool.exhausted,
      })
    }
  }

  return {
    windowDays: input.windowDays,
    workspaces,
    users,
    exhausted: users.filter(row => row.exhausted),
  }
}
