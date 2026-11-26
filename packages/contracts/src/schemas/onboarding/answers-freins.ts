import { z } from 'zod'
import { ONBOARDING_MAX_MULTI } from './limits.js'

/**
 * Ce qui empêche réellement d'avancer — #2055.
 *
 * `main_sales_pain` demande LE plus gros frein (un seul, et c'est bien ce qu'on
 * veut savoir en premier). Il manquait ce que la demande appelle la suite : les
 * quelques freins qui pèsent vraiment, du texte libre pour celui qui n'est pas
 * dans la liste, et les trois relances qui font la différence entre un
 * SYMPTÔME et un goulot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SYMPTÔME N'EST PAS LE GOULOT (#2055.16)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Je n'ai pas le temps » est un symptôme. Ce qui a été essayé, ce qui s'est
 * arrêté et pourquoi est ce qui approche du goulot. {@link readSalesFreins} les
 * rend SÉPARÉMENT et n'en déduit jamais l'un depuis l'autre : rendre un
 * diagnostic à partir d'une case cochée serait exactement ce que la demande
 * reproche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « NON MESURÉ » N'EST JAMAIS « 0 »
 * ─────────────────────────────────────────────────────────────────────────────
 * Un frein non renseigné n'est pas un frein absent. La lecture rend `null` — et
 * surtout pas une liste vide, qui se lirait « ce commercial n'a aucun frein » et
 * ferait dire au produit l'inverse de la vérité. Gardes GA-18 / GA-19.
 */

/**
 * Les seize freins de la demande, dans son ordre. Chaque libellé est
 * SELF-DESCRIPTIF : il est persisté verbatim dans `esn_profiles.sales_freins` et
 * relu hors de tout contexte, donc « Temps » seul ne dirait rien.
 *
 * ⚠️ Aucun nom d'outil, ni le nôtre ni celui d'un éditeur — le frein « outils »
 * (#2055.10) nomme ce qui coince (« mes informations sont éparpillées »), pas
 * un produit. Garde : `answers-freins.test.ts`.
 *
 * Le ciblage et le discours (#2055.3 / #2055.4) sont déjà proposés par
 * `main_sales_pain` ; ils restent dans CETTE liste parce qu'une liste de freins
 * amputée de deux d'entre eux forcerait à passer par « Autre » pour les deux
 * plus courants.
 */
export const SALES_FREIN_CHOICES = [
  // #2055.1
  "Le temps : je n'ai pas le temps de prospecter",
  // #2055.2
  "L'accès : je n'arrive pas à joindre les bons interlocuteurs",
  // #2055.3 (déjà proposé par `main_sales_pain`, gardé pour que la liste tienne debout)
  'Le ciblage : je ne sais pas quels comptes attaquer',
  // #2055.4 (idem)
  'Le discours : je ne sais pas quoi leur dire',
  // #2055.5
  'Le suivi : je perds le fil de mes relances',
  // #2055.6
  "Le réseau : je n'ai pas d'entrée dans ces entreprises",
  // #2055.7
  "Le vivier : je n'ai pas les profils à proposer",
  // #2055.8
  'La qualification : je passe du temps sur des besoins qui n’aboutissent pas',
  // #2055.9
  'La marge : je signe, mais à des conditions trop basses',
  // #2055.10
  'Les outils : mes informations sont éparpillées ou mal tenues',
  // #2055.11
  'L’équipe : nous ne sommes pas coordonnés sur les mêmes comptes',
  // #2055.11
  'La confiance : je n’ose pas assez pousser',
  // #2055.12
  'La priorisation : je ne sais pas par quoi commencer',
  // #2055.12
  'Les preuves : je n’ai pas de références à montrer',
  // #2055.13
  'L’appel : décrocher le téléphone me coûte',
  // #2055.13
  'Les achats : je bute sur le référencement et les processus d’achat',
] as const

/**
 * Les 4 colonnes — migration `1794024403057-FreinsCommerciaux`. Toutes
 * ADDITIVES, aucune obligatoire : la sous-étape se passe sans bloquer.
 */
export const FREINS_ANSWER_FIELDS = {
  // #2055.1-.14 — les freins cochés, plus le texte libre (`allowOther` côté
  // question) qui atterrit dans le même tableau : ce que l'utilisateur écrit
  // lui-même n'est pas rangé ailleurs que ce qu'il coche.
  sales_freins: z.array(z.string()).optional(),
  // #2055.15 — « Qu'as-tu déjà essayé ? »
  frein_attempted: z.string().nullable().optional(),
  // #2055.15 — « Qu'est-ce qui s'est arrêté ? »
  frein_stopped: z.string().nullable().optional(),
  // #2055.15 — « Pourquoi ? »
  frein_stopped_reason: z.string().nullable().optional(),
}

/** Ce que les trois relances font apparaître. Chaque champ non répondu reste
 *  `null` — il n'est jamais reconstitué depuis ses voisins. */
type FreinBottleneck = {
  attempted: string | null
  stopped: string | null
  reason: string | null
}

/**
 * #2055.16 — la lecture des freins, symptôme et goulot NOMMÉS séparément.
 *
 * `symptom` : ce que le commercial DÉCLARE. `bottleneck` : la piste qu'ouvrent
 * les trois relances. Les deux valent `null` quand rien n'a été répondu, jamais
 * une liste vide ni une chaîne vide.
 */
export type SalesFreinReading = {
  symptom: readonly string[] | null
  bottleneck: FreinBottleneck | null
}

/** Chaîne non vide une fois rognée, `null` sinon — jamais `''`, qui se lirait
 *  comme une réponse donnée. */
const trimmed = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

type FreinAnswers = {
  sales_freins?: readonly string[] | null
  frein_attempted?: string | null
  frein_stopped?: string | null
  frein_stopped_reason?: string | null
}

/** #2055.16 — voir {@link SalesFreinReading}. Pure, tolérante à une charge
 *  utile inattendue, et elle n'invente rien. */
export function readSalesFreins(answers: FreinAnswers): SalesFreinReading {
  const declared = Array.isArray(answers.sales_freins) ? answers.sales_freins : []
  const symptom = declared.map(trimmed).filter((value): value is string => value !== null)

  const attempted = trimmed(answers.frein_attempted)
  const stopped = trimmed(answers.frein_stopped)
  const reason = trimmed(answers.frein_stopped_reason)
  const answered = attempted !== null || stopped !== null || reason !== null

  return {
    // « Non mesuré » n'est pas « 0 » : aucune réponse ⇒ `null`, jamais `[]`.
    symptom: symptom.length > 0 ? symptom : null,
    bottleneck: answered ? { attempted, stopped, reason } : null,
  }
}
