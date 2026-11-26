import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Syncs the authenticated user into the Sentry scope so every subsequent
 * event carries `user.id` / `user.email`. Mounted once in the provider
 * tree; renders nothing.
 */
export function SentryUserContext() {
  const { user } = useSession()

  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email })
    } else {
      Sentry.setUser(null)
    }
  }, [user])

  return null
}
