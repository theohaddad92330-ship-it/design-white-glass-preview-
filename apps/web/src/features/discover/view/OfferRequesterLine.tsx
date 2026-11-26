import { useTranslation } from 'react-i18next'
import type { DiscoverOfferRequester } from '@/features/discover/lib/discover-types'

/* ------------------------------------------------------------------ */
/*  #4182 (EX-12) — de l'offre RH à l'équipe métier demandeuse.         */
/*                                                                     */
/*  Étayé (le texte de l'offre nomme un rattachement ou une équipe) :   */
/*  UNE ligne de fait, avec sa preuve. Sinon, l'équipe reste « à        */
/*  identifier » et la MÉTHODE se déplie à la demande — jamais une      */
/*  ligne d'absence dans la liste (Louis 20/09/2026).                   */
/*  L'auteur de l'annonce (RH, cabinet) n'est jamais présenté comme le  */
/*  demandeur ; aucune personne n'est nommée.                           */
/* ------------------------------------------------------------------ */

interface OfferRequesterLineProps {
  requester: DiscoverOfferRequester
}

export function OfferRequesterLine({ requester }: OfferRequesterLineProps) {
  const { t } = useTranslation('discover')
  const author = requester.author === 'non_precise' ? null : t(`needs.requester.author.${requester.author}`)

  if (requester.status === 'etaye') {
    const parts = [
      requester.possibleManagerFunction
        ? t('needs.requester.manager', { function: requester.possibleManagerFunction })
        : null,
      requester.team ? t('needs.requester.team', { team: requester.team }) : null,
      author,
    ].filter((part): part is string => part !== null)
    return (
      <span data-testid="need-requester" title={t('needs.requester.evidence')}>
        {parts.join(' · ')}
      </span>
    )
  }

  return (
    <details data-testid="need-requester-method" className="text-xs">
      <summary className="inline-flex min-h-11 cursor-pointer items-center">{t('needs.requester.toIdentify')}</summary>
      <ol className="ml-4 list-decimal">
        {requester.method.map(step => (
          <li key={step}>
            {t(`needs.requester.method.${step}`, {
              city: requester.city ?? t('needs.requester.theOfferEntity'),
            })}
          </li>
        ))}
      </ol>
      {author && <p>{author}</p>}
    </details>
  )
}
