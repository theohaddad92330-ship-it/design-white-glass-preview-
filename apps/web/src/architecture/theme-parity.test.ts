/**
 * GA-33 — les deux thèmes sont une promesse, pas une commodité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DÉCISION
 * ─────────────────────────────────────────────────────────────────────────
 * D79 (Louis, 23/08) : le produit promet le thème clair ET le thème sombre, à
 * parité. Le bouton de bascule est visible en bas de la barre latérale et son
 * choix est persisté — promettre puis ne pas tenir est pire que ne pas
 * promettre.
 *
 * Ce que ça engage concrètement, et que cette garde vérifie :
 *
 * 1. **Chaque variable de couleur existe dans les DEUX blocs.** Une variable
 *    définie seulement sur `:root` hérite sa valeur claire dans le thème
 *    sombre — donc du texte noir sur fond noir, invisible, et personne ne le
 *    voit tant qu'un client n'ouvre pas cet écran-là dans ce thème-là.
 *
 * 2. **Chaque couple texte/fond passe le contraste AA** (4,5:1). Mesuré le
 *    23/08 : les douze couples passent dans les deux thèmes. La garde fige ce
 *    résultat — un ajustement de palette qui ferait passer un gris sous le
 *    seuil se verrait ici et non chez un client.
 *
 * 3. **Aucune couleur écrite en dur dans un écran.** Une valeur hexadécimale
 *    dans du JSX ne change pas avec le thème, par construction. Le dépôt en
 *    avait UNE, sur l'écran de back-office : `bg-[#09090B]`, un rectangle noir
 *    servi à un utilisateur en thème clair.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { semanticColors, type SemanticVariant } from '@bellum/ui'

const SRC = join(__dirname, '..')
const TOKENS = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8')

/** Les déclarations d'un bloc de sélecteur, à plat. */
function declarations(selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of TOKENS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const own = (match[1] ?? '').trim().split('\n').pop()?.trim()
    if (own !== selector) continue
    for (const decl of (match[2] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out[decl[1] as string] = (decl[2] as string).trim()
    }
  }
  return out
}

const light = declarations(':root')
const dark = declarations('.dark')

function luminance(hex: string): number {
  const raw = hex.replace('#', '')
  const channels = [0, 2, 4].map(i => parseInt(raw.slice(i, i + 2), 16) / 255)
  const linear = channels.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (linear[0] as number) + 0.7152 * (linear[1] as number) + 0.0722 * (linear[2] as number)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi as number) + 0.05) / ((lo as number) + 0.05)
}

const TEXTS = [
  '--bellum-text-primary',
  '--bellum-text-secondary',
  '--bellum-text-muted',
  // Le texte d'accent est celui qui manquait, et son absence coûtait cher :
  // 149 listes de classes écrivaient `text-[var(--bellum-primary-500)]`, une
  // nuance FIXE qui donne 5,78:1 en clair et **2,68:1 en sombre**. Aucune
  // nuance de la gamme ne passe des deux côtés — il fallait un token.
  '--bellum-text-accent',
  // Les couleurs SÉMANTIQUES en texte. GA-33 ne les regardait pas, et le thème
  // clair y échouait massivement : `--bellum-warning` donne 9,47:1 en sombre
  // et **1,84:1 en clair**. Ce sont des couleurs de PASTILLE et d'ICÔNE ; le
  // texte passe par leur variante `*-soft-text`, qui tient sur le fond de page
  // comme sur la pastille.
  '--success-soft-text',
  '--warning-soft-text',
  '--danger-soft-text',
  '--info-soft-text',
  '--bellum-success-text',
  '--bellum-warning-text',
]
const GROUNDS = ['--bellum-bg', '--bellum-bg-lighter', '--bellum-surface-1', '--bellum-surface-2']

