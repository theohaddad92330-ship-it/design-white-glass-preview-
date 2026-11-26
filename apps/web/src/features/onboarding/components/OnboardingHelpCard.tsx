import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Card, CardContent, Text } from '@bellum/ui'
import { ContactDialog } from '@/components/ContactDialog'
import { useBrand } from '@/features/brand/brand-context'
import { OnboardingLauraGuide } from '@/features/onboarding/components/OnboardingLauraGuide'

export function OnboardingHelpCard() {
  const { t } = useTranslation('onboarding')
  const [open, setOpen] = useState(false)
  const { isCustom } = useBrand()
  return (
    // #2021.19 — borne portée de `lg` (1 024 px) à `md` (768 px, GA-28) : une
    // seule rupture pour tout le dépôt.
    <aside data-testid="onboarding-help-card" className="sticky top-6 hidden self-start space-y-4 md:block">
      {/* #2020 — le guide de Laura pendant le questionnaire. Rendu quel que
          soit le brand : un espace en marque blanche renomme son copilote
          (`{{copilot}}`), il ne le retire pas (doctrine D82, `brand.ts`). Ne
          rend rien la plupart des écrans (#2020.12/.13) : seule une reprise
          ou une fin d'étape ont quelque chose à dire. */}
      <OnboardingLauraGuide />

      {/* #1960.20 — cette carte-ci promet « notre équipe » et ouvre NOTRE
          boîte de support HUMAIN : dans un espace en marque blanche elle ne
          s'affiche pas, le signalement (bouton flottant, monté pour toute
          personne connectée) reste le recours — décision de Louis du
          13/09/2026. Le guide de Laura ci-dessus est une préoccupation
          différente et n'est pas concerné par ce garde. */}
      {!isCustom && (
        <Card className="border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
          <CardContent className="space-y-5 p-5">
            <div className="inline-flex items-center gap-2 text-[var(--bellum-text-accent)]">
              <MessageCircle className="h-4 w-4" />
              <Text element="span" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {t('help.title')}
              </Text>
            </div>
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('help.description')}
            </Text>

            <Button fullWidth variant="outline" onClick={() => setOpen(true)}>
              {t('help.cta')}
            </Button>
            <ContactDialog open={open} onOpenChange={setOpen} />
          </CardContent>
        </Card>
      )}
    </aside>
  )
}
