import { resolveSignalSourceLink } from '@bellum/contracts'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Le nom du site d'origine : l'hôte sans « www. ». Rien d'autre n'est affiché de l'URL. */
function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

/**
 * Théo B (partagé) — « SOURCES CLIQUABLES, VISIBLES DIRECTEMENT » : le lien vers la page d'ORIGINE d'un signal,
 * d'une offre, d'un article, posé sur la ligne ou la carte elle-même. Nom du site + ↗, nouvel onglet sécurisé,
 * cible ≥ 44 px, nom accessible « Ouvrir la source : <site> ». Le clic n'ouvre PAS le détail de la ligne.
 * Sans URL http(s) vérifiable : RIEN — jamais un lien inventé ni une recherche de repli.
 */
export function OriginSourceLink({ url }: { url: string | null | undefined }) {
  const { t } = useTranslation('common')
  const link = resolveSignalSourceLink({ url })
  if (link.kind === 'none') return null
  const site = siteName(link.url)
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('originSource.open', { site })}
      onClick={event => event.stopPropagation()}
      className="inline-flex min-h-11 min-w-0 items-center gap-1 text-xs text-[var(--bellum-text-accent)] underline underline-offset-2"
    >
      <span className="truncate">{site}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  )
}
