import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-102 — L'AJOUT MANUEL DE PERSONNES RESTE MONTÉ DANS L'ONGLET ORGANIGRAMME,
 * DANS LES DEUX RENDUS, ET IL REJOINT ENCORE SON ÉCRITURE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE, ET D'OÙ ELLE VIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §2 du PDF-22 ORGGRAPH FINAL (27/08/2026) déclare l'ajout manuel « Présent …
 * à intégrer au nouvel écran plutôt qu'à recréer », et son §13 le range dans
 * « ce qui n'est PAS un ticket neuf ». Plusieurs agents d'implémentation vont
 * lire ces deux phrases et NE PAS recoder la capacité — ce qui est juste, à une
 * condition : qu'elle survive à la refonte de l'écran qui la porte.
 *
 * Or l'onglet Organigramme a DEUX rendus depuis le 29/08 — la vue focale (le
 * défaut, quand le dossier porte un graphe) et le rendu historique / vue système
 * — et la vue focale est justement celle que le chantier réécrit. Un panneau
 * monté dans un seul des deux disparaît pour la moitié des dossiers sans que
 * rien ne casse : c'est le mode d'échec silencieux du dépôt.
 *
 * ⚠️ Le §2 affirme que `DeclareOrgPanel` EXISTE. Il n'affirme nulle part qu'il
 * est MONTÉ, ni que son bouton rejoint une écriture. Cette garde tient les deux
 * moitiés que l'affirmation d'existence laisse ouvertes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PEUT PAS VÉRIFIER, ET POURQUOI ELLE NE FAIT PAS SEMBLANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne rend rien : elle ne sait pas si le panneau est visible à l'écran, ni
 * s'il est sous un pli. Ce qu'elle sait dire est exact — il est monté dans les
 * deux branches, ou il ne l'est pas ; et la chaîne composant → hook → client →
 * route existe, ou elle est coupée. `TabOrganigramme.test.tsx` fait le rendu.
 *
 * ⚠️ Les COMMENTAIRES sont retirés avant lecture. `TabOrganigramme.tsx` cite
 * `DeclareOrgPanel` dans DEUX commentaires JSX (« #1103 … »), et ce fichier-ci
 * le cite une dizaine de fois. Une garde qui compte une citation compte un
 * montage qui n'existe pas — la garde borgne, retournée.
 */

const WEB_SRC = join(__dirname, '..')
const API_SRC = join(WEB_SRC, '..', '..', 'api', 'src')

const TAB = join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'TabOrganigramme.tsx')
const PANEL = join(
  WEB_SRC,
  'features',
  'accounts',
  'view',
  'account-detail',
  'tabs',
  'organigramme',
  'declare',
  'DeclareOrgPanel.tsx',
)
const HOOK = join(WEB_SRC, 'features', 'accounts', 'hooks', 'useDeclareOrgPeople.ts')
const CLIENT = join(WEB_SRC, 'features', 'accounts', 'api.ts')
const TABS_BAR = join(
  WEB_SRC,
  'features',
  'accounts',
  'view',
  'account-detail',
  'components',
  'AccountDetailTabsBar.tsx',
)
const TAB_CONTENT = join(
  WEB_SRC,
  'features',
  'accounts',
  'view',
  'account-detail',
  'components',
  'AccountDetailTabContent.tsx',
)
const CONTROLLER = join(API_SRC, 'modules', 'analysis', 'analysis.controller.ts')

/** ⚠️ Un commentaire cite ; il ne monte pas un composant. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function code(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

/**
 * Le corps de l'onglet, coupé en ses DEUX rendus.
 *
 * La vue focale est un `return` ANTICIPÉ : tout ce qui la compose vit entre
 * `<FocalOrgView` et le `return (` suivant, qui ouvre le rendu historique. Le
 * découpage est fait sur le code SANS commentaires — sinon un docblock placé
 * entre les deux déplacerait la frontière.
 *
 * On coupe sur `<FocalOrgView` et non sur la condition `orgGraphViews &&
 * !systemView` : c'est le composant qui est le repère stable, la condition peut
 * être réécrite (mémorisée, extraite) sans que la structure change.
 */
