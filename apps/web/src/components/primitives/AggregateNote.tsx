import { Text } from '@bellum/ui'
import type { ReactNode } from 'react'

/**
 * LA voix commune des qualifications d'un agrégat — une ligne, discrète, sous
 * le chiffre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Deux primitives qualifient le même nombre au même endroit — le `footer` d'une
 * `KpiCard` — et répondent aux deux moitiés d'une seule question :
 *
 *  - `Completeness` répond à _sur quoi_ (« calculé sur 12 dossiers sur 43 ») ;
 *  - `ComputedAt` répond à _quand_ (« recalculé à 06:12 »).
 *
 * Empilées, elles doivent se lire comme UN bloc et non comme deux notes
 * étrangères. Ce qu'elles partagent n'est ni leur dérivation — elles en ont
 * chacune une, dans les contrats — ni leur phrase, mais leur VOIX : même taille,
 * même ton, même couleur atténuée. Ce composant est cette voix, et c'est tout ce
 * qu'il est.
 *
 * Le tenir ici plutôt que de le recopier dans chaque primitive suit la même
 * règle que le reste du lot : le jour où l'on décide que ces notes doivent être
 * plus lisibles, il y a UN endroit à changer. Deux primitives qui recopient
 * `size="xs"` et la couleur atténuée divergent au premier ajustement appliqué
 * d'un seul côté — c'est la loi 1 du tome 7, à l'échelle d'une ligne de texte.
 *
 * ⚠️ Il ne DÉCIDE de rien : ni ce qu'il faut dire, ni s'il faut le dire. Les
 * refus (« une part sur un dénominateur non lu », « un horodatage indiscernable
 * de la requête ») vivent dans les dérivations, où le serveur peut les lire
 * aussi. Un composant d'affichage qui déciderait serait une seconde vérité.
 */
export function AggregateNote({
  children,
  className,
  // #1866 — la VOIX ne change pas, seul le conteneur peut. `Completeness`
  // replie son détail derrière un `<button>`, dont le modèle de contenu
  // n'accepte que du phrasé : un `<p>` y serait du HTML invalide, et un
  // navigateur le sortirait du bouton — le déclencheur perdrait sa phrase.
  // Le défaut reste `p` : aucun appelant existant ne bouge.
  element = 'p',
}: {
  children: ReactNode
  className?: string
  element?: 'p' | 'span'
}) {
  return (
    <Text element={element} size="xs" color="text-[var(--bellum-text-muted)]" className={className}>
      {children}
    </Text>
  )
}
