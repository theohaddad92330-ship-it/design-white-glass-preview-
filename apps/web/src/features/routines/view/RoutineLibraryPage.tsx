import type { RoutineView } from '@bellum/contracts'
import { Badge, Box, FilterChips, Spinner, Text } from '@bellum/ui'
import {
  CalendarClock,
  CalendarDays,
  Eye,
  HandCoins,
  Megaphone,
  Search,
  Sun,
  UserSearch,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useAutomationRules, useAutomationTrials } from '@/features/automations/api'
import { AutomationsGuide } from '@/features/automations/view/AutomationsGuide'
import { AutomationsSubNav } from '@/features/automations/view/AutomationsSubNav'
import { AutomationTemplatesBlock } from '@/features/automations/view/AutomationTemplatesBlock'
import {
  THEO_BTN,
  THEO_BTN_PLAIN_SM,
  THEO_BTN_SOFT_SM,
  THEO_CARD,
  THEO_PILL,
  THEO_PILL_ACCENT,
  THEO_SYMBOL,
} from '@/features/automations/view/theo-classes'
import { PlaybooksBlock } from '@/features/playbooks/view/PlaybooksBlock'
import { useRoutines, useRunDueRoutines } from '../api'
import {
  ROUTINE_FAMILIES,
  ROUTINE_FAMILY_OF,
  routineToolsOf,
  type RoutineFamily,
  type RoutineTool,
} from '../routineFamilies'
import { RoutineFunctioningDialog } from './RoutineFunctioningDialog'

/** Douze modèles à la fois : sur une cinquantaine, une liste plate ne se parcourt plus (Théo C automations-bibliotheque.N5). */
const PAGE_SIZE = 12

/** Le symbole de la famille, en tête de carte : la maquette en met un à chaque modèle. */
const FAMILY_ICON: Record<RoutineFamily, LucideIcon> = {
  organisation: Sun,
  meetings: CalendarDays,
  prospecting: Megaphone,
  missions_invoices: HandCoins,
  talents_staffing: UserSearch,
  watch: Eye,
}

/** Quel manque de branchement rend un outil « à connecter » ; l'espace lui-même n'a rien à connecter. */
const BLOCKER_OF_TOOL: Partial<Record<RoutineTool, RoutineView['blockers'][number]>> = {
  mailbox: 'mailbox_not_connected',
  agenda: 'agenda_not_connected',
  ats: 'ats_not_connected',
  crm: 'crm_not_connected',
}

/**
 * Théo C automations-bibliotheque — LA BIBLIOTHÈQUE DE ROUTINES : « Des suivis prêts à adapter ».
 *
 * Remplace Réglages › Routines (la route y renvoie, les liens entrants survivent). Une carte par routine —
 * famille métier, phrase, outils LUS (ceux du client, signalés « à connecter » quand ils ne le sont pas), « Voir le
 * fonctionnement » et « Adapter ». Tout ce que la liste portait vit désormais dans la fenêtre (`RoutineFunctioningDialog`) :
 * rien ne disparaît, ça se range.
 *
 * `openKey` rouvre la fenêtre d'une routine (lien entrant `/settings/routines/:key`).
 */
