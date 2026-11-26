import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4630 — UN RÔLE PÉRIMÉ NE DÉCIDE JAMAIS D'UNE ENTRÉE DE MENU NI D'UN ONGLET.
 *
 * Après un changement d'espace, la réponse `/workspaces/me` de l'espace PRÉCÉDENT
 * (rôle compris) revenait du cache persisté le temps d'un rendu : un membre voyait
 * l'onglet Imports, réservé aux gestionnaires. Le rôle ne se lit donc que par
 * `useTeam`, qui ne rend une réponse que lue pendant CE chargement de page. Une
 * lecture directe de `TEAM_KEY` contourne ce filtre.
 *
 * Elle ne dit RIEN de ce que les écrans font du rôle : elle ne regarde que la porte.
 * Exceptions nommées : `useSettledTeam.ts` (la porte), `useTeam.ts` (ses écritures
 * optimistes) et `ReflagProvider.tsx` (cible des drapeaux — il ne décide d'aucun affichage de droit).
 */
const SRC = join(__dirname, '..')
const ALLOWED = new Set([
  'features/team/hooks/useSettledTeam.ts',
  // Les écritures optimistes de l'écran Équipe lisent leur PROPRE cache pour le rétablir : aucune décision de droit.
  'features/team/hooks/useTeam.ts',
  'features/reflag/ReflagProvider.tsx',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name) && !name.endsWith('.gen.ts')) out.push(full)
  }
  return out
}

/** Les fichiers qui lisent le cache d'équipe SANS passer par `useTeam`. */
export function directTeamKeyReaders(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([path]) => !ALLOWED.has(path))
    .filter(
      ([, text]) => /queryKey:\s*TEAM_KEY[\s\S]{0,200}?queryFn/.test(text) || /getQueryData[^)]*TEAM_KEY/.test(text),
    )
    .map(([path]) => path)
}

describe('un rôle périmé ne décide pas (#4630)', () => {
  it('aucun fichier ne lit le cache d’équipe sans passer par useSettledTeam', () => {
    const files = Object.fromEntries(walk(SRC).map(f => [relative(SRC, f), readFileSync(f, 'utf8')]))
    expect(directTeamKeyReaders(files)).toEqual([])
  })

  it('sait dire NON : une lecture directe de TEAM_KEY est attrapée, useTeam ne l’est pas', () => {
    const offender = { 'features/x/Y.tsx': 'const { data } = useQuery({ queryKey: TEAM_KEY, queryFn: () => api() })' }
    expect(directTeamKeyReaders(offender)).toEqual(['features/x/Y.tsx'])
    expect(directTeamKeyReaders({ 'features/team/hooks/useSettledTeam.ts': offender['features/x/Y.tsx'] })).toEqual([])
    expect(directTeamKeyReaders({ 'features/x/Z.tsx': 'const { team } = useTeam()' })).toEqual([])
  })
})
