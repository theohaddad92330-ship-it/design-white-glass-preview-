import { buildOutboundPreview, type OutboundWriteKind, type PreviewLine } from '../crm/outbound-write-preview'

/**
 * #4163 LF (point 7, craft rule n°9) — LES ÉCRITURES CRM EN ATTENTE DE LA SALLE.
 *
 * La file « À traiter » de la salle disait « Écriture CRM indisponible » : une salle qui montre des gestes
 * d'écriture sans en porter un seul se contredit en réunion. Le registre d'outils montre désormais un CRM branché
 * (overlay de lecture, `tool-registry/demo-connections.ts`) ; ces lignes sont ce qu'une routine y a PROPOSÉ.
 *
 * ⚠️ Rien n'est jamais écrit : aucune connexion réelle, aucun jeton. `POST /crm/write-requests/:id/decide` saute
 * l'écriture dans une salle de démonstration (`CrmController.decideWrite`) — la demande se tranche, le CRM n'est pas
 * touché. Les personnes sont SIMULÉES (déjà dans la salle), sans coordonnée.
 */

type DemoCrmWriteRequest = {
  /** Les écritures qui partagent une clé forment UN lot (`batch_id`) ; `null` = écriture seule. */
  batchKey: string | null
  kind: OutboundWriteKind
  payload: Record<string, unknown>
  /** Ce que le champ vaut aujourd'hui chez le CRM, quand le demandeur le sait. */
  previous?: Record<string, unknown>
}

export const DEMO_CRM_WRITE_REQUESTS: readonly DemoCrmWriteRequest[] = [
  // Le compte rendu du rendez-vous : trois écritures déposées ensemble, une seule carte « 3 écritures vers ton CRM ».
  {
    batchKey: 'compte-rendu-sncf',
    kind: 'export_contact',
    payload: {
      firstName: 'Grégory',
      lastName: 'Pinault',
      company: 'SNCF',
      jobTitle: 'Responsable achats prestations informatiques',
    },
  },
  {
    batchKey: 'compte-rendu-sncf',
    kind: 'create_note',
    payload: {
      company: 'SNCF',
      subject: 'Compte rendu du rendez-vous',
      note: 'Circuit d’achat confirmé : référencement annuel, appel à candidatures en novembre.',
    },
  },
  {
    batchKey: 'compte-rendu-sncf',
    kind: 'create_task',
    payload: { company: 'SNCF', subject: 'Envoyer le compte rendu et relancer après le comité' },
  },
  // Une écriture seule : le stade d'une affaire (ne s'auto-approuve jamais).
  {
    batchKey: null,
    kind: 'update_deal_stage',
    payload: {
      company: 'SNCF',
      dealName: 'Renfort régie — entité numérique voyageurs',
      stage: 'Négociation',
      rationale: 'Proposition remise, retour attendu après le comité.',
    },
    previous: { stage: 'Proposition' },
  },
]

type BuiltDemoCrmWriteRequest = {
  batchKey: string | null
  kind: OutboundWriteKind
  payload: Record<string, unknown>
  preview: PreviewLine[]
  origin: 'system'
  expiresAt: Date
}

const EXPIRY_MS = 3 * 24 * 60 * 60 * 1000

/** Les lignes à insérer : la prévisualisation est calculée par le produit (`buildOutboundPreview`), puis figée. */
export function buildDemoCrmWriteRequests(now: Date): BuiltDemoCrmWriteRequest[] {
  return DEMO_CRM_WRITE_REQUESTS.map(request => ({
    batchKey: request.batchKey,
    kind: request.kind,
    payload: request.payload,
    preview: buildOutboundPreview(request.kind, request.payload, request.previous),
    origin: 'system',
    expiresAt: new Date(now.getTime() + EXPIRY_MS),
  }))
}
