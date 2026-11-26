import {
  assessAccountBillingReadiness,
  type AccountBillingBlocker,
  type AccountBillingProfile,
  type AccountBillingState,
  type InvoiceBlocker,
} from '@bellum/contracts'

/**
 * LA LENTILLE DELIVERY DU PORTEFEUILLE — « peut-on facturer ce client ? ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE FICHIER INDEXE, IL NE JUGE PAS (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le jugement vit dans `assessAccountBillingReadiness`
 * (`packages/contracts/src/schemas/account-billing-readiness.ts`), partagé et
 * testé à part. Ce fichier fait ce que `accountInvoiceReadiness.ts` fait déjà
 * pour l'autre moitié : il regroupe par compte, en UN passage, et appelle la
 * dérivation une fois par compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX MOITIÉS, ET POURQUOI ELLES NE FUSIONNENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `accountInvoiceReadiness.ts` répond « ce MOIS-ci, sur les missions de ce
 * compte, qu'est-ce qui bloque ». Il rend `none` — « rien à facturer » — pour
 * un compte sans mission, ce qui est juste pour SA question et muet pour
 * celle-ci : un compte sans mission peut parfaitement être infacturable, et
 * c'est même le moment où le découvrir coûte le moins cher.
 *
 * Cette lentille-ci est donc STRUCTURELLE : elle vaut pour TOUS les comptes, y
 * compris ceux qui n'ont jamais porté de mission. La seule chose qu'elle
 * emprunte à l'autre est le bon de commande — LEVÉ, jamais recalculé.
 */

export type AccountBillingBadge = {
  state: AccountBillingState
  blockers: AccountBillingBlocker[]
  /** Le dossier lui-même, pour afficher SIREN et raison sociale sur la ligne.
   *  `null` quand aucune entité n'est désignée — c'est alors le bloqueur
   *  `missing_billing_entity` qui porte l'information. */
  profile: AccountBillingProfile | null
}

/** Ce que l'index a besoin de savoir d'une ligne de facturation de MISSION. */
type ReadinessRowForBilling = {
  accountId: string | null
  blockers: readonly InvoiceBlocker[]
}

/**
 * Combien de missions de CE compte portent `missing_po`.
 *
 * ⚠️ Compté sur les lignes du mois, telles que le serveur les a jugées. On ne
 * relit ni `requires_po` ni `po_number` : `assessInvoiceReadiness` en est seul
 * juge, et un second test ici divergerait le jour où l'un des deux apprend une
 * exception.
 */
function missingPoByAccount(rows: readonly ReadinessRowForBilling[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    // `null` = la mission n'a pas de compte lié côté serveur (LEFT JOIN) : elle
    // ne peut contribuer à AUCUN compte, et surtout pas se voir attribuer un
    // compte deviné par son nom.
    if (row.accountId === null) continue
    if (!row.blockers.includes('missing_po')) continue
    counts.set(row.accountId, (counts.get(row.accountId) ?? 0) + 1)
  }
  return counts
}

/**
 * Ce que l'écran interroge : un verdict pour UN compte, à la demande.
 *
 * NON exporté : rien hors de ce fichier ne le NOMME — les appelants reçoivent
 * le type par inférence sur `buildAccountBillingResolver`. L'exporter quand
 * même ferait échouer `pnpm lint:exports:types` (knip refuse un type exporté
 * sans consommateur externe).
 */
type AccountBillingResolver = { get(accountId: string): AccountBillingBadge }

/**
 * Construit le résolveur : les deux sources sont indexées en UN passage, puis
 * chaque ligne demande son verdict.
 *
 * Cette forme — indexer une fois, juger à la demande — est celle que la ligne
 * du tableau peut consommer sans qu'on lui passe la population entière en
 * `prop` : elle appelle le hook comme sa voisine `useAccountInvoiceReadiness`,
 * et le cache de requête partage la lecture entre les vingt-cinq lignes.
 *
 * Un compte absent des dossiers reçoit `profile: null`, donc le bloqueur
 * `missing_billing_entity` : c'est la réponse VRAIE — personne n'a désigné de
 * payeur — et surtout pas un « non mesuré ».
 */
export function buildAccountBillingResolver(
  profiles: readonly AccountBillingProfile[],
  readinessRows: readonly ReadinessRowForBilling[],
  now: Date,
): AccountBillingResolver {
  const profileByAccount = new Map<string, AccountBillingProfile>()
  for (const profile of profiles) profileByAccount.set(profile.accountId, profile)
  const missingPo = missingPoByAccount(readinessRows)
  // Mémoïsé : vingt-cinq lignes qui redemandent leur verdict à chaque rendu
  // referaient le même jugement, et deux rendus séparés par minuit rendraient
  // deux réponses sur « contrat expiré ».
  const cache = new Map<string, AccountBillingBadge>()

  return {
    get(accountId: string): AccountBillingBadge {
      const cached = cache.get(accountId)
      if (cached) return cached
      const profile = profileByAccount.get(accountId) ?? null
      const verdict = assessAccountBillingReadiness({ profile, missionsMissingPo: missingPo.get(accountId) ?? 0 }, now)
      const badge: AccountBillingBadge = { state: verdict.state, blockers: verdict.blockers, profile }
      cache.set(accountId, badge)
      return badge
    },
  }
}

/**
 * Combien de comptes AFFICHÉS sont prêts, et combien portent un bloqueur.
 *
 * ⚠️ Compté sur les comptes qu'on lui donne — ceux de la page — et jamais
 * annoncé comme un total d'espace : la liste est paginée, et un compteur qui
 * grandit en défilant est le défaut exact déjà payé sur les pastilles de
 * `/contacts`. C'est l'écran qui NOMME ce périmètre à côté du chiffre.
 */
export function summarizeAccountBilling(
  get: (accountId: string) => AccountBillingBadge | null,
  accountIds: readonly string[],
): { ready: number; blocked: number } {
  let ready = 0
  let blocked = 0
  for (const accountId of accountIds) {
    const badge = get(accountId)
    // ⚠️ Un compte que la lentille n'a pas su juger ne compte NI d'un côté NI
    // de l'autre. Le ranger dans « prêt » annoncerait un fait ; dans
    // « bloqué », une alerte à traiter qui n'existe pas.
    if (!badge) continue
    if (badge.state === 'ready') ready += 1
    else blocked += 1
  }
  return { ready, blocked }
}
