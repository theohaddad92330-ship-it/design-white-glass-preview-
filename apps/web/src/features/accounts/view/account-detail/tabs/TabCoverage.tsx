import type { Account, CoverageGap, CoverageLevel, CoverageLevelStatus } from '@bellum/contracts'
import { isResidualRoleFamily } from '@bellum/contracts'
import { Badge, Button, Card, CardContent, EmptyState, HORIZONTAL_OVERSCROLL_CLASS, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Layers,
  Loader2,
  Radar,
  ShieldAlert,
  Telescope,
  UserSearch,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCoverageGaps } from '@/features/accounts/hooks/useCoverageGaps'
import { useEnrichContacts } from '@/features/accounts/hooks/useEnrichAccount'
import type { TabId } from '../components/AccountDetailTabsBar'
import { cardFade, stagger } from '../motion'
import { ConfidenceBreakdown } from './coverage/ConfidenceBreakdown'
import { buildCoverageGrid, type CoverageCellStatus, type CoverageGridRow } from './coverage/coverageGrid'
import { gapSearchQuery } from './coverage/gapSearch'
import { buildMissingAxes } from './coverage/missingAxes'
import { namesSummary } from './coverage/namesSummary'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'

type TabCoverageProps = {
  account: Account
  onTabChange: (tab: TabId) => void
  /** Hands a zone blanche's target title to the account's EXISTING contacts
   *  search (tab Contacts) so the rep lands on the people to find/enrich.
   *  Omitted → the gaps render read-only. */
  onFindContact?: (query: string) => void
}

/** Priority (1 = most urgent) → Badge variant for the zone-blanche pills. */
function priorityVariant(priority: number): 'danger' | 'warning' | 'info' {
  if (priority <= 1) return 'danger'
  if (priority === 2) return 'warning'
  return 'info'
}

/** 0..1 coverage score → the CSS colour var driving the meter fill. */
function scoreColorVar(pct: number): string {
  if (pct >= 66) return 'var(--bellum-success)'
  if (pct >= 34) return 'var(--bellum-warning)'
  return 'var(--bellum-danger)'
}

/**
 * « Zones blanches » (Drive backlog #5) — surfaces the account's decision-coverage
 * map (server-computed from its existing contacts, never invented): which families
 * & hierarchy levels are engaged, and the prioritized blind spots to open. Presents
 * only what the endpoint returns; empty / no-contact / error states are explicit.
 */
