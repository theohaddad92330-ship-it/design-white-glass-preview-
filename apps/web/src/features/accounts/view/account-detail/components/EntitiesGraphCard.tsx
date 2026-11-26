import {
  Badge,
  Box,
  Button,
  Card,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  cn,
} from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Building2, ChevronDown, Info, Target, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MeasuredValue, UnknownValue } from '@/components/primitives/UnknownValue'
import { normaliseEntities, splitEntitiesByActionable, type VocabularyEntityTerm } from './entities/entityData'
import { ENTITIES_TABLE_SHELL, entitiesColumnClass } from './entities/entitiesTableColumns'
import { filterEntitiesBySiteCategory, siteRegions } from './entities/listedEntities'
import { EntityFlowGraph } from './entities/EntityFlowGraph'
import { matchPerimeterSignal } from './entities/perimeterSignals'
import { normaliseTypeKey, styleForType } from './entities/entityTypes'
import { normaliseClaudeSites } from './sites/siteGeo'
import { siteCategory, type SiteCategory, type SiteViewMode } from './sites/siteStyles'
import type { GraphEntity, ScopeKind } from './entities/entityTypes'
import type { PriorityPerimeterSignal } from './entities/perimeterSignals'
import type { SiteRow } from './sites/siteTypes'

type EntityTab = 'actionable' | 'others'
// #2966 (#2119.64) — « la carte et la liste des périmètres racontent la même
// chose ». `EntityFlowGraph` existait déjà, testé, jamais appelé (le registre
// du dépôt) : ce composant en était le seul appelant possible, la table
// ci-dessous étant la LISTE que le retour promet en vis-à-vis. Un TOGGLE, pas
// deux composants séparés qui pourraient diverger : les deux vues lisent
// exactement le même `activeEntities`, jamais une seconde requête.
type EntityView = 'list' | 'map'

type EntitiesGraphCardProps = {
  entities: unknown
  subsidiaries?: unknown
  rootName?: string | null
  /** #4327.1 — les termes du « Vocabulaire du groupe » : ceux de type Entité rejoignent la liste. */
  vocabulary?: readonly VocabularyEntityTerm[]
  sites?: unknown
  siteCategoryFilter: SiteViewMode
  /** #2966 (#2119.43-51) — les 2-4 périmètres déjà scorés par
   *  `perimeter_score.py`, rapprochés par nom (voir `matchPerimeterSignal`).
   *  Absent ou vide : chaque attribut qui en dépend se lit « non mesuré ». */
  priorityPerimeters?: PriorityPerimeterSignal[]
  /** #2966 (#2119.52-56) — le périmètre choisi comme CIBLE, qui préfiltre
   *  Personnes/Écosystème/Plan/Laura. `null` = aucune cible choisie. */
  targetPerimeter?: string | null
  /** #2966 (#2119.52) — « Choisir ce périmètre comme cible ». Absent : le
   *  bouton ne se rend pas (composant utilisable hors contexte de route). */
  onChooseTarget?: (name: string) => void
  /** #2966 (#2119.52) — retire la cible. */
  onClearTarget?: () => void
}

const NO_VOCABULARY: readonly VocabularyEntityTerm[] = []

/** Les lignes montrées avant « Voir toutes les entités ». */
const COLLAPSED_ROW_COUNT = 5

