import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-280 — #1788 : L'ÉCHELLE D'EMPILEMENT EST NOMMÉE, PARTOUT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE BUG DE LOUIS (#1788 — « le menu passe en dessous »)
 * ─────────────────────────────────────────────────────────────────────────
 * `apps/web/tailwind.config.ts` définit l'échelle NOMMÉE — les seules valeurs
 * autorisées au-dessus de `z-50` :
 *
 *   nav=40 · overlay=60 · toast=70 · widget=80 · picker=90 · devtools=100
 *
 * Un relevé du 09/09/2026 a trouvé huit sites qui la contournaient encore :
 * les primitifs de menu de `packages/ui` étaient restés à un `z-50` brut
 * (la valeur du shadcn/ui d'origine, jamais migrée), alors que le toast
 * (70), le widget de signalement (80) et un picker (90) sont TOUS au-dessus
 * de 50. N'importe lequel de ces menus, ouvert pendant qu'un toast s'affiche
 * ou que le bouton de signalement flotte, passe donc VISUELLEMENT dessous —
 * exactement le titre de #1788. Cette garde interdit qu'un neuvième site
 * apparaisse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE REGARDE
 * ─────────────────────────────────────────────────────────────────────────
 * Une valeur d'empilement BRUTE se pose de deux façons dans ce dépôt :
 *   1. une classe Tailwind `z-<chiffres>` ou `z-[<chiffres>]` (avec ou sans
 *      variante — `hover:z-50`, `data-[state=open]:z-50`) ;
 *   2. un style en ligne `zIndex: <chiffre>` (React.CSSProperties) — c'est la
 *      même faute que le `z-[9999]` Tailwind, juste écrite autrement.
 *
 * Les SEULES valeurs acceptées au-dessus de la portée locale sont les six
 * jetons nommés (`z-nav`, `z-overlay`, `z-toast`, `z-widget`, `z-picker`,
 * `z-devtools`) et le mot-clé Tailwind `z-auto` (aucun chiffre : hors
 * champ). Un `z-[var(...)]` ne contient pas de chiffre non plus — il ne
 * fixe rien en dur, il n'est pas visé par cette garde.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE REGARDE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ne cherche pas « z- suivi de chiffres » n'importe où dans le texte —
 * ce motif attraperait `size-2.5` (aucun rapport, pas de `z-` dedans) mais
 * aussi bien un identifiant `data-testid="item-z-20"` (le `z-20` y est un
 * SUFFIXE d'un mot, jamais une classe posée seule) ou le nom d'une variable
 * CSS `--radix-z-index`. Le motif exige que `z-` commence un TOKEN — précédé
 * d'un début de ligne, d'une espace, d'un guillemet, d'une parenthèse ou
 * d'un `:` de variante — jamais d'un trait d'union, qui signale qu'on est
 * au milieu d'un autre mot.
 *
 * Un commentaire qui CITE une classe fautive (cette explication le fait
 * plusieurs fois) ne peint rien : `commentMask` retire la ligne avant le
 * balayage, comme `isComment` dans GA-248 (`no-hardcoded-colors.test.ts`) —
 * pour la même raison qu'elle a été ajoutée là-bas, une garde rouge sur son
 * propre texte finit désactivée dans la semaine.
 *
 * ⚠️ `commentMask` va plus loin que GA-248 : elle suit l'état OUVERT/FERMÉ
 * d'un bloc `/* … *\/` ou `{/* … *\/}` sur plusieurs lignes, pas seulement le
 * premier caractère de chaque ligne. Un `isComment` ligne-à-ligne sans état
 * aurait pris pour du CODE la ligne de prose (sans `*` en tête) de
 * `PlanningPage.tsx` qui explique « …la colonne collante, qui porte
 * `bg-card` et `z-10` et le recouvrait… » au milieu d'un `{/* … *\/}` de
 * plusieurs lignes — trouvé en construisant cette garde, pas dans le brief.
 *
 * Un empilement LOCAL — un slot actif qui monte au-dessus de son voisin
 * immédiat, une carte qui redonne sa relativité à un lien empilé — n'est pas
 * un rôle de l'échelle nommée : lui coller un jeton mentirait sur son
 * intention. `input-otp.tsx` en est l'unique cas dans le périmètre de cette
 * PR ; voir `EXEMPT` ci-dessous pour sa raison précise.
 */

const WEB_SRC = join(__dirname, '..')
const UI_SRC = join(__dirname, '../../../../packages/ui/src')

/** `z-50`, `z-[9999]`, `hover:z-40`, `-z-10` — une classe Tailwind posée en dur. */
const RAW_TAILWIND_Z = /(?:^|[\s"'`(:])(-?z-(?:\d+|\[\d+\]))(?![\w-])/g

/** `zIndex: 9999` en style React — la même faute, écrite autrement. */
const RAW_INLINE_ZINDEX = /\bzIndex\s*:\s*-?\d+\b/g

/**
 * L'unique exemption de ce lot, et sa raison — jamais une liste muette.
 *
 * ⚠️ Une exemption se justifie par « ce n'est pas un rôle de l'échelle
 * nommée », jamais par « c'est plus rapide comme ça ».
 */
const EXEMPT: ReadonlyArray<{ path: string; why: string }> = [
  {
    path: 'components/input-otp.tsx',
    why: "`data-[active=true]:z-10` fait monter le slot OTP actif pour que sa bordure surlignée passe AU-DESSUS de la bordure partagée avec le slot voisin — un empilement LOCAL entre deux frères directs dans la même rangée. Il ne rivalise avec rien de la navigation, d'une superposition, d'un toast, du widget ou d'un sélecteur : ce n'est le rôle d'aucun des six jetons, lui en coller un mentirait sur son intention.",
  },
]

function sourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue
      if (entry.includes('.test.')) continue
      out.push(full)
    }
  }
  walk(root)
  return out
}

type Offence = { file: string; line: number; text: string }

/**
 * Marque chaque ligne de `source` comme commentaire ou non — avec ÉTAT
 * entre les lignes.
 *
 * ⚠️ Sans cet état, une ligne de PROSE au milieu d'un `{/* ... *\/}` sur
 * plusieurs lignes — qui ne commence pas par `*` — se lit comme du code.
 * C'est arrivé en vrai pendant la construction de cette garde :
 * `PlanningPage.tsx` explique en commentaire, sur une ligne sans `*` en
 * tête, que « la colonne collante… porte `bg-card` et `z-10` » — un
 * balayage ligne à ligne sans mémoire l'aurait comptée comme une neuvième
 * violation. Il fallait suivre l'ouverture ET la fermeture du bloc.
 */
function commentMask(lines: string[]): boolean[] {
  const mask: boolean[] = []
  let inBlock = false
  for (const line of lines) {
    if (inBlock) {
      mask.push(true)
      if (line.includes('*/')) inBlock = false
      continue
    }
    const trimmed = line.trimStart()
    if (trimmed.startsWith('//')) {
      mask.push(true)
      continue
    }
    if (trimmed.startsWith('/*') || trimmed.startsWith('{/*') || trimmed.startsWith('*')) {
      mask.push(true)
      if (!line.includes('*/')) inBlock = true
      continue
    }
    mask.push(false)
  }
  return mask
}

function scan(source: string, label: string): Offence[] {
  const found: Offence[] = []
  const lines = source.split('\n')
  const isComment = commentMask(lines)
  lines.forEach((line, index) => {
    if (isComment[index]) return
    for (const pattern of [RAW_TAILWIND_Z, RAW_INLINE_ZINDEX]) {
      pattern.lastIndex = 0
      const hit = pattern.exec(line)
      if (hit) found.push({ file: label, line: index + 1, text: (hit[1] ?? hit[0]).trim() })
    }
  })
  return found
}

const UI_CORPUS = sourceFiles(UI_SRC)
const WEB_CORPUS = sourceFiles(WEB_SRC)

function offencesIn(corpus: string[], srcRoot: string): Offence[] {
  const offences: Offence[] = []
  for (const file of corpus) {
    if (EXEMPT.some(e => file.endsWith(e.path))) continue
    const label = relative(join(srcRoot, '..'), file).replace(/^src\//, '')
    offences.push(...scan(readFileSync(file, 'utf8'), label))
  }
  return offences
}

function report(offences: Offence[]): string {
  if (offences.length === 0) return ''
  return (
    `Valeurs d'empilement écrites en dur (hors échelle nommée) :\n` +
    offences.map(o => `  ${o.file}:${o.line} — ${o.text}`).join('\n') +
    `\n\nUtiliser un jeton : z-nav (40, la navigation), z-overlay (60, le voile et le contenu d'une\n` +
    `modale), z-toast (70), z-widget (80), z-picker (90, menus/select/popover/tooltip/context-menu),\n` +
    `z-devtools (100). Un empilement purement LOCAL (un slot qui monte au-dessus de son frère direct)\n` +
    `n'est pas visé par cette échelle — voir EXEMPT s'il faut le nommer.`
  )
}

describe('GA-280 — #1788 : aucune valeur d’empilement brute, seulement les jetons nommés', () => {
  it('LIT vraiment deux corpus, et ils ne sont pas vides', () => {
    // La preuve n°1 exigée de toute garde du dépôt : sans elle, un chemin
    // faux rendrait ce fichier vert en ne lisant rien (« six gardes borgnes
    // en deux jours », dont trois par un glob qui ne matchait rien).
    expect(UI_CORPUS.length).toBeGreaterThan(50)
    expect(WEB_CORPUS.length).toBeGreaterThan(1000)
    expect(UI_CORPUS.some(f => f.endsWith('components/dialog.tsx'))).toBe(true)
    expect(UI_CORPUS.some(f => f.endsWith('components/sheet.tsx'))).toBe(true)
    expect(WEB_CORPUS.some(f => f.includes('/features/'))).toBe(true)
    expect(WEB_CORPUS.some(f => f.endsWith('layout/PageHeader.tsx'))).toBe(true)
  })

  it('sait dire NON — une valeur brute, sous chacune de ses deux formes, est refusée', () => {
    // La preuve n°2 : casser volontairement le code que la garde protège.
    // Les formes réellement rencontrées avant la migration de #1788.
    const cassé = [
      `        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg',`,
      `          className="fixed inset-x-0 top-4 z-[9999] flex justify-center"`,
      `        'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse',`,
      `    <header className="relative flex items-center justify-between h-12 top-0 z-40 backdrop-blur-xl">`,
      `          'absolute inset-y-0 z-10 hidden h-full w-[var(--sidebar-width)] md:flex',`,
      `  zIndex: 9999,`,
      `        className={cn('foo', 'hover:z-30 bar')}`,
    ]
    for (const ligne of cassé) {
      expect(scan(ligne, 'synthétique'), ligne).toHaveLength(1)
    }
  })

  it('n’attrape pas ce qu’elle ne vise pas', () => {
    // La preuve n°3 : un témoin de cas légitimes voisins, chacun un piège
    // réel pour un motif trop gourmand.
    const innocent = [
      // Les six jetons nommés — c'est justement ce qu'on migre VERS.
      `        'fixed left-[50%] top-[50%] z-overlay grid w-full max-w-lg',`,
      `          className="fixed inset-x-0 top-4 z-widget flex justify-center"`,
      `        'fixed top-0 z-toast flex max-h-screen w-full flex-col-reverse',`,
      `    <header className="relative flex items-center justify-between h-12 top-0 z-nav backdrop-blur-xl">`,
      `          'absolute inset-y-0 z-picker hidden h-full w-[var(--sidebar-width)] md:flex',`,
      `        'z-devtools min-w-[8rem] overflow-hidden rounded-lg border',`,
      // `z-auto` : le mot-clé Tailwind, aucun chiffre — hors champ.
      `        className="relative z-auto"`,
      // Un empilement LOCAL cité dans le brief : un slot qui monte au-dessus
      // de son propre voisin, sans rapport avec l'échelle nommée. Il n'est
      // PAS exempté ici (seul input-otp.tsx l'est, avec sa raison) — la
      // preuve porte sur le fait que la garde le SIGNALE bien comme une
      // valeur brute, à charge pour l'appelant de l'exempter ou de la migrer.
      // Ce cas sert donc à la preuve n°2, pas n°3 ; celui qui suit est le
      // vrai témoin d'un texte qui ressemble à une classe sans en être une.
      // `z-20` en SUFFIXE d'un identifiant : jamais une classe posée seule.
      `      <div data-testid="item-z-20" />`,
      // Un nom de variable CSS qui contient `z-` sans être un z-index Tailwind.
      `        className="origin-[var(--radix-select-content-transform-origin)]"`,
      // `zIndex` en position de TYPE, jamais suivi d'un chiffre.
      `  zIndex?: number`,
      // Un commentaire qui CITE la classe fautive — il ne peint rien.
      `        // encore un z-50 ici avant la migration de #1788`,
      `         * zIndex: 9999 était l'ancien style de la bannière`,
      // `size-2.5` ne contient pas `z-` du tout (le 'z' y est suivi de 'e').
      `        <Icon className="size-2.5 rotate-45" />`,
      // Le VRAI témoin trouvé en construisant cette garde (PlanningPage.tsx) :
      // une ligne de PROSE sans `*` en tête, au milieu d'un `{/* … */}` de
      // plusieurs lignes. Un `isComment` ligne-à-ligne sans état l'aurait
      // comptée comme une neuvième violation ; `commentMask` suit l'ouverture
      // et la fermeture du bloc.
      [
        '          {/* Le bord ROGNÉ porte un chevron.',
        '',
        '              ⚠️ défaut mesuré en recette.',
        '              la colonne collante, qui porte `bg-card` et `z-10` et le',
        '              recouvrait entièrement, celui de droite à cheval. */}',
      ].join('\n'),
    ]
    for (const ligne of innocent) {
      expect(scan(ligne, 'synthétique'), ligne).toHaveLength(0)
    }
  })

  it('garde ses exemptions NOMMÉES, justifiées, et présentes sur le disque', () => {
    expect(EXEMPT).toHaveLength(1)
    for (const { path, why } of EXEMPT) {
      expect(
        UI_CORPUS.some(f => f.endsWith(path)) || WEB_CORPUS.some(f => f.endsWith(path)),
        `exemption sur un fichier absent : ${path}`,
      ).toBe(true)
      expect(why.length, `exemption sans raison : ${path}`).toBeGreaterThan(60)
    }
  })

  it('ne trouve aucune valeur brute dans packages/ui/src (au vert — c’est le périmètre migré par #1788)', () => {
    const offences = offencesIn(UI_CORPUS, UI_SRC)
    expect(offences, report(offences)).toEqual([])
  })

  it(
    'apps/web/src : les deux sites migrés par #1788 (PageHeader, la ligne du widget de ' +
      'signalement) ne régressent plus jamais — le reste de apps/web/src/features/** est un ' +
      'contournement hors périmètre de cette PR (pas de son auteur), dénombré ci-dessous SANS être ' +
      'caché derrière une exemption de complaisance : voir le rapport de la PR pour le détail ' +
      'fichier:ligne, à reprendre à l’intégration',
    () => {
      const offences = offencesIn(WEB_CORPUS, WEB_SRC)
      // Cette garde a le droit de COMPTER le contournement hors périmètre
      // (`packages/ui`, elle, est déjà tenue au vert par le test précédent).
      // Elle ne l'asserte pas à zéro ICI : cinq autres agents modifient
      // `apps/web/src/features/**` en parallèle de cette PR, et figer un
      // compte exact romprait pour une raison qui n'a rien à voir avec
      // l'échelle d'empilement. Ce que cette PR PEUT honnêtement garantir en
      // continu, ce sont les deux régressions qu'elle vient de fermer :
      expect(offences.some(o => o.file.includes('layout/PageHeader.tsx'))).toBe(false)
      expect(offences.some(o => o.file.includes('feedback/FeedbackWidget.tsx') && o.text.includes('9999'))).toBe(false)
      // Le compte réel du jour est dans le rapport de la PR #1788 (fichier
      // par fichier) — jamais recopié ici en dur, pour la même raison.
    },
  )
})
