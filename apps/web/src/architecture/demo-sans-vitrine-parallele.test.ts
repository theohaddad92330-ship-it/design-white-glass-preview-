/**
 * #3710.1 — « LA DÉMO MONTRE LES PAGES RÉELLEMENT LIVRÉES, SANS VITRINE
 * PARALLÈLE ».
 *
 * Décision Louis du 03/09/2026 (#1320) : « `isDemo` doit choisir le MOTEUR, plus
 * l'écran ». Une page faite pour la vente — mêmes données, autre composition —
 * est moins belle ou plus avancée que le produit, et se découvre en réunion. La
 * seule chose que la salle a le droit de remplacer, c'est la SOURCE d'une
 * réponse (un tour scripté, zéro réseau), jamais l'écran qui la montre.
 *
 * La garde tient deux faits, sur le code (commentaires retirés, les tests exclus) :
 *  1. aucun composant ne choisit un ÉCRAN selon la salle (`isDemo ? <Page/> : …`,
 *     `if (isDemo) return <Page/>`) ;
 *  2. `features/demo/view` ne contient que l'entrée publique et l'accès à la
 *     salle (`/demo`, `/demo/acces`) et le petit graphe des réponses scriptées —
 *     et rien d'autre n'en importe.
 * Elle SAIT DIRE NON (des sources fautives sont refusées) et LIT quelque chose
 * (elle recompte les fichiers lus).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

const COMMENTAIRE_BLOC = /\/\*[\s\S]*?\*\//g
const COMMENTAIRE_LIGNE = /(^|[^:'"`])\/\/.*$/gm
const sansCommentaires = (source: string) =>
  source.replace(COMMENTAIRE_BLOC, ' ').replace(COMMENTAIRE_LIGNE, (_tout, avant: string) => avant)

/** Un écran choisi selon la salle : un ternaire ou un retour anticipé qui rend un COMPOSANT. */
const ECRAN_CHOISI_PAR_LA_SALLE =
  /\bisDemo\s*\?\s*<[A-Z]|\bisDemo\s*&&\s*<[A-Z]|\bif\s*\(\s*isDemo\s*\)\s*return\s*<[A-Z]/

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'architecture') continue
      out.push(...sources(full))
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|\.spec\./.test(name) && !name.endsWith('.gen.ts')) {
      out.push(full)
    }
  }
  return out
}

const ALL = sources(SRC)

/** Ce que `features/demo/view` a le droit d'être importé par — l'entrée publique, et le graphe du copilote. */
const IMPORTATEURS_AUTORISES = new Set(['routes/demo.tsx', 'routes/demo_/acces.tsx', 'features/chat/view/Chat.tsx'])

describe('démo — aucune vitrine parallèle (#3710.1)', () => {
  it('LIT quelque chose : des centaines de fichiers de production, dont ceux de la salle', () => {
    expect(ALL.length).toBeGreaterThan(500)
    expect(ALL.some(path => path.includes('features/demo/'))).toBe(true)
  })

  it('aucun composant ne choisit un ÉCRAN selon la salle', () => {
    const fautes = ALL.filter(path => ECRAN_CHOISI_PAR_LA_SALLE.test(sansCommentaires(readFileSync(path, 'utf8')))).map(
      path => relative(SRC, path),
    )
    expect(fautes).toEqual([])
  })

  it('`features/demo/view` ne porte que l’entrée publique, l’accès et le graphe scripté', () => {
    const vues = ALL.filter(path => path.includes('features/demo/view/')).map(path =>
      relative(SRC, path).split('/').pop(),
    )
    expect(vues.sort()).toEqual(['DemoAccessPage.tsx', 'DemoBarChart.tsx', 'DemoEntryPage.tsx'])
  })

  it('rien d’autre que les deux routes publiques et le copilote n’importe ces vues', () => {
    const fautes = ALL.filter(path => /from\s+['"]@\/features\/demo\/view\//.test(readFileSync(path, 'utf8')))
      .map(path => relative(SRC, path))
      .filter(path => !IMPORTATEURS_AUTORISES.has(path) && !path.startsWith('features/demo/view/'))
    expect(fautes).toEqual([])
  })

  it('SAIT DIRE NON : un écran de vente choisi par `isDemo` est refusé', () => {
    expect(ECRAN_CHOISI_PAR_LA_SALLE.test('return isDemo ? <DemoChat /> : <Chat />')).toBe(true)
    expect(ECRAN_CHOISI_PAR_LA_SALLE.test('if (isDemo) return <DemoDashboard />')).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas : `isDemo` qui choisit un MOTEUR ou un texte passe', () => {
    expect(ECRAN_CHOISI_PAR_LA_SALLE.test('const ask = isDemo ? demoTurn : askLaura')).toBe(false)
    expect(ECRAN_CHOISI_PAR_LA_SALLE.test('const label = isDemo ? t("demo.label") : t("real.label")')).toBe(false)
  })
})
