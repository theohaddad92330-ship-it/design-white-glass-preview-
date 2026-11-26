import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-250 — UN RAYON ET UNE HAUTEUR ONT UN NOM. ON ÉCRIT LE NOM.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA MESURE DU 01/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Quinze rayons distincts étaient rendus dans le produit, sur 1 260
 * occurrences. Huit portaient un nom (`rounded-sm` … `rounded-full`), sept
 * n'existaient nulle part ailleurs — et surtout, **cent trois occurrences
 * écrivaient EN PIXELS un rayon qui avait déjà un nom** : `rounded-[6px]`
 * pour `rounded-sm`, `rounded-[8px]` pour `rounded-md`, et ainsi de suite.
 *
 * Ce n'est pas une question de style d'écriture. Trois conséquences réelles :
 *
 *  1. Le rayon nommé suit `--radius` ; le rayon en pixels ne le suit pas.
 *     Régler `--radius` une fois pour toutes ne touchait donc qu'un écran
 *     sur deux — la promesse d'un réglage central était fausse.
 *  2. Personne ne pouvait répondre à « combien de rayons a le produit ? »
 *     sans le compter à la main, donc personne ne le comptait.
 *  3. Trois `rounded-[var(--radius-sm|md|lg)]` visaient des variables **qui
 *     n'existent pas** : la config Tailwind déclare `--radius`, pas ses
 *     déclinaisons. Un `var()` inconnu est ignoré en silence — ces trois-là
 *     rendaient un coin CARRÉ depuis toujours, et rien ne le disait.
 *
 * Même histoire, en plus court, sur les hauteurs : `h-[44px]` ×21,
 * `h-[36px]` ×3, `h-[40px]` ×2, `h-[56px]` ×2 doublaient `h-11`, `h-9`,
 * `h-10`, `h-14`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE INTERDIT — ET CE QU'ELLE LAISSE PASSER
 * ─────────────────────────────────────────────────────────────────────────
 * Interdit : TOUT rayon arbitraire, et toute hauteur arbitraire qui double
 * une hauteur nommée.
 *
 * Laissé passer : une hauteur arbitraire qui ne double RIEN — la hauteur
 * d'un graphe (`h-[220px]`), d'un panneau (`h-[520px]`), d'une icône de
 * 13 px. Les interdire reviendrait à inventer une échelle de hauteurs de
 * bloc que le produit n'a pas, et une garde n'invente pas de règle.
 */

const WEB_SRC = join(__dirname, '..')
const UI_SRC = join(__dirname, '../../../../packages/ui/src')

/** L'échelle, et ce que chaque nom rend réellement (`--radius` = 0.625rem). */
const RADIUS_SCALE = {
  'rounded-none': '0',
  rounded: '4 px',
  'rounded-sm': '6 px — calc(--radius - 4px)',
  'rounded-md': '8 px — calc(--radius - 2px)',
  'rounded-lg': '10 px — --radius',
  'rounded-xl': '12 px',
  'rounded-2xl': '16 px',
  'rounded-full': '9999 px',
  // Théo DS §1.5 — les rôles de la maquette V22, nommés dans `@bellum/ui/tailwind.config`.
  'rounded-card': '18 px — --bellum-radius-card',
  'rounded-overlay': '12 px — --bellum-radius-overlay',
  'rounded-control': '8 px — --bellum-radius-control',
  'rounded-badge': '6 px — --bellum-radius-badge',
} as const

/** Les hauteurs de contrôle nommées, et le pixel qu'elles rendent. */
const NAMED_HEIGHTS: Record<string, string> = {
  '28px': 'h-7',
  '32px': 'h-8',
  '36px': 'h-9',
  '40px': 'h-10',
  '44px': 'h-11',
  '48px': 'h-12',
  '56px': 'h-14',
}

/**
 * Les deux seules valeurs arbitraires de rayon tolérées, chacune avec sa
 * raison. Toute autre entrée demanderait d'expliquer pourquoi l'échelle ne
 * suffit pas — et c'est exactement la conversation qu'on veut provoquer.
 */
const RADIUS_EXCEPTIONS: ReadonlyArray<{ token: string; why: string }> = [
  {
    token: 'rounded-[inherit]',
    why: "ce n'est pas une valeur mais une HÉRITAGE : un enfant qui épouse le rayon de son parent (le contenu d'une zone défilante, le repli d'un avatar). Aucune échelle ne peut l'exprimer.",
  },
  {
    token: 'rounded-[2px]',
    why: "la pointe de la flèche d'infobulle : un carré de 10 px tourné à 45°, dont on adoucit l'angle. Le premier cran de l'échelle (6 px) sur un carré de 10 px ne laisserait plus de pointe du tout.",
  },
]

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

/** Une ligne de commentaire documente souvent la valeur qu'on vient de retirer. */
function isComment(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')
}

const CORPUS = tsxFiles(WEB_SRC)
  .concat(tsxFiles(UI_SRC))
  .map(path => ({ path, lines: readFileSync(path, 'utf8').split('\n') }))

type Offence = { file: string; line: number; token: string; fix: string }

