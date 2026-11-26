import { ROUTINE_ACTION_LEVEL, type RoutineView } from '@bellum/contracts'
import { Badge, Box, Button, Card, Spinner, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNoReplyFollowUpDryRun, useRoutineObservation, useRoutines, useRunRoutineNow } from '../api'
import {
  RoutineDryRunResult,
  RoutineMaxItemsPerRunControl,
  RoutineGovernanceControls,
  RoutineScheduleControls,
  RoutineStatusControl,
} from './RoutineControls'
import { RoutineCardAttributes } from './RoutineCardAttributes'
import { RoutineContentEditor } from './RoutineContentEditor'

/**
 * LA FICHE D'UNE AUTOMATISATION — #2916 (#2399.1/.3/.5).
 *
 * `RoutinesView` restait une LISTE À INTERRUPTEURS : chaque routine tenait ses
 * dix-sept attributs empilés dans une carte de liste, jamais une adresse à
 * elle. Sans adresse, aucun parcours comprendre→exemple→simuler→configurer→
 * activer n'est possible — on ne peut pas ouvrir « juste celle-là », la
 * partager, ni y revenir par lien.
 *
 * Aucune lecture neuve : `useRoutines()` (déjà en cache, `staleTime: 30_000`)
 * porte la fiche complète — cette page ne fait qu'OUVRIR une entrée qui
 * existait déjà dans la réponse.
 */
/**
 * `embedded` — monté dans le TIROIR de Réglages › Laura › Routines & veilles (maquette `settings-laura`, Louis
 * 22/10/2026 : « on garde la liste en vue ») : pas de lien « retour à la bibliothèque » (le tiroir se ferme), et le
 * titre descend d'un cran (la page porte déjà son titre de niveau 1).
 */
export function RoutineDetailPage({ routineKey, embedded = false }: { routineKey: string; embedded?: boolean }) {
  const { t, i18n } = useTranslation('routines')
  const { data, isLoading, isError } = useRoutines()
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'
  // #2843 / #2398.13 — la simulation ne charge qu'à l'ouverture du panneau.
  const [showDryRun, setShowDryRun] = useState(false)
  const supportsDryRun = routineKey === 'no_reply_follow_up'
  const dryRun = useNoReplyFollowUpDryRun(supportsDryRun && showDryRun)

  if (isLoading) {
    return (
      <Box className="flex h-48 flex-col items-center justify-center gap-2">
        <Spinner />
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('library.loading')}
        </Text>
      </Box>
    )
  }

  const view = data?.find(item => item.definition.key === routineKey)

  if (isError || !view) {
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <Text weight="medium">{t('library.notFoundTitle')}</Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('library.notFoundBody')}
        </Text>
        {embedded ? null : <BackToLibrary />}
      </Card>
    )
  }

  const { definition } = view

  return (
    <Box className="flex w-full flex-col gap-4">
      {embedded ? null : <BackToLibrary />}
      <Box className="flex flex-col gap-1">
        <Text element={embedded ? 'h2' : 'h1'} size="lg" weight="semibold">
          {definition.name[locale]}
        </Text>
        <Box className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {t(`cadence.${definition.cadence}`)}
          </Badge>
          <Badge variant="info" className="text-xs">
            {t(`level.${definition.automationLevel}`)}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {t('field.version', { version: definition.version })}
          </Badge>
        </Box>
      </Box>

      {/* #2843.26 (lot L13) — LE PARCOURS D'ACTIVATION en sept étapes :
          comprendre, voir un exemple, simuler, configurer, valider, activer,
          observer. Même contenu qu'avant (aucune lecture neuve hors
          l'observation 30 jours et « lancer maintenant ») : la fiche est
          rangée dans l'ordre où l'on décide, et c'est la même pour TOUTES les
          routines (#2843.15). */}
      <ol aria-label={t('journey.title')} className="flex flex-col gap-3">
        <JourneyStep index={1} title={t('journey.understand')}>
          {/* Mêmes clés i18n que la carte de liste (`RoutineRow`) — un attribut
              ne se relibelle pas deux fois sous une forme différente (GA-26). */}
          <Text size="sm">{definition.description[locale]}</Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {definition.outcome[locale]}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('actions:actionLevel.current', {
              level: t(`actions:actionLevel.levels.${ROUTINE_ACTION_LEVEL[definition.automationLevel]}`),
            })}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('field.condition', { condition: definition.condition[locale] })}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('field.reads', { reads: definition.reads[locale] })}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('field.acceptance', { acceptance: definition.acceptance[locale] })}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('field.fallback', { fallback: definition.fallback[locale] })}
          </Text>
          {/* #2398.6/#2398.14 — la condition d'arrêt, visible avant le geste. */}
          {definition.stopCondition ? (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('field.stopCondition', { stopCondition: definition.stopCondition[locale] })}
            </Text>
          ) : null}
          {/* #2843.24 — risque 0-4, rôles, déroulé, ce qu'elle laisse ; jamais le coût (c132). */}
          <RoutineCardAttributes definition={definition} />
        </JourneyStep>

        <JourneyStep index={2} title={t('journey.example')}>
          {/* #2399.3 — `null` = non renseigné : on le dit, on n'invente pas
              d'exemple (doctrine « jamais de donnée fictive »). */}
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {definition.example
              ? t('field.example', { example: definition.example[locale] })
              : t('journey.exampleMissing')}
          </Text>
        </JourneyStep>

        <JourneyStep index={3} title={t('journey.simulate')}>
          <RoutineObservationLine routineKey={definition.key} />
          <Button size="sm" variant="outline" className="self-start" onClick={() => setShowDryRun(v => !v)}>
            {showDryRun ? t('dryRun.hide') : t('dryRun.show')}
          </Button>
          {/* #2399.5 — « simuler » pour TOUTE routine : la simulation dédiée quand elle
              existe (la cible se calcule sans écrire), sinon celle, générique, que la
              fiche suffit à dire. Une seule à la fois, jamais deux. */}
          {showDryRun ? (
            supportsDryRun ? (
              <RoutineDryRunResult query={dryRun} />
            ) : (
              <GenericRoutineSimulation view={view} locale={locale} />
            )
          ) : null}
        </JourneyStep>

        <JourneyStep index={4} title={t('journey.configure')}>
          {/* #2843 / #2398.11 — UN formulaire générique (c75). */}
          <Box className="flex flex-wrap items-start gap-3" aria-label={t('config.title')}>
            {/* #2843.13 — autonomie, owner, portée, validations. */}
            <RoutineGovernanceControls view={view} />
            <RoutineScheduleControls view={view} />
            <RoutineMaxItemsPerRunControl view={view} />
          </Box>
          {/* #2843.30 — le contenu exact de la notification, pour l'espace, avec retour au défaut. */}
          <RoutineContentEditor routineKey={definition.key} />
        </JourneyStep>

        <JourneyStep index={5} title={t('journey.validate')}>
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('journey.validateBody')}
          </Text>
        </JourneyStep>

        <JourneyStep index={6} title={t('journey.activate')}>
          {/* Activer passe par la porte de prévisualisation (#2398.14). */}
          {view.subscription.status === 'error' ? (
            <Text size="sm" className="text-[var(--danger-soft-text)]" role="status">
              {t('journey.errorStatus')}
            </Text>
          ) : null}
          <Box className="self-start">
            <RoutineStatusControl view={view} />
          </Box>
        </JourneyStep>

        <JourneyStep index={7} title={t('journey.observe')}>
          {view.nextTriggerAt ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('nextTrigger.at', {
                date: new Intl.DateTimeFormat(i18n.language, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(view.nextTriggerAt)),
              })}
            </Text>
          ) : null}
          {view.lastOutcome ? (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('journey.lastOutcome', { outcome: view.lastOutcome })}
            </Text>
          ) : null}
          <RunNowButton view={view} />
        </JourneyStep>
      </ol>
    </Box>
  )
}