export function TabCoverage({ account, onTabChange, onFindContact }: TabCoverageProps) {
  const { t } = useTranslation('accountDetail', { keyPrefix: 'coverage' })
  const { t: tCommon } = useTranslation('common')
  const { data, isLoading, isError } = useCoverageGaps(account.id)
  // Rerun partiel par case (annexe organigramme §6) : la zone blanche affichée
  // déclenche la recherche de CETTE famille × CE niveau. Une seule mutation
  // partagée — `runningGap` dit laquelle des cases tourne, pour n'animer que son
  // bouton et interdire deux relances concurrentes.
  const enrichContacts = useEnrichContacts(account.id)
  const [runningGap, setRunningGap] = useState<string | null>(null)
  // Scope ENTITÉ de la matrice (maquette p19) : `null` = vue groupe. Une famille
  // couverte au niveau du groupe peut rester une zone blanche dans une filiale —
  // c'est la question « quelle entité viser ? » du rapport p32.
  const [entityScope, setEntityScope] = useState<string | null>(null)
  // #2308.45 — filtre OBJECTIF de la matrice : familles CIBLE (comptent pour la
  // largeur stratégique, `family.is_target`) vs. familles SUPPORT (affichées en
  // bonus, jamais un trou à ouvrir). `null` = les deux.
  const [objectiveScope, setObjectiveScope] = useState<'target' | 'support' | null>(null)

  /** Relance la découverte contacts sur UNE case famille × niveau. Partagée par la
   *  matrice et la liste des zones blanches — un seul rerun à la fois. */
  const runGapSearch = (family: string, level: CoverageLevel): void => {
    const gapKey = `${family}:${level}`
    setRunningGap(gapKey)
    enrichContacts.mutate({ family, level }, { onSettled: () => setRunningGap(null) })
  }

  if (isLoading) {
    return (
      <div className="space-y-4 py-4" aria-busy="true" aria-label={t('loading')}>
        <div className="h-32 animate-pulse rounded-xl bg-[var(--bellum-surface-2)]" />
        <div className="h-40 animate-pulse rounded-xl bg-[var(--bellum-surface-2)]" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <motion.div variants={cardFade} initial="hidden" animate="visible" className="py-4">
        <EmptyState
          size="md"
          align="center"
          icon={<AlertTriangle className="size-12 text-[var(--warning-soft-text)]" />}
          title={t('loadErrorTitle')}
          description={t('loadErrorDescription')}
        />
      </motion.div>
    )
  }

  // No contacts yet → the coverage map is not meaningful. Point back to discovery.
  if (data.contacts_total === 0) {
    return (
      <motion.div variants={cardFade} initial="hidden" animate="visible" className="py-4">
        <EmptyState
          size="md"
          align="center"
          icon={<UserSearch className="size-12 text-[var(--bellum-text-secondary)]" />}
          title={t('noContactsTitle')}
          description={t('noContactsDescription')}
          action={
            <Button size="sm" variant="default" onClick={() => onTabChange('contacts')} className="gap-2">
              <Users className="size-4" />
              {t('openInContacts')}
            </Button>
          }
        />
      </motion.div>
    )
  }

  const pct = Math.round(data.score * 100)
  const missingAxes = buildMissingAxes(data)
  // Target families always shown; support families only when actually covered.
  const grid = buildCoverageGrid(data, entityScope ?? undefined)
  // #2308.45 — filtre OBJECTIF : n'affecte QUE la matrice (carte de couverture),
  // jamais les zones blanches ci-dessous (ordre déjà fixé par le serveur, priorité).
  const hasSupportRows = grid.some(row => !row.isTarget)
  const visibleGrid =
    objectiveScope === null ? grid : grid.filter(row => (objectiveScope === 'target' ? row.isTarget : !row.isTarget))

  // Entités proposées au filtre : celles où l'on a quelqu'un, puis celles de la
  // cartographie qu'aucun contact ne nomme. Le filtre n'existe que si le serveur a
  // émis la matrice par entité — sinon il afficherait une entité vide alors que
  // c'est la DONNÉE qui manque, pas la couverture.
  const coveredEntities = data.entities_covered_names ?? []
  const uncoveredEntities = data.entities_uncovered_names ?? []
  // Ce que la cartographie portait et qui n'est PAS une entité — aujourd'hui,
  // des personnes. Le serveur les sort du ratio ; l'écran DIT lesquelles, sans
  // quoi le dénominateur aurait changé sans que personne ne puisse l'expliquer.
  const excludedEntities = data.entities_excluded_names ?? []
  const canScopeByEntity = data.entity_cells !== undefined && coveredEntities.length + uncoveredEntities.length > 0
  const missingRoles = data.roles_missing ?? []
  // #4324.1 — « non identifié » dit POURQUOI : aucun contact ne tient le rôle (rôle posé ; pour le siège technique,
  // ni intitulé reconnu comme DSI ou RSSI). Sans contact, l'écran montre déjà son état vide : rien à ajouter ici.
  const rolesMissingReason =
    missingRoles.length === 0
      ? undefined
      : [
          t('rolesStatReason.noRoleSet', { count: data.contacts_total }),
          missingRoles.includes('technical') ? t('rolesStatReason.technicalTitles') : null,
        ]
          .filter(Boolean)
          .join(' ')
  // #1610 — calculées côté service depuis #1579 (mémoire marché), jamais lues
  // ici jusqu'à ce lot. Une TROISIÈME nature de preuve : absent, sous le
  // seuil, ou mémoire en panne se rendent PAREIL — le bloc n'apparaît pas,
  // comme les ESN observées de l'onglet Partenaires.
  // #4322.1 — « Autre » (le résiduel) n'est pas un métier et ne s'écrit qu'une fois : « Autres intitulés », dans le
  // contexte du dossier (GA-26). Ici seules les familles nommées.
  const marketRoleFamilies = (data.market_role_families_observed ?? []).filter(
    entry => !isResidualRoleFamily(entry.family),
  )

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6 py-4">
      {/* Header: intent + score meter + key ratios */}
      <motion.div variants={cardFade}>
        <Card>
          <CardContent className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-surface-2)]">
                <Radar className="size-5 text-[var(--bellum-text-secondary)]" />
              </div>
              <div className="min-w-0">
                <Text element="h2" size="base" weight="semibold">
                  {t('title')}
                </Text>
                <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-1 max-w-2xl">
                  {t('subtitle')}
                </Text>
              </div>
            </div>

            <div className="w-full min-w-56 lg:w-64">
              <div className="flex items-baseline justify-between gap-2">
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('scoreLabel')}
                </Text>
                <Text size="lg" weight="semibold" className="font-mono">
                  {pct}%
                </Text>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bellum-surface-2)]">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, backgroundColor: scoreColorVar(pct) }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t('scoreLabel')}
                />
              </div>
              <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1.5">
                {t('scoreHint')}
              </Text>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* #2121.48 — les DIX axes de « qui nous manque », chacun avec son état.
          Placés sous la question, avant les chiffres : c'est la réponse qu'on
          vient chercher. Un axe non mesuré le DIT, avec sa raison au survol. */}
      <motion.div variants={cardFade}>
        <Card>
          <CardContent className="p-5">
            <Text element="h3" size="sm" weight="semibold">
              {t('missingAxes.title')}
            </Text>
            <ul aria-label={t('missingAxes.aria')} className="mt-3 grid gap-2 sm:grid-cols-2">
              {missingAxes.map(axis => (
                <li
                  key={axis.key}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
                >
                  <span className="min-w-0">
                    <Text size="sm" className="min-w-0">
                      {t(`missingAxes.axes.${axis.key}`)}
                    </Text>
                    {/* #4324.1 — un référent technique manquant dit POURQUOI (collecte ou niveau) ; jamais un motif deviné. */}
                    {axis.key === 'technicalReferent' && axis.state === 'missing' && data.technical_gap ? (
                      <Text data-testid="technical-gap-reason" size="xs" color="text-[var(--bellum-text-secondary)]">
                        {data.technical_gap.reason === 'no_it_contact'
                          ? t('missingAxes.technicalGap.noItContact')
                          : t('missingAxes.technicalGap.itBelowDirector', { count: data.technical_gap.it_contacts })}
                      </Text>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {axis.key === 'technicalReferent' && axis.state === 'missing' && data.technical_gap ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        type="button"
                        className="pointer-coarse:min-h-11"
                        disabled={enrichContacts.isPending}
                        onClick={() => runGapSearch('it', 'n1')}
                      >
                        {t('missingAxes.technicalGap.findCta')}
                      </Button>
                    ) : null}
                    {axis.key === 'nextAction' ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        type="button"
                        className="pointer-coarse:min-h-11"
                        onClick={() => onTabChange('plan')}
                      >
                        {t('missingAxes.openPlan')}
                      </Button>
                    ) : null}
                    <Badge
                      variant={axis.state === 'covered' ? 'success' : axis.state === 'missing' ? 'warning' : 'outline'}
                      title={
                        axis.state !== 'unmeasured'
                          ? undefined
                          : axis.key === 'nextAction'
                            ? t('missingAxes.nextActionHint')
                            : t('missingAxes.unmeasuredHint')
                      }
                    >
                      {t(`missingAxes.states.${axis.state}`)}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* Les 4 chiffres de la maquette p33 : couverture, entités, rôles, confiance.
          Chacun porte SON dénominateur — c'est ce qui manquait quand « 9 contacts »
          et « 0 famille couverte » se contredisaient sans qu'on sache pourquoi. */}
      <motion.div variants={cardFade} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatPill
          label={t('engagedContacts')}
          value={`${data.classified_contacts}`}
          // Une cible DÉPASSÉE cesse d'être une cible. Un grand compte affichait
          // « 1938 sur 12 visés », ce qui se lit comme une erreur d'affichage
          // plutôt que comme un succès : le repère qui reste utile est alors le
          // nombre de contacts dans une famille cible, pas un objectif franchi
          // cent fois.
          hint={
            data.target_family_contacts === undefined
              ? t('engagedContactsHint', { target: data.target_contacts })
              : data.classified_contacts >= data.target_contacts
                ? t('engagedContactsReached', { inTargetFamilies: data.target_family_contacts })
                : t('engagedContactsSplit', {
                    target: data.target_contacts,
                    inTargetFamilies: data.target_family_contacts,
                  })
          }
        />
        {data.entities_total !== undefined && data.entities_total > 0 && (
          <StatPill
            label={t('entitiesStat')}
            // #2091 — `entities_covered` est optionnel INDÉPENDAMMENT de
            // `entities_total` (coverage.ts:136) : « 0/7 » dirait « aucune
            // entité couverte » quand c'est le numérateur qui n'a pas été
            // calculé. Le nommer, jamais l'absorber dans un 0.
            value={`${data.entities_covered ?? tCommon('unknownValue')}/${data.entities_total}`}
            // La maquette p19 NOMME les entités couvertes : « 2/7 » sans les noms
            // ne dit pas au commercial où il est déjà entré.
            // L'énumération est BORNÉE. Sur un grand compte, les contacts nomment
            // quarante entités : la carte les déversait toutes en prose et faisait
            // huit fois la hauteur de ses voisines, pour une information que
            // personne ne lit. Le reste n'est pas caché, il est compté.
            hint={
              coveredEntities.length > 0
                ? t('entitiesStatHintNames', {
                    names: namesSummary(coveredEntities, count => t('entitiesMore', { count })),
                  })
                : t('entitiesStatHint')
            }
            subHint={
              uncoveredEntities.length > 0
                ? t('entitiesStatHintUncovered', {
                    names: namesSummary(uncoveredEntities, count => t('entitiesMore', { count })),
                  })
                : undefined
            }
            note={
              excludedEntities.length > 0
                ? t('entitiesStatExcluded', {
                    names: namesSummary(excludedEntities, count => t('entitiesMore', { count })),
                  })
                : undefined
            }
          />
        )}
        {data.roles_target !== undefined && (
          <StatPill
            label={t('rolesStat')}
            // #2091 — même défaut que les entités : le numérateur est optionnel
            // indépendamment de la cible.
            value={`${data.roles_covered ?? tCommon('unknownValue')}/${data.roles_target}`}
            // « 4/8 » sans le détail ne dit pas QUI manque (p19 : « achats absent »).
            hint={
              missingRoles.length > 0
                ? t('rolesStatHintMissing', {
                    roles: missingRoles.map(role => t(`committeeRoles.${role}`, { defaultValue: role })).join(', '),
                  })
                : t('rolesStatHint')
            }
            // #4324.1 — « non identifié » dit POURQUOI : aucun contact collecté, ou aucun contact qui tient le rôle
            // (rôle posé ; pour le siège technique, ni intitulé reconnu comme DSI ou RSSI). Jamais un motif deviné.
            note={rolesMissingReason}
            noteTestId="roles-missing-reason"
          />
        )}
        {data.confidence && (
          <StatPill label={t('confidenceStat')} value={`${data.confidence.score}/100`} hint={t('confidenceStatHint')} />
        )}
        <StatPill label={t('championsStat')} value={`${data.champion_count}`} hint={t('championsStatHint')} />
        <StatPill
          label={t('familiesStat')}
          value={`${data.families_covered}`}
          hint={t('familiesStatHint', { target: data.families_target })}
        />
        <StatPill
          label={t('levelsStat')}
          value={`${data.levels_covered}`}
          hint={t('levelsStatHint', { target: data.levels_target })}
        />
      </motion.div>

      {/* Le POURQUOI de la tuile « Confiance donnée » : la moyenne seule ne dit
          pas quoi corriger. Rendu uniquement quand le serveur l'a calculée. */}
      {data.confidence && (
        <motion.div variants={cardFade}>
          <ConfidenceBreakdown confidence={data.confidence} />
        </motion.div>
      )}

      {/* Single-champion dependency warning (Théo: ZERO single-champion risk) */}
      {data.single_champion_risk && (
        <motion.div variants={cardFade}>
          <div className="flex items-start gap-3 rounded-xl border border-[var(--bellum-warning)]/40 bg-[color-mix(in_srgb,var(--bellum-warning)_10%,transparent)] p-4">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[var(--warning-soft-text)]" />
            <div className="min-w-0">
              <Text size="sm" weight="semibold">
                {t('championRiskTitle')}
              </Text>
              <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-0.5">
                {t('championRiskDescription')}
              </Text>
            </div>
          </div>
        </motion.div>
      )}

      {/* #1885 — « replier certaines parties … pour gagner en visibilité sur la
          page ». La carte de couverture est le bloc le plus haut de l'onglet
          (trois cartes de niveau, puis une matrice familles × niveaux et sa
          légende) et c'est de la LECTURE, pas un geste : elle se replie, avec le
          patron partagé (`CollapsedSection`, GA-26 — le même qu'au tableau de
          bord et sur la vue d'ensemble).

          ⚠️ Rien de ce qui reste à l'écran ne devient faux : les tuiles
          « Familles couvertes » et « Niveaux couverts » portent DÉJÀ leur propre
          dénominateur (`familiesStatHint` / `levelsStatHint`, « sur {{target}} »),
          et la légende des cellules voyage AVEC la matrice qu'elle explique —
          l'une ne peut pas rester seule à l'écran sans l'autre. */}
      <CollapsedSection title={t('mapSectionTitle')} description={t('mapSectionDescription')}>
        <Card>
          <CardContent className="space-y-6 p-5">
            <SectionHeading
              icon={<Layers className="size-4 text-[var(--bellum-text-secondary)]" />}
              title={t('levelsSectionTitle')}
              description={t('levelsSectionDescription')}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {data.levels.map(level => (
                <LevelCard key={level.level} level={level} coveredLabel={t('covered')} missingLabel={t('missing')} />
              ))}
            </div>

            <div className="h-px bg-[var(--bellum-border)]" />

            <SectionHeading
              icon={<Users className="size-4 text-[var(--bellum-text-secondary)]" />}
              title={t('familiesSectionTitle')}
              description={t('familiesSectionDescription')}
            />
            {/* Filtre ENTITÉ — l'axe manquant de la matrice (maquette p19). */}
            {canScopeByEntity && (
              <div>
                <div role="group" aria-label={t('entityScopeAria')} className="flex flex-wrap items-center gap-2">
                  <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                    {t('entityScopeLabel')}
                  </Text>
                  <EntityScopeChip
                    label={t('entityScopeAll')}
                    active={entityScope === null}
                    onSelect={() => setEntityScope(null)}
                  />
                  {coveredEntities.map(entity => (
                    <EntityScopeChip
                      key={entity}
                      label={entity}
                      active={entityScope === entity}
                      onSelect={() => setEntityScope(entity)}
                    />
                  ))}
                  {uncoveredEntities.map(entity => (
                    <EntityScopeChip
                      key={entity}
                      label={t('entityScopeUncovered', { entity })}
                      active={entityScope === entity}
                      onSelect={() => setEntityScope(entity)}
                    />
                  ))}
                </div>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-2">
                  {t('entityScopeHint')}
                </Text>
              </div>
            )}
            {/* Filtre OBJECTIF — cible vs. support (#2308.45). N'existe que s'il y a
                au moins une famille support à l'écran : sinon le bouton « Familles
                support » ouvrirait sur du vide (comme le filtre entité ci-dessus). */}
            {hasSupportRows && (
              <div role="group" aria-label={t('objectiveScopeAria')} className="flex flex-wrap items-center gap-2">
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('objectiveScopeLabel')}
                </Text>
                <EntityScopeChip
                  label={t('objectiveScopeAll')}
                  active={objectiveScope === null}
                  onSelect={() => setObjectiveScope(null)}
                />
                <EntityScopeChip
                  label={t('objectiveScopeTarget')}
                  active={objectiveScope === 'target'}
                  onSelect={() => setObjectiveScope('target')}
                />
                <EntityScopeChip
                  label={t('objectiveScopeSupport')}
                  active={objectiveScope === 'support'}
                  onSelect={() => setObjectiveScope('support')}
                />
              </div>
            )}
            <CoverageMatrix
              rows={visibleGrid}
              levels={data.levels}
              supportLabel={t('supportBadge')}
              actionColumnLabel={t('gridActionColumn')}
              actionEmptyLabel={t('gridActionEmpty')}
              actionLabel={(family, gap) =>
                t('gridActionAria', { family, level: gap.level_label, titles: gap.suggested_titles })
              }
              actionPending={gap => runningGap === `${gap.family}:${gap.level}`}
              actionDisabled={enrichContacts.isPending}
              onAction={gap => runGapSearch(gap.family, gap.level)}
              cellSearchLabel={t('gridCellSearch')}
              cellSearchAria={(family, level) => t('gridCellSearchAria', { family, level })}
              cellSearchPending={(family, level) => runningGap === `${family}:${level}`}
              onCellSearch={(family, level) => runGapSearch(family, level)}
              statusLabel={status => t(`gridStatus.${status}`)}
              cellLabel={(family, level, status) =>
                t('gridCellAria', { family, level, status: t(`gridStatus.${status}`) })
              }
              gridLabel={t('gridAria')}
            />
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('gridLegend')}
            </Text>
          </CardContent>
        </Card>
      </CollapsedSection>

      {/* Zones blanches — the actionable core.
          #1885 : elle NE se replie PAS, et c'est la moitié de la règle — ouvert
          = ce qui appelle une action. Les zones blanches sont le seul bloc de
          cet onglet qui porte des gestes (chercher le profil, relancer une
          recherche ciblée) ; les replier reviendrait à cacher le travail pour
          faire de la place à ce qu'on ne fait pas. */}
      <motion.div variants={cardFade}>
        <Card>
          <CardContent className="space-y-4 p-5">
            <SectionHeading
              icon={<Radar className="size-4 text-[var(--bellum-text-secondary)]" />}
              title={t('gapsSectionTitle')}
              description={t('gapsSectionDescription')}
            />
            {data.gaps.length === 0 ? (
              <EmptyState
                size="sm"
                align="center"
                icon={<CheckCircle2 className="size-10 text-[var(--success-soft-text)]" />}
                title={t('gapsEmptyTitle')}
                description={t('gapsEmptyDescription')}
              />
            ) : (
              <div className="space-y-3">
                {data.gaps.map((gap, index) => {
                  const gapKey = `${gap.family}:${gap.level}`
                  return (
                    <GapRow
                      key={gapKey}
                      gap={gap}
                      rank={index + 1}
                      rankLabel={t('gapRankAria', { rank: index + 1, total: data.gaps.length })}
                      nextBestLabel={index === 0 ? t('nextBestActionBadge') : undefined}
                      priorityLabel={t('priorityBadge', { priority: gap.priority })}
                      suggestedLabel={t('suggestedTitles', { titles: gap.suggested_titles })}
                      ctaLabel={t('gapSearchCta')}
                      onFindContact={onFindContact && (() => onFindContact(gapSearchQuery(gap)))}
                      rerunLabel={runningGap === gapKey ? t('gapRerunPending') : t('gapRerunCta')}
                      rerunHint={t('gapRerunHint')}
                      rerunPending={runningGap === gapKey}
                      rerunDisabled={enrichContacts.isPending}
                      onRerun={() => runGapSearch(gap.family, gap.level)}
                    />
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* #1610 — familles de rôles OBSERVÉES par la mémoire marché : une
          TROISIÈME nature de preuve, distincte des contacts propres à ce
          dossier (les cartes ci-dessus). N'entre dans AUCUN calcul de
          couverture : `coverage.score` reste STRICTEMENT le même avec ou
          sans cette carte. Le bloc n'apparaît QUE s'il y a quelque chose à
          montrer — pas de couverture, pas de corpus, mémoire en erreur se
          rendent tous PAREIL : silence, comme l'onglet Partenaires (#1579).

          #1885 — repliée par défaut : c'est un signal EXTERNE de contexte, pas
          un geste à faire ici. Le déclencheur porte son titre ET sa phrase
          (`description`, visible repliée), donc la mise en garde qui compte —
          « n'entre dans aucun calcul de couverture ci-dessus » — reste sous les
          yeux même fermée. La carte n'apparaît que s'il y a quelque chose
          dedans : jamais un en-tête qui ouvre sur du vide. */}
      {marketRoleFamilies.length > 0 && (
        <CollapsedSection title={t('marketRoleFamilies.title')} description={t('marketRoleFamilies.description')}>
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap gap-2">
                {marketRoleFamilies.map(entry => (
                  <div
                    key={entry.family}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--bellum-border)] px-3 py-1.5"
                  >
                    <Text size="sm" weight="medium">
                      {entry.family}
                    </Text>
                    <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                      {t('marketRoleFamilies.persons', { count: entry.persons })}
                    </Text>
                    {/* Le libellé imposé — jamais « Non couvert » : cette carte
                        ne dit pas qu'une famille interne manque, elle dit
                        qu'un corpus tiers a observé des rôles ici. */}
                    <Badge variant="outline" className="text-xs">
                      {t('marketRoleFamilies.label')}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </CollapsedSection>
      )}
    </motion.div>
  )
}

function StatPill({
  label,
  value,
  hint,
  subHint,
  note,
  noteTestId,
}: {
  label: string
  value: string
  hint: string
  /** Ce qu'il RESTE à faire — teinté avertissement, c'est une action. */
  subHint?: string
  /** Ce qui explique le CHIFFRE lui-même — neutre : ce n'est pas une alerte,
   *  c'est la raison pour laquelle le dénominateur est ce qu'il est. */
  note?: string
  noteTestId?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--bellum-border)] p-4">
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      <Text size="xl" weight="semibold" className="mt-0.5 font-mono">
        {value}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-0.5">
        {hint}
      </Text>
      {subHint && (
        <Text size="xs" color="text-[var(--warning-soft-text)]" className="mt-0.5">
          {subHint}
        </Text>
      )}
      {note && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5" data-testid={noteTestId}>
          {note}
        </Text>
      )}
    </div>
  )
}

function SectionHeading({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <Text element="h3" size="sm" weight="semibold">
          {title}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-0.5">
          {description}
        </Text>
      </div>
    </div>
  )
}

function LevelCard({
  level,
  coveredLabel,
  missingLabel,
}: {
  level: CoverageLevelStatus
  coveredLabel: string
  missingLabel: string
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        level.covered
          ? 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]'
          : 'border-dashed border-[var(--bellum-border)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <Text size="sm" weight="medium" className="min-w-0 truncate">
          {level.label}
        </Text>
        <Badge variant={level.covered ? 'success' : 'outline'} className="shrink-0">
          {level.covered ? coveredLabel : missingLabel}
        </Badge>
      </div>
      {level.covered && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1.5 font-mono">
          {level.contact_count}
        </Text>
      )}
    </div>
  )
}

