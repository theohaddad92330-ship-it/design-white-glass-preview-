import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-256 — LE CORPS DE LA PAGE NE DÉFILE JAMAIS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA MESURE DU 07/09/2026 (#1701)
 * ─────────────────────────────────────────────────────────────────────────
 * Retour de Louis, mot pour mot : « beug affichage quand on descend tout en
 * bas des pages, ca devient page blanche infinie ». Le widget avait relevé
 * `html` mesuré **1838 × 873 dans un viewport de 1837 × 872, mais @ (0, −394)**
 * — la page avait défilé de 394 px alors que `html` n'en fait que 873.
 *
 * Mesuré EN PRODUCTION, pas lu :
 *
 *   /dashboard  → `document.scrollingElement.scrollHeight` 869 pour un
 *                 `clientHeight` de 861 : **8 px de document sous la coque**.
 *   /demo       → 902 contre 861 : **41 px**.
 *
 * Dans les deux cas `#app-shell` mesurait exactement 861 (`height: 100dvh`,
 * `index.css`). Le débordement ne vient donc PAS de la coque : il vient d'un
 * descendant qui dépasse d'elle, et que personne ne rogne. Sous la coque il
 * n'y a plus rien de peint — d'où la « page blanche infinie ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX FAÇONS DE DÉPASSER UNE COQUE DE HAUTEUR FIXE
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Redéclarer la hauteur du VIEWPORT à l'intérieur du viewport.**
 *    `#app-shell` fait déjà `100dvh`. Un écran qui écrit `min-h-[100dvh]`
 *    dedans demande la hauteur ENTIÈRE de l'écran alors qu'il n'a droit
 *    qu'à ce qui reste sous les bandeaux — il dépasse d'exactement la
 *    hauteur des bandeaux. C'est ce qui produisait les 41 px de `/demo` :
 *    le bandeau d'incarnation mesurait 41 px.
 *    Corollaire cruel : **sans bandeau, ça tombe juste**. `/login` mesurait
 *    0 px de débordement. Le défaut ne se voit que sur les comptes qui ont
 *    un bandeau — c'est-à-dire jamais en test, toujours chez le client.
 *
 * 2. **Une hauteur définie PLUS une marge extérieure, sur le même élément.**
 *    `menu-layout.tsx` écrivait `m-2 … h-full` : la boîte prend 100 % de son
 *    parent, et la marge s'AJOUTE par-dessus — 16 px de trop, sur TOUS les
 *    écrans de l'application, puisque `MenuLayout` les enveloppe tous. Une
 *    marge se paie en dehors de la boîte ; un `padding` se paie dedans.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE INTERDIT — ET CE QU'ELLE LAISSE PASSER
 * ─────────────────────────────────────────────────────────────────────────
 * Interdit dans tout composant rendu SOUS `#app-shell` : réclamer LA hauteur
 * entière du viewport (`h-[100dvh]`, `min-h-screen`, jusqu'à
 * `min-h-[calc(100dvh-5rem)]` qui devine la hauteur de l'entête), et le
 * couple « `h-full` + marge VERTICALE » sur un même élément.
 *
 * Laissé passer, chaque fois pour une raison arithmétique et non par
 * commodité : les PLAFONDS (`max-h-…`, qui ne peuvent pas rendre une boîte
 * plus haute que le viewport), les FRACTIONS du viewport (`min-h-[40vh]`,
 * qui ne réclament pas l'écran entier), les marges HORIZONTALES avec
 * `h-full` (elles ne font rien défiler vers le bas), les hauteurs en pixels
 * (`h-[220px]`, sujet de GA-250), les LARGEURS en unités de viewport
 * (`w-[100vw]`), et la surface nommée ci-dessous qui vit dans un PORTAIL
 * fixé au viewport — elle n'est pas sous la coque, donc la coque ne la
 * borne pas, donc l'unité de viewport y est la seule réponse juste.
 *
 * Ce que la garde ne peut PAS voir, et qui reste à la recette : un
 * descendant qui déborde par son CONTENU (une grille trop haute, une image
 * sans contrainte). Le rempart pour ceux-là est `overflow: hidden` sur
 * `#app-shell` — posé dans `index.css` par le même lot. Une garde protège
 * une règle, elle ne remplace pas la mesure.
 */

const WEB_SRC = join(__dirname, '..')
const UI_SRC = join(__dirname, '../../../../packages/ui/src')

/**
 * Les seules surfaces autorisées à parler en hauteur de viewport : elles
 * sont rendues dans un PORTAIL, en `fixed`, donc hors du flux de la coque.
 * Une entrée qui ne sert plus doit sortir de cette liste — sinon elle reste
 * une permission ouverte pour un usage que personne n'a arbitré.
 */
const PORTAILS_ANCRÉS_AU_VIEWPORT: ReadonlyArray<{ fichier: string; pourquoi: string }> = [
  {
    fichier: 'apps/web/src/features/expenses/view/ExpenseReportEditor.tsx',
    pourquoi:
      "un `SheetContent` est rendu dans un PORTAIL collé au bord de la fenêtre, au-dessus de la coque et hors de son flux. Le viewport est sa boîte de référence RÉELLE : `h-full` y vaudrait la hauteur du portail, c'est-à-dire rien. Le tiroir de relevé d'heures répond au même besoin avec `max-h-[100dvh]`, qui ne peut par construction rien faire déborder — il n'a donc besoin d'aucune exception, et c'est la forme à préférer.",
  },
]

const FICHIERS_AUTORISÉS = new Set(PORTAILS_ANCRÉS_AU_VIEWPORT.map(e => e.fichier))

function tsxFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full)
    }
  }
  walk(root)
  return out
}

