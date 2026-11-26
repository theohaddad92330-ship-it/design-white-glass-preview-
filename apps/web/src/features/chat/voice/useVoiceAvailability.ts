import { useEffect, useState } from 'react'
import { fetchVoiceStatus } from './voice-api'
import { voiceCaptureSupported } from './voice-recorder'

/**
 * #1939.1 — LA CAPACITÉ DE DICTÉE, PARTAGÉE PAR TOUT ÉCRAN QUI PROPOSE UN MICRO.
 *
 * Vivait dupliquée dans `VoiceInput.tsx` (le micro de `/chat`) — extrait ici
 * (GA-26, un réglage à un seul endroit) pour que l'import dicté d'une liste
 * (`ImportTargetListDialog.tsx`, #2434.55) applique EXACTEMENT la même règle
 * sans la recopier : le navigateur, PUIS le serveur (clé de transcription
 * posée, stockage monté), et jamais en salle de démonstration. Un bouton qui
 * échoue au clic est pire qu'un bouton absent.
 */
export function useVoiceAvailability(isDemo: boolean): boolean {
  const capable = voiceCaptureSupported()
  const [serverAvailable, setServerAvailable] = useState(false)
  useEffect(() => {
    if (!capable || isDemo) return undefined
    let live = true
    void fetchVoiceStatus().then(available => {
      if (live) setServerAvailable(available)
    })
    return () => {
      live = false
    }
  }, [capable, isDemo])
  return capable && !isDemo && serverAvailable
}
