import { z } from 'zod'
import { creditCostOf } from '../billing/credit-weights.js'
import { PLAN_STALE_DAYS } from './first-move.js'

/* ------------------------------------------------------------------ */
/*  Les SIX déclencheurs de rafraîchissement (T5.md:1117-1151).        */
/* ------------------------------------------------------------------ */

/**
 * Six CONDITIONS que le produit DÉTECTE, et qui proposent un rafraîchissement.
 *
 * ⚠️ À ne pas confondre avec les quatre DIMENSIONS de `refreshDimensionSchema`
 * (`signals` · `contacts` · `entities` · `strategy`). Celles-là sont un menu que
 * l'utilisateur ouvre quand il a déjà décidé de rafraîchir ; celles-ci sont des
 * conditions qui se remarquent toutes seules et viennent lui dire « il s'est
 * passé quelque chose ». Personne ne détectait rien avant : c'est le trou que
 * D210 nomme.
 *
 * ⚠️ **Ils PROPOSENT, ils n'exécutent JAMAIS** — `T5.md:1121` écrit « proposé,
 * jamais automatique », ce qui rejoint « ce qui n'écrit pas tout seul ». Un
 * rafraîchissement coûte des crédits : le déclencher sans un clic ferait payer
 * l'utilisateur pour une décision qu'il n'a pas prise. Aucune fonction de ce
 * fichier n'a de chemin d'écriture, et `RefreshTriggerProposal` ne porte aucun
 * champ qui ressemble à un ordre de marche — c'est vérifié par le test.
 *
 * ⚠️ GA-08 — l'ordre est FIGÉ et les ajouts vont en FIN.
 */
export const REFRESH_TRIGGERS = [
  /** « ≥ 3 signaux nouveaux » — un compte qui bouge trois fois n'est plus celui
   *  qu'on a analysé. En deçà, le bruit d'une veille quotidienne suffirait à
   *  proposer tous les jours, et une proposition permanente ne se lit plus. */
  'signals_new',
  /** « un décideur qui change de poste » — la personne visée par le chemin
   *  n'est plus là, ou n'est plus la bonne. */
  'decision_maker_moved',
  /** « une entité neuve au registre » — une filiale, un établissement : le
   *  périmètre du compte a changé. */
  'new_entity_in_registry',
  /** « un marché DECP attribué ou échu » — un titulaire entre ou sort. */
  'public_tender_changed',
  /** « le profil ESN modifié » — ce qu'on vend a changé, donc l'angle aussi.
   *  Rien du COMPTE n'a bougé ici : c'est nous. */
  'esn_profile_changed',
  /** « version > 90 j » — le dossier lui-même a vieilli. Le seul des six qui
   *  ne parle d'aucun événement : il parle du temps. */
  'dossier_stale',
] as const
export type RefreshTrigger = (typeof REFRESH_TRIGGERS)[number]

/**
 * Ce que coûte le rafraîchissement qu'un déclencheur propose, EN CRÉDITS.
 *
 * ⚠️ Aucun chiffre écrit ici : tout dérive de `CREDIT_WEIGHTS` (GA-26, et GA-51
 * qui relit ce fichier pour interdire un prix en dur). Cinq des six retombent
 * sur `targeted_refresh` — une dimension à 1, une paire à 2 ; le sixième est le
 * dossier entier, donc exactement `account_refresh`.
 *
 * Ce poids-là existait depuis des mois **sans qu'aucune route ne le débite** :
 * ce fichier est son premier appelant hors des tests.
 */
const TRIGGER_DIMENSION_COUNT: Readonly<Record<RefreshTrigger, number>> = {
  signals_new: 1, //           les signaux
  decision_maker_moved: 2, //  les contacts ET la stratégie
  new_entity_in_registry: 2, //les entités ET la stratégie
  public_tender_changed: 1, // les signaux
  esn_profile_changed: 1, //   la stratégie
  dossier_stale: 0, //         le dossier ENTIER — voir ci-dessous
}

export function refreshTriggerCost(trigger: RefreshTrigger): number {
  if (trigger === 'dossier_stale') return creditCostOf('account_refresh')
  return creditCostOf('targeted_refresh') * TRIGGER_DIMENSION_COUNT[trigger]
}

/** Une proposition — jamais un ordre. `observed` dit ce qui a été VU, pour que
 *  l'écran puisse justifier la dépense qu'il propose plutôt que l'affirmer. */
export interface RefreshTriggerProposal {
  trigger: RefreshTrigger
  costCredits: number
  /** Ce qui a été mesuré (« 4 signaux nouveaux », « profil modifié le … »). */
  observed: string
  /** Quand la détection a eu lieu — une proposition datée se périme aussi. */
  detectedAt: string
}

/** Ce que la détection a besoin de savoir. Chaque champ est une MESURE : un
 *  `null` veut dire « pas mesurable », et ne déclenche donc rien. */
export interface RefreshTriggerInputs {
  newSignals: number
  decisionMakersMoved: number
  newRegistryEntities: number
  tendersChanged: number
  /** Quand le profil de l'ESN a été modifié (`YYYY-MM-DD`), ou `null`. */
  esnProfileUpdatedAt: string | null
  /** Quand le dossier a été produit (`YYYY-MM-DD`), ou `null`. */
  dossierGeneratedAt: string | null
}

/** « Trois signaux » est le seuil de la source. Nommé, pas semé dans le code. */
const NEW_SIGNALS_THRESHOLD = 3

