import { z } from 'zod'
import { isValidProtectedTime } from './protected-time.js'
import { isValidAgendaPreferences } from './agenda-preferences.js'
import {
  isMessageApproach,
  MESSAGE_APPROACH_PREFERENCE_KEY,
  MESSAGE_APPROACH_VALUES,
} from './message-approach-preference.js'
import { ENRICHMENT_COST_PREFERENCE_KEY } from './enrichment-cost-preference.js'

/**
 * #1928.2/.3/.5/.6 — LA FAÇON DONT LAURA TE RÉPOND, RÉGLÉE PAR TOI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ ÇA VIT, ET POURQUOI PAS AILLEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * Dans le sac `user_preferences` (une rangée par personne, JSONB, sans
 * `workspace_id` — `user-preference.entity.ts`). Ce sac existait déjà : il est
 * relu à CHAQUE tour par `ChatContextService.loadMemory`, envoyé au service IA
 * sous `user_preferences`, montré et effaçable dans Réglages › Mémoire de Laura,
 * et vidé par « Tout oublier ». Quatre clés de plus n'ouvrent donc ni table, ni
 * migration, ni second chemin vers le prompt — et la préférence reste
 * PERSONNELLE (#1928.8), jamais celle de l'espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS ICI, EXPRÈS
 * ─────────────────────────────────────────────────────────────────────────────
 *  · la LANGUE (#1928.4) : décision du 12/09/2026, Laura répond dans la langue
 *    de l'INTERFACE. Elle vit dans Réglages › Préférences (un réglage à un seul
 *    endroit, GA-26) ; l'écran de Laura y renvoie par un lien.
 *  · le TUTOIEMENT (#1928.1) : fixe dans l'app, c'est l'identité de Laura. Les
 *    messages EXTERNES gardent leur tu/vous, qui ne se règle pas ici.
 *  · les TABLEAUX (#1928.5) : le rendu des réponses (`features/chat/view/
 *    markdown.tsx`) ne sait pas afficher un tableau — une ligne `| a | b |` s'y
 *    lit avec ses barres. Proposer « tableaux » promettrait un format que
 *    l'écran montrerait cassé. La valeur s'ajoutera EN FIN de liste le jour où
 *    le rendu existe (un enum ne perd jamais de valeur, n'en insère jamais au
 *    milieu).
 *
 * ⚠️ Le service IA n'a pas ce paquet à l'exécution : il en porte une COPIE
 * (`apps/ia/app/prompts/reply_preferences.py`), et `test_reply_preferences.py`
 * relit CE fichier pour vérifier qu'elles ne divergent pas. Garder la forme
 * `clé: ['valeur', 'valeur'],` sur une ligne — c'est ce que la garde lit.
 */
export const REPLY_PREFERENCE_OPTIONS = {
  replyLength: ['short', 'detailed'],
  replyTone: ['direct', 'teaching'],
  replyFormat: ['text', 'lists'],
  replySources: ['minimal', 'detailed'],
} as const

export type ReplyPreferenceKey = keyof typeof REPLY_PREFERENCE_OPTIONS

/** L'ordre d'AFFICHAGE — explicite, jamais dérivé de `Object.keys`. */
export const REPLY_PREFERENCE_KEYS: readonly ReplyPreferenceKey[] = [
  'replyLength',
  'replyTone',
  'replyFormat',
  'replySources',
]

export type ReplyPreferences = { [K in ReplyPreferenceKey]?: (typeof REPLY_PREFERENCE_OPTIONS)[K][number] }

export function isReplyPreferenceKey(key: string): key is ReplyPreferenceKey {
  return (REPLY_PREFERENCE_KEYS as readonly string[]).includes(key)
}

function isKnownValue(key: ReplyPreferenceKey, value: unknown): boolean {
  return typeof value === 'string' && (REPLY_PREFERENCE_OPTIONS[key] as readonly string[]).includes(value)
}

/**
 * Lecture TOLÉRANTE du sac. Une clé absente, ou portant une valeur inconnue
 * (écrite par un appelant d'avant la validation, ou corrompue), est ABSENTE :
 * jamais ramenée à une valeur devinée. Absent veut dire « comme avant ce lot ».
 */
export function readReplyPreferences(bag: Record<string, unknown> | null | undefined): ReplyPreferences {
  const out: Record<string, string> = {}
  if (!bag || typeof bag !== 'object') return out
  for (const key of REPLY_PREFERENCE_KEYS) {
    const value = bag[key]
    if (isKnownValue(key, value)) out[key] = value as string
  }
  return out as ReplyPreferences
}

/**
 * Le sac de `PATCH /memory/preferences`. Il reste LIBRE — d'autres clés y
 * vivent déjà — sauf pour les quatre clés de réponse, `protectedTime`
 * (#2101.13, `protected-time.ts`) et `agendaPreferences` (#2101.17,
 * `agenda-preferences.ts`) : une valeur inconnue y est refusée à la
 * porte (400) plutôt que stockée puis ignorée en silence. Effacer une
 * préférence ne passe pas par `null` : c'est
 * `DELETE /memory/ledger/preferences/:clé`, qui retire la clé du sac.
 */
export const userPreferencesPatchSchema = z.record(z.string(), z.unknown()).superRefine((bag, ctx) => {
  for (const key of REPLY_PREFERENCE_KEYS) {
    if (!(key in bag)) continue
    if (!isKnownValue(key, bag[key])) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `Valeur inconnue pour ${key} : attendu ${REPLY_PREFERENCE_OPTIONS[key].join(' ou ')}.`,
      })
    }
  }
  // #4060 — « approche directe » des messages : une valeur inconnue est refusée à la porte.
  if (MESSAGE_APPROACH_PREFERENCE_KEY in bag && !isMessageApproach(bag[MESSAGE_APPROACH_PREFERENCE_KEY])) {
    ctx.addIssue({
      code: 'custom',
      path: [MESSAGE_APPROACH_PREFERENCE_KEY],
      message: `Valeur inconnue pour ${MESSAGE_APPROACH_PREFERENCE_KEY} : attendu ${MESSAGE_APPROACH_VALUES.join(' ou ')}.`,
    })
  }
  // #4016.L8b — « ne plus me demander » le coût : seule la valeur `true` se pose (la retirer = DELETE).
  if (ENRICHMENT_COST_PREFERENCE_KEY in bag && bag[ENRICHMENT_COST_PREFERENCE_KEY] !== true) {
    ctx.addIssue({
      code: 'custom',
      path: [ENRICHMENT_COST_PREFERENCE_KEY],
      message: `Valeur inconnue pour ${ENRICHMENT_COST_PREFERENCE_KEY} : attendu true (le retrait passe par DELETE).`,
    })
  }
  if ('protectedTime' in bag && !isValidProtectedTime(bag.protectedTime)) {
    ctx.addIssue({
      code: 'custom',
      path: ['protectedTime'],
      message:
        'Temps protégé invalide : attendu { startMinute, endMinute } avec startMinute < endMinute, dans 0..1440.',
    })
  }
  if ('agendaPreferences' in bag && !isValidAgendaPreferences(bag.agendaPreferences)) {
    ctx.addIssue({
      code: 'custom',
      path: ['agendaPreferences'],
      message: "Préférences d'agenda invalides : attendu { dossierDurationMinutes (15..240), reserveSlots (0..10) }.",
    })
  }
})
