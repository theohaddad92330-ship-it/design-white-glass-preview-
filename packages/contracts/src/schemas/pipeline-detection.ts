import { z } from 'zod'
import type { CallOutcome } from './activity.js'
import type { CommercialCanonicalStage } from './commercial-state-machine.js'

/**
 * #4016 L6 — LE PIPE « DÉTECTÉ, À REVOIR ».
 *
 * ⚠️⚠️ RENVERSEMENT DATÉ (Louis 11/10/2026, épopée #4016, lot L6) de #2320.22
 * (« aucune transition ne se déduit automatiquement d'un signal »), #2377.8
 * (« une conversation exploratoire ne devient pas automatiquement
 * opportunité ») et #2320.3 (« un entretien positif ne devient pas une mission
 * tout seul »). Verbatim de l'épopée : « pipe automatique en statut “détecté, à
 * revoir” (intérêt → opportunité, shortlist → positionnement, entretien →
 * mission) ».
 *
 * Ce qui change : Bellum ÉCRIT seul, dans le pipe, le passage qu'un signal
 * fort rend probable — une ligne `detected` que le commercial voit sans rien
 * avoir saisi. Ce qui ne change pas :
 *  · la ligne reste « détecté, à revoir » — rien ne la confirme sans un humain
 *    (aucun statut `auto_confirmed`, le schéma le refuse) ;
 *  · confirmer passe par la porte humaine existante (ouvrir une affaire,
 *    positionner un profil), appelée depuis un CONTRÔLEUR — jamais depuis le
 *    balayeur ;
 *  · une mission ne naît JAMAIS d'un clic de confirmation : elle exige l'accord
 *    du client ET celui du consultant (#2320.21), que Bellum ne sait pas
 *    attester. La détection ouvre le positionnement ; le formulaire existant la
 *    signe.
 *  · aucune écriture dans le CRM du client (« le CRM garde un go »).
 *
 * Les valeurs voyagent en base : `pipeline_detections_kind_check` et
 * `pipeline_detections_status_check` (migration `1796440171265`) les reprennent
 * — une valeur s'ajoute ICI d'abord, EN FIN (GA-08, GA-11/GA-12).
 */
export const PIPELINE_DETECTION_KINDS = [
  'interest_to_opportunity',
  'shortlist_to_submission',
  'interview_to_mission',
] as const
export const pipelineDetectionKindSchema = z.enum(PIPELINE_DETECTION_KINDS)
export type PipelineDetectionKind = z.infer<typeof pipelineDetectionKindSchema>

/** `detected` est l'ENTRÉE ; `confirmed` / `dismissed` sont des gestes d'humain. */
export const PIPELINE_DETECTION_STATUSES = ['detected', 'confirmed', 'dismissed'] as const
export const pipelineDetectionStatusSchema = z.enum(PIPELINE_DETECTION_STATUSES)
export type PipelineDetectionStatus = z.infer<typeof pipelineDetectionStatusSchema>

/**
 * #4191 (recette 3, F1) — LA PISTE : une détection encore au statut `detected`, celles que liste
 * l'onglet Pistes. Le prédicat est écrit UNE fois : la liste (`listDetected`) et le compteur
 * `pistes_to_review` de `GET /crm-counters` le portent tous deux, sur l'alias `d`.
 */
export const PIPELINE_DETECTION_TO_REVIEW_SQL = "d.workspace_id = $1 AND d.status = 'detected'"

/**
 * Les issues d'appel qui disent un INTÉRÊT — celles qui font naître une ligne
 * « intérêt → opportunité ». `not_now`, `orientation_given`, `meeting_booked`
 * n'y sont pas : un rendez-vous pris n'est pas encore un intérêt pour une
 * affaire, et le confondre remplirait le pipe de cafés.
 */
export const PIPELINE_INTEREST_CALL_OUTCOMES = [
  'interest',
  'need_detected',
  'need_confirmed',
] as const satisfies readonly CallOutcome[]

/** Le stade canonique (#2320) que chaque passage rend probable. */
export const PIPELINE_DETECTION_TARGET_STAGE: Readonly<Record<PipelineDetectionKind, CommercialCanonicalStage>> = {
  interest_to_opportunity: 'opportunite',
  shortlist_to_submission: 'positionnement',
  interview_to_mission: 'mission',
}

/**
 * Confirmer CRÉE-t-il l'objet visé ? Oui pour l'affaire et le positionnement
 * (le clic EST la décision, #2195.33) ; NON pour la mission (#2320.21).
 */
export function pipelineDetectionConfirmCreates(kind: PipelineDetectionKind): boolean {
  return kind !== 'interview_to_mission'
}

export const pipelineDetectionSchema = z.object({
  id: z.string().guid(),
  kind: pipelineDetectionKindSchema,
  status: pipelineDetectionStatusSchema,
  accountId: z.string().guid(),
  /** `null` = compte illisible, jamais un nom deviné. */
  accountName: z.string().nullable(),
  /** Ce que Bellum a vu, en une ligne — écrit au moment de la détection. */
  label: z.string(),
  /** L'appel, la shortlist ou l'entretien qui a fait naître la ligne. */
  sourceId: z.string().guid(),
  /**
   * #4016.L6.a — l'APPEL source de la détection, quand il existe encore : une
   * ligne « intérêt → opportunité » naît d'un appel journalisé. `null` = pas
   * d'appel retrouvé (autre passage, appel supprimé) → l'écran ne montre AUCUN
   * lien, jamais un lien mort.
   */
  sourceCallId: z.string().guid().nullable(),
  projectId: z.string().guid().nullable(),
  consultantId: z.string().guid().nullable(),
  submissionId: z.string().guid().nullable(),
  /** L'affaire ou le positionnement créé à la confirmation ; `null` sinon. */
  createdObjectId: z.string().guid().nullable(),
  detectedAt: z.string(),
  decidedAt: z.string().nullable(),
})
export type PipelineDetection = z.infer<typeof pipelineDetectionSchema>

/** `GET /pipeline-detections` — `autoDetect: 'off'` quand l'interrupteur coupe le balayage. */
export const pipelineDetectionListSchema = z.object({
  items: z.array(pipelineDetectionSchema),
  autoDetect: z.enum(['on', 'off']),
})
export type PipelineDetectionList = z.infer<typeof pipelineDetectionListSchema>
