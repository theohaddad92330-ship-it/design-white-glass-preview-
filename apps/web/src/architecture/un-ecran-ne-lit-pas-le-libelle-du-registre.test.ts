import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { OUR_SUPPLIERS, supplierNamesIn } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * GA-339 — le libellé du registre d'outils ne sort pas de Réglages › Intégrations.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE FAIT MESURÉ — ce que le navigateur reçoit déjà
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /api/tool-registry` rend le catalogue ENTIER — 47 outils au 16/09/2026 —
 * et chaque entrée porte un `display_name`. Parmi ces 47, DOUZE sont NOS
 * fournisseurs : `apollo`, `dropcontact`, `salesql`, `hunter`, `lusha`,
 * `kaspr`, `fullenrich`, `brave`, `serper`, `tavily`, `firecrawl`, `pappers`.
 * Leur `display_name` vaut « Apollo », « Firecrawl », « Pappers » — les noms
 * que la doctrine interdit de prononcer (c19 du registre, décision Louis
 * 13/09/2026 batch 11 : « on nomme ce que l'espace a BRANCHÉ, jamais ce qui
 * NOUS sert »).
 *
 * Ce JSON est déjà dans le navigateur. Il n'y a donc pas de fuite AUJOURD'HUI —
 * il y a une charge amorcée : un `.map(t => t.display_name)` écrit un jour dans
 * un panneau « outils branchés », une infobulle, un état vide, et les douze
 * arrivent à l'écran sans que personne n'ait décidé quoi que ce soit.
 *
 * ⚠️ ET AUCUN CHAMP DU FIL NE DIT « CELUI-LÀ EST À NOUS ». `owner` ne vaut que
 * `'workspace'` ou `'user'` : c'est la PORTÉE de la connexion (espace ou
 * personne), pas son propriétaire. `apollo`, `brave`, `firecrawl` et `pappers`
 * portent tous `owner: WORKSPACE` dans le catalogue de l'API, exactement comme
 * `hubspot` et `gmail`. Un filtre `tools.filter(t => t.owner === 'workspace')`
 * a donc l'air de trier les deux familles et n'en trie aucune — c'est le piège
 * que ce fichier nomme, et le dernier bloc le vérifie sur le catalogue réel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun fichier d'`apps/web/src` ne lit `display_name`, hors Réglages ›
 * Intégrations (`/features/integration-center/`) — l'exception NOMMÉE depuis le
 * 02/08/2026, l'écran où l'utilisateur autorise l'accès et où l'outil qu'il
 * connecte se nomme forcément.
 *
 * La règle porte sur TOUT `apps/web/src`, pas sur les seuls composants : la
 * frontière entre un hook, un adaptateur et un `.tsx` n'est pas une frontière
 * que le navigateur connaît. `useConnectedCapabilities.ts` n'affiche rien et
 * suffirait à faire voyager le libellé jusqu'à une vue.
 *
 * La porte autorisée existe et elle est ailleurs : `connectedClientTools()`
 * (`@bellum/contracts`, `schemas/tool-naming.ts`) filtre par LISTE BLANCHE —
 * `CLIENT_TOOL_BY_PROVIDER.get(tool.provider)` puis `continue` si absent. Le
 * treizième fournisseur ajouté demain sera tu sans qu'on y pense, ce qu'une
 * liste noire n'aurait pas fait. Un écran qui veut nommer un outil branché lit
 * `tool.name` de cette dérivation, jamais `tool.display_name` du fil.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE NE FAIT PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 *   • Elle ne lit pas les fichiers de test. Le schéma EXIGE `display_name` :
 *     une fixture `ConnectedTool` doit l'écrire, sinon elle ment sur la forme
 *     du fil. `useConnectedCapabilities.test.tsx` en pose trois, légitimement.
 *   • Elle ne double pas `tool-naming.test.ts` (contracts), qui prouve que la
 *     dérivation TAIT nos fournisseurs même « connectés », ni GA-44, qui
 *     interdit le nom ÉCRIT EN DUR. Ici c'est le troisième chemin, le seul
 *     qu'aucune des deux ne voit : le nom qui arrive par le RÉSEAU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PREUVES
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Elle sait dire NON. Deux fois. D'abord de bout en bout, à chaque
 *      exécution, sur une arborescence témoin écrite dans un dossier temporaire
 *      (marche + décommentage + détection + liste blanche). Ensuite à la main,
 *      une fois, sur le VRAI code : le 16/09/2026,
 *      `apps/web/src/features/chat/hooks/useConnectedCapabilities.ts` a reçu en
 *      ligne 41 `const _labels = tools.map(t => t.display_name)`. La garde est
 *      passée au rouge et a dit, mot pour mot (replié ici) :
 *
 *        Un fichier hors Réglages › Intégrations lit `display_name` du registre
 *        d'outils :
 *          /features/chat/hooks/useConnectedCapabilities.ts:41 — const _labels
 *          = tools.map(t => t.display_name)
 *
 *      Les HUIT autres tests sont restés verts pendant ce temps — le témoin vise
 *      ce qu'il prétend viser. La ligne a été retirée, la garde est redevenue
 *      verte. Le témoin permanent ci-dessous rejoue le même cas à chaque
 *      exécution, sans toucher au dépôt.
 *      ⚠️ GA-44 n'a rien vu de cette ligne, et c'est normal : aucun nom
 *      d'éditeur n'y est ÉCRIT. C'est bien un troisième chemin.
 *   2. Elle LIT quelque chose. Le corpus compte plus de 1 200 fichiers (1 863
 *      mesurés le 16/09/2026), les consommateurs RÉELS du registre en font
 *      partie et ne sont pas dérogés, et le catalogue de l'API porte bien les
 *      libellés de nos fournisseurs — sans quoi elle protégerait du vide.
 *   3. Elle n'attrape pas ce qu'elle ne vise pas. Réglages › Intégrations passe ;
 *      un commentaire qui cite le champ ne déclenche pas ; un `displayName`
 *      local sans rapport ne déclenche pas ; `user_display_name` non plus. Les
 *      trois voisins RÉELS du dépôt (`crossing-text.ts`, `google/api.ts`,
 *      `CrmDataPanel.tsx`) sont vérifiés verts, pas seulement imaginés.
 */

const WEB_SRC = join(__dirname, '..')

/** Le catalogue que l'API sérialise — la source du `display_name` qui voyage. */
const TOOL_CATALOG = join(__dirname, '../../../../apps/api/src/modules/tool-registry/tool-catalog.ts')

/** Le champ du fil qui porte le nom commercial. C'est le seul de ce nom dans le dépôt. */
const REGISTRY_LABEL_FIELD = 'display_name'

/**
 * Là où lire le libellé est LÉGITIME.
 *
 * ⚠️ Cette liste ne peut que RÉTRÉCIR. Y ajouter un chemin demande de répondre
 * d'abord à « pourquoi cet écran doit-il nommer un outil que l'espace n'a pas
 * branché ? ». Chaque entrée doit exister sur le disque (test plus bas) : une
 * dérogation vers un dossier disparu dérogerait un jour un dossier homonyme.
 */
const ALLOWED_PATHS = [
  '/features/integration-center/', // Réglages › Intégrations — l'exception du 02/08/2026
  '/architecture/', // cette garde et ses voisines, qui citent le champ pour le garder
] as const

/**
 * Sans le drapeau `g` : `RegExp.test()` serait STATEFUL d'un appel à l'autre
 * (`lastIndex` avance, un appel sur deux rend `false`) et cette garde alternerait
 * vert et rouge sur le même corpus. Bornes de lettre, de chiffre, `_` et `$` :
 * `user_display_name` et `display_named` ne sont pas ce champ.
 */
const LABEL_READ = new RegExp(`(?<![\\p{L}\\p{N}_$])${REGISTRY_LABEL_FIELD}(?![\\p{L}\\p{N}_$])`, 'u')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  // Trié : le rapport d'erreur doit être le MÊME d'une machine à l'autre, sinon
  // deux exécutions du même corpus rendent deux listes et on doute de la garde.
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Retire les commentaires — un docblock qui EXPLIQUE la règle la cite, et une
 * garde qui se déclenche sur sa propre documentation est une garde qu'on
 * désactive. Les retours à la ligne sont PRÉSERVÉS : le rapport nomme un
 * fichier ET une ligne, et un numéro faux coûte plus cher que pas de numéro.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function isAllowed(file: string): boolean {
  return ALLOWED_PATHS.some(p => file.includes(p))
}

type Offence = { file: string; line: number; text: string }

/** Les lectures du libellé dans un fichier hors dérogation, avec leur ligne. */
function labelReadsIn(source: string): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = []
  stripComments(source)
    .split('\n')
    .forEach((line, index) => {
      if (LABEL_READ.test(line)) hits.push({ line: index + 1, text: line.trim().slice(0, 120) })
    })
  return hits
}

function offenders(root: string = WEB_SRC): Offence[] {
  return sourceFiles(root)
    .filter(file => !isAllowed(file))
    .flatMap(file => labelReadsIn(readFileSync(file, 'utf8')).map(hit => ({ file: file.slice(root.length), ...hit })))
}

/**
 * Le témoin de bout en bout : une arborescence écrite dans un dossier
 * temporaire, balayée par la MÊME fonction que le vrai corpus. Aucun fichier du
 * dépôt n'est touché, et pourtant la marche, le décommentage, la détection et la
 * liste blanche sont tous exercés.
 */
function scanFixture(files: Readonly<Record<string, string>>): Offence[] {
  const root = mkdtempSync(join(tmpdir(), 'ga339-'))
  try {
    for (const [relative, content] of Object.entries(files)) {
      const full = join(root, relative)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, content, 'utf8')
    }
    return offenders(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

let catalogSource: string | null = null
function toolCatalog(): string {
  if (catalogSource === null) {
    try {
      catalogSource = readFileSync(TOOL_CATALOG, 'utf8')
    } catch {
      throw new Error(
        `Le catalogue d'outils de l'API est introuvable (${TOOL_CATALOG}). Cette garde protège le libellé qu'il ` +
          `sérialise : sans lui, elle serait verte sur du vide. Corrige le chemin, ne supprime pas le test.`,
      )
    }
  }
  return catalogSource
}

