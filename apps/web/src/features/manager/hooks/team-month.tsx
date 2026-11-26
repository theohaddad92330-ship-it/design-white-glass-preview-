import { createContext, useContext } from 'react'

/**
 * Le MOIS des objectifs que l'espace Équipe regarde (`AAAA-MM-01`), choisi dans le filtre « Objectifs »
 * de la page. `undefined` = le mois en cours, c'est-à-dire ce que le serveur sert par défaut : le
 * cap, les cartes d'objectifs et « Qui porte quoi » lisent donc TOUS le même mois, jamais chacun le sien.
 */
const TeamMonthContext = createContext<string | undefined>(undefined)

export const TeamMonthProvider = TeamMonthContext.Provider

export function useTeamMonth(): string | undefined {
  return useContext(TeamMonthContext)
}