export function RoutineLibraryPage({ openKey }: { openKey?: string }) {
  const { t, i18n } = useTranslation('routines')
  const { data, isLoading, isError, refetch } = useRoutines()
  const rules = useAutomationRules()
  const trials = useAutomationTrials()
  const runDue = useRunDueRoutines()
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'

  const [query, setQuery] = useState('')
  const [families, setFamilies] = useState<RoutineFamily[]>([])
  const [shown, setShown] = useState(PAGE_SIZE)
  const [opened, setOpened] = useState<{ key: string; tab: 'how' | 'settings' } | null>(
    openKey ? { key: openKey, tab: 'how' } : null,
  )

  // Changer de filtre repart de la première page : « les suivants » d'une autre liste n'ont pas de sens.
  useEffect(() => setShown(PAGE_SIZE), [query, families])

  const header = {
    pageTitle: t('lib.title'),
    pageSubtitle: t('lib.subtitle'),
    headerActions: (
      <Box className="flex flex-wrap items-center gap-2">
        {/* Théo C automations-liste.A5 — « Lancer celles qui sont dues » vit ICI, à côté de « Décrire mon besoin ». */}
        <button type="button" className={THEO_BTN} onClick={() => runDue.mutate()} disabled={runDue.isPending}>
          {runDue.isPending ? t('page.running') : t('page.runNow')}
        </button>
        <AskLaura variant="prominent" question={t('lib.describeQuestion')} label={t('lib.describe')} alwaysVisible />
      </Box>
    ),
  }

  if (isLoading || isError || !data) {
    return (
      <CustomerPage anchorId="routines-library" {...header}>
        {isLoading ? (
          <Box className="flex h-48 items-center justify-center">
            <Spinner />
          </Box>
        ) : (
          <Box role="alert" className={`${THEO_CARD} flex flex-col items-start gap-3`}>
            <Text weight="medium">{t('error.title')}</Text>
            <button type="button" className={THEO_BTN} onClick={() => void refetch()}>
              {t('error.retry')}
            </button>
          </Box>
        )}
      </CustomerPage>
    )
  }

  const needle = query.trim().toLowerCase()
  const matching = data.filter(view => {
    if (families.length > 0 && !families.includes(ROUTINE_FAMILY_OF[view.definition.key])) return false
    if (needle === '') return true
    const { name, description } = view.definition
    return `${name[locale]} ${description[locale]}`.toLowerCase().includes(needle)
  })
  const visible = matching.slice(0, shown)
  const openedView = opened ? data.find(view => view.definition.key === opened.key) : undefined

  return (
    <CustomerPage anchorId="routines-library" {...header}>
      <Box className="flex w-full flex-col">
        {runDue.data ? (
          <Text size="sm" role="status" className="mb-3 text-[var(--bellum-text-secondary)]">
            {runDue.data.executed === 0 ? t('page.ranNone') : t('page.ranSome', { count: runDue.data.executed })}
          </Text>
        ) : null}

        <AutomationsGuide />

        <AutomationsSubNav
          current="library"
          counts={{
            library: data.length,
            ...(rules.data ? { mine: rules.data.length } : {}),
            ...(trials.data && trials.data.length > 0 ? { journal: trials.data.length } : {}),
          }}
        />

        {/* `.a14-filterbar` — recherche, familles (choix multiple, décision Louis 23/10), puis le compte à droite. */}
        <Box data-section="filters" className="mb-4 flex flex-wrap items-center gap-2.5">
          <label className="flex w-full min-w-0 items-center gap-2 rounded-control border border-[var(--bellum-border)] bg-card px-3 sm:w-auto sm:min-w-56 sm:max-w-md sm:flex-1">
            <Search className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('lib.searchPlaceholder')}
              aria-label={t('lib.searchLabel')}
              className="h-10 w-full min-w-0 border-0 bg-transparent text-sm text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)] focus:outline-none pointer-coarse:h-11"
            />
          </label>
          <FilterChips
            multiple
            legend={t('lib.familyLabel')}
            ariaLabel={t('lib.familyLabel')}
            options={ROUTINE_FAMILIES.map(option => ({
              value: option,
              label: t(`family.${option}`),
              count: data.filter(view => ROUTINE_FAMILY_OF[view.definition.key] === option).length,
            })).filter(option => option.count > 0)}
            values={families}
            onToggle={option =>
              setFamilies(current =>
                current.includes(option) ? current.filter(entry => entry !== option) : [...current, option],
              )
            }
            size="sm"
          />
          <Text size="xs" className="text-[var(--bellum-text-muted)] sm:ml-auto" aria-live="polite">
            {t('lib.count', { count: matching.length })}
          </Text>
        </Box>

        {matching.length === 0 ? (
          <Box className={`${THEO_CARD} flex flex-col items-start gap-3`}>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('lib.noMatch')}
            </Text>
            <button
              type="button"
              className={THEO_BTN}
              onClick={() => {
                setQuery('')
                setFamilies([])
              }}
            >
              {t('lib.reset')}
            </button>
          </Box>
        ) : (
          <ul
            aria-label={t('lib.listLabel')}
            data-section="catalog"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {visible.map(view => (
              <li key={view.definition.key} className="flex">
                <RoutineCard view={view} locale={locale} onOpen={tab => setOpened({ key: view.definition.key, tab })} />
              </li>
            ))}
          </ul>
        )}

        {matching.length > visible.length ? (
          <Box className="mt-5 flex justify-center">
            <button type="button" className={THEO_BTN} onClick={() => setShown(count => count + PAGE_SIZE)}>
              {t('lib.showMore')}
            </button>
          </Box>
        ) : null}

        {/* Hors maquette, gardés : les modèles de règle sur signal (A6) et le réglage des relances automatiques. */}
        <Box className="mt-10 flex flex-col gap-6">
          {/* Théo C automations-liste.A6 — les modèles de règle sur signal, fusionnés ici (ils étaient sur la liste). */}
          <AutomationTemplatesBlock />

          {/* #1438 — LE RÉGLAGE DES RELANCES AUTOMATIQUES (arrivé de `/pilotage`) : rangé ici, replié. Un réglage vit à
              UN seul endroit (GA-26). « Lancer celles qui sont dues » est passé dans l'en-tête (A5). */}
          <details className="rounded-card border border-[var(--bellum-border)] bg-card px-4 py-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
              {t('lib.advancedTitle')}
            </summary>
            <Box className="mb-2 mt-3 flex flex-col gap-4">
              <PlaybooksBlock />
            </Box>
          </details>
        </Box>

        {openedView && opened ? (
          <RoutineFunctioningDialog
            // La clé rejoue l'ouverture : « Adapter » ouvre l'onglet Réglages, « Voir le fonctionnement » l'autre.
            key={`${opened.key}:${opened.tab}`}
            view={openedView}
            open
            initialTab={opened.tab}
            onOpenChange={open => {
              if (!open) setOpened(null)
            }}
          />
        ) : null}
      </Box>
    </CustomerPage>
  )
}

