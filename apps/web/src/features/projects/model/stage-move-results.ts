import type { StageActionResult } from '@bellum/contracts'

/** Où vit le résultat d'une proposition exécutée : une page de l'app, ou l'URL de la messagerie. */
type StageResultTarget =
  | { kind: 'route'; to: '/actions' }
  | { kind: 'route'; to: '/projects/needs/$needId'; params: { needId: string } }
  | { kind: 'url'; href: string }

/**
 * #4339.2 — « chaque proposition cochée produit un résultat VISIBLE et vérifiable » : la tâche est dans Aujourd'hui,
 * le brouillon s'ouvre dans la messagerie, le matching mène au besoin dont les profils sont classés. `null` = rien à
 * ouvrir (jamais un lien deviné).
 */
export function stageResultTarget(result: StageActionResult): StageResultTarget | null {
  if (result.kind === 'task') return { kind: 'route', to: '/actions' }
  if (result.kind === 'draft') {
    return result.href && /^https:\/\//i.test(result.href) ? { kind: 'url', href: result.href } : null
  }
  return result.id ? { kind: 'route', to: '/projects/needs/$needId', params: { needId: result.id } } : null
}
