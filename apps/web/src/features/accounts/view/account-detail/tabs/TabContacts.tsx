import type { Contact, DecisionRole } from '@bellum/contracts'
import { Button, EmptyState } from '@bellum/ui'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FilterX, Users } from 'lucide-react'
import { useEnrichContacts } from '@/features/accounts/hooks/useEnrichAccount'
import { useAccountsHygiene } from '@/features/accounts/hooks/useAccountsHygiene'
import { contactsEmailVerdict } from '@/features/accounts/lib/accountHygiene'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { EnrichConfirmDialog } from '@/features/contacts/components/EnrichConfirmDialog'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { ContactGroupModeTabs } from './contacts/ContactGroupModeTabs'
import { useContactGroupMode } from './contacts/contact-group-mode'
import { ContactsCountersLine } from './contacts/ContactsCountersLine'
import { ContactsEmptyState } from './contacts/ContactsEmptyState'
import { buildPlaceIndex, buildPlaceOptions, matchesPlace, readContactPlace } from './contacts/contactLocation'
import { ContactsOutOfScopeNotice } from './contacts/ContactsOutOfScopeNotice'
import { ContactsDuplicateNotice } from './contacts/ContactsDuplicateNotice'
import { ContactsRulesCatchupNotice } from './contacts/ContactsRulesCatchupNotice'
import { ContactsStaleCollectionNotice } from './contacts/ContactsStaleCollectionNotice'
import { ContactsGeoExcludedNotice } from './contacts/ContactsGeoExcludedNotice'
import { SignalLeadsSection } from './contacts/SignalLeadsSection'
import { readSignalLeads } from './contacts/signalLeads'
import { readGeoExcludedContacts } from './contacts/geoExcluded'
import { readContactsOutOfScope } from './contacts/outOfScope'
import { ContactsSelectionBar } from './contacts/ContactsSelectionBar'
import { ContactsActiveFilters } from './contacts/ContactsActiveFilters'
import { ContactsToolbar } from './contacts/ContactsToolbar'
import { ContactsEntityExclude } from './contacts/ContactsEntityExclude'
import { EntityGroups } from './contacts/EntityGroups'
import { PriorityPathSection } from './contacts/PriorityPathSection'
import { ResearchExpansionCallout } from './contacts/ResearchExpansionCallout'
import {
  ORG_LEVEL_ORDER,
  buildContactLevelMap,
  filterContacts,
  groupContacts,
  probableDuplicateLinks,
} from './contacts/contactGrouping'
import type { ContactsTabFilters } from '../accountDetailSearch'
import { stagger } from '../motion'
import { buildOrgGraphViewData } from './organigramme/orgGraphData'

type TabContactsProps = {
  accountId: string
  contacts: Contact[]
  accountCompanyName: string
  rawAnalysis: Record<string, unknown>
  onContactClick?: (contact: Contact) => void
  /** Pre-seeds the search box — used when the rep opens this tab from a « zone
   *  blanche » to look for the missing decision-maker's title. */
  initialSearch?: string
  /**
   * #2120.77 — les filtres à RETROUVER au montage. L'onglet est démonté à
   * chaque changement de section : c'est l'appelant qui les garde (dans l'URL)
   * et les rend ici. Une clé absente = aucun filtre. `search` l'emporte sur
   * `initialSearch`.
   */
  initialFilters?: Partial<ContactsTabFilters>
  /** #2120.77 — appelé à CHAQUE changement, avec les quatre filtres. */
  onFiltersChange?: (filters: ContactsTabFilters) => void
  /**
   * #2120.46 — ouvre la saisie manuelle d'un contact. Le geste n'est plus
   * déclenché d'ici : il vit dans l'en-tête de la section Personnes, parce que
   * le haut de CET onglet est à trois écrans de défilement depuis que la
   * section empile l'organigramme au-dessus (mesuré à y = 3 226 px le
   * 14/09/2026). Cet onglet ne fait plus que le RELAYER depuis son état vide.
   */
  onCreateContact: () => void
  /** #2120.47 — ouvre l'import CSV. Même raison que ci-dessus. */
  onImportCsv: () => void
  /** #2126.22 — l'état vide propose « Changer de périmètre » : relayé tel quel. */
  onChangeScope?: () => void
  /** #2126.24 — l'état vide propose « Continuer sans cette donnée » : relayé tel quel. */
  onContinueWithout?: () => void
  /** #AF.3 — la date de la dernière collecte RÉELLE du segment contacts
   *  (`account.contacts_collected_at`). `null`/absent = jamais datée, jamais
   *  présumée à jour — voir `ContactsStaleCollectionNotice`. */
  contactsCollectedAt?: string | null
  /** LUDOVIC-C LC.1 — la remise de l'existant aux règles actuelles (`account.contacts_rules_applied_at`). */
  contactsRulesAppliedAt?: string | null
  /** LUDOVIC-E LC.1b — le site du compte : le domaine qui sépare un homonyme du vrai employeur. */
  accountWebsite?: string | null
  /** #4984.2 — l'effectif du compte (texte libre), relayé au chemin recommandé. */
}

