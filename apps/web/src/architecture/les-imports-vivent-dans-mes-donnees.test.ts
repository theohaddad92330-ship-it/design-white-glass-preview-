import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GARDE — #4532/#4533 (Louis 24/10/2026) : « Imports » et « Export du vivier » sont les deux onglets de Mes données
 * (`/settings/mes-donnees?tab=imports|exports`). Les anciennes adresses ne sont plus que des REDIRECTIONS : aucun lien
 * du produit ne doit encore y mener (un lien qui passe par une redirection est un lien qu'on a oublié de changer).
 *
 * Elle LIT le code source (corpus non vide), exclut les fichiers de test, et ne vise que les adresses exactes : la
 * clé de télémétrie `IMPORT_SCREEN` (motif du catalogue des écrans) et les redirections elles-mêmes sont nommées.
 */
const SRC = join(__dirname, '..')
const ALLOWED = new Set([
  'routes/settings/import.tsx',
  'routes/settings/vivier-export.tsx',
  'routeTree.gen.ts',
  'lib/route-titles.ts',
  'lib/return-to-app.ts',
  // Motif de route du CATALOGUE des écrans (télémétrie `trackDataImported`), pas un lien.
  'features/import/view/ImportWizard.tsx',
  // La liste blanche des destinations ACCEPTÉES, pas un lien ÉMIS — c'est l'inverse de ce que
  // cette garde vise. `LINKABLE_REDIRECTS` y accepte `/settings/import` et
  // `/settings/vivier-export` à dessein : le service IA les écrit encore (`chat_tools.py`,
  // `SETTINGS_SCREENS`), et le fichier avertit en toutes lettres que la liste « AVALE EN
  // SILENCE » — une carte de Laura qui vise une adresse absente meurt en `phase: 'failed'`
  // sans rien dire. Les retirer casserait Laura au lieu de supprimer un lien. Même précédent
  // déjà écrit dans ce fichier pour `/pilotage/pipe|staffing|finance`.
  'components/navigation/known-routes.ts',
])
const OLD = /(['"`])\/settings\/(import|vivier-export)\1/

/** Les commentaires nomment l'ancienne adresse pour l'expliquer : seul le CODE compte. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

describe('les imports et l’export du vivier vivent dans Mes données', () => {
  const files = walk(SRC)
  it('LIT un corpus non vide', () => {
    expect(files.length).toBeGreaterThan(500)
  })

  it('aucun lien ne mène encore à /settings/import ni /settings/vivier-export', () => {
    const offenders = files
      .map(file => relative(SRC, file))
      .filter(rel => !ALLOWED.has(rel))
      .filter(rel => OLD.test(stripComments(readFileSync(join(SRC, rel), 'utf8'))))
    expect(offenders).toEqual([])
  })

  it('SAIT dire non : la détection attrape bien un lien oublié', () => {
    expect(OLD.test(`<Link to="/settings/import">`)).toBe(true)
    expect(OLD.test(`go('/settings/vivier-export')`)).toBe(true)
    expect(OLD.test(`<Link to="/settings/mes-donnees">`)).toBe(false)
  })

  it('les liens vers l’onglet Imports portent ?tab=imports (au moins douze appelants)', () => {
    const callers = files.filter(file => /tab: 'imports'/.test(readFileSync(file, 'utf8')))
    expect(callers.length).toBeGreaterThanOrEqual(12)
  })
})