/** Un commentaire documente souvent la valeur qu'on vient justement de retirer. */
function isComment(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')
}

/**
 * `min-h-[100dvh]`, `h-[100svh]`, `h-screen`, `min-h-screen`, et jusqu'à
 * `min-h-[calc(100dvh-5rem)]` — qui DEVINE la hauteur de l'entête au lieu de
 * la mesurer, et déborde dès qu'un bandeau de plus s'affiche.
 *
 * Deux formes sont volontairement HORS champ, et il faut savoir pourquoi :
 *
 *  · `max-h-…` — un plafond ne peut pas rendre une boîte plus HAUTE que le
 *    viewport, donc il ne peut structurellement pas produire ce défaut. Une
 *    vingtaine de `max-h-[82vh]` parfaitement légitimes vivent sur des
 *    `DialogContent` en portail : les interdire aurait demandé vingt
 *    exceptions, c'est-à-dire une règle fausse. Une garde qui a besoin de
 *    vingt exceptions ne protège pas une règle, elle en invente une.
 *
 *  · une FRACTION du viewport (`min-h-[40vh]`) — c'est une proportion, pas
 *    une revendication de l'écran entier. La règle porte sur le `100`.
 */
const HAUTEUR_DE_VIEWPORT = /(?<!max-)\b(?:min-)?h-(?:\[[^\]]*\b100(?:dvh|vh|svh|lvh)\b[^\]]*\]|screen\b)/g

/**
 * `h-full` et une marge VERTICALE sur le même élément : la boîte prend déjà
 * 100 % du parent, la marge s'ajoute PAR-DESSUS.
 *
 * Deux restrictions volontaires. Les marges HORIZONTALES ne peuvent pas faire
 * défiler le corps de la page vers le bas. Et une hauteur en PIXELS
 * (`h-[220px] mb-2`) est une carte de taille fixe dans une liste défilante —
 * la forme la plus banale du produit, et elle ne déborde rien : seul le
 * « 100 % + marge » est arithmétiquement impossible à tenir.
 */
const MARGE_VERTICALE = /\b(?:m|my|mt|mb)-(?:\d+|px|\[[^\]]+\])/
const HAUTEUR_DÉFINIE = /\bh-full\b/

function scanLine(line: string): { token: string; fix: string }[] {
  if (isComment(line)) return []
  const found: { token: string; fix: string }[] = []

  HAUTEUR_DE_VIEWPORT.lastIndex = 0
  for (const match of line.matchAll(HAUTEUR_DE_VIEWPORT)) {
    found.push({
      token: match[0],
      fix: "`h-full` / `min-h-full` — `#app-shell` fait déjà `100dvh`, l'écran n'a droit qu'à ce qui reste sous les bandeaux",
    })
  }

  if (HAUTEUR_DÉFINIE.test(line) && MARGE_VERTICALE.test(line)) {
    found.push({
      token: `${line.match(HAUTEUR_DÉFINIE)?.[0]} + ${line.match(MARGE_VERTICALE)?.[0]}`,
      fix: 'un `padding` à la place de la marge — une marge s’AJOUTE à la hauteur, un padding se paie dedans',
    })
  }

  return found
}

const CORPUS = tsxFiles(WEB_SRC)
  .concat(tsxFiles(UI_SRC))
  .map(path => ({
    path,
    relatif: path.slice(path.indexOf('/apps/') >= 0 ? path.indexOf('/apps/') + 1 : path.indexOf('/packages/') + 1),
    lines: readFileSync(path, 'utf8').split('\n'),
  }))

