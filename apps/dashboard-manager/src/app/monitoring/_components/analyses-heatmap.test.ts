import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { AnalysesHeatmapBucket, AnalysesHeatmapPayload } from '@/lib/monitoring'
import { HEURE_DEBUT, HEURE_FIN, construireGrilleAnalyses, libelleJour, libelleTranche } from './analyses-heatmap.logic'

/**
 * #1650 — « le motif Metric Flow "Orders by time", appliqué aux analyses ».
 *
 * Ce qui se teste ici est la DÉRIVATION, pas le rendu : l'environnement du
 * back-office est `node`, rien n'y est mis en page, et un test qui lirait des
 * classes rendrait un vert qui ne veut rien dire. Ce qui se voit à l'écran se
 * recette en direct.
 */

const JOURS = [
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-05',
  '2026-09-06',
  '2026-09-07',
] as const

function bucket(
  partiel: Partial<AnalysesHeatmapBucket> & Pick<AnalysesHeatmapBucket, 'day' | 'hour'>,
): AnalysesHeatmapBucket {
  return { count: 1, workspaces: [], withoutWorkspace: 0, ...partiel }
}

function charge(
  buckets: AnalysesHeatmapBucket[],
  maintenant: AnalysesHeatmapPayload['now'] = { day: '2026-09-07', hour: 23 },
): Parameters<typeof construireGrilleAnalyses>[0] {
  return { jours: [...JOURS], buckets, maintenant }
}

