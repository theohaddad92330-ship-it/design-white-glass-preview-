import { Box, Button, TYPE_SCALE, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { FinanceChainStrip } from '../chain/view/FinanceChainStrip'
import { InvoiceReadinessPanel } from './InvoiceReadinessPanel'
import { OverdueThirtyDaysCard } from './OverdueThirtyDaysCard'

/**
 * FACTURATION — sa propre route (§8), et non plus un onglet des Missions.
 *
 * C'est la vue qu'on ouvre le 5 du mois, et c'est aussi celle vers laquelle
 * pointent les notifications de routine : une notification qui atterrit sur un
 * onglet qu'il faut ensuite trouver ne sert à rien.
 *
 * Le bandeau du haut est PERMANENT : Bellum n'émet aucune facture, et le dire
 * une fois en petit ne suffit pas — c'est la phrase qui empêche quelqu'un
 * d'envoyer un montant préparatoire à un client.
 */
/**
 * #4197 (L6, Louis 14/10/2026) — LA PORTE DES ÉCRANS DE GESTION.
 *
 * Missions n'a plus que trois onglets (En cours · Planning · Facturation) ; les
 * huit écrans d'administration vivent dans `off-nav-screens.ts` et se joignent
 * d'ici — le 5 du mois, on enchaîne relevé, ADV, facture, encaissement. Les
 * libellés sont ceux qu'ils portaient en onglet (`nav:tabs.*`). `/missions/nouvelle`
 * n'y est pas : c'est le bouton « Nouvelle mission » de « En cours ».
 */
const ADMINISTRATION_SCREENS = [
  { to: '/missions/cra', labelKey: 'tabs.missionsCra' },
  { to: '/missions/adv', labelKey: 'tabs.missionsAdv' },
  { to: '/missions/factures', labelKey: 'tabs.missionsInvoiceList' },
  { to: '/missions/encaissements', labelKey: 'tabs.missionsCollections' },
  { to: '/missions/finance', labelKey: 'tabs.missionsFinance' },
  { to: '/missions/suivi', labelKey: 'tabs.missionsTracking' },
  { to: '/pilotage/rex', labelKey: 'tabs.rex' },
] as const

export function InvoicingPage() {
  const { t } = useTranslation('missions')
  const { t: tNav } = useTranslation('nav')
  return (
    <CustomerPage titleInScreen pageTitle={t('invoicing.title')}>
      <Box className="space-y-5 py-4">
        {/* Théo C missions-preparation — le titre de la page appliquée, sa phrase, et la règle (« Bellum
            n'émet aucune facture ») en légende plutôt qu'en bandeau. */}
        <Box data-slot="invoicing-head" className="flex flex-col gap-1">
          <Text element="h1" className={TYPE_SCALE.pageTitle}>
            {t('invoicing.heading')}
          </Text>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('invoicing.intro')}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('invoicing.banner')}
          </Text>
        </Box>
        {/* #4197 — les écrans de gestion vivent hors de la barre : cette rangée est leur porte. Gardée telle
            quelle (la maquette les met en onglets de section — à trancher). */}
        <nav aria-label={t('invoicing.administration')} className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]" weight="medium" className="me-2">
            {t('invoicing.administration')}
          </Text>
          {ADMINISTRATION_SCREENS.map(screen => (
            <Link
              key={screen.to}
              to={screen.to}
              className="inline-flex min-h-11 items-center rounded-control px-2.5 text-sm text-[var(--bellum-text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--bellum-text-primary)] md:min-h-8"
            >
              {tNav(screen.labelKey)}
            </Link>
          ))}
        </nav>
        <FinanceChainStrip current="controls" />
        <InvoiceReadinessPanel />
        {/* #3192.2 — la carte « facture 30 jours » vit sur son écran ; Théo la pose SOUS le tableau. */}
        <OverdueThirtyDaysCard />
        {/* Théo C missions-preparation.R6 — le contrôle ADV, en pied : une carte à filet d'accent à gauche. */}
        <section
          data-slot="invoicing-adv"
          className="space-y-2 rounded-2xl border border-border border-l-4 border-l-[var(--bellum-text-accent)] bg-card p-5 md:p-6"
        >
          <Text
            element="span"
            size="xs"
            weight="semibold"
            color="text-[var(--bellum-text-muted)]"
            className="block uppercase tracking-widest"
          >
            {t('invoicing.adv.title')}
          </Text>
          <Text element="h2" className={TYPE_SCALE.sectionTitle}>
            {t('invoicing.adv.lead')}
          </Text>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('invoicing.adv.body')}
          </Text>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="gap-1.5 border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
          >
            <Link to="/missions/adv">
              <Check className="size-4" aria-hidden />
              {t('invoicing.adv.cta')}
            </Link>
          </Button>
        </section>
      </Box>
    </CustomerPage>
  )
}