/**
 * Le champ `<field>` de l'entrée `<provider>` du catalogue, ou `null`.
 *
 * ⚠️ `(?:(?!provider:)[\s\S])` interdit de franchir l'entrée SUIVANTE : sans
 * cette borne, un outil sans `display_name` emprunterait celui de son voisin et
 * la garde affirmerait une fuite qui n'existe pas. Pas de drapeau `g` : `exec`
 * repart de zéro à chaque appel.
 */
function catalogFieldFor(provider: string, field: string): string | null {
  const entry = new RegExp(`provider: '${provider}'(?:(?!provider:)[\\s\\S]){0,600}?${field}: ([^,\\n]+)`, 'u')
  return entry.exec(toolCatalog())?.[1]?.replace(/^'|'$/g, '') ?? null
}

/** Nos fournisseurs qui figurent au registre d'outils, donc au JSON du navigateur. */
const SUPPLIERS_IN_REGISTRY = OUR_SUPPLIERS.flatMap(supplier =>
  supplier.provider ? [{ name: supplier.name, provider: supplier.provider }] : [],
)

describe('GA-339 — le libellé du registre d’outils ne sort pas de Réglages › Intégrations', () => {
  it('LIT quelque chose — le corpus des écrans n’est pas vide', () => {
    // Un chemin renommé rendrait `sourceFiles` vide et la garde verte sur rien.
    // 1 863 fichiers mesurés le 16/09/2026 ; le plancher laisse de la marge.
    expect(sourceFiles(WEB_SRC).length).toBeGreaterThan(1200)
  })

  it('LIT quelque chose — les consommateurs RÉELS du registre sont dans le corpus, et non dérogés', () => {
    // Si les fichiers qui manipulent le registre n'étaient pas balayés, le vert
    // de cette garde ne dirait rien du tout.
    const files = sourceFiles(WEB_SRC)
    for (const suffix of [
      '/features/chat/hooks/useConnectedCapabilities.ts',
      '/features/chat/view/ToolsSourcesMenu.tsx',
      '/features/onboarding/view/OnboardingWizard.tsx',
    ]) {
      const found = files.find(file => file.endsWith(suffix))
      expect(found, `${suffix} — consommateur du registre introuvable : la garde ne lirait plus rien`).toBeTruthy()
      expect(isAllowed(found ?? ''), suffix).toBe(false)
    }
  })

  it('aucun fichier hors Réglages › Intégrations ne lit le libellé du registre', () => {
    const found = offenders()
    if (found.length > 0) {
      // Nommer le coupable et sa ligne : un `toEqual([])` afficherait
      // « Array(3) », et une garde qu'il faut relire pour comprendre finit
      // désactivée.
      throw new Error(
        `Un fichier hors Réglages › Intégrations lit \`${REGISTRY_LABEL_FIELD}\` du registre d'outils :\n` +
          found.map(o => `  ${o.file}:${o.line} — ${o.text}`).join('\n') +
          `\nCe champ porte le nom commercial des 47 outils du fil, dont les DOUZE qui sont NOS fournisseurs ` +
          `(Apollo, Firecrawl, Pappers…). Ils ne se nomment nulle part (c19, décision Louis 13/09/2026).\n` +
          `Pour nommer un outil que l'espace a BRANCHÉ, lis \`tool.name\` de \`connectedClientTools()\` ` +
          `(@bellum/contracts) : sa liste blanche tait nos fournisseurs par construction.\n` +
          `Et non, \`owner === 'workspace'\` ne les écarte pas : Apollo le porte aussi.`,
      )
    }
    expect(found).toEqual([])
  })

  it('sait dire NON — les trois formes de lecture, de bout en bout', () => {
    // Ce que la garde a effectivement dit le 16/09/2026 quand la ligne a été
    // posée dans le vrai `useConnectedCapabilities.ts` (docblock en tête).
    const found = scanFixture({
      'features/chat/view/ToolsStrip.tsx': [
        'export function ToolsStrip({ tools }: Props) {',
        '  const labels = tools.map(t => t.display_name)',
        '  return <ul>{labels.map(l => <li key={l}>{l}</li>)}</ul>',
        '}',
      ].join('\n'),
      'features/chat/lib/pick.ts': `export const pick = (t: ConnectedTool) => t['display_name']`,
      'features/chat/lib/destructure.ts': 'export const label = ({ display_name }: ConnectedTool) => display_name',
    })
    expect(found.map(o => `${o.file}:${o.line}`)).toEqual([
      '/features/chat/lib/destructure.ts:1',
      '/features/chat/lib/pick.ts:1',
      '/features/chat/view/ToolsStrip.tsx:2',
    ])
    expect(found[2]?.text).toBe('const labels = tools.map(t => t.display_name)')
  })

  it('n’attrape pas ce qu’elle ne vise pas — et le témoin fautif du même lot, lui, est vu', () => {
    // Le fautif prouve que la marche a bien ATTEINT ces dossiers : sans lui, un
    // « zéro coupable » pourrait n'être qu'un dossier jamais ouvert.
    const found = scanFixture({
      // Réglages › Intégrations : l'exception NOMMÉE.
      'features/integration-center/view/Card.tsx': 'export const label = (t: ConnectedTool) => t.display_name',
      // Un commentaire qui cite le champ documente la règle, il ne la viole pas.
      'features/dossier/view/Doc.tsx': [
        '// display_name ne se lit pas ici — voir GA-339',
        '/** Le champ display_name du registre reste à Réglages › Intégrations. */',
        'export const rien = null',
      ].join('\n'),
      // Un `displayName` local, et un champ homonyme d'un autre objet.
      'features/crm/view/Panel.tsx': [
        'const displayName = contact.full_name ?? fallback',
        'const other = row.user_display_name',
        'export const x = { displayName, other }',
      ].join('\n'),
      // Une URL, pour vérifier que le décommentage n'a pas mangé la ligne.
      'features/help/links.ts': `export const doc = 'https://example.test/registry#display-name'`,
      // Le témoin fautif, dans un dossier voisin non dérogé.
      'features/help/leak.ts': 'export const leak = (t: ConnectedTool) => t.display_name',
    })
    expect(found.map(o => `${o.file}:${o.line}`)).toEqual(['/features/help/leak.ts:1'])
  })

  it('n’attrape pas les voisins RÉELS du dépôt — les `displayName` qui existent vraiment', () => {
    // Trois fichiers du produit portent un `displayName` sans rapport avec le
    // registre. Les citer ici, plutôt que de les imaginer, est ce qui distingue
    // un témoin d'une hypothèse.
    const files = sourceFiles(WEB_SRC)
    for (const suffix of [
      '/features/memoire-collective/model/crossing-text.ts',
      '/features/google/api.ts',
      '/features/crm/view/CrmDataPanel.tsx',
    ]) {
      const found = files.find(file => file.endsWith(suffix))
      expect(found, `${suffix} — voisin légitime introuvable : le témoin ne prouverait plus rien`).toBeTruthy()
      const source = readFileSync(found ?? '', 'utf8')
      expect(source, suffix).toMatch(/displayName/)
      expect(labelReadsIn(source), suffix).toEqual([])
    }
  })

  it('la liste des dérogations ne prend pas la poussière — chaque chemin existe', () => {
    for (const path of ALLOWED_PATHS) {
      const directory = join(WEB_SRC, path.replace(/^\/|\/$/g, ''))
      expect(statSync(directory).isDirectory(), path).toBe(true)
    }
  })
})

