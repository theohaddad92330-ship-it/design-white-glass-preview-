import type { Account, AccountMissions, Contact, ProjectReadRow, Proof } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildAccountWatchData } from '@/features/accounts/model/watchData'
import { planItemsKey } from '@/features/actions/hooks/usePlanItems'
import { planItemsApi } from '@/features/actions/planItems.api'
import { useTimeline } from '@/features/activities/hooks/useTimeline'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'
import { signalSourceLabel } from '@/lib/data-source-label'
import type { TabId } from '../components/AccountDetailTabsBar'
import { normaliseEntities } from '../components/entities/entityData'
import { useAccountOverviewData } from '../tabs/useAccountOverviewData'
import { DossierSearch } from './DossierSearchField'
import { dossierItemRef, type DossierSearchItem, type DossierSearchResult } from './dossierSearch'
import { buildDossierSearchItems } from './dossierSearchIndex'

interface AccountDossierSearchProps {
  account: Account
  contacts: Contact[]
  /** Ouvre une sous-partie du dossier, avec l'objet visé (`<type>:<id>`). */
  onOpenInDossier: (tab: TabId, item?: string) => void
}

/**
 * #2128.31 / #2128.53 / #2128.62 — la recherche du dossier, branchée.
 *
 * La requête vit dans l'URL (`?find=`, en `replace` : une frappe n'empile pas
 * une entrée d'historique par lettre) ; ouvrir un résultat POUSSE une entrée,
 * donc « précédent » ramène le dossier avec sa recherche.
 */
export function AccountDossierSearch({ account, contacts, onOpenInDossier }: AccountDossierSearchProps) {
  const navigate = useNavigate()
  const query = useSearch({ from: '/accounts/$id', select: search => search.find ?? '' })
  const [active, setActive] = useState(query.length > 0)
  const [items, setItems] = useState<readonly DossierSearchItem[]>([])

  const setQuery = (next: string) => {
    void navigate({
      to: '/accounts/$id',
      params: { id: account.id },
      search: prev => ({ ...prev, find: next || undefined }),
      replace: true,
    })
  }

  // #2128.62 — un résultat qui a sa propre page l'ouvre (la fiche, pas le
  // dossier) ; les autres ouvrent leur sous-partie avec l'objet dans l'URL.
  const openResult = (result: DossierSearchResult) => {
    if (result.kind === 'contact') {
      void navigate({ to: '/contacts/$id', params: { id: result.id } })
    } else if (result.kind === 'mission') {
      void navigate({ to: '/missions/$id', params: { id: result.id } })
    } else if (result.kind === 'need') {
      void navigate({ to: '/projects/needs/$needId', params: { needId: result.id } })
    } else {
      onOpenInDossier(result.tab, dossierItemRef(result))
    }
  }

  return (
    // #2351 — `min-w-0 lg:max-w-xs` : dans la rangée compacte du dossier
    // (`account-context-row`, `flex lg:flex-nowrap`), la recherche prenait
    // toute la largeur restante (le champ va jusqu'à `md:max-w-md`, 448 px) et
    // ne laissait plus de place au propriétaire ni à la provenance. Une
    // largeur BORNÉE à partir de 1 024 px, plutôt que retirer une des trois.
    <div onFocusCapture={() => setActive(true)} className="min-w-0 w-full">
      {/* L'index ne se monte qu'à la PREMIÈRE utilisation (focus, ou requête
          reprise de l'URL) : un dossier qu'on lit sans chercher ne déclenche
          aucune lecture de plus. */}
      {(active || query.length > 0) && <DossierSearchIndex account={account} contacts={contacts} onItems={setItems} />}
      <DossierSearch
        accountId={account.id}
        companyName={account.company_name || ''}
        items={items}
        query={query}
        onQueryChange={setQuery}
        onOpen={openResult}
        // #2128.57 — préparer une action se fait dans le plan d'action.
        onPrepareAction={() => onOpenInDossier('plan')}
        // #2120.49 — CORRIGÉ (QCM Louis, 15/09/2026) : « Ajouter ce que je
        // sais » est une NOTE TERRAIN sur une personne, le MÊME geste que la
        // carte d'influence (#2121.43 — datée, gagne sur l'analyse, jamais
        // écrasée), qui vit dans l'Organigramme (`FocalOrgView` →
        // `OrgCorrectionDrawer`). #2128.58 l'envoyait vers l'Historique — un
        // geste câblé, mais vers le mauvais tiroir : « ce que je sais »
        // n'est pas un journal d'activité, c'est une correction datée sur
        // UNE personne. On réutilise le mécanisme existant, on n'en recode
        // aucun.
        onAddWhatIKnow={() => onOpenInDossier('organigramme')}
      />
    </div>
  )
}

/**
 * #2128.34-43 — les lectures que le dossier fait DÉJÀ, avec les MÊMES clés de
 * cache (importées) : une section déjà ouverte ne relance aucun appel.
 */
function DossierSearchIndex({
  account,
  contacts,
  onItems,
}: {
  account: Account
  contacts: Contact[]
  onItems: (items: readonly DossierSearchItem[]) => void
}) {
  const { t } = useTranslation('accountWatch')
  const overview = useAccountOverviewData(account)
  const projects = useQuery({
    queryKey: queryKeys.accounts.projects(account.id),
    queryFn: () => apiFetch<ProjectReadRow[]>({ path: `/projects?account_id=${account.id}` }),
  })
  const missions = useQuery({
    queryKey: queryKeys.accounts.missions(account.id),
    queryFn: () => apiFetch<AccountMissions>({ path: `/delivery/accounts/${account.id}/missions` }),
  })
  const capitalisation = useQuery({
    queryKey: queryKeys.accounts.capitalisation(account.id),
    queryFn: () => apiFetch<{ proofs: Proof[] }>({ path: `/capitalisation/accounts/${account.id}` }),
  })
  const planItems = useQuery({
    queryKey: planItemsKey(account.id),
    queryFn: () => planItemsApi.list(account.id),
  })
  const timeline = useTimeline('account', account.id)

  const items = useMemo(
    () =>
      buildDossierSearchItems({
        contacts,
        entities: normaliseEntities(overview.entities_exhaustive, overview.subsidiaries, account.company_name),
        signals: buildAccountWatchData(account).signals,
        sourceLabel: source => signalSourceLabel(t, source),
        projects: projects.data,
        missions: missions.data,
        planItems: planItems.data,
        proofs: capitalisation.data?.proofs,
        history: timeline.data?.items,
      }),
    [
      account,
      contacts,
      overview.entities_exhaustive,
      overview.subsidiaries,
      t,
      projects.data,
      missions.data,
      planItems.data,
      capitalisation.data,
      timeline.data,
    ],
  )

  useEffect(() => onItems(items), [items, onItems])
  return null
}
