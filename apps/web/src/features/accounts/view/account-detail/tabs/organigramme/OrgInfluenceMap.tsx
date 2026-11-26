import {
  formatPhoneForDisplay,
  readOrgFreshness,
  type Contact,
  type OrgDecisionRole,
  type OrgHierarchyLevel,
} from '@bellum/contracts'
import { RoleHint } from '@/components/contacts/RoleHint'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { formatDate } from '@/lib/locale'
import { Badge, Button, Card, cn, Input, SelectField, Text } from '@bellum/ui'
import { Loader2, Mail, Network, Phone, Search, User } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useOrgViewState } from './useOrgViewState'
import type { OrgViewState } from './orgViewState'
import { useTranslation } from 'react-i18next'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { useEnrichContacts } from '@/features/accounts/hooks/useEnrichAccount'
import { OrgNodeTypeBadge } from './OrgNodeTypeBadge'
import { OrgCrmMatchBadge } from './OrgCrmMatchBadge'
import { OrgSourceChips } from './OrgSourceChips'
import { OrgKnownMarker } from './OrgKnownMarker'
import { buildKnownByPersonId } from './knownByPersonId'
import type { FocalKnown } from './focalOrgData'
import { useKnownPeople } from '@/features/account-facts/useKnownPeople'
import {
  buildContactSlugIndex,
  classifyCrmMatch,
  resolveGraphPersonContact,
  type ContactSlugIndex,
  type CrmMatchStatus,
} from './organigrammeData'
import { orgMarketMemoryLine } from './orgMarketMemoryLine'
import {
  filterOrgInfluenceMap,
  type OrgInfluenceMapData,
  type OrgMapCategory,
  type OrgMapColumn,
  type OrgMapEntityNode,
  type OrgMapGapNode,
  type OrgMapLink,
  type OrgMapPersonNode,
  orgLinkOrigin,
} from './orgInfluenceMapData'

/**
 * La CARTE D'INFLUENCE STRUCTURELLE de la maquette p20 — « Organigramme cible
 * BellumAI : hierarchy + entités + influence ».
 *
 * Ce que ce rendu apporte et que l'arbre plat ne pouvait pas donner :
 *   · la racine est une ENTITÉ (le groupe), pas le premier contact après tri ;
 *   · une colonne par entité, les personnes rangées par niveau structurel ;
 *   · le pourcentage de confiance DANS chaque nœud — l'objet que le commercial
 *     regarde cesse d'être muet sur sa propre fiabilité ;
 *   · le badge de niveau (Gouvernance → Achats), distinct du rôle d'achat ;
 *   · le trou de couverture posé à sa place hiérarchique (« Contact(s) à
 *     vérifier ») au lieu d'être renvoyé à un autre onglet ;
 *   · l'exploration par entité, métier et niveau.
 *
 * Aucun trait n'est dessiné par convention de mise en page : un rattachement
 * n'apparaît que parce que le graphe le porte, et une ligne de reporting est
 * annoncée en toutes lettres sur le nœud, avec son statut et son score.
 */

/**
 * UNE SEULE TEINTE, et le gris pour le reste — tome 7 §26.2 :
 * « **le gris est le plus important.** Un organigramme où tout est coloré est
 * un organigramme inventé. »
 *
 * Les cinq catégories portaient quatre teintes SÉMANTIQUES : une entité en
 * `--bellum-info` (« ce qui est déduit »), un relais terrain en
 * `--bellum-success` (« ce qui est fait, validé »), les achats en
 * `--bellum-warning` (« ce qui demande une décision »). Aucune n'était vraie —
 * un service achats n'est pas un avertissement — et elles dépensaient la
 * palette d'alerte sur une nomenclature de nœuds.
 *
 * Ce qui reste encré est ce qui DÉCIDE : le sponsor et le canal achats, dans
 * la même teinte primaire à deux intensités. Le reste est gris, et chaque
 * catégorie garde son NOM écrit dans la légende juste en dessous de la carte.
 */
const CATEGORY_COLOR: Record<OrgMapCategory, string> = {
  sponsor: 'var(--bellum-primary-500)',
  procurement: 'var(--bellum-primary-300)',
  entity: 'var(--bellum-border)',
  field: 'var(--bellum-text-muted)',
  unknown: 'var(--bellum-text-muted)',
}

const LEGEND_ORDER: OrgMapCategory[] = ['sponsor', 'entity', 'field', 'procurement', 'unknown']

/** #2121.21 — bornes du zoom, en pourcentage, pas par cent. */
const ORG_MAP_ZOOM_MIN = 50
const ORG_MAP_ZOOM_MAX = 150
const ORG_MAP_ZOOM_STEP = 10

