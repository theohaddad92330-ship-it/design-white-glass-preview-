/**
 * Garde-fou contraste WCAG AA sur les tokens de texte.
 *
 * Pourquoi ce test existe : le dark mode est le défaut du produit, et les
 * tokens de texte ont d'abord été calibrés sur des surfaces sombres. Le light
 * mode a hérité de valeurs lisibles sur `#0f0f0d` et beaucoup trop pâles sur
 * blanc (`--bellum-text-muted` était à 1.9:1 — illisible). Un test qui relit
 * les valeurs DEPUIS le CSS est la seule chose qui empêche la régression.
 *
 * Les valeurs ne sont JAMAIS recopiées ici : on parse `tokens.css` et
 * `index.css`. Si quelqu'un éclaircit un token, ce test tombe.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STYLES_DIR = join(__dirname)
const INDEX_CSS = join(__dirname, '..', 'index.css')

/** Seuil WCAG 2.1 AA pour du texte de taille normale (< 18.66px bold / < 24px). */
const AA_NORMAL_TEXT = 4.5

// ── Couleur : parsing + luminance ────────────────────────────────────────────

type Rgb = readonly [number, number, number]

function parseHex(value: string): Rgb {
  const raw = value.trim().replace('#', '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map(c => c + c)
          .join('')
      : raw
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)] as const
}

/** `hsl(45 4% 42%)` façon shadcn — les vars stockent `45 4% 42%` sans wrapper. */
function parseHslTriplet(value: string): Rgb {
  const m = value.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  if (!m) throw new Error(`HSL triplet illisible : "${value}"`)
  const h = Number(m[1])
  const s = Number(m[2]) / 100
  const l = Number(m[3]) / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)] as const
}

/** `rgba(124, 58, 237, 0.22)` → couleur + alpha. `null` si ce n'est pas du rgba. */
function parseRgba(value: string): { rgb: Rgb; alpha: number } | null {
  const m = value.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/)
  if (!m) return null
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])] as const, alpha: m[4] === undefined ? 1 : Number(m[4]) }
}

/** Aplatit une couleur translucide sur son fond — un alpha ne « contraste » pas seul. */
function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map(i => fg[i] * alpha + bg[i] * (1 - alpha)) as unknown as Rgb
}

/** Accepte `#rrggbb` comme `rgba(...)`, en aplatissant sur la surface donnée. */
function resolveOn(value: string, surface: Rgb): Rgb {
  const rgba = parseRgba(value)
  return rgba ? composite(rgba.rgb, rgba.alpha, surface) : parseHex(value)
}

function relativeLuminance([r, g, b]: Rgb): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/** Ratio de contraste WCAG 2.1 : (L_clair + 0.05) / (L_sombre + 0.05). */
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ── Extraction des tokens depuis le CSS source ───────────────────────────────

/**
 * Récupère le corps d'un bloc de règles CSS. On compte les accolades plutôt que
 * de faire un `.*?}` non-greedy : les blocs contiennent des fonctions à
 * parenthèses/accolades imbriquées (`color-mix(...)`, media queries).
 */
