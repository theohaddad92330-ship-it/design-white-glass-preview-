import { INVOICE_BLOCKERS, type InvoiceBlocker, type InvoiceReadinessState } from '@bellum/contracts'

/**
 * MANQUE A du 30/08 — LA LENTILLE « PRÊT À FACTURER », REMONTÉE AU COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ VIT `invoiceReadiness`, ET CE QUE CE FICHIER NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'état de facturabilité est calculé PAR MISSION, PAR MOIS, par
 * `assessInvoiceReadiness` (`packages/contracts/src/schemas/invoice-readiness.ts`)
 * et servi par `GET /delivery/invoice-readiness`. Ce fichier ne recalcule RIEN
 * de ce jugement (GA-26) : il INDEXE, par compte, ce que le serveur a déjà
 * décidé mission par mission — exactement le geste que fait déjà
 * `accountPropagationById` pour le tarif vendu moyen et le CA cumulé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE §9 DU 30/08 — `accountId` REND LA JOINTURE PAR MISSION INUTILE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /delivery/invoice-readiness` porte désormais `accountId` sur chaque
 * ligne (`invoice-readiness.ts:accountId`), sélectionné par le `LEFT JOIN
 * accounts` que la requête faisait déjà côté service sans le RENDRE. Avant ce
 * champ, la seule jointure fiable passait par `missionId`, via `GET
 * /delivery/missions` — plafonné à 200 lignes sans pagination : un compte
 * dont toutes les missions tombaient au-delà du plafond s'affichait « non
 * mesuré » sans raison. Joindre par NOM aurait été pire — deux comptes
 * peuvent porter le même nom (c'est précisément ce que `AbsorbAccountDialog`
 * sert à réconcilier à la main), et un nom peut être `null`.
 *
 * Ce fichier n'a donc plus BESOIN de `GET /delivery/missions` : il regroupe
 * directement `readinessItems` par `item.accountId`. Le plafond de 200 ne
 * décide plus de ce qui s'affiche sur cette colonne (voir `GA-203`,
 * `apps/web/src/architecture/`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UN COMPTE SANS MISSION N'EST PAS « PAS PRÊT » — IL N'A RIEN À FACTURER
 * ─────────────────────────────────────────────────────────────────────────────
 * `accountIdsWithMission` doit venir du digest de propagation
 * (`usePropagationDigest`, `accountPropagationById`) : c'est la source qui
 * n'est PAS plafonnée. Un compte absent de cet ensemble reçoit
 * `{ kind: 'none' }` — jamais « blocked », jamais rouge, jamais compté dans un
 * total de comptes bloqués — quoi que porte par ailleurs `readinessItems`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, PAS DEUX — LE MÊME PARTI PRIS QUE `accountHygiene.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `none` — ce compte n'a jamais porté de mission. Sans objet, pas un défaut.
 *  - `unmeasured` — ce compte A des missions (le digest le dit), mais aucune
 *    n'a produit de ligne de facturation ce mois : soit parce qu'aucune de ses
 *    missions ne couvre le mois interrogé, soit parce que la mission n'a pas
 *    (encore) de compte lié côté serveur (`accountId: null`, LEFT JOIN). « Non
 *    mesuré » n'est jamais « sans mission ».
 *  - `measured` — au moins une ligne de facturation existe ce mois ; l'état
 *    remonté est le PIRE des états de ses missions (voir la précédence
 *    ci-dessous), avec ses bloqueurs NOMMÉS quand il est bloqué.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PRÉCÉDENCE — CE QUI MÉRITE LE PLUS L'ATTENTION D'ABORD
 * ─────────────────────────────────────────────────────────────────────────────
 * `blocked` > `ready` > `invoiced` > `not_due`. Un compte avec DEUX missions,
 * l'une bloquée et l'autre prête, a un geste à faire avant d'être rassuré par
 * l'autre — c'est le blocage qui remonte. `not_due` ne remonte que si TOUTES
 * les missions du mois sont non dues (forfait, jalon) : rien n'est cassé, rien
 * n'est dû, exactement le sens que ce mot porte déjà sur l'écran des missions.
 */