export function OrgInfluenceMap({
  map,
  contacts,
  onContactClick,
  accountId,
  viewState,
  onViewStateChange,
}: {
  map: OrgInfluenceMapData
  contacts?: Contact[]
  onContactClick?: (contact: Contact) => void
  /** #4061.b — l'état (filtres, colonnes repliées, nœud choisi) porté par l'URL ; absent = état local. */
  viewState?: OrgViewState
  onViewStateChange?: (next: OrgViewState) => void
  /** Quand il est fourni, chaque zone blanche porte sa recherche ciblée (p18 :
   *  « relancer recherche ciblée, coût annoncé, sans full rerun »). */
  accountId?: string
}) {
  const { t } = useTranslation('accountOrg')
  const { t: tAccounts } = useTranslation('accounts')
  // #2837 — Market Memory branché sur la RACINE seulement (voir `EntityCard`) :
  // `market_company_signal` est un agrégat par ENTREPRISE, sans ventilation par
  // famille/niveau de poste, donc incapable de cibler une entité fille ou une
  // zone blanche précise (épopée #2837, « pourquoi c'est un système entier »).
  // Même hook, mêmes clés i18n que `AccountMarketMemoryCard` (namespace
  // `accounts`, `marketContext.*`) — un objet, plusieurs écrans (GA-258).
  const {
    data: marketContext,
    isPending: marketContextPending,
    isError: marketContextError,
  } = useAccountMarketContext(accountId, Boolean(accountId))
  const marketMemoryLine = orgMarketMemoryLine(tAccounts, {
    accountId,
    isPending: marketContextPending,
    isError: marketContextError,
    data: marketContext,
  })
  // #4061.b — filtres, affichage, colonnes repliées et nœud choisi vivent dans `viewState` (l'URL du
  // dossier) : ouvrir une fiche démonte l'onglet, et le retour doit retrouver la carte telle qu'on l'a quittée.
  const [orgState, patchOrgState] = useOrgViewState(viewState, onViewStateChange)
  const { filters } = orgState
  const { entity: entityId, family, level, role, project, minConfidence, name, display } = filters
  const setFilter = (change: Partial<typeof filters>) => patchOrgState({ filters: { ...filters, ...change } })
  const setEntityId = (value: string) => setFilter({ entity: value })
  const setFamily = (value: string) => setFilter({ family: value })
  const setLevel = (value: string) => setFilter({ level: value })
  const setRole = (value: string) => setFilter({ role: value })
  const setProject = (value: string) => setFilter({ project: value })
  const setMinConfidence = (value: string) => setFilter({ minConfidence: value })
  const setName = (value: string) => setFilter({ name: value })
  const setDisplay = (value: 'map' | 'list') => setFilter({ display: value })
  const focusId = orgState.selectedId
  const setFocusId = (next: string | null | ((current: string | null) => string | null)) =>
    patchOrgState({ selectedId: typeof next === 'function' ? next(orgState.selectedId) : next })
  // #2121.21 — la carte reste un flux CSS (pas un canevas) : zoomer agrandit
  // le bloc entier via `transform: scale`, et le déplacement passe par le
  // défilement NATIF du conteneur (`overflow-auto` sur `org-map-canvas`,
  // souris comme glisser tactile) — pas de librairie de canevas pour un besoin
  // qui reste, au fond, un flux qu'on regarde de plus ou moins près.
  const [zoom, setZoom] = useState(100)
  const zoomOut = () => setZoom(current => Math.max(ORG_MAP_ZOOM_MIN, current - ORG_MAP_ZOOM_STEP))
  const zoomIn = () => setZoom(current => Math.min(ORG_MAP_ZOOM_MAX, current + ORG_MAP_ZOOM_STEP))
  const zoomReset = () => setZoom(100)
  const collapsed: ReadonlySet<string> = useMemo(() => new Set(orgState.collapsed), [orgState.collapsed])
  const toggleCollapsed = (key: string) =>
    patchOrgState({
      collapsed: collapsed.has(key) ? orgState.collapsed.filter(item => item !== key) : [...orgState.collapsed, key],
    })
  // La MÊME mutation que la carte de couverture : la zone blanche relance une
  // recherche scopée sur SA case (métier × niveau), pas une analyse complète.
  const [runningGap, setRunningGap] = useState<string | null>(null)
  const enrichContacts = useEnrichContacts(accountId ?? '')
  const runGapSearch = (gap: OrgMapGapNode) => {
    if (!accountId) return
    setRunningGap(gap.id)
    enrichContacts.mutate(
      {
        // Les titres que la carte AFFICHE déjà sous le trou. Le libellé de
        // famille d'une zone blanche est une phrase du classifieur (« Cloud /
        // Infrastructure / HPC »), pas une clé de la matrice : envoyé seul, il
        // repartait tel quel en titre Apollo — personne ne porte cette
        // chaîne-là, et la recherche ciblée ne ramenait presque rien. La clé est
        // OMISE quand la zone n'en propose aucun : une liste vide se lirait
        // côté serveur comme un ciblage explicite et désactiverait le preset.
        ...(gap.suggestedTitles.length > 0 ? { titles: gap.suggestedTitles } : {}),
        family: gap.family ?? undefined,
        level: gap.level ?? undefined,
      },
      { onSettled: () => setRunningGap(null) },
    )
  }

  const view = useMemo(
    () =>
      filterOrgInfluenceMap(map, {
        entityId: entityId || null,
        family: family || null,
        level: (level || null) as OrgHierarchyLevel | null,
        role: (role || null) as OrgDecisionRole | null,
        project: project || null,
        minConfidence: minConfidence ? Number(minConfidence) : null,
        name: name.trim() || null,
      }),
    [map, entityId, family, level, role, project, minConfidence, name],
  )

  // Rapprochement carte → fiche contact : la clé PRINCIPALE reste le slug exact
  // du nom (`p-{slug}`), déjà utilisée par le chemin recommandé — avec un repli
  // tolérant à l'ordre prénom/nom et aux accents (#3019, recette 25/09 sur
  // CAPGEMINI : voir le docblock de `buildContactSlugIndex`). Sans correspondance,
  // le nœud reste simplement non cliquable.
  const contactIndex = useMemo(() => buildContactSlugIndex(contacts ?? []), [contacts])
  // #4072.1 — « Déjà connu : dans ton CRM » sur la carte d'influence aussi : le MÊME calcul que la vue focale.
  const knownPeople = useKnownPeople(accountId)
  const knownByPersonId = useMemo(
    () =>
      buildKnownByPersonId(
        map.columns.flatMap(column => column.people),
        knownPeople,
      ),
    [map, knownPeople],
  )

  // Le trait qui DESCEND vers un nœud : appartenance structurelle ou rattachement.
  // Les `reports_to` en sont exclus — ils visent aussi une personne, et écraseraient
  // le rattachement dans l'index ; ils sont écrits sur le nœud, pas dessinés.
  const linkTo = useMemo(
    () => new Map(view.links.filter(link => link.nature !== 'reports_to').map(link => [link.toId, link])),
    [view.links],
  )
  const reportsTo = useMemo(() => {
    const byPerson = new Map<string, { name: string; link: OrgMapLink }>()
    const names = new Map(view.columns.flatMap(c => c.people).map(p => [p.id, p.fullName]))
    for (const link of view.links) {
      if (link.nature !== 'reports_to') continue
      const name = names.get(link.fromId)
      if (name) byPerson.set(link.toId, { name, link })
    }
    return byPerson
  }, [view.columns, view.links])

  /**
   * #2121.32 / #2121.34 — « influences » et « works_with » NOMMENT le vis-à-vis,
   * sur les DEUX cartes qu'ils touchent. Volontairement une liste PAR personne
   * (`Map<string, Array<…>>`), et non `linkTo` (une entrée par nœud) : ces deux
   * natures ne sont pas des rattachements structurels — une personne peut en
   * porter plusieurs à la fois (influencer trois sujets, travailler avec deux
   * pairs), et les mélanger dans `linkTo` ÉCRASERAIT silencieusement son
   * appartenance à une entité (une seule entrée par clé) — la régression que ce
   * choix évite.
   */
  const crossLinks = useMemo(() => {
    const byPerson = new Map<string, Array<{ name: string; nature: 'influences' | 'works_with' }>>()
    const names = new Map(view.columns.flatMap(c => c.people).map(p => [p.id, p.fullName]))
    const add = (personId: string, otherId: string, nature: 'influences' | 'works_with') => {
      const otherName = names.get(otherId)
      if (!otherName) return
      const list = byPerson.get(personId) ?? []
      list.push({ name: otherName, nature })
      byPerson.set(personId, list)
    }
    for (const link of view.links) {
      if (link.nature !== 'influences' && link.nature !== 'works_with') continue
      add(link.fromId, link.toId, link.nature)
      add(link.toId, link.fromId, link.nature)
    }
    return byPerson
  }, [view.columns, view.links])

  // #2121.23 — la personne mise en avant et ses liens DIRECTS : les rattachements
  // `reports_to` dans les deux sens. Rien d'autre n'est un lien direct ici — la
  // même entité n'en est pas un. Les autres s'atténuent, ils ne disparaissent pas.
  const focusSet = useMemo(() => {
    if (!focusId) return null
    const set = new Set([focusId])
    for (const link of view.links) {
      if (link.nature !== 'reports_to') continue
      if (link.fromId === focusId) set.add(link.toId)
      if (link.toId === focusId) set.add(link.fromId)
    }
    return set
  }, [focusId, view.links])

  const filtered = Boolean(entityId || family || level || role || project || minConfidence || name)
  const empty = view.roots.length === 0 && view.columns.length === 0

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--bellum-border)] px-5 py-4">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-[var(--bellum-text-accent)]" />
          <Text element="h3" size="base" weight="semibold">
            {t('orgMap.title')}
          </Text>
        </div>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('orgMap.subtitle')}
        </Text>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--bellum-border)] px-5 py-3">
        {/* #2121.24 — retrouver quelqu'un sans parcourir chaque colonne. */}
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="org-map-search" className="text-xs text-[var(--bellum-text-muted)]">
            {t('orgMap.search.label')}
          </label>
          <Input
            id="org-map-search"
            type="search"
            value={name}
            placeholder={t('orgMap.search.placeholder')}
            onChange={event => setName(event.target.value)}
            className="w-full max-w-full sm:w-56"
          />
        </div>
        <FilterSelect
          id="org-map-entity"
          label={t('orgMap.filters.entity')}
          value={entityId}
          onChange={setEntityId}
          placeholder={t('orgMap.filters.allEntities')}
          options={map.facets.entities.map(e => ({ value: e.id, label: e.name }))}
        />
        <FilterSelect
          id="org-map-family"
          label={t('orgMap.filters.family')}
          value={family}
          onChange={setFamily}
          placeholder={t('orgMap.filters.allFamilies')}
          options={map.facets.families.map(f => ({ value: f, label: f }))}
        />
        <FilterSelect
          id="org-map-level"
          label={t('orgMap.filters.level')}
          value={level}
          onChange={setLevel}
          placeholder={t('orgMap.filters.allLevels')}
          options={map.facets.levels.map(l => ({ value: l, label: t(`orgMap.levels.${l}`) }))}
        />
        {/* Rôle d'achat et confiance : les deux derniers axes de la DoD p32.
            Le seuil de confiance ne masque QUE des personnes — une zone blanche
            reste visible, sinon la carte filtrée se lirait « tout est couvert ». */}
        <FilterSelect
          id="org-map-role"
          label={t('orgMap.filters.role')}
          value={role}
          onChange={setRole}
          placeholder={t('orgMap.filters.allRoles')}
          options={map.facets.roles.map(r => ({ value: r, label: t(`orgGraph.roles.${r}`, r) }))}
        />
        {/* Axe « projet » (p20) : les sujets d'influence — « qui pèse sur Graph:ID ». */}
        <FilterSelect
          id="org-map-project"
          label={t('orgMap.filters.project')}
          value={project}
          onChange={setProject}
          placeholder={t('orgMap.filters.allProjects')}
          options={map.facets.projects.map(p => ({ value: p, label: p }))}
        />
        <FilterSelect
          id="org-map-confidence"
          label={t('orgMap.filters.confidenceMin')}
          value={minConfidence}
          onChange={setMinConfidence}
          placeholder={t('orgMap.filters.allConfidences')}
          options={[
            { value: '90', label: t('orgMap.filters.confidenceVerified') },
            { value: '70', label: t('orgMap.filters.confidenceProbable') },
            { value: '50', label: t('orgMap.filters.confidenceHypothesis') },
          ]}
        />
        {filtered ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              setFilter({ entity: '', family: '', level: '', role: '', project: '', minConfidence: '', name: '' })
            }}
          >
            {t('orgMap.filters.reset')}
          </Button>
        ) : null}
        {/* #2121.21 — zoomer/dézoomer la carte ; sans objet en liste (pas un
            plan spatial). Le bouton « réinitialiser » n'apparaît que si le
            zoom s'est écarté de 100 %, pour ne pas doubler un geste inutile. */}
        {display === 'map' ? (
          <div role="group" aria-label={t('orgMap.zoom.aria')} className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="pointer-coarse:min-h-11"
              onClick={zoomOut}
              disabled={zoom <= ORG_MAP_ZOOM_MIN}
              aria-label={t('orgMap.zoom.out')}
            >
              −
            </Button>
            <Text size="xs" className="min-w-[2.5rem] text-center text-[var(--bellum-text-muted)]">
              {t('orgMap.zoom.level', { value: zoom })}
            </Text>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="pointer-coarse:min-h-11"
              onClick={zoomIn}
              disabled={zoom >= ORG_MAP_ZOOM_MAX}
              aria-label={t('orgMap.zoom.in')}
            >
              +
            </Button>
            {zoom !== 100 ? (
              <Button type="button" size="xs" variant="outline" className="pointer-coarse:min-h-11" onClick={zoomReset}>
                {t('orgMap.zoom.reset')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {/* #2121.27 — la MÊME carte en liste : mêmes personnes, mêmes filtres. */}
        <div
          role="group"
          aria-label={t('orgMap.display.aria')}
          className={display === 'map' ? 'flex gap-1' : 'ml-auto flex gap-1'}
        >
          {(['map', 'list'] as const).map(mode => (
            <Button
              key={mode}
              type="button"
              size="xs"
              variant={display === mode ? 'secondary' : 'outline'}
              aria-pressed={display === mode}
              className="pointer-coarse:min-h-11"
              onClick={() => setDisplay(mode)}
            >
              {t(`orgMap.display.${mode}`)}
            </Button>
          ))}
        </div>
        {focusId ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={() => setFocusId(null)}
          >
            {t('orgMap.focus.clear')}
          </Button>
        ) : null}
      </div>

      <div className="overflow-auto p-5" data-testid="org-map-canvas">
        {empty ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('orgMap.filtersEmpty')}
          </Text>
        ) : display === 'list' ? (
          <PeopleList view={view} />
        ) : (
          <div
            className="inline-flex min-w-full flex-col items-center gap-0"
            style={zoom !== 100 ? { transform: `scale(${zoom / 100})`, transformOrigin: 'top center' } : undefined}
          >
            {view.roots.length > 0 ? (
              <>
                <div className="flex flex-wrap items-start justify-center gap-4">
                  {view.roots.map(root => (
                    // La ligne mémoire marché ne se pose que sur la racine — voir
                    // le commentaire #2837 plus haut : jamais sur une colonne
                    // (`EntityCard entity={column.entity}` ci-dessous, sans elle).
                    <EntityCard key={root.id} entity={root} marketMemory={marketMemoryLine} />
                  ))}
                </div>
                {/* Espace sous la rangée racine : il ne matérialise aucun lien
                    (chaque colonne porte le sien), donc il n'affirme rien. */}
                <Rail height={20} origin="layout" />
              </>
            ) : null}

            <div className="flex items-start justify-center gap-4">
              {view.columns.map((column, index) => (
                <ColumnView
                  key={column.entity?.id ?? `unassigned-${index}`}
                  column={column}
                  linkTo={linkTo}
                  reportsTo={reportsTo}
                  crossLinks={crossLinks}
                  contactIndex={contactIndex}
                  crmReady={contacts !== undefined}
                  knownByPersonId={knownByPersonId}
                  onContactClick={onContactClick}
                  onSelect={setFocusId}
                  onGapSearch={accountId ? runGapSearch : undefined}
                  runningGapId={runningGap}
                  collapsed={collapsed.has(column.entity?.id ?? 'unassigned')}
                  onToggleCollapsed={() => toggleCollapsed(column.entity?.id ?? 'unassigned')}
                  focusSet={focusSet}
                  onFocus={id => setFocusId(current => (current === id ? null : id))}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <MapLegend />
    </Card>
  )
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  placeholder,
  options,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  placeholder: string
  options: Array<{ value: string; label: string }>
}) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-[var(--bellum-text-muted)]">
        {label}
      </label>
      <SelectField
        id={id}
        value={value}
        onChange={next => onChange(next)}
        emptyOption={{ label: placeholder }}
        options={options.map(option => ({ value: option.value, label: option.label }))}
        className="min-w-0 max-w-full"
      />
    </div>
  )
}

/**
 * Un segment vertical de liaison — et ce qu'il a le droit de DIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT PARLE
 * ─────────────────────────────────────────────────────────────────────────
 * Il ne disait rien. La seule différence entre un rattachement PROUVÉ et un
 * rattachement DEVINÉ était `border-dashed` contre `border-solid`, sur un
 * `<span aria-hidden>` : invisible pour un lecteur d'écran, perdu dans une
 * capture en niveaux de gris, et muet sur la source même quand le graphe en
 * portait une. Le trait est pourtant l'objet sur lequel le commercial décide
 * qui appeler en premier.
 *
 * Chaque trait nomme donc son origine (voir {@link orgLinkOrigin}) et, quand le
 * graphe en porte, cite la preuve avec sa DATE. Rien à citer ⇒ le trait dit
 * qu'il n'a rien : on ne lui fabrique pas de provenance.
 *
 * `origin` explicite quand aucun lien ne le porte : `layout` pour l'espace sous
 * la rangée racine (il ne matérialise aucune affirmation), `gap` pour la case
 * d'une zone blanche (l'emplacement est PRÉSUMÉ — il était dessiné plein, donc
 * lu comme établi, sous un poste que personne n'a encore trouvé).
 */
function Rail({ height, link, origin }: { height: number; link?: OrgMapLink; origin: 'layout' | 'gap' | 'assumed' }) {
  const { t } = useTranslation('accountOrg')
  const kind = link ? orgLinkOrigin(link) : origin
  // #2121.35 — une déclaration terrain (workspace_user) est un TROISIÈME état,
  // mais elle se dessine comme « sourced » : `verified: true` côté correction,
  // et un trait pointillé sous une déclaration humaine lirait comme un doute
  // qu'elle ne porte pas.
  const solid = kind === 'sourced' || kind === 'declared' || kind === 'structure'
  const label =
    kind === 'layout'
      ? null
      : kind === 'gap'
        ? t('orgMap.link.gap')
        : kind === 'assumed'
          ? t(link && link.sources.length > 0 ? 'orgMap.link.assumedSupported' : 'orgMap.link.assumedUnsourced')
          : t(`orgMap.link.${kind}`)

  return (
    <div className="flex items-center gap-1.5" style={{ height }}>
      <span
        aria-hidden
        className={cn('inline-block w-0 border-l', solid ? 'border-solid' : 'border-dashed')}
        style={{ height, borderColor: 'var(--bellum-border)' }}
      />
      {label ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {label}
        </Text>
      ) : null}
      {link ? <OrgSourceChips sources={link.sources} max={1} className="" /> : null}
      {/* Le score n'accompagne QUE ce qui est deviné — c'est la promesse déjà
          écrite en tête de carte (« les liens pointillés affichent leur
          confiance »), que le code tenait à moitié : il chiffrait aussi les
          traits pleins. Un lien prouvé n'a pas besoin d'un pourcentage pour se
          défendre, et lui en coller un le fait lire comme une probabilité. */}
      {link &&
      kind !== 'sourced' &&
      kind !== 'declared' &&
      kind !== 'structure' &&
      typeof link.confidence === 'number' ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('orgMap.confidence', { value: link.confidence })}
        </Text>
      ) : null}
    </div>
  )
}

