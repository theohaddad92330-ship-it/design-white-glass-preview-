import { renderLauraCommercialMethodContext, type NeedVerdictResponse } from '@bellum/contracts'

/**
 * #3390.10/.11 — LA MÉTHODE RETENUE, EN TEXTE POUR LAURA.
 *
 * Le moteur (`chooseCommercialMethod`) est exécuté par `NeedVerdictService.forNeed`,
 * et c'est SA réponse que l'écran des besoins affiche : ce fichier ne choisit rien,
 * il rend CETTE réponse (`renderLauraCommercialMethodContext`, contrats, GA-26).
 * Sans méthode dans la réponse (verdict illisible), `null` : Laura ne dit rien,
 * elle n'invente pas.
 */
export function commercialMethodContextFor(
  response: Pick<NeedVerdictResponse, 'method' | 'commercialContext'>,
  scope: 'need' | 'account' = 'need',
): string | null {
  if (!response.method) return null
  return renderLauraCommercialMethodContext({
    method: response.method,
    commercialContext: response.commercialContext,
    scope,
  })
}