describe('GA-256 — le corps de la page ne défile jamais', () => {
  it('LIT vraiment un corpus, et il n’est pas vide', () => {
    // Preuve n°1. Un scan qui ne lit rien trouve zéro faute et se dit vert :
    // c'est le « faux zéro » du dépôt, et il coûte plus cher qu'un rouge.
    expect(CORPUS.length).toBeGreaterThan(800)
    expect(CORPUS.some(f => f.path.includes('/packages/ui/src/'))).toBe(true)
    expect(CORPUS.some(f => f.path.includes('/apps/web/src/features/'))).toBe(true)
  })

  it('sait dire NON — les formes réellement mesurées le 07/09 sont refusées', () => {
    // Preuve n°2 : on rejoue les formes qui existaient AVANT le correctif,
    // celles qui produisaient les 8 px de /dashboard et les 41 px de /demo.
    const cassé = [
      'className="min-h-[100dvh] bg-[var(--bellum-bg)]"', // LoginPage, DemoEntryPage…
      'className="grid min-h-[100dvh] grid-cols-1 lg:grid-cols-2"',
      'className="flex h-[100dvh] min-h-0 flex-col"', // MobileShell
      'className="relative mx-auto flex min-h-[calc(100dvh-5rem)] w-full"', // SearchAnalyzingState : l'entête DEVINÉE
      'className="relative min-h-screen h-full items-center"', // generic-problem-message
      "'m-2 flex h-full w-full flex-col space-y-2 overflow-hidden',", // menu-layout, les 8 px de /dashboard
      'className="mt-4 h-full"',
    ]
    for (const ligne of cassé) {
      expect(scanLine(ligne), ligne).not.toHaveLength(0)
    }
  })

  it('n’attrape PAS ce qu’elle ne vise pas', () => {
    // Preuve n°3. Une garde trop gourmande finit désactivée. Ne sont visées
    // ni les LARGEURS de viewport, ni les hauteurs en pixels (GA-250), ni
    // les marges HORIZONTALES — aucune des trois ne fait défiler le corps de
    // la page vers le bas. Et le commentaire qui EXPLIQUE la règle ne doit
    // pas la déclencher, sinon la garde se mord elle-même.
    const innocent = [
      'className="h-full w-full"',
      'className="mx-2 h-full"',
      'className="ml-4 mr-2 h-full"',
      'className="h-[220px] w-full"',
      'className="mb-2 h-[220px] w-full"', // carte de taille fixe dans une liste défilante : la forme la plus banale du produit
      'className="w-[100vw]"',
      'className="min-h-0 flex-1"',
      // Les plafonds, sur les surfaces en portail : innocents par construction.
      'className="flex max-h-[100dvh] w-full max-w-xl flex-col"', // TimesheetReviewDrawer
      'className="max-h-[min(34rem,calc(100dvh-6rem))]"', // LauraBubblePanel
      'className="max-h-[82vh] min-w-[60vw] flex-col overflow-hidden"', // BellumReadCard
      'className="max-h-screen w-full flex-col-reverse"', // toast
      'className="flex min-h-[40vh] flex-col items-center"', // une FRACTION du viewport, pas l’écran entier
      "appShell.style.height = isVisible ? `calc(100dvh - ${DEV_TOOLBAR_OFFSET_PX}px)` : '100dvh'", // la coque elle-même
      ' * `#app-shell` fait déjà `min-h-[100dvh]`, ne le redéclare pas',
      '// on écrivait max-h-[98vh] avant le 07/09',
      'className="mt-4 flex flex-col"',
    ]
    for (const ligne of innocent) {
      expect(scanLine(ligne), ligne).toHaveLength(0)
    }
  })

  it('ne laisse AUCUNE hauteur de viewport ni marge verticale sous la coque', () => {
    const offences: { fichier: string; ligne: number; token: string; fix: string }[] = []
    for (const { relatif, lines } of CORPUS) {
      if (FICHIERS_AUTORISÉS.has(relatif)) continue
      lines.forEach((line, index) => {
        for (const hit of scanLine(line)) {
          offences.push({ fichier: relatif, ligne: index + 1, ...hit })
        }
      })
    }

    expect(
      offences,
      offences.length === 0
        ? ''
        : `#1701 — ces éléments dépassent \`#app-shell\` et font défiler le CORPS de la page ` +
            `dans une zone que personne ne peint :\n` +
            offences.map(o => `  ${o.fichier}:${o.ligne} — ${o.token} → ${o.fix}`).join('\n'),
    ).toEqual([])
  })

  it('garde ses exceptions NOMMÉES, justifiées, et réellement employées', () => {
    expect(PORTAILS_ANCRÉS_AU_VIEWPORT).toHaveLength(1)
    for (const { fichier, pourquoi } of PORTAILS_ANCRÉS_AU_VIEWPORT) {
      expect(pourquoi.length, `exception sans raison : ${fichier}`).toBeGreaterThan(80)
      const entrée = CORPUS.find(f => f.relatif === fichier)
      expect(entrée, `exception qui ne désigne aucun fichier du corpus : ${fichier}`).toBeDefined()
      // ⚠️ `.test()` sur une regex porteuse du drapeau `g` est STATEFUL : elle
      // reprend à `lastIndex` et rend `false` un appel sur deux. Le piège a
      // déjà produit une garde borgne dans ce dépôt. On scanne donc avec la
      // même fonction que le reste de la garde, jamais avec `.test()` direct.
      expect(
        entrée?.lines.some(l => scanLine(l).length > 0),
        `exception qui ne sert plus, elle doit sortir : ${fichier}`,
      ).toBe(true)
    }
  })
})