function ruleBlock(css: string, selector: string, occurrence = 0): string {
  const needle = new RegExp(`(^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'gm')
  let match: RegExpExecArray | null
  let seen = 0
  while ((match = needle.exec(css)) !== null) {
    if (seen++ !== occurrence) continue
    const start = match.index + match[0].length
    let depth = 1
    for (let i = start; i < css.length; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}' && --depth === 0) return css.slice(start, i)
    }
  }
  throw new Error(`Bloc CSS introuvable : "${selector}" (occurrence ${occurrence})`)
}

function customProps(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim()
  }
  return out
}

const tokensCss = readFileSync(join(STYLES_DIR, 'tokens.css'), 'utf8')
const indexCss = readFileSync(INDEX_CSS, 'utf8')

/**
 * tokens.css : le bloc « Surfaces & text » light est le 3e `:root` (après la
 * palette primaire et les couleurs sémantiques) ; le dark est le 1er `.dark`.
 * On repère par présence de `--bellum-text-primary` plutôt que par index, pour
 * ne pas casser si un bloc est ajouté au-dessus.
 */
function findBlockDefining(css: string, selector: string, prop: string): Record<string, string> {
  for (let i = 0; i < 12; i++) {
    let block: string
    try {
      block = ruleBlock(css, selector, i)
    } catch {
      break
    }
    const props = customProps(block)
    if (props[prop] !== undefined) return props
  }
  throw new Error(`Aucun bloc "${selector}" ne définit ${prop}`)
}

const lightTokens = findBlockDefining(tokensCss, ':root', '--bellum-text-primary')
const darkTokens = findBlockDefining(tokensCss, '.dark', '--bellum-text-primary')
const lightShadcn = findBlockDefining(indexCss, ':root', '--muted-foreground')
const darkShadcn = findBlockDefining(indexCss, '.dark', '--muted-foreground')

// ── Matrice texte × surface ──────────────────────────────────────────────────

const SURFACE_TOKENS = [
  '--bellum-bg',
  '--bellum-bg-lighter',
  '--bellum-surface-1',
  '--bellum-surface-2',
  '--bellum-sidebar',
] as const

/**
 * Les trois niveaux de texte sont utilisés indifféremment sur toutes les
 * surfaces de l'app (une carte sur `--bellum-bg`, un hover sur
 * `--bellum-surface-2`…), donc chacun doit passer AA sur la PIRE d'entre elles.
 */
const TEXT_TOKENS = ['--bellum-text-primary', '--bellum-text-secondary', '--bellum-text-muted'] as const

type Theme = { name: string; tokens: Record<string, string>; shadcn: Record<string, string> }

const THEMES: Theme[] = [
  { name: 'light', tokens: lightTokens, shadcn: lightShadcn },
  { name: 'dark', tokens: darkTokens, shadcn: darkShadcn },
]

describe('contraste WCAG AA des tokens de texte', () => {
  it('parse bien les tokens depuis le CSS (garde-fou du garde-fou)', () => {
    // Si le parsing casse silencieusement, tous les tests ci-dessous
    // deviendraient vides et verts. On vérifie que les valeurs sont réelles.
    for (const theme of THEMES) {
      for (const token of TEXT_TOKENS) {
        expect(theme.tokens[token], `${theme.name} ${token}`).toMatch(/^#[0-9a-fA-F]{3,6}$/)
      }
      for (const surface of SURFACE_TOKENS) {
        expect(theme.tokens[surface], `${theme.name} ${surface}`).toMatch(/^#[0-9a-fA-F]{3,6}$/)
      }
      expect(theme.shadcn['--muted-foreground'], `${theme.name} --muted-foreground`).toMatch(
        /^[\d.]+\s+[\d.]+%\s+[\d.]+%$/,
      )
    }
  })

  for (const theme of THEMES) {
    describe(theme.name, () => {
      for (const token of TEXT_TOKENS) {
        for (const surface of SURFACE_TOKENS) {
          it(`${token} sur ${surface} passe AA (${AA_NORMAL_TEXT}:1)`, () => {
            const ratio = contrastRatio(parseHex(theme.tokens[token]), parseHex(theme.tokens[surface]))
            expect(
              ratio,
              `${theme.name} ${token} (${theme.tokens[token]}) sur ${surface} ` +
                `(${theme.tokens[surface]}) = ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
          })
        }
      }

      /**
       * `--muted-foreground` pilote les placeholders shadcn
       * (`placeholder:text-muted-foreground` dans input.tsx / textarea.tsx).
       * Un placeholder est du texte de taille normale : même seuil.
       */
      for (const surface of SURFACE_TOKENS) {
        it(`--muted-foreground (placeholders shadcn) sur ${surface} passe AA`, () => {
          const ratio = contrastRatio(
            parseHslTriplet(theme.shadcn['--muted-foreground']),
            parseHex(theme.tokens[surface]),
          )
          expect(
            ratio,
            `${theme.name} --muted-foreground (${theme.shadcn['--muted-foreground']}) ` +
              `sur ${surface} (${theme.tokens[surface]}) = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
        })
      }

      /**
       * Passer AA ne suffit pas : si muted, secondary et primary convergent
       * vers la même valeur on obtient trois niveaux illisibles l'un de
       * l'autre. On exige une hiérarchie STRICTE de luminance.
       */
      it('conserve une hiérarchie primary > secondary > muted', () => {
        const bg = parseHex(theme.tokens['--bellum-surface-1'])
        const r = (t: string) => contrastRatio(parseHex(theme.tokens[t]), bg)
        const primary = r('--bellum-text-primary')
        const secondary = r('--bellum-text-secondary')
        const muted = r('--bellum-text-muted')
        expect(primary, 'primary doit contraster plus que secondary').toBeGreaterThan(secondary)
        expect(secondary, 'secondary doit contraster plus que muted').toBeGreaterThan(muted)
        // Écart minimal pour que les niveaux restent perceptibles.
        expect(secondary - muted, 'écart secondary/muted trop faible').toBeGreaterThan(0.5)
      })
    })
  }
})

/**
 * #2436.9 — LE VIOLET, EN TEXTE (`--bellum-text-accent`), PAS SEULEMENT EN
 * PASTILLE.
 *
 * Le commentaire de `tokens.css` (ligne 141) affirme des valeurs mesurées à la
 * main — « 5,78:1 en clair et 2,68:1 en sombre » pour `primary-500` seul, d'où
 * le jeton dédié — mais rien ne les REJOUAIT : la matrice ci-dessus teste
 * primary/secondary/muted, jamais l'accent. Une régression sur ce jeton (une
 * teinte plus claire « pour plus de pep ») n'aurait fait tomber AUCUN test.
 */
describe('contraste WCAG AA du texte d’accent (violet)', () => {
  for (const theme of THEMES) {
    describe(theme.name, () => {
      for (const surface of SURFACE_TOKENS) {
        it(`--bellum-text-accent sur ${surface} passe AA (${AA_NORMAL_TEXT}:1)`, () => {
          const ratio = contrastRatio(parseHex(theme.tokens['--bellum-text-accent']), parseHex(theme.tokens[surface]))
          expect(
            ratio,
            `${theme.name} --bellum-text-accent (${theme.tokens['--bellum-text-accent']}) sur ${surface} ` +
              `(${theme.tokens[surface]}) = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
        })
      }
    })
  }
})

