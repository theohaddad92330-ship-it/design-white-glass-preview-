import {
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TerritoryChange, TerritoryIndicatorPanel, WatchedTerritory } from '@bellum/contracts'
import { territoryChangeReading } from '@bellum/contracts'
import { formatCount, formatDate } from '@/lib/locale'
import { Completeness } from '@/components/primitives/Completeness'
import { Provenance } from '@/components/primitives/Provenance'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { fetchMarketWatch, followTerritory, unfollowTerritory } from '../api/market-watch-api'
import { MarketMemoryCoverageCard } from '@/features/market-memory/view/MarketMemoryCoverageCard'
import { MarketReviewQueue } from '@/features/market-memory/view/MarketReviewQueue'
import { MarketStructuralFitCard } from '@/features/market-memory/view/MarketStructuralFitCard'
import { useCreateMarketZone, useMarketZones } from '@/features/market-brief/hooks/useMarketZones'

/**
 * L'écran Marché — « qu'est-ce qui a bougé sur mes territoires ? »
 *
 * Distinct de l'écran Territoire, qui répond à « qu'est-ce qu'il y a là-bas ? ».
 * On ouvre le premier quand on prospecte une ville ; on lit celui-ci toutes les
 * semaines, et il n'a le droit de parler que quand quelque chose a bougé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN A CESSÉ DE FAIRE LE 31/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Afficher un plafond comme un dénombrement.** Il écrivait « Offres IT :
 *    100 » sur deux départements — cent tout rond, deux fois : la borne de la
 *    collecte (`list_hiring_companies(…, 100)`), présentée comme une mesure.
 *    Une valeur qui a atteint sa borne s'écrit désormais « au moins 100 », et
 *    aucune tendance ne se calcule entre deux plafonds.
 * 2. **Écrire « SCC France — — → 1 ».** Une variation depuis une valeur
 *    inconnue n'est pas « — → 1 » : c'est une ENTRÉE, et ça s'écrit en toutes
 *    lettres (`territoryChangeReading`).
 * 3. **Poser trois nombres nus.** Chaque chiffre porte maintenant son registre
 *    public, la date de sa photo, sa tendance (ou la RAISON de son absence), et
 *    une destination — un indicateur qui ne mène nulle part ne sert à rien.
 *
 * Trois silences différents s'affichent toujours différemment — la veille qui
 * démarre, la première photo sans terme de comparaison, et le marché qui n'a
 * réellement pas bougé. Les confondre ferait chercher une panne là où il n'y a
 * rien à voir.
 */
/**
 * Refonte Théo (23/10/2026) — l'écran Marché DÉCLARE son en-tête à la coque (COQUE.md §2) : le titre,
 * la phrase, la puce du nombre de territoires suivis, et le geste principal (suivre un département) à
 * droite. Le corps n'en dessine plus un second. Référence la plus proche : `a/signaux` (veille) —
 * sections titrées, cartes, états nommés.
 */
export function MarketWatchPage() {
  const { t } = useTranslation('marketWatch')
  const watch = useQuery({ queryKey: MARKET_WATCH_KEY, queryFn: fetchMarketWatch })
  const followed = watch.data?.territories.length ?? 0
  return (
    <CustomerPage
      pageTitle={t('title')}
      pageSubtitle={t('subtitle')}
      // Une absence ne fait aucune puce : rien tant qu'aucun territoire n'est suivi.
      pageTitleBadge={followed > 0 ? <Badge variant="primary">{t('followedCount', { count: followed })}</Badge> : null}
      headerActions={<FollowTerritoryForm />}
    >
      <MarketWatch />
    </CustomerPage>
  )
}

const MARKET_WATCH_KEY = ['pilotage', 'marche'] as const
const FOLLOW_INPUT_ID = 'market-watch-follow-input'

