import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONTACT_SCORE_CRITERIA, SCORE_AXES, SCORE_AXIS_MAX } from '@bellum/contracts'
import {
  ACCOUNT_SCORE_ILLUSTRATION,
  CONTACT_SCORE_ILLUSTRATIONS,
  type IllustrationScore,
} from './lib/score-illustration'

/** Tous les scores que le site publie, quel qu'en soit l'écran. */
const PUBLISHED: readonly IllustrationScore[] = [ACCOUNT_SCORE_ILLUSTRATION, ...CONTACT_SCORE_ILLUSTRATIONS]

/**
 * Le site ne publie jamais un score NU (passe B, archive 07, item 17).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * La page d'accueil affichait, dans la carte flottante du héros :
 *
 *     SCORE D'OPPORTUNITÉ
 *          87 / 100
 *        Fort potentiel
 *
 * Aucun axe, rien sur ce qui n'a pas pu être évalué, et un qualificatif de
 * potentiel collé à un chiffre — c'est-à-dire exactement la lecture
 * probabiliste que la doctrine refuse depuis six arbitrages. Le mockup de
 * l'app ajoutait un anneau « 8,5 /10 · GO », la page produit trois anneaux
 * « 92 / 88 / 81 » sans dénominateur, et une colonne « Score » par site.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `grep "/100"` NE LE TROUVAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le chiffre et son dénominateur vivaient dans DEUX éléments JSX :
 *
 *     <span …>87</span><span …> / 100</span>
 *
 * Aucune recherche de texte ne recolle ces deux morceaux. La garde, elle,
 * reconstitue le texte que le VISITEUR lit — balises retirées, littéraux
 * retirés — puis cherche le score dedans. C'est la seule façon de lire un
 * écran plutôt qu'un fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EXIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Aucun score ne s'écrit EN DUR dans une page. Les chiffres viennent de
 *    `src/lib/score-illustration.ts`, seul endroit déclaré — et ce module ne
 *    sait produire qu'un score DÉCOMPOSÉ.
 * 2. Ce module ne peut pas inventer ses axes : leurs clés et leurs plafonds
 *    sont confrontés à `@bellum/contracts` (`SCORE_AXES`,
 *    `CONTACT_SCORE_CRITERIA`). Le jour où le produit change de grille, le
 *    site devient rouge — il ne dérive pas en silence.
 * 3. Un axe non évaluable SORT du dénominateur, et il est NOMMÉ.
 * 4. Trois axes évalués au minimum : « sous 3 axes, il n'y a pas de score ».
 * 5. Chaque axe a un libellé dans TOUTES les langues servies. Un score
 *    décomposé en français et nu en néerlandais reste un score nu.
 * 6. Aucun vocabulaire de probabilité, dans aucune langue.
 *
 * `@bellum/contracts` est une devDependency du site : la garde le lit, la page
 * non. Le site reste autonome à l'exécution, et la CI tient l'accord.
 */

const SRC = __dirname
const MESSAGES = join(SRC, '..', 'messages')

/** Le seul module autorisé à porter des chiffres de score, et la garde elle-même. */
const DECLARED_SOURCE = join('lib', 'score-illustration.ts')

// ─────────────────────────────────────────────────────────────────────────────
// Lecture du corpus
// ─────────────────────────────────────────────────────────────────────────────

function walkFiles(dir: string, keep: (name: string) => boolean): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full, keep))
    else if (keep(entry.name)) out.push(full)
  }
  return out
}

/** Les pages et composants du site — pas les tests, qui citent le défaut. */
function pageFiles(): string[] {
  return walkFiles(SRC, name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)).filter(
    path => !path.endsWith(DECLARED_SOURCE),
  )
}

