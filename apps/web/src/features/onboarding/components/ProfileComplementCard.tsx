import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { Sparkles } from 'lucide-react'
import { ProfileQuestionnaireDialog } from '@/features/onboarding/components/ProfileQuestionnaireDialog'
import { useProfileComplement } from '@/features/onboarding/hooks/useProfileComplement'

/**
 * Temps 2 — l'invitation à compléter son profil, APRÈS la première analyse
 * terminée.
 *
 * Trois garde-fous produit, tous portés par le serveur (`visible`) :
 *  - elle n'apparaît jamais avant qu'un dossier ait été VU (statut `locked`) ;
 *  - « Plus tard » la repousse de quelques jours, sans rien perdre ;
 *  - « Ne plus me le proposer » la retire définitivement.
 * À aucun moment elle ne barre l'accès au produit : c'est une carte, pas un mur.
 */
export function ProfileComplementCard() {
  const { t } = useTranslation('onboarding')
  const { state, snooze, dismiss } = useProfileComplement()
  const [open, setOpen] = useState(false)

  // Pas de donnée (chargement/erreur) ou pas encore proposable → rien.
  if (!state?.visible) return null

  const started = state.answered_count > 0

  return (
    <>
      <div className="mb-4 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-[var(--bellum-surface-2)] p-2">
              <Sparkles className="h-4 w-4 text-[var(--bellum-text-accent)]" />
            </span>
            <div className="space-y-1">
              <Text element="h2" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {t('complement.card.title')}
              </Text>
              <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('complement.card.subtitle', { count: state.total_count })}
              </Text>
              {started && (
                <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('complement.card.progress', { done: state.answered_count, total: state.total_count })}
                </Text>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setOpen(true)}>
              {started ? t('complement.card.resume') : t('complement.card.start')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => snooze.mutate()} disabled={snooze.isPending}>
              {t('complement.card.later')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss.mutate()} disabled={dismiss.isPending}>
              {t('complement.card.never')}
            </Button>
          </div>
        </div>
      </div>

      <ProfileQuestionnaireDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