export type AccountInvoiceReadinessBadge =
  | { kind: 'none' }
  | { kind: 'unmeasured' }
  | { kind: 'measured'; state: InvoiceReadinessState; blockers: InvoiceBlocker[] }

const NONE: AccountInvoiceReadinessBadge = { kind: 'none' }
const UNMEASURED: AccountInvoiceReadinessBadge = { kind: 'unmeasured' }

/**
 * Ce dont l'index a besoin d'`InvoiceReadiness` — jamais la ligne complète.
 *
 * `accountId` est `nullable`, comme sur le contrat serveur : la requête est un
 * LEFT JOIN, une mission sans compte existe. Une ligne dont `accountId` est
 * `null` ne peut être attribuée à AUCUN compte — elle est ignorée par
 * l'index, jamais devinée par son nom ni par sa position.
 */
type ReadinessRowForAccount = {
  accountId: string | null
  state: InvoiceReadinessState
  blockers: readonly InvoiceBlocker[]
}

/**
 * Construit l'index compte → badge, en UN passage sur `readinessItems`.
 *
 * Appelé UNE fois par le hook (mémoïsé sur les réponses), jamais par ligne :
 * vingt-cinq lignes qui refaisaient ce filtrage chacune referaient le même
 * travail vingt-cinq fois pour le même résultat.
 */
export function buildAccountInvoiceReadinessIndex(
  accountIdsWithMission: ReadonlySet<string>,
  readinessItems: readonly ReadinessRowForAccount[],
): Map<string, AccountInvoiceReadinessBadge> {
  const rowsByAccount = new Map<string, ReadinessRowForAccount[]>()
  for (const item of readinessItems) {
    // `null` = la mission n'a pas (encore) de compte lié côté serveur : elle
    // ne peut contribuer à AUCUN badge de compte.
    if (item.accountId === null) continue
    const existing = rowsByAccount.get(item.accountId)
    if (existing) existing.push(item)
    else rowsByAccount.set(item.accountId, [item])
  }

  const index = new Map<string, AccountInvoiceReadinessBadge>()
  for (const accountId of accountIdsWithMission) {
    const rows = rowsByAccount.get(accountId) ?? []

    if (rows.length === 0) {
      index.set(accountId, UNMEASURED)
      continue
    }

    const blockedRows = rows.filter(row => row.state === 'blocked')
    if (blockedRows.length > 0) {
      const present = new Set<InvoiceBlocker>()
      for (const row of blockedRows) for (const blocker of row.blockers) present.add(blocker)
      // Réordonnés selon la gravité DU DOMAINE (`INVOICE_BLOCKERS`), jamais
      // l'ordre d'arrivée des missions : c'est ce même ordre qui dit, sur
      // l'écran des missions, lequel traiter en premier.
      index.set(accountId, {
        kind: 'measured',
        state: 'blocked',
        blockers: INVOICE_BLOCKERS.filter(blocker => present.has(blocker)),
      })
      continue
    }
    if (rows.some(row => row.state === 'ready')) {
      index.set(accountId, { kind: 'measured', state: 'ready', blockers: [] })
      continue
    }
    if (rows.some(row => row.state === 'invoiced')) {
      index.set(accountId, { kind: 'measured', state: 'invoiced', blockers: [] })
      continue
    }
    // #2197.41 — un DÉCLARÉ n'est PAS un PROUVÉ : fondre les deux sous
    // `invoiced` ferait remonter, sur la liste des comptes, une déclaration
    // humaine sans preuve comme si elle avait été confirmée par un connecteur.
    if (rows.some(row => row.state === 'invoiced_declared')) {
      index.set(accountId, { kind: 'measured', state: 'invoiced_declared', blockers: [] })
      continue
    }
    index.set(accountId, { kind: 'measured', state: 'not_due', blockers: [] })
  }
  return index
}

/** Lit l'index pour UN compte. Absent de l'index = `none`, jamais une erreur. */
export function accountInvoiceReadinessOf(
  index: ReadonlyMap<string, AccountInvoiceReadinessBadge>,
  accountId: string,
): AccountInvoiceReadinessBadge {
  return index.get(accountId) ?? NONE
}
