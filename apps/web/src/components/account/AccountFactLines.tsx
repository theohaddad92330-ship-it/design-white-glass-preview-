import type { AccountFactBrief } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'

/**
 * #4072 — LE rendu d'un fait du compte sur les écrans d'action : date · TYPE ·
 * libellé · lien générique si URL. Un seul endroit (GA-26) pour les listes de
 * cibles, les relances, la préparation de RDV, l'organigramme et les alertes.
 *
 *  - la date est ABSOLUE : un fait ancien ne passe jamais pour récent ;
 *  - la provenance ne s'affiche JAMAIS (ni source, ni domaine du lien) ;
 *  - une absence ne fait aucune ligne : rien à montrer, rien de rendu.
 */
const LISTING_KINDS: ReadonlySet<string> = new Set(['hiring', 'need'])

export function AccountFactLines({
  facts,
  max,
  className,
  withLinks = true,
}: {
  facts: readonly AccountFactBrief[] | undefined
  max?: number
  className?: string
  /** `false` quand la ligne vit DÉJÀ dans un lien : pas de lien dans un lien. */
  withLinks?: boolean
}) {
  const { t } = useTranslation('accountFacts')
  const list = facts ?? []
  const shown = list.slice(0, max ?? list.length)
  if (shown.length === 0) return null
  return (
    <ul className={className ?? 'mt-1 space-y-0.5 text-xs text-[var(--bellum-text-secondary)]'}>
      {shown.map(fact => (
        <li key={`${fact.kind}|${fact.date}|${fact.label}`}>
          <time dateTime={fact.date.slice(0, 10)}>{formatDate(fact.date) ?? fact.date.slice(0, 10)}</time>
          {' · '}
          <span className="font-medium uppercase tracking-wide">{t(`kind.${fact.kind}`)}</span>
          {' · '}
          <span>{fact.label}</span>
          {fact.url && withLinks ? (
            <>
              {' · '}
              <a
                href={fact.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-11 items-center text-[var(--bellum-text-accent)] underline"
              >
                {LISTING_KINDS.has(fact.kind) ? t('link.listing') : t('link.source')}
              </a>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