/** Le geste principal de l'écran : suivre un département. */
function FollowTerritoryForm() {
  const { t } = useTranslation('marketWatch')
  const client = useQueryClient()
  const [input, setInput] = useState('')
  const follow = useMutation({
    mutationFn: followTerritory,
    onSuccess: () => client.invalidateQueries({ queryKey: MARKET_WATCH_KEY }),
  })
  return (
    <Box className="flex flex-wrap gap-2">
      <Input
        id={FOLLOW_INPUT_ID}
        value={input}
        onChange={event => setInput(event.target.value)}
        placeholder={t('addPlaceholder')}
        className="min-h-11 w-44"
        aria-label={t('addPlaceholder')}
      />
      <Button
        className="min-h-11"
        icon={Plus}
        onClick={() => {
          const value = input.trim()
          if (value.length === 0) return
          follow.mutate(value)
          setInput('')
        }}
        disabled={follow.isPending}
      >
        {t('add')}
      </Button>
    </Box>
  )
}

/** Un en-tête de section Théo : le titre, et ce qu'il compte à sa droite. */
function SectionHead({ id, title, meta }: { id: string; title: string; meta?: string | null }) {
  return (
    <Box className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id={id} className="text-lg font-semibold text-[var(--bellum-text-primary)]">
        {title}
      </h2>
      {meta ? <span className="text-xs text-[var(--bellum-text-muted)]">{meta}</span> : null}
    </Box>
  )
}

