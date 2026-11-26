import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Toute route appelée par la SPA doit exister côté API.
 *
 * Le défaut que ce test verrouille a été trouvé dans un rapport de bug qui
 * portait sur tout autre chose : la trace réseau montrait
 * `GET /opportunities → 404` et `GET /opportunities/learning → 404`. T1 avait
 * renommé le contrôleur en `@Controller('projects')` — la TABLE reste
 * `opportunities`, mais l'API a bien changé de nom — et deux appels web étaient
 * restés sur l'ancien chemin.
 *
 * Personne ne l'avait signalé, parce que les deux écrans concernés rendaient
 * une LISTE VIDE sur l'erreur : le sélecteur de besoin du vivier disait
 * « aucun besoin » et le panneau d'apprentissage disait « rien encore ». Un 404
 * déguisé en bonne nouvelle — la signature de ce dépôt.
 *
 * Le typage ne peut rien : un chemin est une chaîne, et les deux applications
 * ne partagent aucun type de route. Ce test lit donc les DEUX sources et
 * compare les préfixes.
 */

const API_SRC = __dirname
const WEB_SRC = join(__dirname, '../../web/src')

/**
 * Les premiers segments réellement montés par l'API.
 *
 * Deux formes existent et les DEUX comptent : un contrôleur préfixé
 * (`@Controller('projects')`) donne son préfixe, et un contrôleur monté à la
 * racine (`@Controller()`, comme la santé ou OAuth) donne les chemins déclarés
 * sur ses méthodes. N'en lire qu'une ferait passer `/version` et `/oauth` pour
 * des appels fantômes.
 */
function controllerBases(): Set<string> {
  const bases = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.endsWith('.controller.ts') || entry.endsWith('.spec.ts')) continue
      const source = readFileSync(full, 'utf8')
      let rootMounted = false
      for (const match of source.matchAll(/@Controller\(\s*(?:'([^']*)')?\s*\)/g)) {
        const base = (match[1] ?? '').split('/').filter(Boolean)[0]
        if (base) bases.add(base)
        else rootMounted = true
      }
      if (!rootMounted) continue
      // Contrôleur racine : ce sont ses méthodes qui portent le chemin.
      for (const match of source.matchAll(/@(?:Get|Post|Put|Patch|Delete)\(\s*'([^']+)'/g)) {
        const base = match[1]!.split('/').filter(Boolean)[0]
        if (base) bases.add(base)
      }
    }
  }
  walk(API_SRC)
  return bases
}

/** Les chemins littéraux passés à `apiFetch({ path: '…' })` côté web. */
function webApiPaths(): { file: string; path: string }[] {
  const found: { file: string; path: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) continue
      // `routeTree.gen.ts` est GÉNÉRÉ par le routeur de la SPA : ses `path:`
      // sont des routes d'écran, pas des appels d'API.
      if (entry === 'routeTree.gen.ts') continue
      // Les CONTRATS DE ROUTE (`useRouteAccess({ path: '/missions/cra', … })`)
      // décrivent un chemin d'ÉCRAN, pas un appel d'API. Les compter ferait
      // tomber cette garde sur un écran parfaitement correct — et la façon la
      // plus probable de s'en sortir serait alors de la désactiver.
      const source = readFileSync(full, 'utf8').replace(/useRouteAccess\(\{[^}]*\}\)/g, '')
      // `path: '/x/y'` et `path: \`/x/${id}\`` — on ne lit que le premier
      // segment, donc l'interpolation qui suit n'a aucune importance.
      for (const match of source.matchAll(/path:\s*[`']\/([a-zA-Z0-9_-]+)/g)) {
        found.push({ file: full.replace(WEB_SRC, ''), path: match[1]! })
      }
    }
  }
  walk(WEB_SRC)
  return found
}

describe('les routes appelées par la SPA existent côté API', () => {
  const bases = controllerBases()

  it('les deux inventaires sont lisibles', () => {
    // Un inventaire vide ferait passer le test sur n'importe quel appel.
    expect(bases.size).toBeGreaterThan(30)
    expect(webApiPaths().length).toBeGreaterThan(50)
  })

  it('aucun appel ne vise un préfixe inconnu', () => {
    const offences = webApiPaths()
      .filter(entry => !bases.has(entry.path))
      .map(entry => `${entry.file} → /${entry.path}`)
    // Le message porte le chemin ET son fichier : un 404 en production ne dit
    // ni l'un ni l'autre, et l'écran concerné affiche « aucun résultat ».
    expect([...new Set(offences)]).toEqual([])
  })

  it('sait reconnaître le chemin renommé qui a produit deux écrans vides', () => {
    // Le garde doit échouer sur ce qu'il est censé attraper.
    expect(bases.has('projects')).toBe(true)
    expect(bases.has('opportunities')).toBe(false)
  })
})