export function EntitiesGraphCard(props: EntitiesGraphCardProps) {
  const {
    entities,
    subsidiaries,
    rootName,
    vocabulary = NO_VOCABULARY,
    sites,
    siteCategoryFilter,
    priorityPerimeters = [],
    targetPerimeter = null,
    onChooseTarget,
    onClearTarget,
  } = props
  const { t } = useTranslation('accountOrg')
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)
  const [typedEntity, setTypedEntity] = useState('')
  const [tab, setTab] = useState<EntityTab>('actionable')
  const [view, setView] = useState<EntityView>('list')
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const flat = useMemo(
    () => normaliseEntities(entities, subsidiaries, rootName ?? null, vocabulary),
    [entities, subsidiaries, rootName, vocabulary],
  )
  const allSites = useMemo(() => normaliseClaudeSites(sites), [sites])
  const matchingSites = useMemo(
    () => filterSitesByCategory(allSites, siteCategoryFilter),
    [allSites, siteCategoryFilter],
  )
  // Le VOCABULAIRE de régions que la liste des sites connaît, toutes catégories
  // confondues. Il sert à distinguer « zéro site ici » de « je ne sais pas où
  // est cette entité » — voir `buildEntityRows`. Il est calculé sur TOUS les
  // sites et non sur les sites filtrés : sinon un onglet de catégorie rendrait
  // « non mesuré » là où la vraie réponse est « aucun site de cette catégorie ».
  const knownRegions = useMemo(() => siteRegions(allSites), [allSites])
  const filtered = useMemo(
    () => filterEntitiesBySiteCategory(flat, sites, siteCategoryFilter),
    [flat, siteCategoryFilter, sites],
  )
  // Théo p.6 : par défaut on ne montre que les entités actionnables ; SPV, cédées,
  // homonymes et bruit sont regroupés dans l'onglet secondaire "Autres entités".
  const { actionable, others } = useMemo(() => splitEntitiesByActionable(filtered), [filtered])
  const activeEntities = tab === 'others' ? others : actionable
  const rows = useMemo(
    () => buildEntityRows(activeEntities, matchingSites, knownRegions),
    [activeEntities, matchingSites, knownRegions],
  )
  const unconfirmedCount = useMemo(() => filtered.filter(entity => entity.source === 'web').length, [filtered])
  const visibleRows = showAll ? rows : rows.slice(0, COLLAPSED_ROW_COUNT)

  if (flat.length === 0) return null

  return (
    <Card className="overflow-hidden p-0 [--card-spacing:0px]">
      <Box
        display="flex"
        className="flex-wrap items-center justify-between gap-3 border-b border-[var(--bellum-border)] px-5 py-4"
      >
        <Box>
          <Box display="flex" className="items-center gap-2">
            <Text size="base" weight="semibold">
              {t('entitiesCard.title')}
            </Text>
            <Info className="size-4 text-[var(--bellum-text-muted)]" />
          </Box>
          <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {tab === 'others' ? t('entitiesCard.othersDescription') : t('entitiesCard.actionableDescription')}
          </Text>
          {/* #4327.1 — UN total, et ce que chaque nombre compte : les onglets disent « Actionnables (5) » et
              « Autres (32) », ce total dit « 37 entités connues » — plus deux chiffres sans légende. */}
          {others.length > 0 ? (
            <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]" data-testid="entities-total">
              {t('entitiesCard.totalNote', {
                total: filtered.length,
                actionable: actionable.length,
                others: others.length,
              })}
            </Text>
          ) : null}
          {unconfirmedCount > 0 ? (
            <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]" data-testid="entities-unconfirmed">
              {t('entitiesCard.unconfirmedNote', { count: unconfirmedCount })}
            </Text>
          ) : null}
          {/* La phrase qui empêche de lire la colonne de droite comme un
              inventaire : aucune source ne rattache un site à une entité. */}
          <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
            {t('entitiesCard.siteCountNote')}
          </Text>
        </Box>
        <Box display="flex" className="shrink-0 items-center gap-2">
          {others.length > 0 ? (
            <EntityTabSwitcher
              tab={tab}
              actionableCount={actionable.length}
              othersCount={others.length}
              onChange={next => {
                setTab(next)
                setShowAll(false)
              }}
            />
          ) : null}
          <EntityViewSwitcher view={view} onChange={setView} />
        </Box>
      </Box>

      {view === 'map' ? (
        <EntityFlowGraph entities={activeEntities} />
      ) : (
        <>
          {/* #4327.2 — `table-fixed` + parts : le tableau tient dans son conteneur (cf. `/contacts`, #4503.3). */}
          <Table className={ENTITIES_TABLE_SHELL}>
            <TableHeader>
              <TableRow className="border-[var(--bellum-border)]">
                <TableHead
                  className={cn(entitiesColumnClass('entity'), 'px-5 text-xs text-[var(--bellum-text-secondary)]')}
                >
                  {t('entitiesCard.colEntity')}
                </TableHead>
                <TableHead
                  className={cn(entitiesColumnClass('location'), 'px-5 text-xs text-[var(--bellum-text-secondary)]')}
                >
                  {t('entitiesCard.colLocation')}
                </TableHead>
                <TableHead
                  className={cn(entitiesColumnClass('potential'), 'px-5 text-xs text-[var(--bellum-text-secondary)]')}
                >
                  {t('entitiesCard.colPotential')}
                </TableHead>
                <TableHead
                  className={cn(
                    entitiesColumnClass('siteCount'),
                    'px-5 text-xs text-[var(--bellum-text-secondary)] text-right',
                  )}
                >
                  {t('entitiesCard.colSiteCount')}
                </TableHead>
                <TableHead
                  className={cn(
                    entitiesColumnClass('actions'),
                    'px-5 text-xs text-[var(--bellum-text-secondary)] text-right',
                  )}
                >
                  {t('entitiesCard.colActions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.length > 0 ? (
                visibleRows.map(row => (
                  <EntitySiteRow
                    key={row.entity.id}
                    row={row}
                    signal={matchPerimeterSignal(row.entity.name, priorityPerimeters)}
                    isTarget={targetPerimeter != null && sameName(targetPerimeter, row.entity.name)}
                    expanded={expandedRowId === row.entity.id}
                    onToggleDetails={() =>
                      setExpandedRowId(current => (current === row.entity.id ? null : row.entity.id))
                    }
                    onChooseTarget={onChooseTarget}
                    onClearTarget={onClearTarget}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="px-5 py-8">
                    <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                      {tab === 'others' ? t('entitiesCard.othersEmpty') : t('entitiesCard.actionableEmpty')}
                    </Text>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {rows.length > COLLAPSED_ROW_COUNT ? (
            <Box className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--bellum-border)] px-5 py-3">
              {/* #4612.3 — « 5 sur 12 affichées » collé au bouton : le total est la longueur RÉELLE de la liste
                  (jamais un « 0 » ni un total deviné), lisible sans déplier. */}
              <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="entities-shown-count">
                {showAll
                  ? t('entitiesCard.allShown', { count: rows.length })
                  : t('entitiesCard.shownOfTotal', { shown: visibleRows.length, total: rows.length })}
              </Text>
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0 text-[var(--bellum-text-primary)] hover:text-[var(--bellum-text-primary)]"
                onClick={() => setShowAll(value => !value)}
              >
                {showAll ? t('entitiesCard.collapse') : t('entitiesCard.showAll')}
                <ArrowRight className={cn('size-4 transition-transform', showAll && '-rotate-90')} />
              </Button>
            </Box>
          ) : null}
        </>
      )}
      {/* CEDRIC-FIX C.6 — la liste vient de la recherche et n'est plafonnée nulle part à l'écran : une
          filiale connue que la source ne rend pas (SAFRAN SEATS pour le groupe Safran) se TAPE ici et
          pré-remplit /search, comme le bouton « Analyser » d'une ligne. */}
      <form
        className="flex flex-wrap items-center gap-2 border-t border-[var(--bellum-border)] px-5 py-3"
        onSubmit={event => {
          event.preventDefault()
          const name = typedEntity.trim()
          if (name) void navigate({ to: '/search', search: { company: name } })
        }}
      >
        <Input
          value={typedEntity}
          onChange={event => setTypedEntity(event.target.value)}
          aria-label={t('entitiesCard.typedEntityAria')}
          placeholder={t('entitiesCard.typedEntityPlaceholder')}
          className="h-9 min-w-48 max-w-sm flex-1"
        />
        <Button type="submit" size="sm" variant="outline" disabled={typedEntity.trim().length === 0}>
          {t('entitiesCard.typedEntityCta')}
        </Button>
      </form>
    </Card>
  )
}

