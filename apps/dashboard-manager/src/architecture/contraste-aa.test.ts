import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveEnvironment } from '../app/_components/nav-sections'

/**
 * #1674.1 — « Aucun fichier de contraste/ratio/luminance dans le dépôt », et
 * un vrai bug le prouvait : `app/feedback/page.tsx` peignait le filtre ACTIF
 * en `color: rgb(93,77,224)` sur `background: rgb(93,77,224)` — soit
 * `#5d4de0` sur lui-même, un ratio de **1,00:1**. Le libellé était dans le
 * DOM, personne ne pouvait le lire, et c'était le premier écran vu. Corrigé
 * à la main le 07/09/2026 ; cette garde EMPÊCHE le prochain.
 *
 * ⚠️ LE PIÈGE NOMMÉ DANS CE LOT : un ratio calculé sur le mauvais nœud ment
 * dans les DEUX sens. La réponse ici est de ne jamais deviner un fond : le
 * registre `PAIRES` ci-dessous documente, paire par paire, sur QUEL fond
 * chaque texte est RÉELLEMENT peint (héritage compris — `.card .value` ne
 * déclare aucun `color`, et hérite pourtant bien `var(--text)`), avec sa
 * source en commentaire. Ce n'est pas une résolution de cascade CSS
 * générique — un algorithme générique aurait exactement le défaut visé par
 * l'avertissement (deviner). C'est un CONSTAT, comme `HERITAGE` dans
 * `couleurs-passent-par-un-token.test.ts`.
 *
 * CE QUE CETTE GARDE NE VOIT PAS (à lire avant de lui faire confiance) :
 *  - Les couleurs de DONNÉES (palette des graphiques, `charts.tsx`) : ce sont
 *    des remplissages de barres/points, pas du texte — hors du ratio 4,5:1
 *    qui ne s'applique qu'au texte (le seuil « non-texte » de la WCAG est
 *    3:1 et sur un autre critère ; ni l'un ni l'autre n'est ce que ce fichier
 *    calcule).
 *  - Les couleurs de BORDURE (`--border`, `border-color: color-mix(…,
 *    transparent)`) : `border/surface` rend 1,21:1 en sombre — TRÈS bas —
 *    et ce n'est PAS un défaut : une bordure n'est pas du texte. La garde ne
 *    l'inclut délibérément pas dans `PAIRES` (preuve ci-dessous), pour ne
 *    pas s'attraper sur ce qu'elle ne vise pas.
 *  - Un style écrit par un AUTRE composant que ceux listés ici. Un nouveau
 *    `color: var(--x)` ailleurs dans le dépôt n'est vu que le jour où il
 *    rejoint `PAIRES` — exactement comme `HERITAGE` pour les couleurs.
 *  - Le contraste au SURVOL/FOCUS d'un état qui change aussi le POIDS ou la
 *    taille (hors sujet ici, sujet du mouvement/densité, pas de la couleur).
 */

const GLOBALS = fileURLToPath(new URL('../app/globals.css', import.meta.url))
const ANALYSIS_HEADER = fileURLToPath(new URL('../app/analysis/[id]/_components/AnalysisHeader.tsx', import.meta.url))
const AA_TEXTE = 4.5

// ─────────────────────────────────────────────────────────────────────────
// WCAG à la main — aucune dépendance (règle du lot). Formule officielle :
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
// ─────────────────────────────────────────────────────────────────────────
function canalLineaire(c8bit: number): number {
  const p = c8bit / 255
  return p <= 0.03928 ? p / 12.92 : Math.pow((p + 0.055) / 1.055, 2.4)
}

function hexVersRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const complet = h.length === 3 ? h.replace(/./g, c => c + c) : h
  const n = parseInt(complet.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminanceRelative(hex: string): number {
  const [r, g, b] = hexVersRgb(hex)
  return 0.2126 * canalLineaire(r) + 0.7152 * canalLineaire(g) + 0.0722 * canalLineaire(b)
}

/** Ratio WCAG entre deux couleurs, peu importe l'ordre. */
function ratioDeContraste(hexA: string, hexB: string): number {
  const [l1, l2] = [luminanceRelative(hexA), luminanceRelative(hexB)].sort((a, b) => b - a)
  return (l1 + 0.05) / (l2 + 0.05)
}

/**
 * `color-mix(in srgb, A p%, B)` — mélange LINÉAIRE des canaux 8 bits déjà
 * encodés sRGB (c'est le sens exact de « in srgb » dans la spec CSS Color 5 :
 * pas de passage par la lumière linéaire). Le rail (`.siderail`) l'utilise
 * pour son fond ; c'est la seule occurrence du dépôt, donc la seule forme
 * gérée ici — pas un analyseur `color-mix` général.
 */
function melangeSrgb(hexA: string, pctA: number, hexB: string): string {
  const [ra, ga, ba] = hexVersRgb(hexA)
  const [rb, gb, bb] = hexVersRgb(hexB)
  const pctB = 1 - pctA
  const canal = (a: number, b: number): string =>
    Math.round(a * pctA + b * pctB)
      .toString(16)
      .padStart(2, '0')
  return `#${canal(ra, rb)}${canal(ga, gb)}${canal(ba, bb)}`
}

// ─────────────────────────────────────────────────────────────────────────
// Lecture des VRAIS tokens de globals.css — jamais recopiés à la main, sinon
// la garde vérifie sa propre copie plutôt que le fichier servi.
// ─────────────────────────────────────────────────────────────────────────

/** Même technique que `ui/reduced-motion.test.ts` : profondeur d'accolades,
 * pas une regex `[^}]*` qui s'arrêterait à la première fermante. */
function borneDuBloc(css: string, debutAccolade: number): number {
  let profondeur = 0
  for (let i = debutAccolade; i < css.length; i++) {
    if (css[i] === '{') profondeur++
    else if (css[i] === '}') {
      profondeur--
      if (profondeur === 0) return i + 1
    }
  }
  return css.length
}

function blocDe(css: string, marqueur: string): string {
  const debut = css.indexOf(marqueur)
  if (debut === -1) throw new Error(`bloc introuvable dans globals.css : ${marqueur}`)
  const debutAccolade = css.indexOf('{', debut)
  return css.slice(debutAccolade, borneDuBloc(css, debutAccolade))
}

function tokensDe(bloc: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  const re = /--([a-z-]+):\s*(#[0-9a-fA-F]{3,8});/g
  let m: RegExpExecArray | null
  while ((m = re.exec(bloc))) tokens[m[1] as string] = (m[2] as string).toLowerCase()
  return tokens
}

type Jeu = Record<string, string>

function lireLesThemes(): { sombre: Jeu; clair: Jeu } {
  const css = readFileSync(GLOBALS, 'utf8')
  const sombre = tokensDe(blocDe(css, ":root[data-theme='dark']"))
  const clair = tokensDe(blocDe(css, ":root[data-theme='light']"))
  return { sombre, clair }
}

function fondDuRail(t: Jeu): string {
  return melangeSrgb(t.surface as string, 0.7, t.bg as string)
}

/** Le nom de jeton d'un `var(--x)`, tel qu'exporté par `nav-sections.ts` —
 * lu, pas deviné : si l'environnement change de teinte demain, cette garde
 * suit sans qu'on la retouche. */
function nomDeJeton(cssVar: string): string {
  const m = /^var\(--([a-z-]+)\)$/.exec(cssVar)
  if (!m) throw new Error(`jeton d'environnement inattendu : ${cssVar}`)
  return m[1] as string
}

const JETON_PROD = nomDeJeton((resolveEnvironment('production') as { token: string }).token)
const JETON_STAGING = nomDeJeton((resolveEnvironment('preview') as { token: string }).token)
const JETON_LOCAL = nomDeJeton((resolveEnvironment('development') as { token: string }).token)

const BLANC = '#ffffff'

// ─────────────────────────────────────────────────────────────────────────
// Le registre — une paire par COMBINAISON réellement peinte, pas une par
// sélecteur CSS (`th`, `.card .label`, `.pill`… retombent tous sur la même
// paire « atténué/surface »).
// ─────────────────────────────────────────────────────────────────────────
type Paire = { id: string; ou: string; fg: (t: Jeu) => string; bg: (t: Jeu) => string }

const PAIRES: Paire[] = [
  {
    id: 'texte/fond',
    ou: 'body (globals.css:57-77), input/textarea/select, pre.code, code, .connexion__graine — texte normal sur le fond de page',
    fg: t => t.text as string,
    bg: t => t.bg as string,
  },
  {
    id: 'atténué/fond',
    ou: '.subtitle, .connexion label, .kv .k, .link-muted — texte atténué sur le fond de page',
    fg: t => t.muted as string,
    bg: t => t.bg as string,
  },
  {
    id: 'atténué/surface',
    ou: '.card .label, th, .pill, .report-cat, .report-hint, .picker-skip/.picker-close — texte atténué sur une carte/un panneau',
    fg: t => t.muted as string,
    bg: t => t.surface as string,
  },
  {
    id: 'texte/surface',
    ou: '.card .value (hérité, aucun `color` propre), .theme-toggle, .btn.ghost, .btn-sm, .siderail__item.is-current, .siderail__item:hover, .report-title, .report-secondary, .picker-bar — texte normal sur une carte',
    fg: t => t.text as string,
    bg: t => t.surface as string,
  },
  {
    id: 'rouge/surface',
    ou: '.error, .badge.error/.canceled/.ECONOMIC, .report-error — alerte sur une carte',
    fg: t => t.red as string,
    bg: t => t.surface as string,
  },
  {
    id: 'vert/surface',
    ou: '.badge.completed/.USER/.PUBLIC/.P1/.attaque_immediate, .report-ok — succès sur une carte',
    fg: t => t.green as string,
    bg: t => t.surface as string,
  },
  {
    id: 'ambre/surface',
    ou: '.badge.analyzing/.CHAMPION/.P2/.HYPOTHESE/.influence_a_activer — avertissement sur une carte',
    fg: t => t.amber as string,
    bg: t => t.surface as string,
  },
  {
    id: 'bleu/surface',
    ou: '.badge.TECHNICAL/.quick_win/.INTERNE — information sur une carte',
    fg: t => t.blue as string,
    bg: t => t.surface as string,
  },
  {
    id: 'danger/surface',
    ou: '.badge.RISQUE — risque sur une carte',
    fg: t => t.danger as string,
    bg: t => t.surface as string,
  },
  {
    id: 'arrêt/surface',
    ou: "AnalysisHeader.tsx (homonyme détecté, `color: 'var(--stop)'` dans un `.card`) — texte d'arrêt sur une carte",
    fg: t => t.stop as string,
    bg: t => t.surface as string,
  },
  {
    id: 'accent/surface',
    ou: '.theme-toggle:hover, .btn-sm:hover, .link (dans une carte), .report-fab, .report-cat-on, .report-link, .picker-skip:hover/.picker-close:hover — accent sur une carte',
    fg: t => t.accent as string,
    bg: t => t.surface as string,
  },
  {
    id: 'accent/fond',
    ou: '.link (hors carte) — accent sur le fond de page',
    fg: t => t.accent as string,
    bg: t => t.bg as string,
  },
  {
    id: 'blanc/action',
    ou: "EmptyState.module.css:25-26 (`.action`) — LE bouton primaire unique d'un écran vide (#1642.4)",
    fg: () => BLANC,
    bg: t => t.action as string,
  },
  {
    id: 'accent-on-text/accent',
    ou: '.btn (globals.css), .report-primary (globals.css) — bouton générique, PLUSIEURS par écran possibles. #1674.1b : le texte peignait `white`/`#fff` en dur (3,74:1 en sombre) ; passe désormais par --accent-on-text, un token DÉDIÉ au texte peint sur --accent (jamais réutilisé comme fond, distinct de --action réservé au bouton UNIQUE #1642.4)',
    fg: t => t['accent-on-text'] as string,
    bg: t => t.accent as string,
  },
  {
    id: 'atténué/rail',
    ou: '.siderail__item, .siderail__toggle, .siderail__email, .siderail__role, .siderail__sha — texte atténué sur le rail (color-mix 70% surface + fond)',
    fg: t => t.muted as string,
    bg: fondDuRail,
  },
  { id: 'accent/rail', ou: '.siderail__sha:hover — accent sur le rail', fg: t => t.accent as string, bg: fondDuRail },
  {
    id: 'fond/PROD',
    ou: `.siderail__env sur le badge PRODUCTION (nav-sections.ts → --${JETON_PROD})`,
    fg: t => t.bg as string,
    bg: t => t[JETON_PROD] as string,
  },
  {
    id: 'fond/STAGING',
    ou: `.siderail__env sur le badge STAGING (nav-sections.ts → --${JETON_STAGING})`,
    fg: t => t.bg as string,
    bg: t => t[JETON_STAGING] as string,
  },
  {
    id: 'fond/LOCAL',
    ou: `.siderail__env sur le badge LOCAL (nav-sections.ts → --${JETON_LOCAL})`,
    fg: t => t.bg as string,
    bg: t => t[JETON_LOCAL] as string,
  },
]

/**
 * #1674.1b — CORRIGÉ le 09/09/2026. `.btn` et `.report-primary` rendaient
 * 3,74:1 en SOMBRE (blanc en dur sur `--accent` #8071f6). `--accent` sert
 * AUSSI de texte trois fois dans ce même registre (accent/surface, accent/fond,
 * accent/rail, tous proches du seuil) : le foncer pour sauver `.btn` aurait
 * fait chuter ces trois-là sous 4,5 — la même nuance ne peut pas jouer texte
 * ET fond-de-bouton. Réutiliser `--action` (#1642.4, fond du bouton UNIQUE
 * d'écran vide) aurait cassé « un bouton d'action par écran » : `.btn`
 * apparaît 3× dans `feedback-card.tsx`. La réparation est un TROISIÈME token,
 * `--accent-on-text` (`globals.css`), dédié au texte peint sur `--accent` —
 * jamais réutilisé comme fond, jamais confondu avec `--action`. Le registre
 * ci-dessous ne porte donc plus aucune dette : la fonction reste (même
 * esprit que `HERITAGE` dans `couleurs-passent-par-un-token.test.ts`), pour
 * que le prochain défaut réel ait un endroit où s'écrire, daté.
 */
const HERITAGE_NON_CORRIGE: Record<string, Array<'sombre' | 'clair'>> = {}

function estExcepte(id: string, theme: 'sombre' | 'clair'): boolean {
  return (HERITAGE_NON_CORRIGE[id] ?? []).includes(theme)
}

describe('le contraste AA du back-office se calcule, sur la paire réellement peinte (#1674.1)', () => {
  it('LIT quelque chose — les deux thèmes de globals.css ne sont pas vides', () => {
    // Contrôle positif : un chemin faux ou un bloc introuvable rendrait des
    // jeux vides, donc zéro paire testée, donc une garde verte qui n'a rien lu.
    const { sombre, clair } = lireLesThemes()
    expect(Object.keys(sombre).length).toBeGreaterThanOrEqual(10)
    expect(Object.keys(clair).length).toBeGreaterThanOrEqual(10)
    expect(PAIRES.length).toBeGreaterThanOrEqual(15)
  })

  it('LIT vraiment — les valeurs connues de globals.css sont retrouvées telles quelles', () => {
    const { sombre, clair } = lireLesThemes()
    expect(sombre.accent).toBe('#8071f6')
    expect(sombre.surface).toBe('#151a23')
    expect(clair.accent).toBe('#5d4de0')
    expect(clair.surface).toBe('#ffffff')
    // Le mélange du rail retrouve exactement ce qui a été mesuré à la main.
    expect(fondDuRail(sombre)).toBe('#12161f')
    expect(fondDuRail(clair)).toBe('#fafbfc')
    // La paire arrêt/surface est ancrée dans le VRAI fichier qui la peint —
    // pas une supposition : AnalysisHeader.tsx écrit bien ce style inline.
    const analysisHeader = readFileSync(ANALYSIS_HEADER, 'utf8')
    expect(analysisHeader).toContain("color: 'var(--stop)'")
  })

  it('sait dire NON — rejoue le bug réel de #1674.1 (1,00:1, corrigé le 07/09/2026)', () => {
    // `app/feedback/page.tsx` peignait le filtre actif en `#5d4de0` sur
    // `#5d4de0` : la même couleur des deux côtés. La fonction doit le voir.
    expect(ratioDeContraste('#5d4de0', '#5d4de0')).toBeCloseTo(1, 5)
    expect(ratioDeContraste('#5d4de0', '#5d4de0') >= AA_TEXTE).toBe(false)
    // Et l'ANCIEN style de `.btn`/`.report-primary` (blanc en dur, corrigé le
    // 09/09/2026 par #1674.1b) : pur test de régression sur la fonction de
    // calcul, plus sur le CSS servi — voir le test dédié ci-dessous.
    const ratio = ratioDeContraste(BLANC, '#8071f6')
    expect(ratio).toBeCloseTo(3.74, 1)
    expect(ratio >= AA_TEXTE).toBe(false)
  })

  it('n’attrape PAS ce qu’elle ne vise pas — une bordure n’est pas du texte', () => {
    const { sombre, clair } = lireLesThemes()
    // `border/surface` est RÉELLEMENT bas (une bordure discrète, par design) :
    // si cette garde le traitait comme un texte, elle serait rouge en
    // permanence pour une raison qui ne la concerne pas.
    expect(ratioDeContraste(sombre.border as string, sombre.surface as string)).toBeLessThan(AA_TEXTE)
    expect(ratioDeContraste(clair.border as string, clair.surface as string)).toBeLessThan(AA_TEXTE)
    // La preuve que c'est un choix, pas un oubli : aucune paire du registre
    // ne porte la bordure comme texte.
    expect(PAIRES.some(p => p.id.includes('bordure'))).toBe(false)
  })

  it('sait dire NON — sur son PROPRE mécanisme de vérification, pas seulement l’anecdote', () => {
    const { sombre } = lireLesThemes()
    const paireFabriquee: Paire = {
      id: 'fabriquée',
      ou: 'test',
      fg: t => t.muted as string,
      bg: t => t.muted as string,
    }
    const ratio = ratioDeContraste(paireFabriquee.fg(sombre), paireFabriquee.bg(sombre))
    expect(ratio).toBeCloseTo(1, 5)
    expect(ratio >= AA_TEXTE).toBe(false)
  })

  it('#1642.4 — « --action » est déjà distinct de « --accent » et blanc/action passe AA', () => {
    const { sombre, clair } = lireLesThemes()
    expect(sombre.action).not.toBe(sombre.accent)
    expect(clair.action).not.toBe(clair.accent)
    expect(ratioDeContraste(BLANC, sombre.action as string)).toBeGreaterThanOrEqual(AA_TEXTE)
    expect(ratioDeContraste(BLANC, clair.action as string)).toBeGreaterThanOrEqual(AA_TEXTE)
  })

  it('#1674.1b — « --accent-on-text » est un token DÉDIÉ, distinct de --action, qui passe AA sur --accent des deux côtés', () => {
    const { sombre, clair } = lireLesThemes()
    // Un troisième token, pas un déguisement de --action (sinon `.btn`
    // reprendrait, sous un autre nom, le fond réservé au bouton UNIQUE
    // #1642.4 et casserait « un bouton d'action par écran »).
    expect(sombre['accent-on-text']).not.toBe(sombre.action)
    expect(clair['accent-on-text']).not.toBe(clair.action)
    // Le ratio réel, mesuré, pas déclaré.
    const ratioSombre = ratioDeContraste(sombre['accent-on-text'] as string, sombre.accent as string)
    const ratioClair = ratioDeContraste(clair['accent-on-text'] as string, clair.accent as string)
    expect(ratioSombre).toBeGreaterThanOrEqual(AA_TEXTE)
    expect(ratioClair).toBeGreaterThanOrEqual(AA_TEXTE)
    // Chiffres attendus, pour que toute dérive de globals.css se voie ici
    // sans attendre le balayage complet du registre plus bas.
    expect(ratioSombre).toBeCloseTo(5.22, 1)
    expect(ratioClair).toBeCloseTo(5.83, 1)
  })

  it('AUCUNE paire réelle sous 4,5:1, dans les deux thèmes, sauf la dette nommée', () => {
    const { sombre, clair } = lireLesThemes()
    const echecs: string[] = []

    for (const paire of PAIRES) {
      for (const [nomTheme, jeu] of [
        ['sombre', sombre],
        ['clair', clair],
      ] as const) {
        if (estExcepte(paire.id, nomTheme)) continue
        const fg = paire.fg(jeu)
        const bg = paire.bg(jeu)
        const ratio = ratioDeContraste(fg, bg)
        if (ratio < AA_TEXTE) {
          echecs.push(`${paire.id} (${nomTheme}) — ${ratio.toFixed(2)}:1, ${fg} sur ${bg} — ${paire.ou}`)
        }
      }
    }

    expect(
      echecs,
      [
        'Un texte sous 4,5:1 ne se lit pas — exactement le bug de #1674.1',
        '(#5d4de0 sur #5d4de0, 1,00:1, filtre actif de /feedback, corrigé à la main',
        'le 07/09/2026). Chaque ligne ci-dessous est réelle, pas une supposition :',
        '',
        ...echecs,
      ].join('\n'),
    ).toEqual([])
  })
})
