import { describe, expect, it } from 'vitest'
import navEn from '@/i18n/locales/en/nav.json'
import navFr from '@/i18n/locales/fr/nav.json'
import { NAV_SECTIONS } from './sections'

/**
 * Loi 4 du tome 7 — deux barres d'onglets empilées ne portent pas le même mot.
 *
 * Mesuré à l'écran le 23/08 sur `/projects` : la barre de SECTION affichait
 * « Pipe · Appels d'offres », et cent pixels plus bas la barre de PAGE affichait
 * « Pipe · Portefeuille · Besoins ouverts ». Le même mot, sous la même forme,
 * désignant deux choses différentes — la section entière, et l'une de ses trois
 * vues.
 *
 * ⚠️ Cette garde ne vérifie que ce qu'elle PEUT voir : les libellés d'onglets de
 * section, qui vivent dans un catalogue. Les onglets de PAGE sont construits
 * dans chaque écran, souvent depuis un autre espace de noms i18n, et les
 * énumérer demanderait de rendre chaque écran. Ce qu'elle attrape est la
 * collision entre une section et son propre nom, et entre deux sections.
 *
 * ⚠️ ELLE NE LISAIT QUE LE FRANÇAIS, et c'est ce qui l'a rendue aveugle.
 * Mesuré le 16/09/2026, en réduisant Missions à quatre entrées : `tabs.missionsList`
 * et `tabs.missionsFactoring` rendaient TOUS LES DEUX « Assignments » en anglais,
 * dans la même barre. Le français disait « Missions » et « Cessions » — deux mots,
 * donc la garde était verte. L'anglais a un seul mot pour la mission et pour la
 * cession de créance, et personne ne pouvait le voir d'ici. La règle n'a jamais
 * parlé d'une langue : une barre d'onglets ne porte pas deux fois le même mot,
 * dans la langue où on la lit. Le libellé anglais est devenu « Factoring ».
 * Toutes les langues du produit passent maintenant dans la garde — le balayage
 * complet du corpus n'a rendu que cette collision-là, donc l'étendre ne coûte
 * aucun rouge collatéral.
 *
 * ⚠️ Une garde plus large a été ÉCRITE puis RETIRÉE le 23/08 : elle comptait
 * les libellés courts répétés dans un même espace de noms i18n. Elle en
 * trouvait cinquante, dont presque tous légitimes — « Comptes » est à la fois
 * une section et son premier onglet, « Secteur » est un filtre, une colonne et
 * un champ de fiche. Un doublon de CATALOGUE n'est pas un doublon d'ÉCRAN, et
 * une garde qui crie sur ce qui va bien finit désactivée. Ce qui reste
 * vérifiable mécaniquement est ici ; le reste se voit à l'œil, écran par écran.
 */
// Les catalogues sont lus DIRECTEMENT : passer par une instance i18n
// demanderait de l'initialiser, et une clé non résolue rendrait la clé
// elle-même — deux clés distinctes ne se heurteraient alors jamais et la
// garde serait verte sur du vide.
const CATALOGUES = [
  ['fr', navFr],
  ['en', navEn],
] as const

describe.each(CATALOGUES)('les libellés de navigation ne se répètent pas (%s)', (langue, catalogue) => {
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], catalogue)
    if (typeof value !== 'string') throw new Error(`clé de navigation introuvable en ${langue} : ${key}`)
    return value
  }

  // La garde LIT quelque chose : un catalogue amputé ou une section vidée
  // rendrait les trois tests suivants verts sur rien.
  it('lit un corpus non vide', () => {
    expect(NAV_SECTIONS.length).toBeGreaterThanOrEqual(9)
    const onglets = NAV_SECTIONS.flatMap(section => section.tabs)
    // 29 depuis le 14/10 (refonte Pilotage L0a : 4 onglets en moins ; #4158.10 : Équipe sortie de Pilotage).
    // 23 depuis le 15/10 (#4197, L6 : Missions passe de treize onglets à trois, huit écrans hors barre).
    // 16 depuis le 19/10 (#4340/#4341/#4344/#4349 : Affaires et Talents sans onglet ; #4351.1 : « En cours » quitte Missions ; #4357 : Automatisations fondu dans Séquences).
    expect(onglets.length).toBeGreaterThanOrEqual(12)
    expect(onglets.every(tab => t(tab.labelKey).length > 0)).toBe(true)
  })

  it('deux sections ne portent jamais le même nom', () => {
    const labels = NAV_SECTIONS.map(section => t(section.labelKey))
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('deux onglets d’une même section ne portent jamais le même nom', () => {
    const offenders: string[] = []
    for (const section of NAV_SECTIONS) {
      const seen = new Map<string, string>()
      for (const tab of section.tabs) {
        const label = t(tab.labelKey)
        const premier = seen.get(label)
        // Le libellé FAUTIF est nommé, et les deux clés avec : « 12 ≠ 13 » ne
        // dit pas lequel corriger, et c'est le message qu'on lit en CI.
        if (premier) offenders.push(`${section.key} › « ${label} » (${premier} + ${tab.labelKey})`)
        else seen.set(label, tab.labelKey)
      }
    }
    expect(offenders).toEqual([])
  })

  it('un onglet ne porte jamais le nom d’une AUTRE section', () => {
    // « Comptes › Comptes » est normal : le premier onglet d'une section porte
    // légitimement son nom. « Projets › Missions » ne le serait pas — il ferait
    // croire qu'on est ailleurs.
    const sectionLabels = new Map(NAV_SECTIONS.map(s => [t(s.labelKey), s.key]))
    const offenders: string[] = []
    for (const section of NAV_SECTIONS) {
      for (const tab of section.tabs) {
        const owner = sectionLabels.get(t(tab.labelKey))
        // EXCEPTION NOMMÉE (#4163, décision Louis 14/10/2026) : l'onglet de la file d'exécution d'Actions s'appelle
        // « Aujourd'hui » (Aujourd'hui / Séquences depuis la fusion du 19/10, #4357.1), comme la section Briefing.
        // Une seule entrée, par clé d'onglet : tout AUTRE onglet qui reprend un nom de section reste refusé.
        if (section.key === 'actions' && tab.labelKey === 'tabs.todayQueue') continue
        if (owner && owner !== section.key) offenders.push(`${section.key} › ${t(tab.labelKey)} (nom de ${owner})`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('deux GROUPES d’une même barre ne portent jamais le même nom', () => {
    // Le groupe est ce qu'on lit en premier depuis le 16/09 : Missions ne montre
    // plus ses treize onglets, elle montre quatre moments. Deux moments
    // homonymes rendraient la barre illisible avant même de l'ouvrir.
    const offenders: string[] = []
    for (const section of NAV_SECTIONS) {
      const labels = (section.groups ?? []).map(groupe => t(groupe.labelKey))
      const seen = new Set<string>()
      for (const label of labels) {
        if (seen.has(label)) offenders.push(`${section.key} › groupe « ${label} »`)
        seen.add(label)
      }
    }
    expect(offenders).toEqual([])
  })
})
