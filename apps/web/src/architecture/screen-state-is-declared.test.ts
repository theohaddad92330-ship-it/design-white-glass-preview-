import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UI_STATES } from '@bellum/contracts'

/**
 * GA-244 — UN ÉCRAN DÉCLARE L'ÉTAT DE SA DONNÉE, ET `empty_never` N'EST PAS
 * `empty_true`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET D'OÙ ELLE VIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * PDF 1 §2 (« Socle : primitives, contrats, gardes », 21/08/2026) : « Chaque
 * écran déclare son état. Aucun écran ne rend un tableau vide sans état
 * déclaré », et §2.2 : « Confondre les deux est l'erreur la plus fréquente. Le
 * premier appelle une action de création, le second une action de filtre. »
 *
 * GA-106 tient déjà cette distinction sur UN écran (`/accounts`), par ses mots.
 * Cette garde-ci tient le CONTRAT : les dix états existent, ils sont dits dans
 * les deux langues, et aucun écran ne propose le vide FILTRÉ sans savoir dire
 * aussi le vide INITIAL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE VÉRIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne vérifie PAS « il existe un état vide » — `/accounts` en avait deux et
 * rendait quand même le mauvais. Elle vérifie que :
 *
 *   1. les dix états de la source sont TOUS traduits, FR et EN, titre ET
 *      description — un état sans mots s'afficherait nu ;
 *   2. `empty_never` et `empty_true` ne partagent AUCUN mot significatif, dans
 *      les deux langues : c'est ce qui empêche de recopier la même phrase ;
 *   3. la primitive couvre les dix états (icône ET couleur) — un onzième état
 *      sans rendu serait invisible ;
 *   4. la primitive est MONTÉE sur au moins trois écrans. Dix états branchés
 *      nulle part ne valent rien : c'est le défaut n°1 du dépôt ;
 *   5. aucun écran ne rend `empty_true` sans rendre aussi `empty_never`. Un
 *      écran qui ne sait dire que « assouplis ton filtre » le dira à quelqu'un
 *      qui n'a jamais rien créé — et le geste proposé sera le mauvais.
 *
 * ⚠️ Le point 5 ne vaut PAS dans l'autre sens : un écran sans filtre n'a
 * légitimement que `empty_never`, et l'exiger des deux côtés forcerait à écrire
 * un état inatteignable — le genre de code juste que personne n'appelle.
 */

const SRC = join(__dirname, '..')
const LOCALES = join(SRC, 'i18n', 'locales')
const PRIMITIVE = join(SRC, 'components', 'primitives', 'ScreenState.tsx')
const LANGS = ['fr', 'en'] as const

type StateCopy = { title: string; description: string }
type Catalogue = { states: Record<string, StateCopy> }

function catalogue(lang: (typeof LANGS)[number]): Catalogue {
  return JSON.parse(readFileSync(join(LOCALES, lang, 'screenState.json'), 'utf8')) as Catalogue
}

/**
 * Le fichier SANS ses commentaires, les positions PRÉSERVÉES.
 *
 * Une garde qui attrape ce qu'elle ne vise pas se fait désactiver au troisième
 * faux positif : ce fichier-ci CITE `state="empty_true"` dans sa propre
 * documentation, et un balayage naïf compterait chaque écran qui explique la
 * règle comme un écran qui l'applique. On remplace par des ESPACES de même
 * longueur pour que les numéros de ligne restent justes.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, m => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry) || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

/** Les fichiers qui MONTENT la primitive, hors la primitive elle-même. */
function mountingFiles(): { path: string; code: string }[] {
  const out: { path: string; code: string }[] = []
  for (const file of sourceFiles(SRC)) {
    if (file === PRIMITIVE) continue
    // `src/architecture` décrit la règle, il ne la met pas en œuvre.
    if (file.startsWith(join(SRC, 'architecture'))) continue
    const code = codeOnly(readFileSync(file, 'utf8'))
    if (!/<ScreenState[\s/>]/.test(code)) continue
    out.push({ path: file, code })
  }
  return out
}

/** Les mots d'une phrase, minuscules, sans la ponctuation ni les outils. */
const STOPWORDS = new Set([
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'de',
  'du',
  'et',
  'ou',
  'a',
  'à',
  'ce',
  'cet',
  'cette',
  'que',
  'qui',
  'ne',
  'pas',
  'est',
  'en',
  'y',
  'il',
  'ici',
  'the',
  'a',
  'an',
  'of',
  'and',
  'or',
  'to',
  'is',
  'not',
  'there',
  'this',
  'that',
  'but',
  'for',
  'you',
  'your',
  'has',
  'have',
])
function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOPWORDS.has(word)),
  )
}