function ColumnView({
  column,
  linkTo,
  reportsTo,
  crossLinks,
  contactIndex,
  crmReady,
  knownByPersonId,
  onContactClick,
  onSelect,
  onGapSearch,
  runningGapId,
  collapsed,
  onToggleCollapsed,
  focusSet,
  onFocus,
}: {
  column: OrgMapColumn
  linkTo: Map<string, OrgMapLink>
  reportsTo: Map<string, { name: string; link: OrgMapLink }>
  crossLinks: Map<string, Array<{ name: string; nature: 'influences' | 'works_with' }>>
  contactIndex: ContactSlugIndex
  /** #4056.1 — contacts chargés : sinon « non retrouvée » serait un faux négatif. */
  crmReady: boolean
  /** #4072.1 — les personnes déjà connues de l'espace, par identifiant de nœud. */
  knownByPersonId: ReadonlyMap<string, FocalKnown>
  onContactClick?: (contact: Contact) => void
  /** #4061.b — pose la sélection AVANT d'ouvrir une fiche : le retour retrouve la personne choisie. */
  onSelect?: (personId: string) => void
  onGapSearch?: (gap: OrgMapGapNode) => void
  runningGapId?: string | null
  collapsed: boolean
  onToggleCollapsed: () => void
  focusSet: ReadonlySet<string> | null
  onFocus: (personId: string) => void
}) {
  const { t } = useTranslation('accountOrg')
  const columnName = column.entity?.name ?? t('orgMap.unassigned')
  return (
    <div className="flex flex-col items-center">
      {column.entity && !column.isRoot ? (
        <>
          <Rail height={14} link={linkTo.get(column.entity.id)} origin="layout" />
          <EntityCard entity={column.entity} />
        </>
      ) : null}
      {!column.entity ? (
        <div className="w-60 rounded-xl border border-dashed border-[var(--bellum-border)] px-3 py-2 text-center">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('orgMap.unassigned')}
          </Text>
        </div>
      ) : null}

      {/* #2121.22 — replier une colonne. Ce qui est replié est COMPTÉ, jamais
          escamoté ; les zones blanches restent visibles (une absence masquée
          donnerait une carte faussement complète). */}
      {column.people.length > 0 ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-expanded={!collapsed}
          className="mt-1 pointer-coarse:min-h-11"
          onClick={onToggleCollapsed}
        >
          {t(collapsed ? 'orgMap.collapse.expand' : 'orgMap.collapse.collapse', { name: columnName })}
        </Button>
      ) : null}
      {collapsed ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('orgMap.collapse.hidden', { count: column.people.length })}
        </Text>
      ) : (
        column.people.map(person => (
          <div key={person.id} className="flex flex-col items-center">
            {/* Sans lien retrouvé, le repli est « hypothèse », jamais « plein » :
                un trait qu'on ne sait pas justifier ne se dessine pas comme un
                fait. */}
            <Rail height={18} link={linkTo.get(person.id)} origin="assumed" />
            <PersonCard
              person={person}
              reportsTo={reportsTo.get(person.id)}
              crossLinks={crossLinks.get(person.id)}
              contact={resolveGraphPersonContact(contactIndex, person)}
              crmMatch={crmReady ? classifyCrmMatch(contactIndex, person) : null}
              known={knownByPersonId.get(person.id) ?? null}
              onContactClick={
                onContactClick
                  ? opened => {
                      onSelect?.(person.id)
                      onContactClick(opened)
                    }
                  : undefined
              }
              dimmed={focusSet !== null && !focusSet.has(person.id)}
              focused={focusSet !== null && focusSet.has(person.id)}
              onFocus={() => onFocus(person.id)}
            />
          </div>
        ))
      )}

      {column.gaps.map(gap => (
        <div key={gap.id} className="flex flex-col items-center">
          {/* La case d'une zone blanche n'est rattachée par rien : son trait
              était PLEIN, donc lu comme un rattachement établi sous un poste
              que personne n'a encore trouvé. */}
          <Rail height={18} origin="gap" />
          <GapCard gap={gap} onSearch={onGapSearch} pending={runningGapId === gap.id} />
        </div>
      ))}
    </div>
  )
}