export function MarketWatch() {
  const { t } = useTranslation('marketWatch')
  const client = useQueryClient()

  const watch = useQuery({ queryKey: MARKET_WATCH_KEY, queryFn: fetchMarketWatch })
  const unfollow = useMutation({
    mutationFn: unfollowTerritory,
    onSuccess: () => client.invalidateQueries({ queryKey: MARKET_WATCH_KEY }),
  })

  const territories = watch.data?.territories ?? []

  return (
    <Box className="flex flex-col gap-8" data-testid="market-watch-sections">
      {/* #3828.2 — la porte de création d'une zone, seulement quand l'espace n'en a aucune. */}
      <CreateZoneBlock />

      {/* #1635 — LA COUVERTURE STRUCTURELLE, EN HAUT ET NON EN BAS : la structure se lit avant la
          variation, parce qu'elle en donne le dénominateur. #1635.1 : « ne pas ajouter un nouveau
          dashboard » — trois blocs dans l'écran existant, sans route ni entête à eux ; #1635.5 : aucun
          score global — le fit rend un COMPTE et son critère, jamais une note. Louis 14/10/2026 : la
          file « À départager » vit ICI, sous la carte de couverture dont elle traite les ambiguïtés. */}
      <Box as="section" aria-labelledby="market-coverage-heading" className="flex flex-col gap-3">
        <SectionHead id="market-coverage-heading" title={t('sections.coverage')} />
        <Box className="grid gap-4 lg:grid-cols-2">
          <MarketMemoryCoverageCard />
          <MarketStructuralFitCard />
        </Box>
        <MarketReviewQueue />
      </Box>

      <Box as="section" aria-labelledby="market-territories-heading" className="flex flex-col gap-3">
        <SectionHead
          id="market-territories-heading"
          title={t('sections.territories')}
          meta={territories.length > 0 ? t('followedCount', { count: territories.length }) : null}
        />
        {watch.isLoading ? (
          <ScreenState state="loading" title={t('loading')} />
        ) : watch.isError ? (
          <ScreenState state="error" title={t('error')} />
        ) : territories.length === 0 ? (
          <ScreenState
            state="empty_never"
            title={t('emptyTitle')}
            message={t('empty')}
            // Le geste vit dans l'en-tête (« Suivre ») : l'état vide y mène, il ne le recopie pas.
            action={{ label: t('emptyAction'), onClick: () => document.getElementById(FOLLOW_INPUT_ID)?.focus() }}
          />
        ) : (
          <Box className="grid gap-4 md:grid-cols-2">
            {territories.map(territory => (
              <TerritoryCard
                key={territory.department}
                territory={territory}
                onRemove={() => unfollow.mutate(territory.department)}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

/**
 * #3828.2 — « Marché local » (L1) a un `POST /market-zones` côté API depuis
 * son premier lot, mais rien côté web ne l'appelait : `MarketZonesList.tsx`
 * (retirée depuis, #3828) avait déjà un état vide muet, jamais de CTA de
 * création. Conséquence mesurée en recette prod : `/api/market-zones` rend
 * `[]` dans un espace réel, et la puce « Marché local » d'un compte
 * (`AccountMarketZoneChip.tsx`) n'apparaît donc jamais nulle part — une zone
 * ne se crée JAMAIS depuis la fiche compte elle-même. Ce bloc n'affiche rien
 * tant que l'espace a déjà au moins une zone : l'écran Marché n'est pas la
 * gestion exhaustive des zones, seulement la porte qui manquait quand il n'y
 * en a aucune.
 */
function CreateZoneBlock() {
  const { t } = useTranslation('marketWatch')
  const zones = useMarketZones()
  const create = useCreateMarketZone()
  const [label, setLabel] = useState('')
  const [scope, setScope] = useState<'france' | 'suisse'>('france')
  const [codes, setCodes] = useState('')

  if (zones.isLoading || zones.isError) return null
  if (zones.data !== undefined && zones.data.length > 0) return null

  const parsedCodes = codes
    .split(',')
    .map(code => code.trim())
    .filter(code => code.length > 0)
  const canSubmit = label.trim().length > 0 && parsedCodes.length > 0

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('zones.empty')}
        </Text>
        <Text element="h2" size="base" weight="semibold">
          {t('zones.createTitle')}
        </Text>
        <Box className="flex flex-wrap items-center gap-2">
          <Input
            value={label}
            onChange={event => setLabel(event.target.value)}
            placeholder={t('zones.labelPlaceholder')}
            aria-label={t('zones.labelAria')}
            className="max-w-48"
          />
          <Select value={scope} onValueChange={next => setScope(next as 'france' | 'suisse')}>
            <SelectTrigger aria-label={t('zones.scopeAria')} className="w-48 min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="france">{t('zones.scopeFrance')}</SelectItem>
              <SelectItem value="suisse">{t('zones.scopeSuisse')}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={codes}
            onChange={event => setCodes(event.target.value)}
            placeholder={t(scope === 'france' ? 'zones.codesPlaceholderFrance' : 'zones.codesPlaceholderSuisse')}
            aria-label={t('zones.codesAria')}
            className="max-w-48"
          />
          <Button
            onClick={() => {
              create.mutate(
                {
                  label: label.trim(),
                  scope,
                  departments: scope === 'france' ? parsedCodes : [],
                  cantons: scope === 'suisse' ? parsedCodes : [],
                },
                {
                  onSuccess: () => {
                    setLabel('')
                    setCodes('')
                  },
                },
              )
            }}
            disabled={!canSubmit || create.isPending}
          >
            {t('zones.submit')}
          </Button>
        </Box>
        {create.isError ? (
          <Text size="sm" color="text-[var(--danger-soft-text)]">
            {t('zones.error')}
          </Text>
        ) : null}
      </CardContent>
    </Card>
  )
}

function TerritoryCard({ territory, onRemove }: { territory: WatchedTerritory; onRemove: () => void }) {
  const { t } = useTranslation('marketWatch')
  // Le panneau ouvert, s'il y en a un. Un seul à la fois : deux listes longues
  // ouvertes côte à côte sur une carte de tableau de bord ne se lisent plus.
  const [openPanel, setOpenPanel] = useState<TerritoryIndicatorPanel | null>(null)

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Box className="flex items-start justify-between gap-2 border-b border-[var(--bellum-border)] pb-3">
          <Box>
            <Text element="h3" size="base" weight="semibold">
              {t('department', { code: territory.department })}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {territory.lastSnapshotOn
                ? t('lastSnapshot', {
                    date: formatDate(territory.lastSnapshotOn) ?? territory.lastSnapshotOn,
                    count: territory.snapshots,
                  })
                : t('noSnapshot')}
            </Text>
          </Box>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            aria-label={t('removeNamed', { code: territory.department })}
            onClick={onRemove}
          >
            {t('remove')}
          </Button>
        </Box>

        <Box className="grid grid-cols-2 gap-3">
          {territory.measures.map(measure => (
            <MeasureTile
              key={measure.key}
              measure={measure}
              open={measure.target.kind === 'panel' && openPanel === measure.target.panel}
              onToggle={panel => setOpenPanel(current => (current === panel ? null : panel))}
            />
          ))}
        </Box>

        {openPanel === 'esn' ? <EsnPanel territory={territory} /> : null}

        <MovementsPanel territory={territory} />

        <TechnologiesPanel territory={territory} />

        <HiringPanel territory={territory} />

        <PortfolioLinks territory={territory} />
      </CardContent>
    </Card>
  )
}

/**
 * UNE TUILE DE MESURE — le chiffre, ce qu'il vaut, d'où il vient, où il mène.
 *
 * Le chiffre BORNÉ s'écrit « au moins 100 » et sa borne est dite juste en
 * dessous. C'est la différence entre un dénombrement et un plafond, et elle
 * décide de tout ce qui suit : un territoire à « au moins 100 » n'est pas
 * comparable à un autre à « au moins 100 ».
 *
 * ⚠️ La tuile est un `<button>` ou un `<Link>`, jamais un `<div onClick>` : ce
 * qui se clique se tabule (GA-35), et une cible tactile fait au moins 44 px.
 */
function MeasureTile({
  measure,
  open,
  onToggle,
}: {
  measure: WatchedTerritory['measures'][number]
  open: boolean
  onToggle: (panel: TerritoryIndicatorPanel) => void
}) {
  const { t } = useTranslation('marketWatch')
  const label = t(`measure.${measure.key}`)

  const body = (
    <>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      {measure.value === null ? (
        <UnknownValue reason={t('valueGap')} />
      ) : (
        <Text size="lg" weight="semibold">
          {measure.bounded ? t('atLeast', { value: formatCount(measure.value) }) : formatCount(measure.value)}
        </Text>
      )}
      {measure.bounded ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('boundedWhy', { ceiling: formatCount(measure.ceiling) })}
        </Text>
      ) : null}
      {/* #2206.42 — DEUX HORIZONS, JAMAIS UN SEUL.
          « Tendance de fond » (structurel : la plus ancienne photo contre la
          plus récente) porte l'étendue RÉELLE du recul, pas la semaine
          dernière. « Tendance du moment » (actuel, inchangé) reste le delta
          entre les deux dernières photos. Deux blocs séparés et titrés :
          confondre les deux ferait passer une semaine pour un trimestre. */}
      <Box className="space-y-2">
        <TrendHorizon title={t('trend.structuralTitle')} trend={measure.structuralTrend} />
        <TrendHorizon title={t('trend.currentTitle')} trend={measure.trend} />
      </Box>
      {/* La provenance : le registre PUBLIC et la date de la photo. Un registre
          public se nomme — son nom EST la garantie, et c'est là que le lecteur
          ira vérifier le chiffre s'il en doute. */}
      <Provenance source="public" observedAt={measure.observedOn} detail={measure.registry} />
    </>
  )

  const shell =
    'flex min-h-11 flex-col gap-1 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3 text-left transition-colors'

  if (measure.target.kind === 'panel') {
    const panel = measure.target.panel
    return (
      <button
        type="button"
        className={`${shell} hover:border-[var(--bellum-text-accent)]`}
        aria-expanded={open}
        onClick={() => onToggle(panel)}
      >
        {body}
        <Text size="xs" color="text-[var(--bellum-text-accent)]">
          {t('openPanel')}
        </Text>
      </button>
    )
  }

  return (
    <Link
      to={measure.target.route}
      search={measure.target.search ?? {}}
      className={`${shell} hover:border-[var(--bellum-text-accent)]`}
    >
      {body}
      <Text size="xs" color="text-[var(--bellum-text-accent)]">
        {t('openList')}
      </Text>
    </Link>
  )
}

/**
 * #2206.42 — UN HORIZON, TITRÉ.
 *
 * Le bloc qui porte un des deux horizons de la mesure — « Tendance de fond »
 * (structurel) ou « Tendance du moment » (actuel). Même rendu de tendance
 * dans les deux cas (`MeasureTrend`) : ce qui change, c'est la PAIRE de photos
 * comparée en amont, pas la façon de lire le résultat.
 */
function TrendHorizon({ title, trend }: { title: string; trend: WatchedTerritory['measures'][number]['trend'] }) {
  return (
    <Box className="space-y-0.5">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-muted)]">
        {title}
      </Text>
      <MeasureTrend trend={trend} />
    </Box>
  )
}