describe('GA-244 — les dix états d’écran, déclarés et montés', () => {
  it('la garde LIT quelque chose — un corpus vide la rendrait verte pour toujours', () => {
    expect(UI_STATES.length).toBe(10)
    for (const lang of LANGS) {
      expect(Object.keys(catalogue(lang).states).length).toBeGreaterThan(0)
    }
    expect(readFileSync(PRIMITIVE, 'utf8').length).toBeGreaterThan(500)
    expect(sourceFiles(SRC).length).toBeGreaterThan(200)
    expect(mountingFiles().length).toBeGreaterThan(0)
  })

  it('les dix états sont dits, titre ET description, dans les deux langues', () => {
    const missing: string[] = []
    for (const lang of LANGS) {
      const states = catalogue(lang).states
      for (const state of UI_STATES) {
        const copy = states[state]
        if (!copy?.title?.trim()) missing.push(`${lang} · ${state}.title`)
        if (!copy?.description?.trim()) missing.push(`${lang} · ${state}.description`)
      }
    }
    expect(missing).toEqual([])
  })

  it('`empty_never` et `empty_true` ne partagent aucun mot significatif', () => {
    const shared: string[] = []
    for (const lang of LANGS) {
      const states = catalogue(lang).states
      const never = significantWords(
        `${states['empty_never']?.title ?? ''} ${states['empty_never']?.description ?? ''}`,
      )
      const filtered = significantWords(
        `${states['empty_true']?.title ?? ''} ${states['empty_true']?.description ?? ''}`,
      )
      for (const word of never) if (filtered.has(word)) shared.push(`${lang} · « ${word} »`)
    }
    expect(shared).toEqual([])
  })

  it('la primitive couvre les dix états — icône ET couleur', () => {
    const source = readFileSync(PRIMITIVE, 'utf8')
    const missing: string[] = []
    for (const record of ['ICONS', 'TONES']) {
      const block = source.match(new RegExp(`const ${record}[^{]*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
      expect(block.length).toBeGreaterThan(0)
      for (const state of UI_STATES) {
        if (!new RegExp(`(^|\\n)\\s*${state}\\s*:`).test(block)) missing.push(`${record}.${state}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('la primitive est montée sur au moins trois écrans', () => {
    // « Livre le contrat ET monte-le sur trois à cinq écrans, complètement. »
    expect(mountingFiles().map(file => file.path.replace(/.*\/src\//, 'src/')).length).toBeGreaterThanOrEqual(3)
  })

  it('aucun écran ne dit le vide FILTRÉ sans savoir dire le vide INITIAL', () => {
    const offenders: string[] = []
    for (const { path, code } of mountingFiles()) {
      if (!code.includes('empty_true')) continue
      if (code.includes('empty_never')) continue
      offenders.push(path.replace(/.*\/src\//, 'src/'))
    }
    expect(offenders).toEqual([])
  })

  it('la garde sait dire NON — sur un corpus délibérément cassé', () => {
    // 1. Deux vides qui se recopient : le défaut mesuré en production.
    const never = significantWords('Aucun compte suivi. Lance une recherche.')
    const filtered = significantWords('Aucun compte suivi sur ces critères.')
    const shared = [...never].filter(word => filtered.has(word))
    expect(shared.length).toBeGreaterThan(0)

    // 2. Un écran qui ne sait dire que le vide filtré.
    const oneSided = codeOnly('const x = <ScreenState state="empty_true" />')
    expect(oneSided.includes('empty_true') && !oneSided.includes('empty_never')).toBe(true)

    // 3. Un état sans rendu dans la primitive.
    const amputated = 'const ICONS = {\n  loading: Loader2,\n}\n'
    expect(/(^|\n)\s*empty_never\s*:/.test(amputated)).toBe(false)
  })

  it('la garde ne compte PAS un montage cité dans un commentaire', () => {
    const commented = codeOnly(`
      // On monte <ScreenState state="empty_true" /> ici un jour.
      /* et <ScreenState state="empty_never" /> en bloc */
      const x = 1
    `)
    expect(commented).not.toContain('<ScreenState')

    const real = codeOnly(`
      // Ce commentaire parle de <ScreenState />, la ligne dessous le MONTE.
      const view = <ScreenState state="error" />
    `)
    expect(real).toContain('<ScreenState state="error" />')

    // Les positions ne bougent pas : un message d'erreur reste juste.
    const raw = '// abc\nconst y = <ScreenState />'
    expect(codeOnly(raw)).toHaveLength(raw.length)
  })
})
