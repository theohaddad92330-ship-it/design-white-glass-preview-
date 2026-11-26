import {
  hasEnoughSessionsToPublish,
  UNROUTED_INTENT_CATEGORIES,
  type LauraContextKind,
  type LauraPageContext,
  type UnroutedIntentCategory,
} from '@bellum/contracts'

/**
 * #1949.23 — décision Louis 13/09 batch 12 : « Enregistrer anonymement
 * l'intention non reconnue ». Les faits PURS de la trace : ce que l'API accepte
 * du moteur IA, ce qu'elle rend au navigateur, ce que le back-office peut lire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE DÉCISION LÈVE, ET POUR CE SEUL USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle 2 de `c64_analytique_produit` — « AUCUN CONTENU » — interdisait
 * d'écrire ce qu'une personne a saisi. Louis la lève, CONTRE la recommandation,
 * pour la SEULE demande que Laura n'a pas su router, et assume le traitement
 * AVANT la relecture juridique RGPD, qui reste due. Tout le reste de c64 tient,
 * et GA-264 (`product-tracker-emits-no-content.spec.ts`) refuse une seconde
 * table d'analytique qui porterait un texte de demande.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES GARDE-FOUS, CHACUN TENU EN CODE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - Le texte est MASQUÉ côté moteur IA (e-mails, téléphones, secrets, IBAN —
 *    `apps/ia/app/services/unrouted_intent.py`, qui réutilise les deux
 *    masquages existants) et BORNÉ à {@link UNROUTED_INTENT_TEXT_MAX_CHARS}
 *    caractères — re-borné ICI : la défense ne repose pas sur le seul moteur.
 *  - Aucun `user_id`, aucun `workspace_id` en clair : la table n'en a pas la
 *    colonne. Au plus un hash d'(espace, jour) tourné à 24 h
 *    (`hashBehavioralSession`, le même que le traceur), qui sert UNIQUEMENT à
 *    compter des occurrences DISTINCTES pour le plancher de lecture.
 *  - Le plancher est appliqué à la LECTURE ({@link publishUnroutedGroups}) :
 *    sous `MIN_DISTINCT_SESSIONS_FOR_A_METRIC` occurrences distinctes, le TEXTE
 *    d'un groupe ne sort pas — seul le nombre de groupes retenus. GA-267.
 *  - Rétention bornée à {@link LAURA_UNROUTED_INTENTS_RETENTION_DAYS} jours,
 *    purgée par le balayage RGPD quotidien (`privacy-retention.service.ts`).
 *  - Rien n'est écrit depuis une salle de DÉMONSTRATION (refus au contrôleur,
 *    `ia-proxy.controller.ts`).
 *
 * ⚠️ EFFACEMENT DE COMPTE ET EXPORT : il n'y a RIEN à y chercher. La table ne
 * porte aucune colonne d'identité — ni utilisateur, ni espace —, donc
 * `PrivacyDeletionService` n'a aucun filtre possible et `PrivacyExportService`
 * aucune ligne à rendre à une personne. Ce n'est pas un oubli : prouvé par
 * `laura-unrouted-intents.service.spec.ts` (« aucune colonne d'identité »).
 * Le RISQUE RÉSIDUEL, dit en clair : le masquage ne reconnaît pas un NOM de
 * personne ou de société écrit dans la demande ; c'est le plancher de lecture
 * qui l'empêche d'atteindre un écran, pas le masquage.
 */

/** Le texte stocké, au plus — contrainte `laura_unrouted_intents_text_masked_length`. */
export const UNROUTED_INTENT_TEXT_MAX_CHARS = 300

/** Combien de jours une trace vit avant la purge RGPD quotidienne. */
export const LAURA_UNROUTED_INTENTS_RETENTION_DAYS = 90

/** Le signal tel qu'il traverse — une catégorie (`UNROUTED_INTENT_CATEGORIES`,
 *  `@bellum/contracts`) et un texte déjà masqué. Local. */
type UnroutedSignal = { category: UnroutedIntentCategory; text: string }

/** La clé que le moteur IA pose dans `data` d'un tour. */
const SIGNAL_KEY = 'unrouted_intent'

