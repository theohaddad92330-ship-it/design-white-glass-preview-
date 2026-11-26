import { CRM_DEAL_SIGNAL_THRESHOLDS, type CrmDealSignalDraft, type CrmDealSignalRow } from '@bellum/contracts'

/**
 * #3918 (lot Y12, 08/10/2026) — le CRM ne servait qu'à dire « compte déjà
 * connu » (`CrmReadService`) : le cache des affaires (`crm_deal_facts`)
 * n'alimentait que la reprise de mission et le rapport pipeline, jamais un
 * signal commercial. Ces trois règles PURES transforment le cache en signaux
 * datés et sourcés, relayés au registre canonique (#2875) par
 * `CrmDealSignalsSweeper` — jamais une probabilité, jamais un fait inventé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PIPEDRIVE ET ODOO — BRANCHÉS (#3918.8, décision Louis 15/10/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Ces trois règles lisent `crm_deal_facts` quel que soit le fournisseur qui
 * l'a rempli — elles ne discriminent PAS sur `provider`. HubSpot y écrit par
 * `CrmDepthService` ; Pipedrive et Odoo y écrivent depuis le 15/10/2026 par
 * `CrmDealFactsHarvester` (`crm-deal-facts-harvest.ts`), sur la lecture commune
 * des affaires (#4189, `read.deals`), à la synchro quotidienne. Ce que chacun
 * ne dit pas reste vide : Odoo archive une affaire perdue (aucun signal
 * « perdue » ne peut en sortir), aucun des deux ne rend de « dernière activité »
 * (la dormance se compte alors « depuis sa création », et la phrase le dit).
 * _Ancien texte, remplacé_ : ~~« Pipedrive et Odoo — hors périmètre : leur
 * lecture profonde de deals n'existe pas »~~ — elle existe depuis #4189.
 */

/** Mois pleins écoulés depuis `date`. `null` quand la date est inexploitable. */
function monthsSince(date: Date | string | null | undefined, now: Date): number | null {
  const days = daysSince(date, now)
  return days === null ? null : Math.floor(days / 30)
}

/** Jours pleins écoulés depuis `date`. `null` quand la date est inexploitable. */
function daysSince(date: Date | string | null | undefined, now: Date): number | null {
  if (!date) return null
  const stamp = date instanceof Date ? date.getTime() : Date.parse(String(date))
  if (!Number.isFinite(stamp)) return null
  return Math.floor((now.getTime() - stamp) / 86_400_000)
}

function toIso(date: Date | string): string {
  return date instanceof Date ? date.toISOString() : new Date(date).toISOString()
}

function dealLabel(row: CrmDealSignalRow): string {
  return row.name ?? 'Une affaire'
}

/**
 * Une affaire CLÔTURÉE PERDUE, depuis au moins `lostMinMonths` mois pleins.
 *
 * Sans date de clôture, aucun signal : une affaire perdue sans date ne se
 * date jamais au hasard (même règle que `detectRenewalsAtRisk`, intervention-rules.ts).
 */
export function detectLostDeals(rows: readonly CrmDealSignalRow[], now: Date): CrmDealSignalDraft[] {
  const drafts: CrmDealSignalDraft[] = []
  for (const row of rows) {
    if (!row.is_closed || row.is_won !== false) continue
    if (!row.closed_at) continue
    const months = monthsSince(row.closed_at, now)
    if (months === null || months < CRM_DEAL_SIGNAL_THRESHOLDS.lostMinMonths) continue
    drafts.push({
      kind: 'affaire_perdue',
      dealFactId: row.id,
      evidence: `${dealLabel(row)} : affaire perdue il y a ${months} mois.`,
      occurredAt: toIso(row.closed_at),
    })
  }
  return drafts
}

/**
 * Une affaire OUVERTE sans la moindre activité connue depuis au moins
 * `dormantMinDays` jours.
 *
 * La base de calcul est `last_activity_at` quand le cache la porte ; sinon
 * `deal_created_at`, et le mot change pour le dire — « depuis sa création »
 * n'est pas « depuis sa dernière activité », et confondre les deux inventerait
 * une précision que la donnée n'a pas.
 */
export function detectDormantDeals(rows: readonly CrmDealSignalRow[], now: Date): CrmDealSignalDraft[] {
  const drafts: CrmDealSignalDraft[] = []
  for (const row of rows) {
    if (row.is_closed) continue
    const basis = row.last_activity_at ?? row.deal_created_at
    const days = daysSince(basis, now)
    if (days === null || days < CRM_DEAL_SIGNAL_THRESHOLDS.dormantMinDays) continue
    const since = row.last_activity_at
      ? 'sans la moindre activité connue'
      : 'sans la moindre activité depuis sa création (aucune activité ultérieure connue)'
    drafts.push({
      kind: 'affaire_dormante',
      dealFactId: row.id,
      evidence: `${dealLabel(row)} : ${since} depuis ${days} jours.`,
      occurredAt: toIso(basis as Date | string),
    })
  }
  return drafts
}

/**
 * Une affaire GAGNÉE depuis au moins `renewalCycleDays` jours.
 *
 * Le cache ne porte aucune échéance de contrat : la cadence est une CONSTANTE
 * connue (cycle annuel), pas une date devinée — même principe que
 * `NOT_NOW_REVALIDATION_DAYS` pour une pause commerciale sans échéance saisie.
 */
export function detectDealsForRenewal(rows: readonly CrmDealSignalRow[], now: Date): CrmDealSignalDraft[] {
  const drafts: CrmDealSignalDraft[] = []
  for (const row of rows) {
    if (!row.is_closed || row.is_won !== true) continue
    if (!row.closed_at) continue
    const days = daysSince(row.closed_at, now)
    if (days === null || days < CRM_DEAL_SIGNAL_THRESHOLDS.renewalCycleDays) continue
    drafts.push({
      kind: 'affaire_renouvellement',
      dealFactId: row.id,
      evidence: `${dealLabel(row)} : affaire gagnée il y a ${days} jours, renouvellement à examiner (cycle écoulé, aucune échéance de contrat connue).`,
      occurredAt: toIso(row.closed_at),
    })
  }
  return drafts
}
