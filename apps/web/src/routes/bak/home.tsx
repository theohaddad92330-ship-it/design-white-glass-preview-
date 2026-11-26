import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { Text } from '@bellum/ui'
import { CustomerPage } from '@/components/page/CustomerPage'
import { BackofficeConsoleLink } from '@/features/backoffice/BackofficeConsoleLink'

/**
 * Le repère du back-office opérateur — D34 · 26/08 (Louis, 28/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN DISAIT AVANT
 * ─────────────────────────────────────────────────────────────────────────
 * Un titre, puis « À implémenter. » — la seule phrase de l'application qui
 * admettait qu'un écran n'existe pas. Rendue hors de toute coquille (un
 * `<main>` plein écran, sans barre latérale), sur la route où l'accueil
 * ENVOYAIT d'office tout porteur du rôle `backoffice`. Aucune sortie.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL EST RENDU DANS LA COQUE CLIENT, ET C'EST LE FOND DE LA DÉCISION
 * ─────────────────────────────────────────────────────────────────────────
 * Un opérateur reste un utilisateur : il garde sa barre latérale, donc sa
 * sortie. L'entrée back-office s'AJOUTE à sa navigation au lieu de s'y
 * substituer — c'est la seule issue qui ne perd rien, que le rôle soit porté
 * ou non.
 *
 * L'adresse de la console, elle, vit dans `BackofficeConsoleLink` : elle vient
 * du SERVEUR et de nulle part ailleurs, jamais d'une variable de bundle.
 */
function BackofficeHome() {
  const { t } = useTranslation('routes')
  return (
    // L'entête de page porte déjà le nom de l'écran et sa phrase : pas de titre répété
    // dans le corps (loi 4 du tome 7 — rien n'apparaît deux fois sous la même forme).
    <CustomerPage pageTitle={t('backoffice.heading')} pageSubtitle={t('backoffice.lead')}>
      {/* Refonte Théo (PR12) — la phrase vit dans l'en-tête de la coque ; le corps est UN bloc
          de réglage (`.v12-setting-block`) : son titre au-dessus d'un filet, puis l'accès. */}
      <section
        aria-labelledby="backoffice-console"
        className="flex max-w-3xl flex-col gap-4 rounded-card border border-[var(--bellum-border)] bg-card px-5 py-5 sm:px-6"
      >
        <header className="flex items-center gap-3 border-b border-[var(--bellum-border)] pb-4">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-control bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]"
          >
            <ShieldCheck className="size-4" />
          </span>
          <Text element="h2" id="backoffice-console" size="base" weight="semibold">
            {t('backoffice.consoleTitle')}
          </Text>
        </header>
        <BackofficeConsoleLink />
      </section>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-3">
        {t('backoffice.stays')}
      </Text>
    </CustomerPage>
  )
}

export const Route = createFileRoute('/bak/home')({
  component: BackofficeHome,
})
