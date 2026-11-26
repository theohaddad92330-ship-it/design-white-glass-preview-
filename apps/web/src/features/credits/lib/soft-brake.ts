import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { ApiError } from '@/lib/api'

/**
 * #4464 — le FREIN DOUX : solde épuisé = un message humain, SANS chiffre et sans
 * le mot « crédit », et un moyen de joindre l'équipe. Jamais « recharger ».
 *
 * Le débit et le refus restent ceux de l'API (402) ; seul ce que l'écran en dit
 * change. Un seul texte, un seul contact, ici (GA-26) : les toasts le tirent de
 * `softBrakeToast`, les panneaux en ligne montent `<SoftBrake>`.
 */
export const SOFT_BRAKE_CONTACT_HREF = 'mailto:support@bellum-it.com'

/** Le refus de l'API pour solde épuisé (402), quelle que soit la forme de l'erreur. */
export function isSoftBrakeError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 402 && error.code !== 'trial_ended'
  const status = (error as { status?: unknown } | null)?.status
  return status === 402
}

/** Le frein doux en toast : message humain + contact, aucun chiffre. */
export function softBrakeToast(id?: string | number): void {
  toast.warning(i18n.t('common:softBrake.title'), {
    id,
    description: i18n.t('common:softBrake.description'),
    action: {
      label: i18n.t('common:softBrake.contact'),
      onClick: () => window.location.assign(SOFT_BRAKE_CONTACT_HREF),
    },
    duration: 8_000,
  })
}
