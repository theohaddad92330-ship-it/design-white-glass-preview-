import { useAccountVariationSignals } from '@/features/accounts/hooks/useAccountVariationSignals'
import { AccountVariationSignalsCard } from './AccountVariationSignalsCard'

/** #3920.10 — l'appelant de `GET /accounts/:id/variation-signals` ; le hook réseau vit ici, la carte reste PURE. */
export function AccountVariationSignalsSection({ accountId }: { accountId: string }) {
  const signals = useAccountVariationSignals(accountId).data ?? null
  return <AccountVariationSignalsCard signals={signals} />
}
