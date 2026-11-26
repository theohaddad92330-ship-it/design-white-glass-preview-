import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'

/**
 * Une entrée de la barre Réglages doit mener à un écran qui GARDE cette barre.
 *
 * Le défaut vécu en bêta : depuis Réglages, cliquer « Intégrations » ouvrait
 * bien l'écran attendu, mais la barre de gauche repassait au menu principal.
 * L'utilisateur se retrouvait sorti des Réglages sans l'avoir demandé, et
 * devait y rentrer à nouveau pour continuer son réglage suivant.
 *
 * La cause n'est pas l'URL. `/billing` vit aussi hors de `/settings` et se
 * comporte correctement, parce qu'il rend `SettingsPage`. Ce qui décide de la
 * barre, c'est la COQUILLE de page — et `/integrations` était le seul de son
 * groupe à rendre `CustomerPage`.
 *
 * Le routeur ne peut pas l'attraper : les deux coquilles sont des composants
 * valides et la navigation fonctionne. Ce test relie donc la liste des entrées
 * de la barre au fichier de route qu'elles ouvrent, et lit laquelle des deux
 * coquilles il rend.
 */

const ROUTES = join(__dirname, '../routes')

/** Le fichier de route qu'ouvre un chemin de nav, selon la convention TanStack. */
function routeFileFor(path: string): string | null {
  const trimmed = path.replace(/^\//, '')
  for (const candidate of [join(ROUTES, `${trimmed}/index.tsx`), join(ROUTES, `${trimmed}.tsx`)]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Les chemins déclarés par la barre Réglages, `/settings/*` compris. */
function settingsNavPaths(): string[] {
  return SETTINGS_SECTIONS.flatMap(section => section.items.map(item => String(item.to ?? ''))).filter(Boolean)
}

describe('les écrans atteints depuis la barre Réglages la conservent', () => {
  const paths = settingsNavPaths()

  it('la barre déclare bien des entrées', () => {
    // Une liste vide ferait passer le test sans rien vérifier.
    expect(paths.length).toBeGreaterThan(5)
  })

  it('chaque entrée ouvre un écran monté sur SettingsPage', () => {
    const offences: string[] = []
    for (const path of paths) {
      // Une redirection (`/settings/integrations`) n'a pas de coquille : c'est
      // sa destination qui compte, et elle est dans la liste par ailleurs.
      const file = routeFileFor(path)
      if (!file) continue
      const source = readFileSync(file, 'utf8')
      if (source.includes('redirect(')) continue
      if (!source.includes('SettingsPage')) offences.push(`${path} → ${file.replace(ROUTES, 'routes')}`)
    }
    // Le message porte le chemin ET son fichier : en production, le symptôme
    // est une barre qui change toute seule, ce qui ne désigne aucun fichier.
    expect(offences).toEqual([])
  })

  it('sait reconnaître la coquille qui faisait sortir des Réglages', () => {
    // Le garde doit échouer sur ce qu'il est censé attraper.
    const billing = readFileSync(join(ROUTES, 'billing/index.tsx'), 'utf8')
    expect(billing).toContain('SettingsPage')
    expect(billing).not.toContain('CustomerPage')
  })
})
