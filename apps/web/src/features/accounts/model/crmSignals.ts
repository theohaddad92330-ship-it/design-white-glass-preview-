import type { RecentSignal } from '@bellum/contracts'
import { i18n } from '@/i18n'

/** Les trois types que le lecteur API (`GET /crm/accounts/:id/signals`) peut rendre. */
const CRM_KINDS = ['affaire_perdue', 'affaire_dormante', 'affaire_renouvellement'] as const

/**
 * #3918.b — les signaux CRM d'un compte, prêts pour LE lecteur de la veille
 * (`buildAccountWatchData`) : seule la nature (`affaire_perdue`…) est
 * traduite, pour que la frise ne montre jamais une clé technique. Le fait,
 * sa date et sa source (« Votre CRM ») arrivent tels que l'API les a lus.
 */
export function crmSignalsForWatch(signals: readonly RecentSignal[]): RecentSignal[] {
  return signals.map(signal => {
    const kind = CRM_KINDS.find(value => value === signal.type)
    return kind ? { ...signal, type: i18n.t(`accounts:watch.crmKind.${kind}`) } : signal
  })
}
