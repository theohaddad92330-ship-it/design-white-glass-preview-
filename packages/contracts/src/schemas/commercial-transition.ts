import { z } from 'zod'

/**
 * #2320.23 (épopée #2967) — les sujets du journal de transition de la chaîne
 * commerciale : besoin → shortlist → positionnement → mission. Liste FERMÉE,
 * gardée par `commercial_transitions_subject_type_check` (migration
 * `1796321347932`) — une valeur s'ajoute ICI d'abord (GA-11/GA-12), jamais
 * directement en base.
 *
 * #2320.7 — `'opportunity'` AJOUTÉE (migration `1796322820001`) : l'objet
 * canonique de la chaîne commerciale — compte/périmètre/porteur/étape/valeur —
 * vit déjà sous ce nom en base (`opportunities`, `ProjectEntity`), jamais sous
 * celui-ci dans le journal. `ProjectsService.updateStage` est le premier
 * appelant en écriture (voir son docblock).
 *
 * #2320.14/.16 — `'signal'` AJOUTÉE (migration `1796340800001`) : le sixième
 * sujet, EN AMONT du besoin (compte encore informel). Deux appelants en
 * écriture, jamais un moteur neuf :
 *  · `ProjectsService.applyConversion` journalise Signal→Piste — la
 *    conversion d'une opportunité encore `detected`/`potential` (INTAKE_STAGES,
 *    `project.ts`) en piste possédée, `proof` portant l'objectif saisi
 *    (l'« interprétation explicable » que #2320.14 demande, jamais devinée) ;
 *  · `ProjectPipelineService.saveNeed` journalise Opportunité→Besoin confirmé
 *    à la NAISSANCE d'un besoin `to_qualify` rattaché à un projet — distinct
 *    du mouvement d'étape `qualified → confirmed` d'une opportunité déjà
 *    qualifiée, que `'opportunity'` porte déjà (voir le docblock de
 *    `recordStageTransition`).
 */
export const COMMERCIAL_TRANSITION_SUBJECT_TYPES = [
  'need',
  'shortlist',
  'submission',
  'mission',
  'opportunity',
  'signal',
] as const
export const commercialTransitionSubjectTypeSchema = z.enum(COMMERCIAL_TRANSITION_SUBJECT_TYPES)
export type CommercialTransitionSubjectType = z.infer<typeof commercialTransitionSubjectTypeSchema>
