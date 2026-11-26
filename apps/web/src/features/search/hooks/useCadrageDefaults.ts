import { DEFAULT_CADRAGE_GEO, type AnalysisScopeSelection } from '@bellum/contracts'
import { useEffect, useRef } from 'react'

/**
 * LES DÉFAUTS DU CADRAGE, posés en UN seul patch (ils vivaient dans le récap de confirmation ; le
 * cadrage se fait maintenant sur l'écran de départ, ils le suivent).
 *
 * Deux effets séparés patchaient chacun depuis le même `selection` du rendu : le second écrasait le
 * premier, et le défaut France se perdait dès que la profondeur se posait (le périmètre envoyé se
 * DÉDUIT de la zone ; la perdre aurait lancé une analyse sans filtre géographique).
 *
 * · Zone — #3742 : « France par défaut (pays de l'utilisateur), option monde entier », même doctrine
 *   que Découvrir (#2621.1). Seulement pour un marché français : un marché non-FR n'a pas
 *   d'équivalent câblé, on ne lui invente aucun défaut restrictif.
 * · Profondeur — #3944 : « Approfondie » écrite EXPLICITEMENT dès le montage, sinon le coût ANNONCÉ
 *   divergerait du coût DÉBITÉ (`?? 'verified'` côté serveur). Pas de palier en relance.
 * · Changer de pays retire la zone de l'ancien pays (#3742, recette prod 10/10) : la puce « France »
 *   posée pour lui ne doit pas survivre à un passage au marché US.
 */
export function useCadrageDefaults({
  selection,
  onSelectionChange,
  country,
  relaunch,
}: {
  selection: AnalysisScopeSelection
  onSelectionChange: (next: AnalysisScopeSelection) => void
  country: string
  relaunch: boolean
}): void {
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  useEffect(() => {
    const current = selectionRef.current
    const defaults: Partial<AnalysisScopeSelection> = {}
    if (current.geo_perimeter === undefined && country === 'FR') defaults.geo_perimeter = DEFAULT_CADRAGE_GEO
    if (!relaunch && current.depth === undefined) defaults.depth = 'deep'
    if (Object.keys(defaults).length > 0) onSelectionChange({ ...current, ...defaults })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posés au montage et au changement de pays/relance
  }, [country, relaunch])

  const previousCountry = useRef(country)
  useEffect(() => {
    if (previousCountry.current === country) return
    previousCountry.current = country
    const { geo_perimeter: _perimeter, geo_areas: _areas, ...rest } = selectionRef.current
    onSelectionChange(country === 'FR' ? { ...rest, geo_perimeter: DEFAULT_CADRAGE_GEO } : rest)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne réagit qu'au pays
  }, [country])
}
