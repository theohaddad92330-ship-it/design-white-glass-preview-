import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * L'ÉCRAN DU BRIEF PORTE UN SEUL NOM, DANS LES DEUX LANGUES.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le nom de cet écran est écrit à SIX endroits — la barre latérale, la barre
 * d'onglets, la coque mobile, le registre des routes, la page des raccourcis,
 * et le titre de la page elle-même — dans deux langues, soit douze chaînes.
 * Aucune ne dérive des autres : ce sont douze entrées de JSON indépendantes.
 *
 * C'est exactement la forme du défaut « un réglage vit à un seul endroit »
 * (GA-26) qu'on ne peut pas corriger ici : i18next lit des fichiers plats, et
 * faire dériver cinq clés d'une sixième casserait la relecture des traducteurs.
 * Ce qui reste possible — et ce que cette garde fait — c'est d'exiger que les
 * douze DISENT LA MÊME CHOSE. Un renommage qui en oublie une laisse l'écran
 * s'appeler « Ma matinée » dans la barre latérale et « Ma journée » dans la
 * recherche de raccourcis, et personne ne le voit avant une démonstration.
 *
 * ⚠️ Elle garde l'ÉGALITÉ, pas la valeur. Le jour où l'écran change encore de
 * nom, on change les six entrées et la garde reste verte — c'est son travail.
 * Elle refuse en revanche que l'ANCIEN nom survive quelque part : un renommage
 * à moitié fait est le seul état qu'on ne veut jamais.
 *
 * Ce qu'elle prouve, comme toute garde de ce dépôt :
 *  - elle LIT un corpus non vide (les douze chaînes sont résolues et
 *    comparées ; un chemin devenu faux fait tomber le premier test) ;
 *  - elle sait dire NON (changer une seule des six entrées la fait rougir).
 */

const LOCALES_DIR = join(__dirname, '..', 'i18n', 'locales')

/**
 * Les six endroits où le nom de l'écran est écrit, par namespace et par clé.
 *
 * Trouvés par balayage, pas par mémoire : c'est la liste d'un audit qui avait
 * oublié la page des raccourcis et les deux titres de la page elle-même.
 *
 * ⚠️ CORRIGÉ LE 04/09/2026 — LA GARDE ÉTAIT BORGNE.
 * Elle surveillait `nav.items.briefing`, une clé que RIEN ne rend : la barre
 * latérale lit `items.today` (`components/navigation/sections.ts`). Les six
 * chaînes qu'elle comparait étaient donc cinq chaînes rendues et une chaîne
 * morte — pendant que la barre latérale affichait « Aujourd'hui » et le reste
 * du produit « Ma matinée », en production, sur l'écran d'arrivée.
 *
 * C'est exactement le défaut que le §« une garde protège une règle, elle ne
 * l'invente pas » décrit : verte, et sur du vide. La leçon vaut pour la liste
 * ci-dessous — une entrée s'y ajoute en vérifiant qu'un composant la REND,
 * pas en vérifiant qu'elle existe dans le JSON.
 */
const SCREEN_NAME_KEYS: ReadonlyArray<{ ns: string; key: string }> = [
  { ns: 'briefing', key: 'page.title' },
  // La barre latérale — `NAV_SECTIONS[key: 'today'].labelKey`.
  { ns: 'nav', key: 'items.today' },
  { ns: 'nav', key: 'tabs.today' },
  { ns: 'mobile', key: 'tabs.today' },
  { ns: 'routes', key: 'briefing.title' },
  { ns: 'shortcuts', key: 'goto.today' },
]

