import type { AutomationTrialView } from '@bellum/contracts'
import { Badge, Box, Spinner, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useRoutines } from '@/features/routines/api'
import { useAutomationRules, useAutomationTrials } from '../api'
import { AutomationsGuide } from './AutomationsGuide'
import { AutomationsSubNav } from './AutomationsSubNav'
import { THEO_BTN, THEO_BTN_PLAIN_SM, THEO_CARD } from './theo-classes'

/**
 * Théo C automations-bibliotheque.N3 (et R4) — LE JOURNAL DES ESSAIS : « Le journal de tes essais ». Ce qui a été testé
 * avant d'être conservé, du plus récent au plus ancien. Un essai lit les vraies données de l'espace et ne crée ni tâche
 * ni message : « un essai n'est jamais une preuve d'envoi réel », et aucune ligne ne le laisse croire.
 *
 * Un essai qui n'a rien pu lire se NOMME (« Impossible : … ») et ne compte rien — jamais « 0 situation » quand on n'a
 * rien lu. Les comptes sont ceux de l'essai, jamais recalculés ici.
 */
export function AutomationTrialsJournalPage() {
  const { t, i18n } = useTranslation('routines')
  const trials = useAutomationTrials()
  const rules = useAutomationRules()
  const routines = useRoutines()

  return (
    <CustomerPage
      anchorId="automations-journal"
      pageTitle={t('journal.title')}
      pageSubtitle={t('journal.subtitle')}
      headerActions={
        <Link to="/actions/automatisations" className={THEO_BTN}>
          {t('subnav.mine')}
        </Link>
      }
    >
      <Box className="flex w-full flex-col">
        <AutomationsGuide />

        <AutomationsSubNav
          current="journal"
          counts={{
            ...(routines.data ? { library: routines.data.length } : {}),
            ...(rules.data ? { mine: rules.data.length } : {}),
            ...(trials.data && trials.data.length > 0 ? { journal: trials.data.length } : {}),
          }}
        />

        {trials.isLoading ? (
          <Box className="flex h-32 items-center justify-center">
            <Spinner />
          </Box>
        ) : trials.isError || !trials.data ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('journal.loadError')}
          </Text>
        ) : trials.data.length === 0 ? (
          <Box className={`${THEO_CARD} flex flex-col items-start gap-3`}>
            <Text size="sm">{t('journal.empty')}</Text>
            <AskLaura question={t('journal.emptyQuestion')} label={t('journal.emptyAsk')} alwaysVisible />
          </Box>
        ) : (
          <ul
            aria-label={t('journal.listLabel')}
            className="overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-card"
          >
            {trials.data.map(trial => (
              <li key={trial.id} className="border-b border-[var(--bellum-border)] last:border-b-0">
                <TrialRow trial={trial} language={i18n.language} />
              </li>
            ))}
          </ul>
        )}

        <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('journal.footnote')}
        </Text>
      </Box>
    </CustomerPage>
  )
}

function TrialRow({ trial, language }: { trial: AutomationTrialView; language: string }) {
  const { t } = useTranslation('routines')
  const when = new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(trial.created_at))
  const failed = trial.outcome === 'failed'
  return (
    <Box className="flex min-h-11 items-center gap-3 px-3.5 py-3">
      {/* `.t-dot` — vert : l'essai a lu ; ambre : il n'a rien pu lire. La couleur dit un état. */}
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${failed ? 'bg-[var(--warning-soft-text)]' : 'bg-[var(--success-soft-text)]'}`}
      />
      <Box className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Box className="flex flex-wrap items-center gap-2">
          <Text element="h3" size="sm" weight="semibold" className="min-w-0">
            {trial.rule_name}
          </Text>
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {when}
          </Text>
        </Box>
        <Box className="flex flex-wrap items-center gap-2">
          <Badge variant={failed ? 'warning' : 'default'}>{t(`journal.kind.${trial.target}`)}</Badge>
          {failed ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('journal.failed', { reason: trial.reason ?? '' })}
            </Text>
          ) : (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {trial.situations_read === null || trial.situations_read === 0
                ? t('journal.readNone')
                : t('journal.read', { count: trial.situations_read })}
              {trial.situation_labels.length > 0 ? ` (${trial.situation_labels.join(', ')})` : ''}
              {' · '}
              {trial.would_act === null || trial.would_act === 0
                ? t('journal.wouldActNone')
                : t('journal.wouldAct', { count: trial.would_act })}
            </Text>
          )}
        </Box>
      </Box>
      {/* Une règle supprimée depuis ne laisse pas de lien mort : l'essai survit, sa règle n'est plus ouvrable. */}
      {trial.rule_id ? (
        <Link
          to="/actions/automatisations/$id"
          params={{ id: trial.rule_id }}
          aria-label={t('journal.openRuleFor', { name: trial.rule_name })}
          className={`${THEO_BTN_PLAIN_SM} shrink-0`}
        >
          {t('journal.openRule')}
        </Link>
      ) : null}
    </Box>
  )
}
