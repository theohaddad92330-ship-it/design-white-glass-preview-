import { useNavigate } from '@tanstack/react-router'
import { Button, Card, Text } from '@bellum/ui'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCredits } from '../hooks/useCredits'
import { isWindowedPlan } from '../lib/windowedPlan'

/**
 * Upsell card prompting trial / lower-tier users to upgrade. Renders `null` for
 * users already on the top plan (Growth), so callers don't need to gate it
 * themselves. Source of truth for the plan is `subscriptions.plan` (useCredits).
 */
export const UpgradeCard = memo(function UpgradeCard() {
  const { t } = useTranslation('billing')
  const navigate = useNavigate()
  const { credits } = useCredits()

  // Espace de démonstration : rien à vendre, et « avant la fin de votre essai »
  // contredirait le bandeau « Mode démo ». Le visiteur du lien ouvert ne voit
  // aucun upsell.
  if (credits?.is_demo === true) return null
  // Plan unknown (in flight or failed): render nothing rather than guess. The
  // old fallback assumed `trial`, so a Growth customer was shown an upsell —
  // and « Choisissez un plan », as if they had none.
  if (!credits || credits.plan === 'growth') return null
  // Compte bêta : le testeur n'achète rien, la carte « Booste avec l'IA » n'a
  // pas de sens (#3552).
  if (credits.plan === 'beta') return null

  const onTrial = isWindowedPlan(credits.plan)

  return (
    // Théo : une carte à filet sans ombre, le geste en `soft` (l'accent sans aplat plein — la barre latérale
    // a déjà son geste primaire, « Demander à Laura »).
    <Card className="m-1 rounded-card border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3.5 shadow-none">
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('upgrade.title')}
      </Text>
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
        {onTrial ? t('upgrade.subtitleTrial') : t('upgrade.subtitleUpgrade')}
      </Text>
      <Button
        variant="soft"
        fullWidth
        size="sm"
        className="mt-2.5"
        onClick={() => navigate({ to: '/billing', search: { offers: true } })}
      >
        {onTrial ? t('cta.choosePlan') : t('cta.changePlan')}
      </Button>
    </Card>
  )
})