/**
 * Le fichier SANS ses commentaires.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EN A BESOIN — 01/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Les balayages ci-dessous extraient les fragments entre guillemets ET entre
 * accents graves, parce qu'une liste de classes s'écrit dans les deux. Or un
 * commentaire qui CITE une classe interdite en style markdown — `text-amber-400`
 * — est, pour une expression régulière, indistinguable d'un gabarit.
 *
 * Un agent s'est fait accuser d'écrire la classe alors qu'il écrivait la phrase
 * qui l'INTERDIT. C'est le pire faux positif possible pour une garde : celui qui
 * punit quelqu'un d'avoir documenté la règle. **Et une garde qui attrape ce
 * qu'elle ne vise pas se fait désactiver au troisième faux positif** — le dépôt
 * a déjà payé ce motif six fois en deux jours.
 *
 * ⚠️ On remplace par des ESPACES de même longueur : les positions et les numéros
 * de ligne restent justes dans les messages d'erreur.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
}

/**
 * `pattern` par défaut = `.tsx` seulement, comme avant. Un second angle mort
 * de cette garde (recette 10/09, à côté du guillemet simple) : les deux
 * VRAIES violations de la palette Tailwind en texte vivent dans des `.ts`
 * PLAINS (`accounts-list/types.ts`, `lib/contactRoles.ts`) — des tables de
 * classes consommées par des écrans plus loin, jamais des écrans en
 * elles-mêmes, mais « ce qu'un écran écrit à l'affichage » n'exige pas que le
 * fichier porte du JSX. Le test qui les cherche passe `/\.tsx?$/` ; les
 * AUTRES tests de ce fichier gardent le défaut `.tsx` — élargir pour tout le
 * monde d'un coup réveillerait des violations `.ts` d'AUTRES règles,
 * dormantes ailleurs dans le dépôt et hors du périmètre de cette recette.
 */
