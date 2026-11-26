import type { PendingChatAction } from '@bellum/contracts'

/**
 * #2844 (recette prod 02/10) — LE JOB LONG DU CHAT, EN SALLE DE DÉMONSTRATION.
 *
 * « Démo : texte libre non supporté (réponses préparées) » : la carte « Matching
 * massif » que Laura propose en production (`propose_long_job`) ne se voyait
 * nulle part en salle. La question de la recette est désormais une amorce, et
 * sa réponse porte la carte, sur trois besoins RÉELLEMENT semés dans la salle
 * (titres de `openNeeds`, `demo-dataset.ts`).
 *
 * Les identifiants portent le préfixe `demo-need-` : ce ne sont pas ceux de la
 * base, la carte le sait (`PendingActions.tsx`) et ne lance rien — elle montre
 * la proposition, jamais un lancement qui n'a pas eu lieu.
 */
export const DEMO_NEED_ID_PREFIX = 'demo-need-'

const DEMO_LONG_JOB_NEEDS = [
  { need_id: `${DEMO_NEED_ID_PREFIX}infra`, label: 'Ingénieur infrastructure — socle conteneurisé du portail' },
  { need_id: `${DEMO_NEED_ID_PREFIX}data`, label: 'Ingénieur données — fiabilisation des flux temps réel' },
  { need_id: `${DEMO_NEED_ID_PREFIX}secu`, label: 'Consultant sécurité applicative — parcours d’authentification' },
] as const

export function demoBulkMatchingAction(): PendingChatAction {
  return {
    action: 'propose_long_job',
    job: 'bulk_matching',
    need_ids: DEMO_LONG_JOB_NEEDS.map(need => need.need_id),
    needs: DEMO_LONG_JOB_NEEDS.map(need => ({ ...need })),
    cost_credits: 0,
  }
}
