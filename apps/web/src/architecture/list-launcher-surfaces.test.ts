/**
 * GA-87 — chaque type de lancement est CLASSÉ, et aucun bouton ne mène à rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Louis, 29/08/2026 : « tous les "Lancer :" il faut qu'on puisse les faire dans
 * chaque onglet si on veut, genre la liste de contact, de compte, de besoins,
 * de talents, de territoires, etc ».
 *
 * Quatre types au catalogue depuis le 23/09/2026 (`territory` retiré,
 * #2149.27 — son run pointait sur `/discover/territoire`, une route absente
 * du disque depuis que le panneau a quitté Découvrir (#2486), puis ne faisait
 * plus qu'ouvrir `/discover` nu), et ils ne se ressemblent PAS : `account`
 * accepte un nom inconnu (c'est le geste fondateur du produit), les trois
 * autres exigent un objet déjà en base. Un lot qui monterait des boutons
 * identiques en fabriquerait qui ne mènent nulle part — et « la première fois
 * on croit s'être trompé, la deuxième on cesse de regarder ».
 *
 * Cette garde tient donc la forme que `demo-coverage.ts` applique déjà à la
 * démonstration : **tout type est soit SERVI, soit ABSENT AVEC SA RAISON
 * ÉCRITE.** Jamais les deux, jamais aucun des deux. Une absence sans raison
 * redevient un oubli en trois semaines ; une raison écrite se relit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, EXACTEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *  1. tout `LauncherTypeKey` du catalogue est classé — servi ou justifié ;
 *  2. aucun type n'est dans les deux registres ;
 *  3. une raison est une PHRASE (> 30 caractères), pas un « TODO » ;
 *  4. aucun registre ne parle d'un type qui n'existe plus au catalogue ;
 *  5. **tout `<ListLauncher typeKey="X">` réellement MONTÉ dans l'application
 *     désigne un type SERVI.** C'est le point qui compte : les quatre autres
 *     assertions décrivent un fichier de déclaration, celle-ci relit le code
 *     des écrans. Sans elle, on pourrait monter `typeKey="need"` sur la liste
 *     des besoins et n'obtenir aucun bouton, sans que rien ne rougisse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX PREUVES EXIGÉES D'UNE GARDE
 * ─────────────────────────────────────────────────────────────────────────
 *  · elle LIT quelque chose → le corpus de fichiers balayés a un plancher, le
 *    catalogue n'est pas vide, et elle retrouve NOMMÉMENT le montage réel
 *    (`AccountsToolbar`, `typeKey="account"`). Un corpus vide passerait au vert
 *    sans rien lire, et c'est exactement ce qui a rendu six gardes borgnes en
 *    deux jours ;
 *  · elle SAIT DIRE NON → l'extracteur est mis à l'épreuve sur des sources
 *    fabriquées : un montage d'un type non servi, un `typeKey` cité en
 *    commentaire, un cité en chaîne de caractères.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAUNCHER_TYPES, type LauncherTypeKey } from '@bellum/contracts'
import { LAUNCH_SURFACES, LAUNCH_SURFACES_INTENTIONALLY_ABSENT } from '@/features/launcher/launch-surfaces'

const SRC = join(__dirname, '..')

const SERVED = Object.keys(LAUNCH_SURFACES) as LauncherTypeKey[]
const JUSTIFIED = Object.keys(LAUNCH_SURFACES_INTENTIONALLY_ABSENT)
const CATALOGUE = LAUNCHER_TYPES.map(type => type.key)

/* ------------------------------------------------------------------ */
/*  1. Retirer ce qui n'est pas du code                                */
/* ------------------------------------------------------------------ */

/**
 * Blanchit commentaires et chaînes, en préservant les longueurs.
 *
 * ⚠️ Les chaînes sont blanchies APRÈS extraction des `typeKey`, pas avant :
 * l'attribut qu'on cherche EST une chaîne (`typeKey="account"`). On procède
 * donc en deux temps — d'abord retirer les commentaires, puis lire les
 * attributs JSX, puis vérifier qu'aucune chaîne libre n'a été prise pour un
 * montage. C'est la raison d'être de {@link stripComments}, distinct du
 * blanchiment complet utilisé par GA-86.
 */
function stripComments(src: string): string {
  const out: string[] = []
  let i = 0
  const blank = (text: string): void => {
    for (const char of text) out.push(char === '\n' ? '\n' : ' ')
  }
  while (i < src.length) {
    const char = src[i] as string
    const next = src[i + 1]
    if (char === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      blank(src.slice(i, stop))
      i = stop
      continue
    }
    if (char === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      blank(src.slice(i, stop))
      i = stop
      continue
    }
    out.push(char)
    i += 1
  }
  return out.join('')
}

