import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

/**
 * Théo A today-equipe.A1 — l'état d'un espace à UN seul membre. `/team` ne
 * redirige plus vers Réglages › Équipe (#4158.10) : l'onglet reste visible et
 * explique pourquoi il est vide, avec le geste qui l'ouvre (inviter un
 * collègue). Aucun chiffre : à un seul, il n'y a rien à répartir.
 */
export function TeamSoloState() {
  const { t } = useTranslation('manager')
  return (
    <div className="w-full space-y-6">
      <header className="space-y-1">
        <Text element="h1" size="2xl" weight="bold" className="text-[var(--bellum-text-primary)]">
          {t('board.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('board.tagline')}
        </Text>
      </header>
      <section className="space-y-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5">
        <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('board.solo.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('board.solo.body')}
        </Text>
        <Link
          to="/settings/team"
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        >
          {t('board.solo.cta')}
        </Link>
      </section>
    </div>
  )
}
