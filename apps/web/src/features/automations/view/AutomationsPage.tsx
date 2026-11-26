import { Box, LauraFace, Text } from '@bellum/ui'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Briefcase, CalendarDays, ChevronRight, Mail, Plus, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { useAutomationTrials } from '../api'
import { useAutomationRows } from '../useAutomationRows'
import { AutomationsGuide } from './AutomationsGuide'
import { AutomationsSubNav } from './AutomationsSubNav'
import { SignalSequencesSection } from './SignalSequencesSection'
import { THEO_BTN, THEO_BTN_PLAIN_SM, THEO_BTN_PRIMARY, THEO_EYEBROW } from './theo-classes'

const SUGGESTIONS: readonly { key: 'missionEnd' | 'relance' | 'meetings'; icon: LucideIcon }[] = [
  { key: 'missionEnd', icon: Briefcase },
  { key: 'relance', icon: Mail },
  { key: 'meetings', icon: CalendarDays },
]

/**
 * Théo C automations-liste — « Tes automatisations », le TROISIÈME onglet d'Actions (décision Louis
 * 22/10/2026, `c130_actions_trois_onglets_automatisations_theo` : renverse c122 côté navigation).
 *
 * L'ordre de la maquette, du haut en bas : en-tête (titre, phrase, « Parcourir les routines ») déclaré à la coque,
 * guide replié, le bandeau Laura (`.a14-hero` : portrait, surtitre, « Dis-moi ce que tu veux déléguer. », la zone de
 * saisie et ses trois suggestions), les sous-onglets avec leurs compteurs, puis la barre de filtre et les cartes
 * (`SignalSequencesSection`). Laura PROPOSE la règle, qui naît éteinte ; ce n'est pas un second moteur.
 */
export function AutomationsPage() {
  const { t } = useTranslation('actions')
  const navigate = useNavigate()
  const openLauraInPlace = useOpenLauraInPlace()
  const search = useSearch({ strict: false }) as { depuis?: string }
  const [wish, setWish] = useState('')
  const { rows, routines, loading } = useAutomationRows()
  const trials = useAutomationTrials()

  // #1904 — ce que l'écran déclare à Laura : sa raison d'être et ses gestes rendus.
  useLauraContext({
    kind: 'screen',
    label: t('automations.page.title'),
    entityId: null,
    facets: [],
    state: 'ready',
    purpose: t('automations.page.subtitle'),
    actions: [t('automations.page.create'), t('automations.page.laura.submit')],
  })

  // Théo C automations-liste.R4 — création : la phrase part vers Laura, jamais vers une règle toute seule.
  const askLaura = (event: FormEvent) => {
    event.preventDefault()
    const text = wish.trim()
    if (!text) return
    const prompt = `${t('automations.page.laura.promptPrefix')}${text}`
    // #4345.2 — la bulle est montée : elle s'ouvre avec la phrase (jamais envoyée), la page reste. Repli : `/chat`.
    if (openLauraInPlace) {
      openLauraInPlace(prompt)
      return
    }
    void navigate({ to: '/chat', search: { prompt } })
  }

  return (
    <CustomerPage
      anchorId="automations"
      pageTitle={t('automations.page.title')}
      pageSubtitle={t('automations.page.subtitle')}
      headerActions={
        <Box className="flex flex-wrap items-center gap-2">
          <Link to="/actions/automatisations/bibliotheque" className={THEO_BTN}>
            {t('automations.page.browse')}
          </Link>
          {/* Hors maquette, gardé (à trancher) : le parcours « séquence sur un signal » existant. */}
          <Link to="/actions/sequences" search={{ parcours: 'signal' }} className={THEO_BTN_PLAIN_SM}>
            <Plus className="size-4" aria-hidden="true" />
            {t('automations.page.create')}
          </Link>
        </Box>
      }
    >
      <Box className="flex w-full flex-col">
        <AutomationsGuide />

        {/* Théo C automations-liste.HT-4 — arrivé depuis un dossier de mission : les automatismes du suivi sont ici. */}
        {search.depuis === 'mission' ? (
          <Box
            role="status"
            className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-card border border-[var(--bellum-border)] bg-card px-4 py-3"
          >
            <Text size="sm">{t('automations.page.fromMission')}</Text>
            <Link to="/missions" className={THEO_BTN_PLAIN_SM}>
              {t('automations.page.backToMission')}
            </Link>
          </Box>
        ) : null}

        <section
          aria-labelledby="automations-laura-title"
          data-section="laura"
          className="mb-7 overflow-hidden rounded-3xl border border-[var(--bellum-accent-line)] bg-gradient-to-br from-[var(--bellum-accent-bg)] via-card to-[var(--bellum-surface-2)] p-5 md:px-8 md:py-7"
        >
          <Box className="flex items-start gap-3 md:items-center md:gap-4">
            <LauraFace size={52} decorative className="rounded-2xl shadow-card" />
            <Box className="min-w-0">
              <span className={THEO_EYEBROW}>{t('automations.page.laura.eyebrow')}</span>
              <Text
                element="h2"
                className="mt-2 text-xl font-semibold leading-tight tracking-tight md:text-3xl"
                id="automations-laura-title"
              >
                {t('automations.page.laura.title')}
              </Text>
              <Text size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
                {t('automations.page.laura.help')}
              </Text>
            </Box>
          </Box>
          <form
            className="mt-6 rounded-overlay border border-[var(--bellum-border)] bg-card px-4 pb-2.5 pt-3.5 shadow-card"
            onSubmit={askLaura}
          >
            <label className="sr-only" htmlFor="automations-laura-wish">
              {t('automations.page.laura.label')}
            </label>
            <textarea
              id="automations-laura-wish"
              rows={3}
              maxLength={3000}
              value={wish}
              placeholder={t('automations.page.laura.placeholder')}
              onChange={event => setWish(event.target.value)}
              className="block min-h-16 w-full resize-y border-0 bg-transparent p-0.5 text-base leading-relaxed text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)] focus:outline-none focus-visible:ring-0"
            />
            <Box className="mt-1.5 flex flex-col items-stretch gap-3 border-t border-[var(--bellum-border)] pt-2.5 sm:flex-row sm:items-center sm:justify-between">
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('automations.page.laura.note')}
              </Text>
              <button type="submit" className={`${THEO_BTN_PRIMARY} self-end sm:self-auto`}>
                {t('automations.page.laura.submit')}
              </button>
            </Box>
          </form>
          <Box className="mt-3.5 flex flex-wrap gap-2">
            {SUGGESTIONS.map(({ key, icon: Icon }) => (
              <Link
                key={key}
                to="/chat"
                search={{ prompt: t(`automations.page.laura.suggestions.${key}.prompt`) }}
                className={THEO_BTN}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {t(`automations.page.laura.suggestions.${key}.label`)}
              </Link>
            ))}
            {routines.data ? (
              <Link to="/actions/automatisations/bibliotheque" className={THEO_BTN_PLAIN_SM}>
                <ChevronRight className="size-4" aria-hidden="true" />
                {t('automations.page.laura.routines', { count: routines.data.length })}
              </Link>
            ) : null}
          </Box>
        </section>

        <AutomationsSubNav
          current="mine"
          counts={{
            ...(loading ? {} : { mine: rows.length }),
            ...(routines.data ? { library: routines.data.length } : {}),
            ...(trials.data && trials.data.length > 0 ? { journal: trials.data.length } : {}),
          }}
        />

        <SignalSequencesSection />
      </Box>
    </CustomerPage>
  )
}