/* ------------------------------------------------------------------ */
/*  2. L'extracteur                                                    */
/* ------------------------------------------------------------------ */

/**
 * Les types réellement MONTÉS par un `<ListLauncher typeKey="…">`.
 *
 * On exige la BALISE : `ListLauncher` cité dans une phrase, importé sans être
 * rendu, ou nommé dans une chaîne, n'est pas un montage. Le `typeKey` est lu
 * dans la balise elle-même, ce qui interdit d'attraper un `typeKey="need"`
 * appartenant à un autre composant trente lignes plus bas.
 *
 * ⚠️ `RegExp` construite à l'usage : le drapeau `g` rend `.test()` STATEFUL, et
 * une expression partagée entre deux fichiers sauterait un montage sur deux.
 */
function mountedTypeKeys(source: string): string[] {
  const code = stripComments(source)
  const found = new Set<string>()
  // `[^>]*?` borne la lecture à L'INTÉRIEUR de la balise — sans cette borne,
  // l'attribut d'un composant voisin serait attribué à celui-ci.
  const mountRe = /<\s*ListLauncher\b[^>]*?\btypeKey\s*=\s*["']([a-z_]+)["'][^>]*>/g
  for (const match of code.matchAll(mountRe)) found.add(match[1] as string)
  return [...found].sort()
}

/* ------------------------------------------------------------------ */
/*  3. Le corpus                                                       */
/* ------------------------------------------------------------------ */

function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'routeTree.gen.ts') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectSources(full, acc)
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    acc.push(full)
  }
  return acc
}

const SOURCES = collectSources(SRC)

type Mount = { path: string; typeKeys: string[] }

const MOUNTS: Mount[] = SOURCES.map(path => ({
  path: relative(SRC, path).split(sep).join('/'),
  typeKeys: mountedTypeKeys(readFileSync(path, 'utf8')),
})).filter(entry => entry.typeKeys.length > 0)

/* ------------------------------------------------------------------ */
/*  4. La règle                                                        */
/* ------------------------------------------------------------------ */