/**
 * #1944.15 — LA BULLE « TA QUESTION » DU CHAT (`CHAT_SURFACE.question`,
 * `apps/web/src/features/chat/view/chat-surface.ts`) : fond `--bellum-primary-500`
 * plein, texte `--bellum-on-primary`.
 *
 * Le commentaire de `tokens.css` (bloc « Surfaces & text ») affirme une valeur
 * mesurée à la main — « le blanc dessus fait 6,37:1 des deux côtés » — mais
 * rien ne la REJOUAIT : la matrice ci-dessus teste primary/secondary/muted/
 * accent sur les SURFACES DE PAGE, jamais ce fond violet plein qui n'est ni
 * une surface ni un token de texte. Une régression sur l'un des deux
 * (`on-primary` moins blanc, `primary-500` plus clair) n'aurait fait tomber
 * AUCUN test — exactement le motif qui a justifié `--bellum-text-accent`
 * ci-dessus (#2436.9).
 *
 * `--bellum-primary-500` est MODE-INDÉPENDANT (une seule déclaration, en tête
 * de `tokens.css`, jamais redéfinie sous `.dark` — voir le commentaire
 * "Identique en sombre" au-dessus de `--bellum-on-primary`) : lu une fois,
 * hors de `THEMES`, jamais recopié en dur ici.
 */
