import { z } from 'zod'
import { layerVersionsSchema } from './layered-profile.js'
import { lauraContextModeSchema } from './laura-context-mode.js'
import { esnAnswersSchema, TEMPS1_REQUIRED_KEYS, type EsnAnswers } from './onboarding.js'

/**
 * Le profil qui a conditionné un run — et le droit, ou non, d'appeler ce run
 * « personnalisé » (recette finale du 02/08, §13 et §53).
 *
 * Le symptôme observé : un dossier Société Générale dont le score écrivait
 * « profil ESN non précisé » alors que l'écran promettait une analyse taillée
 * pour l'ESN du commercial. Le run était générique et ne le disait pas. C'est
 * la pire des deux erreurs possibles — une analyse générique ANNONCÉE reste
 * utile, une analyse générique DÉGUISÉE fait juger le produit sur une promesse
 * qu'il n'a pas tenue.
 *
 * D'où deux règles, et une seule source de vérité pour les deux :
 *
 *  1. un run ne peut se dire personnalisé que si le profil était réellement
 *     exploitable au moment du lancement ;
 *  2. le run garde la VERSION du profil qui l'a produit, pour qu'on puisse
 *     répondre « avec quel profil ce dossier a-t-il été fait ? » six semaines
 *     plus tard, quand le profil aura changé trois fois.
 */

/** Un run personnalisé a lu un profil exploitable ; un run générique n'en avait pas. */
export const runProfileModeSchema = z.enum(['personalised', 'generic'])
export type RunProfileMode = z.infer<typeof runProfileModeSchema>

/**
 * Pourquoi un run est générique. Jamais déduit à l'affichage : c'est le
 * lancement qui sait, et l'écran ne fait que le répéter.
 */
export const genericRunReasonSchema = z.enum([
  /** Aucune réponse au questionnaire — compte neuf, ou questionnaire jamais ouvert. */
  'no_profile',
  /** Questionnaire commencé mais incomplet : il manque des réponses obligatoires. */
  'incomplete_profile',
  /** L'utilisateur a explicitement reporté le questionnaire. */
  'skipped_by_user',
  /** Un appelant (opérateur, démo) a imposé un profil vide. */
  'overridden',
  /**
   * #2453.8 — le MODE DE CONTEXTE du lancement (Mission ponctuelle, Neutre) a
   * écarté le profil. Le profil existe et peut être complet : le dossier est
   * générique PAR CHOIX, et l'écran ne pousse pas à « compléter le profil ».
   * Le mode lui-même est gardé dans `contextMode`.
   */
  'context_mode',
])
export type GenericRunReason = z.infer<typeof genericRunReasonSchema>

/**
 * La provenance du profil, telle qu'elle est figée sur le run.
 *
 * Les deux versions viennent de deux tables différentes et répondent à deux
 * questions différentes : `esnProfileVersion` dit quelle révision des RÉPONSES
 * a été lue, `profileContextVersion` quelle révision du CONTEXTE dérivé (la
 * sortie du Profiler) était en vigueur. Les confondre ferait perdre la trace
 * d'une régénération de contexte à réponses inchangées.
 */
export const runProfileProvenanceSchema = z.object({
  mode: runProfileModeSchema,
  /** Renseigné uniquement quand `mode = 'generic'`. */
  reason: genericRunReasonSchema.nullable().default(null),
  /** Révision des réponses au questionnaire (`esn_profiles.version`). */
  esnProfileVersion: z.number().int().nonnegative().nullable().default(null),
  /** Révision du contexte dérivé (`profiles.profile_context_version`). */
  profileContextVersion: z.number().int().nonnegative().nullable().default(null),
  /** Réponses obligatoires renseignées, sur le total attendu. Sert à écrire
   *  « 7 réponses sur 10 » plutôt qu'un « incomplet » sans prise. */
  answered: z.number().int().nonnegative(),
  required: z.number().int().positive(),
  /** Nom de l'ESN tel qu'il a conditionné le run — ce que l'écran affiche pour
   *  répondre à « avec quel profil ? ». `null` en générique. */
  esnName: z.string().nullable().default(null),
  /** #2005.11 — les versions des TROIS couches (entreprise · BU · personne)
   *  qui ont conditionné le run. `null` à la LECTURE d'un run antérieur à
   *  leur écriture : on ne sait pas, et on ne l'invente pas. */
  layerVersions: layerVersionsSchema.nullable().default(null),
  /**
   * #2453.7 / #2453.8 — le mode de contexte dans lequel le run a été LANCÉ
   * (`LAURA_CONTEXT_MODES`). `null` pour un run antérieur : on ne sait pas, et
   * « Mon activité » ne se devine pas. C'est lui qui libelle le dossier —
   * activité, brief de mission, critères neutres.
   */
  contextMode: lauraContextModeSchema.nullable().default(null),
})
export type RunProfileProvenance = z.infer<typeof runProfileProvenanceSchema>

/**
 * #2005.11 — la provenance telle qu'un run l'ÉCRIT : les trois versions de
 * couche y sont OBLIGATOIRES. Le schéma de lecture reste tolérant pour
 * l'historique ; celui-ci refuse qu'une recommandation parte sans elles.
 */