type EntitySiteRowModel = {
  entity: GraphEntity
  /** `null` = on ne sait pas placer cette entité. Ce n'est PAS zéro site. */
  count: number | null
}

function EntityTabSwitcher({
  tab,
  actionableCount,
  othersCount,
  onChange,
}: {
  tab: EntityTab
  actionableCount: number
  othersCount: number
  onChange: (tab: EntityTab) => void
}) {
  const { t } = useTranslation('accountOrg')
  return (
    <Box
      display="flex"
      role="tablist"
      aria-label={t('entitiesCard.tabsAria')}
      className="items-center gap-1 rounded-lg border border-[var(--bellum-border)] p-0.5"
    >
      <TabButton active={tab === 'actionable'} onClick={() => onChange('actionable')}>
        {t('entitiesCard.tabActionable', { count: actionableCount })}
      </TabButton>
      <TabButton active={tab === 'others'} onClick={() => onChange('others')}>
        {t('entitiesCard.tabOthers', { count: othersCount })}
      </TabButton>
    </Box>
  )
}

/**
 * #2966 (#2119.64) — le toggle Liste/Carte. MÊME patron que
 * `EntityTabSwitcher` juste au-dessus (paire de boutons `role="tab"`) : un
 * second mécanisme de bascule aurait été un réglage de plus pour la même
 * question (GA-26).
 */
