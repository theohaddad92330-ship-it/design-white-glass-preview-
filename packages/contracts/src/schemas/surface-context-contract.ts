import { z } from 'zod'
import { accountSizeSchema } from './profile-context.js'
import { lauraContextModeSchema } from './laura-context-mode.js'

/**
 * #2454 — le CONTRAT DE CONTEXTE d'une surface hors conversation (LAU-FINAL-167).
 *
 * Laura dit, sous chaque réponse, ce qu'elle a lu et ce qu'elle n'a pas pu lire
 * (`apps/ia/app/prompts/context_transparency.py`, rendu par `ContextDisclosure`).
 * Découvrir et Analyser personnalisent pourtant sur le MÊME profil vendeur
 * (`EsnProfileReader.resolveProfileData`) sans jamais le dire. Cet objet est leur
 * version de la même promesse : construit CÔTÉ SERVEUR depuis l'état réel
 * (profil résolu, CRM branché), jamais deviné par l'écran.
 *
 * Structuré par COUCHES, pas par phrases : l'écran traduit (FR/EN) et rend avec
 * le composant unique `ContextDisclosure` (GA-26). Une couche nomme ce que
 * l'espace a branché — jamais un fournisseur de Bellum.
 */

/**
 * Les surfaces qui portent aujourd'hui le contrat (les autres de l'issue
 * restent à venir — #2922 fait le point : Reverse Market classe sur le profil
 * du CONSULTANT, pas sur ce mode vendeur, donc reste HORS liste ; génération de
 * messages et recherche de besoins n'ont pas d'écran dédié dont le résultat en
 * dépend directement, cf. `agent_docs` du lot).
 *
 * `analysis_batch` — #2922 — le lot multi-comptes (`/discover/lots`,
 * `NewAnalysisBatch.tsx`) lance chaque entreprise par le MÊME chemin
 * qu'Analyser (`AnalysisService.start`, `analysis-batches.service.ts`
 * `launch()`) : son résultat dépend donc du même profil vendeur, et il n'avait
 * jusqu'ici AUCUNE chip — le seul écran de lancement d'analyse qui en manquait.
 */
export const contextSurfaceSchema = z.enum(['discover', 'analyze', 'analysis_batch'])
export type ContextSurface = z.infer<typeof contextSurfaceSchema>

/**
 * « Mon activité » : le profil vendeur personnalise. « Neutre » : il est IGNORÉ,
 * et la surface le dit (« Profil habituel ignoré »). Jamais de bascule silencieuse.
 */
//
// #2451.1 — UN seul vocabulaire de modes : celui de Laura (`LAURA_CONTEXT_MODES`).
// Élargi (jamais rétréci) de deux à trois valeurs : « Mission ponctuelle » y
// entre, puisqu'Analyser et Découvrir lisent désormais le mode côté serveur.
export const contextModeSchema = lauraContextModeSchema
export type ContextMode = z.infer<typeof contextModeSchema>

export const contextLayerIdSchema = z.enum(['esn_profile', 'crm', 'portfolio'])

/**
 * - `used` : la surface LIT cette couche pour ce résultat ;
 * - `ignored_by_mode` : disponible, mais écartée par le mode choisi ;
 * - `not_connected` : l'espace ne l'a pas branchée (une action peut la brancher —
 *   PROPOSÉE, jamais activée seule) ;
 * - `not_read_here` : branchée, mais cette surface ne la lit pas.
 */
export const contextLayerStateSchema = z.enum(['used', 'ignored_by_mode', 'not_connected', 'not_read_here'])

export const contextLayerSchema = z.object({
  id: contextLayerIdSchema,
  state: contextLayerStateSchema,
  /** Nom de l'entreprise du profil vendeur, quand il est connu. Jamais deviné. */
  name: z.string().nullable().optional(),
  /** Version du profil vendeur (`esn_profiles.version`) — absente si inconnue, jamais 0. */
  version: z.number().int().positive().nullable().optional(),
  /** Le geste qui RÉSOUT la couche absente — l'écran ne pointe que vers un écran réel. */
  action: z.enum(['connect_crm']).nullable().optional(),
  /**
   * #2889 — le PÉRIMÈTRE du profil ESN (`idealAccountProfile`, le même que
   * `ComposerPersonalizationBar`/`perimeterLine`), pour la couche `esn_profile`.
   * Absent = aucun périmètre connu, jamais deviné depuis un autre champ.
   */
  size: accountSizeSchema.optional(),
  /** Vide = aucun secteur prioritaire déclaré — jamais une ligne vide. */
  sectorsPriority: z.array(z.string()).optional(),
})
export type ContextLayer = z.infer<typeof contextLayerSchema>

export const surfaceContextContractSchema = z.object({
  surface: contextSurfaceSchema,
  mode: contextModeSchema,
  /** Les modes que CETTE surface sait réellement honorer — un mode non tenu n'est pas proposé. */
  modes_available: z.array(contextModeSchema),
  layers: z.array(contextLayerSchema),
})
export type SurfaceContextContract = z.infer<typeof surfaceContextContractSchema>