describe('construireGrilleAnalyses — la grille 7 jours × 12 tranches (#1650)', () => {
  it('LIT quelque chose — 7 lignes de 12 tranches, soit 84 cellules', () => {
    // Le contrôle positif. Sans lui, une grille vide passerait tous les tests
    // qui suivent en ne lisant jamais rien.
    const grille = construireGrilleAnalyses(charge([]))

    expect(grille.lignes).toHaveLength(7)
    expect(grille.tranches).toHaveLength(12)
    expect(grille.lignes.flatMap(l => l.cellules)).toHaveLength(84)
  })

  it('borne la journée à 8 h – 20 h : la première tranche est 8 h, la dernière 19 h', () => {
    const grille = construireGrilleAnalyses(charge([]))

    expect(HEURE_DEBUT).toBe(8)
    expect(HEURE_FIN).toBe(20)
    expect(grille.tranches[0]).toBe(8)
    expect(grille.tranches[grille.tranches.length - 1]).toBe(19)
  })

  it('les jours vont du plus ANCIEN au plus récent, et portent leur libellé', () => {
    const grille = construireGrilleAnalyses(charge([]))

    expect(grille.lignes.map(l => l.jour)).toEqual([...JOURS])
    expect(grille.lignes[0]?.libelle).toBe('mar. 01/09')
    expect(grille.lignes[6]?.libelle).toBe('lun. 07/09')
  })

  it('place chaque tranche sur sa case, avec son compte exact et ses espaces', () => {
    const grille = construireGrilleAnalyses(
      charge([bucket({ day: '2026-09-02', hour: 9, count: 3, workspaces: ['Beta ESN', 'Acme ESN'] })]),
    )

    const cellule = grille.lignes[1]?.cellules.find(c => c.heure === 9)
    expect(cellule?.valeur).toBe(3)
    // Dédoublonnés et TRIÉS : deux lectures de la même semaine doivent rendre la
    // même liste, sinon le détail change de forme sans que rien ait changé.
    expect(cellule?.espaces).toEqual(['Acme ESN', 'Beta ESN'])
  })

  it('les intensités sont RELATIVES au maximum de la période, jamais absolues', () => {
    const faible = construireGrilleAnalyses(
      charge([bucket({ day: '2026-09-01', hour: 8, count: 1 }), bucket({ day: '2026-09-02', hour: 8, count: 4 })]),
    )
    const forte = construireGrilleAnalyses(
      charge([bucket({ day: '2026-09-01', hour: 8, count: 1 }), bucket({ day: '2026-09-02', hour: 8, count: 40 })]),
    )

    const intensite = (g: typeof faible, ligne: number): number | null =>
      g.lignes[ligne]?.cellules.find(c => c.heure === 8)?.intensite ?? null

    // Le maximum de la semaine prend toujours le palier haut…
    expect(intensite(faible, 1)).toBe(4)
    expect(intensite(forte, 1)).toBe(4)
    // …et le MÊME compte absolu (4) descend quand le maximum monte à 40.
    expect(intensite(faible, 1)).toBe(4)
    expect(
      construireGrilleAnalyses(
        charge([bucket({ day: '2026-09-01', hour: 8, count: 4 }), bucket({ day: '2026-09-02', hour: 8, count: 40 })]),
      ).lignes[0]?.cellules.find(c => c.heure === 8)?.intensite,
    ).toBe(0)
  })

  it('une tranche PASSÉE sans analyse vaut 0 — c’est un vrai zéro, mesuré', () => {
    // « Si cette valeur est absente, "0" est-il VRAI ? » Ici oui : personne n'a
    // rien lancé entre 8 h et 9 h ce mardi-là, et c'est une information.
    const grille = construireGrilleAnalyses(charge([bucket({ day: '2026-09-01', hour: 8, count: 2 })]))

    const vide = grille.lignes[0]?.cellules.find(c => c.heure === 15)
    expect(vide?.valeur).toBe(0)
    expect(vide?.intensite).toBe(0)
    expect(vide?.aVenir).toBe(false)
  })

  it('une tranche À VENIR n’est pas « 0 » — elle n’est pas encore advenue', () => {
    // Le dernier jour de la fenêtre est AUJOURD'HUI : les heures qui n'ont pas
    // sonné n'ont pas mesuré zéro, elles n'ont rien mesuré du tout.
    const grille = construireGrilleAnalyses(charge([], { day: '2026-09-07', hour: 14 }))
    const aujourdhui = grille.lignes[6]

    const enCours = aujourdhui?.cellules.find(c => c.heure === 14)
    const futur = aujourdhui?.cellules.find(c => c.heure === 15)
    const passe = aujourdhui?.cellules.find(c => c.heure === 13)

    // L'heure EN COURS est mesurée — partiellement, mais mesurée.
    expect(enCours?.valeur).toBe(0)
    expect(enCours?.aVenir).toBe(false)
    expect(futur?.valeur).toBeNull()
    expect(futur?.intensite).toBeNull()
    expect(futur?.aVenir).toBe(true)
    expect(passe?.valeur).toBe(0)
  })

  it('les tranches à venir ne pèsent pas dans le maximum de la période', () => {
    const grille = construireGrilleAnalyses(
      charge([bucket({ day: '2026-09-01', hour: 8, count: 5 })], { day: '2026-09-07', hour: 9 }),
    )

    expect(grille.maximum).toBe(5)
  })

  it('ZÉRO analyse sur toute la semaine → le total est 0, et l’écran a de quoi le DIRE', () => {
    // LE test de l'issue : « semaine à 0 analyse → message, pas 84 cellules
    // grises ». La grille existe toujours (84 cellules), mais le total dit au
    // composant qu'il n'y a rien à dessiner.
    const grille = construireGrilleAnalyses(charge([]))

    expect(grille.totalFenetre).toBe(0)
    expect(grille.totalGrille).toBe(0)
    expect(grille.horsPlage).toBe(0)
    // Le maximum de la semaine est MESURÉ à zéro — la tranche la plus chargée
    // en a bien lancé zéro. Ce n'est pas « non mesuré », et l'écrire `null`
    // serait aussi faux que d'écrire « 0 » sur une heure qui n'a pas sonné.
    expect(grille.maximum).toBe(0)
  })

  it('sait dire NON à un raccourci — une semaine de nuit n’est pas une semaine vide', () => {
    // Trois analyses à 23 h : la GRILLE est à zéro, la SEMAINE ne l'est pas.
    // Écrire « Aucune analyse cette semaine » ici serait faux.
    const grille = construireGrilleAnalyses(charge([bucket({ day: '2026-09-03', hour: 23, count: 3 })]))

    expect(grille.totalFenetre).toBe(3)
    expect(grille.totalGrille).toBe(0)
    expect(grille.horsPlage).toBe(3)
  })

  it('n’attrape pas ce qu’elle ne vise pas — un bucket hors fenêtre ne crée pas de 8e ligne', () => {
    const grille = construireGrilleAnalyses(charge([bucket({ day: '2026-08-25', hour: 10, count: 9 })]))

    expect(grille.lignes).toHaveLength(7)
    // Il n'est ni dans la grille, ni compté comme « hors plage horaire » : il
    // est hors FENÊTRE, ce qui est une troisième chose.
    expect(grille.totalGrille).toBe(0)
    expect(grille.horsPlage).toBe(0)
    expect(grille.totalFenetre).toBe(0)
  })

  it('ne nomme AUCUNE personne — la cellule ne porte que des espaces et un compte', () => {
    // #1681 : l'unité d'analyse est l'écran / la fonction, jamais la personne.
    const grille = construireGrilleAnalyses(
      charge([bucket({ day: '2026-09-04', hour: 11, count: 2, workspaces: ['Acme ESN'], withoutWorkspace: 1 })]),
    )
    const cellule = grille.lignes[3]?.cellules.find(c => c.heure === 11)

    expect(Object.keys(cellule ?? {}).sort()).toEqual(
      ['aVenir', 'espaces', 'heure', 'intensite', 'jour', 'sansEspace', 'valeur'].sort(),
    )
    expect(cellule?.sansEspace).toBe(1)
  })
})