/** Une étape du parcours : un titre numéroté, puis son contenu. */
function JourneyStep({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <li>
      <Card className="flex flex-col gap-2 p-4">
        <Text element="h3" size="sm" weight="medium">
          {`${index}. ${title}`}
        </Text>
        {children}
      </Card>
    </li>
  )
}

/**
 * #2843.18 — ce que la routine a RÉELLEMENT donné sur trente jours, pour ce
 * compte. Aucune exécution = « rien n'a été mesuré », jamais « 0 résultat »
 * (GA-18/19). Ni coût ni durée : back-office seul (c132).
 */
function RoutineObservationLine({ routineKey }: { routineKey: string }) {
  const { t } = useTranslation('routines')
  const { data, isLoading, isError } = useRoutineObservation(routineKey)
  if (isLoading) return <Spinner />
  if (isError || !data) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('journey.observationError')}
      </Text>
    )
  }
  if (data.runs === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('journey.observationNone')}
      </Text>
    )
  }
  return (
    <Box className="flex flex-col gap-0.5">
      <Text size="sm">{t('journey.observationRuns', { count: data.runs })}</Text>
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {`${t('journey.observationNotified', { count: data.notified })} · ${t('journey.observationFailed', { count: data.failed })}`}
      </Text>
    </Box>
  )
}

/**
 * #2843.10 — « lancer maintenant » : exécute CETTE routine hors horaire. Le
 * refus se NOMME (démo, capacité manquante, clic doublé), jamais en silence.
 */
function RunNowButton({ view }: { view: RoutineView }) {
  const { t } = useTranslation('routines')
  const run = useRunRoutineNow()
  const result = run.data
  return (
    <Box className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={run.isPending || view.blockers.length > 0}
        onClick={() => run.mutate(view.definition.key)}
      >
        {t('journey.runNow')}
      </Button>
      {result ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]" role="status">
          {result.executed
            ? t('journey.runNowDone', { outcome: result.outcome ?? '' })
            : t(`journey.runNowRefused.${result.reason ?? 'already_running'}`)}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * #2399.5 — la simulation GÉNÉRIQUE : ce que la fiche dit déjà, relu au
 * conditionnel, plus l'état des prérequis AUJOURD'HUI (`view.blockers`, la même
 * lecture que la carte). Ni résultat chiffré ni probabilité : rien n'est
 * calculé qui ne soit déjà écrit dans le catalogue ou lu sur l'espace.
 */
function GenericRoutineSimulation({ view, locale }: { view: RoutineView; locale: 'fr' | 'en' }) {
  const { t } = useTranslation('routines')
  const { definition, blockers } = view
  return (
    <Box className="flex flex-col gap-1 rounded-md border border-[var(--bellum-border)] p-3">
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('simulation.reads', { reads: definition.reads[locale] })}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('simulation.condition', { condition: definition.condition[locale] })}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('simulation.outcome', { outcome: definition.outcome[locale] })}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {blockers.length === 0 ? t('simulation.ready') : blockers.map(blocker => t(`blocker.${blocker}`)).join(' ')}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('simulation.note')}
      </Text>
    </Box>
  )
}

function BackToLibrary() {
  const { t } = useTranslation('routines')
  return (
    <Link to="/settings/routines" className="inline-flex items-center gap-1 text-sm hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('library.backToLibrary')}
    </Link>
  )
}