/** Cell colour per honest status — the at-a-glance signal of the whole tab. */
const CELL_STYLES: Record<CoverageCellStatus, string> = {
  gap: 'border-[var(--bellum-danger)]/50 bg-[color-mix(in_srgb,var(--bellum-danger)_16%,transparent)] text-[var(--danger-soft-text)]',
  // Couvert = PROUVÉ (contact à l'intersection). `partial` reste le repli d'un
  // payload d'avant la matrice : possible, non prouvé — donc pas la même couleur.
  covered:
    'border-[var(--bellum-success)]/60 bg-[color-mix(in_srgb,var(--bellum-success)_20%,transparent)] text-[var(--success-soft-text)]',
  partial:
    'border-[var(--bellum-warning)]/40 bg-[color-mix(in_srgb,var(--bellum-warning)_12%,transparent)] text-[var(--warning-soft-text)]',
  empty: 'border-dashed border-[var(--bellum-border)] text-[var(--bellum-text-secondary)]',
  // Famille support : pas une zone blanche. Neutre atténué, jamais du rouge — sinon
  // une case « non prioritaire » se lit comme un trou à combler (maquette p19).
  not_priority: 'border-dashed border-[var(--bellum-border)]/60 text-[var(--bellum-text-secondary)]/60',
}

/**
 * Families (rows) × levels (columns) coverage matrix — the "où sont mes trous ?"
 * view of the account plan. Every cell state is derived from the endpoint only
 * (see `buildCoverageGrid`); nothing is inferred beyond what the server reports.
 */