describe('contraste WCAG AA — bulle « ta question » du chat (#1944.15)', () => {
  const primary500Match = tokensCss.match(/--bellum-primary-500:\s*(#[0-9a-fA-F]{3,6})/)
  const primary500 = primary500Match?.[1]

  it('lit bien `--bellum-primary-500` depuis le CSS (garde-fou du garde-fou)', () => {
    expect(primary500).toMatch(/^#[0-9a-fA-F]{3,6}$/)
  })

  for (const theme of THEMES) {
    it(`${theme.name} — --bellum-on-primary sur --bellum-primary-500 passe AA (${AA_NORMAL_TEXT}:1)`, () => {
      const onPrimary = theme.tokens['--bellum-on-primary']
      const ratio = contrastRatio(parseHex(onPrimary), parseHex(primary500 as string))
      expect(
        ratio,
        `${theme.name} --bellum-on-primary (${onPrimary}) sur --bellum-primary-500 ` +
          `(${primary500}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    })
  }
})

/**
 * Pastilles douces (`--*-soft-*`).
 *
 * Même histoire que ci-dessus, un cran plus bas : les badges de l'app étaient
 * écrits en dur en « fond violet à 15 % + texte #A78BFA ». Lisible sur du noir,
 * illisible sur du blanc — c'est ce qui rendait le score et le bouton d'analyse
 * de « Découvrir » indéchiffrables en light mode. Le texte d'une pastille est
 * du texte de taille normale (11-12px) : seuil AA plein.
 *
 * Le fond d'une pastille peut être translucide : on l'aplatit d'abord sur la
 * surface qui la porte, sinon on comparerait à une couleur qui n'existe pas.
 */
const SOFT_TONES = ['accent', 'success', 'warning', 'danger', 'info'] as const

/** Les surfaces sur lesquelles une pastille peut se poser (carte, hover, page). */
const PILL_SURFACES = ['--bellum-surface-1', '--bellum-surface-2', '--bellum-bg'] as const

describe('contraste WCAG AA des pastilles douces', () => {
  for (const theme of THEMES) {
    describe(theme.name, () => {
      for (const tone of SOFT_TONES) {
        for (const surface of PILL_SURFACES) {
          it(`--${tone}-soft-text sur --${tone}-soft-bg (posé sur ${surface}) passe AA`, () => {
            const bgValue = theme.tokens[`--${tone}-soft-bg`]
            const textValue = theme.tokens[`--${tone}-soft-text`]
            // Garde-fou du garde-fou : un token absent rendrait le test vert.
            expect(bgValue, `${theme.name} --${tone}-soft-bg`).toBeTruthy()
            expect(textValue, `${theme.name} --${tone}-soft-text`).toBeTruthy()

            const under = parseHex(theme.tokens[surface])
            const pill = resolveOn(bgValue, under)
            const ratio = contrastRatio(resolveOn(textValue, pill), pill)
            expect(
              ratio,
              `${theme.name} --${tone}-soft-text (${textValue}) sur --${tone}-soft-bg ` +
                `(${bgValue}) posé sur ${surface} = ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
          })
        }
      }
    })
  }
})

/**
 * #1824 — la pastille au REPOS d'un basculeur (`chipClassName`, état non
 * actif). Elle porte du texte, donc AA s'applique au couple
 * `--bellum-chip-rest-text` / `--bellum-chip-rest`.
 *
 * ⚠️ Ce test ne vérifie PAS la limite du contrôle contre la page : elle vaut
 * 1,27:1 en clair et 1,91:1 en sombre, sous les 3:1 de WCAG 1.4.11, et c'est
 * un choix ASSUMÉ (la pastille se lit par contraste avec sa jumelle active,
 * pleine `primary-500`). Une garde protège une règle, elle ne l'invente pas :
 * si on décide un jour de tenir 1.4.11 ici, c'est le token qui change, et ce
 * commentaire avec.
 */
