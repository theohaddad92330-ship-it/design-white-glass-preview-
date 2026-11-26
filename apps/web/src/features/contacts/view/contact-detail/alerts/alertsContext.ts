import { createContext, useContext } from 'react'
import type { AlertMemory } from './contactAlertMemory'

export type RegisteredCard = { title: string; signature: string }

export type AlertsContextValue = {
  memory: AlertMemory
  register: (id: string, card: RegisteredCard) => () => void
  ignore: (id: string, signature: string) => void
  restore: (id: string, signature: string) => void
  markRechecked: (id: string) => void
}

/** `null` hors du bandeau : la même carte sert la fiche compte, inchangée. */
export const AlertsContext = createContext<AlertsContextValue | null>(null)

export function useAlerts(): AlertsContextValue | null {
  return useContext(AlertsContext)
}
