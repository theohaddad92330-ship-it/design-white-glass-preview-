import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cn } from '@bellum/ui'
import { describe, expect, it } from 'vitest'
import { CONTENT_PADDING, FULL_BLEED_CONTENT, pageContentClassName } from '../components/page/page-gutter'

/**
 * GA-328 — LA SURFACE DE LAURA TIENT SES FINITIONS (#1906, #1907).
 *
 * ⚠️ Numérotée GA-327 sur sa branche : ce numéro était déjà pris sur `main` par
 * `apps/ia/tests/test_chat_tool_output_bounds_lot18.py` (lot 18). Suivant libre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ EN PRODUCTION LE 13/09/2026 (1 512 × 805, thème clair)
 * ─────────────────────────────────────────────────────────────────────────
 *  1. La conversation disposait de 408 px de haut sur 805. Au-dessus d'elle :
 *     une entête de PAGE de 48 px qui disait « Laura », juste au-dessus de
 *     l'entête du fil qui dit « Laura · Assistante IA » (la loi 4 du tome 7) ;
 *     autour d'elle, 24 px de gouttière sur les quatre côtés — alors que la
 *     route demande `h-full p-0`. `tailwind-merge` retire `px-4 py-4` mais
 *     GARDE `md:px-6 md:py-6` : ce n'est pas le même palier. La pleine page
 *     n'existait que sous 768 px. (Le même défaut touchait huit autres écrans :
 *     il se corrige dans la primitive, `pageContentClassName`, et GA-284 le
 *     tient pour tous les appelants.)
 *  2. Aucune ombre rendue : ni sur la saisie, ni sur les bulles, ni sur les
 *     cartes de l'accueil. Les bulles écrivent `shadow-xs`, un nom de
 *     Tailwind 4 — le dépôt est en Tailwind 3.4, qui ne le génère pas (vérifié
 *     en compilant la classe). Le « relief subtil » était écrit, jamais peint.
 *  3. Trois mouvements écrits à la main dans `Chat.tsx`, dont un point de
 *     chargement en `animate-pulse` : `packages/ui/src/motion.ts` n'y était
 *     jamais importé.
 *
 * Chaque bloc ci-dessous tient une de ces règles, avec les trois preuves
 * qu'exige le dépôt : il sait dire NON, il LIT quelque chose, et il
 * n'attrape pas ce qu'il ne vise pas.
 */

const WEB_SRC = join(__dirname, '..')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function read(relativePath: string): string {
  return stripComments(readFileSync(join(WEB_SRC, relativePath), 'utf8'))
}

function sourcesUnder(relativeDir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry) || entry.includes('.test.')) continue
      out.push({ path: full.split('/src/')[1] ?? full, source: stripComments(readFileSync(full, 'utf8')) })
    }
  }
  walk(join(WEB_SRC, relativeDir))
  return out
}

/**
 * La surface de Laura : le fil, ses cartes, sa saisie et le lanceur qui vit dedans.
 *
 * #1907.4 — `features/chat-commands` a rejoint le corpus le 15/09/2026. Le
 * catalogue n'est plus une page depuis #1321 : c'est un TIROIR de la saisie,
 * ouvert depuis la ligne d'outils du composer, donc il est de la surface au même
 * titre que les cartes du fil. L'omettre laissait sa peau hors de TOUTES les
 * règles de ce fichier — ombres, dégradés, mouvements, traits.
 */
const LAURA_SURFACE = [
  ...sourcesUnder('features/chat/view'),
  ...sourcesUnder('features/launcher'),
  ...sourcesUnder('features/chat-commands'),
]

// ─────────────────────────────────────────────────────────────────────────
// #1906.7 — la conversation occupe la page
// ─────────────────────────────────────────────────────────────────────────

const CONTENT_BASE = 'mx-auto flex min-h-0 w-full flex-1 flex-col'
const PADDING_CLASS = /(?:^|:)(?:p|px|py|pt|pb|pl|pr|ps|pe)-(?!0$)\S+$/

/** Les classes de padding NON nulles qui survivent à la fusion, tous paliers confondus. */
function survivingPadding(classes: string): string[] {
  return classes.split(/\s+/).filter(token => PADDING_CLASS.test(token))
}