function daysBetween(from: string, to: Date): number | null {
  const at = new Date(from)
  if (Number.isNaN(at.getTime())) return null
  return (to.getTime() - at.getTime()) / (1000 * 60 * 60 * 24)
}

/**
 * Les six détecteurs, dans l'ordre figé, sur des mesures déjà faites.
 *
 * Pur, sans I/O : l'appelant mesure, celui-ci décide. Une mesure ABSENTE ne
 * déclenche rien — « non mesuré » n'est pas « périmé », et proposer une dépense
 * de quatre crédits parce qu'on ne sait pas dater un dossier ferait payer notre
 * propre trou à l'utilisateur.
 */
export function detectRefreshTriggers(inputs: RefreshTriggerInputs, now: Date): RefreshTriggerProposal[] {
  const detectedAt = now.toISOString()
  const proposals: RefreshTriggerProposal[] = []
  const propose = (trigger: RefreshTrigger, observed: string) =>
    proposals.push({ trigger, costCredits: refreshTriggerCost(trigger), observed, detectedAt })

  if (inputs.newSignals >= NEW_SIGNALS_THRESHOLD) propose('signals_new', String(inputs.newSignals))
  if (inputs.decisionMakersMoved > 0) propose('decision_maker_moved', String(inputs.decisionMakersMoved))
  if (inputs.newRegistryEntities > 0) propose('new_entity_in_registry', String(inputs.newRegistryEntities))
  if (inputs.tendersChanged > 0) propose('public_tender_changed', String(inputs.tendersChanged))

  // Le profil ne compte que s'il a bougé APRÈS le dossier : modifié avant, le
  // dossier en tient déjà compte. Sans date de dossier, on ne peut pas comparer
  // — et on se tait plutôt que de supposer.
  if (inputs.esnProfileUpdatedAt && inputs.dossierGeneratedAt) {
    if (inputs.esnProfileUpdatedAt > inputs.dossierGeneratedAt) {
      propose('esn_profile_changed', inputs.esnProfileUpdatedAt)
    }
  }

  if (inputs.dossierGeneratedAt) {
    const age = daysBetween(inputs.dossierGeneratedAt, now)
    // Le seuil de péremption du plan, réutilisé : un réglage vit à UN endroit.
    if (age !== null && age > PLAN_STALE_DAYS) propose('dossier_stale', inputs.dossierGeneratedAt)
  }

  return proposals
}

/* ------------------------------------------------------------------ */
/*  Le tiroir « ce qui a changé » — et sa section INCHANGÉ.            */
/* ------------------------------------------------------------------ */

/**
 * Les quatre sections du tiroir, et la raison d'être de la quatrième.
 *
 * ⚠️ **`unchanged` est OBLIGATOIRE** (`T5.md:1151`) : « sans elle, l'utilisateur
 * ne sait pas si le produit a vérifié ou s'il n'a rien regardé ». Un tiroir qui
 * ne montre que ce qui a bougé se lit comme une liste d'incidents ; dire « ces
 * huit champs ont été revérifiés et n'ont pas changé » est ce qui donne sa
 * valeur à « ces deux-là ont changé ».
 *
 * D213 l'écrit noir sur blanc : à poser d'emblée, pas en second temps — « un
 * tiroir livré sans elle sera livré sans elle pour de bon ». D'où le fait que
 * ce soit le SCHÉMA qui l'exige, et non une convention d'écran.
 */
export const ACCOUNT_CHANGE_SECTIONS = ['changed', 'appeared', 'disappeared', 'unchanged'] as const

const changedFieldSchema = z.object({
  field: z.string().min(1),
  before: z.string().nullable(),
  after: z.string().nullable(),
})

/**
 * Un fait qui n'est PLUS rendu par les sources.
 *
 * « On archive, on ne supprime pas » : il redevient inconnu AVEC sa date, il ne
 * s'efface pas. D'où `lastKnownValue` et `lastKnownAt`, tous deux requis — une
 * disparition sans sa dernière valeur connue serait une perte sèche, et sans sa
 * date on ne saurait pas de quand date ce qu'on a perdu.
 */
const disappearedFieldSchema = z.object({
  field: z.string().min(1),
  lastKnownValue: z.string().min(1),
  lastKnownAt: z.string().min(1),
})

export const accountChangeDigestSchema = z
  .object({
    /** Quand la comparaison a été faite. */
    comparedAt: z.string().min(1),
    changed: z.array(changedFieldSchema),
    appeared: z.array(changedFieldSchema),
    disappeared: z.array(disappearedFieldSchema),
    /** Les champs REVÉRIFIÉS et identiques. Obligatoire — voir le docblock de
     *  {@link ACCOUNT_CHANGE_SECTIONS}. */
    unchanged: z.array(z.string().min(1)),
  })
  .superRefine((digest, ctx) => {
    // Quatre sections vides ne sont pas une vérification : ce serait un écran
    // qui se tait en ayant l'air d'avoir travaillé. Un tiroir existe parce que
    // quelque chose a été REGARDÉ — au minimum, quelque chose d'inchangé.
    const looked = digest.changed.length + digest.appeared.length + digest.disappeared.length + digest.unchanged.length
    if (looked === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unchanged'],
        message: 'a change digest that looked at nothing is not a verification — name what was re-checked',
      })
    }
  })

export type AccountChangeDigest = z.infer<typeof accountChangeDigestSchema>
