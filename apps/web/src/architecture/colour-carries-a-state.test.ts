/**
 * GA-67 — une couleur porte un ÉTAT, jamais une CATÉGORIE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, À LA SOURCE
 * ─────────────────────────────────────────────────────────────────────────
 * Tome 7, §26.1 — « Les couleurs et leur sens » :
 *
 *   > **Une couleur porte un état, jamais une catégorie.**
 *   >
 *   > Un graphique de CA par client ne colore pas chaque client
 *   > différemment : il utilise une seule teinte, avec l'intensité pour la
 *   > valeur. Les couleurs sémantiques restent disponibles pour dire *ce qui
 *   > va bien et ce qui ne va pas*.
 *   >
 *   > Sans cette règle, un écran finit avec neuf couleurs dont aucune ne veut
 *   > rien dire, et le rouge du danger se perd dans le décor.
 *
 * Et §26 donne l'usage EXCLUSIF de chaque jeton :
 *
 *   | Primaire   | `--bellum-primary-500` | l'action principale, l'élément sélectionné. **Jamais une donnée.** |
 *   | Succès     | `--bellum-success`     | ce qui est fait, validé, disponible                                |
 *   | Attention  | `--bellum-warning`     | ce qui demande une décision                                        |
 *   | Danger     | `--bellum-danger`      | ce qui bloque, ce qui expire, ce qui a échoué                       |
 *   | Information| `--bellum-info`        | ce qui est déduit, ce qui vient d'un modèle                        |
 *   | Neutre     | `--bellum-text-muted`  | **l'inconnu**                                                       |
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE N'INTERDIT PAS — et pourquoi c'est la moitié du travail
 * ─────────────────────────────────────────────────────────────────────────
 * Une garde qui interdirait « la couleur » serait FAUSSE : la moitié des
 * pastilles du produit sont justes et doivent le rester. La garde distingue
 * donc deux choses, et une seule est interdite.
 *
 *   · **Un ÉTAT** dit *ce qu'il faut faire* : bloqué, à faire, terminé, en
 *     risque, échoué, inconnu. Il se lit SANS légende, parce que le vert et le
 *     rouge portent déjà leur sens. `STATUS_CONFIG` (compte en cours / en
 *     erreur / archivé), `CELL_STYLES` (couvert / partiel / trou),
 *     `BADGE_COLORS` (GO / PRUDENT / NO-GO), `HEALTH_DOT` (ok / dégradé /
 *     tombé), `URGENCY_DOT`, `SaveStatus` : **tous légitimes, tous colorés,
 *     tous laissés en place.**
 *
 *   · **Une CATÉGORIE** dit *de quelle sorte c'est* : un type, une famille, un
 *     secteur, un canal, une nature d'objet. Elle n'apprend rien au lecteur —
 *     il doit mémoriser une légende — et elle épuise la palette : quand un
 *     « type de preuve » consomme l'ambre, l'ambre ne veut plus dire « ça
 *     demande une décision ».
 *
 *   · **Exception nommée par la source elle-même : les 5 couleurs de RÔLE de
 *     décision** (§26.2, « reprise directe, elle est excellente »). Un rôle
 *     décisionnel ressemble à une catégorie, mais la source l'autorise
 *     explicitement — la garde ne le compte donc pas comme une infraction, et
 *     `Role` n'est PAS dans le lexique catégoriel plus bas. En revanche §26.2
 *     pose une condition, tenue par le 4ᵉ test de ce fichier :
 *     **« le gris est le plus important. Un organigramme où tout est coloré
 *     est un organigramme inventé. »**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE LIT, ET COMMENT ELLE TRANCHE
 * ─────────────────────────────────────────────────────────────────────────
 * Elle parcourt `apps/web/src` (`.ts` ET `.tsx` — GA-33, sa voisine, ne lit
 * que les `.tsx`, et c'est exactement dans les `.ts` que se cachaient
 * `PROOF_TYPE_META` et la palette de rôles) et collecte les **tables de
 * couleurs** : tout `const NOM[: TYPE] = { … }` dont le corps porte des
 * valeurs de couleur — classes Tailwind, jetons `--bellum-*`, ou des NOMS de
 * teinte (`'violet'`, `'amber'`…) quand la table sert d'indirection.
 *
 * Une table est en infraction quand sa CLÉ est catégorielle, ce qui se lit à
 * deux endroits :
 *
 *   1. le NOM de la table, découpé en mots (`PROOF_TYPE_META` → `PROOF` ·
 *      `TYPE` · `META`) ;
 *   2. le DERNIER mot du type de clé (`Record<CockpitKpiKind, …>` → `Kind`),
 *      pour chaque membre d'union (`ActionHistoryItem['category'] | 'amber'`).
 *      Le dernier mot seulement, et c'est délibéré : `Record<SourceHealth, …>`
 *      se termine par `Health`, c'est l'état de SANTÉ d'une source, pas une
 *      couleur par source. Prendre tous les mots aurait fait tomber
 *      `HEALTH_DOT`, qui est juste. Une garde qui garde trop large est une
 *      garde fausse.
 *
 * ⚠️ Ce qui est compté, ce sont les **TEINTES**, pas les valeurs. C'est la
 * différence entre une infraction et la réponse que la source prescrit :
 * « il utilise une seule teinte, avec l'intensité pour la valeur ». Une rampe
 * `primary-500 / 400 / 300 / 200` ne fait qu'une teinte et reste légale ; quatre
 * jetons sémantiques en font quatre. Et les NEUTRES (`--bellum-text-muted`,
 * `--bellum-border`) ne comptent pour aucune teinte — le gris est précisément
 * ce que la source demande de laisser dominer.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

/** Les mots qui nomment une CATÉGORIE — « de quelle sorte c'est ». */
const CATEGORY_WORDS = new Set([
  'category',
  'categorie',
  'categories',
  'type',
  'types',
  'kind',
  'kinds',
  'family',
  'famille',
  'sector',
  'secteur',
  'industry',
  'channel',
  'canal',
  'nature',
  'medium',
])

