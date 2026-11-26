import { z } from 'zod'

/**
 * LES DIX ÉTATS D'ÉCRAN — PDF 1 §2 (« Socle : primitives, contrats, gardes »).
 *
 * « Chaque écran déclare son état. Aucun écran ne rend un tableau vide sans
 * état déclaré. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE CONTRAT N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS {@link ROUTE_ACCESS_STATES} (`route-access.ts`), qui porte cinq
 * états d'ACCÈS : le droit d'entrer sur l'écran. Ici, on est entré ; la question
 * est l'état de la DONNÉE. Deux axes, deux contrats — un écran `ready` côté
 * accès peut très bien être `empty_never` côté donnée, et un écran
 * `plan_locked` n'a aucun état de donnée puisqu'il n'en charge aucune.
 *
 * Deux valeurs portent le même nom dans les deux listes (`permission`,
 * `no_integration`) et ce n'est pas une redite : côté accès, elles ferment la
 * porte AVANT le chargement ; ici, elles expliquent pourquoi la liste chargée
 * est vide alors que l'écran s'est ouvert. Une portée manquante sur UN
 * connecteur ne ferme pas `/contacts`, elle en vide une colonne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DIFFÉRENCE QUI COMPTE (§2.2)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Confondre les deux est l'erreur la plus fréquente. Le premier appelle une
 * action de création, le second une action de filtre. »
 *
 * C'est la faute que ce dépôt combat sous un autre nom — « cassé et non
 * mesurable se ressemblent ». Un écran vide qui ne dit pas lequel des deux il
 * est accuse l'utilisateur d'un vide qu'il n'a pas créé, et lui propose le
 * mauvais geste : GA-106 a mesuré, en production, un `/accounts?lifecycle=…`
 * qui proposait de LANCER UNE ANALYSE — 8 crédits — pour un problème dont la
 * sortie était de retirer un filtre.
 */
export const UI_STATES = [
  /** En cours. */
  'loading',
  /** Rien n'a jamais existé. Le geste est une CRÉATION. */
  'empty_never',
  /** Un filtre a produit du vide. Le geste est un FILTRE. */
  'empty_true',
  /** Une partie est là, une partie manque — et §2.3 exige qu'elle soit NOMMÉE. */
  'partial',
  /** La donnée est vieille. */
  'stale',
  /** Un connecteur manque. */
  'no_integration',
  /** L'utilisateur n'a pas le droit. */
  'permission',
  /** En attente d'une validation. */
  'approval_required',
  /** Ça a échoué — §2.4 exige que le geste de reprise soit nommé. */
  'error',
  /** Ça a réussi. */
  'success',
] as const

export const uiStateSchema = z.enum(UI_STATES)
export type UiState = (typeof UI_STATES)[number]

/** Le geste proposé à côté de l'état. */
const screenStateActionSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
})
export type ScreenStateAction = z.infer<typeof screenStateActionSchema>

/**
 * L'état déclaré d'un écran.
 *
 * Deux invariants de la source sont portés par le SCHÉMA, pas par une
 * convention : un `partial` sans `detail` et une `error` sans `action` sont
 * REFUSÉS. Écrits en commentaire, ils auraient duré trois semaines — « données
 * incomplètes » et « une erreur est survenue » sont précisément les deux
 * phrases que §2.3 et §2.4 interdisent.
 */
export const screenStateSchema = z
  .object({
    state: uiStateSchema,
    /** En français à l'écran (le rendu passe par i18n), jamais un code. */
    message: z.string().min(1),
    action: screenStateActionSchema.nullable(),
    /** Ce qui manque, NOMMÉ. */
    detail: z.string().min(1).nullable(),
  })
  .refine(value => value.state !== 'partial' || value.detail !== null, {
    message: 'partial nomme ce qui manque — jamais « données incomplètes »',
    path: ['detail'],
  })
  .refine(value => value.state !== 'error' || value.action !== null, {
    message: 'error nomme le geste de reprise — jamais « une erreur est survenue »',
    path: ['action'],
  })
export type ScreenState = z.infer<typeof screenStateSchema>

/**
 * Les faits à partir desquels un écran DÉRIVE son état.
 *
 * Ils sont volontairement bruts : c'est la dérivation qui est partagée, pas
 * l'interprétation. Un écran qui choisirait son état à la main réinventerait
 * `empty_never` vs `empty_true` — et il le réinventerait faux, comme
 * `/accounts` l'a fait pendant des mois.
 */
