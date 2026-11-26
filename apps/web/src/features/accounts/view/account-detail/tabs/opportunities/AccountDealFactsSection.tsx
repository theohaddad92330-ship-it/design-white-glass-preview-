import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { AccountFactLines } from '@/components/account/AccountFactLines'
import { useAccountFactsBrief } from '@/features/account-facts/useAccountFactsBrief'

/**
 * #3918.1 — recette prod R4b (73cd6104b3), SNCF RESEAU et SG : les affaires CRM
 * gagnées / perdues / en sommeil (socle de faits du compte, #4069/#4072) n'étaient
 * montées QUE dans la préparation de RDV (`AccountFactsBriefBlock`,
 * `MeetingPrepDialog`) — jamais sur la fiche compte elle-même, qui ne montrait
 * que le compteur de `KnownAccountValueCard`. Même lecteur
 * (`useAccountFactsBrief`), même rendu (`AccountFactLines`, GA-26) : pas une
 * seconde lecture, un second appelant du même composant.
 */
export function AccountDealFactsSection({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accountFacts')
  const brief = useAccountFactsBrief(accountId)
  const notes = brief?.notes ?? []
  if (!brief || brief.deals.length + notes.length === 0) return null
  // #4069.4 — affaires passées avec leur issue ET notes de l'équipe, lisibles hors de Laura ; une rubrique
  // sans fait ne fait aucune ligne.
  return (
    <div className="flex flex-col gap-4">
      {brief.deals.length > 0 ? (
        <section aria-labelledby="account-deal-facts-title" className="flex flex-col gap-1">
          <Text element="h3" size="sm" weight="semibold" id="account-deal-facts-title">
            {t('brief.deals')}
          </Text>
          <AccountFactLines facts={brief.deals} />
        </section>
      ) : null}
      {notes.length > 0 ? (
        <section aria-labelledby="account-notes-facts-title" className="flex flex-col gap-1">
          <Text element="h3" size="sm" weight="semibold" id="account-notes-facts-title">
            {t('brief.notes')}
          </Text>
          <AccountFactLines facts={notes} />
        </section>
      ) : null}
    </div>
  )
}