function sourceFiles(dir: string, pattern: RegExp = /\.tsx$/): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full, pattern))
      continue
    }
    if (!pattern.test(entry) || entry.endsWith('.d.ts') || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

/**
 * recette 10/09 — hoisté hors de l'`it()` pour que le test « le découpage
 * attrape aussi un guillemet SIMPLE » ci-dessous exerce EXACTEMENT le même
 * découpage que le scan réel, au lieu d'une copie locale qui aurait pu
 * diverger sans qu'aucun test ne le remarque (le défaut même de cette garde).
 *
 * ⚠️ Ce dépôt écrit en guillemets SIMPLES (prettier `singleQuote`). Le
 * découpage d'origine ne coupait qu'entre guillemets DOUBLES et gabarits —
 * `"[^"\n]*"` et `` `[^`]*` `` — donc toute classe interdite écrite entre
 * guillemets simples (la forme la plus courante ici) n'était jamais VUE :
 * 7 occurrences trouvées, 14 manquées, dont 10 vraies violations.
 */
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const TAILWIND_TEXT_COLOUR_CHUNK = new RegExp(`"[^"\\n]*"|'[^'\\n]*'|\`[^\`]*\``, 'g')
const TAILWIND_TEXT_COLOUR = new RegExp(`(?<![\\w-])text-(?:${PALETTE})-\\d{2,3}(?![\\w-])`)
const TAILWIND_SOLID_GROUND = new RegExp(`(?<![\\w-])bg-(?:${PALETTE})-\\d{2,3}(?![\\w/-])`)
const TAILWIND_DARK_PAIR = new RegExp(`dark:text-(?:${PALETTE})-\\d`)
// Un variant `group-[.destructive]:` ne s'applique qu'à l'intérieur d'un
// conteneur au fond destructif PLEIN — le bouton de fermeture d'un toast
// d'erreur. Même raison que le fond opaque : la couleur ne change pas avec
// le thème, son texte non plus.
const TAILWIND_SOLID_VARIANT = /group-\[\.destructive\]:/

/**
 * #2484 — une couleur sémantique brute mélangée par `color-mix()` reste une
 * couleur de pastille : le mélange ne la rend pas lisible, il la déplace.
 * Sans drapeau `g` : `.test()` reste sans état.
 */
const WRAPPED_SEMANTIC_TEXT = /(?<!dark:)text-\[color-mix\([^\]]*var\(--bellum-(?:warning|success|danger|info)\s*[,)]/

describe('GA-33 (#2484) — la couleur sémantique enveloppée dans un mélange', () => {
  it('sait dire NON — le mélange au survol, et au repos', () => {
    expect(WRAPPED_SEMANTIC_TEXT.test('hover:text-[color-mix(in_srgb,var(--bellum-danger)_82%,black)]')).toBe(true)
    expect(WRAPPED_SEMANTIC_TEXT.test('text-[color-mix(in_srgb,var(--bellum-warning)_70%,white)]')).toBe(true)
  })

  it("n'attrape pas ce qu'elle ne vise pas — un FOND mélangé, un texte soft, un mélange de surface", () => {
    expect(WRAPPED_SEMANTIC_TEXT.test('bg-[color-mix(in_srgb,var(--bellum-danger)_12%,transparent)]')).toBe(false)
    expect(WRAPPED_SEMANTIC_TEXT.test('text-[var(--danger-soft-text)]')).toBe(false)
    expect(WRAPPED_SEMANTIC_TEXT.test('text-[color-mix(in_srgb,var(--bellum-text-primary)_80%,transparent)]')).toBe(
      false,
    )
    expect(WRAPPED_SEMANTIC_TEXT.test('dark:text-[color-mix(in_srgb,var(--bellum-danger)_82%,white)]')).toBe(false)
  })
})

describe('GA-33 — la parité des deux thèmes', () => {
  it('la garde lit bien les deux blocs — sinon elle serait verte pour toujours', () => {
    expect(Object.keys(light).length).toBeGreaterThan(20)
    expect(Object.keys(dark).length).toBeGreaterThan(10)
  })

  it('toute variable redéfinie en sombre existe en clair, et réciproquement pour les couleurs de surface', () => {
    // Le sens qui compte : une variable de surface ou de texte présente en
    // clair et ABSENTE en sombre hérite sa valeur claire — c'est le noir sur
    // noir. L'inverse (définie seulement en sombre) n'existe pas ici, le bloc
    // sombre étant par construction une liste de surcharges.
    const surfaces = Object.keys(light).filter(name => /--bellum-(text|bg|surface|border)/.test(name))
    const missing = surfaces.filter(name => !(name in dark))
    expect(missing).toEqual([])
  })

  it('chaque couple texte/fond passe AA (4,5:1) dans les deux thèmes', () => {
    const failures: string[] = []
    for (const [theme, vars] of [
      ['clair', light],
      ['sombre', dark],
    ] as const) {
      for (const text of TEXTS) {
        for (const ground of GROUNDS) {
          const a = vars[text]
          const b = vars[ground]
          if (!a?.startsWith('#') || !b?.startsWith('#')) continue
          const ratio = contrast(a, b)
          if (ratio < 4.5) failures.push(`${theme} · ${text} sur ${ground} = ${ratio.toFixed(2)}:1`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  /**
   * #3761 — `semanticColors` (`packages/ui/src/atoms/variants.ts`) est la
   * palette que `ReplyStatusBadge` (reply-kit, les cartes de Laura) pose sur
   * son LIBELLÉ. `info` et `danger` y lisaient le jeton BRUT
   * (`--bellum-info` / `--bellum-danger`, pensé pour une pastille ou une
   * icône — 3:1) dans les DEUX thèmes, jamais la variante `*-soft-text`
   * (pensée pour du TEXTE — 4,5:1) : 3,60:1 et 3,00:1 en CLAIR, sous le seuil
   * AA des deux côtés. L'exception « paire `text-… dark:text-[var(--bellum-…)]`
   * déjà posée » de la garde juste en dessous ne regarde QUE la paire, jamais
   * si la valeur CLAIRE elle-même passe AA — c'est l'angle mort que cette
   * garde-ci ferme, en important la vraie palette plutôt qu'un extrait.
   */
  it('la palette sémantique de @bellum/ui (ReplyStatusBadge compris) passe AA en texte, dans les deux thèmes', () => {
    const failures: string[] = []
    for (const variant of ['info', 'success', 'warning', 'danger'] as SemanticVariant[]) {
      const match = /text-\[var\((--[\w-]+)\)\]/.exec(semanticColors[variant].text)
      if (!match) {
        failures.push(`${variant} : classe de texte illisible (${semanticColors[variant].text})`)
        continue
      }
      const token = match[1] as string
      for (const [theme, vars] of [
        ['clair', light],
        ['sombre', dark],
      ] as const) {
        const value = vars[token]
        const ground = vars['--bellum-bg']
        if (!value?.startsWith('#') || !ground?.startsWith('#')) {
          failures.push(`${variant} (${theme}) : ${token} ou --bellum-bg illisible`)
          continue
        }
        const ratio = contrast(value, ground)
        if (ratio < 4.5) failures.push(`${variant} (${theme}) : ${token} = ${ratio.toFixed(2)}:1`)
      }
    }
    expect(failures).toEqual([])
  })

  it("aucun écran n'écrit une nuance FIXE de la gamme primaire en couleur de texte", () => {
    // Une nuance fixe ne peut pas passer AA des deux côtés : c'est arithmétique,
    // pas une question de goût. `--bellum-text-accent` existe pour ça.
    //
    // La seule exception tolérée est le texte posé sur une PASTILLE teintée en
    // primaire : cette pastille garde la même couleur dans les deux thèmes
    // (la gamme primaire est indépendante du mode), donc son texte aussi.
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const source = codeOnly(readFileSync(file, 'utf8'))
      for (const match of source.matchAll(/"([^"]*text-\[var\(--bellum-primary-\d+\)\][^"]*)"/g)) {
        const cls = match[1] as string
        if (/bg-\[var\(--bellum-primary-|bg-\[color-mix\([^\]]*primary/.test(cls)) continue
        offenders.push(`${file.replace(/.*\/src\//, 'src/')} → ${cls.slice(0, 60)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('la garde ne voit PAS une classe citée dans un commentaire, et voit toujours la vraie', () => {
    // Les deux bords, en un seul test — parce qu'un retrait de commentaires trop
    // gourmand rendrait la garde aveugle, ce qui est pire que le faux positif
    // qu'il corrige.
    const commente = codeOnly(`
      // On n'écrit jamais \`text-amber-400\` : cette nuance est pensée pour un fond sombre.
      /* Idem pour "text-red-500" en bloc. */
      const x = 1
    `)
    expect(commente).not.toContain('text-amber-400')
    expect(commente).not.toContain('text-red-500')

    const vrai = codeOnly(`
      // Ce commentaire parle de \`text-amber-400\`, la ligne dessous la POSE.
      const cls = "text-amber-400 font-medium"
    `)
    expect(vrai).toContain('"text-amber-400 font-medium"')

    // Les positions ne bougent pas : un message d'erreur reste juste.
    const brut = '// abc\nconst y = "text-red-500"'
    expect(codeOnly(brut)).toHaveLength(brut.length)
  })

  it('recette 10/09 — le découpage attrape aussi un guillemet SIMPLE, pas seulement double et gabarit', () => {
    // GA-33 était borgne : ce dépôt écrit en guillemets simples (prettier
    // `singleQuote`), et le découpage du test suivant ne coupait qu'entre
    // guillemets DOUBLES et gabarits. Rejoué à l'identique sur les deux
    // corpus (`apps/web/src` + `packages/ui/src`) : 7 occurrences vues, 14
    // manquées, dont 10 vraies violations dans `accounts-list/types.ts` et
    // `lib/contactRoles.ts` — jamais vues par la garde. Ce test exerce le
    // MÊME découpage que le scan réel (constante partagée, pas une copie) :
    // il sait dire NON à un cas que la garde laissait passer.
    const source = "const text = 'text-emerald-400'"
    expect(source.match(TAILWIND_TEXT_COLOUR_CHUNK)).toEqual(["'text-emerald-400'"])
    // Témoins de non-régression : les deux formes déjà couvertes continuent
    // de matcher, guillemet simple compris dans le même passage.
    const mixed = `const a = "text-red-400"; const b = 'text-amber-400'; const c = \`text-sky-400\``
    expect(mixed.match(TAILWIND_TEXT_COLOUR_CHUNK)).toEqual(['"text-red-400"', "'text-amber-400'", '`text-sky-400`'])
  })

  it("aucun écran n'écrit une couleur de la palette Tailwind en texte", () => {
    // `text-amber-400`, `text-violet-400`, `text-red-400` : des nuances pensées
    // pour un fond SOMBRE, qui court-circuitent complètement le système de
    // tokens. 123 occurrences existaient, et c'est ce qui faisait échouer le
    // thème clair là où la palette de tokens, elle, était saine.
    //
    // Deux exceptions, chacune légitime :
    //  - un texte sur un fond OPAQUE de la même palette (`bg-red-500`), qui ne
    //    change pas avec le thème — son texte non plus ;
    //  - une paire explicite `text-x dark:text-y`, qui traite déjà les deux
    //    thèmes.
    // ⚠️ Un fond à OPACITÉ (`bg-red-500/15`) n'est PAS une exception : il se
    // compose sur le fond du thème, donc pâle en clair et sombre en sombre.
    // Les 25 dernières violations étaient exactement de ce type.
    const offenders: string[] = []
    // `packages/ui` sert les MÊMES écrans : une erreur de formulaire y était
    // écrite `text-red-500`, soit 4,26:1 en clair et 4,03 en sombre — sous le
    // seuil des deux côtés, et sur le texte qu'il faut justement pouvoir lire.
    //
    // recette 10/09 — `/\.tsx?$/` : les deux VRAIES violations vivent dans des
    // `.ts` PLAINS (voir le docblock de `sourceFiles`).
    const PLAIN_TS_TOO = /\.tsx?$/
    for (const file of [
      ...sourceFiles(SRC, PLAIN_TS_TOO),
      ...sourceFiles(join(SRC, '../../../packages/ui/src'), PLAIN_TS_TOO),
    ]) {
      const source = codeOnly(readFileSync(file, 'utf8'))
      for (const match of source.match(TAILWIND_TEXT_COLOUR_CHUNK) ?? []) {
        if (!TAILWIND_TEXT_COLOUR.test(match)) continue
        if (TAILWIND_SOLID_GROUND.test(match) || TAILWIND_DARK_PAIR.test(match) || TAILWIND_SOLID_VARIANT.test(match))
          continue
        offenders.push(`${file.replace(/.*\/src\//, 'src/')} → ${match.slice(0, 60)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('aucune couleur sémantique BRUTE en texte — ce sont des couleurs de pastille', () => {
    // `--bellum-warning` : 9,47:1 en sombre, **1,84:1 en clair**. `--bellum-success`
    // 9,58 contre 1,82. Elles sont faites pour remplir une pastille ou une
    // icône, pas pour porter du texte. Les variantes `*-soft-text` passent AA
    // des deux côtés.
    //
    // Exception : une paire explicite `text-… dark:text-[var(--bellum-…)]`,
    // qui pose déjà la valeur claire à côté.
    const offenders: string[] = []
    for (const file of [...sourceFiles(SRC), ...sourceFiles(join(SRC, '../../../packages/ui/src'))]) {
      for (const match of readFileSync(file, 'utf8').match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? []) {
        const rawSemantic =
          // ⚠️ La forme `var(--token, repli)` compte AUSSI. La première
          // version exigeait `)]` juste après le nom du token, si bien que
          // huit usages à repli passaient dessous — dont une étiquette
          // « Divergente » à 3,00:1 sur l'écran de préférences.
          /(?<!dark:)text-\[var\(--bellum-(?:warning|success|danger|info)\s*[,)]/.test(match) ||
          // Les classes shadcn `text-destructive` et `text-primary` pointent
          // sur des variables IDENTIQUES dans les deux thèmes : ce sont des
          // couleurs de remplissage de bouton, avec du blanc dessus.
          /(?<![\w-])text-(?:destructive|primary)(?![\w-])/.test(match) ||
          // #2484 — la couleur sémantique ENVELOPPÉE. GA-33 ne voyait que
          // `text-[var(--bellum-danger…`, si bien que
          // `hover:text-[color-mix(in_srgb,var(--bellum-danger)_82%,black)]`
          // passait dessous — sur le bouton « Vider la sélection » de
          // `/contacts`, le survol rendait le texte MOINS lisible que le repos :
          // 3,93:1 en clair et 3,63:1 en sombre, sous AA des deux côtés.
          WRAPPED_SEMANTIC_TEXT.test(match)
        if (!rawSemantic) continue
        if (/dark:text-\[var\(--bellum-/.test(match)) continue
        offenders.push(`${file.replace(/.*\/(apps|packages)\//, '$1/')} → ${match.slice(0, 70)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('aucune paire clair/sombre écrite à la main sur la gamme primaire', () => {
    // `--bellum-text-accent` EST déjà cette paire, et correctement choisie.
    // Neuf endroits la réécrivaient à la main, dont deux avec `primary-400` en
    // clair — 4,05:1 sur une pastille teintée, juste sous le seuil. Une règle
    // recopiée est une règle qui dérive.
    const offenders: string[] = []
    for (const file of [...sourceFiles(SRC), ...sourceFiles(join(SRC, '../../../packages/ui/src'))]) {
      const source = codeOnly(readFileSync(file, 'utf8'))
      if (/text-\[var\(--bellum-primary-\d+\)\]\s+dark:text-\[var\(--bellum-primary-\d+\)\]/.test(source)) {
        offenders.push(file.replace(/.*\/(apps|packages)\//, '$1/'))
      }
    }
    expect(offenders).toEqual([])
  })

  it("aucun écran n'écrit une couleur en dur — elle ne suivrait pas le thème", () => {
    const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      for (const match of strip(readFileSync(file, 'utf8')).matchAll(
        /(?:text|bg|border|fill|stroke|from|via|to|ring|shadow)-\[#[0-9a-fA-F]{3,8}\]/g,
      )) {
        offenders.push(`${file.replace(/.*\/src\//, 'src/')} → ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// #3973.6 (Louis 15/10/2026) — la pastille d'un logo de marque : aucune en clair, CLAIRE en sombre.
describe('#3973.6 — pastille de logo de marque', () => {
  it('existe dans les deux thèmes ; en sombre elle est claire (le logo, dessiné pour un fond clair, reste lisible)', () => {
    expect(light['--bellum-brand-logo-chip']).toBe('transparent')
    const chip = dark['--bellum-brand-logo-chip'] ?? ''
    expect(chip).toMatch(/^#[0-9a-f]{6}$/i)
    // Sait dire NON : une pastille sombre en thème sombre ne servirait à rien.
    expect(contrast(chip, dark['--bellum-bg'] ?? '#000000')).toBeGreaterThan(10)
  })
})