/**
 * #1907.7 — « courbes et rayons cohérents ». Le motif ne lisait que la forme
 * `rounded-[…]` : un rayon arbitraire posé sur UN COIN (`rounded-bl-[4px]`,
 * `rounded-r-[4px]`) lui échappait, et la queue des bulles de Laura en portait
 * quatre. La garde était verte sur exactement le défaut qu'elle nomme — même
 * famille que GA-33 : elle lisait bien, mais pas toute la forme.
 */
const ARBITRARY_RADIUS = /rounded(?:-(?:tl|tr|bl|br|ss|se|es|ee|t|b|l|r|s|e))?-\[[^\]]+\]/g
const ARBITRARY_HEIGHT = /\bh-\[(\d+)px\]/g

function scanLine(line: string): { token: string; fix: string }[] {
  if (isComment(line)) return []
  const found: { token: string; fix: string }[] = []

  ARBITRARY_RADIUS.lastIndex = 0
  for (const match of line.matchAll(ARBITRARY_RADIUS)) {
    if (RADIUS_EXCEPTIONS.some(e => e.token === match[0])) continue
    found.push({
      token: match[0],
      fix: `un nom de l'échelle : ${Object.keys(RADIUS_SCALE).join(', ')}`,
    })
  }

  ARBITRARY_HEIGHT.lastIndex = 0
  for (const match of line.matchAll(ARBITRARY_HEIGHT)) {
    const named = NAMED_HEIGHTS[`${match[1]}px`]
    if (named) found.push({ token: match[0], fix: `\`${named}\`, qui rend exactement ${match[1]}px` })
  }

  return found
}

describe('GA-250 — l’échelle des rayons et des hauteurs', () => {
  it('LIT vraiment un corpus, et il n’est pas vide', () => {
    // Preuve n°1. Un scan qui ne lit rien trouve zéro faute et se dit vert :
    // c'est le « faux zéro » du dépôt, et il coûte plus cher qu'un rouge.
    expect(CORPUS.length).toBeGreaterThan(800)
    expect(CORPUS.some(f => f.path.includes('/packages/ui/src/'))).toBe(true)
  })

  it('sait dire NON — les formes réellement rencontrées sont refusées', () => {
    // Preuve n°2 : on rejoue les six formes qui existaient avant le 01/09,
    // y compris l'alias qui rendait un coin carré sans que personne ne le voie.
    const cassé = [
      'className="rounded-[6px] px-2"',
      'className="rounded-[14px] p-5"',
      'className="rounded-[var(--radius-sm)]"',
      // #1907.7 — les deux formes « par coin » rencontrées le 13/09/2026.
      'className="rounded-xl rounded-bl-[4px] border"',
      'className="h-2.5 rounded-r-[4px] bg-[var(--bellum-primary-500)]"',
      'className="h-[44px] w-full"',
      'className="min-h-[44px]"',
      'className="h-[36px] px-3"',
    ]
    for (const ligne of cassé) {
      expect(scanLine(ligne), ligne).not.toHaveLength(0)
    }
  })

  it('n’attrape PAS ce qu’elle ne vise pas', () => {
    // Preuve n°3. Une hauteur qui ne double aucun nom est légitime : la
    // hauteur d'un graphe, d'un panneau, d'une icône. Un commentaire qui
    // DOCUMENTE l'ancienne valeur l'est aussi — sinon la garde hurlerait sur
    // le texte qui l'explique, et finirait désactivée.
    const innocent = [
      'className="h-[220px] w-full"',
      'className="h-[13px]"',
      'className="rounded-[inherit]"',
      ' * la combinaison `rounded-[14px] + p-5` qui était dupliquée',
      '// on écrivait rounded-[8px] avant le 01/09',
      'className="rounded-xl h-11"',
    ]
    for (const ligne of innocent) {
      expect(scanLine(ligne), ligne).toHaveLength(0)
    }
  })

  it('ne laisse AUCUN rayon arbitraire ni hauteur qui double un nom', () => {
    const offences: Offence[] = []
    for (const { path, lines } of CORPUS) {
      lines.forEach((line, index) => {
        for (const hit of scanLine(line)) {
          offences.push({ file: path.split('/src/')[1], line: index + 1, ...hit })
        }
      })
    }

    expect(
      offences,
      offences.length === 0
        ? ''
        : `Valeurs arbitraires alors qu'un nom existe :\n` +
            offences.map(o => `  ${o.file}:${o.line} — ${o.token} → ${o.fix}`).join('\n'),
    ).toEqual([])
  })

  it('garde ses exceptions NOMMÉES, justifiées, et réellement employées', () => {
    // Une exception qui ne sert plus doit sortir de la liste : sinon elle
    // reste comme une permission ouverte pour un usage futur que personne
    // n'a arbitré.
    expect(RADIUS_EXCEPTIONS).toHaveLength(2)
    for (const { token, why } of RADIUS_EXCEPTIONS) {
      expect(why.length, `exception sans raison : ${token}`).toBeGreaterThan(80)
      expect(
        CORPUS.some(f => f.lines.some(l => !isComment(l) && l.includes(token))),
        `exception jamais utilisée, elle doit sortir : ${token}`,
      ).toBe(true)
    }
  })
})