export const recordedRunProfileProvenanceSchema = runProfileProvenanceSchema.extend({
  layerVersions: layerVersionsSchema,
  // #2453.7 — un écrivain qui ne connaît pas le mode (relance, rejeu) l'omet ;
  // la lecture le rend alors `null` (« on ne sait pas »), jamais deviné.
  contextMode: lauraContextModeSchema.nullable().optional(),
})
export type RecordedRunProfileProvenance = z.infer<typeof recordedRunProfileProvenanceSchema>

/**
 * La provenance du run, PLUS la révision de profil en vigueur aujourd'hui.
 *
 * ⚠️ `esnProfileVersion` était figé sur chaque run depuis le premier jour, et
 * n'avait AUCUN consommateur : hors sa propre définition, aucune occurrence côté
 * web. Un dossier produit avec un profil qui a changé depuis se lisait donc
 * exactement comme un dossier à jour — alors que ses angles, ses contacts
 * prioritaires et son plan viennent d'un positionnement qui n'est plus celui de
 * l'entreprise.
 *
 * `currentEsnProfileVersion` est la seule chose qui manquait pour le DIRE.
 */
export const accountProfileProvenanceSchema = runProfileProvenanceSchema.extend({
  /** Révision du profil AUJOURD'HUI. `null` quand elle n'est pas lisible. */
  currentEsnProfileVersion: z.number().int().nonnegative().nullable().default(null),
})
export type AccountProfileProvenance = z.infer<typeof accountProfileProvenanceSchema>

/**
 * Ce dossier a-t-il été produit avec un profil DIFFÉRENT de celui d'aujourd'hui ?
 *
 * Les deux `null` possibles disent la même chose — on ne sait pas — et rendent
 * `false` : annoncer « profil différent » sur une comparaison impossible ferait
 * relancer une analyse payante sans raison.
 *
 * On compare `<` et non `!==` : une révision de run SUPÉRIEURE à la révision
 * courante ne veut pas dire « périmé », elle veut dire qu'une lecture est
 * incohérente, et on ne construit pas un avertissement sur une incohérence.
 */
export function ranWithOlderProfile(provenance: {
  esnProfileVersion: number | null
  currentEsnProfileVersion?: number | null
}): boolean {
  const run = provenance.esnProfileVersion
  const current = provenance.currentEsnProfileVersion ?? null
  if (run === null || current === null) return false
  return run < current
}

/** Une réponse est-elle RENSEIGNÉE ? Une chaîne vide, un tableau vide et
 *  `null` disent tous « pas répondu » — les traiter différemment ferait passer
 *  un questionnaire ouvert-puis-abandonné pour un profil exploitable. */
function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return false
}

/** Combien des réponses obligatoires du Temps 1 sont réellement renseignées. */
export function countAnsweredRequired(answers: Partial<EsnAnswers> | null | undefined): number {
  if (!answers) return 0
  return TEMPS1_REQUIRED_KEYS.filter(key => isAnswered((answers as Record<string, unknown>)[key])).length
}

/**
 * Ce run a-t-il le droit de se dire personnalisé, et sinon pourquoi ?
 *
 * Le seuil est **toutes les réponses obligatoires**, pas une majorité. Le
 * questionnaire du Temps 1 n'en compte que dix, et chacune conditionne une
 * décision du pipeline : sans les expertises on ne peut pas juger l'adéquation,
 * sans les zones géographiques on recommande un décideur à l'autre bout du
 * monde, sans la taille de l'équipe commerciale on propose un plan d'attaque
 * qu'une ESN de six personnes ne peut pas exécuter. « Presque complet » produit
 * exactement le dossier que le rapport reproche.
 */
export function resolveRunProfileMode(input: {
  answers: Partial<EsnAnswers> | null | undefined
  /** L'utilisateur a-t-il explicitement reporté le questionnaire ? */
  skippedByUser?: boolean
  /** Un appelant a-t-il imposé le profil (opérateur, démo) ? */
  overridden?: boolean
}): { mode: RunProfileMode; reason: GenericRunReason | null; answered: number; required: number } {
  const required = TEMPS1_REQUIRED_KEYS.length
  const answered = countAnsweredRequired(input.answers)

  if (answered === required) return { mode: 'personalised', reason: null, answered, required }

  // L'ordre compte : un profil imposé par un opérateur explique le générique
  // mieux qu'un « incomplet » qui accuserait l'utilisateur à tort.
  if (input.overridden) return { mode: 'generic', reason: 'overridden', answered, required }
  if (answered === 0) {
    return { mode: 'generic', reason: input.skippedByUser ? 'skipped_by_user' : 'no_profile', answered, required }
  }
  if (input.skippedByUser) return { mode: 'generic', reason: 'skipped_by_user', answered, required }
  return { mode: 'generic', reason: 'incomplete_profile', answered, required }
}

/** Le nombre de réponses obligatoires — exposé pour que l'interface écrive
 *  « 7 / 10 » sans recopier la constante. */
export const TEMPS1_REQUIRED_COUNT = TEMPS1_REQUIRED_KEYS.length

/** Forme acceptée en entrée quand on reconstruit une provenance depuis la base
 *  (colonne jsonb libre) : tout ce qui ne valide pas redevient `null`, jamais
 *  un « personnalisé » par défaut. */
export function parseRunProfileProvenance(value: unknown): RunProfileProvenance | null {
  const parsed = runProfileProvenanceSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export { esnAnswersSchema }
