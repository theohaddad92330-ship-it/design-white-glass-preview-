import { useEffect, useState } from 'react'

/**
 * #2084.15 — État « réseau coupé ».
 *
 * Distinct d'un appel qui échoue (déjà couvert côté API par
 * `classifyNetworkFailure` / `journeyError`, #2084.7) : ici la connexion
 * elle-même est absente, avant même qu'une requête parte. Sans ce signal, un
 * questionnaire rempli hors ligne semble juste bloqué au clic — jamais
 * expliqué, jamais rejouable au bon moment.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => window.navigator.onLine)

  useEffect(() => {
    const goOnline = (): void => setOnline(true)
    const goOffline = (): void => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