describe('les libellés', () => {
  it('un jour du CALENDRIER se lit en UTC — sinon il bascule d’un jour près de minuit', () => {
    expect(libelleJour('2026-09-07')).toBe('lun. 07/09')
    expect(libelleJour('2026-03-29')).toBe('dim. 29/03')
  })

  it('une date illisible ne s’invente pas — elle se rend telle quelle', () => {
    expect(libelleJour('pas-une-date')).toBe('pas-une-date')
  })

  it('une tranche se nomme par ses deux bornes', () => {
    expect(libelleTranche(9)).toBe('9 h – 10 h')
    expect(libelleTranche(19)).toBe('19 h – 20 h')
  })
})

describe('GARDE — la dérivation ne lit JAMAIS l’horloge', () => {
  const SOURCE = fileURLToPath(new URL('./analyses-heatmap.logic.ts', import.meta.url))

  it('LIT quelque chose — le module existe et porte la dérivation', () => {
    const source = readFileSync(SOURCE, 'utf8')
    expect(source.length).toBeGreaterThan(1000)
    expect(source).toMatch(/construireGrilleAnalyses/)
  })

  it('aucun `new Date()` nu ni `Date.now()` — `maintenant` est un PARAMÈTRE', () => {
    // Un test qui lit l'horloge passe à Paris et échoue sur un exécuteur CI en
    // UTC. Et une grille jour × heure dérivée de l'horloge de la MACHINE ment à
    // l'opérateur : c'est le fuseau du serveur qui a servi la donnée qui compte,
    // et il voyage dans la charge utile.
    const source = readFileSync(SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^[ \t]*\/\/.*$/gm, ' ')

    expect(source).not.toMatch(/new\s+Date\s*\(\s*\)/)
    expect(source).not.toMatch(/Date\.now\s*\(/)
  })

  it('sait dire NON — les deux formes fautives sont bien reconnues', () => {
    expect('const d = new Date()').toMatch(/new\s+Date\s*\(\s*\)/)
    expect('const t = Date.now()').toMatch(/Date\.now\s*\(/)
    // Et construire une date À PARTIR D'UNE CHAÎNE n'est pas lire l'horloge.
    expect("new Date('2026-09-07T00:00:00Z')").not.toMatch(/new\s+Date\s*\(\s*\)/)
  })
})
