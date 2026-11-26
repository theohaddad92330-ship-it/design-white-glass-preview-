import { AccountCrmProvenanceProvider } from '@/features/crm/hooks/useAccountCrmProvenance'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { capturedLegacyTabNotice, resolveLegacyTabNotice } from '../accountDetailSearch'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { AccountDetailPageContent } from '@/features/accounts/view/account-detail/components/AccountDetailPageContent'
import type { TabId } from '@/features/accounts/view/account-detail/components/AccountDetailTabsBar'
import { countRelevantContacts } from '@/features/contacts/lib/contactFunnel'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { rememberProgramsArrival } from '../tabs/veille/programsArrival'
import { useCurrentContact } from './useCurrentContact'

type DetailRouteId = '/accounts/$id'

export function AccountDetailPage({
  from = '/accounts/$id',
  initialTab,
}: {
  from?: DetailRouteId
  initialTab?: TabId
} = {}) {
  const { id } = useParams({ from })
  const { account, contacts, loading, error: loadError } = useCurrentContact(id || '')
  const { t } = useTranslation('accounts')
  // #3720 (recette MO 10/10) — l'arrivée par un ancien lien (`?tab=programs`) se capture ICI, au premier
  // rendu de l'écran : le dossier, lui, se démonte pendant le chargement du compte, et la lecture de
  // l'URL à son remontage tombait sur `?tab=veille` déjà réécrit — la notice de migration n'apparaissait jamais.
  const [legacyTabNotice] = useState(() => {
    // #3677 / #3720 (RAN, recette ND 10/10 en prod) — le routeur a DÉJÀ réécrit l'URL avant ce premier rendu
    // (validation de la recherche) : l'arrivée d'origine est celle que la validation a déposée.
    const notice =
      resolveLegacyTabNotice(new URLSearchParams(window.location.search).get('tab')) ?? capturedLegacyTabNotice()
    // #3677 — la carte « Projets et transformations » se monte après la réécriture d'URL : elle lit ce verdict.
    rememberProgramsArrival(notice?.value === 'programs' || notice?.value === 'programmes')
    return notice
  })

  // Ce que cet écran DÉCLARE montrer à Laura (bulle). Rien d'autre : la
  // déclaration ne lit pas, elle nomme ce qui est déjà à l'écran.
  //
  // ⚠️ Le nombre de contacts n'est déclaré que quand il a VRAIMENT été mesuré :
  // une lecture en échec rend `[]`, et « 0 contact » serait alors un zéro qui
  // ment — exactement ce que la règle « non mesuré n'est jamais 0 » interdit.
  //
  // #4099 (jumeau, recette prod 14/10, Sanofi) — « Contacts affichés : 2610 » ici pendant que la
  // fiche dit « 16 contacts clés » (TabOverview) : CE facet comptait `contacts.length` (TOUTE
  // la population détectée), pas les contacts PERTINENTS que #4099 avait corrigés ailleurs.
  // Même mesure que `TabOverview` (`countRelevantContacts`) : aucun pertinent ⇒ le facet
  // disparaît, jamais un « 0 » qui mentirait.
  const relevantContactsShown = countRelevantContacts(contacts)
  useLauraContext({
    kind: 'account',
    label: account?.company_name || t('pdf.fallbackAccountName'),
    entityId: id || null,
    // #1904.3 — l'objet ouvert, nommé — distinct de l'id qui ne cadre que.
    ...(account?.company_name ? { entityLabel: account.company_name } : {}),
    facets:
      loading || loadError || relevantContactsShown === null
        ? []
        : [{ label: t('laura.contactsShown'), value: String(relevantContactsShown) }],
    state: loading ? 'loading' : 'ready',
  })

  return (
    <CustomerPage pageTitle={account?.company_name}>
      {/* #4459.2 — la provenance CRM des contacts, lue une fois pour toute la fiche (hero, synthèse, Personnes, organigramme). */}
      <AccountCrmProvenanceProvider accountId={account?.id}>
        <AccountDetailPageContent
          account={account}
          contacts={contacts}
          loading={loading}
          loadError={loadError}
          initialTab={initialTab}
          legacyTabNotice={legacyTabNotice}
        />
      </AccountCrmProvenanceProvider>
    </CustomerPage>
  )
}
