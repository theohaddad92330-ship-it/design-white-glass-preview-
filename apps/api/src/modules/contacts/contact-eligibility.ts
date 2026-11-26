import type { ContactEligibilityReason, ContactRecommendationAuthorizableReason } from '@bellum/contracts'
import { buildEntityScoreContext, lookupEntityZone } from '../analysis/contact-score'
import { normalizeFullName } from './contact-identity'

/**
 * #2295.3 — l'éligibilité se décide avant le rang.
 *
 * Geste empêché : un contact écarté à la main (`excluded_at`/`hidden`), une
 * entité hors du périmètre du compte, ou un homonyme non résolu ne doit pas
 * recevoir un MAUVAIS SCORE — il ne doit pas entrer dans le classement du
 * tout, et la raison de son absence doit se lire. C'est une PORTE, pas un axe
 * : `rankAccountContacts` (`contact-ranking.ts`) ne voit jamais les contacts
 * qui échouent ici, et son noyau reste tenu (`protected-criteria.spec.ts`,
 * GA-06) à ne jamais lire l'identité — c'est pourquoi cette porte, qui a
 * besoin de `full_name` pour détecter un homonyme, vit dans un fichier séparé
 * du noyau de classement.
 */

export type EligibilityRow = {
  id: string
  full_name: string
  entity: string | null
  hidden: boolean | null
  excluded_at: Date | string | null
  /** #2160.53 — la position calculée par `computeContactLifecycleState`
   *  (`classified-data.ts`), persistée sur la ligne. `'historique'` = un
   *  ex-employé, capteur du réseau, jamais l'org actuel. */
  lifecycle_state?: string | null
  /**
   * #2160.60 — « Autoriser la recommandation », posée sur la FICHE CONTACT :
   * `null` tant que personne ne l'a levée. La raison LEVÉE, jamais un
   * commentaire libre — elle doit correspondre EXACTEMENT à la raison qui
   * bloque CE contact pour avoir un effet (voir `isAuthorizedFor` ci-dessous).
   */
  recommendation_authorized_reason?: ContactRecommendationAuthorizableReason | string | null
}

type EligibilityExclusion = { contact_id: string; reason: ContactEligibilityReason }

type EligibilityResult<T extends EligibilityRow> = {
  eligible: T[]
  excluded: EligibilityExclusion[]
}

/** Zones dont l'entité résout comme n'appartenant PAS au compte — bruit, pas
 *  une simple filiale secondaire (celle-là reste un AXE de score, pas une porte). */
const OUT_OF_ENTITY_RELEVANCE = new Set(['out_of_sector', 'noise'])

/** #2160.60 — la correction humaine ne lève QUE la raison pour laquelle elle a
 *  été posée : autoriser un `entity_mismatch` ne lève jamais un `homonym_conflict`
 *  rencontré sur le même contact, et réciproquement. */
function isAuthorizedFor(row: EligibilityRow, reason: ContactRecommendationAuthorizableReason): boolean {
  return row.recommendation_authorized_reason === reason
}

/**
 * Filtre les contacts ÉLIGIBLES au classement — appelé AVANT `rankAccountContacts`.
 * Chaque exclusion porte une raison NOMMÉE (#2295.3) ; aucun contact exclu n'est
 * noté, il ne participe simplement pas.
 *
 * #2126.56/.58 (épopée #2787) — `flaggedIncorrectContactIds` porte les fiches
 * sur lesquelles un outcome `incorrect_contact` a été enregistré
 * (`commercial-outcome.ts`) : la même porte qui écarte du CLASSEMENT écarte
 * aussi des RECOMMANDATIONS futures, puisque ce filtre est le seul amont des
 * deux. Vide par défaut : un appelant qui ne lit pas encore les outcomes garde
 * exactement le comportement d'avant (aucune régression silencieuse).
 */
export function filterEligibleContacts<T extends EligibilityRow>(
  rows: readonly T[],
  rawAnalysis: Record<string, unknown> | null,
  flaggedIncorrectContactIds: ReadonlySet<string> = new Set(),
): EligibilityResult<T> {
  const zones = buildEntityScoreContext(rawAnalysis)
  const nameCounts = new Map<string, number>()
  for (const row of rows) {
    const key = normalizeFullName(row.full_name)
    if (!key) continue
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
  }

  const eligible: T[] = []
  const excluded: EligibilityExclusion[] = []

  for (const row of rows) {
    // #2295.3 — permission : un contact écarté (excluded_at) ou masqué
    // (hidden) n'est pas mal classé, il ne participe pas au classement.
    if (row.hidden || row.excluded_at) {
      excluded.push({ contact_id: row.id, reason: 'permission_denied' })
      continue
    }

    // #2126.50/.56/.58 — un outcome `incorrect_contact` a été enregistré sur
    // cette fiche : elle désigne la mauvaise personne, elle ne participe plus
    // au classement ni aux recommandations. Vérifié AVANT l'historique et les
    // homonymes : une fiche incorrecte n'a pas à passer par ces portes-là.
    if (flaggedIncorrectContactIds.has(row.id)) {
      excluded.push({ contact_id: row.id, reason: 'flagged_incorrect_contact' })
      continue
    }

    // #2160.53 — une personne HISTORIQUE (ex-employé) est un capteur du réseau,
    // pas l'org actuel : elle ne doit jamais être recommandée comme actuelle,
    // aussi enrichie soit sa fiche (même doctrine que `computeContactLifecycleState`,
    // `classified-data.ts:785`).
    if (row.lifecycle_state === 'historique') {
      excluded.push({ contact_id: row.id, reason: 'former_employee' })
      continue
    }

    // #2160.60 — un doute d'identité RESTE une porte, sauf s'il a été LEVÉ à la
    // main, sur CETTE fiche, pour CETTE raison précise (`isAuthorizedFor`).
    const nameKey = normalizeFullName(row.full_name)
    if (nameKey && (nameCounts.get(nameKey) ?? 0) > 1 && !isAuthorizedFor(row, 'homonym_conflict')) {
      excluded.push({ contact_id: row.id, reason: 'homonym_conflict' })
      continue
    }

    if (zones.size > 0 && row.entity) {
      const zone = lookupEntityZone(zones, row.entity)
      const relevance = (zone.relevance ?? '').toLowerCase()
      if (OUT_OF_ENTITY_RELEVANCE.has(relevance) && !isAuthorizedFor(row, 'entity_mismatch')) {
        excluded.push({ contact_id: row.id, reason: 'entity_mismatch' })
        continue
      }
    }

    eligible.push(row)
  }

  return { eligible, excluded }
}
