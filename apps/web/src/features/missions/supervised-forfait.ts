import {
  clientTeamSummary,
  consultantsExpected,
  type DeliveryMode,
  type SupervisionRole,
  type CreateMissionRequest,
  type UpdateMissionRequest,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import { parseClientTeamNames } from '@/features/projects/open-needs/model/need-wizard'
import type { SupervisedForfaitDraft } from '@/features/projects/open-needs/view/SupervisedForfaitFields'

type SupervisedFields = {
  delivery_mode?: DeliveryMode | null
  supervision_role?: SupervisionRole | null
  client_team_size?: number | null
  client_team_names?: readonly string[] | null
}

/**
 * #3547 — LE FORFAIT ENCADRÉ, dit à l'écran. `null` quand la mission attend des
 * consultants : l'appelant garde alors son rendu historique (« Personne
 * d'affecté » reste une alerte vraie sur une régie sans personne).
 *
 * Le rôle tenu n'est nommé que s'il est connu — jamais « cadrage » par défaut.
 * Lu par la table des missions, le planning et le suivi (un seul libellé, GA-26).
 */
export function supervisedForfaitLabel(mission: SupervisedFields): string | null {
  if (consultantsExpected(mission.delivery_mode)) return null
  if (!mission.supervision_role) return i18n.t('missions:supervisedForfait.label')
  return i18n.t('missions:supervisedForfait.labelWithRole', {
    role: i18n.t(`missions:supervisedForfait.roles.${mission.supervision_role}`),
  })
}

/** L'état saisi du forfait encadré, relu d'une mission (ou d'un besoin) existante. */
export function draftOfMission(mission: SupervisedFields): SupervisedForfaitDraft {
  return {
    supervised: !consultantsExpected(mission.delivery_mode),
    supervision_role: mission.supervision_role ?? null,
    client_team_size: mission.client_team_size ?? null,
    client_team_names: (mission.client_team_names ?? []).join(', '),
  }
}

/**
 * X66 / #3547 — LE CORPS du changement de mode. Staffé : le mode seul (le
 * serveur efface rôle et équipe). Encadré : le mode et ce qui est SAISI ; une
 * valeur qu'on vide n'est envoyée que si la mission en portait une (sinon
 * « absent » reste « absent », jamais un `null` ou un `[]` inutile).
 */
export function missionModeUpdateOf(
  draft: SupervisedForfaitDraft,
  current: SupervisedFields,
): Pick<UpdateMissionRequest, 'deliveryMode' | 'supervisionRole' | 'clientTeamSize' | 'clientTeamNames'> {
  if (!draft.supervised) return { deliveryMode: 'staffed' }
  const names = parseClientTeamNames(draft.client_team_names)
  const hadNames = (current.client_team_names ?? []).length > 0
  return {
    deliveryMode: 'supervised',
    ...(draft.supervision_role ? { supervisionRole: draft.supervision_role } : {}),
    ...(draft.client_team_size
      ? { clientTeamSize: draft.client_team_size }
      : current.client_team_size
        ? { clientTeamSize: null }
        : {}),
    ...(names.length > 0 ? { clientTeamNames: names } : hadNames ? { clientTeamNames: [] } : {}),
  }
}

/**
 * X66 / #3547 — les champs d'une CRÉATION de mission encadrée. Le mode n'existe
 * qu'au forfait : le choisir pose donc aussi la nature (le serveur refuserait
 * sinon). Éteint, rien n'est envoyé — la mission reste staffée, comme avant.
 */
export function supervisedCreateFieldsOf(
  draft: SupervisedForfaitDraft,
): Pick<
  CreateMissionRequest,
  'contractKind' | 'deliveryMode' | 'supervisionRole' | 'clientTeamSize' | 'clientTeamNames'
> {
  if (!draft.supervised) return {}
  const names = parseClientTeamNames(draft.client_team_names)
  return {
    contractKind: 'forfait',
    deliveryMode: 'supervised',
    ...(draft.supervision_role ? { supervisionRole: draft.supervision_role } : {}),
    ...(draft.client_team_size ? { clientTeamSize: draft.client_team_size } : {}),
    ...(names.length > 0 ? { clientTeamNames: names } : {}),
  }
}

/**
 * L'équipe côté client, dite en une phrase : les noms d'abord, sinon le nombre,
 * sinon « Non renseignée » — jamais « 0 » (GA-18/19). Lue par la fiche mission ET
 * la fiche besoin (un seul libellé, GA-26).
 */
export function clientTeamLabel(source: SupervisedFields): string {
  const team = clientTeamSummary(source)
  if (!team) return i18n.t('missions:overview.clientTeamUnknown')
  return team.names.length > 0
    ? i18n.t('missions:overview.clientTeamNamed', { count: team.count, names: team.names.join(', ') })
    : i18n.t('missions:overview.clientTeamCount', { count: team.count })
}
