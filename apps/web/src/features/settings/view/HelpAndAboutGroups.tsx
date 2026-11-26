import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, SettingsRow, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { unhideActivationChecklist } from '@/features/onboarding/components/ActivationChecklist'
import { GuideHelpCenter } from '@/features/guide/GuideHelpCenter'
import { useProductTourStore } from '@/features/product-tour/product-tour-store'
import { useSalesScenarioStore } from '@/features/sales-scenario/sales-scenario-store'
import { commitFromBuildId, useApiVersion, webBuildId } from '@/features/settings/hooks/useBuildInfo'

/**
 * Théo D settings-prefs.A2 / A6 — ce que les Préférences portaient en bas de page
 * et qui n'est PAS une préférence : relancer le tutoriel, la visite guidée, le
 * scénario commercial, le centre d'aide, et « À propos » (version web, version
 * API, parité de release, utile au support). Le tutoriel, la visite et le scénario
 * vivent dans Aide & signalements ; « À propos » est dans les Préférences (maquette `settings-prefs`).
 */
export function HelpAndAboutGroups() {
  return (
    <>
      <HelpLinksGroup />
      <ReplayGroup />
    </>
  )
}

/** Théo D settings-outils (Aide) — « Raccourcis » et « Conserver mon travail » : deux renvois, jamais deux copies. */
function HelpLinksGroup() {
  const { t } = useTranslation('settings', { keyPrefix: 'preferences' })
  return (
    <SettingsBlock label={t('helpLinksTitle')}>
      <SettingsRow
        title={t('helpShortcutsTitle')}
        description={t('helpShortcutsDescription')}
        trailing={
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <Link to="/settings/shortcuts">{t('helpShortcutsAction')}</Link>
          </Button>
        }
      />
      <SettingsRow
        title={t('helpKeepWorkTitle')}
        description={t('helpKeepWorkDescription')}
        trailing={
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <Link to="/settings/mes-donnees">{t('helpKeepWorkAction')}</Link>
          </Button>
        }
      />
    </SettingsBlock>
  )
}

function ReplayGroup() {
  const { t } = useTranslation('settings', { keyPrefix: 'preferences' })
  // `onboarding:tour.menuButton` — le MÊME libellé que le bouton jumeau de
  // `ChangelogMenu`, lu SANS `keyPrefix` (un préfixe coller son préfixe AVANT le
  // séparateur `ns:` et casse la résolution, mesuré en test).
  const { t: tOnboarding } = useTranslation('onboarding')
  const { t: tGuide } = useTranslation('guide')
  // #2731 — MÊME store que `ChangelogMenu` (GA-26) : deux PORTES, une seule source.
  const startTour = useProductTourStore(state => state.start)
  const stopTour = useProductTourStore(state => state.stop)
  // #2731.2 — « lancer l'un arrête l'autre » : les deux barres occupent le même
  // emplacement fixe, actives ensemble elles se chevaucheraient.
  const startScenario = useSalesScenarioStore(state => state.start)
  const stopScenario = useSalesScenarioStore(state => state.stop)
  const [helpCenterOpen, setHelpCenterOpen] = useState(false)

  return (
    <SettingsBlock label={t('sectionHelp')}>
      {/* #1794.3 — le geste de réaffichage de la checklist d'activation. */}
      <SettingsRow
        title={t('replayTutorialTitle')}
        description={t('replayTutorialDescription')}
        trailing={
          <Button variant="outline" size="sm" onClick={() => unhideActivationChecklist()}>
            {t('replayTutorialAction')}
          </Button>
        }
      />
      <SettingsRow
        title={t('replayTourTitle')}
        description={t('replayTourDescription')}
        trailing={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              stopScenario()
              startTour()
            }}
          >
            {tOnboarding('tour.menuButton')}
          </Button>
        }
      />
      <SettingsRow
        title={t('replayScenarioTitle')}
        description={t('replayScenarioDescription')}
        trailing={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              stopTour()
              startScenario()
            }}
          >
            {t('replayScenarioAction')}
          </Button>
        }
      />
      {/* #2214.24 — le centre d'aide, même porte qu'au pied de la barre latérale. */}
      <SettingsRow
        title={tGuide('helpCenter.title')}
        description={tGuide('helpCenter.settingsDescription')}
        trailing={
          <Button variant="outline" size="sm" onClick={() => setHelpCenterOpen(true)}>
            {tGuide('helpCenter.open')}
          </Button>
        }
      />
      <GuideHelpCenter open={helpCenterOpen} onOpenChange={setHelpCenterOpen} />
    </SettingsBlock>
  )
}

/**
 * Théo D settings-prefs.A6 — « À propos » vit en bas des Préférences, en repli FERMÉ : utile au support, inutile au
 * quotidien. « Copier pour le support » met les deux versions dans le presse-papiers.
 */
export function BuildInfoAccordion() {
  const { t } = useTranslation('settings', { keyPrefix: 'preferences' })
  const web = webBuildId()
  const webCommit = commitFromBuildId(web)
  const { data: api } = useApiVersion()

  const copy = async (): Promise<void> => {
    const message = t('aboutCopied', { web, api: api?.commit ?? '—' })
    try {
      await navigator.clipboard.writeText(message)
      toast.success(message)
    } catch {
      toast.error(message)
    }
  }

  return (
    <details className="rounded-xl border border-[var(--bellum-border)] bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-5 py-2 text-sm font-medium sm:px-6">
        {t('aboutSummary')}
      </summary>
      <div className="border-t border-[var(--bellum-border)]">
        <SettingsRow
          title={t('aboutWebVersionTitle')}
          description={t('aboutWebVersionDescription')}
          trailing={<BuildValue value={web} />}
        />
        <SettingsRow
          title={t('aboutApiVersionTitle')}
          description={
            api ? t('aboutApiVersionEnvironment', { environment: api.environment }) : t('aboutApiVersionFallback')
          }
          trailing={<BuildValue value={api?.commit ?? '—'} />}
        />
        <SettingsRow
          title={t('aboutParityTitle')}
          description={t('aboutParityDescription')}
          trailing={<ParityBadge webCommit={webCommit} apiCommit={api?.commit ?? null} />}
        />
        <div className="flex justify-end px-5 py-3 sm:px-6">
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => void copy()}>
            {t('aboutCopy')}
          </Button>
        </div>
      </div>
    </details>
  )
}

function BuildValue({ value }: { value: string }) {
  return (
    <Text size="xs" className="font-mono text-[var(--bellum-text-secondary)] tabular-nums">
      {value}
    </Text>
  )
}

/** Compare the web git SHA with the API commit when both are known. Unknown
 *  values (dev, missing env) render as neutral rather than a false mismatch. */
function ParityBadge({ webCommit, apiCommit }: { webCommit: string | null; apiCommit: string | null }) {
  const { t } = useTranslation('settings', { keyPrefix: 'preferences' })
  if (!webCommit || !apiCommit || apiCommit === 'unknown') {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('aboutParityUnknown')}
      </Text>
    )
  }
  // API commit is the full SHA; the web build id carries a 10-char prefix.
  const match = apiCommit.startsWith(webCommit) || webCommit.startsWith(apiCommit)
  return (
    <Text
      size="xs"
      weight="semibold"
      className={match ? 'text-[var(--success-soft-text)]' : 'text-[var(--danger-soft-text)]'}
    >
      {match ? t('aboutParityMatch') : t('aboutParityMismatch')}
    </Text>
  )
}
