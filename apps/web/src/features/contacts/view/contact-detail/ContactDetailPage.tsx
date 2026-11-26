import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { FolderOpen, User, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PageBreadcrumb } from '@/components/layout/PageHeader'
import { CustomerPage } from '@/components/page/CustomerPage'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useContact } from '@/features/contacts/hooks/useContact'
import { accountCrumbLabel, needsAccountFallback } from '@/features/contacts/lib/contactEntity'
import { accountCrumbTarget, contactsCrumbTarget, readContactOrigin } from '@/features/contacts/lib/contactOrigin'
import { useMergedContactRedirect } from '@/features/contacts/hooks/useMergedContactRedirect'
import { ContactDetail } from './ContactDetail'
import { recheckFrom } from './alerts/recheckFrom'
import { ContactDetailLoading } from './states/ContactDetailLoading'
import { ContactDetailNotFound } from './states/ContactDetailNotFound'

type ContactRouteId = '/contacts/$id'

/** Route entry for a single contact. #4504.4 — the breadcrumb is SHORT: « Contacts › Name », or « Account ›
 *  Name » when the record was opened from that account (origin in the URL). #4504.2 — « Copier le lien » lives
 *  in the record's « … » menu (`ContactMoreActions`). */
export function ContactDetailPage({ from = '/contacts/$id' }: { from?: ContactRouteId } = {}) {
  const { t } = useTranslation('contacts')
  const { id } = useParams({ from })
  const search = useSearch({ from })
  const navigate = useNavigate()
  const { data: contact, isLoading, isError, refetch } = useContact(id)
  // The id in the URL may have been retired by a dedup merge — the API resolved
  // it, so put the canonical one back in the address bar.
  useMergedContactRedirect(contact, id)

  // #1473 — un contact À QUALIFIER n'a pas de dossier : le maillon « entreprise »
  // du fil d'Ariane disparaît, il ne devient pas un lien mort. Le chemin reste
  // vrai — Comptes › Contacts › la personne — au lieu de promettre un dossier
  // qui n'existe pas.
  //
  // #2150.62 — L'OBJET D'ORIGINE GAGNE. Ouvert depuis un compte, le maillon
  // « compte » ramène à CE compte et à l'onglet quitté (organigramme compris).
  // Sans origine dans l'URL (lien direct, annuaire), le fil d'Ariane reste
  // celui d'avant, dérivé du compte du contact.
  const origin = readContactOrigin(search)
  // #4504.4 (contrat Louis 24/10) — fil d'Ariane COURT : « Contacts › Nom ». Seule une origine COMPTE explicite
  // (#2150.62, ouverte depuis un compte) remplace « Contacts » par ce compte, pour garder le retour à l'onglet quitté.
  const accountCrumb = origin?.kind === 'account' ? accountCrumbTarget(origin, contact?.account_id ?? null) : null
  // Vu en passant (lot R22, 07/10) — `contact.entity` est une déclaration LIBRE
  // (#2158.57), pas le nom du compte : un import qui y a écrit le bruit « N/A »
  // l'affichait comme un libellé de maillon. Le compte associé (fichier chargé
  // SEULEMENT quand l'entité ne suffit pas, même garde que `ContactHeader.tsx`)
  // prend sa place avant le libellé générique — jamais « N/A » affiché.
  const { data: crumbAccount } = useQuery({
    queryKey: accountKeys.detail(accountCrumb?.accountId ?? 'none'),
    queryFn: () => accountsApi.getOne(accountCrumb?.accountId ?? ''),
    enabled: Boolean(accountCrumb) && needsAccountFallback(contact?.entity ?? null),
  })
  const breadcrumbs: PageBreadcrumb[] | undefined = contact
    ? [
        ...(accountCrumb
          ? [
              {
                label: accountCrumbLabel(
                  contact.entity,
                  crumbAccount?.company_name ?? null,
                  t('breadcrumbs.accountFallback'),
                ),
                icon: FolderOpen,
                // #3674.R1 — les filtres de l'origine (quand il y en avait) voyagent
                // avec le retour : le fil d'Ariane ramène aux filtres de l'onglet
                // Contacts, pas seulement au compte/onglet.
                onClick: () =>
                  void navigate({
                    to: '/accounts/$id',
                    params: { id: accountCrumb.accountId },
                    search: { tab: accountCrumb.tab, ...accountCrumb.filters, ...accountCrumb.org },
                  }),
              },
            ]
          : [
              // #3687.16 — origine LISTE : le maillon ramène aux MÊMES filtres que
              // ceux quittés, pas à la liste nue. `to` ne porte pas de `search` —
              // même geste que le maillon « compte » ci-dessus (`onClick` + `navigate`).
              {
                label: t('breadcrumbs.contacts'),
                icon: Users,
                ...(origin?.kind === 'list'
                  ? { onClick: () => void navigate({ to: '/contacts', search: contactsCrumbTarget(origin) }) }
                  : { to: '/contacts' }),
              },
            ]),
        { label: contact.full_name, icon: User },
      ]
    : undefined

  return (
    // #1846 — la gouttière par défaut de `CustomerPage` (`CONTENT_PADDING`)
    // suffit : `contentClassName="px-0 py-6"` neutralisait l'horizontale du
    // conteneur pour que `ContactDetail` la repose elle-même en `px-4` SANS le
    // palier `md:px-6` — sur desktop la fiche d'un contact portait donc 16 px
    // de marge quand `AccountDetail.tsx` (même largeur, `max-w-[1480px]`) et
    // toutes les autres pages en portent 24. Retirer les deux paliers ramène
    // les deux fiches à la même échelle.
    <CustomerPage pageTitle={contact?.full_name} breadcrumbs={breadcrumbs}>
      {isLoading ? (
        <ContactDetailLoading />
      ) : isError || !contact ? (
        <ContactDetailNotFound />
      ) : (
        <ContactDetail contact={contact} initialTab={search.tab} onRefresh={() => recheckFrom(refetch)} />
      )}
    </CustomerPage>
  )
}
