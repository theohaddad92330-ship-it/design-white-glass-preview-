import { createContext, useContext, useId, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { ScreenGuideLink } from './ScreenGuideLink'

/**
 * #4654 (Louis, 27/10/2026) — « Comment travailler ici ? » sur la MÊME ligne que le titre de l'écran et ses gestes.
 *
 * Un écran qui nomme son titre lui-même (`titleInScreen`) et ne passe pas `headerActions` dessine son en-tête dans
 * son corps : l'en-tête de la coque ne portait alors QUE le lien, et réservait quand même une rangée de 48 px
 * (une bande vide entre les onglets et le titre, sur cinq écrans). La coque ne monte plus le lien : elle offre un
 * EMPLACEMENT (`ScreenGuideSlot`) que l'en-tête de l'écran (`ScreenIntro`, ou son dessin à la main) pose dans SA rangée,
 * à gauche des boutons — l'action principale reste la plus à droite.
 *
 * Un seul lien par écran, ni deux ni zéro (GA-26) : le premier emplacement monté le REVENDIQUE, les autres ne
 * rendent rien ; tant que personne n'a revendiqué (écran de chargement, écran sans emplacement), la coque garde
 * le lien dans son en-tête — jamais zéro. La revendication se fait avant la peinture (`useLayoutEffect`) : aucun
 * clignotement. Hors coque (aucun fournisseur), l'emplacement ne rend rien.
 */
type Claim = { owner: string | null; claim: (id: string) => void; release: (id: string) => void }

const ScreenGuideSlotContext = createContext<Claim | null>(null)

export function ScreenGuideSlotProvider({ owner, claim, release, children }: Claim & { children: ReactNode }) {
  const value = useMemo(() => ({ owner, claim, release }), [owner, claim, release])
  return <ScreenGuideSlotContext.Provider value={value}>{children}</ScreenGuideSlotContext.Provider>
}

/** Vrai quand la coque offre l'emplacement (écran `titleInScreen` sans gestes d'en-tête). */
export function useHasScreenGuideSlot(): boolean {
  return useContext(ScreenGuideSlotContext) !== null
}

export function ScreenGuideSlot() {
  const slot = useContext(ScreenGuideSlotContext)
  const id = useId()
  const claim = slot?.claim
  const release = slot?.release
  useLayoutEffect(() => {
    if (!claim || !release) return undefined
    claim(id)
    return () => release(id)
  }, [claim, release, id])
  return slot && slot.owner === id ? <ScreenGuideLink /> : null
}
