import { useEffect, useState } from 'react'

/**
 * Secondes réellement écoulées depuis que `isPending` est devenu vrai.
 *
 * #3020 (retour bêta, ré-échoué en recette écran le 25/09/2026) — les
 * enrichissements synchrones de l'onglet Organigramme (`enrich-organigram`,
 * `enrich-contacts`) n'ont rien à SONDER côté serveur : une seule
 * classification IA, aucun job en file, aucun événement Socket.IO à suivre.
 * Ce qu'un bouton peut montrer honnêtement PENDANT l'appel, c'est ce qui est
 * réellement mesuré — ce temps-là, seconde par seconde — jamais un
 * pourcentage ou une durée estimée qu'aucun job ne fournit.
 *
 * Centralisé ICI (GA-26 : un réglage vit à un seul endroit) après que le
 * correctif #3020 n'avait posé ce tic-tac que sur UN des boutons
 * « Enrichir » de l'onglet (`TabOrganigramme.tsx`) : les deux autres
 * (`OrgStructureSection.tsx`, `OrgMapEmptyState.tsx`), qui appellent les
 * MÊMES mutations, gardaient un spinner muet — exactement le symptôme que
 * #3020 devait corriger, sur un chemin différent du même écran.
 */
export function useElapsedWhilePending(isPending: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isPending) {
      setElapsed(0)
      return
    }
    const startedAt = Date.now()
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isPending])
  return elapsed
}