function EntityViewSwitcher({ view, onChange }: { view: EntityView; onChange: (view: EntityView) => void }) {
  const { t } = useTranslation('accountOrg')
  return (
    <Box
      display="flex"
      role="tablist"
      aria-label={t('entitiesCard.viewTabsAria')}
      className="items-center gap-1 rounded-lg border border-[var(--bellum-border)] p-0.5"
    >
      <TabButton active={view === 'list'} onClick={() => onChange('list')}>
        {t('entitiesCard.viewList')}
      </TabButton>
      <TabButton active={view === 'map'} onClick={() => onChange('map')}>
        {t('entitiesCard.viewMap')}
      </TabButton>
    </Box>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
          : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
      )}
    >
      {children}
    </button>
  )
}

/** Casse + diacritiques pliés — même vocabulaire que `matchPerimeterSignal`. */
function sameName(a: string, b: string): boolean {
  const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  return fold(a) === fold(b)
}

const SCOPE_KIND_BADGE_VARIANT: Record<ScopeKind, 'default' | 'outline' | 'warning'> = {
  commercial: 'default',
  implantation: 'outline',
  equipe: 'warning',
}

function EntitySiteRow({
  row,
  signal,
  isTarget,
  expanded,
  onToggleDetails,
  onChooseTarget,
  onClearTarget,
}: {
  row: EntitySiteRowModel
  signal: PriorityPerimeterSignal | null
  isTarget: boolean
  expanded: boolean
  onToggleDetails: () => void
  onChooseTarget?: (name: string) => void
  onClearTarget?: () => void
}) {
  const { t } = useTranslation('accountOrg')
  const navigate = useNavigate()
  const style = styleForType(row.entity.type)
  // i18n keys: entityType.groupe | filiale | bu | direction | departement | jv | gie | siege_regional |
  // operational | marque | filiale_strategique | spv | cedee | homonyme | bruit | unknown | equipe
  // #4327.2 — une filiale dont le lien n'est pas celui du registre s'étiquette « Filiale non confirmée », jamais « Filiale » nu.
  const typeKey = normaliseTypeKey(row.entity.type)
  const typeLabel = t(
    typeKey === 'filiale' && row.entity.source !== 'registry'
      ? 'entityType.filialeUnconfirmed'
      : `entityType.${typeKey}`,
  )
  const rowCellClass =
    'px-5 py-2.5 transition-colors group-hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)]'
  return (
    <>
      <TableRow
        className={cn(
          'group border-[var(--bellum-border)]',
          isTarget &&
            'bg-[var(--bellum-primary-50)] dark:bg-[color-mix(in_srgb,var(--bellum-primary-500)_10%,transparent)]',
        )}
      >
        <TableCell className={rowCellClass}>
          {/* #2966 (#2119.27) — LA HIÉRARCHIE, ENFIN LUE. `GraphEntity.level` est
              calculé depuis longtemps (`entityData.ts::resolveLevels`) et jamais
              affiché : un retrait de 16px par niveau donne une lecture claire du
              périmètre sans reconstruire un arbre visuel entier. */}
          <Box
            display="flex"
            className="min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
            style={{ paddingLeft: `${Math.min(row.entity.level, 4) * 16}px` }}
          >
            {/* #1181 — « dois-je lancer une nouvelle analyse pour creuser une
                filiale, par exemple SAFRAN SEATS ? ». La réponse est oui, et la
                capacité existait déjà : `/search` accepte une société pré-remplie.
                Ce qui manquait était la PORTE — cette ligne n'avait ni `onClick`,
                ni lien, ni bouton, si bien que le nom lu à l'écran était du texte
                mort et que la seule issue était de le RETAPER ailleurs.

                Un vrai `<button>`, pas la ligne entière rendue cliquable : ce qui
                se clique se tabule (GA-35), et la ligne porte à droite une MESURE,
                qui n'a pas à déclencher une action. La couleur d'accent et la
                flèche disent l'offre sans survol — un repère qui n'apparaît qu'au
                pointeur ne corrige pas du texte qu'on croyait mort. Le nom
                accessible porte le VERBE (« Analyser X ») tout en contenant le nom
                visible, pour rester atteignable à la commande vocale. */}
            <button
              type="button"
              aria-label={t('entitiesCard.analyseEntity', { name: row.entity.name })}
              title={t('entitiesCard.analyseEntityHint')}
              onClick={() => void navigate({ to: '/search', search: { company: row.entity.name } })}
              className="flex min-w-0 items-center gap-3 rounded-lg text-left underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              <Box className={cn('flex size-5 shrink-0 items-center justify-center rounded-full', style.badge)}>
                <Building2 className="size-3" />
              </Box>
              <Text element="span" size="sm" weight="semibold" color="text-[var(--bellum-text-accent)]">
                {row.entity.name}
              </Text>
              <ArrowRight className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
            </button>
            {/* #4327.2 — un rattachement non confirmé se NOMME sur la ligne (pas seulement sous « Détails ») :
                ni arrondi en certitude, ni omis. */}
            {row.entity.source === 'web' ? (
              <Badge variant="warning" className="shrink-0 text-xs">
                {t('entitiesCard.unconfirmedBadge')}
              </Badge>
            ) : null}
            {/* #4327.2 — D'OÙ vient le lien déduit : la page qui nomme la filiale, sinon « le web » (jamais inventée). */}
            {row.entity.source === 'web' ? (
              <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                {row.entity.sourceHost
                  ? t('entitiesCard.unconfirmedFrom', { host: row.entity.sourceHost })
                  : t('entitiesCard.unconfirmedFromWeb')}
              </Text>
            ) : null}
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                style.badge,
              )}
            >
              {typeLabel}
            </span>
            {/* #2966 (#2119.36-38) — la distinction périmètre commercial /
                implantation / équipe, nommée sur la ligne. */}
            <Badge variant={SCOPE_KIND_BADGE_VARIANT[row.entity.scopeKind]} className="shrink-0 text-xs">
              {t(`entitiesCard.scopeKind.${row.entity.scopeKind}`)}
            </Badge>
            {isTarget ? (
              <Badge variant="success" className="shrink-0 gap-1 text-xs">
                <Target className="size-3" aria-hidden />
                {t('entitiesCard.targetActive')}
              </Badge>
            ) : null}
            <button
              type="button"
              onClick={onToggleDetails}
              aria-expanded={expanded}
              className="ml-auto flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11"
            >
              {expanded ? t('entitiesCard.hideDetails') : t('entitiesCard.showDetails')}
              <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
            </button>
          </Box>
        </TableCell>
        {/* #2966 (#2119.43) — pays/ville : le champ prose que le moteur écrit
            déjà (`region`), jamais rendu jusqu'ici — voir la doc de
            `buildEntityRows` pour pourquoi il ne recoupe pas toujours les sites. */}
        <TableCell className={cn(rowCellClass, 'break-words')}>
          <Text element="span" size="sm" color="text-[var(--bellum-text-secondary)]">
            <MeasuredValue value={row.entity.region} reason={t('entitiesCard.locationUnknownReason')} />
          </Text>
        </TableCell>
        {/* #2966 (#2119.47) — potentiel : le PALIER (P1/P2/secondaire) du score
            /20 déjà calculé par `perimeter_score.py`, jamais une probabilité. */}
        <TableCell className={rowCellClass}>
          {signal ? (
            <Badge variant={signal.tier === 'P1' ? 'success' : signal.tier === 'P2' ? 'primary' : 'default'}>
              {t(`entitiesCard.tier.${signal.tier}`)}
            </Badge>
          ) : (
            <UnknownValue discreet reason={t('entitiesCard.potentialUnknownReason')} />
          )}
        </TableCell>
        <TableCell className={cn(rowCellClass, 'text-right')}>
          {/* « 0 » se lisait « France.tv n'a aucun site » sur un compte qui en
              affiche 63 juste au-dessus. La vérité est qu'aucune source ne
              rattache un site à une entité — voir `buildEntityRows`. */}
          <Text element="span" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            <MeasuredValue value={row.count} />
          </Text>
        </TableCell>
        <TableCell className={cn(rowCellClass, 'text-right')}>
          {/* #2966 (#2119.52) — « Choisir ce périmètre comme cible » : préfiltre
              Personnes/Écosystème/Plan/Laura (voir `TabSites.tsx`). */}
          {onChooseTarget ? (
            isTarget ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={X}
                className="h-auto min-h-8 whitespace-normal text-left"
                onClick={() => onClearTarget?.()}
              >
                {t('entitiesCard.clearTarget')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="light"
                size="sm"
                icon={Target}
                className="h-auto min-h-8 whitespace-normal text-left"
                onClick={() => onChooseTarget(row.entity.name)}
              >
                {t('entitiesCard.chooseTarget')}
              </Button>
            )
          ) : null}
        </TableCell>
      </TableRow>
      {expanded ? <EntityDetailRow row={row} signal={signal} /> : null}
    </>
  )
}

