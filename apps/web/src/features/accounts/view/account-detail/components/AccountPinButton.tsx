import { Button, cn } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Pin } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { accountsApi } from '@/features/accounts/api'
import { useSetAccountFavorite } from '@/features/accounts/hooks/useSetAccountFavorite'

/**
 * #4507 — l'ÉPINGLE de l'en-tête (maquette V22 `.a4-dossier-tools` : épingle · Actualiser · « … »).
 *
 * C'est le favori PERSONNEL du portefeuille (#2150.14/.18, `POST|DELETE /accounts/:id/favorite`), le même que
 * l'étoile d'une ligne de la liste : aucun second réglage (GA-26). La fiche (`GET /accounts/:id`) ne porte pas
 * `is_favorite` : l'état se lit sur la liste « Mes favoris » filtrée sur ce nom, une seule lecture. Tant
 * qu'elle n'a pas répondu, l'épingle n'est pas rendue — jamais un état deviné.
 */
export function AccountPinButton({ accountId, companyName }: { accountId: string; companyName: string }) {
  const { t } = useTranslation('accounts')
  const setFavorite = useSetAccountFavorite()
  const [override, setOverride] = useState<boolean | null>(null)
  const favorites = useQuery({
    queryKey: ['accounts', 'favorite-of', accountId],
    queryFn: () => accountsApi.list({ favorite: 'mine', q: companyName, limit: 50 }),
    select: response => (response?.data ?? []).some(item => item.id === accountId),
    retry: false,
  })
  if (override === null && favorites.data === undefined) return null
  const pinned = override ?? favorites.data === true

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={pinned}
      aria-label={t(pinned ? 'header.unpin' : 'header.pin', { company: companyName })}
      title={t(pinned ? 'header.unpin' : 'header.pin', { company: companyName })}
      disabled={setFavorite.isPending}
      onClick={() => {
        const next = !pinned
        setOverride(next)
        setFavorite.mutate({ id: accountId, next }, { onError: () => setOverride(!next) })
      }}
    >
      <Pin
        className={cn(
          'size-4',
          pinned
            ? 'fill-[var(--bellum-text-accent)] text-[var(--bellum-text-accent)]'
            : 'text-[var(--bellum-text-muted)]',
        )}
        aria-hidden
      />
    </Button>
  )
}
