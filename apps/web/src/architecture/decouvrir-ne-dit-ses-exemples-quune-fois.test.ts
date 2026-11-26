import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import discoverFr from '../i18n/locales/fr/discover.json'
import discoverEn from '../i18n/locales/en/discover.json'
import searchFr from '../i18n/locales/fr/search.json'

/**
 * #2485 / #2486 — DÉCOUVRIR NE DIT SES EXEMPLES QU'UNE FOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 16/09/2026 : `/discover` empilait QUATRE rangées de
 * puces avant le moindre résultat, dont DEUX qui disaient la même chose — des
 * phrases d'exemple cliquables qui pré-remplissent la même saisie libre
 * (`filters.freetext`). L'une venait du composant `DiscoverExampleChips`
 * (clés `discover:examples.*`), l'autre est écrite sous la saisie
 * (`discover:freetext.examples`). Loi 4 du tome 7 : rien n'apparaît deux fois
 * sous la même forme avec le même contenu.
 *
 * La rangée en double a été retirée. Cette garde existe parce qu'une
 * SUPPRESSION sans garde revient : le prochain qui veut « des exemples sur
 * Découvrir » ne saura pas qu'il y en a déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle n'interdit pas les puces d'exemple comme patron — elle interdit UNE
 * SECONDE rangée sur Découvrir, et rien d'autre. `/search` a eu les siennes
 * (`SearchExampleChips`) jusqu'au 24/10 : #4512 (décision Louis) les a
 * remplacées par « Ou essaie un dossier », des dossiers DÉJÀ dans l'espace.
 * Le témoin ci-dessous prouve que le prédicat juge un namespace à la fois :
 * un autre écran qui porterait `examples` n'est pas lu par cette garde.
 */

const WEB_SRC = join(__dirname, '..')
const DISCOVER_FEATURE = join(WEB_SRC, 'features', 'discover')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full)
  }
  return out
}

/** Les commentaires sont retirés avant lecture : `Discover.tsx` RACONTE le
 *  retrait et nomme le composant retiré — sans ce retrait, la garde se
 *  dénoncerait sur l'explication même de la règle. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/** Le composant de la rangée retirée, tel qu'il se nommerait s'il revenait. */
const REMOVED_COMPONENT = /DiscoverExampleChips/

/** Un fichier de Découvrir qui porterait une seconde rangée de phrases. */
function filesMentioningTheRemovedRow(files: string[]): string[] {
  return files
    .filter(file => REMOVED_COMPONENT.test(stripComments(readFileSync(file, 'utf8'))))
    .map(file => file.slice(file.indexOf('/src/')))
}

/** Le namespace `discover` porte-t-il un SECOND jeu de phrases d'exemple ? */
function carriesASecondExampleBlock(namespace: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(namespace, 'examples')
}

const discoverFiles = sourceFiles(DISCOVER_FEATURE)

describe('#2485 — Découvrir ne dit ses exemples qu’une fois', () => {
  it('LIT quelque chose — les sources de Découvrir et les deux namespaces', () => {
    // Sans ce compte, un répertoire renommé rendrait la garde verte sur du
    // vide : exactement le défaut qu'elle est censée empêcher ailleurs.
    expect(discoverFiles.length).toBeGreaterThan(30)
    expect(discoverFiles.some(file => file.endsWith('/Discover.tsx'))).toBe(true)
    expect(Object.keys(discoverFr).length).toBeGreaterThan(10)
    expect(Object.keys(discoverEn).length).toBeGreaterThan(10)
  })

  it('aucun fichier de Découvrir ne rend une seconde rangée de phrases', () => {
    const offenders = filesMentioningTheRemovedRow(discoverFiles)
    if (offenders.length > 0) {
      throw new Error(
        [
          'Une seconde rangée de phrases d’exemple est revenue sur Découvrir.',
          'Il y en a déjà une, sous la saisie libre (`freetext.examples`) : deux',
          'rangées qui remplissent le MÊME champ, c’est la loi 4 (rien deux fois',
          'sous la même forme avec le même contenu), et c’est le retour #2485.',
          '',
          ...offenders.map(path => `  · ${path}`),
        ].join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })

  it('le composant retiré n’est pas de retour sur le disque', () => {
    expect(existsSync(join(DISCOVER_FEATURE, 'view', 'DiscoverExampleChips.tsx'))).toBe(false)
  })

  it('les deux langues ne portent plus AUCUN jeu de phrases (#2503, 17/09/2026)', () => {
    expect(carriesASecondExampleBlock(discoverFr)).toBe(false)
    expect(carriesASecondExampleBlock(discoverEn)).toBe(false)
    // #2503 — « supprimer les quelques exemples » : le jeu qui restait après
    // le rangement du 16/09 (`freetext.examples`) est retiré à son tour.
    // Découvrir ne porte donc plus la clé du tout, dans aucune langue.
    // #3646 — la saisie libre entière est retirée : le bloc `freetext` aussi.
    expect(discoverFr).not.toHaveProperty('freetext')
    expect(discoverEn).not.toHaveProperty('freetext')
  })

  it('sait dire NON — une rangée fabriquée et un namespace fabriqué sont vus', () => {
    // On rejoue les deux prédicats sur des entrées fabriquées : casser les
    // vraies ferait passer l'écran en double le temps d'un test.
    expect(REMOVED_COMPONENT.test('<DiscoverExampleChips onPick={applyExampleQuery} />')).toBe(true)
    expect(REMOVED_COMPONENT.test('<SearchExampleChips onPick={handleQueryChange} />')).toBe(false)
    expect(carriesASecondExampleBlock({ examples: { label: 'Par exemple :' } })).toBe(true)
    expect(carriesASecondExampleBlock({ freetext: { examples: ['une phrase'] } })).toBe(false)
  })

  it('les commentaires sont retirés avant lecture — Discover.tsx raconte le retrait', () => {
    // Le corpus réel NOMME le composant retiré, dans le commentaire qui dit
    // pourquoi : c'est ce qui rend ce test non vide.
    const discover = discoverFiles.find(file => file.endsWith('/Discover.tsx'))
    expect(discover).toBeDefined()
    const source = readFileSync(discover as string, 'utf8')
    expect(REMOVED_COMPONENT.test(source)).toBe(true)
    expect(REMOVED_COMPONENT.test(stripComments(source))).toBe(false)
    // Et un APPEL, lui, survit au retrait des commentaires.
    expect(REMOVED_COMPONENT.test(stripComments('{/* DiscoverExampleChips */} <p />'))).toBe(false)
    expect(REMOVED_COMPONENT.test(stripComments('<DiscoverExampleChips onPick={pick} />'))).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — un autre écran garde le droit d’avoir ses puces', () => {
    // Le témoin : la garde porte sur la SECONDE rangée de Découvrir, jamais
    // sur les puces d'exemple comme patron. Le namespace RÉEL de `/search`,
    // augmenté d'une rangée `examples`, est vu par le prédicat — et la garde ne
    // l'applique qu'aux namespaces de Découvrir (tests ci-dessus).
    expect(carriesASecondExampleBlock(searchFr)).toBe(false)
    expect(carriesASecondExampleBlock({ ...searchFr, examples: { label: 'Par exemple :' } })).toBe(true)
    // #4512 — `/search` dit ses dossiers, plus d'exemples de saisie : le composant n'existe plus.
    expect(existsSync(join(WEB_SRC, 'features', 'search', 'components', 'SearchExampleChips.tsx'))).toBe(false)
    expect(existsSync(join(WEB_SRC, 'features', 'search', 'components', 'CompanyStep.tsx'))).toBe(true)
  })
})
