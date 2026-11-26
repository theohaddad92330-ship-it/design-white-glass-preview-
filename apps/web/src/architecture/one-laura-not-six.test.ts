import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * SIX ÉCRANS DEMANDENT LAURA — ILS N'EN AURONT PAS SIX.
 *
 * #1316 (« prioriser mon portefeuille »), #1318 (« arbitrer mes priorités »),
 * #1319 (« analyser cette relation »), #1322 (« quoi corriger »), #1327
 * (« voir les recommandations »), #1334 (« prioriser mes besoins ») demandent
 * le même geste sur six écrans.
 *
 * D44 a tranché : Laura est une SURCOUCHE, pas un second moteur — « deux
 * moteurs de conversation dans le même produit, c'est deux fois la dette et
 * deux vérités possibles ». Le tome 7 §48 appelle « risque technique n°1 » le
 * cas où chaque écran implémente sa propre logique.
 *
 * Cette garde tient deux choses :
 *  1. l'accès contextuel passe par UN composant, jamais par un lien recopié ;
 *  2. il PRÉ-REMPLIT et n'envoie jamais — « ne pas envoyer aveuglément une
 *     commande » (#1321.4), et le copilote prépare pendant que le commercial
 *     envoie (absence de code, pas convention).
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function fichiersSous(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    if (entree === 'node_modules' || entree === 'dist') continue
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin))
    else if (/\.tsx?$/.test(entree) && !entree.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

const sources = fichiersSous(join(racineWeb, 'src'))

describe('l’accès contextuel au copilote', () => {
  it('a un corpus à lire — une garde qui ne lit rien ne garde rien', () => {
    expect(sources.length).toBeGreaterThan(500)
  })

  it('est le MÊME composant sur tous les écrans qui le demandent', () => {
    const porteurs = sources.filter(f => /<AskLaura[\s/>]/.test(readFileSync(f, 'utf8')))

    // Six écrans le demandent ; la primitive elle-même ne se compte pas.
    expect(porteurs.length).toBeGreaterThanOrEqual(6)
  })

  it("n'envoie JAMAIS la question — aucun écran n'utilise le paramètre qui poste", () => {
    // `?ask=` poste sans relecture. Seule la bibliothèque de commandes a le
    // droit de l'utiliser, parce qu'elle AFFICHE la phrase avant le clic.
    const BIBLIOTHEQUE = join('features', 'chat-commands')

    const coupables = sources
      .filter(f => !f.includes(BIBLIOTHEQUE))
      .filter(f => !f.endsWith(join('routes', 'chat', 'index.tsx')))
      .filter(f => {
        const source = readFileSync(f, 'utf8')
        return /<AskLaura[\s/>]/.test(source) && /\bask:/.test(source)
      })
      .map(f => f.slice(racineWeb.length + 1))

    expect(coupables).toEqual([])
  })

  it('sait dire NON — un accès qui posterait la question serait attrapé', () => {
    const fautif = `<AskLaura label="x" question="y" />\nnavigate({ search: { ask: 'y' } })`

    expect(/<AskLaura[\s/>]/.test(fautif) && /\bask:/.test(fautif)).toBe(true)
  })

  it('la primitive elle-même ne parle à AUCUNE route de Laura', () => {
    const source = readFileSync(join(racineWeb, 'src', 'components', 'primitives', 'AskLaura.tsx'), 'utf8')
    const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

    expect(sansCommentaires).not.toMatch(/['"`]\/laura\//)
    expect(sansCommentaires).toContain('to="/chat"')
  })
})
