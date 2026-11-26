import { compareToTarget, type KpiTarget, type KpiTargetStatus } from '@bellum/contracts'
import { Badge } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatKpiTarget } from './kpi-target-format'

/**
 * LA CIBLE D'UN INDICATEUR, ET OÙ ON EN EST — la pilule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « DSO 71 jours » ne dit pas s'il faut s'inquiéter. « DSO 71 jours · cible
 * < 65 j » le dit en un coup d'œil. C'est la seule chose qui manquait à des
 * calculs par ailleurs justes et déjà affichés.
 *
 * Il existe pour que le FORMATAGE et la COMPARAISON vivent à un seul endroit.
 * Deux écrans qui écrivent chacun leur « < 65 j » finissent par écrire l'un
 * « ≤ 65 » et l'autre « 65 max », et deux tuiles qui refont la comparaison
 * finissent par colorer différemment la même valeur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, ET LE TROISIÈME EST LE PLUS IMPORTANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Une valeur absente n'est JAMAIS « hors cible ». La pilule reste, sans couleur,
 * et dit « non comparée » : la destination est connue, le point de départ non.
 *
 * Le piège est retors parce qu'il se trompe dans le bon sens : un délai de
 * paiement inconnu traité comme `0` passerait « < 65 j » haut la main et
 * s'afficherait VERT — « on est payé le jour même », le meilleur résultat
 * imaginable, sur un espace où l'on ne sait rien. L'appelant passe donc `null`
 * (jamais un repli) dès que la mesure n'existe pas ou n'est pas encore fiable ;
 * `compareToTarget` fait le reste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CIBLES DE COMPLÉTUDE SE DISENT AUTREMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Marge non mesurée < 10 % » ne parle pas de la santé de l'ESN : elle dit à
 * quel point les autres chiffres méritent d'être crus. Rendue du même vert que
 * les autres, elle se lirait « tout va bien » là où la phrase juste est « on
 * sait de quoi on parle ». La pilule le NOMME.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COULEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune couleur écrite ici : les variantes de `Badge` portent déjà les couples
 * fond/texte qui passent AA dans les deux thèmes (D79). Et jamais de rouge —
 * « hors cible » sur un indicateur de pilotage est une file de travail, pas une
 * panne ; le rouge est réservé à ce qui est cassé.
 */
export function KpiTargetBadge({
  target,
  value,
  className,
}: {
  target: KpiTarget
  /** La valeur mesurée, dans l'unité de la cible. `null` = pas de comparaison. */
  value: number | null | undefined
  className?: string
}) {
  const { t } = useTranslation('pilotage')
  const status = compareToTarget(value, target)
  return (
    <Badge variant={VARIANTS[status]} className={className}>
      {t('target.label', { bound: formatKpiTarget(target, t) })}
      {target.measures === 'completeness' ? ` · ${t('target.completeness')}` : ''}
      {/* Le verdict est porté par la couleur, qui ne s'annonce pas toute seule.
          Sans cette ligne, un lecteur d'écran entend « cible < 65 j » et n'apprend
          jamais de quel côté on est. */}
      <span className="sr-only"> — {t(`target.status.${status}`)}</span>
    </Badge>
  )
}

/** Le verdict → la variante. `outline` pour « non comparée » : une absence de
 *  mesure n'est ni un succès ni un échec, et lui donner une couleur en ferait
 *  l'un des deux. */
const VARIANTS: Record<KpiTargetStatus, 'success' | 'warning' | 'outline'> = {
  on_target: 'success',
  off_target: 'warning',
  unmeasured: 'outline',
}