function isCategory(value: unknown): value is UnroutedIntentCategory {
  return typeof value === 'string' && (UNROUTED_INTENT_CATEGORIES as readonly string[]).includes(value)
}

/** Borne en POINTS DE CODE — ce que compte `char_length` côté Postgres. */
function truncate(text: string): string {
  return Array.from(text).slice(0, UNROUTED_INTENT_TEXT_MAX_CHARS).join('')
}

/**
 * Le signal d'un tour, ou `null`. Seuls `category` et `text` traversent : un
 * champ d'identité glissé par erreur dans l'enveloppe est perdu, quel que soit
 * son nom (liste blanche, pas liste noire).
 */
export function readUnroutedSignal(data: Record<string, unknown> | null | undefined): UnroutedSignal | null {
  const raw = data?.[SIGNAL_KEY]
  if (!raw || typeof raw !== 'object') return null
  const { category, text } = raw as Record<string, unknown>
  if (!isCategory(category) || typeof text !== 'string') return null
  const bounded = truncate(text.trim())
  if (!bounded) return null
  return { category, text: bounded }
}

/**
 * L'enveloppe telle que le navigateur la reçoit : sans le signal. Rend le MÊME
 * objet quand il n'y a rien à retirer — le chemin d'avant, byte-identique.
 */
export function withoutUnroutedSignal<T extends Record<string, unknown>>(data: T): T {
  if (!Object.hasOwn(data, SIGNAL_KEY)) return data
  const copy: Record<string, unknown> = { ...data }
  delete copy[SIGNAL_KEY]
  return copy as T
}

/**
 * La clé de regroupement : casse, accents, ponctuation et espaces pliés. Les
 * jetons de masquage (`[email masqué]`) restent des mots — deux demandes qui ne
 * diffèrent que par l'adresse masquée se regroupent.
 */
export function normalizeUnroutedText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * La NATURE de l'écran où la demande a été posée — jamais son titre (qui peut
 * nommer un compte) ni l'objet ouvert (un identifiant). `chat` quand l'écran
 * n'a rien déclaré.
 */
export function surfaceOf(pageContext: Partial<LauraPageContext> | null | undefined): LauraContextKind | 'chat' {
  return pageContext?.kind ?? 'chat'
}

/** La langue de l'interface, ou `null` — jamais « fr » par défaut. */
export function languageOf(value: string | null | undefined): 'fr' | 'en' | null {
  return value === 'fr' || value === 'en' ? value : null
}

/** Un groupe tel que la lecture agrégée le rend, AVANT le plancher. */
export type UnroutedGroupRow = {
  textNormalized: string
  /** Un texte masqué représentatif du groupe. */
  sample: string
  occurrences: number
  /** Occurrences DISTINCTES — (espace, jour) hachés, jamais des lignes. */
  distinctOccurrences: number
  surfaces: string[]
  categories: string[]
  languages: string[]
}

/** Un groupe publiable : le texte masqué, et ses comptes. Local (voir le rapport). */
type PublishedUnroutedGroup = {
  text: string
  occurrences: number
  distinctOccurrences: number
  surfaces: string[]
  categories: string[]
  languages: string[]
}

/**
 * Le plancher de LECTURE : un groupe sous le seuil d'occurrences distinctes ne
 * publie pas son texte. `withheldGroups` est un COMPTE, jamais un texte — pour
 * que l'écran dise « N demandes pas encore assez répétées pour être lues » et
 * non « rien n'a été demandé ».
 */
export function publishUnroutedGroups(rows: readonly UnroutedGroupRow[]): {
  published: PublishedUnroutedGroup[]
  withheldGroups: number
} {
  const published: PublishedUnroutedGroup[] = []
  let withheldGroups = 0
  for (const row of rows) {
    if (!hasEnoughSessionsToPublish(row.distinctOccurrences)) {
      withheldGroups += 1
      continue
    }
    published.push({
      text: row.sample,
      occurrences: row.occurrences,
      distinctOccurrences: row.distinctOccurrences,
      surfaces: row.surfaces,
      categories: row.categories,
      languages: row.languages,
    })
  }
  return { published, withheldGroups }
}