/**
 * #2966 (#2119.44-51) — les attributs restants de la carte de périmètre :
 * rôle, source, confiance, accessibilité, signaux, contacts. Repliés par
 * défaut (GA-28/29/30 — une table à onze colonnes casse le mobile) et NOMMÉS
 * un par un, jamais un bloc muet quand `signal` est `null` : « non mesuré »
 * reste la réponse honnête (doctrine, « on n'affiche pas ce qu'on n'a pas »
 * porte sur les LISTES, pas sur les axes d'un score/une fiche).
 */
function EntityDetailRow({ row, signal }: { row: EntitySiteRowModel; signal: PriorityPerimeterSignal | null }) {
  const { t } = useTranslation('accountOrg')
  return (
    <TableRow className="border-[var(--bellum-border)] bg-[var(--bellum-bg)]">
      <TableCell colSpan={5} className="px-5 py-4">
        <Box display="grid" className="grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <DetailField label={t('entitiesCard.colRole')} value={signal?.entryRole || null} />
          <DetailField label={t('entitiesCard.colSource')} value={t(`entitiesCard.source.${row.entity.source}`)} />
          <DetailField
            label={t('entitiesCard.colConfidence')}
            value={signal ? t(`entitiesCard.confidence.${signal.confidence}`) : null}
          />
          <DetailField
            label={t('entitiesCard.colAccessibility')}
            value={signal ? t(`entitiesCard.accessibility.${signal.accessibility}`) : null}
          />
          {/* #2966 (#2119.49) — signaux : le nombre d'offres identifiées pour ce
              périmètre (`whatToSell`), la mesure la plus proche que l'analyse
              porte à ce niveau — jamais le nombre de sites, mesuré à côté. */}
          <DetailField
            label={t('entitiesCard.colSignals')}
            value={signal ? <MeasuredValue value={signal.signalsCount} /> : null}
          />
          {/* #2966 (#2119.50) — contacts : AUCUNE source ne rattache un contact à
              une entité aujourd'hui (`packages/contracts/src/schemas/contact.ts`
              porte `entity` en texte libre, jamais vérifié contre ce périmètre) —
              nommé « non mesuré », jamais un compte inventé. */}
          <DetailField label={t('entitiesCard.colContacts')} value={null} />
        </Box>
      </TableCell>
    </TableRow>
  )
}

