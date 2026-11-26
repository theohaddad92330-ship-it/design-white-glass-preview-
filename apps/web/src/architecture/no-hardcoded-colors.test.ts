import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-248 — UNE COULEUR NE S'ÉCRIT PAS EN DUR DANS DU TSX.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE, ET POURQUOI GA-33 NE SUFFISAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Les pastilles de filtre de la Veille écrivaient la couleur de leur état
 * ACTIF en dur, `#C4B5FD`, dans un `style` en ligne. Ce violet pâle est juste
 * en thème sombre (9,43:1) et tombe à **1,35:1 en thème clair** — le fond
 * translucide s'y compose en #E3D8F0, et un texte pâle sur un fond pâle ne se
 * lit pas. C'est très exactement ce que la règle D79 interdit.
 *
 * GA-33 était VERTE pendant tout ce temps, et elle avait raison de l'être :
 * elle lit les CLASSES Tailwind. Une couleur passée par l'attribut `style`
 * lui est structurellement invisible. Le défaut n'était pas dans la garde,
 * il était dans son champ de vision — d'où celle-ci, qui regarde l'autre
 * moitié du problème.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE REGARDE, ET CE QU'ELLE NE REGARDE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ne cherche PAS « un `#` suivi de six caractères » — ce motif-là attrape
 * les commentaires qui documentent une couleur (il y en a une dizaine dans le
 * dépôt, y compris ceux qui expliquent ce bug-ci), et une garde qui hurle sur
 * sa propre explication finit désactivée dans la semaine.
 *
 * Elle cherche une couleur POSÉE : un hex affecté à une propriété qui peint
 * (`color`, `background`, `fill`, `stroke`…) ou glissé dans une valeur
 * arbitraire Tailwind (`text-[#abc123]`). Hors de ces positions, un hex dans
 * un fichier TSX ne peint rien.
 */

const WEB_SRC = join(__dirname, '..')
const UI_SRC = join(__dirname, '../../../../packages/ui/src')

/**
 * Les propriétés CSS qui PEIGNENT. Une couleur affectée ailleurs
 * (`data-color`, une clé de traduction, un identifiant) ne rend rien à
 * l'écran et ne regarde pas cette garde.
 */
const PAINTING_PROPS = [
  'color',
  'background',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'outlineColor',
  'caretColor',
  'fill',
  'stroke',
  'boxShadow',
  'textShadow',
  'stopColor',
]

/** `color: '#fff'`, `fill="#4285F4"`, `style.color = '#F87171'` — et rien d'autre. */
const PAINTED_HEX = new RegExp(String.raw`\b(${PAINTING_PROPS.join('|')})\s*[:=]\s*[^,;}\n]*?#[0-9a-fA-F]{3,8}\b`, 'g')

/** `text-[#abc123]`, `bg-[#fff]` — la couleur en dur déguisée en classe. */
const ARBITRARY_HEX = /-\[#[0-9a-fA-F]{3,8}\]/g

/**
 * La seule exemption, avec sa raison — et pas un chemin de
 * plus sans qu'elle soit écrite ici.
 *
 * ⚠️ Une exemption se justifie par « cette couleur n'APPARTIENT PAS au
 * produit », jamais par « c'est plus rapide comme ça ». Celle-ci peint la
 * marque de quelqu'un d'autre. Le bandeau d'usurpation d'identité (THEO-REFONTE-COMPOSANTS) a
 * quitté la liste : il parle la grammaire commune des bandeaux, en jetons `danger`.
 */
const EXEMPT: ReadonlyArray<{ path: string; why: string }> = [
  {
    path: 'features/auth/components/GoogleIcon.tsx',
    why: "les quatre couleurs de la marque Google. Les teinter au thème donnerait un logo faux — c'est le seul cas où une couleur ne doit PAS suivre le produit.",
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
      if (!entry.endsWith('.tsx')) continue
      if (entry.includes('.test.')) continue
      out.push(full)
    }
  }
  walk(root)
  return out
}

type Offence = { file: string; line: number; text: string }

/**
 * Une ligne de commentaire.
 *
 * ⚠️ CE FILTRE MANQUAIT, et la garde s'est déclenchée sur SES PROPRES
 * explications : les commentaires qui racontent le bug de la couleur #1A1A24
 * citent forcément la propriété qui la portait. Le motif « propriété qui
 * peint » ne suffit donc pas à lui seul — il faut aussi savoir qu'un
 * commentaire ne peint rien. Une garde rouge sur le texte qui la justifie
 * finit désactivée dans la semaine.
 */
function isComment(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('{/*')
}

