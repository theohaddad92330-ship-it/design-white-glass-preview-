import { useId } from 'react'
import { Building2, Eye, Lock, Plug, ShieldCheck, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, Text } from '@bellum/ui'

/**
 * #2019 — les six choses à savoir sur les données, une ligne chacune et dans
 * cet ordre : d'où vient le prérempli, ce qui appartient à l'espace et ce qui
 * reste personnel, ce que voient les collègues, ce que Laura consulte, ce qui
 * exige une connexion, ce qui n'arrive jamais sans validation.
 *
 * Exporté pour que le test tienne le plafond de sept lignes (#2019.6) sans
 * compter des nœuds DOM : titre + ces lignes ≤ 7.
 */
export const PRIVACY_STEP_LINES = [
  { key: 'publicRegistries', Icon: Building2 },
  { key: 'ownership', Icon: Lock },
  { key: 'colleagues', Icon: Eye },
  { key: 'laura', Icon: Sparkles },
  { key: 'connections', Icon: Plug },
  { key: 'validation', Icon: ShieldCheck },
] as const

/**
 * #2019 — L'ÉTAPE DE CONFIDENTIALITÉ, compacte : un encart, pas un mur
 * juridique (#2019.6). Le détail vit sur la page légale existante, atteinte
 * par le lien (#2019.7).
 *
 * ⚠️ AUCUN consentement groupé (#2019.8) : cet encart INFORME, il ne demande
 * rien — ni case à cocher, ni bouton « tout accepter ». Chaque permission se
 * demande séparément, au moment où l'outil se connecte (les connecteurs le
 * font déjà, outil par outil).
 *
 * Aucun nom de fournisseur : on nomme la CAPACITÉ (« ta messagerie »), jamais
 * un outil que l'espace n'a pas branché (`tool-naming.ts`).
 */
export function OnboardingPrivacyStep({ detailHref }: { detailHref: string }) {
  const { t } = useTranslation('onboarding')
  const titleId = useId()

  return (
    <Card className="border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
      <CardContent className="space-y-2 p-4">
        <section aria-labelledby={titleId} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <Text element="h2" id={titleId} size="sm" weight="semibold">
              {t('privacyStep.title')}
            </Text>
            <a
              href={detailHref}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--bellum-text-accent)] underline-offset-4 hover:underline"
            >
              {t('privacyStep.detailLink')}
            </a>
          </div>
          <ul className="space-y-1">
            {PRIVACY_STEP_LINES.map(({ key, Icon }) => (
              <li key={key} className="flex items-start gap-2">
                <Icon className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
                <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="min-w-0">
                  {t(`privacyStep.lines.${key}`)}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  )
}