function RoutineCard({
  view,
  locale,
  onOpen,
}: {
  view: RoutineView
  locale: 'fr' | 'en'
  onOpen: (tab: 'how' | 'settings') => void
}) {
  const { t } = useTranslation('routines')
  const { definition, subscription, blockers } = view
  const tools = routineToolsOf(definition.requires)
  const Icon = FAMILY_ICON[ROUTINE_FAMILY_OF[definition.key]] ?? CalendarClock
  return (
    <article
      data-routine-card
      className="flex w-full min-w-0 flex-col rounded-2xl border border-[var(--bellum-border)] bg-card p-5 transition-colors duration-immediate ease-bellum-out hover:border-[var(--bellum-accent-line)]"
    >
      <Box className="flex items-start justify-between gap-3">
        <span aria-hidden="true" className={THEO_SYMBOL}>
          <Icon className="size-5" />
        </span>
        <Box className="flex flex-wrap items-center justify-end gap-1.5">
          <Text element="span" size="xs" className="tracking-wide text-[var(--bellum-text-muted)]">
            {t(`family.${ROUTINE_FAMILY_OF[definition.key]}`)}
          </Text>
          {/* Hors maquette, gardé : l'état de la routine se lit sans ouvrir la fenêtre. */}
          {subscription.status === 'active' ||
          subscription.status === 'paused' ||
          subscription.status === 'disabled' ? (
            <span className={subscription.status === 'active' ? THEO_PILL_ACCENT : THEO_PILL}>
              {t(`status.${subscription.status}`)}
            </span>
          ) : null}
          {view.updated ? <Badge variant="info">{t('lib.updated')}</Badge> : null}
        </Box>
      </Box>
      <Text element="h3" className="mb-2 mt-3.5 text-base font-semibold leading-snug tracking-tight">
        {definition.name[locale]}
      </Text>
      <Text size="xs" className="mb-4 flex-1 leading-relaxed text-[var(--bellum-text-secondary)]">
        {definition.description[locale]}
      </Text>
      {/* Théo C automations-bibliotheque.N1 — les outils LUS (`.a14-connector`) : ceux de l'espace du client, signalés
          quand ils ne sont pas branchés (le produit dit VRAIMENT si le connecteur l'est — N2). */}
      <Box className="flex min-h-6 flex-wrap items-center gap-1.5">
        {tools.map(tool => {
          const blocker = BLOCKER_OF_TOOL[tool]
          const toConnect = blocker !== undefined && blockers.includes(blocker)
          return toConnect ? (
            <Badge key={tool} variant="warning">
              {t(`tool.${tool}`)} · {t('lib.toConnect')}
            </Badge>
          ) : (
            <span key={tool} className={THEO_PILL}>
              {t(`tool.${tool}`)}
            </span>
          )
        })}
      </Box>
      <Box className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={THEO_BTN_PLAIN_SM} onClick={() => onOpen('how')}>
          {t('lib.seeFunctioning')}
          <span className="sr-only"> : {definition.name[locale]}</span>
        </button>
        <button type="button" className={THEO_BTN_SOFT_SM} onClick={() => onOpen('settings')}>
          {t('lib.adapt')}
          <span className="sr-only"> : {definition.name[locale]}</span>
        </button>
      </Box>
    </article>
  )
}
