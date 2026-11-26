/**
 * Audit des doublons d'un portefeuille — SIMULATION, jamais une écriture (#4294.9, issue #4142).
 *
 * Fusionner est irréversible : ici on ne fait que COMPTER et NOMMER ce que le geste
 * « Rattacher ce dossier » (`account-absorb.ts`) toucherait, pour que l'écran dise
 * « 3 dossiers seraient rattachés » AVANT que quiconque clique.
 *
 * ⚠️ Les coquilles vides (`error` / `canceled` sans contact, angle, plan ni run terminé) sont
 * masquées par la liste (`KEEP_NON_EMPTY_FAILED_SQL`). Un audit qui les compterait annoncerait
 * des doublons que personne ne voit : elles sortent du décompte et se comptent à part.
 */

export type DuplicateAuditAccount = {
  id: string
  companyName: string
  siren: string | null
  status: string
  mergedIntoId: string | null
  /** Contacts, angles, plan ou run terminé — la définition de `KEEP_NON_EMPTY_FAILED_SQL`. */
  hasData: boolean
  createdAt: string
}

type DuplicateGroup = {
  basis: 'siren' | 'name'
  accountIds: string[]
  suggestedKeepId: string
}

export type DuplicateAudit = {
  groups: DuplicateGroup[]
  /** Comptes réellement examinés (visibles dans la liste, non rattachés, non rangés). */
  examined: number
  /** Coquilles vides masquées par la liste, comptées À PART. */
  emptyShells: number
  /** Combien de dossiers le rattachement proposé toucherait : la somme des groupes moins le gardé. */
  wouldAbsorb: number
}

const normalizeName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const sirenOf = (siren: string | null): string | null => {
  const digits = (siren ?? '').replace(/\D/g, '')
  return digits.length === 9 ? digits : null
}

const isEmptyShell = (a: DuplicateAuditAccount): boolean =>
  (a.status === 'error' || a.status === 'canceled') && !a.hasData

const isOutOfScope = (a: DuplicateAuditAccount): boolean =>
  a.mergedIntoId !== null || a.status === 'archived' || a.status === 'deleted'

/** Le mieux renseigné d'abord, puis le plus ancien, puis l'identifiant (ordre total, donc stable). */
const keepOrder = (x: DuplicateAuditAccount, y: DuplicateAuditAccount): number =>
  Number(y.hasData) - Number(x.hasData) || x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id)

export function auditDuplicateAccounts(accounts: readonly DuplicateAuditAccount[]): DuplicateAudit {
  const emptyShells = accounts.filter(a => !isOutOfScope(a) && isEmptyShell(a)).length
  const examined = accounts.filter(a => !isOutOfScope(a) && !isEmptyShell(a))

  // Un compte n'est que dans UN groupe : le SIREN d'abord, le nom seulement à défaut.
  const bySiren = new Map<string, DuplicateAuditAccount[]>()
  const byName = new Map<string, DuplicateAuditAccount[]>()
  const push = (map: Map<string, DuplicateAuditAccount[]>, key: string, a: DuplicateAuditAccount) =>
    map.set(key, [...(map.get(key) ?? []), a])

  for (const a of examined) {
    const siren = sirenOf(a.siren)
    if (siren) {
      push(bySiren, siren, a)
      continue
    }
    const name = normalizeName(a.companyName)
    if (name) push(byName, name, a)
  }

  const groups: DuplicateGroup[] = []
  const emit = (map: Map<string, DuplicateAuditAccount[]>, basis: DuplicateGroup['basis']) => {
    for (const members of map.values()) {
      if (members.length < 2) continue
      const sorted = [...members].sort(keepOrder)
      const keep = sorted[0]
      if (!keep) continue
      groups.push({ basis, accountIds: members.map(m => m.id), suggestedKeepId: keep.id })
    }
  }
  emit(bySiren, 'siren')
  emit(byName, 'name')

  const wouldAbsorb = groups.reduce((sum, g) => sum + g.accountIds.length - 1, 0)
  return { groups, examined: examined.length, emptyShells, wouldAbsorb }
}
