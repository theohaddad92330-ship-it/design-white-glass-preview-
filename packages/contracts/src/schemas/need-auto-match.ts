import { z } from 'zod'
import { needMatcherGate, type NeedMatcherGateInput } from './need-matcher-gate.js'
import type { RoutineKey } from './routines.js'

/**
 * #2916 / #2399.2 — « MATCHER UN BESOIN ENTRANT », écrit AUTOMATIQUEMENT.
 *
 * DÉCISION LOUIS 11/10/2026 (`c93_matching_auto_besoin_entrant`) : à chaque
 * besoin qui ENTRE dans un espace (saisie, import, compte-rendu de rendez-vous,
 * appel d'offres, Laura…), un `MatchRun` est écrit sans geste humain, quand
 * l'automatisation est activée dans l'espace. ⚠️ RENVERSEMENT DATÉ, pour CETTE
 * automatisation seulement, de la règle « les routines PRÉPARENT, aucune
 * n'écrit » (N1) : rien ne SORT pour autant — le copilote n'envoie toujours
 * aucun e-mail, le résultat reste un journal interne lu sur la fiche besoin.
 *
 * Ce fichier porte le vocabulaire (statuts, plafond) et la décision PURE
 * « que faire d'un besoin qui arrive » — l'API l'applique, l'écran la lit.
 */

/** La routine du catalogue qui porte l'interrupteur. `satisfies` : une clé
 *  renommée au catalogue ne compile plus ici. */
export const NEED_AUTO_MATCH_ROUTINE_KEY = 'incoming_need_matching' as const satisfies RoutineKey

/**
 * Le sort d'UN besoin entrant — une ligne par besoin, jamais deux (c'est la
 * clé de l'idempotence : un ré-import, un événement rejoué ou une tentative
 * BullMQ de plus ne produisent pas un second run automatique).
 *
 *  - `queued`      — en file, pas encore classé ;
 *  - `done`        — le `MatchRun` est écrit (`runId`) ;
 *  - `unknown`     — délai dépassé : un timeout n'est PAS un échec, la reprise
 *                    s'arrête (doctrine), et une issue tardive remplace
 *                    l'inconnu si le classement finit par s'écrire ;
 *  - `failed`      — échec observé après les tentatives ;
 *  - `capped`      — plafond quotidien de l'espace atteint, rien lancé ;
 *  - `no_criteria` — aucune compétence saisie : même règle que le bouton
 *                    « Lancer le matching » (`needMatcherGate`), rien lancé.
 *
 * GA-08 : les ajouts vont en FIN de liste. GA-12 : la contrainte SQL
 * `need_auto_matches_status_check` couvre chacune de ces valeurs.
 */
export const NEED_AUTO_MATCH_STATUSES = ['queued', 'done', 'unknown', 'failed', 'capped', 'no_criteria'] as const
export const needAutoMatchStatusSchema = z.enum(NEED_AUTO_MATCH_STATUSES)
export type NeedAutoMatchStatus = z.infer<typeof needAutoMatchStatusSchema>

/**
 * LE COÛT, BORNÉ ET NOMMÉ — à un seul endroit (GA-26).
 *
 * Le classement est DÉTERMINISTE : zéro appel modèle, zéro crédit débité (même
 * règle que le matching manuel, `MatchingService`). Ce qu'il coûte est du
 * calcul et des lectures du vivier entier, par besoin : un import de mille
 * lignes ne doit pas lancer mille classements dans la journée. Au-delà de ce
 * nombre de runs automatiques par espace et par jour (UTC), le besoin est
 * marqué `capped` et la fiche le DIT — le matching manuel reste ouvert.
 * Même ordre de grandeur que le plafond d'un lot de matching massif.
 */
export const AUTO_NEED_MATCH_DAILY_CAP = 200

/**
 * La décision à l'ARRIVÉE d'un besoin, quand l'automatisation est active.
 * Pure : l'API lui passe le besoin et le nombre de runs automatiques déjà
 * lancés aujourd'hui dans l'espace.
 */
export function needAutoMatchArrivalStatus(
  need: NeedMatcherGateInput,
  launchedToday: number,
): Extract<NeedAutoMatchStatus, 'queued' | 'capped' | 'no_criteria'> {
  if (!needMatcherGate(need).canLaunch) return 'no_criteria'
  if (launchedToday >= AUTO_NEED_MATCH_DAILY_CAP) return 'capped'
  return 'queued'
}

/** Ce que la fiche besoin lit : le sort du run automatique, et son résumé. */
export const needAutoMatchSchema = z.object({
  status: needAutoMatchStatusSchema,
  runId: z.string().guid().nullable(),
  /** Quand le besoin est entré — le moment où l'automatisation l'a pris. */
  launchedAt: z.string(),
  /** Quand l'issue est connue ; `null` tant qu'elle ne l'est pas. */
  settledAt: z.string().nullable(),
  /** `null` = pas de run écrit (jamais « 0 », GA-18/GA-19). */
  evaluatedCount: z.number().int().min(0).nullable(),
  recommendedCount: z.number().int().min(0).nullable(),
  borderlineCount: z.number().int().min(0).nullable(),
})
export type NeedAutoMatch = z.infer<typeof needAutoMatchSchema>