/**
 * Les noms que l'écran a PORTÉS et ne doit plus porter nulle part.
 *
 * ⚠️ Le motif vise le NOM DE L'ÉCRAN, pas le mot « journée ». La première
 * version cherchait `ta journée` et attrapait « Ajoute Bellum à ton écran
 * d'accueil : plein écran, et ta journée en un geste » — une phrase sur la
 * journée de travail de quelqu'un, qui reste vraie quel que soit le nom de
 * l'écran. Une garde qui attrape ce qu'elle ne vise pas se fait désactiver au
 * troisième faux positif, et c'est alors la vraie règle qu'on perd.
 *
 * C'est pourquoi chaque nom retiré porte SA portée de balayage.
 *
 * ⚠️ #1389 — « Aujourd'hui » N'EST PLUS UN NOM RETIRÉ : c'est le nom COURANT.
 * Le retour disait la raison, et elle est mesurable : « à 13 h 12, "Ma matinée"
 * n'a déjà plus de sens ». Un écran qu'on ouvre toute la journée ne peut pas
 * s'appeler d'après un moment de la journée. L'entrée qui le retirait a donc
 * été RETIRÉE elle-même — la laisser aurait fait rougir la garde sur le nom
 * qu'on vient de poser — et « Ma matinée » prend sa place dans la liste.
 *
 * Le balayage de « Ma matinée » n'inclut PAS `briefing.json` : rien d'autre
 * n'y porte le mot, mais la portée reste celle des cinq fichiers qui nomment
 * des ÉCRANS, pour la même raison qu'au-dessus.
 */
