import { useEffect, useRef, useState } from 'react'

/**
 * L'événement standard, absent des types DOM de TypeScript (encore
 * expérimental côté spec) : on le décrit nous-mêmes, aussi étroit que ce
 * qu'on en lit réellement.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * #2435.11 — CAPTE L'INVITE D'INSTALLATION NATIVE, LA DIFFÈRE.
 *
 * Le navigateur tire `beforeinstallprompt` de lui-même, tôt, et l'annule
 * (`preventDefault`) empêche sa mini-infobar par défaut — c'est ce qui laisse
 * le PRODUIT choisir QUAND proposer l'installation (après un premier succès,
 * jamais au premier écran, #2435.11) plutôt que le navigateur.
 *
 * `canInstall` ne devient vrai qu'après avoir REÇU l'événement : sans lui
 * (Safari iOS ne le tire jamais, un navigateur qui a déjà refusé récemment),
 * ce hook ne prétend jamais qu'une installation est possible.
 */
export function useInstallPrompt(): {
  canInstall: boolean
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>
} {
  const [canInstall, setCanInstall] = useState(false)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      deferredRef.current = event as BeforeInstallPromptEvent
      setCanInstall(true)
    }
    const onInstalled = () => {
      deferredRef.current = null
      setCanInstall(false)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
    const deferred = deferredRef.current
    if (!deferred) return null
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferredRef.current = null
    setCanInstall(false)
    return outcome
  }

  return { canInstall, promptInstall }
}