export type ScreenStateFacts = {
  isLoading: boolean
  /** La lecture a échoué. */
  failed: boolean
  /** L'utilisateur a le droit de lire ce que l'écran montre. */
  canRead: boolean
  /** L'écran dépend d'un connecteur pour avoir quoi que ce soit à montrer. */
  needsIntegration: boolean
  /** Ce connecteur est branché. Ignoré si `needsIntegration` est faux. */
  integrationConnected: boolean
  /** Quelque chose attend une validation humaine. */
  awaitingApproval: boolean
  /**
   * L'écran a-t-il DÉJÀ été alimenté, filtres retirés ?
   *
   * `null` = on ne sait pas. Ce n'est PAS « jamais » : sans la réponse, on
   * n'affirme pas que l'utilisateur n'a rien fait. Voir {@link resolveScreenState}.
   */
  everHadRows: boolean | null
  /** Ce que l'écran rend RÉELLEMENT, filtres appliqués. */
  visibleRows: number
  /** Un filtre, une recherche ou une portée réduit la population affichée. */
  isNarrowed: boolean
  /** Les blocs/sources absents, NOMMÉS. Vide = rien ne manque. */
  missingParts: readonly string[]
  /** Quand la donnée a été calculée (RFC 3339). `null` = pas daté. */
  computedAt: string | null
  /**
   * Combien de jours la donnée reste fraîche. `null` = aucune durée de vie
   * déclarée — et alors RIEN ne périme : on ne devine pas une péremption.
   */
  freshForDays: number | null
  now: Date
}

/** Âge en jours pleins, ou `null` si la date est illisible. */
function ageInDays(iso: string, now: Date): number | null {
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return null
  return Math.floor((now.getTime() - at) / 86_400_000)
}

/**
 * L'état d'un écran, dérivé de ce qu'il sait.
 *
 * L'ORDRE est la règle. Il est écrit du plus « bloquant » au plus anodin, et
 * chaque rang répond à une question que le suivant n'a plus le droit de poser :
 *
 *  1. `loading`  — on ne qualifie pas un vide qu'on est en train de charger
 *                  (« un zéro de chargement ressemble à un vrai zéro »).
 *  2. `permission` — un refus de lecture n'est JAMAIS un vide. Dire « aucun
 *                  contact » à qui n'a pas le droit d'en voir est un mensonge.
 *  3. `no_integration` — idem : « rien trouvé » ≠ « rien branché ».
 *  4. `error`    — un échec n'est jamais un vide (PDF 7 §3 : « une erreur se
 *                  remarque, une liste vide se croit »).
 *  5. `approval_required` — l'écran a du contenu, mais il attend quelqu'un.
 *  6. `empty_*`  — le vide, et lequel des deux.
 *  7. `partial`  — il y a des lignes, mais une partie manque.
 *  8. `stale`    — il y a tout, mais c'est vieux.
 *  9. `success`.
 *
 * ⚠️ `partial` passe AVANT `stale` : une donnée à trous et vieille est d'abord
 * à trous — la vieillesse se rattrape en relançant, le trou non.
 */
export function resolveScreenState(facts: ScreenStateFacts): UiState {
  if (facts.isLoading) return 'loading'
  if (!facts.canRead) return 'permission'
  if (facts.needsIntegration && !facts.integrationConnected) return 'no_integration'
  if (facts.failed) return 'error'
  if (facts.awaitingApproval) return 'approval_required'

  if (facts.visibleRows <= 0) {
    // La question exacte : l'écran a-t-il déjà eu des lignes SANS filtre ?
    //  - `false` → jamais alimenté. Même avec un filtre posé, le retirer ne
    //    rendrait rien : on invite à commencer.
    //  - `true`  → alimenté ; s'il est vide maintenant, c'est le filtre.
    //  - `null`  → on ne sait pas. On ne prétend pas que l'utilisateur n'a rien
    //    fait ; un filtre posé suffit à expliquer le vide, et c'est ce qu'on dit.
    if (facts.everHadRows === false) return 'empty_never'
    if (facts.isNarrowed) return 'empty_true'
    return 'empty_never'
  }

  if (facts.missingParts.length > 0) return 'partial'

  if (facts.computedAt !== null && facts.freshForDays !== null) {
    const age = ageInDays(facts.computedAt, facts.now)
    if (age !== null && age > facts.freshForDays) return 'stale'
  }

  return 'success'
}
