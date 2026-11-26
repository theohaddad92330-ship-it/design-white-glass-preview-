import type { Contact } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { ListChecks, Loader2, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DossierSectionHead } from '../theo/DossierBlocks'
import { useEnrichOrganigram } from '@/features/accounts/hooks/useEnrichAccount'
import { useElapsedWhilePending } from '@/features/accounts/hooks/useElapsedWhilePending'
import { SegmentStaleCollectionNotice } from '../components/SegmentStaleCollectionNotice'
import { useOrgRebuild } from '@/features/accounts/hooks/useOrgRebuild'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import {
  buildContactSlugIndex,
  getClassifiedContactsCount,
  getCurrentOrgContacts,
  getRecommendedPath,
} from './organigramme/organigrammeData'
import { FocalOrgView } from './organigramme/FocalOrgView'
import { GroupOrgView } from './organigramme/GroupOrgView'
import { HierarchyOrgView } from './organigramme/HierarchyOrgView'
import { OrgEditView } from './organigramme/OrgEditView'
import { ORG_VIEW_TABS, type OrgViewMode } from './organigramme/orgViewModes'
import type { OrgViewState } from './organigramme/orgViewState'
import { useOrgViewState } from './organigramme/useOrgViewState'
import { buildOrgGraphViewData } from './organigramme/orgGraphData'
import { OrgGraphViews } from './organigramme/OrgGraphViews'
import { OrgInfluenceMap } from './organigramme/OrgInfluenceMap'
import { buildOrgInfluenceMap } from './organigramme/orgInfluenceMapData'
import { OrgMapEmptyState } from './organigramme/OrgMapEmptyState'
import { DeclareOrgPanel } from './organigramme/declare/DeclareOrgPanel'
import { OrgCorrectionsHistory } from './organigramme/corrections/OrgCorrectionsHistory'
import { OrganigrammeSidebar } from './organigramme/OrganigrammeSidebar'
import { TrajectoriesCard } from './organigramme/TrajectoriesCard'
import { OrgStructureSection } from './organigramme/OrgStructureSection'
import { EnrichmentPlannerDialog } from './organigramme/EnrichmentPlannerDialog'
import { buildOrgStructureData } from './organigramme/orgStructureData'

interface TabOrganigrammeProps {
  accountId: string
  /** #4465.2 — le nom du compte : sans lui, aucun départ ne se déduit du parcours. */
  accountName?: string | null
  contacts: Contact[]
  rawAnalysis: Record<string, unknown>
  onContactClick?: (contact: Contact) => void
  onViewPlan?: () => void
  /** Ouvre l'onglet Contacts — « voir tous les contacts » du bandeau de couverture. */
  onViewAllContacts?: () => void
  /**
   * #2543.7 — l'aveu de fraîcheur : ce dossier a-t-il vu un futur correctif de
   * collecte sur le segment entités ? `null`/absent = jamais daté, traité
   * comme périmé (`SegmentStaleCollectionNotice`, `isSegmentCollectionStale`).
   */
  entitiesCollectedAt?: string | null
  /**
   * #4061.b — l'état de l'onglet (vue, direction, filtres, colonnes repliées, sélection) porté par l'URL
   * du dossier : ouvrir une fiche démonte l'onglet, le retour doit le retrouver. Absent = état local.
   */
  viewState?: OrgViewState
  onViewStateChange?: (next: OrgViewState) => void
}

