import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { apiFetch } from '@/lib/api'

/** Ce que le serveur rend. `null` = aucune adresse configurée. */
type BackofficeAddress = { url: string | null }

/**
 * Trois états, et on n'en confond aucun avec un autre : on ne sait pas encore,
 * il n'y a pas d'adresse, il y en a une.
 */
type AddressState = { status: 'loading' } | { status: 'none' } | { status: 'ready'; url: string }

/**
 * L'adresse de la console d'exploitation — D34 · 26/08 (Louis, 28/08/2026).
 *
 * ⚠️ Pas de `VITE_BACKOFFICE_URL`. Une variable `VITE_*` est inlinée dans le
 * bundle, donc lisible par n'importe quel visiteur qui ouvre les sources —
 * déconnecté compris. `GET /backoffice/address` ne la rend qu'au porteur du
 * rôle `backoffice`, vérifié côté API en relisant le compte plutôt que les
 * claims du jeton : une copie figée à la signature survivrait à un rôle retiré.
 *
 * ⚠️ La requête est faite à la main plutôt qu'avec `useQuery` À DESSEIN : le
 * cache de l'application est PERSISTÉ dans IndexedDB
 * (`PersistQueryClientProvider`, `App.tsx`). L'adresse d'une console
 * d'opérateur y survivrait à la déconnexion, dans un profil de navigateur
 * potentiellement partagé. Ici elle ne vit que dans l'état de ce composant.
 *
 * ⚠️ Aucune URL n'est écrite ici, jamais — pas même en repli. Une adresse
 * inventée est une donnée inventée.
 *
 * ⚠️ Ce composant est SÉPARÉ de l'écran qui le monte parce que l'écran vit
 * dans la coque client (`CustomerPage`) : un opérateur reste un utilisateur et
 * garde sa barre latérale, donc sa sortie. Le séparer laisse ce qui se teste —
 * les trois états de l'adresse — montable sans routeur.
 */
export function BackofficeConsoleLink() {
  const { t } = useTranslation('routes')
  const [address, setAddress] = useState<AddressState>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    apiFetch<BackofficeAddress>({ path: '/backoffice/address' })
      .then(data => {
        if (!alive) return
        // `data?.url` : la réponse vient du réseau, on ne suppose pas sa forme.
        const url = data?.url
        setAddress(url ? { status: 'ready', url } : { status: 'none' })
      })
      .catch(() => {
        // 403 (appelant sans le rôle) ou panne réseau : dans les deux cas on
        // n'a pas d'adresse à donner. On le dit comme on le dirait pour une
        // absence — inventer une URL serait pire que de n'en montrer aucune.
        if (alive) setAddress({ status: 'none' })
      })
    return () => {
      alive = false
    }
  }, [])

  // Tant que le serveur n'a pas répondu, on n'affirme NI l'un NI l'autre :
  // écrire « aucune adresse configurée » pendant le chargement serait un zéro
  // de chargement — le défaut que ce dépôt a déjà payé plusieurs fois.
  if (address.status === 'loading') return null

  if (address.status === 'none') {
    return (
      <Text size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('backoffice.access')}
      </Text>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Text size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('backoffice.accessConfigured')}
      </Text>
      <a
        href={address.url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex min-h-11 w-fit flex-wrap items-center gap-2 rounded-md px-3 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bellum-text-accent)]"
      >
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t('backoffice.openConsole')}</span>
        {/* Dans le lien, donc dans son nom accessible : un lecteur d'écran
            annonce « autre application, nouvel onglet » avec le libellé. */}
        <span className="text-xs text-[var(--bellum-text-muted)]">({t('backoffice.openConsoleHint')})</span>
      </a>
    </div>
  )
}