describe('#1824 — contraste de la pastille au repos', () => {
  for (const theme of THEMES) {
    it(`${theme.name} — --bellum-chip-rest-text sur --bellum-chip-rest passe AA`, () => {
      const bg = theme.tokens['--bellum-chip-rest']
      const fg = theme.tokens['--bellum-chip-rest-text']
      // Garde-fou du garde-fou : un token absent rendrait ce test vert.
      expect(bg, `${theme.name} --bellum-chip-rest`).toMatch(/^#[0-9a-fA-F]{3,6}$/)
      expect(fg, `${theme.name} --bellum-chip-rest-text`).toMatch(/^#[0-9a-fA-F]{3,6}$/)
      const ratio = contrastRatio(parseHex(fg), parseHex(bg))
      expect(ratio, `${theme.name} ${fg} sur ${bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    })
  }

  /**
   * Le défaut qu'on ferme : la pastille au repos reprenait `--bellum-surface-2`,
   * un CREUX calibré pour une carte. Sur la page nue il ne se voyait pas — 1,03:1
   * en clair. Le nouveau remplissage doit se DÉTACHER franchement plus que lui,
   * sinon on aura renommé le défaut sans le corriger.
   */
  for (const theme of THEMES) {
    it(`${theme.name} — le remplissage se détache mieux de la page que l'ancien creux`, () => {
      const page = parseHex(theme.tokens['--bellum-bg'])
      const ancien = contrastRatio(parseHex(theme.tokens['--bellum-surface-2']), page)
      const nouveau = contrastRatio(parseHex(theme.tokens['--bellum-chip-rest']), page)
      expect(
        nouveau,
        `${theme.name} : creux ${ancien.toFixed(2)}:1 → remplissage ${nouveau.toFixed(2)}:1 sur --bellum-bg`,
      ).toBeGreaterThan(ancien * 1.15)
    })
  }
})

/**
 * #4299 — le badge « 10 crédits » (blanc sur violet) mesurait 4,10:1 en production : un voile BLANC
 * translucide posé sur `primary-500` l'ÉCLAIRCIT, donc il rapproche le fond du texte blanc. Le voile est
 * maintenant un token SOMBRE, et ce test lit la valeur dans le CSS.
 */
describe('#4299 — la pastille posée sur un remplissage primaire passe AA', () => {
  for (const theme of THEMES) {
    it(`${theme.name} — --bellum-on-primary sur --bellum-on-primary-chip (voile) sur --bellum-primary-500`, () => {
      const chip = theme.tokens['--bellum-on-primary-chip']
      expect(chip, `${theme.name} --bellum-on-primary-chip`).toBeDefined()
      const fill = parseHex(tokensCss.match(/--bellum-primary-500:\s*(#[0-9a-fA-F]{3,6})/)?.[1] ?? '')
      const bg = resolveOn(chip as string, fill)
      const ratio = contrastRatio(parseHex(theme.tokens['--bellum-on-primary']), bg)
      expect(ratio, `${theme.name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    })
  }
})

/**
 * #4530.10 — LE BOUTON « MA CIBLE », ACTIVÉ (`MyTargetToggle`) : texte `--bellum-text-accent` sur l'aplat
 * `--bellum-accent-bg`. Le bouton n'avait été vérifié que « par les jetons » ; la paire (texte d'accent sur SON aplat,
 * pas sur une surface de page) n'était mesurée nulle part. Elle doit passer AA dans les DEUX thèmes.
 */
describe('contraste WCAG AA du bouton « Ma cible » activé (texte d’accent sur aplat d’accent)', () => {
  for (const theme of THEMES) {
    it(`${theme.name} — --bellum-text-accent sur --bellum-accent-bg passe AA (${AA_NORMAL_TEXT}:1)`, () => {
      const ratio = contrastRatio(
        parseHex(theme.tokens['--bellum-text-accent']),
        parseHex(theme.tokens['--bellum-accent-bg']),
      )
      expect(ratio, `${theme.name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    })
  }
})