const MATRIX_COLS = 'grid grid-cols-[minmax(9rem,1.2fr)_repeat(3,minmax(0,1fr))_minmax(10rem,1.4fr)]'

function CoverageMatrix({
  rows,
  levels,
  supportLabel,
  actionColumnLabel,
  actionEmptyLabel,
  actionLabel,
  actionPending,
  actionDisabled,
  onAction,
  cellSearchLabel,
  cellSearchAria,
  cellSearchPending,
  onCellSearch,
  statusLabel,
  cellLabel,
  gridLabel,
}: {
  rows: CoverageGridRow[]
  levels: CoverageLevelStatus[]
  supportLabel: string
  actionColumnLabel: string
  actionEmptyLabel: string
  actionLabel: (family: string, gap: CoverageGap) => string
  actionPending: (gap: CoverageGap) => boolean
  actionDisabled: boolean
  onAction: (gap: CoverageGap) => void
  cellSearchLabel: string
  cellSearchAria: (family: string, level: string) => string
  cellSearchPending: (family: string, level: CoverageLevel) => boolean
  onCellSearch: (family: string, level: CoverageLevel) => void
  statusLabel: (status: CoverageCellStatus) => string
  cellLabel: (family: string, level: string, status: CoverageCellStatus) => string
  gridLabel: string
}) {
  return (
    // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
    <div className={`overflow-x-auto ${HORIZONTAL_OVERSCROLL_CLASS}`}>
      <div role="grid" aria-label={gridLabel} className="min-w-[44rem]">
        <div role="row" className={`${MATRIX_COLS} gap-2 pb-2`}>
          <span role="columnheader" />
          {levels.map(level => (
            <Text
              key={level.level}
              role="columnheader"
              element="span"
              size="xs"
              weight="medium"
              color="text-[var(--bellum-text-secondary)]"
              className="truncate text-center"
            >
              {level.label}
            </Text>
          ))}
          <Text
            role="columnheader"
            element="span"
            size="xs"
            weight="medium"
            color="text-[var(--bellum-text-secondary)]"
            className="truncate"
          >
            {actionColumnLabel}
          </Text>
        </div>
        {rows.map(row => (
          <div key={row.family} role="row" className={`${MATRIX_COLS} items-center gap-2 py-1`}>
            <div role="rowheader" className="flex min-w-0 items-center gap-1.5">
              <Text size="sm" weight="medium" className="min-w-0 truncate">
                {row.label}
              </Text>
              {row.contactCount > 0 && (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="shrink-0 font-mono">
                  {row.contactCount}
                </Text>
              )}
              {!row.isTarget && (
                <Badge variant="outline" className="shrink-0 text-xs">
                  {supportLabel}
                </Badge>
              )}
            </div>
            {row.cells.map(cell => (
              <div
                key={cell.level}
                role="gridcell"
                aria-label={cellLabel(row.label, cell.levelLabel, cell.status)}
                title={cellLabel(row.label, cell.levelLabel, cell.status)}
                className={`flex h-9 items-center justify-center rounded-lg border px-2 ${CELL_STYLES[cell.status]}`}
              >
                <span className="truncate text-xs font-medium">
                  {cell.status === 'covered'
                    ? `${statusLabel(cell.status)} · ${cell.contactCount}`
                    : statusLabel(cell.status)}
                </span>
                {/* #4923.12 — chaque case vide d'une famille cible porte SON geste, qu'un
                    gap ait été rangé ou non : il rejoue le scope famille × niveau existant. */}
                {row.isTarget && (cell.status === 'gap' || cell.status === 'empty') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-1 h-7 shrink-0 px-1.5"
                    aria-label={cellSearchAria(row.label, cell.levelLabel)}
                    title={cellSearchLabel}
                    disabled={actionDisabled}
                    onClick={() => onCellSearch(row.family, cell.level)}
                  >
                    {cellSearchPending(row.family, cell.level) ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Telescope className="size-3.5" />
                    )}
                  </Button>
                )}
              </div>
            ))}
            {/* L'action est AU BOUT de la ligne qu'elle répare (maquette p19) : le
                commercial n'a plus à rapprocher une case rouge d'une liste plus bas.
                Aucune action inventée — seule une zone blanche rangée par le serveur
                pour CETTE famille en produit une. */}
            <div role="gridcell" className="min-w-0">
              {row.action ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-full justify-start gap-1.5 px-2"
                  aria-label={actionLabel(row.label, row.action)}
                  title={actionLabel(row.label, row.action)}
                  disabled={actionDisabled}
                  onClick={() => onAction(row.action!)}
                >
                  {actionPending(row.action) ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Telescope className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate text-xs">{row.action.suggested_titles}</span>
                </Button>
              ) : (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="px-2">
                  {actionEmptyLabel}
                </Text>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Une entité du compte proposée comme périmètre de la matrice. `aria-pressed`
 *  porte l'état sélectionné — le filtre reste lisible au clavier et au lecteur. */
function EntityScopeChip({ label, active, onSelect }: { label: string; active: boolean; onSelect: () => void }) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'outline'}
      aria-pressed={active}
      onClick={onSelect}
      className="h-7 px-2.5 text-xs"
    >
      {label}
    </Button>
  )
}

function GapRow({
  gap,
  rank,
  rankLabel,
  nextBestLabel,
  priorityLabel,
  suggestedLabel,
  ctaLabel,
  onFindContact,
  rerunLabel,
  rerunHint,
  rerunPending,
  rerunDisabled,
  onRerun,
}: {
  gap: CoverageGap
  rank: number
  rankLabel: string
  nextBestLabel?: string
  priorityLabel: string
  suggestedLabel: string
  ctaLabel: string
  onFindContact?: () => void
  rerunLabel: string
  rerunHint: string
  rerunPending: boolean
  rerunDisabled: boolean
  onRerun: () => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--bellum-border)] p-4">
      {/* Rang d'exécution : la maquette p19 demande une SÉQUENCE (« fais ces
          quatre choses, dans cet ordre »), pas seulement un badge de priorité. */}
      <div
        aria-label={rankLabel}
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] font-mono text-xs font-semibold"
      >
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text size="sm" weight="semibold">
            {gap.family_label}
          </Text>
          <Badge variant="outline" className="shrink-0">
            {gap.level_label}
          </Badge>
          <Badge variant={priorityVariant(gap.priority)} className="shrink-0 font-mono">
            {priorityLabel}
          </Badge>
          {nextBestLabel && (
            <Badge variant="info" className="shrink-0">
              {nextBestLabel}
            </Badge>
          )}
        </div>
        <Text size="sm" className="mt-1 inline-flex items-center gap-1">
          <ArrowUpRight className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" />
          <span>{suggestedLabel}</span>
        </Text>
        <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-1">
          {gap.reason}
        </Text>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {onFindContact && (
            <Button size="sm" variant="outline" onClick={onFindContact} className="gap-2">
              <UserSearch className="size-4" />
              {ctaLabel}
            </Button>
          )}
          {/* Rerun partiel : cherche les profils manquants de cette case au lieu de
              rejouer tout le dossier. Désactivé pendant qu'une case tourne déjà. */}
          <Button
            size="sm"
            variant="default"
            onClick={onRerun}
            disabled={rerunDisabled}
            title={rerunHint}
            className="gap-2"
          >
            {rerunPending ? <Loader2 className="size-4 animate-spin" /> : <Telescope className="size-4" />}
            {rerunLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