/** Confiance affichée DANS le nœud (p20 : 92 %, 80 %, 65 %…) : jauge + chiffre. */
function ConfidenceMeter({ value, color }: { value: number; color: string }) {
  const { t } = useTranslation('accountOrg')
  return (
    <div className="mt-2 flex items-center gap-2">
      <span
        aria-hidden
        className="h-1 flex-1 overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--bellum-border)' }}
      >
        <span className="block h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </span>
      <Text size="xs" weight="medium" className="shrink-0 text-[var(--bellum-text-secondary)]">
        <span aria-label={t('orgMap.confidenceLabel', { value })}>{t('orgMap.confidence', { value })}</span>
      </Text>
    </div>
  )
}

function EntityCard({ entity, marketMemory }: { entity: OrgMapEntityNode; marketMemory?: string | null }) {
  const { t } = useTranslation('accountOrg')
  const color = CATEGORY_COLOR.entity
  return (
    <div
      className="w-60 rounded-xl border bg-[var(--bellum-surface-1)] px-3 py-2.5"
      style={{ borderColor: color }}
      data-testid={`org-entity-${entity.id}`}
    >
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {entity.name}
      </Text>
      {entity.families.length > 0 ? (
        <Text size="xs" className="mt-0.5 line-clamp-2 text-[var(--bellum-text-muted)]">
          {entity.families.join(' · ')}
        </Text>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {/* #2284.6 — un badge : le kind s'il affine le type, sinon le type. */}
        <OrgNodeTypeBadge
          type={entity.type}
          kind={entity.kind}
          typeKey="orgMap.entityTypes"
          variant="info"
          unconfirmed={entity.sources.length === 0}
        />
        {/* Une entité qui n'est plus active ne se présente pas comme active. */}
        {entity.status !== 'operating' ? (
          <Badge variant={entity.status === 'ceded' ? 'warning' : 'outline'}>
            {t(`orgMap.entityStatus.${entity.status}`, entity.status)}
          </Badge>
        ) : null}
        {/* Le pays de l'ontologie p6 — décisif dès qu'un groupe a des entités
            hors de France, où le chemin commercial n'est pas le même. */}
        {entity.country ? <Badge variant="outline">{entity.country}</Badge> : null}
      </div>
      <ConfidenceMeter value={entity.confidence} color={color} />
      <OrgSourceChips sources={entity.sources} max={2} />
      {/* #2837 — signal d'ENTREPRISE, jamais posé sur une entité fille : voir le
          commentaire au-dessus de `useAccountMarketContext` dans le composant
          parent. `marketMemory` n'est fourni qu'au rendu de la racine. */}
      {marketMemory ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {marketMemory}
        </Text>
      ) : null}
    </div>
  )
}

/** R46 point 6 — le nombre de puces visibles sur UNE rangée ; le reste se compte « +N ». */
const PERSON_CHIPS_VISIBLE = 2

/**
 * R46 point 6 — niveau, statut d'identité, rôles d'achat et famille tiennent sur UNE
 * rangée (la carte en empilait quatre, la dernière tronquée). Le surplus devient
 * « +N », dont `title` et le texte lecteur d'écran portent la liste COMPLÈTE : rien
 * n'est perdu, seulement replié. Les puces ne sont pas des cibles cliquables.
 *
 * Le niveau STRUCTUREL est l'axe que l'écran ne montrait nulle part : absent de la
 * donnée il s'affiche « inconnu », on ne le déduit pas du rôle. `unknown` n'est pas
 * un rôle d'achat, c'est l'aveu qu'on ne sait pas : il n'est pas affiché.
 */
function PersonChips({ person, color }: { person: OrgMapPersonNode; color: string }) {
  const { t } = useTranslation('accountOrg')
  const unknownLevel = person.category === 'unknown'
  const identityVariant =
    person.identityStatus === 'actionable' ? 'success' : person.identityStatus === 'historical' ? 'warning' : 'outline'
  const chips: Array<{ key: string; label: string; node: ReactNode }> = [
    {
      key: 'level',
      label: person.level ? t(`orgMap.levels.${person.level}`) : t('orgMap.levelUnknown'),
      node: (
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            color: unknownLevel ? 'var(--bellum-text-muted)' : color,
            backgroundColor: unknownLevel ? 'var(--bellum-surface-2)' : `color-mix(in srgb, ${color} 15%, transparent)`,
          }}
        >
          {person.level ? t(`orgMap.levels.${person.level}`) : t('orgMap.levelUnknown')}
        </span>
      ),
    },
    {
      key: 'identity',
      label: t(`orgMap.identityStatus.${person.identityStatus}`, person.identityStatus),
      node: (
        <Badge variant={identityVariant} className="shrink-0">
          {t(`orgMap.identityStatus.${person.identityStatus}`, person.identityStatus)}
        </Badge>
      ),
    },
    ...person.decisionRoles
      .filter(role => role !== 'unknown')
      .map(role => ({
        key: `role-${role}`,
        label: t(`orgGraph.roles.${role}`, role),
        node: (
          <RoleHint role={role}>
            <Badge variant="primary" className="shrink-0">
              {t(`orgGraph.roles.${role}`, role)}
            </Badge>
          </RoleHint>
        ),
      })),
    ...(person.family
      ? [
          {
            key: 'family',
            label: person.family,
            node: (
              <Badge variant="outline" className="shrink-0">
                {person.family}
              </Badge>
            ),
          },
        ]
      : []),
  ]
  const shown = chips.slice(0, PERSON_CHIPS_VISIBLE)
  const hidden = chips.length - shown.length
  const all = chips.map(chip => chip.label).join(' · ')
  return (
    <div className="mt-1.5 flex flex-nowrap items-center gap-1.5 overflow-hidden" data-testid="org-person-chips">
      {shown.map(chip => (
        <span key={chip.key} className="inline-flex min-w-0">
          {chip.node}
        </span>
      ))}
      {hidden > 0 ? (
        <span
          className="shrink-0 text-xs text-[var(--bellum-text-muted)]"
          title={all}
          data-testid="org-person-chips-more"
        >
          +{hidden}
          <span className="sr-only">{all}</span>
        </span>
      ) : null}
    </div>
  )
}

