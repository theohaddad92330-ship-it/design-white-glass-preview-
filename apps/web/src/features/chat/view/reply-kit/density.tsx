import { createContext, useContext, type ReactNode } from 'react'

/**
 * #3761 (BEL-LAU-1004) — LA DENSITÉ DES RÉPONSES DE LAURA.
 *
 * Chaque pièce de la bibliothèque existe en deux densités : `comfortable`
 * (défaut) et `compact` (quand la place se réduit : fil étroit, volet latéral,
 * mobile). La densité se pose UNE fois, sur la réponse (`ReplyDensityProvider`),
 * et chaque pièce la lit — une pièce ne la devine pas, et une réponse ne mélange
 * pas deux densités. Une pièce peut la forcer par sa prop `density`.
 */
export type ReplyDensity = 'comfortable' | 'compact'

const ReplyDensityContext = createContext<ReplyDensity>('comfortable')

export function ReplyDensityProvider({ density, children }: { density: ReplyDensity; children: ReactNode }) {
  return <ReplyDensityContext.Provider value={density}>{children}</ReplyDensityContext.Provider>
}

export function useReplyDensity(override?: ReplyDensity): ReplyDensity {
  const inherited = useContext(ReplyDensityContext)
  return override ?? inherited
}

/** Espacement vertical d'une pièce selon la densité — un seul endroit (GA-26). */
export function densityGap(density: ReplyDensity): string {
  return density === 'compact' ? 'space-y-1.5' : 'space-y-2'
}

export function densityPadding(density: ReplyDensity): string {
  return density === 'compact' ? 'p-2' : 'p-3'
}
