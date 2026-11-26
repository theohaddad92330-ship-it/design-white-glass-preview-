import { createContext } from 'react'
import type { SessionUser } from '@bellum/contracts'

export type SessionContextValue = {
  user: SessionUser | null
  loading: boolean
}

export const SessionContext = createContext<SessionContextValue | null>(null)
