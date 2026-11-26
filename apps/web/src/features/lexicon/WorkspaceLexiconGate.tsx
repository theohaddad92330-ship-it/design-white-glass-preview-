import { useEffect } from 'react'
import { useTeam } from '@/features/team/hooks/useTeam'
import { applyWorkspaceLexicon, watchLanguageForLexicon } from '@/i18n/workspace-lexicon'

/**
 * Le lexique de l'espace, appliqué aux libellés dès que l'espace est connu (D17).
 *
 * Ne rend RIEN : c'est un branchement, pas un écran. Il vit au niveau de
 * l'application parce que le lexique teint la NAVIGATION — le poser dans un
 * écran ne l'appliquerait qu'une fois cet écran ouvert, ce qui est exactement le
 * défaut « du code juste que personne n'appelle ».
 *
 * Il ne fait AUCUNE requête à lui : `useTeam()` est déjà chargé par la barre
 * latérale sur chaque écran, et le lexique voyage dans sa réponse. Une requête
 * de plus au démarrage pour un réglage que presque aucun espace ne pose serait
 * un coût pour tout le monde au bénéfice de quelques-uns.
 *
 * Le chemin par défaut est un no-op : sans surcharge enregistrée, le lexique
 * vaut `{ overrides: [] }` et {@link applyWorkspaceLexicon} sort sans toucher au
 * magasin i18next.
 */
export function WorkspaceLexiconGate() {
  const { team } = useTeam()
  const lexicon = team?.workspace.lexicon

  useEffect(() => {
    watchLanguageForLexicon()
  }, [])

  useEffect(() => {
    // `undefined` tant que l'espace n'est pas chargé : on n'applique rien, donc
    // les libellés du produit s'affichent — jamais une chaîne vide en attendant.
    applyWorkspaceLexicon(lexicon ?? null)
  }, [lexicon])

  return null
}