function DetailField({ label, value }: { label: string; value: ReactNode | null }) {
  const { t } = useTranslation('accountOrg')
  return (
    <div className="min-w-0">
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      {value !== null ? (
        <Text size="sm" weight="medium" className="mt-0.5" color="text-[var(--bellum-text-primary)]">
          {value}
        </Text>
      ) : (
        <UnknownValue className="mt-0.5" reason={t('entitiesCard.attributeUnknownReason')} />
      )}
    </div>
  )
}

/**
 * Combien de sites pour cette entité — ou l'aveu qu'on n'en sait rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE COLONNE PEUT ET NE PEUT PAS DIRE
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 27/08/2026 : FRANCE TELEVISIONS affiche **63 sites**
 * dans la liste du haut et ses 5 entités affichaient toutes `0` ; LVMH affiche
 * 1 site et ses 3 entités affichaient `0`. « France.tv a 0 site » est faux.
 *
 * La cause est structurelle et non un calcul raté : **aucune source ne rattache
 * un site à une entité.** Il n'existe ni `entity_id` sur un site, ni `site_id`
 * sur une entité, et rien dans le pipeline ne les écrit. Le seul lien possible
 * est un rapprochement par RÉGION, entre deux vocabulaires qui ne sont pas le
 * même :
 *
 *   - la région d'un SITE est dérivée chez nous (`siteGeo`), d'un code postal
 *     ou d'une ville, donc c'est toujours une région administrative française ;
 *   - la région d'une ENTITÉ est un champ de prose écrit par le modèle — la
 *     consigne du prompt dit littéralement « zone geo ». Relevé en production
 *     sur ce même compte : « France », « Paris », « Paris, siège ».
 *
 * « Paris » n'est pas « Île-de-France », donc le rapprochement échouait sur
 * toutes les lignes, et l'échec s'écrivait `0`.
 *
 * La règle appliquée ici : on ne compte QUE si la région de l'entité appartient
 * au vocabulaire que la liste des sites emploie (`knownRegions`). Sinon la
 * réponse est `null` — « non mesuré » —, jamais zéro. Dans ce vocabulaire, en
 * revanche, un zéro est VRAI : l'entité est dans une région où le compte a des
 * sites, mais aucun de la catégorie affichée.
 *
 * ⚠️ Ne pas « corriger » ce zéro en écrivant un rattachement quelque part : ce
 * serait inventer une donnée que personne n'a collectée.
 */
function buildEntityRows(
  entities: GraphEntity[],
  sites: SiteRow[],
  knownRegions: ReadonlySet<string>,
): EntitySiteRowModel[] {
  return entities
    .map(entity => ({
      entity,
      count:
        entity.region && knownRegions.has(entity.region)
          ? sites.filter(site => site.region === entity.region).length
          : null,
    }))
    .sort((a, b) => rank(b.count) - rank(a.count) || a.entity.name.localeCompare(b.entity.name))
}

/** Une entité non plaçable passe DERRIÈRE un zéro mesuré : elle n'affirme rien,
 *  elle ne mérite donc pas le haut de la liste. */
function rank(count: number | null): number {
  return count ?? -1
}

function filterSitesByCategory(sites: SiteRow[], category: SiteViewMode) {
  if (category === 'all') return sites
  return sites.filter(site => siteCategory(site) === category)
}
