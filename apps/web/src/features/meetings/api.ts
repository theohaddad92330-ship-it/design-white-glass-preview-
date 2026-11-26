import type {
  MeetingCascade,
  MeetingInternalOutputKind,
  MeetingNotesInputKind,
  MeetingRecap,
  MeetingRecapSnapshot,
} from '@bellum/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** L'issue d'une sortie approuvée, telle que l'API la rend. */
export type MeetingApprovalOutcome = {
  kind: MeetingInternalOutputKind
  outcome: string
  /** La capacité qui manque, quand l'issue est `blocked`. */
  missing: string | null
  detail: string | null
}

/**
 * ⚠️ Il n'y a volontairement AUCUNE fonction d'envoi ici.
 *
 * Le mail de suivi et la relance sont des brouillons : l'écran sait les
 * afficher et les copier, il ne sait pas les envoyer, et l'API n'expose aucune
 * route qui le permettrait. C'est l'absence de code, pas une convention.
 */
export const meetingsApi = {
  cascade(body: {
    notes: string
    accountId?: string
    attendees?: string
    fromTranscript?: boolean
    /** #2319.61-.62 — la nature du texte collé. */
    inputKind?: MeetingNotesInputKind
    /** #2319.63 — la déclaration de l'utilisateur, à part des notes. */
    userStatement?: string
    /** #2103.37 — l'id du rendez-vous source, quand la carte en vient un. */
    sourceEventId?: string
  }): Promise<{ recap: MeetingRecap; cascade: MeetingCascade }> {
    return apiFetch({ path: '/meeting-notes/cascade', method: 'POST', body })
  },
  /**
   * `kinds` ne peut porter que des sorties INTERNES : le type l'interdit ici,
   * et le schéma de l'API le refuse à l'arrivée. Deux portes, la même règle.
   */
  approve(body: {
    kinds: MeetingInternalOutputKind[]
    tasks?: Array<{ subject: string; body?: string; dueAt: string }>
    /**
     * #1934.18 — l'affaire et l'IDENTIFIANT de stade RETENUS (liste réelle du
     * CRM, jamais le libellé du modèle), quand `crm_stage` fait partie du lot. Ce n'est pas un chemin d'écriture : l'API dépose une demande dans la
     * file de validation, avec sa prévisualisation figée et son expiration à
     * trois jours. Le stade part quand quelqu'un l'autorise, et pas avant.
     */
    crmStage?: { dealId: string; stageId: string; rationale?: string }
    /**
     * #1903.12 — le compte rendu à écrire, quand `recap` fait partie du lot.
     * `accountId` vient de l'écran (le compte déjà ouvert), jamais deviné par
     * l'API. #3758 — `snapshot` : voir `meetingRecapApprovalInput`
     * (`@bellum/contracts`), qui le dérive avec `body` — à un seul endroit,
     * jamais recomposé séparément par chaque écran.
     */
    recap?: { accountId: string; body: string; snapshot?: MeetingRecapSnapshot | null }
    /**
     * #2777 — les personnes citées, RETENUES, quand `contacts` fait partie du
     * lot. `accountId` vient de l'écran, comme pour `recap`.
     */
    contacts?: { accountId: string; mentioned: Array<{ fullName: string; role?: string }> }
    /**
     * #2777 — l'opportunité candidate RETENUE, quand `opportunity` fait partie
     * du lot. `accountId` vient de l'écran, comme pour `recap`/`contacts`. Ce
     * n'est pas non plus un chemin d'écriture : l'API dépose une PROPOSITION
     * de Deal dans la file de validation CRM, même règle que `crmStage`.
     */
    opportunity?: { accountId: string; title: string }
    /**
     * #2777 — le besoin RETENU, quand `need` fait partie du lot. `accountId`
     * vient de l'écran. Aucun `projectId` : #2558.1 fait d'un besoin sans
     * projet un état valide — l'API écrit directement, sans file de validation.
     */
    need?: { accountId: string; title: string; detail?: string }
    /**
     * #2777 — les apprentissages RETENUS, quand `learnings` fait partie du
     * lot. `accountId` vient de l'écran. Bande `n4_bounded_auto` : l'API
     * écrit directement, sans file de validation — ni CRM ni ERP.
     */
    learnings?: { accountId: string; entries: Array<{ kind: 'objection' | 'commitment'; content: string }> }
  }): Promise<{ outcomes: MeetingApprovalOutcome[] }> {
    return apiFetch({ path: '/meeting-notes/cascade/approve', method: 'POST', body })
  },
  /** #2103.1 — LE PRÉALABLE du déclencheur post-RDV : ce rendez-vous a-t-il
   *  déjà un compte rendu ? */
  recapStatus(sourceEventId: string): Promise<{ exists: boolean }> {
    return apiFetch({ path: `/meeting-notes/recap-status?sourceEventId=${encodeURIComponent(sourceEventId)}` })
  },
}

export function useMeetingCascade() {
  return useMutation({ mutationFn: meetingsApi.cascade })
}

export function useApproveInternal() {
  return useMutation({ mutationFn: meetingsApi.approve })
}

/**
 * #2103.1 — désactivé (`enabled: false`) tant que le rendez-vous n'appelle
 * pas le déclencheur (interne, ou pas encore terminé) : l'écran ne demande
 * cette réponse que quand elle sert réellement à quelque chose.
 */
export function useRecapExists(sourceEventId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['meeting-notes', 'recap-status', sourceEventId],
    queryFn: () => meetingsApi.recapStatus(sourceEventId),
    enabled,
  })
}