/**
 * L'onglet Organigramme.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CINQ VUES, ET L'ORDRE ENTRE ELLES EST UNE DÉCISION
 * ─────────────────────────────────────────────────────────────────────────
 * Il ouvrait sur la carte SYSTÈME : toutes les entités du groupe, toutes les
 * personnes, tous les traits. C'est une vue de plan de compte, et elle est
 * juste — mais elle répond à « comment ce groupe est-il fait ? » quand le
 * commercial demande « sur cette direction, par qui je commence ? ».
 *
 * Le FINAL du 27/08 tranche (décision 3) : **la vue FOCALE est la page
 * d'arrivée, la vue Groupe reste accessible en un clic**. Le refus est écrit
 * dans le même document — « vue Groupe comme home quotidienne : trop large
 * pour préparer une action ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ TROIS VUES DE PLUS LE 31/08/2026 — UN REVIREMENT, PAS UN OUBLI
 * (puis RÉDUITES À TROIS DANS LE SÉLECTEUR le 15/09/2026, #2121.2)
 * ─────────────────────────────────────────────────────────────────────────
 * Trois maquettes alternatives du 27/08 avaient été ÉCARTÉES le 30/08
 * (`agent_docs/orggraph-contradictions-2026-08-30.md` §5) : « vue Groupe en
 * premier écran, rail Achats sur l'écran principal avec les 8 rôles bruts, mode
 * édition plein écran — plus le drag & drop ».
 *
 * **Louis a levé ces refus le 31/08/2026**, dans une forme qui garde chaque
 * raison d'origine intacte : elles deviennent des vues COMMUTABLES, jamais des
 * remplacements. « Trop large pour préparer une action » reste vrai de la vue
 * Groupe — c'est pourquoi la focale reste le défaut. « Trop destructeur pour une
 * donnée sourcée » reste vrai du glisser-déposer — c'est pourquoi un dépôt de
 * carte n'écrit rien : il OUVRE le tiroir de correction, qui réclame la raison
 * et la preuve. Une dérivation, une écriture : il n'y a toujours qu'une porte.
 *
 * La liste, l'ordre et le défaut vivent dans `orgViewModes.ts` — pas ici.
 *
 * Un dossier sans `orgGraph` (analyse ancienne, ou pas encore lancée) n'a pas
 * de quoi bâtir une vue focale : il retombe sur le rendu historique.
 *
 * ⚠️ **L'ancien `OrgChart` (D280, 30/08) n'y vit plus.** Il affichait le RÔLE
 * commercial comme une rangée de l'arbre — exactement ce que le FINAL du
 * 27/08 interdit (position = hiérarchie, rôle = badge). Les deux emplacements
 * où il s'affichait en repli — un dossier sans `orgGraph`, et la vue système
 * sur un graphe sans structure d'entités — rendent désormais
 * `OrgMapEmptyState`, qui NOMME lequel des deux vides c'est : « pas encore
 * d'organigramme » n'est pas la même phrase que « l'analyse a tourné, elle
 * n'a rien trouvé à cartographier ici ». Voir son docblock. Garde : GA-220.
 */
