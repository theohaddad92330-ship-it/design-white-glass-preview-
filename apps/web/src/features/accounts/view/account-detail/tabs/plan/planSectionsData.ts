import { NEXT_ACTIONS_MAX, type AccountVerdict } from '@bellum/contracts'
import type { PlanViewData } from './planViewData'

/**
 * #2123.12-.19 — les sections NOMMÉES du plan, dans un ordre fixe.
 *
 * Le plan était une pile de cartes dont l'ordre venait du fichier : rien ne
 * disait par quoi commencer, ni ce qui manquait. Six sections, toujours les
 * mêmes, toujours dans cet ordre — c'est ce qui permet à deux commerciaux de
 * parler du même plan.
 *
 * #2123.11 — **« Verdict stratégique » ouvre le plan**, et il est LU, jamais
 * calculé ici : le verdict arrive déjà dérivé par `readStrategicVerdict`, la
 * même lecture que la Synthèse. En calculer un second créerait la divergence
 * que ce lot supprime : deux verdicts, deux calculs, deux réponses.
 *
 * ⚠️ Une section sans contenu est NOMMÉE vide (`measured: false`) et jamais
 * remplie : ni un « 0 », ni une phrase de comblement (GA-18 / GA-19).
 */
export const PLAN_SECTION_KEYS = [
  'verdict',
  'objectif',
  'perimetre',
  'voieDentree',
  'prochainesActions',
  'horizon6090',
  'aEviter',
] as const

type PlanSectionKey = (typeof PLAN_SECTION_KEYS)[number]

/** Une ligne de section : une valeur, parfois précédée de ce qu'elle qualifie. */
type PlanSectionLine = { label?: string; value: string }

export type PlanSection = {
  key: PlanSectionKey
  lines: PlanSectionLine[]
  /**
   * `false` = la dernière analyse n'a rien produit pour cette section. C'est un
   * ÉTAT, pas un vide : l'écran le dit, au lieu d'afficher une section muette
   * qu'on lit comme « il n'y a rien à faire ».
   */
  measured: boolean
}

const line = (value: string | null | undefined, label?: string): PlanSectionLine[] => {
  const trimmed = (value ?? '').trim()
  if (trimmed.length === 0) return []
  return label === undefined ? [{ value: trimmed }] : [{ label, value: trimmed }]
}

/** #2123.11 — le verdict du dossier tel que la Synthèse le lit (`readStrategicVerdict`). */
type PlanVerdict = { verdict: AccountVerdict | null; name: string | null; line: string | null }

export function buildPlanSections(data: PlanViewData, verdict: PlanVerdict | null = null): PlanSection[] {
  // L'angle RECOMMANDÉ porte le périmètre et la voie d'entrée du plan ; à
  // défaut, le premier. Aucun repli inventé : sans angle, les deux sections se
  // déclarent non mesurées.
  const angle = data.angles.find(candidate => candidate.recommended) ?? data.angles[0] ?? null

  // #2123.34 — trois actions en tête, jamais quinze. Le plafond vit dans les
  // contrats (`NEXT_ACTIONS_MAX`), à un seul endroit (GA-26).
  const head = data.nextActions.slice(0, NEXT_ACTIONS_MAX)

  // #2123.18 — 60 et 90 jours sont UN horizon. Deux seaux séparés faisaient
  // lire deux échéances là où le commercial en pilote une.
  const horizon = data.nextActionsByHorizon
    .filter(group => group.horizon === '60j' || group.horizon === '90j')
    .flatMap(group => group.actions)

  const sections: Record<PlanSectionKey, PlanSectionLine[]> = {
    // #2123.11 — la pastille qualifie la phrase ; sans phrase, la pastille seule.
    // Ni l'une ni l'autre : la section se déclare non produite.
    // #4088 (recette 15/10) — le NOM du verdict (« RÉSERVE »), jamais la famille (« PRUDENT ») : la Synthèse
    // et l'Évaluation disent « RÉSERVE », le plan dit la même chose.
    verdict: verdict?.line
      ? line(verdict.line, verdict.name ?? undefined)
      : verdict?.name
        ? [{ value: verdict.name }]
        : [],
    objectif: line(data.strategy),
    perimetre: [...line(angle?.offer), ...line(angle?.estimatedDealSize)],
    voieDentree: line(angle?.entryPoint),
    prochainesActions: head.map(action => ({ value: action.label })),
    horizon6090: horizon.map(action => ({ value: action.label })),
    // #2123.19 — un angle écarté EST une chose à ne pas faire, et sa raison est
    // ce qui empêche de la refaire dans trois semaines.
    aEviter: data.discardedAxes.flatMap(axis => line(axis.raison, axis.angle)),
  }

  return PLAN_SECTION_KEYS.map(key => ({ key, lines: sections[key], measured: sections[key].length > 0 }))
}
