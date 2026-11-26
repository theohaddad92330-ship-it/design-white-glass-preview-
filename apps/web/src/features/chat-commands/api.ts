import type { CommandAvailability, CommandDefinition } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** Une commande, avec ce qu'elle peut faire ICI. */
export type LibraryCommand = CommandDefinition & { availability: CommandAvailability }

export function useCommandLibrary() {
  return useQuery({
    queryKey: ['chat', 'commands'] as const,
    queryFn: () => apiFetch<{ commands: LibraryCommand[] }>({ path: '/ia/chat/commands' }),
    select: response => response.commands,
    // La disponibilité dépend des connexions, qui changent sur un autre écran :
    // une bibliothèque qui annonce « prêt » sur un connecteur débranché il y a
    // deux minutes fait cliquer sur un mur.
    staleTime: 30_000,
  })
}
