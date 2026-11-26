import { orderNavForWorkspaceProfile, type WorkspaceProfile } from '@bellum/contracts'

/**
 * Pilotage — une page unique, quatre sections ancrées (Louis 22/10/2026, QCM A/D :
 * « page Théo unique + Cockpit/Pipe/Staffing/Finance en sections ancrées ; anciennes
 * routes y pointent »). Renverse la décision du 14/10 sur les QUATRE ADRESSES, pas
 * sur leur contenu : chaque section garde son écran.
 */
export const PILOTAGE_SECTIONS = [
  { id: 'cockpit', labelKey: 'pilotage:theo.sections.cockpit' },
  { id: 'pipe', labelKey: 'pilotage:theo.sections.pipe' },
  { id: 'staffing', labelKey: 'pilotage:theo.sections.staffing' },
  { id: 'finance', labelKey: 'pilotage:theo.sections.finance' },
] as const

/**
 * #4270.2 (18/10) — en espace forfait / conseil, Staffing passe derrière les autres sections. L'ordre seul
 * change, aucune section ne disparaît (c76). Même règle, au même endroit (`orderNavForWorkspaceProfile`) que
 * pour les onglets de Pilotage qu'elle ordonnait avant les ancres de Théo D (Louis 22/10/2026).
 */
export function orderPilotageSections(profile: WorkspaceProfile | null): readonly (typeof PILOTAGE_SECTIONS)[number][] {
  return orderNavForWorkspaceProfile(PILOTAGE_SECTIONS, profile, section =>
    section.id === 'cockpit' ? '/pilotage' : `/pilotage/${section.id}`,
  )
}

/** Les étapes ouvertes de Théo (« Où se situe la décision ? »). */
export const DECISION_STAGES = ['to_qualify', 'framing', 'profile_submitted', 'proposal'] as const
type DecisionStage = (typeof DECISION_STAGES)[number]

/**
 * La correspondance ÉCRITE entre les étapes d'affaire du produit et les étapes de Théo.
 * Rien n'est perdu : une étape qui n'est pas ouverte (gagnée, perdue, en sommeil) n'est
 * pas une « décision à situer » — elle reste dans Affaires. Quand les cinq étapes décidées
 * seront en base, cette table devient l'identité.
 */
const STAGE_MAP: Readonly<Record<string, DecisionStage>> = {
  detected: 'to_qualify',
  potential: 'to_qualify',
  qualified: 'framing',
  confirmed: 'framing',
  profiles_submitted: 'profile_submitted',
  negotiation: 'proposal',
}

export function decisionStageOf(stage: string): DecisionStage | null {
  return STAGE_MAP[stage] ?? null
}

export function decisionStageCounts(stages: readonly string[]): Record<DecisionStage, number> {
  const counts: Record<DecisionStage, number> = { to_qualify: 0, framing: 0, profile_submitted: 0, proposal: 0 }
  for (const stage of stages) {
    const mapped = decisionStageOf(stage)
    if (mapped) counts[mapped] += 1
  }
  return counts
}

/** L'anneau du cap : pourcentage signé (plafonné à 100) et reste à signer. `null` = on ne sait pas. */
export function capProgress(
  target: number | null,
  realised: number | null,
): { percent: number; remaining: number } | null {
  if (target === null || realised === null || target <= 0) return null
  return {
    percent: Math.min(100, Math.round((realised / target) * 100)),
    remaining: Math.max(0, target - realised),
  }
}

/**
 * Théo D pilotage.N1 — les fenêtres de la courbe « Évolution du pipe » : un point par mois. Le point d'un
 * mois est la CLÔTURE du waterfall existant sur la fenêtre (`GET /pilotage/pipe/waterfall?from&to`) : le
 * pipe ouvert non pondéré tel que l'historique d'étapes le reconstitue à la fin du mois — aucune table de
 * photos de plus. Le mois en cours s'arrête à aujourd'hui.
 */
export function pipeMonthWindows(now: Date, count: number): Array<{ month: string; from: string; to: string }> {
  const windows: Array<{ month: string; from: string; to: string }> = []
  for (let back = count - 1; back >= 0; back -= 1) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
    const end = back === 0 ? now : last
    windows.push({
      month: first.toISOString().slice(0, 7),
      from: first.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    })
  }
  return windows
}