/**
 * Ce que cette garde protège existe VRAIMENT : le libellé de nos fournisseurs
 * est bien dans le catalogue que l'API sérialise. Sans ce bloc, GA-339 pourrait
 * rester verte des mois après que le champ a changé de nom — en protégeant un
 * champ que plus personne n'envoie.
 */
describe('GA-339 — la charge est réelle : le catalogue porte le nom de nos fournisseurs', () => {
  it('LIT — douze fournisseurs figurent au registre, sous leur nom', () => {
    expect(SUPPLIERS_IN_REGISTRY.length).toBeGreaterThanOrEqual(12)
    const named = SUPPLIERS_IN_REGISTRY.map(s => ({ ...s, label: catalogFieldFor(s.provider, 'display_name') })).filter(
      s => s.label !== null,
    )
    expect(named.length).toBeGreaterThanOrEqual(10)
    expect(named.map(s => s.label)).toEqual(expect.arrayContaining(['Apollo', 'Firecrawl', 'Pappers']))
    // Le libellé du registre EST le nom interdit, pas une paraphrase — vu par le
    // SEUL détecteur du dépôt (`supplierNamesIn`), jamais par une copie locale.
    // C'est ce qui rend une lecture du champ suffisante pour fuiter.
    const detected = named.filter(s => supplierNamesIn(s.label ?? '').length > 0)
    expect(detected.length).toBeGreaterThanOrEqual(10)
  })

  it('`owner` ne sépare PAS les deux familles — le filtre qui semble trier n’en trie aucun', () => {
    // Mesuré le 16/09/2026 : `apollo` et `hubspot` portent la même valeur. Qui
    // filtre sur `owner` croit avoir écarté nos fournisseurs et ne l'a pas fait.
    expect(catalogFieldFor('apollo', 'owner')).toBe('WORKSPACE')
    expect(catalogFieldFor('hubspot', 'owner')).toBe('WORKSPACE')
    expect(catalogFieldFor('apollo', 'owner')).toBe(catalogFieldFor('hubspot', 'owner'))
  })
})
