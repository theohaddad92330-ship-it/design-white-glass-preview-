import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-286 — LE BLOC « TON ENTREPRISE DANS LA MÉMOIRE MARCHÉ » DIT CE QU'ON
 * OBSERVE, JAMAIS CE QUE L'ENTREPRISE FAIT.
 *
 * Numéro attribué le 11/09/2026 — à vérifier à la fusion, plusieurs lots
 * parallèles posent des gardes le même jour. GA-285 était le plus haut existant
 * (`apps/api/src/architecture/market-memory-esn-observation-threshold.spec.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET QUI L'A ÉCRITE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue #1636 pose elle-même son garde-fou, en toutes lettres et deux fois :
 *
 * · « Wording imposé : "Voilà ce que Bellum observe." — PAS "Voilà la vérité
 *   sur ton entreprise." »
 * · « Si non couverte : "Ton entreprise n'est pas suffisamment couverte dans
 *   nos observations." — aucune conclusion négative. »
 *
 * C'est la doctrine `c65` (« un taux de couverture mesure ce qu'on SAIT, jamais
 * ce que le marché FAIT ») ramenée à UNE entreprise. GA-259 tient la même règle
 * sur les taux de portefeuille, et son corpus est `features/market-memory` +
 * `marketMemory.json` : ce bloc-ci vit ailleurs (`features/profile` +
 * `profile.json`) et lui échappe entièrement. Une règle qui n'est pas gardée
 * redevient une opinion en trois semaines — surtout celle-là, qui se perd au
 * premier remaniement de phrase.
 *
 * Le danger est plus grand ici qu'ailleurs : le lecteur PARLE de son
 * entreprise, en réunion, avec les mots que l'écran lui a donnés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. les libellés existent dans les DEUX langues (sans quoi il n'y a rien à
 *     garder) ;
 *  2. la phrase d'en-tête porte le VERBE « observer » et le marqueur de marque
 *     `{{brand}}` — jamais le nom écrit en clair (GA-252 tient la seconde
 *     moitié sur tous les catalogues, celle-ci exige la présence) ;
 *  3. aucun mot de VÉRITÉ, aucune NÉGATION de recours à des prestataires,
 *     aucun « aucun parcours », aucun zéro ;
 *  4. les trois états sans contenu ont chacun LEUR phrase — `undeclared`,
 *     `insufficient` et `unavailable` ne partagent aucun mot significatif deux
 *     à deux. C'est ce qui empêche de recopier « pas suffisamment couverte » sur
 *     une panne ou sur un profil vide, et c'est le même mécanisme que GA-244 ;
 *  5. le composant ne fabrique aucun zéro (`?? 0`, `|| 0`) ;
 *  6. il est MONTÉ — du code juste que personne n'appelle est le défaut n°1 du
 *     dépôt, et une garde qui vérifierait des mots jamais affichés en serait la
 *     version documentaire.
 */

const WEB_SRC = join(__dirname, '..')
const LOCALES = join(WEB_SRC, 'i18n', 'locales')
const COMPONENT = join(WEB_SRC, 'features', 'profile', 'components', 'EsnMarketMemorySection.tsx')
const PAGE = join(WEB_SRC, 'features', 'profile', 'view', 'ProfilePage.tsx')
const LANGS = ['fr', 'en'] as const

type Block = {
  title: string
  lead: string
  paths: string
  roleFamilies: string
  destinations: string
  matchedOn: Record<string, string>
  insufficient: string
  undeclared: string
  unavailable: string
}

function block(lang: (typeof LANGS)[number]): Block {
  const raw = JSON.parse(readFileSync(join(LOCALES, lang, 'profile.json'), 'utf8')) as {
    marketMemory?: Block
  }
  if (!raw.marketMemory) throw new Error(`profile.json (${lang}) ne porte pas le bloc marketMemory`)
  return raw.marketMemory
}

/** Toutes les phrases du bloc, à plat — `matchedOn` compris. */
function sentences(value: Block): string[] {
  return [
    value.title,
    value.lead,
    value.paths,
    value.roleFamilies,
    value.destinations,
    ...Object.values(value.matchedOn),
    value.insufficient,
    value.undeclared,
    value.unavailable,
  ]
}

/**
 * Les tournures qui transforment une observation en fait sur l'entreprise.
 *
 * Des RACINES et non des mots entiers — « externalise », « externalisation »,
 * « outsourcing », « outsource » sont la même faute conjuguée. ⚠️ « observation »
 * et « observé » n'y sont évidemment PAS : ce sont les mots que la règle
 * DEMANDE, et une garde qui les attraperait interdirait ce qu'elle protège.
 */
const FORBIDDEN: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  // ⚠️ Des bornes `(?<![\p{L}])` … `(?![\p{L}])` et JAMAIS `\b` : en JavaScript
  // `\w` est ASCII, donc `\bvérité\b` ne matche RIEN — entre le « é » et
  // l'espace il n'y a aucune frontière de mot. Écrite avec `\b`, la première
  // version de cette garde laissait passer « Voilà la vérité sur ton
  // entreprise », c'est-à-dire la phrase exacte que l'issue interdit. C'est le
  // test « sait dire NON » ci-dessous qui l'a montré, et rien d'autre n'aurait
  // pu : le corpus réel, lui, était conforme.
  {
    label: 'affirmation de vérité',
    pattern: /(?<![\p{L}])(la vérité|the truth|réalité de ton|truth about)(?![\p{L}])/iu,
  },
  { label: 'recours à des prestataires', pattern: /externalis|outsourc|sous-trait|subcontract/iu },
  {
    label: 'négation d’observation',
    pattern: /(?<![\p{L}])(aucun parcours|no career path|aucune observation|no observation)(?![\p{L}])/iu,
  },
  { label: 'zéro affiché', pattern: /(^|[\s(«"'])0([\s).,!?»"']|$)/u },
]

/** Les mots d'une phrase, minuscules, sans la ponctuation ni les mots outils. */
const STOPWORDS = new Set([
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'de',
  'du',
  'dans',
  'sur',
  'pour',
  'et',
  'ou',
  'à',
  'a',
  'ce',
  'cette',
  'ne',
  'pas',
  'est',
  'en',
  'ton',
  'ta',
  'tes',
  'nos',
  'notre',
  'n',
  'd',
  'l',
  'se',
  'sans',
  'par',
  'qui',
  'que',
  'plus',
  'rien',
  'the',
  'a',
  'an',
  'of',
  'and',
  'or',
  'to',
  'is',
  'not',
  'in',
  'on',
  'for',
  'your',
  'our',
  'with',
  'it',
  'be',
  'that',
  'this',
])

function significantWords(sentence: string): Set<string> {
  return new Set(
    sentence
      .toLowerCase()
      .replace(/\{\{[a-z]+\}\}/gi, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter(word => word.length > 2 && !STOPWORDS.has(word)),
  )
}

/**
 * Ce que CETTE phrase dit et qu'aucune des autres ne dit.
 *
 * ⚠️ La première version de ce test exigeait ZÉRO mot partagé entre les trois
 * états, et elle était FAUSSE : les trois parlent de la même entreprise et des
 * mêmes observations, donc « entreprise » et « observations » se retrouvent
 * légitimement dans deux d'entre elles. Exiger zéro mot commun aurait forcé un
 * vocabulaire artificiel — c'est-à-dire à abîmer les phrases pour satisfaire la
 * garde. La propriété qui compte n'est pas « aucun mot commun », c'est
 * « chacune dit quelque chose que les autres ne disent pas » : deux phrases
 * recopiées n'ont, elles, AUCUN mot distinctif.
 */
function distinctiveWords(target: string, others: readonly string[]): string[] {
  const elsewhere = new Set(others.flatMap(other => [...significantWords(other)]))
  return [...significantWords(target)].filter(word => !elsewhere.has(word))
}

/** Le fichier sans ses commentaires — une garde qui lit sa propre justification
 *  compare du bruit à du bruit. */
function codeOnly(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
}

describe('GA-286 — le bloc « ton entreprise » dit ce qu’on observe', () => {
  it('lit un corpus non vide — les deux catalogues et le composant', () => {
    for (const lang of LANGS) {
      const value = block(lang)
      expect(sentences(value).length).toBeGreaterThanOrEqual(9)
      for (const sentence of sentences(value)) expect(sentence.trim().length).toBeGreaterThan(0)
    }
    expect(readFileSync(COMPONENT, 'utf8').length).toBeGreaterThan(1000)
  })

  it('la phrase d’en-tête porte le VERBE « observer » et le marqueur de marque', () => {
    expect(block('fr').lead).toMatch(/observe/i)
    expect(block('en').lead).toMatch(/observes/i)
    for (const lang of LANGS) expect(block(lang).lead).toContain('{{brand}}')
  })

  it('aucune phrase ne transforme une observation en fait sur l’entreprise', () => {
    for (const lang of LANGS) {
      for (const sentence of sentences(block(lang))) {
        for (const { label, pattern } of FORBIDDEN) {
          expect(`${lang} — ${label} — ${sentence}`).not.toMatch(pattern)
        }
      }
    }
  })

  it('SAIT DIRE NON — les quatre fautes que l’issue nomme sont détectées', () => {
    const fautifs = [
      'Voilà la vérité sur ton entreprise.',
      'Ton entreprise n’externalise pas.',
      'Aucun parcours observé autour de ton entreprise.',
      '0 parcours observés autour de ton entreprise.',
    ]
    for (const fautif of fautifs) {
      expect(FORBIDDEN.some(({ pattern }) => pattern.test(fautif))).toBe(true)
    }
  })

  it('n’attrape pas ce qu’elle ne vise pas — les phrases LÉGITIMES passent', () => {
    // Un témoin par famille de faux positif possible : le vocabulaire de
    // l'observation (que la règle EXIGE), un nombre qui n'est pas zéro, et une
    // phrase du bloc voisin `esn` du même catalogue.
    const legitimes = [
      'Voilà ce que {{brand}} observe.',
      '14 parcours observés autour de ton entreprise.',
      'Ton entreprise n’est pas suffisamment couverte dans nos observations.',
      (JSON.parse(readFileSync(join(LOCALES, 'fr', 'profile.json'), 'utf8')) as { esn: { subtitle: string } }).esn
        .subtitle,
    ]
    for (const legitime of legitimes) {
      const hit = FORBIDDEN.find(({ pattern }) => pattern.test(legitime))
      expect(`${legitime} — attrapée par « ${hit?.label ?? ''} »`).toBe(legitime + ' — attrapée par «  »')
    }
  })

  it('les trois états sans contenu ont chacun LEUR phrase', () => {
    // « rien n'a été cherché », « pas assez d'observations » et « on n'a pas pu
    // lire » sont trois choses différentes. Chacune doit dire quelque chose que
    // les deux autres ne disent pas — c'est ce qui empêche d'en recopier une
    // sur l'autre, et c'est le mécanisme de GA-244 sur `empty_never` /
    // `empty_true`.
    for (const lang of LANGS) {
      const { undeclared, insufficient, unavailable } = block(lang)
      expect(distinctiveWords(undeclared, [insufficient, unavailable]).length).toBeGreaterThan(0)
      expect(distinctiveWords(insufficient, [undeclared, unavailable]).length).toBeGreaterThan(0)
      expect(distinctiveWords(unavailable, [undeclared, insufficient]).length).toBeGreaterThan(0)
    }
  })

  it('SAIT DIRE NON — trois phrases recopiées n’ont aucun mot distinctif', () => {
    const copie = 'Ton entreprise n’est pas suffisamment couverte dans nos observations.'
    expect(distinctiveWords(copie, [copie, copie])).toEqual([])
    // Et le témoin voisin LÉGITIME : une variante qui dit vraiment autre chose
    // garde ses mots à elle.
    expect(distinctiveWords('Ces observations n’ont pas pu être lues.', [copie])).not.toEqual([])
  })

  it('le composant ne fabrique aucun zéro', () => {
    const code = codeOnly(readFileSync(COMPONENT, 'utf8'))
    expect(code).not.toMatch(/\?\?\s*0\b/)
    expect(code).not.toMatch(/\|\|\s*0\b/)
  })

  it('il est MONTÉ — sinon la garde surveillerait des mots que personne ne voit', () => {
    expect(codeOnly(readFileSync(PAGE, 'utf8'))).toMatch(/<EsnMarketMemorySection\s*\/>/)
  })
})