export function TabOrganigramme({
  accountId,
  accountName,
  contacts,
  rawAnalysis,
  onContactClick,
  onViewPlan,
  onViewAllContacts,
  entitiesCollectedAt,
  viewState,
  onViewStateChange,
}: TabOrganigrammeProps) {
  const { t } = useTranslation('accountOrg')
  const enrichMutation = useEnrichOrganigram(accountId)
  /**
   * #3020 (retour bêta) — « ça semble charger dans le vide ». L'appel est
   * synchrone côté serveur (une seule classification IA, pas de job en file
   * ni d'événement Socket.IO à suivre — voir `analysis-ondemand.service.ts`,
   * `classifyAndPersist`) : il n'y a donc rien à SONDER. Ce qu'on peut
   * montrer honnêtement, c'est ce qu'on MESURE réellement — le temps déjà
   * écoulé, en secondes, tic-tac par seconde — jamais un pourcentage ou une
   * durée estimée qu'aucun job ne fournit.
   *
   * Centralisé dans `useElapsedWhilePending` (GA-26) depuis que #3020 a dû
   * être reposé une deuxième fois : la première version n'avait posé ce
   * tic-tac qu'ICI, et les boutons « Enrichir » jumeaux de
   * `OrgStructureSection.tsx` / `OrgMapEmptyState.tsx` (même mutation)
   * gardaient un spinner muet.
   */
  const enrichElapsed = useElapsedWhilePending(enrichMutation.isPending)
  // Une recherche ciblée qui ajoute des contacts fait reconstruire le graphe en
  // tâche de fond : on le SUIT ici, sinon la carte se mettrait à jour sans que
  // rien à l'écran ne le dise — et l'écran est justement l'endroit d'où part le
  // geste. Le hook recharge le dossier quand la reconstruction aboutit.
  const orgRebuild = useOrgRebuild(accountId)
  // Enrichir l'organigramme débite des crédits d'enrichissement : à zéro, le
  // bouton est grisé et dit pourquoi (au lieu d'un refus serveur opaque).
  const gate = useCreditGate()
  /**
   * #4061.b — vue, direction, filtres, colonnes repliées et nœud choisi : UN état, porté par l'URL du
   * dossier quand l'appelant le fournit (`useOrgViewState`). Le défaut de la vue vient du registre.
   */
  const [orgState, patchOrgState] = useOrgViewState(viewState, onViewStateChange)
  const mode = orgState.mode
  const setMode = (next: OrgViewMode) => patchOrgState({ mode: next })
  const patchOrgStateFull = (next: OrgViewState) => patchOrgState(next)
  /**
   * Le périmètre regardé par les vues Hiérarchie et Édition.
   *
   * Il vit ICI et non dans chacune d'elles : cliquer une entité dans la vue
   * Groupe doit arriver sur CETTE entité dans la vue Hiérarchie, et basculer
   * ensuite en mode Édition doit rester sur la même. Deux états séparés
   * feraient repartir chaque vue sur sa direction par défaut, et l'utilisateur
   * perdrait son périmètre à chaque bascule. `null` = « celui par défaut »,
   * décidé par `defaultFocalDirectionId` — jamais une entité prise au hasard.
   */
  const directionId = orgState.directionId
  const setDirectionId = (next: string | null) => patchOrgState({ directionId: next })
  // Le planificateur d'enrichissement (D890) — voir `plannerButton`.
  const [plannerOpen, setPlannerOpen] = useState(false)
  // Périmètre de l'organigramme : l'org COURANTE. Les ex-employés et les contacts
  // écartés sont filtrés ici, à l'entrée de l'onglet, pour que la carte, le chemin
  // recommandé et le compteur parlent tous du même ensemble de personnes.
  const orgContacts = useMemo(() => getCurrentOrgContacts(contacts, accountName), [contacts, accountName])
  // #4049.1 — le même rapprochement carte → fiche que la vue focale, pour les cartes de l'arbre.
  const orgContactIndex = useMemo(() => buildContactSlugIndex(orgContacts), [orgContacts])
  const classifiedContactsCount = getClassifiedContactsCount(orgContacts)
  // Structure décisionnelle produite par l'analyse (`raw_analysis.org`) — elle
  // était calculée à chaque run et affichée nulle part.
  const orgStructure = useMemo(() => buildOrgStructureData(rawAnalysis), [rawAnalysis])
  // Typed OrgGraph « 4 views » (Annexe Organigramme). Reads the NEW
  // `raw_analysis.org.orgGraph` the IA emits; null when absent → section omitted.
  // #3742/#3744 (reste) — `contacts` (pas `orgContacts`) : il faut voir les
  // contacts ÉCARTÉS (excluded_at) pour les retirer du graphe, même filtre que
  // l'onglet Contacts.
  const orgGraphViews = useMemo(() => buildOrgGraphViewData(rawAnalysis, contacts), [rawAnalysis, contacts])
  // Carte structurelle p20 : groupe → entités/BU → postes, chaque nœud avec sa
  // confiance. Elle n'existe que si le graphe porte une structure d'entités ;
  // sinon `null`, et `OrgMapEmptyState` NOMME lequel des deux vides c'est.
  const influenceMap = useMemo(
    () => (orgGraphViews ? buildOrgInfluenceMap(orgGraphViews.graph) : null),
    [orgGraphViews],
  )
  // Chemin serveur d'abord (il porte le garde-fou board et les exclusions), tri
  // local en repli. Voir `getRecommendedPath`.
  const recommendedPath = getRecommendedPath(orgContacts, orgGraphViews?.path)
  // #2554.1/#2554.2 — ce qu'une actualisation a REVÉRIFIÉ, nommé : `null` tant
  // qu'aucun run ne l'a posé (dossier jamais actualisé depuis ce chantier, ou
  // premier peuplement — #2502, distinct).

  const enrichButton = (
    <Button
      size="sm"
      variant="black"
      onClick={() => enrichMutation.mutate()}
      // #2502 — DÉFAUT recette 17/09 (passage 7) : ce geste ne débite AUCUN
      // crédit (`analysis-ondemand.service.ts:960-963`, même famille que
      // `enrichContacts`) — le griser à zéro crédit rendait « Enrichir la
      // carte » injoignable. Seul `locked` (essai terminé) ferme la porte.
      disabled={enrichMutation.isPending || contacts.length === 0 || gate.locked}
      icon={Sparkles}
      isLoading={enrichMutation.isPending}
      // #3020 — `isLoading` ignore les enfants du bouton (`button.tsx` : un
      // spinner nu les remplace) : c'est `loadingText` qui porte ce que
      // l'utilisateur lit PENDANT l'appel — le nombre RÉEL de contacts engagés
      // et le temps RÉELLEMENT écoulé, jamais un pourcentage ou une durée
      // estimée qu'aucun job ne mesure (l'appel est synchrone, sans file).
      loadingText={t('organigramme.enrichingProgress', { count: contacts.length, elapsed: enrichElapsed })}
      className="gap-2"
      title={
        contacts.length === 0
          ? t('organigramme.enrichDisabledTitle')
          : gate.locked
            ? t('organigramme.enrichLockedTitle')
            : t('organigramme.enrichTitle')
      }
    >
      {t('organigramme.enrichCta')}
    </Button>
  )

  /**
   * LE PLANIFICATEUR VIT ICI, PAS DANS LA STRUCTURE HÉRITÉE (D890).
   *
   * ⚠️ Il était monté dans `OrgStructureSection`, APRÈS son
   * `if (data.isEmpty) return …`. Or un dossier qui porte un `orgGraph`
   * MODERNE a justement une structure héritée VIDE : le planificateur ne
   * s'affichait donc sur AUCUN des comptes qui en ont besoin. Livré, testé,
   * mergé, déployé — et inatteignable. Trouvé par la recette live du
   * 31/08/2026, pas par un test.
   *
   * Sa place est à côté du geste d'enrichissement dont il est la version
   * CIBLÉE : même entête, même question, deux portées.
   */
  const plannerButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      icon={ListChecks}
      className="gap-2"
      disabled={contacts.length === 0}
      title={contacts.length === 0 ? t('organigramme.enrichDisabledTitle') : undefined}
      onClick={() => setPlannerOpen(true)}
    >
      {t('enrichmentPlanner.openCta')}
    </Button>
  )

  const rebuildNotice = orgRebuild.pending ? (
    <span className="mr-auto flex items-center gap-2 text-sm text-[var(--bellum-text-secondary)]">
      <Loader2 className="size-3.5 animate-spin" />
      {t('organigramme.rebuilding')}
    </span>
  ) : null

  /**
   * LE SÉLECTEUR DE VUE — trois façons de regarder les MÊMES données
   * (#2121.2 : Influence / Hiérarchie / Entités, QCM Louis 15/09).
   *
   * Des `<button type="button">` dans un `role="tablist"` : ce qui se clique se
   * tabule (GA-35), l'état actif s'annonce (`aria-selected`), et la cible fait
   * 44 px en pointeur grossier. Un dossier sans graphe n'a rien à commuter — il
   * ne voit pas la barre, plutôt que trois onglets qui mènent au même vide.
   *
   * `edit` et `system` ne sont plus ICI : voir `ORG_VIEW_TABS` (orgViewModes.ts)
   * pour où vont leurs gestes.
   */
  const viewSwitcher = orgGraphViews ? (
    <div className="min-w-0">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('orgViews.label')}
      </Text>
      <div role="tablist" aria-label={t('orgViews.aria')} className="mt-1 flex flex-wrap gap-1.5">
        {ORG_VIEW_TABS.map(candidate => (
          <Button
            key={candidate}
            type="button"
            role="tab"
            size="sm"
            aria-selected={mode === candidate}
            variant={mode === candidate ? 'secondary' : 'outline'}
            className="pointer-coarse:min-h-11"
            title={t(`orgViews.${candidate}Hint`)}
            onClick={() => setMode(candidate)}
          >
            {t(`orgViews.${candidate}`)}
          </Button>
        ))}
      </div>
    </div>
  ) : null

  /** Ce qui vit SOUS toutes les vues : l'historique,
   *  puis la déclaration. */
  const belowEveryView = (
    <>
      {/* #3402 — les trajectoires commerciales sous TOUTES les vues (elles
          n'étaient que dans la barre latérale de la vue « système », donc
          introuvables sur Influence / Entités / Hiérarchie). */}
      <TrajectoriesCard contacts={orgContacts} />
      {/* #3591 — la carte « Organigramme revérifié » est retirée (« aucune valeur
          ajoutée ») ; la revérification reste dite par `RefreshOutcomeCard`. */}
      {/* « Qui a changé ça ? » — l'historique du ledger de corrections. Il vit
          SOUS l'organigramme et non dans le tiroir : la question se pose en
          regardant la carte (« pourquoi dit-elle ça ? »), pas en train de
          corriger. Même forme que le fil du dossier, délibérément. */}
      {orgGraphViews ? <OrgCorrectionsHistory accountId={accountId} graph={orgGraphViews.graph} /> : null}
      {/* #1103 — « soit charger un organigramme si on en a un, soit décrire des
          éléments et ensuite ça intègre. » En BAS, délibérément : ce qui compte
          d'abord est ce que Bellum a trouvé. */}
      <DeclareOrgPanel accountId={accountId} />
    </>
  )

  const header = (
    <>
      {/* Refonte Théo (23/10) — `.ac20-section-head` de `sec:org` : la phrase, puis la lecture (aucun lien inventé). */}
      <DossierSectionHead testId="org-head" title={t('orgTheo.title')} lead={t('orgTheo.lead')} />
      <SegmentStaleCollectionNotice dimension="entities" collectedAt={entitiesCollectedAt} />
      {/* `.ac20-graph-toolbar` — les vues de l'organigramme à gauche, les gestes à droite. */}
      <div data-testid="org-toolbar" className="flex flex-wrap items-end justify-between gap-4">
        {viewSwitcher}
        <div className="flex flex-wrap items-end gap-4">
          {rebuildNotice}
          {plannerButton}
          {enrichButton}
        </div>
      </div>
      <EnrichmentPlannerDialog open={plannerOpen} onOpenChange={setPlannerOpen} accountId={accountId} />
    </>
  )

  // ── Les quatre vues qui ont besoin d'un graphe ──────────────────────────
  // Un dossier sans `orgGraph` retombe sur le rendu historique plus bas : il n'a
  // ni arbre, ni entités, ni chemin — il n'y a rien à commuter.
  if (orgGraphViews && mode !== 'system') {
    return (
      <div className="space-y-4">
        {header}
        {mode === 'focal' ? (
          <FocalOrgView
            accountId={accountId}
            graph={orgGraphViews.graph}
            discovered={orgContacts.length}
            contacts={orgContacts}
            onSystemView={() => setMode('system')}
            onViewAllContacts={onViewAllContacts}
            // #3019 — « je devrais pouvoir cliquer sur les cartes pour
            // accéder au contact » : même geste que la vue Influence.
            onContactClick={onContactClick}
            // #4061.c — direction et carte choisies dans l'URL (`od` / `os`) : recharger ou partager rouvre la même.
            directionId={directionId}
            onDirectionChange={setDirectionId}
            selectedId={orgState.selectedId}
            onSelectedChange={id => patchOrgState({ selectedId: id })}
          />
        ) : null}
        {mode === 'group' ? (
          <GroupOrgView
            accountId={accountId}
            graph={orgGraphViews.graph}
            discovered={orgContacts.length}
            // Ouvrir une entité, c'est passer à sa hiérarchie — et le périmètre
            // choisi SUIT la bascule, il ne repart pas du défaut.
            onOpenEntity={entityId => patchOrgState({ directionId: entityId, mode: 'hierarchy' })}
          />
        ) : null}
        {mode === 'hierarchy' ? (
          <HierarchyOrgView
            graph={orgGraphViews.graph}
            discovered={orgContacts.length}
            directionId={directionId}
            onDirectionChange={setDirectionId}
            // #2512 — le corpus COMPLET (dont les non-enrichis), pas
            // seulement ce que `graph.people` porte.
            contacts={orgContacts}
            accountId={accountId}
            contactIndex={orgContactIndex}
            onContactClick={onContactClick}
            onOpenContactById={id => {
              const contact = orgContacts.find(candidate => candidate.id === id)
              if (contact) onContactClick?.(contact)
            }}
            selectedId={orgState.selectedId}
            onSelectedChange={id => patchOrgState({ selectedId: id })}
          />
        ) : null}
        {mode === 'edit' ? (
          <OrgEditView
            accountId={accountId}
            graph={orgGraphViews.graph}
            discovered={orgContacts.length}
            directionId={directionId}
            onDirectionChange={setDirectionId}
          />
        ) : null}
        {belowEveryView}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {header}

      <div className="flex min-h-0 flex-col gap-4 xl:flex-row xl:items-stretch">
        <div className="relative min-w-0 flex-1">
          {/* Un seul rendu de la carte à la fois. Dès que le dossier porte une
              structure d'entités, c'est la carte p20 qui la dessine — l'arbre
              plat (rangées = rôles d'achat, racine = premier contact trié) ne
              coexiste plus avec elle : deux dessins concurrents du même compte
              se contredisaient. L'ancien arbre est retiré (D280, 30/08) : ce
              qui reste sans carte d'influence est un état vide qui NOMME
              lequel des deux vides c'est. */}
          {influenceMap ? (
            <OrgInfluenceMap
              map={influenceMap}
              contacts={orgContacts}
              onContactClick={onContactClick}
              accountId={accountId}
              viewState={orgState}
              onViewStateChange={patchOrgStateFull}
            />
          ) : orgGraphViews ? (
            // Le graphe EXISTE (des personnes y sont), mais ne porte aucune
            // entité : « l'analyse a tourné, elle n'a rien trouvé à
            // cartographier ici » — pas la même phrase que l'absence totale
            // de graphe ci-dessous.
            <OrgMapEmptyState variant="noEntities" />
          ) : (
            <OrgMapEmptyState variant="noGraph" accountId={accountId} hasContacts={orgContacts.length > 0} />
          )}
        </div>
        <OrganigrammeSidebar
          contactsCount={orgContacts.length}
          classifiedContactsCount={classifiedContactsCount}
          recommendedPath={recommendedPath}
          // D'où part le chemin. Absent tant que le dossier n'a pas été
          // recalculé depuis ce chantier — la carte se tait alors, elle ne
          // conclut pas à une entrée froide qu'elle n'a pas mesurée.
          pathOrigin={orgGraphViews?.graph.pathOrigin}
          onContactClick={onContactClick}
          onViewPlan={onViewPlan}
        />
      </div>

      {/* Les 4 vues typées (sourcées, liens qualifiés) passent AVANT la structure
          décisionnelle héritée qu'elles remplacent : elles étaient reléguées en
          bas de page, sous le rendu que l'annexe critique, donc jamais lues. Un
          dossier sans `orgGraph` n'a que l'état vide ci-dessus à montrer. */}
      {orgGraphViews ? <OrgGraphViews data={orgGraphViews} accountId={accountId} /> : null}

      <OrgStructureSection data={orgStructure} accountId={accountId} />

      {/* Le MÊME pied que les quatre autres vues — l'historique puis la
          déclaration. C'est le même écran sous une autre forme, et « qui a
          changé ça ? » s'y pose autant. Deux copies de ce bloc divergeaient
          déjà : celle-ci et celle de la vue focale. */}
      {belowEveryView}
    </div>
  )
}