/**
 * LA TENDANCE, OU LA RAISON DE SON ABSENCE — jamais « +0 ».
 *
 * Deux photos suffisent, une seule ne suffit pas, et deux plafonds ne font pas
 * une stabilité. Chacun de ces trois cas a sa phrase : les rendre identiques
 * ferait chercher une panne là où il n'y a qu'une semaine de recul.
 *
 * #2206.42 — Sert AUSSI l'horizon structurel (`structuralTrend`) : la forme
 * est la même, seule la paire de photos comparée change en amont
 * (`territoryStructuralTrend` côté contrats). `not_enough_history` est la
 * raison propre au structurel — deux photos ou moins, ou un fond de moins de
 * 30 jours, où le structurel serait l'actuel déguisé.
 *
 * ⚠️ Le SIGNE porte le sens en texte — la tendance se lit sans couleur, au
 * lecteur d'écran comme en niveaux de gris. La couleur ne fait qu'appuyer, et
 * elle passe par les jetons `*-soft-text`, seuls à tenir AA dans les deux
 * thèmes.
 */
function MeasureTrend({ trend }: { trend: WatchedTerritory['measures'][number]['trend'] }) {
  const { t } = useTranslation('marketWatch')
  if (!trend.measured) {
    return (
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t(`trend.gap.${trend.gap}`, { defaultValue: t('trend.gap.no_previous_snapshot') })}
      </Text>
    )
  }
  // Un zéro MESURÉ est vrai : deux photos égales veulent dire « stable », et
  // c'est une information. Ce qu'on refuse est le zéro qui remplace une absence.
  if (trend.change === 0) {
    return (
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('trend.steady', { date: formatDate(trend.fromDate) ?? trend.fromDate })}
      </Text>
    )
  }
  const up = trend.change > 0
  const tone = up ? 'text-[var(--success-soft-text)]' : 'text-[var(--warning-soft-text)]'
  return (
    <Text size="xs" color={tone}>
      {up
        ? t('trend.up', {
            change: formatCount(Math.abs(trend.change)),
            date: formatDate(trend.fromDate) ?? trend.fromDate,
          })
        : t('trend.down', {
            change: formatCount(Math.abs(trend.change)),
            date: formatDate(trend.fromDate) ?? trend.fromDate,
          })}
      {trend.percent === null ? '' : ` · ${t('trend.percent', { percent: trend.percent })}`}
    </Text>
  )
}