const RETIRED_NAMES: ReadonlyArray<{
  /** Le nom retiré, par langue. */
  pattern: Readonly<Record<string, RegExp>>
  /** Les fichiers où ce nom-là désignerait l'ÉCRAN, et pas autre chose. */
  namespaces: readonly string[]
}> = [
  {
    // « Aujourd'hui » a nommé cet écran (#1389) ; Louis 23/10 le renomme « Ma journée »
    // et renverse #1389. Ancré sur la chaîne entière : « Aujourd'hui » tout court est
    // aussi une date (« Fait aujourd'hui ») qui ne nomme pas l'écran.
    pattern: {
      fr: /^aujourd['’]hui$|^ouvrir aujourd['’]hui$|dans aujourd['’]hui\b|depuis aujourd['’]hui\b|à aujourd['’]hui\b/i,
      en: /^today$|^open today$|\bin today\b|from today\b|back to today\b/i,
    },
    namespaces: ['nav', 'mobile', 'routes', 'shortcuts', 'settings', 'profile'],
  },
  {
    // « Ma matinée » — ancré pour la même raison, avant qu'un libellé du genre
    // « ta réunion de fin de matinée » ne fasse rougir la garde.
    pattern: { fr: /^ma matinée$|ouvre ta matinée/i, en: /^my morning$|opens your morning/i },
    namespaces: ['briefing', 'nav', 'mobile', 'routes', 'shortcuts'],
  },
]

function readNamespace(locale: string, ns: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${ns}.json`), 'utf8')) as Record<string, unknown>
}

/** Résout `page.title` dans l'arbre de traduction. */
function lookup(tree: Record<string, unknown>, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part]
    return undefined
  }, tree)
}

/** Toutes les valeurs de chaîne d'un arbre de traduction, à plat. */
function allStrings(tree: unknown): string[] {
  if (typeof tree === 'string') return [tree]
  if (tree && typeof tree === 'object') return Object.values(tree).flatMap(allStrings)
  return []
}

describe('le nom de l’écran du brief est le MÊME partout', () => {
  it.each(['fr', 'en'])('les six entrées de %s sont résolues et non vides', locale => {
    // Sans ce test, un chemin de fichier devenu faux ferait comparer six
    // `undefined` — tous égaux — et la garde passerait au vert sur du vide.
    const values = SCREEN_NAME_KEYS.map(({ ns, key }) => lookup(readNamespace(locale, ns), key))
    expect(values).toHaveLength(6)
    for (const [index, value] of values.entries()) {
      const { ns, key } = SCREEN_NAME_KEYS[index]!
      expect(typeof value, `${locale}/${ns}.json → ${key}`).toBe('string')
      expect(String(value).trim().length, `${locale}/${ns}.json → ${key}`).toBeGreaterThan(0)
    }
  })

  it.each(['fr', 'en'])('les six entrées de %s disent exactement la même chose', locale => {
    const named = SCREEN_NAME_KEYS.map(
      ({ ns, key }) => `${ns}.${key} = ${String(lookup(readNamespace(locale, ns), key))}`,
    )
    // Le nom fautif est DANS la valeur comparée : sans lui, un échec dirait
    // « false n'est pas true » et il faudrait le déboguer.
    const distinct = [...new Set(named.map(entry => entry.split(' = ')[1]))]
    expect(distinct, `six libellés attendus identiques : ${named.join(' | ')}`).toHaveLength(1)
  })

  it('la garde LIT quelque chose : deux noms retirés, et des fichiers non vides à balayer', () => {
    // Une liste de noms retirés vidée par mégarde ferait passer le balayage
    // ci-dessous au vert sans rien avoir regardé.
    expect(RETIRED_NAMES.length).toBeGreaterThan(1)
    for (const entry of RETIRED_NAMES) {
      expect(entry.namespaces.length).toBeGreaterThan(0)
      expect(Object.keys(entry.pattern).sort()).toEqual(['en', 'fr'])
    }
    expect(allStrings(readNamespace('fr', 'nav')).length).toBeGreaterThan(50)
  })

  it.each(['fr', 'en'])('aucun ANCIEN nom de l’écran ne survit dans les fichiers de %s', locale => {
    const survivors: string[] = []
    for (const { pattern, namespaces } of RETIRED_NAMES) {
      const retired = pattern[locale]!
      for (const ns of namespaces) {
        for (const value of allStrings(readNamespace(locale, ns))) {
          // `RegExp.test` sans le drapeau `g` : avec, il est STATEFUL et saute
          // une occurrence sur deux — le dépôt s'est déjà fait avoir.
          if (retired.test(value)) survivors.push(`${ns}.json → « ${value} »`)
        }
      }
    }
    expect(survivors).toEqual([])
  })

  it('un nom retiré n’attrape PAS le mot ordinaire qu’il contient', () => {
    // La troisième preuve d'une garde : qu'elle n'attrape pas ce qu'elle ne
    // vise pas. « ta journée en un geste » parle de la journée de travail de
    // quelqu'un — elle reste vraie quel que soit le nom de l'écran.
    const day = RETIRED_NAMES.find(candidate => candidate.pattern.fr!.test('Aujourd’hui'))!
    expect(day.pattern.fr!.test('Fait aujourd’hui')).toBe(false)
    expect(day.pattern.fr!.test('Aujourd’hui chez {{company}}')).toBe(false)
    expect(day.pattern.en!.test('Done today')).toBe(false)
    expect(day.pattern.fr!.test('Ouvrir dans Aujourd’hui')).toBe(true)
    expect(day.pattern.en!.test('Open in Today')).toBe(true)

    const morning = RETIRED_NAMES.find(candidate => candidate.pattern.fr!.test('Ma matinée'))!
    expect(morning.pattern.fr!.test('Une matinée de formation')).toBe(false)
    expect(morning.pattern.en!.test('A morning of training')).toBe(false)
  })

  it.each(['fr', 'en'])(
    'le nom COURANT de l’écran est bien « Ma journée » (Louis 23/10, renverse #1389), en %s',
    locale => {
      // Sans ce test, la garde d'égalité resterait verte si les six entrées
      // repassaient toutes à « Ma matinée » : elle garde l'ÉGALITÉ, pas la
      // valeur. Le retour, lui, portait sur la valeur — « à 13 h 12 le libellé
      // n'a déjà plus de sens ».
      const expected = locale === 'fr' ? /^ma journée$/i : /^my day$/i
      const title = String(lookup(readNamespace(locale, 'briefing'), 'page.title'))
      expect(expected.test(title), `briefing.page.title = ${title}`).toBe(true)
    },
  )
})
