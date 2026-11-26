import { useNavigate } from '@tanstack/react-router'
import { Dialog, DialogContent, DialogDescription, DialogTitle, Input } from '@bellum/ui'
import {
  Briefcase,
  Building2,
  CalendarRange,
  ListChecks,
  ScanSearch,
  Search,
  Settings,
  Sparkles,
  User,
  UserRound,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { hasPermission } from '@bellum/contracts'
import { useDebounce } from '@/hooks/useDebounce'
import { useArrivalOrder } from '@/hooks/useArrivalOrder'
import { overlayDialogClassName } from '@/components/layout/overlay'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { GLOBAL_SEARCH_MIN_QUERY_LENGTH } from './constants'
import { talentNameText } from '@/features/consultants/lib/talentName'
import { useTeam } from '@/features/team/hooks/useTeam'
import { GlobalSearchResultGroup } from './GlobalSearchResultGroup'
import { globalSearchOptionId } from './global-search-option-id'
import { useAccountSearchResults } from './useAccountSearchResults'
import { useActionSearchResults } from './useActionSearchResults'
import { useConsultantSearchResults } from './useConsultantSearchResults'
import { useContactSearchResults } from './useContactSearchResults'
import { useMissionSearchResults } from './useMissionSearchResults'
import { useNeedSearchResults } from './useNeedSearchResults'
import { useSettingsSearchResults } from './useSettingsSearchResults'
import { useGlobalSearchStore } from './globalSearchStore'
import { useHiddenAccountMatches } from './useHiddenAccountMatches'

/** L'id DOM de la liste de résultats — `aria-controls` de l'input, jamais
 *  recomposé ailleurs (GA-26). */
const LISTBOX_ID = 'global-search-listbox'

type GlobalSearchOption = { groupKey: string; id: string; onSelect: (id: string) => void }

/**
 * La recherche globale multi-entités (#2207.67-74, épopée #3015).
 *
 * Montée une seule fois à la racine (dans `ShortcutsProvider`, lui-même monté
 * une fois) : deux montages ouvriraient deux modales sur la même frappe.
 *
 * Chaque groupe (`GlobalSearchResultGroup`) rend NUL quand il n'a rien —
 * doctrine « on n'affiche pas ce qu'on n'a pas » : la modale ne dit jamais
 * « 0 résultat », elle montre seulement les groupes qui en ont.
 */
export function GlobalSearchDialog() {
  const navigate = useNavigate()
  const { t } = useTranslation('globalSearch')
  const { t: tCommon } = useTranslation('common')
  const { t: tConsultants } = useTranslation('consultants')
  const { t: tNav } = useTranslation('nav')
  const isOpen = useGlobalSearchStore(state => state.isOpen)
  // perf P3 — monté au root : le rôle ne sert qu'aux réglages proposés DANS la
  // recherche, donc `/workspaces/me` ne part qu'à l'ouverture (même clé que
  // l'écran Équipe : une seule requête si elle est déjà en cache).
  const { team } = useTeam({ enabled: isOpen })
  const canManageWorkspace = hasPermission(team?.workspace.role ?? 'member', 'team:manage')
  const setOpen = useGlobalSearchStore(state => state.setOpen)
  const [query, setQuery] = useState('')
  const [debouncedQuery] = useDebounce(query, 250)
  const inputRef = useRef<HTMLInputElement>(null)

  const accounts = useAccountSearchResults(isOpen ? debouncedQuery : '')
  // #4621.2 — aucun compte ACTIF ne correspond : on regarde ce que la liste écarte (archivés, coquilles d'échec).
  const hiddenAccounts = useHiddenAccountMatches(
    isOpen ? debouncedQuery : '',
    accounts.isSuccess && accounts.data.data.length === 0,
  )
  const contacts = useContactSearchResults(isOpen ? debouncedQuery : '')
  const needs = useNeedSearchResults(isOpen ? debouncedQuery : '')
  const consultants = useConsultantSearchResults(isOpen ? debouncedQuery : '')
  const missions = useMissionSearchResults(isOpen ? debouncedQuery : '')
  const actions = useActionSearchResults(isOpen ? debouncedQuery : '')
  const settings = useSettingsSearchResults(isOpen ? debouncedQuery : '', tNav, canManageWorkspace)

  // Le champ oublie sa saisie à la fermeture : rouvrir une recherche vide
  // surprend moins qu'y retrouver la requête d'il y a dix minutes. Un EFFET
  // sur `isOpen`, et non le seul gestionnaire `onOpenChange` de Radix : la
  // fermeture peut aussi venir du STORE directement (un résultat sélectionné
  // navigue ET ferme), un chemin que Radix ne voit pas puisqu'il ne vient pas
  // d'une interaction DANS la modale.
  useEffect(() => {
    if (!isOpen) setQuery('')
  }, [isOpen])

  function selectAccount(id: string) {
    setOpen(false)
    void navigate({ to: '/accounts/$id', params: { id } })
  }

  // #4621.2 — le geste que la ligne DIT : la liste des comptes, sur le même nom, dans l'onglet qui les montre.
  function selectHiddenAccounts() {
    if (!hiddenAccounts) return
    setOpen(false)
    void navigate({
      to: '/accounts',
      search: {
        q: debouncedQuery.trim(),
        status: hiddenAccounts.kind === 'archived' ? 'archived' : ['error', 'canceled'],
      },
    })
  }

  function selectContact(id: string) {
    setOpen(false)
    void navigate({ to: '/contacts/$id', params: { id } })
  }

  function selectNeed(id: string) {
    setOpen(false)
    void navigate({ to: '/projects/needs/$needId', params: { needId: id } })
  }

  function selectConsultant(id: string) {
    setOpen(false)
    void navigate({ to: '/consultants/$id', params: { id } })
  }

  function selectMission(id: string) {
    setOpen(false)
    void navigate({ to: '/missions/$id', params: { id } })
  }

  function selectAction(id: string) {
    // Une action n'a pas de fiche à elle : elle vit dans le plan du COMPTE
    // qu'elle fait avancer (#2123.46). `id` reste celui de l'action, pour que
    // la clé de liste ne collisionne jamais entre deux actions du même compte
    // — c'est ici, et pas dans le rendu, que l'identifiant se résout en cible.
    const action = actions.find(item => item.id === id)
    if (!action) return
    setOpen(false)
    void navigate({ to: '/accounts/$id', params: { id: action.account_id } })
  }

  function selectSetting(to: string) {
    setOpen(false)
    void navigate({ to })
  }

  // MAQ-SHELL-E8 (validé 19/10) — la loupe et « Analyser » ne font qu'UN champ : le nom tapé s'analyse
  // depuis ici, vers l'écran d'analyse existant (`/search?company=`), où l'entreprise exacte se choisit.
  const trimmedQuery = query.trim()
  const canOfferQuery = trimmedQuery.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH
  function selectAnalyze() {
    setOpen(false)
    void navigate({ to: '/search', search: { company: trimmedQuery } })
  }

  // MAQ-SHELL-I17 — « Demander à Laura » : la question PRÉ-REMPLIE, jamais envoyée ; sur place quand
  // le panneau de Laura est joignable, sinon la page Laura (même contrat que `AskLaura`).
  const openLauraInPlace = useOpenLauraInPlace()
  function selectAskLaura() {
    const question = t('laura.question', { query: trimmedQuery })
    setOpen(false)
    if (openLauraInPlace) openLauraInPlace(question)
    else void navigate({ to: '/chat', search: { prompt: question } })
  }

  const accountItems = (accounts.data?.data ?? []).map(account => ({ id: account.id, primary: account.company_name }))
  const hiddenAccountItems = hiddenAccounts
    ? [
        {
          id: hiddenAccounts.kind,
          primary: t(`hiddenAccounts.${hiddenAccounts.kind}`, { count: hiddenAccounts.count }),
        },
      ]
    : []
  const contactItems = (contacts.data?.data ?? []).map(contact => ({
    id: contact.id,
    primary: contact.full_name,
    secondary: contact.entity,
  }))
  const needItems = (needs.data?.data ?? []).map(need => ({
    id: need.id,
    primary: need.title,
    secondary: need.account_name,
  }))
  const consultantItems = (consultants.data?.items ?? []).map(consultant => ({
    id: consultant.id,
    primary: talentNameText(consultant.fullName, tConsultants('name.unnamed')),
    secondary: consultant.title,
  }))
  const missionItems = missions.map(mission => ({
    id: mission.id,
    primary: mission.label,
    secondary: mission.accountName,
  }))
  const actionItems = actions.map(action => ({ id: action.id, primary: action.label, secondary: action.company_name }))
  const settingItems = settings.map(setting => ({ id: String(setting.to), primary: setting.label }))

  const groupOptions = {
    accounts: accountItems.map(item => ({ groupKey: 'accounts', id: item.id, onSelect: selectAccount })),
    hiddenAccounts: hiddenAccountItems.map(item => ({
      groupKey: 'hiddenAccounts',
      id: item.id,
      onSelect: selectHiddenAccounts,
    })),
    contacts: contactItems.map(item => ({ groupKey: 'contacts', id: item.id, onSelect: selectContact })),
    needs: needItems.map(item => ({ groupKey: 'needs', id: item.id, onSelect: selectNeed })),
    consultants: consultantItems.map(item => ({ groupKey: 'consultants', id: item.id, onSelect: selectConsultant })),
    missions: missionItems.map(item => ({ groupKey: 'missions', id: item.id, onSelect: selectMission })),
    actions: actionItems.map(item => ({ groupKey: 'actions', id: item.id, onSelect: selectAction })),
    settings: settingItems.map(item => ({ groupKey: 'settings', id: item.id, onSelect: selectSetting })),
    offers: canOfferQuery
      ? [
          { groupKey: 'analyze', id: 'company', onSelect: selectAnalyze },
          { groupKey: 'laura', id: 'ask', onSelect: selectAskLaura },
        ]
      : [],
  } satisfies Record<string, GlobalSearchOption[]>
  type GroupSlot = keyof typeof groupOptions
  // Ordre stable sous le pointeur (recette prod 03/11) : chaque groupe prend sa place À SON ARRIVÉE — « Analyser » /
  // « Demander à » dès la frappe, puis les groupes de données dans l'ordre où leurs réponses arrivent. Un groupe arrivé
  // APRÈS d'autres lignes s'insère SOUS elles, jamais au-dessus. Ordre canonique = celui des clés ci-dessus.
  const slots = useArrivalOrder(
    isOpen,
    query,
    (Object.keys(groupOptions) as GroupSlot[]).filter(slot => groupOptions[slot].length > 0),
  )
  /**
   * #3015 (recette du 25/09/2026) — la liste APLATIE, dans l'ordre d'affichage
   * des groupes : c'est sur ELLE que ↑/↓ avance, pas sur un groupe isolé
   * — une flèche doit pouvoir traverser « Comptes » puis entrer dans
   * « Contacts » sans notion de frontière entre les deux.
   */
  const flatOptions: GlobalSearchOption[] = slots.flatMap(slot => groupOptions[slot])

  const [activeIndex, setActiveIndex] = useState(0)
  const flatSignature = flatOptions.map(option => `${option.groupKey}:${option.id}`).join('|')
  // Un résultat qui apparaît, disparaît ou change de rang (nouvelle frappe,
  // réponse réseau) remet le surlignage sur le PREMIER résultat plutôt que de
  // garder un rang qui pointerait sur une entité différente — ou sur rien.
  useEffect(() => {
    setActiveIndex(0)
  }, [flatSignature])

  const activeOption = flatOptions[activeIndex]
  const activeId = activeOption ? globalSearchOptionId(activeOption.groupKey, activeOption.id) : undefined

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      if (flatOptions.length === 0) return
      event.preventDefault()
      setActiveIndex(index => Math.min(index + 1, flatOptions.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      if (flatOptions.length === 0) return
      event.preventDefault()
      setActiveIndex(index => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter' && event.shiftKey && canOfferQuery) {
      event.preventDefault()
      selectAskLaura()
      return
    }
    if (event.key === 'Enter' && activeOption) {
      event.preventDefault()
      activeOption.onSelect(activeOption.id)
    }
  }

  const groupNodes: Record<GroupSlot, ReactNode> = {
    accounts: (
      <GlobalSearchResultGroup
        groupKey="accounts"
        label={t('groups.accounts')}
        items={accountItems}
        activeId={activeId}
        onSelect={selectAccount}
        icon={Building2}
        endLabel={t('openLabel')}
      />
    ),
    hiddenAccounts: (
      <GlobalSearchResultGroup
        groupKey="hiddenAccounts"
        label={t('hiddenAccounts.group')}
        items={hiddenAccountItems}
        activeId={activeId}
        onSelect={selectHiddenAccounts}
        icon={Building2}
        endLabel={t('hiddenAccounts.end')}
      />
    ),
    contacts: (
      <GlobalSearchResultGroup
        groupKey="contacts"
        label={t('groups.contacts')}
        items={contactItems}
        activeId={activeId}
        onSelect={selectContact}
        icon={User}
        endLabel={t('openLabel')}
      />
    ),
    needs: (
      <GlobalSearchResultGroup
        groupKey="needs"
        label={t('groups.needs')}
        items={needItems}
        activeId={activeId}
        onSelect={selectNeed}
        icon={Briefcase}
        endLabel={t('openLabel')}
      />
    ),
    consultants: (
      <GlobalSearchResultGroup
        groupKey="consultants"
        label={t('groups.consultants')}
        items={consultantItems}
        activeId={activeId}
        onSelect={selectConsultant}
        icon={UserRound}
        endLabel={t('openLabel')}
      />
    ),
    missions: (
      <GlobalSearchResultGroup
        groupKey="missions"
        label={t('groups.missions')}
        items={missionItems}
        activeId={activeId}
        onSelect={selectMission}
        icon={CalendarRange}
        endLabel={t('openLabel')}
      />
    ),
    actions: (
      <GlobalSearchResultGroup
        groupKey="actions"
        label={t('groups.actions')}
        items={actionItems}
        activeId={activeId}
        onSelect={selectAction}
        icon={ListChecks}
        endLabel={t('openLabel')}
      />
    ),
    settings: (
      <GlobalSearchResultGroup
        groupKey="settings"
        label={t('groups.settings')}
        items={settingItems}
        activeId={activeId}
        onSelect={selectSetting}
        icon={Settings}
        endLabel={t('openLabel')}
      />
    ),
    offers: canOfferQuery ? (
      <>
        <GlobalSearchResultGroup
          groupKey="analyze"
          label={t('analyze.group')}
          items={[{ id: 'company', primary: t('analyze.row', { query: trimmedQuery }) }]}
          activeId={activeId}
          onSelect={selectAnalyze}
          icon={ScanSearch}
          endLabel={t('analyze.end')}
        />
        <div className="mx-2.5 my-1 border-t border-[var(--bellum-border)]" aria-hidden="true" />
        <GlobalSearchResultGroup
          groupKey="laura"
          label={t('laura.group')}
          hideLabel
          items={[{ id: 'ask', primary: t('laura.row', { query: trimmedQuery }) }]}
          activeId={activeId}
          onSelect={selectAskLaura}
          icon={Sparkles}
          endLabel={t('laura.keys')}
        />
      </>
    ) : null,
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent
        closeLabel={tCommon('actions.close')}
        className={`top-[12%] max-w-[40rem] translate-y-0 md:top-[16%] ${overlayDialogClassName}`}
        onOpenAutoFocus={event => {
          // Radix focus le PREMIER élément focusable par défaut (la croix de
          // fermeture, en pratique) ; le champ de recherche EST ce que
          // l'ouverture demande.
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        {/* Théo `.layer-head` : loupe, grand champ sans cadre — la croix de la primitive à droite. « Échap » se lit
            dans le pied : un capuchon `<kbd>` ne se rend qu'à un endroit (GA-44, `ShortcutKeys`). */}
        <div className="flex items-center gap-3 border-b border-[var(--bellum-border)] pl-[1.125rem] pr-14 md:pl-5">
          <Search className="size-5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
          <Input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t('placeholder')}
            aria-label={t('inputLabel')}
            // #3015 — ↑/↓ déplace `aria-activedescendant` sans jamais quitter
            // le champ (le focus clavier RESTE dans l'input, c'est le rôle de
            // ces attributs de dire au lecteur d'écran laquelle ligne est
            // « active »). Pas de `role="combobox"` explicite : le rôle
            // implicite `textbox` de l'`<input>` reste — le changer aurait
            // cassé chaque `getByRole('textbox', …)` déjà écrit pour cet
            // écran, pour une reformulation qu'`aria-activedescendant`
            // n'exige pas (la spec l'autorise déjà sur `textbox`).
            aria-expanded={flatOptions.length > 0}
            aria-controls={LISTBOX_ID}
            aria-activedescendant={activeId}
            autoComplete="off"
            className="h-14 flex-1 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
          />
        </div>
        <div
          id={LISTBOX_ID}
          role="listbox"
          aria-label={t('title')}
          className="flex max-h-[min(26rem,60dvh)] flex-col gap-1 overflow-y-auto p-2 empty:hidden"
        >
          {slots.map(slot => (
            <Fragment key={slot}>{groupNodes[slot]}</Fragment>
          ))}
        </div>
        {/* Théo `.layer-foot` : la règle à gauche, le clavier à droite. */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-[1.125rem] py-2.5 text-xs text-[var(--bellum-text-muted)] md:px-5">
          <p>{t('hint')}</p>
          <p className="hidden md:block" aria-hidden="true">
            {t('keys')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
