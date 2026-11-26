import { Text } from '@bellum/ui'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Le site d'origine d'une URL http(s), sans « www. » ; `null` si ce n'est pas une page web (rien n'est deviné). */
function siteOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/**
 * Théo C projects-besoins — « sources cliquables, visibles directement » (Louis 22/10) :
 * le LIEN vers la page d'origine (l'offre, l'article) est sur la ligne elle-même — nom du
 * site d'origine + icône de lien externe, nouvel onglet, cible ≥ 44 px, nom accessible.
 * Le clic n'ouvre PAS le détail (propagation arrêtée). Pas d'URL connue = pas de lien.
 */
export function NeedSourceLink({ url }: { url: string | null | undefined }) {
  const { t } = useTranslation('projects')
  const site = siteOf(url)
  if (!url || !site) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('openNeeds.sourceLink.open', { site })}
      onClick={event => event.stopPropagation()}
      className="inline-flex min-h-11 min-w-0 items-center gap-1 rounded-sm text-[var(--bellum-text-accent)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-fine:min-h-6"
    >
      <Text element="span" size="xs" className="truncate">
        {site}
      </Text>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  )
}
