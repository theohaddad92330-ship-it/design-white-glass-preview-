import { apiFetch } from '@/lib/api'

/**
 * #2560 — LA LECTURE AUTOMATIQUE D'UN DOCUMENT DE MISSION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME EST LOCALE À CET ÉCRAN, ET C'EST UN CHOIX
 * ─────────────────────────────────────────────────────────────────────────────
 * Même choix que `features/expenses/receipt-extraction.ts` : ce type n'est
 * PAS dans `@bellum/contracts`. `MissionExtractionService`
 * (`apps/api/src/modules/delivery/mission-extraction.service.ts`) déclare la
 * MÊME forme côté API ; les deux sont dupliqués plutôt que promus dans un
 * paquet partagé — un domaine qui n'en a besoin qu'ici pour l'instant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PROPOSITION, JAMAIS UNE ÉCRITURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque champ porte sa `confidence` et sa `sourceExcerpt` : ce qui permet à
 * l'écran de dire « lu automatiquement, à vérifier » plutôt que de remplir un
 * champ à l'identique d'une saisie humaine. `value: null` couvre DEUX choses
 * que l'écran doit pouvoir dire différemment : le champ n'a pas pu être lu DU
 * TOUT, ou il a été lu à une confiance jugée trop faible côté serveur — dans
 * les deux cas, le champ reste VIDE, jamais une valeur inventée à sa place.
 */
type MissionExtractionStatus = 'ok' | 'unreadable' | 'too_large' | 'unavailable'

type MissionFieldProposal<T> = {
  value: T | null
  confidence: number
  sourceExcerpt: string
}

export type MissionExtraction = {
  status: MissionExtractionStatus
  costUsd: number | null
  fields: {
    accountName: MissionFieldProposal<string>
    roleTitle: MissionFieldProposal<string>
    startedOn: MissionFieldProposal<string>
    endsOn: MissionFieldProposal<string>
    dailyRate: MissionFieldProposal<number>
    days: MissionFieldProposal<number>
    /** X66 / #3547 — `supervised` seulement si le document le dit, cité ; sinon `null`. */
    supervisedForfait?: MissionFieldProposal<'supervised'>
  }
}

export type MissionExtractionInput = {
  text?: string
  fileBase64?: string
  fileName?: string
}

function emptyField<T>(): MissionFieldProposal<T> {
  return { value: null, confidence: 0, sourceExcerpt: '' }
}

/** Un statut qui ne varie jamais : seul l'échec du TRANSPORT vers l'API compte
 *  pour l'établir — même principe que `unavailableExtraction()` des notes de
 *  frais. */
export function unavailableMissionExtraction(): MissionExtraction {
  return {
    status: 'unavailable',
    costUsd: null,
    fields: {
      accountName: emptyField(),
      roleTitle: emptyField(),
      startedOn: emptyField(),
      endsOn: emptyField(),
      dailyRate: emptyField(),
      days: emptyField(),
      supervisedForfait: emptyField(),
    },
  }
}

/**
 * Propose une lecture — NE LÈVE JAMAIS : un réseau qui tombe pendant la
 * lecture automatique ne doit jamais empêcher de continuer la saisie à la
 * main. Une panne de transport se traduit en `unavailableMissionExtraction()`.
 */
export async function extractMission(input: MissionExtractionInput): Promise<MissionExtraction> {
  try {
    return await apiFetch<MissionExtraction, MissionExtractionInput>({
      path: '/delivery/missions/extract',
      method: 'POST',
      body: input,
    })
  } catch {
    return unavailableMissionExtraction()
  }
}