function PersonCard({
  person,
  reportsTo,
  crossLinks,
  contact,
  crmMatch,
  known = null,
  onContactClick,
  dimmed = false,
  focused = false,
  onFocus,
}: {
  person: OrgMapPersonNode
  reportsTo?: { name: string; link: OrgMapLink }
  /** #2121.32 / #2121.34 — les influences et collaborations qui NOMMENT cette
   *  personne, dans un sens ou dans l'autre. */
  crossLinks?: Array<{ name: string; nature: 'influences' | 'works_with' }>
  contact?: Contact
  /** #4056.1 — superposition CRM, en toutes lettres. */
  crmMatch?: CrmMatchStatus | null
  /** #4072.1 — connue de l'espace (CRM, mission passée) ; `null` = rien d'affiché. */
  known?: FocalKnown | null
  onContactClick?: (contact: Contact) => void
  dimmed?: boolean
  focused?: boolean
  onFocus?: () => void
}) {
  const { t } = useTranslation('accountOrg')
  const color = CATEGORY_COLOR[person.category]
  return (
    <div
      data-org-person
      data-dimmed={dimmed ? 'true' : 'false'}
      className={cn('w-60 rounded-xl border bg-[var(--bellum-surface-1)] px-3 py-2.5', dimmed && 'opacity-40')}
      style={{ borderColor: person.category === 'unknown' ? 'var(--bellum-border)' : color }}
    >
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {person.fullName}
      </Text>
      {person.title ? (
        <Text size="xs" className="mt-0.5 line-clamp-2 text-[var(--bellum-text-muted)]">
          {person.title}
        </Text>
      ) : null}
      <PersonChips person={person} color={color} />
      {/* La ligne de reporting est ÉCRITE, jamais suggérée par la mise en page —
          et elle dit d'OÙ elle vient. « Vérifié » se disait sur la foi du seul
          drapeau de l'edge : un edge vérifié dont les preuves ne retombent sur
          rien s'affichait comme un fait sans qu'on puisse en montrer une seule.
          Le mot suit maintenant ce qu'on est capable de MONTRER. */}
      {reportsTo ? <ReportingLine name={reportsTo.name} link={reportsTo.link} /> : null}
      {/* #2121.32 / #2121.34 — un lien « influences »/« works_with » est un
          FAIT au même titre qu'un rattachement : il se NOMME, il ne se devine
          pas d'une position sur la carte. */}
      {crossLinks && crossLinks.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {crossLinks.map((cross, index) => (
            <li key={`${cross.nature}-${cross.name}-${index}`}>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`orgGraph.relations.${cross.nature}`)} {cross.name}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
      <ConfidenceMeter value={person.confidence} color={color} />
      {/* #4056.1 */}
      <OrgCrmMatchBadge status={crmMatch} />
      <OrgKnownMarker known={known} />
      <OrgSourceChips sources={person.sources} max={2} />
      {/* Les coordonnées quand l'enrichissement les a résolues : la maquette p4
          les porte sur la carte, et sans elles le nœud n'est pas actionnable. */}
      {contact?.email || contact?.phone ? (
        <div className="mt-1 space-y-0.5">
          {contact.email ? (
            <div className="flex items-center gap-1.5">
              <Mail className="size-3 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
              <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                {contact.email}
              </Text>
              {/* #4016 L4.1 — une adresse ESTIMÉE se badge, partout où elle s'affiche. */}
              {contact.email_estimated_at ? <EstimatedBadge verifiedAt={contact.email_estimated_at} /> : null}
            </div>
          ) : null}
          {contact.phone ? (
            <div className="flex items-center gap-1.5">
              <Phone className="size-3 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
              <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                {/* #3850.4 — international lisible, jamais le compact brut. */}
                {formatPhoneForDisplay(contact.phone)}
              </Text>
            </div>
          ) : null}
        </div>
      ) : null}
      {contact && onContactClick ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="mt-1 h-auto min-h-11 gap-1.5 p-0 text-[var(--bellum-text-secondary)]"
          onClick={() => onContactClick(contact)}
        >
          <User className="size-3" />
          {t('orgMap.viewProfile')}
        </Button>
      ) : null}
      {/* #2121.23 — mettre en avant CETTE personne et ses liens directs, SUR la
          carte. « Voir la fiche » quitte la carte ; ce geste-ci y reste. */}
      {onFocus ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          aria-pressed={focused}
          aria-label={t('orgMap.focus.aria', { name: person.fullName })}
          className="mt-1 h-auto gap-1.5 p-0 text-[var(--bellum-text-secondary)] pointer-coarse:min-h-11"
          onClick={onFocus}
        >
          <Network className="size-3" aria-hidden />
          {t('orgMap.focus.cta')}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * #2121.27 — LA CARTE EN LISTE. Les mêmes personnes, sous les mêmes filtres
 * (`view` est la carte DÉJÀ filtrée) : une lecture ligne à ligne pour qui ne
 * lit pas un graphe, ou le lit au clavier. Une valeur absente se dit, elle ne
 * devient ni « 0 » ni une case vide muette.
 */
function PeopleList({ view }: { view: OrgInfluenceMapData }) {
  const { t } = useTranslation('accountOrg')
  const rows = view.columns.flatMap(column =>
    column.people.map(person => ({ person, entity: column.entity?.name ?? t('orgMap.unassigned') })),
  )
  return (
    <table className="w-full min-w-[40rem] text-left text-sm">
      <caption className="sr-only">{t('orgMap.list.caption')}</caption>
      <thead>
        <tr className="border-b border-[var(--bellum-border)] text-xs text-[var(--bellum-text-muted)]">
          {(['name', 'title', 'entity', 'level', 'roles', 'confidence'] as const).map(key => (
            <th key={key} scope="col" className="px-2 py-1.5 font-medium">
              {t(`orgMap.list.${key}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ person, entity }) => {
          const roles = person.decisionRoles.filter(role => role !== 'unknown')
          return (
            <tr key={person.id} className="border-b border-[var(--bellum-border)] align-top">
              <td className="px-2 py-1.5 font-medium text-[var(--bellum-text-primary)]">{person.fullName}</td>
              <td className="px-2 py-1.5 text-[var(--bellum-text-secondary)]">{person.title ?? '—'}</td>
              <td className="px-2 py-1.5 text-[var(--bellum-text-secondary)]">{entity}</td>
              <td className="px-2 py-1.5 text-[var(--bellum-text-secondary)]">
                {person.level ? t(`orgMap.levels.${person.level}`) : t('orgMap.levelUnknown')}
              </td>
              <td className="px-2 py-1.5 text-[var(--bellum-text-secondary)]">
                {roles.length > 0 ? roles.map(role => t(`orgGraph.roles.${role}`, role)).join(', ') : '—'}
              </td>
              <td className="px-2 py-1.5 text-[var(--bellum-text-secondary)]">
                {t('orgMap.confidence', { value: person.confidence })}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * « rattaché à X · <ce qu'on peut en montrer> ».
 *
 * Le mot suit ce qu'on est capable de MONTRER, pas le seul drapeau de l'edge :
 * un `verified` dont les `sourceIds` ne retombent sur aucune preuve s'affichait
 * « Vérifié » sans qu'on puisse en citer une — c'est-à-dire une provenance
 * affirmée et introuvable. Et le score reste sur l'hypothèse, où il dit quelque
 * chose ; il quitte le lien prouvé, où il se lisait comme une probabilité.
 */
function ReportingLine({ name, link }: { name: string; link: OrgMapLink }) {
  const { t } = useTranslation('accountOrg')
  // #2121.35 — trois états possibles ici : sourced / declared / assumed
  // (`structure` ne s'affiche jamais sur un `reports_to`, voir `orgLinkOrigin`).
  const kind = orgLinkOrigin(link)
  const sourced = kind === 'sourced'
  const declared = kind === 'declared'
  const word = sourced
    ? t('orgMap.link.sourced')
    : declared
      ? t('orgMap.link.declared')
      : t(link.sources.length > 0 ? 'orgMap.link.assumedSupported' : 'orgMap.link.assumedUnsourced')
  // #2121.37 — le QUAND du lien, lu par la seule lecture de fraîcheur du contrat.
  // Sans date lisible : « jamais vérifié », en toutes lettres, jamais un blanc.
  const verifiedAt = readOrgFreshness(link.lastVerifiedAt, new Date()).lastVerifiedAt
  const verifiedDate = verifiedAt ? formatDate(verifiedAt, { dateStyle: 'medium' }) : null
  const when = verifiedDate ? t('orgMap.link.verifiedOn', { date: verifiedDate }) : t('orgMap.link.neverVerified')
  return (
    <>
      <Text size="xs" className="mt-1.5 text-[var(--bellum-text-secondary)]">
        {t('orgGraph.relations.reports_to')} {name}
        {' · '}
        {word}
        {!sourced && !declared && typeof link.confidence === 'number'
          ? ` · ${t('orgMap.confidence', { value: link.confidence })}`
          : ''}
        {` · ${when}`}
      </Text>
      <OrgSourceChips sources={link.sources} max={1} className="mt-0.5" />
    </>
  )
}

/** Le trou de couverture À SA PLACE dans l'arbre (p20) — un poste sans personne. */
function GapCard({
  gap,
  onSearch,
  pending,
}: {
  gap: OrgMapGapNode
  onSearch?: (gap: OrgMapGapNode) => void
  pending?: boolean
}) {
  const { t } = useTranslation('accountOrg')
  // #4061.a — un poste SANS personne s'ouvre sur une explication, jamais sur une fausse fiche.
  const [explained, setExplained] = useState(false)
  const canSearch = Boolean(onSearch && (gap.family || gap.level))
  return (
    <div className="w-60 rounded-xl border border-dashed border-[var(--bellum-border)] bg-transparent px-3 py-2.5">
      <button
        type="button"
        aria-expanded={explained}
        aria-label={t('orgMap.gapExplain.toggle')}
        onClick={() => setExplained(open => !open)}
        className="flex min-h-6 w-full items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] pointer-coarse:min-h-11"
      >
        <Search className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-secondary)]">
          {t('orgMap.toVerify')}
        </Text>
      </button>
      {explained ? (
        <div className="mt-1 flex flex-col gap-1">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('orgMap.gapExplain.noRecord')}
          </Text>
          {canSearch ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('orgMap.gapExplain.search')}
            </Text>
          ) : null}
        </div>
      ) : null}
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {gap.reason}
      </Text>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {/* L'importance de la zone (p18) : toutes les cases vides ne se valent
            pas — une critique se comble avant une secondaire. */}
        <Badge
          variant={gap.importance === 'critique' ? 'danger' : gap.importance === 'importante' ? 'warning' : 'outline'}
        >
          {t(`orgMap.importance.${gap.importance}`, gap.importance)}
        </Badge>
        {gap.level ? <Badge variant="outline">{t(`orgMap.levels.${gap.level}`)}</Badge> : null}
        {gap.family ? <Badge variant="outline">{gap.family}</Badge> : null}
      </div>
      {gap.suggestedTitles.length > 0 ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {gap.suggestedTitles.join(' · ')}
        </Text>
      ) : null}
      {/* Le stock estimé (p18) : ce que la recherche ciblée a des CHANCES de
          ramener. Absent du graphe = aucun chiffre affiché, jamais un zéro qui se
          lirait « il n'y a personne à trouver ». */}
      {typeof gap.estimatedAvailable === 'number' ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('orgMap.estimatedStock', { count: gap.estimatedAvailable })}
        </Text>
      ) : null}
      {gap.suggestedQueries.length > 0 ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          <span className="text-[var(--bellum-text-muted)]">{t('orgMap.searches')} </span>
          {gap.suggestedQueries.join(' · ')}
        </Text>
      ) : null}
      {/* « Les zones blanches déclenchent une recherche ciblée » (DoD p32) : le
          geste est là où le trou est vu. Une zone qui ne nomme ni métier ni
          niveau n'a rien à scoper — le bouton lancerait une recherche large. */}
      {onSearch && (gap.family || gap.level) ? (
        <Button
          size="xs"
          variant="outline"
          className="mt-2 w-full gap-1.5"
          disabled={pending}
          onClick={() => onSearch(gap)}
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
          {pending ? t('orgMap.searchGapPending') : t('orgMap.searchGap')}
        </Button>
      ) : null}
    </div>
  )
}

function MapLegend() {
  const { t } = useTranslation('accountOrg')
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--bellum-border)] px-5 py-3">
      {LEGEND_ORDER.map(category => (
        <span key={category} className="flex items-center gap-1.5 text-xs text-[var(--bellum-text-muted)]">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: CATEGORY_COLOR[category] }}
          />
          {t(`orgMap.legend.${category}`)}
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-xs text-[var(--bellum-text-muted)]">
        <span aria-hidden className="inline-block h-px w-6 bg-[var(--bellum-border)]" />
        {t('orgMap.legend.structure')}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-[var(--bellum-text-muted)]">
        <span aria-hidden className="inline-block h-0 w-6 border-t border-dashed border-[var(--bellum-border)]" />
        {t('orgMap.legend.inferred')}
      </span>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('orgMap.legend.verified')}
      </Text>
    </div>
  )
}