function locales(): string[] {
  return readdirSync(MESSAGES, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

function stringsOf(locale: string): Map<string, string> {
  const out = new Map<string, string>()
  const dir = join(MESSAGES, locale)
  for (const file of readdirSync(dir).filter(name => name.endsWith('.json'))) {
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') return void out.set(path, node)
      if (Array.isArray(node)) return void node.forEach((child, i) => walk(child, `${path}[${i}]`))
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`)
      }
    }
    walk(JSON.parse(readFileSync(join(dir, file), 'utf8')), `${locale}/${file}`)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Ce que le VISITEUR lit
// ─────────────────────────────────────────────────────────────────────────────

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/**
 * Le texte rendu par un fichier TSX, reconstitué.
 *
 * On retire les commentaires, puis les littéraux — toute la CSS de Tailwind y
 * passe, et `bg-white/10` n'est pas un score. Ce qui reste des NŒUDS DE TEXTE
 * (ce qui sépare un `>` d'un `<`, sans accolade au milieu) est recollé dans
 * l'ordre : deux `<span>` voisins redeviennent une seule phrase, et c'est
 * exactement ce qu'aucun `grep "/100"` ne voyait.
 *
 * Une accolade exclut le nœud : `{total}` n'est pas un chiffre en dur, c'est
 * un renvoi au module déclaré. C'est la distinction que la garde veut faire.
 */
function renderedText(source: string): string {
  const stripped = withoutComments(source)
    .replace(/`(?:\\.|[^`\\])*`/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ')
  return [...stripped.matchAll(/>([^<>{}]*)</g)]
    .map(match => (match[1] ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
}

/** Les littéraux de chaîne d'un fichier — la copie écrite en dur. */
function stringLiterals(source: string): string[] {
  return [...withoutComments(source).matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)].map(m => m[1] ?? m[2] ?? '')
}

// ─────────────────────────────────────────────────────────────────────────────
// Les motifs interdits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un score publié : un nombre lu sur un dénominateur de score.
 *
 * ⚠️ Pas de drapeau `g` : `RegExp.test()` avec `g` est STATEFUL et rend un
 * résultat sur deux — c'est l'une des six gardes borgnes du dépôt.
 */
const PUBLISHED_SCORE = /(\d+(?:[.,]\d+)?)\s*(?:\/|sur\s+|out of\s+|von\s+|van\s+)\s*(?:10|20|25|100)(?!\d)/i

/** « Score ≥ 75 » : un seuil de score annoncé sans dire de quoi il est fait. */
const SCORE_THRESHOLD = /\bscores?\b\s*[≥≤<>=]+\s*\d/i

/** Un champ `score: 92` dans un jeu de données de page — le chiffre nu de la veille. */
const SCORE_FIELD = /\bscores?\s*:\s*-?\d/i

/**
 * Un score passé à une prop sans passer par le module déclaré : `<Gauge value={0.87} />`.
 * Une jauge remplie par une constante est un score nu qui ne s'écrit même pas.
 */
const SCORE_PROP = /\b(?:value|score|ratio|percent|progress)\s*=\s*\{\s*-?\d/

/** La lecture qu'on refuse depuis six arbitrages : un score lu comme une chance. */
const PROBABILITY_WORDS =
  /\bprobabilit[ée]s?\b|\bchances?\s+(?:de|d')\b|\bprobabilit(?:y|ies)\b|\blikelihood\b|\bWahrscheinlichkeit\b|\bkans\s+op\b/i

// ─────────────────────────────────────────────────────────────────────────────

describe('le site ne publie jamais un score nu', () => {
  it('lit vraiment le corpus — sinon la garde serait verte sur du vide', () => {
    // Sans ces bornes, un chemin cassé rendrait tous les tests suivants verts
    // sur zéro fichier lu. Le dépôt a déjà eu six gardes borgnes ; celle-ci
    // doit prouver qu'elle a quelque chose sous les yeux.
    const files = pageFiles()
    expect(files.length).toBeGreaterThanOrEqual(40)

    const rendered = files.map(path => renderedText(readFileSync(path, 'utf8'))).join(' ')
    expect(rendered.length).toBeGreaterThan(200)

    const langs = locales()
    expect(langs.length).toBeGreaterThanOrEqual(2)
    for (const locale of langs) expect(stringsOf(locale).size).toBeGreaterThan(50)
  })

  it('aucune page n’écrit un score en dur', () => {
    const offenders: string[] = []
    for (const path of pageFiles()) {
      const source = readFileSync(path, 'utf8')
      const rendered = renderedText(source)
      const hit = PUBLISHED_SCORE.exec(rendered)
      if (hit) offenders.push(`${path} → texte rendu « …${excerpt(rendered, hit.index)}… »`)
      const field = SCORE_FIELD.exec(source)
      if (field) offenders.push(`${path} → champ « ${excerpt(source, field.index).replace(/\s+/g, ' ')} »`)
      const prop = SCORE_PROP.exec(source)
      if (prop) offenders.push(`${path} → prop « ${excerpt(source, prop.index).replace(/\s+/g, ' ')} »`)
      for (const literal of stringLiterals(source)) {
        if (SCORE_THRESHOLD.test(literal)) offenders.push(`${path} → « ${literal} »`)
      }
    }
    expect(
      offenders,
      '\nUn score n’est jamais nu : ses axes, et ce qui n’a pas pu être évalué est NOMMÉ.\n' +
        `Les chiffres d’un score passent par ${DECLARED_SOURCE}, qui ne sait produire qu’un score décomposé.\n` +
        `\nEn dur :\n${offenders.join('\n')}\n`,
    ).toEqual([])
  })

  it('aucun libellé traduit ne publie un score nu ni ne le présente comme une chance', () => {
    const offenders: string[] = []
    for (const locale of locales()) {
      for (const [path, text] of stringsOf(locale)) {
        if (PUBLISHED_SCORE.test(text)) offenders.push(`${path} → « ${text.slice(0, 140)} » (score nu)`)
        if (SCORE_THRESHOLD.test(text)) offenders.push(`${path} → « ${text.slice(0, 140)} » (seuil nu)`)
        if (PROBABILITY_WORDS.test(text)) offenders.push(`${path} → « ${text.slice(0, 140)} » (probabilité)`)
      }
    }
    expect(offenders, `\nLibellés fautifs :\n${offenders.join('\n')}\n`).toEqual([])
  })

  it('les axes du site sont ceux du produit — le site ne les invente pas', () => {
    for (const axis of ACCOUNT_SCORE_ILLUSTRATION.axes) {
      expect(SCORE_AXES as readonly string[], `Axe inconnu du produit : ${axis.key}`).toContain(axis.key)
      expect(axis.max, `L’axe ${axis.key} n’est pas noté sur ${SCORE_AXIS_MAX}.`).toBe(SCORE_AXIS_MAX)
    }
    // Tous les axes du produit sont représentés : en omettre un donnerait un
    // score partiel présenté comme complet.
    expect(ACCOUNT_SCORE_ILLUSTRATION.axes.map(a => a.key).sort()).toEqual([...SCORE_AXES].sort())

    const caps = new Map(CONTACT_SCORE_CRITERIA.map(c => [c.key as string, c.max]))
    for (const contact of CONTACT_SCORE_ILLUSTRATIONS) {
      for (const axis of contact.axes) {
        expect([...caps.keys()], `Critère inconnu du produit : ${axis.key}`).toContain(axis.key)
        expect(axis.max, `Le critère ${axis.key} n’a pas le plafond du produit.`).toBe(caps.get(axis.key))
      }
      expect(contact.axes.map(a => a.key).sort()).toEqual([...caps.keys()].sort())
    }
    expect(CONTACT_SCORE_ILLUSTRATIONS.length, 'Aucun contact publié : la garde lirait du vide.').toBeGreaterThan(0)
  })

  it('un axe non évaluable sort du dénominateur, et il est nommé', () => {
    for (const score of PUBLISHED) {
      const evaluated = score.axes.filter(axis => axis.evaluated)
      expect(evaluated.length, 'Sous 3 axes, il n’y a pas de score.').toBeGreaterThanOrEqual(3)
      expect(score.outOf, 'Le dénominateur doit être la somme des plafonds ÉVALUÉS.').toBe(
        evaluated.reduce((sum, axis) => sum + axis.max, 0),
      )
      expect(score.points, 'Le total doit être la somme des points ÉVALUÉS.').toBe(
        evaluated.reduce((sum, axis) => sum + axis.points, 0),
      )
      expect(score.notEvaluated, 'Ce qui n’a pas pu être évalué doit être NOMMÉ.').toEqual(
        score.axes.filter(axis => !axis.evaluated).map(axis => axis.key),
      )
      // Un axe non évalué à 0 point serait « non mesuré = 0 », le zéro qui ment.
      for (const axis of score.axes.filter(a => !a.evaluated)) expect(axis.points).toBe(0)
    }
  })

  it('chaque axe porte un libellé dans toutes les langues servies', () => {
    const needed = [
      ...ACCOUNT_SCORE_ILLUSTRATION.axes.map(axis => `common.json.score.accountAxes.${axis.key}`),
      ...CONTACT_SCORE_ILLUSTRATIONS[0]!.axes.map(axis => `common.json.score.contactAxes.${axis.key}`),
      'common.json.score.notEvaluated',
      'common.json.score.outOf',
      'common.json.score.sample',
    ]
    for (const locale of locales()) {
      const strings = stringsOf(locale)
      for (const key of needed) {
        const value = strings.get(`${locale}/${key}`)
        expect(
          value,
          `${locale} n’a pas « ${key} » — un score décomposé dans une seule langue reste nu ailleurs.`,
        ).toBeTruthy()
      }
    }
  })

  it('sait dire NON — le code exact qui était en ligne est détecté', () => {
    // Preuve qu'elle mesure. Le premier bloc est le JSX du héros, verbatim :
    // le chiffre et son dénominateur y sont dans deux éléments distincts, ce
    // qui est précisément ce qu'aucun grep ne voyait.
    const wasOnline = `
      <div className="relative mx-auto grid size-[110px] place-items-center">
        <Gauge size="large" value={0.87} colors={{ '0': '#36e6a0' }} />
        <div className="absolute inset-0 grid place-items-center">
          <div>
            <span className="text-2xl font-semibold text-white">87</span>
            <span className="text-xs text-[#8a8aa0]"> / 100</span>
          </div>
        </div>
      </div>`
    const rendered = renderedText(wasOnline)
    expect(rendered, 'L’extracteur doit recoller les deux <span>.').toMatch(/87\s*\/\s*100/)
    expect(PUBLISHED_SCORE.test(rendered)).toBe(true)

    // Le second est l'anneau du mockup d'app, verbatim.
    const scoreRing = `
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-lg font-semibold text-white">8,5</span>
          <span className="mt-0.5 text-xs text-[#8a8aa0]">/10</span>
        </span>`
    expect(PUBLISHED_SCORE.test(renderedText(scoreRing))).toBe(true)

    // Et les libellés que la passe B a cités, plus le seuil resté en dur.
    for (const phrase of [
      'Analyse de compte 87/100 — Fort potentiel',
      "Priorisation IA — Score d'opportunité 92/100",
      'Score 8.5/10',
      'Opportunity score 92 out of 100',
    ]) {
      expect(PUBLISHED_SCORE.test(phrase), `Non détecté : « ${phrase} »`).toBe(true)
    }
    expect(SCORE_THRESHOLD.test('Score ≥ 75')).toBe(true)
    expect(SCORE_FIELD.test("{ city: 'Paris', typeKey: 'siege', score: 92 }")).toBe(true)
    expect(SCORE_PROP.test("<Gauge size=\"large\" value={0.87} colors={{ '0': '#36e6a0' }} />")).toBe(true)
    for (const phrase of ['85 % de chances de signer', 'Closing probability: 74%', 'Wahrscheinlichkeit 60 %']) {
      expect(PROBABILITY_WORDS.test(phrase), `Non détecté : « ${phrase} »`).toBe(true)
    }

    // …et elle ne crie pas sur ce qui n'est pas un score : la classe Tailwind
    // `bg-white/10`, une fraction de régions, un tarif.
    const innocent = `<div className="bg-white/10 text-white/100">225 sites · 13/13 régions — 199 €/mois</div>`
    expect(PUBLISHED_SCORE.test(renderedText(innocent))).toBe(false)
  })
})

function excerpt(text: string, index: number): string {
  return text.slice(Math.max(0, index - 40), index + 60).trim()
}