function branches(): { focal: string; fallback: string } {
  const source = code(TAB)
  const focalStart = source.indexOf('<FocalOrgView')
  expect(focalStart, 'la vue focale doit être montée dans l’onglet').toBeGreaterThan(-1)
  const fallbackStart = source.indexOf('return (', focalStart)
  expect(fallbackStart, 'l’onglet doit garder son second rendu (vue système / historique)').toBeGreaterThan(focalStart)
  return { focal: source.slice(focalStart, fallbackStart), fallback: source.slice(fallbackStart) }
}

/** `<DeclareOrgPanel` suivi d'un séparateur : `<DeclareOrgPanelAutreChose` ne
 *  compte pas. Le défaut a déjà été trouvé une fois dans ce dépôt (GA-82). */
const MOUNT = /<DeclareOrgPanel[\s/>]/g

function directMounts(segment: string): number {
  // ⚠️ `RegExp.test()` avec le drapeau `g` est STATEFUL — six gardes borgnes en
  // deux jours, dont une par ce piège exact. On passe par `match`, sans état.
  return (segment.match(MOUNT) ?? []).length
}

/**
 * LE MONTAGE, À TRAVERS UN BLOC PARTAGÉ — un niveau d'indirection, pas deux.
 *
 * ⚠️ Ajouté le 31/08/2026, et il faut savoir pourquoi. L'onglet a gagné trois
 * vues commutables ; le pied commun (historique des corrections + panneau de
 * déclaration) a donc été extrait dans un `const belowEveryView = (…)` monté par
 * chaque rendu. Cette garde, qui lisait `<DeclareOrgPanel` LITTÉRALEMENT dans
 * chaque branche, est passée au rouge — sur du code où le panneau est en
 * réalité monté PARTOUT, y compris dans les trois vues neuves.
 *
 * Deux façons de la faire repasser au vert, et une seule est honnête :
 *   · recopier le montage dans chaque branche — la garde redevient verte, et
 *     le dépôt gagne cinq copies du même bloc, donc cinq occasions de diverger ;
 *   · SUIVRE l'indirection — ce que fait cette fonction. La règle protégée est
 *     « le panneau est monté dans les deux rendus », pas « la chaîne
 *     `<DeclareOrgPanel` apparaît deux fois dans ce fichier ».
 *
 * Elle ne résout QU'UN niveau, et c'est délibéré : `{x}` où `const x = (…)`
 * contient le montage. Une résolution récursive finirait par déclarer « monté »
 * n'importe quel identifiant du fichier, et la garde ne saurait plus dire non.
 */
