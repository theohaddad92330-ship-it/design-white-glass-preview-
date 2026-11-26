import { Box, Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Text } from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ApprovalSettingsCard } from '@/features/action-os/view/ApprovalSettingsCard'
import { LauraCataloguePanel } from '@/features/laura/view/LauraCataloguePanel'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { RoutineDetailPage } from '@/features/routines/view/RoutineDetailPage'
import { RoutinesView } from '@/features/routines/view/RoutinesView'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { SettingsScreenHeader } from '@/features/settings/components/SettingsScreenHeader'

/**
 * RÉGLAGES › LAURA › ROUTINES & VEILLES (maquette `settings-laura`, Théo V22 — Louis 22/10/2026).
 * Aucun réglage n'est recodé : chaque bloc MONTE la vue qui le porte déjà (GA-26).
 */

/**
 * Routines & veilles (R4) : « Toutes tes automatisations, au même endroit ». La bibliothèque des routines reste LA
 * liste (aucun second catalogue) ; autour d'elle, les renvois de Théo — veilles → Mes cibles, plages et objectifs →
 * Équipe — et ce que les maquettes amendées y rangent : l'autonomie des actions de l'espace (A4), ce que Laura peut
 * te proposer (A5, qui quitte Notifications), et le détail d'une routine en TIROIR (la liste reste en vue).
 */
// Théo D settings-laura.R4 / N4 / A4 / A5 — Routines & veilles : « Ouvrir avec Laura » (N4), autonomie de l'espace (A4),
// détail d'une routine en tiroir (A4), « Ce que Laura peut te proposer » (A5).
export function LauraRoutinesPage({ routineKey }: { routineKey: string | undefined }) {
  const { t } = useTranslation('settingsHub')
  const { t: tr } = useTranslation('routines')
  const navigate = useNavigate()
  const openLauraInPlace = useOpenLauraInPlace()

  const askLaura = () => {
    const prompt = t('routines.askLauraPrompt')
    // `prompt` PRÉ-REMPLIT et n'envoie pas : le commercial relit avant d'envoyer.
    if (openLauraInPlace) {
      openLauraInPlace(prompt)
      return
    }
    void navigate({ to: '/chat', search: { prompt } })
  }

  // Maquette `settings-laura` (Routines & veilles) : la bannière « Ouvrir avec Laura », l'en-tête, puis les blocs —
  // Veilles sur les comptes · Automatisations de travail · Autonomie de l'espace · Ce que Laura peut te proposer ·
  // Plages et objectifs. Chaque bloc MONTE la vue qui porte déjà le réglage (GA-26).
  return (
    <Box className="flex w-full flex-col gap-6">
      {/* Théo D settings-laura (Routines & veilles) — « Ouvrir avec Laura » (N4) est le geste de l'en-tête ; la phrase du
          hub reste sous le titre. Puis, dans l'ordre de la maquette : Veilles sur les comptes, Automatisations de
          travail (LA liste), Autonomie des actions de l'espace, et « Plages et objectifs » en repli. */}
      {/* Intégration PR12 × réglages (23/10) — la bannière « Ouvrir avec Laura » de la maquette AU-DESSUS de l'en-tête
          (PR12), l'en-tête à eyebrow « Personnel » et « Plages et objectifs » en repli fermé (réglages). */}
      <Box
        data-testid="routines-banner"
        className="flex flex-col items-start gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-accent-bg)] p-4 md:flex-row md:items-center md:justify-between"
      >
        <Box className="min-w-0">
          <Text element="p" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {t('routines.hub.title')}
          </Text>
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
            {t('routines.hub.description')}
          </Text>
        </Box>
        <Button type="button" variant="outline" className="min-h-11 shrink-0 gap-1.5" onClick={askLaura}>
          <Sparkles aria-hidden className="size-4" />
          {t('routines.hub.askLaura')}
        </Button>
      </Box>
      <SettingsScreenHeader scope="personal" title={t('routines.title')} description={t('routines.subtitle')} />

      <Box data-testid="routines-blocks" className="flex w-full flex-col gap-6">
        <SettingsBlock label={t('routines.watches.title')} description={t('routines.watches.description')}>
          <Box className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
            <Text element="p" size="sm" weight="medium">
              {t('routines.watches.rowTitle')}
            </Text>
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to="/signals/watches">{t('routines.watches.link')}</Link>
            </Button>
          </Box>
        </SettingsBlock>

        <RoutinesView embedded />

        {/* #4016 L6 — l'autonomie de l'espace (N2-N5) et ses seuils ; en lecture pour qui n'est pas administrateur. */}
        <ApprovalSettingsCard />

        {/* A5 — ce que Laura peut te proposer, rangé avec les automatisations ; chaque proposition se coupe dans
          Notifications. Hors maquette Théo, gardé (à trancher par Louis). */}
        <LauraCataloguePanel />
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('routines.catalogueCut')}{' '}
          <Link to="/settings/notifications" className="text-[var(--bellum-text-accent)] underline">
            {t('routines.catalogueCutLink')}
          </Link>
        </Text>

        <details className="rounded-card border border-[var(--bellum-border)] bg-card">
          <summary className="flex min-h-11 cursor-pointer items-center px-5 text-sm font-medium sm:px-6">
            <h2 className="text-sm font-medium">{t('routines.ranges.title')}</h2>
          </summary>
          <Box className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bellum-border)] px-5 py-3 sm:px-6">
            <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="max-w-xl">
              {t('routines.ranges.description')}
            </Text>
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to="/team">{t('routines.ranges.link')}</Link>
            </Button>
          </Box>
        </details>
      </Box>

      <Sheet
        open={routineKey !== undefined}
        onOpenChange={open => {
          if (!open) void navigate({ to: '/settings/routines', search: {}, replace: true })
        }}
      >
        <SheetContent side="right" closeLabel={t('routines.drawer.close')} className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="sr-only">{t('routines.drawer.title')}</SheetTitle>
            <SheetDescription className="sr-only">{t('routines.drawer.description')}</SheetDescription>
          </SheetHeader>
          <Box className="px-4 pb-6">
            {routineKey === undefined ? null : <RoutineDetailPage routineKey={routineKey} embedded />}
          </Box>
        </SheetContent>
      </Sheet>
    </Box>
  )
}
