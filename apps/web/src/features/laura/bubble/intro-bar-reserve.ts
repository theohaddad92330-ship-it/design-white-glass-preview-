import { useEffect } from 'react'

/**
 * E25 — RÉSERVE D'ESPACE SOUS LA LIGNE D'AMORCE DE LAURA (recette démo 04/10 soir).
 *
 * `LauraIntroBar` est `fixed` (bas droite, 1 rem du bord, ~2,75 rem de haut). Sans réserve, elle recouvre la
 * dernière ligne d'un tableau en bas de page (/missions, rang 4). Tant qu'elle est montrée, on pose cette
 * variable CSS sur `<html>` ; `CustomerPageContent` en tire une bande vide en bas du contenu (défiler
 * jusqu'au bout laisse la ligne au-dessus du vide, jamais du contenu réel dessous). Desktop ET mobile.
 */
export const INTRO_BAR_RESERVE_PROPERTY = '--bellum-laura-intro-reserve'
/** 1 rem de marge basse + ~2,75 rem de hauteur + 0,5 rem d'air. */
export const INTRO_BAR_RESERVE_REM = 4.25

export function useIntroBarReserve(shown: boolean): void {
  useEffect(() => {
    if (!shown) return
    const root = document.documentElement
    root.style.setProperty(INTRO_BAR_RESERVE_PROPERTY, `${INTRO_BAR_RESERVE_REM}rem`)
    return () => {
      root.style.removeProperty(INTRO_BAR_RESERVE_PROPERTY)
    }
  }, [shown])
}