/** Les mouvements de la période — entrées, sorties, variations. */
function MovementsPanel({ territory }: { territory: WatchedTerritory }) {
  const { t } = useTranslation('marketWatch')
  return (
    <Box data-panel="movements" className="space-y-1 border-t border-[var(--bellum-border)] pt-3">
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
        {t('panel.movements')}
      </Text>
      {territory.changes.length > 0 ? (
        territory.changes.map((change, index) => (
          <Box key={`${change.kind}-${change.subject ?? index}`} className="flex flex-wrap items-center gap-2">
            <Badge variant={change.kind === 'offers' ? 'info' : change.kind === 'tenders' ? 'warning' : 'default'}>
              {t(`kind.${change.kind}`)}
            </Badge>
            <Text size="sm">
              {change.subject ? `${change.subject} — ` : ''}
              <MovementWording change={change} />
            </Text>
          </Box>
        ))
      ) : (
        // L'état vide DIT POURQUOI : « rien de notable » et « la veille démarre »
        // ne s'écrivent pas pareil, et la phrase vient de l'API qui SAIT lequel
        // des trois silences elle a rencontré.
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {territory.reason}
        </Text>
      )}
    </Box>
  )
}

/**
 * CE QU'UN MOUVEMENT DIT, EN TOUTES LETTRES.
 *
 * L'écran écrivait `{change.from ?? '—'} → {change.to ?? '—'}`, ce qui donnait
 * « SCC France — — → 1 ». La forme du mouvement est une propriété du mouvement,
 * calculée dans les contrats (`territoryChangeReading`) : ici, on ne fait que
 * choisir la phrase.
 */
