import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/** Pourquoi un compte SUIVI n'a pas de date de ré-analyse (`next_reanalysis_reason`, rendu par l'API). */
export type NextReanalysisReason = 'suspended' | 'never_analyzed' | 'not_followed'

/**
 * #4283.8 / recette 21/10 K4 — « Prochaine ré-analyse automatique : le 19 octobre », ou POURQUOI il n'y en a pas
 * (veille suspendue, jamais analysé). Lue de l'API, jamais calculée ici. Un compte NON suivi le dit aussi
 * (recette 22/10 K4 : « Pas de ré-analyse automatique : compte non suivi »). Une seule lecture pour la vue d'ensemble et l'onglet Signal.
 */
export function nextReanalysisText(
  t: (key: string, options?: Record<string, unknown>) => string,
  language: string,
  nextReanalysisAt: string | null | undefined,
  reason: NextReanalysisReason | null | undefined,
): string | null {
  const date = nextReanalysisAt ? new Date(`${nextReanalysisAt}T12:00:00Z`) : null
  if (date && !Number.isNaN(date.getTime())) {
    const label = date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })
    return t('signalFreshnessLine.nextReanalysis', { date: label })
  }
  if (reason === 'suspended') return t('signalFreshnessLine.reanalysisSuspended')
  if (reason === 'never_analyzed') return t('signalFreshnessLine.reanalysisNeverAnalyzed')
  if (reason === 'not_followed') return t('signalFreshnessLine.reanalysisNotFollowed')
  return null
}

export function NextReanalysisLine({
  nextReanalysisAt,
  reason,
}: {
  nextReanalysisAt?: string | null | undefined
  reason?: NextReanalysisReason | null | undefined
}) {
  const { t, i18n } = useTranslation('accounts')
  const text = nextReanalysisText(t, i18n.language, nextReanalysisAt, reason)
  if (!text) return null
  return (
    <Text element="p" size="xs" data-testid="next-reanalysis-line" className="text-[var(--bellum-text-muted)]">
      {text}
    </Text>
  )
}