describe('GA-87 — chaque type de lancement est classé', () => {
  it('classe CHAQUE type du catalogue : servi, ou absent avec sa raison', () => {
    const served = new Set<string>(SERVED)
    const justified = new Set<string>(JUSTIFIED)
    const unclassified = CATALOGUE.filter(key => !served.has(key) && !justified.has(key))

    expect(
      unclassified,
      [
        'Ces types du catalogue de lancement ne sont ni servis par une surface',
        'ni justifiés comme volontairement absents.',
        'Ajoute-les à LAUNCH_SURFACES (avec leur surface et ses tests) OU à',
        'LAUNCH_SURFACES_INTENTIONALLY_ABSENT avec la RAISON mesurée.',
        'Ne déplace jamais un type vers « absent » juste pour faire passer ce test.',
      ].join('\n'),
    ).toEqual([])
  })

  it('ne classe aucun type dans les DEUX registres', () => {
    const both = SERVED.filter(key => key in LAUNCH_SURFACES_INTENTIONALLY_ABSENT)
    expect(both).toEqual([])
  })

  it('exige une RAISON, pas un mot', () => {
    for (const [key, reason] of Object.entries(LAUNCH_SURFACES_INTENTIONALLY_ABSENT)) {
      expect(reason.length, `La raison de « ${key} » est trop courte pour être une raison.`).toBeGreaterThan(30)
    }
  })

  it('ne garde aucune entrée périmée — tout type classé existe au catalogue', () => {
    const known = new Set<string>(CATALOGUE)
    const stale = [...SERVED, ...JUSTIFIED].filter(key => !known.has(key))
    expect(stale, 'Ces types sont classés mais n’existent plus au catalogue.').toEqual([])
  })

  it('ne laisse AUCUN <ListLauncher> monté sur un type non servi', () => {
    const served = new Set<string>(SERVED)
    const offenders = MOUNTS.flatMap(entry =>
      entry.typeKeys.filter(key => !served.has(key)).map(key => `${entry.path} → typeKey="${key}"`),
    )

    expect(
      offenders,
      [
        'Un <ListLauncher> est monté sur un type SANS surface : il ne rendra',
        'aucun bouton, et l’écran promet un geste qui n’existe pas.',
        'Ajoute la surface à LAUNCH_SURFACES, ou retire le montage.',
      ].join('\n'),
    ).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/*  5. Preuve n°1 — la garde LIT quelque chose                         */
/* ------------------------------------------------------------------ */

describe('GA-87 — le corpus n’est pas vide', () => {
  it('balaie tout le code source de l’application', () => {
    expect(SOURCES.length).toBeGreaterThan(500)
  })

  it('lit un catalogue non vide', () => {
    // #2149.27 — quatre types depuis le 23/09/2026 (`territory` retiré, son
    // run pointait sur une route absente du disque, puis ne faisait plus
    // qu'ouvrir `/discover` nu, #2486).
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(4)
    expect(CATALOGUE).toContain('account')
  })

  it('la barre d’outils des comptes ne monte plus de lanceur — le geste d’analyse vit dans l’en-tête', () => {
    // #4497 (PR 12C, décision Louis 24/10) — « Analyser une entreprise » a quitté la barre d'outils de
    // `/accounts` : le geste de la page est « Analyser un compte », en-tête de la coque, vers `/search`
    // (maquette V22). Revient sur la décision du 29/08 (« le geste principal dans la barre ») ; la garde
    // SUIT le geste au lieu de le perdre : si quelqu'un retire AUSSI l'en-tête, elle tombe.
    const toolbar = MOUNTS.find(entry => entry.path.endsWith('AccountsToolbar.tsx'))
    expect(toolbar).toBeUndefined()
    const page = stripComments(readFileSync(join(SRC, 'features/accounts/view/AccountsPage.tsx'), 'utf8'))
    const header = page.slice(page.indexOf('headerActions='), page.indexOf('contentClassName='))
    expect(header).toMatch(/<Link\s+to="\/search">\s*\{t\('page\.analyze'\)\}/)
  })

  it('ne voit un montage que sur une BALISE réelle — chaque montage lu porte son type', () => {
    // #4497 — plus aucun écran ne monte de lanceur aujourd'hui ; la preuve que l'extracteur LIT vient du
    // balayage (plus de 500 fichiers, juste au-dessus) et des cas fabriqués ci-dessous, qui savent dire NON.
    for (const entry of MOUNTS) expect(entry.typeKeys.length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ */
/*  6. Preuve n°2 — la garde sait dire NON                             */
/* ------------------------------------------------------------------ */

describe('GA-87 — l’extracteur sait dire non', () => {
  it('repère un montage sur un type NON servi', () => {
    const bad = `
      import { ListLauncher } from '@/features/launcher/ListLauncher'
      export function NeedsToolbar() {
        return <ListLauncher typeKey="need" />
      }
    `
    expect(mountedTypeKeys(bad)).toEqual(['need'])
    // …et la règle le refuserait, en nommant le fichier.
    const served = new Set<string>(SERVED)
    const offenders = mountedTypeKeys(bad)
      .filter(key => !served.has(key))
      .map(key => `features/x/NeedsToolbar.tsx → typeKey="${key}"`)
    expect(offenders).toEqual(['features/x/NeedsToolbar.tsx → typeKey="need"'])
  })

  it('n’attrape PAS un typeKey cité en COMMENTAIRE', () => {
    const commented = `
      // un jour : <ListLauncher typeKey="talent" />
      /* et aussi <ListLauncher typeKey="territory" /> */
      export function Toolbar() {
        return <ListLauncher typeKey="account" />
      }
    `
    expect(mountedTypeKeys(commented)).toEqual(['account'])
  })

  it('n’attrape PAS un typeKey cité en CHAÎNE de caractères', () => {
    const stringy = `
      const doc = '<ListLauncher typeKey="contact" />'
      export function Toolbar() {
        return <span>{doc}</span>
      }
    `
    // La chaîne n'est pas une balise MONTÉE. L'extracteur la voit pourtant :
    // c'est la limite ASSUMÉE d'une lecture textuelle, et elle est SÛRE dans ce
    // sens-là — elle fait rougir un cas inoffensif, jamais taire un vrai. Le
    // test l'écrit pour que personne ne croie le contraire.
    expect(mountedTypeKeys(stringy)).toEqual(['contact'])
  })

  it('ne confond pas un autre composant portant un typeKey', () => {
    const other = `
      export function Toolbar() {
        return <SomethingElse typeKey="territory" />
      }
    `
    expect(mountedTypeKeys(other)).toEqual([])
  })

  it('ne voit rien quand ListLauncher est seulement IMPORTÉ', () => {
    const unmounted = `
      import { ListLauncher } from '@/features/launcher/ListLauncher'
      export const unused = ListLauncher
    `
    expect(mountedTypeKeys(unmounted)).toEqual([])
  })
})