export function TabContacts({
  accountId,
  contacts,
  accountCompanyName,
  rawAnalysis,
  onContactClick,
  initialSearch,
  initialFilters,
  onFiltersChange,
  onCreateContact,
  onImportCsv,
  onChangeScope,
  onContinueWithout,
  contactsCollectedAt,
  contactsRulesAppliedAt,
  accountWebsite,
}: TabContactsProps) {
  const { t, i18n } = useTranslation('accountOrg')
  // Entité et Niveau — les deux filtres mesurés absents de cet onglet le
  // 31/08 (maquette `03_tous_contacts_couverture.png`).
  // #2120.77 — un SEUL état pour les quatre filtres, repris de l'appelant au
  // montage et annoncé à chaque changement : l'appelant l'écrit dans l'URL, qui
  // est ce qui survit au démontage de l'onglet et au retour navigateur.
  const [filters, setFilters] = useState<ContactsTabFilters>(() => ({
    search: initialFilters?.search ?? initialSearch ?? '',
    role: initialFilters?.role ?? 'all',
    entity: initialFilters?.entity ?? 'all',
    level: initialFilters?.level ?? 'all',
    ...(initialFilters?.place ? { place: initialFilters.place } : {}),
  }))
  const { search, role: roleFilter, entity: entityFilter, level: levelFilter } = filters
  const placeFilter = filters.place ?? 'all'
  const updateFilters = (patch: Partial<ContactsTabFilters>) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    onFiltersChange?.(next)
  }
  const setSearch = (value: string) => updateFilters({ search: value })
  const setRoleFilter = (value: string) => updateFilters({ role: value })
  const setEntityFilter = (value: string) => updateFilters({ entity: value })
  const setLevelFilter = (value: string) => updateFilters({ level: value })
  const setPlaceFilter = (value: string) => updateFilters({ place: value })
  // #3153 — le défaut (« persona ») et un choix déjà mémorisé vivent à UN
  // endroit (`contact-group-mode.ts`, GA-26), pas dans un `useState` local qui
  // repartirait à zéro à chaque remontage de l'onglet.
  const [groupMode, setGroupMode] = useContactGroupMode()
  // Recette 21/10 A.1 — choix explicites par groupe ; sans choix, un groupe est ouvert sauf
  // s'il est `collapsedByDefault` (le groupe « Persona à qualifier »).
  const [expandedOverrides, setExpandedOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  // #2120.71-75 — la sélection multiple, par identifiant : les gestes de lot
  // (enrichir, exporter, attribuer, plan, séquence) portent sur ces contacts.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
  const selectedContacts = useMemo(
    () => contacts.filter(contact => selectedIds.has(contact.id)),
    [contacts, selectedIds],
  )
  const toggleSelected = (contactId: string) =>
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(contactId)) next.delete(contactId)
      else next.add(contactId)
      return next
    })
  const enrichMutation = useEnrichContact()
  const enrichBatchMutation = useEnrichContacts(accountId)
  const { data: credits } = useCredits()
  // #2120.52-57 — cette recherche (Phase 2, `POST /analysis/:id/enrich-contacts`)
  // ne débite aucun crédit (vérifié dans `analysis-ondemand.service.ts` : aucun
  // appel à `credits.debit` sur ce chemin), mais elle partait jusqu'ici sans
  // aucune confirmation — un clic déclenchait une recherche d'une minute sur
  // TOUT le compte. Le même dialogue que le chemin unitaire l'annonce
  // désormais, en mode `free` (jamais de coût inventé sur une action gratuite).
  const [batchEnrichArmed, setBatchEnrichArmed] = useState(false)
  const { data: hygiene } = useAccountsHygiene()
  const emailVerdict = contactsEmailVerdict(hygiene, accountId)
  const contactsWithoutEmailCount = emailVerdict.state === 'breached' ? emailVerdict.count : undefined

  // #2091 — `undefined` tant que `useCredits()` n'a pas résolu, jamais `0` :
  // le solde alimente `ContactChannelMenu`/`ContactEngagementTrigger`, qui
  // distinguent désormais « pas encore mesuré » de « vraiment à zéro ».
  const enrichmentCredits = credits?.enrichment_credits
  const roles = useMemo(
    () => Array.from(new Set(contacts.map(c => c.decision_role).filter((role): role is DecisionRole => role !== null))),
    [contacts],
  )
  // Distinct detected entities → one-click angle chips for a scoped re-run
  // (P0-03), ET la liste du filtre « Entité » (maquette 03) — le MÊME
  // ensemble, jamais recalculé deux fois.
  const entities = useMemo(
    () =>
      Array.from(new Set(contacts.map(c => c.entity?.trim()).filter((e): e is string => Boolean(e)))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [contacts],
  )
  // Le niveau L0-L4 d'un contact n'existe QUE sur le graphe d'organigramme
  // (`raw_analysis.org.orgGraph`), jamais sur `Contact` — voir
  // `buildContactLevelMap`. `null` (pas de graphe) donne une map vide : le
  // filtre « Niveau » ne propose alors aucune option, jamais un niveau deviné.
  // #3742/#3744 (reste) — même filtre géographique que la liste : un contact
  // écarté (excluded_at) ne doit pas prêter son niveau L0-L4 au filtre « Niveau ».
  const orgGraph = useMemo(() => buildOrgGraphViewData(rawAnalysis, contacts)?.graph ?? null, [rawAnalysis, contacts])
  const levelByContactId = useMemo(() => buildContactLevelMap(contacts, orgGraph), [contacts, orgGraph])
  const levels = useMemo(() => {
    const present = new Set(levelByContactId.values())
    return ORG_LEVEL_ORDER.filter(level => present.has(level))
  }, [levelByContactId])
  const baseFilteredContacts = useMemo(
    () =>
      filterContacts(
        contacts,
        search,
        { role: roleFilter, entity: entityFilter, level: levelFilter },
        contact => levelByContactId.get(contact.id) ?? null,
      ),
    [contacts, roleFilter, entityFilter, levelFilter, search, levelByContactId],
  )
  // #3742 — croiser un LIEU (pays, région, département, ville) et les contacts.
  // Les sites du compte prêtent leur code postal aux villes qu'ils partagent.
  const placeIndex = useMemo(() => buildPlaceIndex(rawAnalysis['sites_france']), [rawAnalysis])
  const placeById = useMemo(
    () => new Map(contacts.map(contact => [contact.id, readContactPlace(contact, placeIndex)] as const)),
    [contacts, placeIndex],
  )
  const placeOptions = useMemo(() => buildPlaceOptions(Array.from(placeById.values())), [placeById])
  const filteredContacts = useMemo(
    () =>
      placeFilter === 'all'
        ? baseFilteredContacts
        : baseFilteredContacts.filter(contact => {
            const place = placeById.get(contact.id)
            return place ? matchesPlace(place, placeFilter) : false
          }),
    [baseFilteredContacts, placeById, placeFilter],
  )
  // « X écartés (hors périmètre) » (P0-03) : propre à CETTE analyse, donc lu sur le
  // compte — la liste de contacts globale agrège plusieurs comptes et ne pourrait
  // pas attribuer le chiffre honnêtement.
  const outOfScope = useMemo(() => readContactsOutOfScope(rawAnalysis), [rawAnalysis])
  // SIMON-FIX S.18 — le motif du périmètre géographique, posé en base à l'écartement, se LIT ici.
  const geoExcluded = useMemo(() => readGeoExcludedContacts(contacts), [contacts])
  const signalLeads = useMemo(() => readSignalLeads(rawAnalysis, contacts), [rawAnalysis, contacts])
  // i18n : les libellés de groupe fallback (« Entité non renseignée »…) dépendent de la langue.
  // `i18n.language` force le recalcul : `groupContacts` résout ces libellés via `i18n.t`, une
  // lecture que `react-hooks/exhaustive-deps` ne peut pas voir depuis l'EXTÉRIEUR de cette
  // fonction — l'avertissement « dépendance inutile » qu'il rend ici est un faux positif connu,
  // pas une erreur (CI `lint`), donc pas de directive `eslint-disable` : la racine du dépôt ne
  // charge pas le plugin `react-hooks` (lint-staged), et une directive qui NOMME sa règle y
  // devient elle-même une erreur bloquante.
  // Même requête (même clé) que le bandeau « doublons possibles » : une seule lecture, partagée.
  const { data: duplicateData } = useQuery({
    queryKey: [...contactKeys.byAccount(accountId), 'duplicate-proposals'],
    queryFn: () => contactsApi.duplicateProposals(accountId),
    enabled: !!accountId,
  })
  const probableDuplicates = useMemo(() => probableDuplicateLinks(duplicateData), [duplicateData])
  const groupedContacts = useMemo(
    () => groupContacts(filteredContacts, groupMode, search, accountCompanyName, probableDuplicates),
    [filteredContacts, groupMode, search, accountCompanyName, probableDuplicates, i18n.language],
  )

  /**
   * Ouvrir ou refermer TOUS les groupes (#1121).
   *
   * « J'ai pas une liste exhaustive des 57 contacts trouvés, ou tout du moins,
   * je ne sais pas où elle est. » Elle est là, groupée par entité, et tous les
   * groupes s'ouvraient repliés : on voyait des en-têtes fermés et rien ne
   * disait ce qu'il y avait derrière.
   */
  const expandedEntities = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        groupedContacts
          .filter(group => expandedOverrides.get(group.entity) ?? !group.collapsedByDefault)
          .map(group => group.entity),
      ),
    [groupedContacts, expandedOverrides],
  )

  // Recette 21/10 A.1 — « Tout déplier » ouvre AUSSI le groupe replié par défaut.
  const toggleAllEntities = (expand: boolean) =>
    setExpandedOverrides(new Map(groupedContacts.map(group => [group.entity, expand] as const)))

  const toggleEntity = (entity: string) => {
    setExpandedOverrides(current => {
      const next = new Map(current)
      next.set(entity, !expandedEntities.has(entity))
      return next
    })
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-5 py-2">
      {/* #3685.5 (recette prod 09/10) — ⚠️ RENVERSEMENT ASSUMÉ ET DATÉ de #2552
          (07/10) : la ligne compacte `ContactsFunnelLine` restait une rangée
          PERMANENTE de statistiques avant les interlocuteurs — ce que #3685
          refuse, et ce que #3685.4 (`ContactsActiveFilters`, « sans rangées
          permanentes ») avait déjà tranché pour ce même onglet. Retirée ICI ;
          toujours rendue ailleurs (bandeau contextuel des onglets Synthèse/
          Veille/Projets/Missions, `AccountDetailTabContent.tsx`, #3709). */}

      {/* #2120.46/.47 — la barre d'actions de cet onglet a été REMONTÉE dans
          l'en-tête de la section Personnes (`PeopleSectionActions`) : depuis
          que la section empile l'organigramme au-dessus, « en haut de l'onglet »
          était à plus de trois écrans de défilement. Elle n'est pas dupliquée
          ici (loi 4 du tome 7), et les deux dialogues qu'elle ouvrait vivent
          désormais chez l'appelant, avec l'état qui les commande.

          #1130 tient toujours : quand le dossier est VIDE, les deux gestes
          descendent au centre de l'état vide, là où la question se pose — et
          c'est alors l'en-tête de section qui s'efface. */}

      {/* #2543.3b — le MÊME geste que le reste de l'onglet (armé, jamais
          déclenché tout seul), pas un second appel à `useEnrichContacts`. */}
      <ContactsStaleCollectionNotice
        collectedAt={contactsCollectedAt}
        onEnrich={() => setBatchEnrichArmed(true)}
        enriching={enrichBatchMutation.isPending}
      />
      {/* LUDOVIC-C LC.1 — les règles actuelles (homonymes) repassées sur l'existant, sans recollecte. */}
      <ContactsRulesCatchupNotice
        accountId={accountId}
        collectedAt={contactsCollectedAt}
        rulesAppliedAt={contactsRulesAppliedAt}
        contacts={contacts}
        accountWebsite={accountWebsite}
      />

      {/* LOIC-FIX2 O.5 — deux fiches qui semblent être la même personne : PROPOSÉ, jamais fusionné. */}
      <ContactsDuplicateNotice accountId={accountId} contacts={contacts} onContactClick={onContactClick} />

      {outOfScope ? <ContactsOutOfScopeNotice data={outOfScope} /> : null}
      {geoExcluded ? <ContactsGeoExcludedNotice data={geoExcluded} /> : null}
      {/* #4324.1(b) — les personnes nommées par un signal et sans fiche : une piste, jamais une donnée inventée. */}
      <SignalLeadsSection accountId={accountId} leads={signalLeads} />
      {/* #4509 (décision Louis 24/10) — la section « N personnes de l'organigramme, sans fiche » est retirée de
          l'onglet Contacts, revient sur #4465 : ces personnes se lisent, et se créent en fiche, depuis l'onglet
          Organigramme. Les personnes citées dans un signal restent ci-dessus. */}

      {/* #2658.1 (décision Louis, QCM du 21/09/2026) — REVIENT sur #2552.1 :
          le bandeau `EngineCoverageFunnelBand` (« détectés → vérifiés →
          pertinents → enrichis », né de l'appel bêta François Thomas du
          17/09/2026) est retiré d'ici, délibérément. Ce qui tient encore : la
          mesure de couverture (`deriveOrgCoverage`, `@bellum/contracts`)
          reste calculée côté API — seul CET affichage part. Voir
          `TabContacts.engineCoverageFunnelRemoved.test.tsx`. */}

      {/* #2659.1 (décision Louis, QCM du 21/09/2026) — REVIENT sur #1609 /
          #1755 : la carte `ObservedRoleFamilyPriors` (les familles de rôles
          observées, comme piste de recherche) est retirée d'ici,
          délibérément. Ce qui tient encore : `role_families` reste calculé et
          servi côté API — d'autres écrans le lisent toujours (`TabSignal`,
          `AccountMarketMemoryCard`, #1610). Voir
          `TabContacts.observedRoleFamilyPriorsRemoved.test.tsx`. */}

      {/* #3629 / #3630 / #3631 (Louis 05/10) — trois blocs RETIRÉS de cet
          onglet, délibérément : le bandeau `ContactsFunnelBand` (« Du contact
          détecté au contact prioritaire » — il reste sur /contacts), la note
          des rôles d'achat manquants (lisibles dans Personnes › « Qui nous
          manque ») et la note « N contacts sans adresse » (la recherche
          d'adresses reste armée par `ResearchExpansionCallout` et la note de
          collecte périmée). #3685.1 : le bandeau n'est remplacé par rien (ni
          quatre cartes, ni le même bloc sous un autre titre) ;
          `tallyContactLifecycle` reste exporté. Voir
          `TabContacts.funnelRemoved.test.tsx`. */}

      {/* #2120.52-57 — la porte d'annonce, montée dans CE fichier (GA-49 la
          cherche par module, pas par appelant final). */}
      <EnrichConfirmDialog
        open={batchEnrichArmed}
        onOpenChange={setBatchEnrichArmed}
        count={contactsWithoutEmailCount}
        free
        onConfirm={() => enrichBatchMutation.mutate()}
      />

      {contacts.length === 0 ? (
        <ContactsEmptyState
          accountId={accountId}
          enrichBatchMutation={enrichBatchMutation}
          onCreateContact={onCreateContact}
          onImportCsv={onImportCsv}
          onChangeScope={onChangeScope}
          onContinueWithout={onContinueWithout}
        />
      ) : (
        <>
          {/* Théo A comptes-fiche.R5 — trois repères : contacts · avec e-mail · relations engagées (ni cartes, ni entonnoir : #3685.1 tient). */}
          <ContactsCountersLine contacts={contacts} />
          {/* #2120.30-38 — le classement vient de l'API ; la section reçoit TOUS
              les contacts pour retrouver la fiche de chaque personne classée. */}
          <div>
            <PriorityPathSection
              accountId={accountId}
              contacts={contacts}
              accountCompanyName={accountCompanyName}
              rawAnalysis={rawAnalysis}
              entities={entities}
              enrichmentCredits={enrichmentCredits}
              enrichMutation={enrichMutation}
              onContactClick={onContactClick}
            />
          </div>

          <div className="flex flex-wrap gap-4 pt-4">
            <ContactGroupModeTabs value={groupMode} onChange={setGroupMode} />
            <ContactsToolbar
              search={search}
              onSearchChange={setSearch}
              roleFilter={roleFilter}
              onRoleFilterChange={setRoleFilter}
              roles={roles}
              entityFilter={entityFilter}
              onEntityFilterChange={setEntityFilter}
              entities={entities}
              levelFilter={levelFilter}
              onLevelFilterChange={setLevelFilter}
              levels={levels}
              placeFilter={placeFilter}
              onPlaceFilterChange={setPlaceFilter}
              placeOptions={placeOptions}
            />
            {/* #4928.5 — une entité choisie : le geste « Écarter les contacts de cette entité » (confirmé, réversible). */}
            {entityFilter !== 'all' ? (
              <ContactsEntityExclude
                accountId={accountId}
                entity={entityFilter}
                contactIds={filteredContacts.filter(contact => contact.entity === entityFilter).map(c => c.id)}
              />
            ) : null}
          </div>
          <ContactsActiveFilters
            search={search}
            roleFilter={roleFilter}
            entityFilter={entityFilter}
            levelFilter={levelFilter}
            placeLabel={placeOptions.find(option => option.value === placeFilter)?.label ?? null}
            shown={filteredContacts.length}
            total={contacts.length}
            onClear={() => updateFilters({ search: '', role: 'all', entity: 'all', level: 'all', place: undefined })}
          />
          {selectedContacts.length > 0 ? (
            <ContactsSelectionBar
              selectedContacts={selectedContacts}
              accountCompanyName={accountCompanyName}
              rawAnalysis={rawAnalysis}
              accountId={accountId}
              matchingCount={filteredContacts.length}
              onSelectAllMatching={() => setSelectedIds(new Set(filteredContacts.map(contact => contact.id)))}
              onClear={() => setSelectedIds(new Set())}
            />
          ) : null}
          {filteredContacts.length > 0 ? (
            <>
              <EntityGroups
                groups={groupedContacts}
                groupMode={groupMode}
                expandedEntities={expandedEntities}
                onToggleEntity={toggleEntity}
                onToggleAll={toggleAllEntities}
                onContactClick={onContactClick}
                selectedIds={selectedIds}
                onToggleSelected={toggleSelected}
                accountName={accountCompanyName}
              />
              <ResearchExpansionCallout
                companyName={accountCompanyName}
                // CEDRIC-FIX C.2b — « retenus » et « écartés » sont deux nombres NOMMÉS, jamais un
                // `contacts.length` qui mélange les deux (14 en tête, 18 ici).
                contactsCount={contacts.filter(contact => !contact.excluded_at && !contact.hidden).length}
                excludedCount={contacts.filter(contact => Boolean(contact.excluded_at)).length}
                entities={entities}
                enrichBatchMutation={enrichBatchMutation}
              />
            </>
          ) : (
            // Un titre NU : l'écran constatait le vide qu'il venait lui-même de
            // produire, et laissait retrouver le champ de recherche et les
            // filtres pour les défaire un par un. Le geste qui les annule TOUS
            // est porté ICI — il appartient à cet état vide, pas à la barre
            // restée plus haut.
            <EmptyState
              size="sm"
              icon={<Users className="h-8 w-8 text-[var(--bellum-text-muted)]" />}
              title={t('emptyState.noMatch')}
              description={t('emptyState.noMatchDescription')}
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  icon={FilterX}
                  className="gap-2"
                  // #2120.77 — UNE écriture, pas quatre : quatre appels
                  // successifs repartiraient chacun de l'état d'avant.
                  onClick={() =>
                    updateFilters({ search: '', role: 'all', entity: 'all', level: 'all', place: undefined })
                  }
                >
                  {t('emptyState.clearFilters')}
                </Button>
              }
            />
          )}
        </>
      )}
    </motion.div>
  )
}
