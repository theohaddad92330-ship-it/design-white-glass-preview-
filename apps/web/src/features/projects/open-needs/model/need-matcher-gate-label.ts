import { needMatcherGate, type NeedMatcherGateInput } from '@bellum/contracts'

/** Le sous-ensemble de `useTranslation('matching')` dont ce fichier a besoin —
 *  pas le type entier d'i18next, pour ne pas coupler ce calcul à sa forme. */
type TMatching = (key: string, options?: Record<string, unknown>) => string

/**
 * #2323.13 / #2323.30 / #2323.47 — LE tooltip du bouton « Lancer le
 * matching », calculé une fois pour les trois écrans qui le montrent.
 *
 * Sans compétence, le message reste `launch.noSkills` (NO-GO, #2323.47) :
 * c'est le seul critère décisif, comportement inchangé. Le reste (séniorité,
 * localisation/mode, timing — #2323.14-.17) est un SIGNAL : absent, il se
 * NOMME dans `launch.readyWithGaps` au lieu de rester muet — c'est la
 * différence que fait #2323.30 (« une inconnue produit une question »)
 * pendant que #2323.29/.31 (UNKNOWN ≠ ZERO) interdit de bloquer dessus.
 */
export function needMatcherLaunchTooltip(need: NeedMatcherGateInput, t: TMatching): string {
  const gate = needMatcherGate(need)
  if (!gate.canLaunch) return t('launch.noSkills')
  if (gate.missingAdvisory.length === 0) return t('launch.ready')
  return t('launch.readyWithGaps', {
    missing: gate.missingAdvisory.map(criterion => t(`launch.gate.${criterion}`)).join(', '),
  })
}

/** Le SEUL critère qui bloque le bouton — extrait pour ne pas recopier
 *  `needMatcherGate(need).canLaunch` dans chaque écran. */
export function needMatcherCanLaunch(need: NeedMatcherGateInput): boolean {
  return needMatcherGate(need).canLaunch
}