describe('GA-328 — #1906.7 : la conversation occupe la page', () => {
  it('sait dire NON — la forme mesurée en production garde 24 px au-delà de 768 px', () => {
    // C'est la chaîne exacte relevée dans le DOM de production :
    // « mx-auto … md:px-6 md:py-6 h-full p-0 ».
    expect(survivingPadding(cn(CONTENT_BASE, CONTENT_PADDING, 'h-full p-0'))).toEqual(['md:px-6', 'md:py-6'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un zéro, à n’importe quel palier, n’est pas une gouttière', () => {
    expect(survivingPadding('p-0 md:p-0 px-0 md:py-0 pointer-coarse:min-h-11 space-y-4')).toEqual([])
  })

  it('la pleine page de Laura ne garde AUCUNE gouttière, à aucun palier — par la primitive de la coque', () => {
    expect(survivingPadding(pageContentClassName(FULL_BLEED_CONTENT))).toEqual([])
  })

  it('la route /chat pose la pleine page et retire l’entête de page qui répétait « Laura »', () => {
    const route = read('routes/chat/index.tsx')
    expect(route.length).toBeGreaterThan(0)
    expect(route).toContain('FULL_BLEED_CONTENT')
    expect(route).toMatch(/skipHeader=\{/)
    expect(route).not.toContain("'h-full p-0'")
  })

  it('la page garde son titre de niveau 1 : l’entête du fil le porte désormais', () => {
    expect(read('features/chat/view/Chat.tsx')).toContain('element="h1"')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// #1907.11 — le mouvement de Laura parle la grammaire du produit
// ─────────────────────────────────────────────────────────────────────────

const HAND_WRITTEN_MOTION =
  /\b(?:initial|animate|exit|transition)=\{\{|(?<![\w-])animate-(?:pulse|bounce|ping)(?![\w-])/

describe('GA-328 — #1907.11 : aucun mouvement écrit à la main sur la surface de Laura', () => {
  it('LIT un corpus animé', () => {
    expect(LAURA_SURFACE.length).toBeGreaterThan(5)
    expect(LAURA_SURFACE.some(file => file.source.includes('framer-motion'))).toBe(true)
  })

  it('sait dire NON', () => {
    expect(HAND_WRITTEN_MOTION.test('<motion.div initial={{ opacity: 0, y: 8 }} />')).toBe(true)
    expect(HAND_WRITTEN_MOTION.test('<span className="size-1.5 rounded-full animate-pulse" />')).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas', () => {
    expect(HAND_WRITTEN_MOTION.test("<motion.div {...chatMotion('reveal', reduce)} />")).toBe(false)
    // Un indicateur de chargement qui TOURNE est un autre objet (« ça travaille », dans un bouton).
    expect(HAND_WRITTEN_MOTION.test('<Loader2 className="size-4 animate-spin" />')).toBe(false)
    expect(HAND_WRITTEN_MOTION.test(stripComments('// avant : initial={{ opacity: 0 }}'))).toBe(false)
  })

  it('en vrai : chaque mouvement passe par `chatMotion`, donc par `MOTION`', () => {
    const offenders = LAURA_SURFACE.filter(file => HAND_WRITTEN_MOTION.test(file.source)).map(file => file.path)
    expect(offenders).toEqual([])
    expect(read('features/chat/view/Chat.tsx')).toContain('chatMotion(')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// #1907.5 / #1907.10 — une ombre écrite est une ombre peinte
// ─────────────────────────────────────────────────────────────────────────

/**
 * Les noms que Tailwind 3.4 génère réellement : le thème par défaut
 * (`sm`/`md`/`lg`/`xl`/`2xl`/`inner`/`none`), plus `xs` — seule extension du
 * `boxShadow` du config (voir le test juste en dessous), ajoutée pour que la
 * classe `shadow-xs` déjà écrite dans le JSX (ThemeToggle, GlassCard…) peigne
 * enfin quelque chose au lieu de ne générer aucune CSS.
 */
const TAILWIND3_SHADOWS = new Set(['xs', 'sm', 'md', 'lg', 'xl', '2xl', 'inner', 'none'])

function deadShadows(source: string): string[] {
  const out: string[] = []
  for (const match of source.matchAll(/(?<![\w-])shadow-([a-z0-9]+)(?![\w/[-])/g)) {
    if (!TAILWIND3_SHADOWS.has(match[1] as string)) out.push(match[0])
  }
  return out
}

describe('GA-328 — #1907.5 / #1907.10 : aucune ombre qui ne rend rien', () => {
  it('la config Tailwind n’étend `boxShadow` qu’avec `xs` — toute autre extension doit élargir TAILWIND3_SHADOWS', () => {
    // Le jour où quelqu'un étend `boxShadow` avec un autre palier, cette liste (et TAILWIND3_SHADOWS) doit s'élargir avec lui.
    const config = readFileSync(join(WEB_SRC, '..', 'tailwind.config.ts'), 'utf8')
    const block = /boxShadow:\s*\{([^}]*)\}/.exec(config)
    expect(block?.[1]).toBeTruthy()
    const keys = [...(block?.[1]?.matchAll(/(?<![\w-])([\w-]+):/g) ?? [])].map(m => m[1])
    expect(keys).toEqual(['xs'])
    expect(config).toContain("xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)'")
  })

  it('sait dire NON', () => {
    // `2xs` (Tailwind 4) n'est PAS dans le boxShadow étendu : elle reste morte.
    expect(deadShadows('className="focus-visible:shadow-2xs"')).toEqual(['shadow-2xs'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — `shadow-xs` peint désormais (boxShadow.xs, ci-dessus)', () => {
    expect(deadShadows('shadow shadow-sm shadow-[var(--shadow-card)] shadow-black/5 drop-shadow-md')).toEqual([])
    expect(deadShadows('className="rounded-xl px-4 shadow-xs"')).toEqual([])
  })

  it('en vrai : la surface de Laura n’écrit que des ombres que Tailwind génère', () => {
    const offenders = LAURA_SURFACE.flatMap(file => deadShadows(file.source).map(token => `${file.path} — ${token}`))
    expect(offenders).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// #1907.14 / .15 / .17 / .18 — ni futuriste, ni gaming, ni ombre lourde, ni seconde teinte
// ─────────────────────────────────────────────────────────────────────────

const PALETTE = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const HEAVY_DECORATION = new RegExp(
  String.raw`(?<![\w-])(?:shadow-(?:md|lg|xl|2xl)|glow[\w-]*|animate-(?:float|glow-pulse|hue-shift|gradient-sweep|pulse-ring|avatar-ring|glow-dot)|gradient-border|text-gradient-violet|glass-card|bellum-grain|dot-grid|preserve-3d|perspective-\d+|(?:from|via|to)-(?:${PALETTE})-\d{2,3})(?![\w-])|--shadow-glow`,
)

describe('GA-328 — #1907.14 à .18 : une surface sobre', () => {
  it('sait dire NON', () => {
    expect(HEAVY_DECORATION.test('className="shadow-lg"')).toBe(true)
    expect(HEAVY_DECORATION.test('className="animate-glow-pulse"')).toBe(true)
    expect(HEAVY_DECORATION.test('className="bg-gradient-to-r from-pink-500 to-violet-600"')).toBe(true)
    expect(HEAVY_DECORATION.test('className="shadow-[var(--shadow-glow-violet)]"')).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas', () => {
    expect(HEAVY_DECORATION.test('className="shadow-sm text-[var(--bellum-text-accent)] to-transparent"')).toBe(false)
  })

  it('en vrai : aucune lueur, aucune ombre lourde, aucune seconde teinte', () => {
    const heavy = LAURA_SURFACE.filter(file => HEAVY_DECORATION.test(file.source)).map(file => file.path)
    expect(heavy).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Décision de Louis du 13/09/2026 (batch 13) — plat : aucun dégradé sur la page de Laura
// ─────────────────────────────────────────────────────────────────────────

/* décision Louis 13/09 batch 13 — plat */
/**
 * #1907.9 demandait « des dégradés violets très légers » ; la branche de
 * finition en avait posé un derrière l'accueil (une teinte, par son token).
 * Louis a tranché le 13/09 : on garde la règle d'avant, écrite dans
 * `styles/tokens.css` — « No gradient — flat primary only ». Ce bloc la tient
 * sur la surface de Laura : AUCUN dégradé, pas même d'une seule teinte.
 *
 * La forme Tailwind (`bg-gradient-to-*`) et la forme CSS (`linear-gradient(`,
 * `radial-gradient(`, `conic-gradient(`, en classe arbitraire ou en style
 * inline) sont toutes deux visées ; un NOM qui contient « gradient » sans être
 * une fonction (`--violet-gradient`, qui vaut le primaire plat) ne l'est pas.
 */
const GRADIENT = /(?<![\w-])bg-gradient-to-[a-z]{1,2}(?![\w-])|[\w-]*gradient\(/

describe('GA-328 — plat : aucun dégradé sur la page de Laura (décision Louis 13/09, batch 13)', () => {
  it('sait dire NON — y compris au dégradé d’une seule teinte que la finition avait posé', () => {
    expect(
      GRADIENT.test("'bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,var(--bellum-laura-wash-tint),transparent_70%)]'"),
    ).toBe(true)
    expect(GRADIENT.test('className="bg-gradient-to-b from-[var(--bellum-surface-1)]"')).toBe(true)
    expect(GRADIENT.test("style={{ backgroundImage: 'linear-gradient(90deg, var(--bellum-bg), transparent)' }}")).toBe(
      true,
    )
  })

  it('n’attrape pas ce qu’elle ne vise pas — un nom n’est pas un dégradé', () => {
    expect(GRADIENT.test('className="bg-[var(--violet-gradient)] shadow-sm"')).toBe(false)
    expect(GRADIENT.test('className="to-transparent text-[var(--bellum-text-accent)]"')).toBe(false)
  })

  it('en vrai : la surface de Laura ne peint aucun dégradé', () => {
    const offenders = LAURA_SURFACE.filter(file => GRADIENT.test(file.source)).map(file => file.path)
    expect(offenders).toEqual([])
  })

  it('le token du dégradé a disparu, et la règle d’avant est toujours écrite', () => {
    const tokens = readFileSync(join(WEB_SRC, 'styles', 'tokens.css'), 'utf8')
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens).not.toContain('--bellum-laura-wash-tint')
    expect(tokens).toContain('--violet-gradient: var(--bellum-primary-500);')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// #1907.13 — question, réponse, preuve, action : chaque peau a son APPELANT
// ─────────────────────────────────────────────────────────────────────────

describe('GA-328 — #1907.13 : les quatre peaux sont réellement portées', () => {
  // Les valeurs vivent dans `chat-surface.ts` et leur distinction se teste là
  // (`chat-surface.test.ts`). Ici, la seule question : quelqu'un les REND-il ?
  // Une peau juste que personne n'appelle est le défaut n°1 du dépôt.
  it('le fil porte la question, la réponse, la saisie et la colonne partagée', () => {
    const chat = read('features/chat/view/Chat.tsx')
    for (const usage of [
      'CHAT_SURFACE.question',
      'CHAT_SURFACE.reply',
      'CHAT_SURFACE.composer',
      'CHAT_SURFACE.composerBand',
      'CHAT_SURFACE.composerToolbarDivider',
    ]) {
      expect(chat, usage).toContain(usage)
    }
    // L'accueil et le fil tiennent dans la MÊME colonne : l'écran ne change plus
    // de largeur au premier message.
    expect(chat.split('CHAT_SURFACE.column').length - 1).toBeGreaterThanOrEqual(2)
    expect(chat).toContain('data-chat-kind')
  })

  it('la carte d’action et le panneau de sources portent la leur', () => {
    const actions = read('features/chat/view/PendingActions.tsx')
    expect(actions).toContain('CHAT_SURFACE.action')
    expect(actions).toContain('data-chat-kind="action"')
    const proof = read('features/chat/view/ContextDisclosure.tsx')
    expect(proof).toContain('CHAT_SURFACE.proof')
    expect(proof).toContain('data-chat-kind="proof"')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// #1907.4 — « Conserver les bordures fines »
// ─────────────────────────────────────────────────────────────────────────

/**
 * Le retour demandait de GARDER ce qui marchait déjà, dont « les bordures
 * fines ». C'est resté « NON PROUVÉ — mesure visuelle en recette » au registre
 * pendant deux semaines, c'est-à-dire : une opinion. `chat-surface.ts` l'écrit
 * pourtant noir sur blanc (« traits fins d'un pixel ») sans que rien ne la
 * tienne, et une règle de design qui n'est pas gardée redevient une opinion en
 * trois semaines.
 *
 * Ce qu'un trait épais fait ici, concrètement : il pèse autant qu'une ombre. Les
 * quatre peaux du chat (question / réponse / preuve / action) se distinguent par
 * un TRAIT et un FOND ; doubler l'épaisseur de l'un des quatre casse leur
 * hiérarchie, exactement comme le ferait le `shadow-lg` que le bloc « une
 * surface sobre » refuse déjà.
 *
 * Mesuré au moment d'écrire ce bloc : UNE occurrence sur la surface — le liseré
 * `border-l-2` du bandeau d'amorce du tiroir des commandes, ramené à 1 px.
 *
 * ⚠️ La règle porte sur l'ÉPAISSEUR, jamais sur la couleur ni sur le côté :
 * `border-[var(--bellum-border)]` est une couleur, `border-l` est un côté, et
 * `border-spacing-2` n'est pas une bordure du tout. C'est ce que le témoin de
 * cas légitimes ci-dessous vérifie.
 */
const NAMED_THICK = /(?<![\w-])border(?:-[xytrblse])?-(?:[2-9]|[1-9]\d+)(?![\w-])/
const ARBITRARY_WIDTH = /(?<![\w-])border(?:-[xytrblse])?-\[(\d+(?:\.\d+)?)px\]/g

/** Les traits de PLUS d'un pixel écrits dans une source. Vide = des traits fins. */
function thickBorders(source: string): string[] {
  const found: string[] = []
  for (const line of source.split('\n')) {
    if (NAMED_THICK.test(line)) found.push(line.trim().slice(0, 80))
    // `matchAll` et non `test` : un `RegExp` porteur du drapeau `g` garde son
    // `lastIndex` d'un appel à l'autre, et une garde qui saute une ligne sur
    // deux est le défaut exact qui a rendu six gardes borgnes en deux jours.
    for (const match of line.matchAll(ARBITRARY_WIDTH)) {
      if (Number(match[1]) > 1) found.push(line.trim().slice(0, 80))
    }
  }
  return found
}

describe('GA-328 — #1907.4 : les traits de la surface de Laura font un pixel', () => {
  it('LIT un corpus qui contient vraiment des bordures', () => {
    // Une garde dont le corpus est vide est verte pour rien.
    expect(LAURA_SURFACE.length).toBeGreaterThan(5)
    expect(LAURA_SURFACE.filter(file => /(?<![\w-])border(?![\w-])/.test(file.source)).length).toBeGreaterThan(0)
  })

  it('sait dire NON', () => {
    expect(thickBorders('className="border-2 border-[var(--bellum-border)]"')).toHaveLength(1)
    expect(thickBorders('className="border-l-2 pl-3"')).toHaveLength(1)
    expect(thickBorders('className="border-t-4"')).toHaveLength(1)
    expect(thickBorders('className="border-[3px]"')).toHaveLength(1)
    expect(thickBorders('className="border-b-[2.5px]"')).toHaveLength(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une couleur, un côté, un espacement, un pixel', () => {
    expect(thickBorders('className="border border-[var(--bellum-border)] rounded-2xl"')).toEqual([])
    expect(thickBorders('className="border-l border-b border-t"')).toEqual([])
    expect(thickBorders('className="border-red-400 border-primary-500"')).toEqual([])
    expect(thickBorders('className="border-spacing-2 gap-2 size-4"')).toEqual([])
    expect(thickBorders('className="border-[1px] border-x-[0.5px]"')).toEqual([])
  })

  it('n’oublie pas la deuxième occurrence (le `lastIndex` d’un `RegExp` porteur de `g`)', () => {
    expect(thickBorders('a border-[3px]\nb border-[4px]')).toHaveLength(2)
  })

  it('en vrai : aucun trait épais sur la surface de Laura', () => {
    const offenders = LAURA_SURFACE.flatMap(file => thickBorders(file.source).map(line => `${file.path} → ${line}`))
    expect(offenders).toEqual([])
  })

  it('la règle est ÉCRITE là où vivent les quatre peaux — une garde protège une règle, elle ne l’invente pas', () => {
    const surface = readFileSync(join(WEB_SRC, 'features/chat/view/chat-surface.ts'), 'utf8')
    expect(surface.length).toBeGreaterThan(0)
    expect(surface).toContain("traits fins d'un pixel")
  })
})