function mountsVia(segment: string, source: string): number {
  const referenced = [...segment.matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*\}/g)].map(match => match[1] as string)
  let found = 0
  for (const name of new Set(referenced)) {
    const declaration = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\(([\\s\\S]*?)\\n\\s*\\)\\n`))
    if (declaration && directMounts(declaration[1] as string) > 0) found += 1
  }
  return found
}

function mounts(segment: string, source: string = code(TAB)): number {
  return directMounts(segment) + mountsVia(segment, source)
}

describe('GA-102 — l’ajout manuel de personnes reste monté dans l’onglet Organigramme', () => {
  it('LIT quelque chose — les sept fichiers de la chaîne existent et ne sont pas vides', () => {
    // Sans cette assertion, un chemin faux rendrait la garde verte sur zéro
    // octet : le faux zéro silencieux, la cause racine la plus chère du dépôt.
    for (const file of [TAB, PANEL, HOOK, CLIENT, TABS_BAR, TAB_CONTENT, CONTROLLER]) {
      expect(existsSync(file), `fichier introuvable : ${file}`).toBe(true)
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(500)
    }
    // Et le corpus DÉCOUPÉ n'est pas vide non plus : deux segments non triviaux.
    const { focal, fallback } = branches()
    expect(focal.length).toBeGreaterThan(100)
    expect(fallback.length).toBeGreaterThan(100)
  })

  it('il est monté dans la vue FOCALE — l’écran d’arrivée du chantier', () => {
    expect(mounts(branches().focal)).toBeGreaterThan(0)
  })

  it('il est monté dans le second rendu — un dossier sans graphe le garde', () => {
    expect(mounts(branches().fallback)).toBeGreaterThan(0)
  })

  /**
   * LE RÉSOLVEUR SAIT DIRE NON.
   *
   * Sans ces trois cas, l'ajout du 31/08 aurait pu rendre la garde AVEUGLE :
   * un résolveur trop permissif compterait « monté » sur n'importe quel
   * identifiant, et GA-102 passerait au vert sur un onglet qui a perdu son
   * panneau. C'est exactement le motif « garde borgne » du dépôt.
   */
  it('le résolveur d’indirection ne compte pas n’importe quoi', () => {
    const absent = `const footer = (\n  <><OrgCorrectionsHistory /></>\n)\nreturn (<div>{footer}</div>)\n`
    expect(mounts('<div>{footer}</div>', absent)).toBe(0)

    const present = `const footer = (\n  <><DeclareOrgPanel accountId={id} /></>\n)\nreturn (<div>{footer}</div>)\n`
    expect(mounts('<div>{footer}</div>', present)).toBe(1)

    // Un identifiant qui n'est déclaré NULLE PART ne monte rien.
    expect(mounts('<div>{inconnu}</div>', present)).toBe(0)
    // Et un montage DIRECT reste compté, indirection ou pas.
    expect(mounts('<DeclareOrgPanel accountId={id} />', '')).toBe(1)
  })

  /**
   * Monté ne suffit pas : un panneau qui n'appelle plus rien est un formulaire
   * décoratif. La chaîne est vérifiée maillon par maillon jusqu'à la route
   * SERVEUR — c'est précisément ce qu'une lecture statique de l'existence d'un
   * fichier ne dit pas, et ce que le §2 du FINAL a laissé ouvert.
   */
  it('et il rejoint encore son ÉCRITURE — composant → hook → client → route', () => {
    expect(code(PANEL)).toMatch(/useDeclareOrgPeople\s*\(/)
    expect(code(HOOK)).toMatch(/accountsApi\.declareOrgPeople\s*\(/)
    expect(code(CLIENT)).toContain('/org-people')
    expect(code(CONTROLLER)).toMatch(/@Post\(\s*['"]:accountId\/org-people['"]\s*\)/)
  })

  /**
   * Et l'onglet lui-même s'atteint EN CLIQUANT. Une route qui répond à une URL
   * tapée n'est pas une fonctionnalité livrée : `/actions/sequences` est resté
   * orphelin des mois, testé et invisible.
   */
  it('l’onglet Organigramme est dans la barre d’onglets, et il rend bien ce contenu', () => {
    expect(code(TABS_BAR)).toContain("'organigramme'")
    // ⚠️ #2115 (D8, 14/09/2026) — le MÉCANISME de rendu a changé, pas la règle.
    // Le dossier rend désormais une SECTION entière (ses sous-parties empilées)
    // et non l'onglet actif seul : `activeTab === 'organigramme' && …` a laissé
    // la place à un `case` de l'aiguillage par sous-partie. Ce que cette garde
    // exige n'a pas bougé d'un mot — l'organigramme est nommé dans la barre, et
    // quelque chose rend `TabOrganigramme`.
    expect(code(TAB_CONTENT)).toMatch(/case 'organigramme':/)
    expect(code(TAB_CONTENT)).toMatch(/<TabOrganigramme[\s/>]/)
  })
})
