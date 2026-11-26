import { Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, Text } from '@bellum/ui'

/**
 * #4158.12 — « ton administrateur n'a pas encore décrit l'ESN ».
 *
 * Montré tant que `awaiting_company_admin` est posé par l'API : le membre ne
 * répond qu'à ses questions personnelles, et ses analyses s'enrichiront dès que
 * la fiche entreprise existera. Le prénom et le nom de l'administrateur sont
 * EN CLAIR (doctrine : les noms ne se masquent pas) ; sans nom connu, le bandeau
 * dit « l'administrateur de ton espace » plutôt que d'en inventer un.
 *
 * Pas de bouton « Compris » : le message n'est pas une nouveauté qu'on renvoie
 * une fois, c'est l'EXPLICATION de ce parcours raccourci, vraie tant qu'il dure.
 */
export function AwaitingAdminBanner({ adminName }: { adminName: string | null }) {
  const { t } = useTranslation('onboarding')
  return (
    <Card className="border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]" data-testid="awaiting-admin-banner">
      <CardContent className="space-y-2 p-5">
        <div className="inline-flex items-start gap-2">
          <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
          <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {adminName ? t('awaitingAdminBanner.title', { name: adminName }) : t('awaitingAdminBanner.titleUnnamed')}
          </Text>
        </div>
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('awaitingAdminBanner.description')}
        </Text>
      </CardContent>
    </Card>
  )
}
