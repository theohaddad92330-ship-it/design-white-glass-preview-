import { resolveSignalSourceLink, type SignalSourceKind } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type SignalSourceLinkProps = {
  url: string | null | undefined
  sourceKind: string | null | undefined
  /** #3922.3 — la collecte du segment signaux est ANTÉRIEURE à la capacité « lien » :
   *  l'absence se DIT (rattrapage), elle ne se tait pas. Vient de `isSegmentCollectionStale`. */
  collectedBeforeLink?: boolean
}

/**
 * #3922.3 — LE rendu unique du lien d'un signal (veille, Mes cibles, Découvrir, cloche).
 *
 * Un signal sans URL http(s) vérifiable n'affiche RIEN : jamais un lien deviné, jamais
 * une recherche. #4045.3 (Louis 12/10/2026) rétablit « une absence ne fait aucune ligne »
 * (#2613) — le « Sans lien vérifiable » du brief K01 du 09/10 est retiré, partout.
 *
 * ⚠️ `noopener noreferrer` : une page ouverte en `_blank` garde sinon `window.opener`.
 */
export function SignalSourceLink({ url, sourceKind, collectedBeforeLink = false }: SignalSourceLinkProps) {
  const { t } = useTranslation('common')
  const link = resolveSignalSourceLink({ url, source_kind: sourceKind })

  if (link.kind === 'none') {
    // #4045.3 — « on n'affiche pas ce qu'on n'a pas » (Louis 20/09, rappelé le 12/10) : un
    // signal sans URL n'affiche aucun lien et aucune ligne. Seule la collecte ANTÉRIEURE
    // au lien se DIT (rattrapage #3922.3) — c'est un fait sur la collecte, pas une absence.
    if (!collectedBeforeLink) return null
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('signalSource.collectedBeforeLink')}
      </Text>
    )
  }
  const kind: SignalSourceKind = link.sourceKind
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-6 min-w-0 items-center gap-1 text-xs text-[var(--bellum-text-accent)] underline underline-offset-2"
    >
      <span className="truncate">{t(`signalSource.open.${kind}`)}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  )
}