function MovementWording({ change }: { change: TerritoryChange }) {
  const { t } = useTranslation('marketWatch')
  const reading = territoryChangeReading(change)
  if (reading.shape === 'entered') return <>{t('movement.entered', { count: reading.to })}</>
  if (reading.shape === 'left') return <>{t('movement.left', { count: reading.from })}</>
  if (reading.shape === 'moved') {
    return (
      <>
        {t('movement.moved', { from: formatCount(reading.from), to: formatCount(reading.to) })}
        {reading.percent === null ? '' : ` · ${t('trend.percent', { percent: reading.percent })}`}
      </>
    )
  }
  return <>{t('movement.unreadable')}</>
}

/** Les technologies demandées — l'ordre vaut, le volume est un plancher. */
function TechnologiesPanel({ territory }: { territory: WatchedTerritory }) {
  const { t } = useTranslation('marketWatch')
  return (
    <Box data-panel="technologies" className="space-y-1 border-t border-[var(--bellum-border)] pt-3">
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
        {t('panel.technologies')}
      </Text>
      {territory.technologies.length > 0 ? (
        <>
          <Box className="flex flex-wrap gap-1.5">
            {territory.technologies.map(tech => (
              <Badge key={tech.term} variant="primary">
                {tech.term} · {tech.count}
              </Badge>
            ))}
          </Box>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('panel.technologiesWhy')}
          </Text>
        </>
      ) : (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('panel.technologiesNone')}
        </Text>
      )}
    </Box>
  )
}

/** Les ESN qui recrutent ici, à la dernière photo. */
function HiringPanel({ territory }: { territory: WatchedTerritory }) {
  const { t } = useTranslation('marketWatch')
  return (
    <Box className="space-y-1 border-t border-[var(--bellum-border)] pt-3">
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
        {t('panel.hiring')}
      </Text>
      {territory.hiringEsn.length > 0 ? (
        <>
          {territory.hiringEsn.map(esn => (
            <Box
              key={esn.name}
              className="flex items-center justify-between gap-2 border-b border-[var(--bellum-border)] py-1.5 last:border-b-0"
            >
              <Text size="sm">{esn.name}</Text>
              <Badge variant="info">{esn.offers}</Badge>
            </Box>
          ))}
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('panel.hiringWhy')}
          </Text>
        </>
      ) : (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('panel.hiringNone')}
        </Text>
      )}
    </Box>
  )
}

/**
 * LE RÉFÉRENTIEL ESN DE CE DÉPARTEMENT — par taille et par rang.
 *
 * ⚠️ La part se calcule sur `known`, le nombre d'ESN du référentiel implantées
 * ici — jamais sur `esnPresent`, qui compte une AUTRE population avec une AUTRE
 * source. Diviser l'une par l'autre produirait un taux qui ne veut rien dire.
 */