function scan(source: string, label: string): Offence[] {
  const found: Offence[] = []
  source.split('\n').forEach((line, index) => {
    if (isComment(line)) return
    for (const pattern of [PAINTED_HEX, ARBITRARY_HEX]) {
      pattern.lastIndex = 0
      const hit = pattern.exec(line)
      if (hit) found.push({ file: label, line: index + 1, text: hit[0].trim() })
    }
  })
  return found
}

const CORPUS = [...tsxFiles(WEB_SRC), ...tsxFiles(UI_SRC)]

describe('GA-248 — aucune couleur écrite en dur dans du TSX', () => {
  it('LIT vraiment un corpus, et il n’est pas vide', () => {
    // La preuve n°1 exigée de toute garde du dépôt : sans elle, un chemin
    // faux rendrait ce fichier vert en ne lisant rien. Mesuré au 01/09/2026 :
    // 983 fichiers .tsx hors tests.
    expect(CORPUS.length).toBeGreaterThan(800)
    expect(CORPUS.some(f => f.includes('/packages/ui/src/'))).toBe(true)
    expect(CORPUS.some(f => f.includes('/features/watchlist/'))).toBe(true)
  })

  it('sait dire NON — un hex posé sur une propriété qui peint est refusé', () => {
    // La preuve n°2 : on casse volontairement le code que la garde protège.
    // Ce sont les cinq formes réellement rencontrées dans le dépôt avant le
    // nettoyage du 01/09.
    const cassé = [
      `style={{ color: isActive ? '#C4B5FD' : 'var(--bellum-text-secondary)' }}`,
      `style={{ background: '#1A1A24' }}`,
      `<path fill="#4285F4" />`,
      `element.style.color = '#F87171'`,
      `className="text-[#5b3ee8]"`,
    ]
    for (const ligne of cassé) {
      expect(scan(ligne, 'synthétique'), ligne).toHaveLength(1)
    }
  })

  it('n’attrape PAS ce qu’elle ne vise pas', () => {
    // La preuve n°3 : une garde trop gourmande se fait désactiver. Un hex qui
    // ne peint rien — un commentaire qui documente la couleur, une clé, une
    // ancre d'URL — n'est pas une faute.
    const innocent = [
      '/* la couleur #22c55e en dur faisait 2,28:1 sur le fond blanc. */',
      // Les deux cas qui ont réellement fait rougir cette garde le 01/09 : un
      // commentaire qui cite la PROPRIÉTÉ autant que la couleur.
      ` * un écran forçait style={{ background: '#1A1A24' }} sur ses options`,
      ' *    Tailwind (#171717) qui écrasait bg-card, le token du thème',
      `// La rampe passe de #f5f4f0 à #ffffff (décision « FA »).`,
      `const anchor = 'https://exemple.fr/page#section'`,
      `style={{ color: 'var(--bellum-text-accent)' }}`,
      `data-testid="chip-#1"`,
    ]
    for (const ligne of innocent) {
      expect(scan(ligne, 'synthétique'), ligne).toHaveLength(0)
    }
  })

  it('ne trouve aucune couleur en dur dans le produit', () => {
    const offences: Offence[] = []
    for (const file of CORPUS) {
      const label = relative(join(WEB_SRC, '..'), file).replace(/^src\//, '')
      if (EXEMPT.some(e => file.endsWith(e.path))) continue
      offences.push(...scan(readFileSync(file, 'utf8'), label))
    }

    expect(
      offences,
      offences.length === 0
        ? ''
        : `Couleurs écrites en dur (elles ne suivent aucun thème) :\n` +
            offences.map(o => `  ${o.file}:${o.line} — ${o.text}`).join('\n') +
            `\n\nUtiliser un token : --bellum-text-accent (un lien, une valeur mise en avant),\n` +
            `--bellum-on-primary (du texte SUR un remplissage violet),\n` +
            `--*-soft-bg / --*-soft-border / --*-soft-text (une pastille teintée),\n` +
            `--bellum-success / --bellum-warning / --bellum-danger (un remplissage sémantique).`,
    ).toEqual([])
  })

  it('garde ses exemptions NOMMÉES et justifiées', () => {
    // Une liste d'exemptions qui grossit sans raison écrite est le début de la
    // fin d'une garde. Chaque entrée doit exister sur le disque et porter son
    // pourquoi.
    expect(EXEMPT).toHaveLength(1)
    for (const { path, why } of EXEMPT) {
      expect(
        CORPUS.some(f => f.endsWith(path)),
        `exemption sur un fichier absent : ${path}`,
      ).toBe(true)
      expect(why.length, `exemption sans raison : ${path}`).toBeGreaterThan(60)
    }
  })
})
