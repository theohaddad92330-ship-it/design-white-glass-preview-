import { useState } from 'react'
import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Card, CardContent, Text } from '@bellum/ui'

/** Exportée pour les tests (#2018.6) : « déjà vu cet onglet » sans dupliquer
 *  la chaîne — même convention que `RESUME_FLAG_KEY` (`OnboardingLauraGuide.tsx`). */
export const INHERITED_BANNER_FLAG_KEY = 'bellum:onboarding-inherited-banner-shown'

/**
 * #2018.6 — « Voici ce que ton équipe a déjà configuré. »
 *
 * Un nouveau membre d'un workspace DÉJÀ configuré n'a pas à deviner que la
 * fiche entreprise (`inherited_answer_keys`, calculée côté API) arrive toute
 * faite : sans ce bandeau, il découvre les questions d'entreprise absentes du
 * parcours sans qu'on lui ait dit pourquoi.
 *
 * `firstPendingSubStep` renvoie ce membre directement sur sa première
 * sous-étape PERSONNELLE, jamais `company_info/entreprise` (index 0) — donc
 * `isFirst`/`showIntro` (`OnboardingWizard.tsx`, gagés sur `sub.index === 0`)
 * ne peuvent pas porter ce message. Même mécanique que
 * `OnboardingLauraGuide` (#2020.7) pour ne le montrer qu'UNE fois par onglet :
 * une bannière qui reviendrait à chaque sous-étape lasserait plus qu'elle
 * n'informerait.
 */
export function InheritedProfileBanner({ inheritedKeys }: { inheritedKeys: readonly string[] }) {
  const { t } = useTranslation('onboarding')
  const [dismissed, setDismissed] = useState(false)
  const [eligible] = useState<boolean>(() => {
    if (inheritedKeys.length === 0) return false
    try {
      if (sessionStorage.getItem(INHERITED_BANNER_FLAG_KEY) === '1') return false
      sessionStorage.setItem(INHERITED_BANNER_FLAG_KEY, '1')
      return true
    } catch {
      // Stockage indisponible (navigation privée…) : on ne bloque rien, on se
      // tait simplement plutôt que de risquer une boucle de message.
      return false
    }
  })

  if (!eligible || dismissed) return null

  return (
    <Card className="border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
      <CardContent className="space-y-3 p-5">
        <div className="inline-flex items-center gap-2 text-[var(--bellum-text-accent)]">
          <Users className="h-4 w-4" aria-hidden="true" />
          <Text element="span" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('inheritedBanner.title')}
          </Text>
        </div>
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('inheritedBanner.description')}
        </Text>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDismissed(true)}>
          {t('inheritedBanner.dismiss')}
        </Button>
      </CardContent>
    </Card>
  )
}