function EsnPanel({ territory }: { territory: WatchedTerritory }) {
  const { t } = useTranslation('marketWatch')
  const { esn } = territory
  return (
    <Box
      data-panel="esn"
      className="space-y-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4"
    >
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
        {t('panel.esn')}
      </Text>
      {esn.known === 0 ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('panel.esnNone')}
        </Text>
      ) : (
        <>
          <Text size="sm">{t('panel.esnKnown', { count: esn.known })}</Text>
          <Completeness counted={esn.resolved} total={esn.total} of={t('panel.esnPopulation')} />
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('panel.esnWhy')}
          </Text>

          <Text size="xs" weight="medium" className="pt-1">
            {t('panel.bySize')}
          </Text>
          {esn.bySize.map(row => (
            <Text key={row.sizeClass ?? 'unknown'} size="sm">
              {row.sizeClass ?? t('panel.sizeUnknown')} —{' '}
              {t('panel.share', { count: row.count, share: Math.round((row.count / esn.known) * 100) })}
            </Text>
          ))}

          <Text size="xs" weight="medium" className="pt-1">
            {t('panel.byRank')}
          </Text>
          {esn.byOpenness.map(row => (
            <Text key={row.openness} size="sm">
              {t(`panel.openness.${row.openness}`, { defaultValue: row.openness })} —{' '}
              {t('panel.share', { count: row.count, share: Math.round((row.count / esn.known) * 100) })}
            </Text>
          ))}

          <Box className="flex flex-col gap-0.5 pt-1">
            {esn.entries.map(entry => (
              <Box key={entry.name} className="flex flex-wrap items-center gap-2">
                <Text size="sm">{entry.name}</Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {[entry.city, entry.headcountRange].filter(Boolean).join(' · ')}
                </Text>
                {entry.riskFlag !== 'aucun' ? (
                  <Badge variant="warning">{t(`panel.risk.${entry.riskFlag}`, { defaultValue: entry.riskFlag })}</Badge>
                ) : null}
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  )
}

/**
 * LE LIEN AVEC LE RESTE DU PRODUIT — cet écran était une île.
 *
 * ⚠️ Ces deux nombres appartiennent à l'ESPACE et ne sont partagés avec
 * personne : « suivre un département » est une intention commerciale, là où le
 * nombre d'offres IT publiées là-bas est un fait de marché. C'est la frontière
 * que le dépôt tient depuis le tome 4 (les espaces sont des ESN, donc des
 * concurrents), et elle passe exactement ici.
 *
 * Le dénominateur voyage AVEC le chiffre : « 3 comptes ici » sans « sur 11 qui
 * déclarent un site » se lirait « je n'ai que trois comptes », ce qui est faux.
 */
function PortfolioLinks({ territory }: { territory: WatchedTerritory }) {
  const { t } = useTranslation('marketWatch')
  const { portfolio } = territory
  return (
    <Box className="space-y-1 border-t border-[var(--bellum-border)] pt-3">
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
        {t('links.title')}
      </Text>
      {portfolio.accountsHere > 0 ? (
        <Link to="/accounts" className="text-sm text-[var(--bellum-text-accent)] underline">
          {t('links.accounts', { count: portfolio.accountsHere })} ·{' '}
          {t('links.accountsOf', { total: portfolio.accountsWithSite })}
        </Link>
      ) : (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('links.accountsNone')}
        </Text>
      )}
      {portfolio.partnersHere > 0 ? (
        <Link to="/accounts/partners" className="text-sm text-[var(--bellum-text-accent)] underline">
          {t('links.partners', { count: portfolio.partnersHere })}
        </Link>
      ) : (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('links.partnersNone')}
        </Text>
      )}
      {/* L'écran Territoire répond à « qu'est-ce qu'il y a là-bas ? ». C'est la
          question voisine, et c'est par ici qu'on y va — l'aller-retour existait
          déjà dans l'autre sens. */}
      {/* ⚠️ #1796.2 (10/09/2026) — l'écran Territoire a fusionné dans Découvrir et
          sa route a été retirée. Ce lien la visait encore : sans le typage des
          routes de TanStack Router, il serait parti en production comme un lien
          MORT, silencieux. Il vise Découvrir, qui porte désormais le panneau. */}
      <Link to="/discover" className="text-sm text-[var(--bellum-text-accent)] underline">
        {t('links.overview')}
      </Link>
    </Box>
  )
}