const HUES =
  'slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

/** Les familles NEUTRES — le gris n'est pas une couleur au sens du §26 : c'est
 *  ce que la source demande de laisser dominer. */
const NEUTRAL_HUES = /-(?:slate|gray|grey|zinc|neutral|stone)-\d+/

/** Une valeur de couleur : classe Tailwind, jeton du thème, ou nom de teinte. */
const COLOUR_VALUE = new RegExp(
  [
    `(?:bg|text|border|fill|stroke|ring|from|to|via)-(?:${HUES})-\\d+`,
    `--bellum-(?:success|warning|danger|info|primary-\\d+)`,
    `--(?:success|warning|danger|info|accent)-soft`,
    `['"](?:${HUES})['"]`,
  ].join('|'),
  'g',
)

/** La TEINTE d'une valeur — `bg-amber-500`, `--warning-soft-text` et
 *  `--bellum-warning` disent tous « ambre ». Une rampe d'intensités sur une
 *  seule teinte (`primary-500` → `primary-200`) n'en fait qu'une : c'est la
 *  réponse que §26.1 prescrit, pas l'infraction qu'il vise. */
function hueOf(value: string): string {
  const tailwind = new RegExp(`-(${HUES})-\\d+`).exec(value)
  if (tailwind) return tailwind[1] as string
  const bare = new RegExp(`^(${HUES})$`).exec(value.replace(/['"]/g, ''))
  if (bare) return bare[1] as string
  if (/primary/.test(value)) return 'primary'
  const semantic = /(success|warning|danger|info|accent)/.exec(value)
  return semantic ? (semantic[1] as string) : value
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

type ColourTable = { file: string; name: string; keyType: string; hues: string[] }

/** Les mots d'un identifiant : `PROOF_TYPE_META` et `proofTypeMeta` → proof·type·meta. */
function words(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map(word => word.toLowerCase())
}

/** Le type de la CLÉ d'une table : `Record<X, Y>` → `X` ; sinon ''.
 *  Les chevrons et crochets sont ÉQUILIBRÉS : `Record<Exclude<S, 'idle'>, …>`
 *  a sa première virgule à l'intérieur d'`Exclude`, pas au bon niveau. */
function keyTypeOf(annotation: string): string {
  const at = annotation.indexOf('Record<')
  if (at < 0) return ''
  let depth = 0
  for (let i = at + 6; i < annotation.length; i++) {
    const char = annotation[i]
    if (char === '<' || char === '[') depth++
    else if (char === '>' || char === ']') depth--
    else if (char === ',' && depth === 1) return annotation.slice(at + 7, i).trim()
  }
  return ''
}

/** Collecte toute table `const NOM[: TYPE] = { … }` — et toute FONCTION qui
 *  rend des couleurs, parce que `siteTypeToneClass` était un `switch` déguisé
 *  qui faisait exactement ce que la table voisine faisait. */
export function collectColourTables(files: readonly string[]): ColourTable[] {
  const tables: ColourTable[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const declaration =
      /(?:export\s+)?(?:const\s+([A-Za-z0-9_]+)\s*(?::\s*([^=]*?))?=|function\s+([A-Za-z0-9_]+)\s*\([^)]*\)[^{]*)\s*\{/g
    let match: RegExpExecArray | null
    while ((match = declaration.exec(source))) {
      let depth = 0
      let end = -1
      for (let i = declaration.lastIndex - 1; i < source.length; i++) {
        if (source[i] === '{') depth++
        else if (source[i] === '}') {
          depth--
          if (depth === 0) {
            end = i
            break
          }
        }
      }
      if (end < 0) continue
      const body = source.slice(declaration.lastIndex, end)
      // Une table de couleurs tient dans un écran ; au-delà c'est un objet de
      // configuration qui mentionne une couleur, pas une palette.
      if (body.length > 4000) continue
      const hues = [...new Set((body.match(COLOUR_VALUE) ?? []).map(hueOf))]
      if (hues.length === 0) continue
      tables.push({
        file: file.replace(/.*\/src\//, 'src/'),
        name: (match[1] ?? match[3]) as string,
        keyType: keyTypeOf((match[2] ?? '').replace(/\s+/g, ' ')),
        hues,
      })
    }
  }
  return tables
}

/** Le mot catégoriel qui condamne la table, ou `null` si elle est innocente. */
export function categoricalKey(table: Pick<ColourTable, 'name' | 'keyType'>): string | null {
  for (const word of words(table.name)) {
    if (CATEGORY_WORDS.has(word)) return `nom · ${word}`
  }
  // Le DERNIER mot du type de clé, et lui seul : `SourceHealth` est un état.
  // Chaque membre d'union séparément — `X['category'] | 'amber'` cachait sa
  // catégorie derrière un nom de teinte, et la garde passait à côté.
  for (const member of table.keyType.split('|')) {
    const keyWords = words(member)
    const head = keyWords[keyWords.length - 1]
    if (head && CATEGORY_WORDS.has(head)) return `clé · ${table.keyType}`
  }
  return null
}

const FILES = sourceFiles(SRC).filter(file => !file.includes('/architecture/'))
const TABLES = collectColourTables(FILES)

describe('GA-67 — une couleur porte un état, jamais une catégorie', () => {
  it('la garde LIT un corpus, et il n’est pas vide', () => {
    // Sans ces assertions, un chemin cassé rendrait la garde verte pour
    // toujours — le défaut le plus fréquent du dépôt.
    expect(FILES.length).toBeGreaterThan(500)
    expect(TABLES.length).toBeGreaterThan(100)
    // Et elle voit bien PLUSIEURS teintes quelque part, pas des objets vides.
    expect(TABLES.filter(table => table.hues.length >= 2).length).toBeGreaterThan(10)
    // Elle lit les `.ts` autant que les `.tsx` : GA-33, sa voisine, ne regarde
    // que les `.tsx`, et c'est dans un `.ts` (`scoreFactors.ts`) que dormait
    // la plus grosse palette catégorielle du produit.
    expect(FILES.filter(file => file.endsWith('.ts')).length).toBeGreaterThan(100)
  })

  it('la garde sait dire NON — et elle sait aussi dire OUI à un état', () => {
    // Le contrôle négatif : une table indexée par une catégorie est refusée.
    expect(categoricalKey({ name: 'SECTOR_COLORS', keyType: '' })).not.toBeNull()
    expect(categoricalKey({ name: 'PROOF_TYPE_META', keyType: 'ProofType' })).not.toBeNull()
    expect(
      categoricalKey({ name: 'toneClassNames', keyType: "ActionHistoryItem['category'] | 'amber'" }),
    ).not.toBeNull()
    expect(categoricalKey({ name: 'kpiPresentation', keyType: 'CockpitKpiKind' })).not.toBeNull()

    // Le contrôle POSITIF, qui prouve qu'elle ne garde pas trop large : les
    // tables d'ÉTAT du produit doivent passer. Si l'une d'elles se met à
    // échouer, c'est la garde qu'il faut corriger, pas l'écran.
    expect(categoricalKey({ name: 'STATUS_CONFIG', keyType: 'string' })).toBeNull()
    expect(categoricalKey({ name: 'HEALTH_DOT', keyType: 'SourceHealth' })).toBeNull()
    expect(categoricalKey({ name: 'CELL_STYLES', keyType: 'CoverageCellStatus' })).toBeNull()
    expect(categoricalKey({ name: 'BADGE_COLORS', keyType: 'AccountVerdict' })).toBeNull()
    expect(categoricalKey({ name: 'URGENCY_DOT', keyType: 'NeedUrgency' })).toBeNull()
    expect(categoricalKey({ name: 'TONES', keyType: "Exclude<AutoSaveStatus, 'idle'>" })).toBeNull()
    // §26.2 : le rôle de décision est l'exception nommée par la source.
    expect(categoricalKey({ name: 'ROLE_COLORS', keyType: 'DecisionRole' })).toBeNull()
  })

  it('la garde compte des TEINTES, pas des valeurs — une rampe d’intensité reste légale', () => {
    // §26.1 prescrit « une seule teinte, avec l'intensité pour la valeur ».
    // Une garde qui compterait les valeurs interdirait la réponse même que la
    // source donne.
    expect(['bg-amber-500', '--warning-soft-text', '--bellum-warning'].map(hueOf)).toEqual([
      'amber',
      'warning',
      'warning',
    ])
    expect([...new Set(['--bellum-primary-500', '--bellum-primary-200'].map(hueOf))]).toEqual(['primary'])
  })

  it('aucune couleur du produit n’est choisie par une catégorie', () => {
    const offenders = TABLES.filter(table => table.hues.length >= 2)
      .map(table => ({ table, reason: categoricalKey(table) }))
      .filter(entry => entry.reason !== null)
      .map(entry => `${entry.table.file} → ${entry.table.name} (${entry.reason}) : ${entry.table.hues.join(', ')}`)
    // Le message porte la liste ENTIÈRE : vitest tronque la valeur comparée à
    // une quarantaine de caractères, et une garde dont on ne peut pas lire le
    // rouge oblige à réécrire son propre scanner pour savoir quoi corriger.
    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
  })

  it('le rôle « inconnu » n’est jamais coloré — §26.2, « le gris est le plus important »', () => {
    // « Un organigramme où tout est coloré est un organigramme inventé. »
    // La palette de rôles servait `bg-green-200 dark:bg-green-400` à `unknown`,
    // la MÊME entrée que `user` : un rôle deviné se lisait comme un rôle établi.
    //
    // ⚠️ Ce qui est interdit, ce sont les teintes CHROMATIQUES. Le gris est
    // exactement ce que §26.2 demande — une garde qui refuserait `slate`
    // interdirait la règle qu'elle prétend protéger.
    const palette = readFileSync(join(SRC, 'lib/contactRoles.ts'), 'utf8')
    const unknown = /unknown:\s*([A-Z_]+),/.exec(palette)
    expect(unknown, 'ROLE_COLORS doit garder une entrée `unknown`').not.toBeNull()
    const block = new RegExp(`const ${unknown?.[1]}: RoleColors = \\{([^}]*)\\}`).exec(palette)
    expect(block, `la palette ${unknown?.[1]} doit exister`).not.toBeNull()
    const found = (block?.[1] ?? '').match(new RegExp(`(?:bg|text|border)-(?:${HUES})-\\d+`, 'g')) ?? []
    const chromatic = found.filter(cls => !NEUTRAL_HUES.test(cls))
    expect(chromatic, `\n${unknown?.[1]} : ${chromatic.join(', ')}\n`).toEqual([])
    // Et la garde LIT bien ce bloc : sans cette ligne, un renommage de la
    // constante rendrait le test vert sur un fichier qu'il ne trouve plus.
    expect(found.length).toBeGreaterThan(0)
  })
})
