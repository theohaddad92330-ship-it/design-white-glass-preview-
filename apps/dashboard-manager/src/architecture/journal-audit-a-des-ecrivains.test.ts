import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * #1666 — « Un journal unique, TOUTES opérations du manager confondues. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE, ET PAS UNE RELECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le défaut n°1 de ce dépôt est du code juste que personne n'appelle. Une table
 * d'audit, un écran, des rétentions calculées — et zéro ligne dedans, parce que
 * les vingt-sept gestionnaires qui mutent quelque chose n'écrivent rien. Tous
 * les tests seraient verts.
 *
 * Écrire la ligne à la main dans chacun est par ailleurs un défaut de
 * POPULATION : juste sur chaque route qu'on pense à traiter, faux sur celle
 * qu'on oublie — et sur la vingt-huitième, qui s'écrira dans six semaines par
 * quelqu'un qui n'aura pas lu cette issue. C'est le même motif que les 39
 * tableaux sans conteneur défilant, et que les routes sans capacité de #1669
 * (dont cette garde est la sœur, volontairement).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PEUT ET NE PEUT PAS FAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle vérifie qu'un geste MUTANT appelle la porte. Elle ne peut pas juger si la
 * CATÉGORIE choisie est la bonne — ça demanderait de comprendre ce que la route
 * fait, et la catégorie décide de la rétention. Les six gestes qui coûtent le
 * plus cher sont donc épinglés un par un plus bas ; le reste tient à la revue.
 *
 * Elle ne voit pas non plus les chemins de sortie ANTICIPÉS : une validation qui
 * rend 400 avant d'appeler l'API, ou un `catch` qui rend 502, ne journalisent
 * rien aujourd'hui. C'est un trou NOMMÉ, pas un oubli : le refus de rôle, lui,
 * est bien journalisé (`exigerCapacite` écrit `capacite_refusee`, que le
 * journal d'accès miroite dans le journal unique).
 */

const API = fileURLToPath(new URL('../app/api/', import.meta.url))

/**
 * `/api/auth/**` est exempt, et pour une raison qui n'est PAS « c'est la
 * porte » : ces quatre routes écrivent déjà au journal d'ACCÈS
 * (`journaliserAcces`), que l'API MIROITE dans le journal unique
 * (`access-event-audit.ts`). Leur demander d'appeler aussi `journaliserAudit`
 * produirait deux lignes pour une connexion.
 *
 * L'exemption se mesure sur le CHEMIN, qui est le fait, et non sur une liste de
 * fichiers recopiée — une liste ne voit jamais la route qu'on ajoutera demain.
 */
export function ecritDejaParLeJournalDacces(cheminRelatif: string): boolean {
  return cheminRelatif.split(sep)[0] === 'auth'
}

/**
 * Les routes hors `/api/admin/**` et hors `/api/auth/**` : `analyze`, `run`,
 * `launch`, `feedback`. Elles ne mutent RIEN dans le back-office — elles
 * déclenchent une analyse ou ouvrent un ticket dans le produit. Le sujet de
 * #1666 est « les opérations du MANAGER ».
 */
function estUneRouteDuManager(cheminRelatif: string): boolean {
  return cheminRelatif.split(sep)[0] === 'admin'
}

function routes(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) routes(chemin, out)
    else if (entree === 'route.ts') out.push(chemin)
  }
  return out
}

/** Les gestes qui MUTENT. `GET` lit ; il n'a rien à journaliser. */
const VERBES_MUTANTS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/**
 * ⚠️ Le motif est reconstruit à CHAQUE appel, jamais partagé : `RegExp` avec le
 * drapeau `g` garde un `lastIndex`, et un motif réutilisé rendrait un fichier
 * sur deux vert sans rien lire. Piège déjà payé dans ce dépôt.
 */
const TOUS_LES_VERBES = () => /export async function (GET|POST|PATCH|PUT|DELETE)\b/g

export type Gestionnaire = { verbe: string; journalise: boolean; operation: string | null }

/**
 * Découpe un fichier de route en gestionnaires et lit ce que chacun journalise.
 *
 * ⚠️ Le découpage se fait sur TOUS les exports, pas seulement les mutants :
 * sinon le segment d'un POST s'étendrait jusqu'à la fin du fichier en avalant
 * le GET qui le suit, et un `journaliserAudit` écrit dans le voisin ferait
 * passer celui qu'on mesure. C'est le piège exact que
 * `toute-route-declare-sa-capacite.test.ts` documente.
 */
export function gestionnaires(source: string): Gestionnaire[] {
  const bornes = [...source.matchAll(TOUS_LES_VERBES())]
  return bornes
    .map((borne, index) => {
      const debut = borne.index ?? 0
      const fin = bornes[index + 1]?.index ?? source.length
      const segment = source.slice(debut, fin)
      return {
        verbe: borne[1] ?? '?',
        journalise: /journaliserAudit\s*\(/.test(segment),
        operation: /operation:\s*'([^']+)'/.exec(segment)?.[1] ?? null,
      }
    })
    .filter(handler => VERBES_MUTANTS.has(handler.verbe))
}

const FICHIERS = routes(API).map(chemin => ({
  chemin: relative(API, chemin),
  gestionnaires: gestionnaires(readFileSync(chemin, 'utf8')),
}))

/**
 * Les routes dont le VERBE est mutant mais qui ne mutent RIEN — et leur preuve.
 *
 * ⚠️ La prémisse de cette garde est « POST/PATCH/PUT/DELETE sous /api/admin =
 * mutation ». Elle est juste presque toujours, et fausse pour un APERÇU : #1665
 * exige que le récapitulatif des six étapes soit affiché **avant toute
 * écriture**, et il prend un corps (les six étapes), donc il ne peut pas être un
 * GET. C'est le verbe qui ment, pas la route.
 *
 * ⚠️ Et une exception ne se croit pas sur parole : chacune déclare la CIBLE
 * qu'elle appelle, et la garde vérifie que c'est bien celle-là. Le jour où
 * quelqu'un repointe cet aperçu vers le chemin qui ÉCRIT, l'exception ne
 * désigne plus rien et la garde refuse.
 *
 * ⚠️ Ce que cette preuve NE peut pas faire, et il faut le dire : la console ne
 * peut pas prouver que l'API ne mute pas. `adminMutate` est le TRANSPORT (un
 * POST proxifié), pas la sémantique — l'exempter sur ce nom aurait été une
 * lecture fausse, essayée puis abandonnée. Ce qui se vérifie d'ici, c'est la
 * CIBLE ; que `/clients/provision/preview` n'écrive rien est tenu côté API,
 * par le test « l'aperçu est affiché AVANT toute écriture » de #1665.
 */
const APERCUS_SANS_ECRITURE: Record<string, { cible: string; raison: string }> = {
  [join('admin', 'clients', 'provision', 'preview', 'route.ts')]: {
    cible: '/clients/provision/preview',
    raison:
      'aperçu des six étapes du provisionnement (#1665, T2) — il DOIT précéder toute écriture, et il prend un corps, donc il ne peut pas être un GET',
  },
}

const GARDES = FICHIERS.filter(
  fichier =>
    estUneRouteDuManager(fichier.chemin) &&
    !ecritDejaParLeJournalDacces(fichier.chemin) &&
    !(fichier.chemin in APERCUS_SANS_ECRITURE),
)

describe('toute mutation du back-office s’inscrit au journal d’audit (#1666)', () => {
  it('LIT quelque chose — le corpus de routes et de gestions mutants n’est pas vide', () => {
    // Contrôle positif : un `API` faux, un découpage cassé ou un motif qui ne
    // matche plus rendraient zéro gestionnaire, donc zéro manquant, donc une
    // garde verte qui n'a ouvert aucun fichier.
    expect(FICHIERS.length).toBeGreaterThan(25)
    expect(GARDES.flatMap(fichier => fichier.gestionnaires).length).toBeGreaterThan(20)
    expect(FICHIERS.map(fichier => fichier.chemin)).toContain(join('admin', 'users', '[userId]', 'delete', 'route.ts'))
  })

  it('chaque aperçu exempté appelle bien la CIBLE qu’il déclare', () => {
    // Une exception qui se croit sur parole est une porte ouverte. Celle-ci
    // vérifie le FAIT : la route n'appelle pas `adminMutate`, la seule porte
    // d'écriture de la console. Le jour où quelqu'un ajoute une écriture dans un
    // « aperçu », la garde le refuse — et c'est le vrai risque de cette famille.
    expect(Object.keys(APERCUS_SANS_ECRITURE).length).toBeGreaterThan(0)
    for (const [chemin, { cible, raison }] of Object.entries(APERCUS_SANS_ECRITURE)) {
      expect(raison.length, `${chemin} : raison trop courte`).toBeGreaterThan(30)
      const source = readFileSync(join(API, chemin), 'utf8')
      // La CIBLE déclarée doit être celle qu'on appelle, et elle doit être la
      // SEULE : deux cibles dans un aperçu, c'est déjà autre chose qu'un aperçu.
      const cibles = [...source.matchAll(/adminMutate\(\s*'[A-Z]+'\s*,\s*'([^']+)'/g)].map(m => m[1])
      expect(cibles, `${chemin} : l’aperçu n’appelle plus la cible déclarée`).toEqual([cible])
    }
  })

  it('sait dire NON — un gestionnaire mutant sans journal est repéré', () => {
    const sansJournal = 'export async function DELETE(req: NextRequest) {\n  return adminMutate("DELETE", "/x")\n}'
    expect(gestionnaires(sansJournal)).toEqual([{ verbe: 'DELETE', journalise: false, operation: null }])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un GET ne journalise rien', () => {
    // Lire n'est pas muter. Journaliser chaque lecture noierait les gestes qui
    // comptent — et ferait de l'ouverture d'un écran une ligne d'audit.
    const lecture = 'export async function GET(req: NextRequest) {\n  return NextResponse.json(await lire())\n}'
    expect(gestionnaires(lecture)).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas — chaque verbe lit SON propre segment', () => {
    // Le piège exact : un fichier à deux verbes dont un seul journalise. Sans le
    // découpage, l'appel du PATCH couvrirait le DELETE d'à côté.
    const deuxVerbes = [
      'export async function PATCH(req: NextRequest) {',
      "  await journaliserAudit(req, { operation: 'banners.update', category: 'ordinaire' })",
      '  return ok()',
      '}',
      'export async function DELETE(req: NextRequest) {',
      '  return supprimer()',
      '}',
    ].join('\n')
    expect(gestionnaires(deuxVerbes)).toEqual([
      { verbe: 'PATCH', journalise: true, operation: 'banners.update' },
      { verbe: 'DELETE', journalise: false, operation: null },
    ])
  })

  it('les routes d’authentification restent exemptes — mesuré sur le CHEMIN', () => {
    expect(ecritDejaParLeJournalDacces(join('auth', 'login', 'route.ts'))).toBe(true)
    expect(ecritDejaParLeJournalDacces(join('admin', 'users', '[userId]', 'delete', 'route.ts'))).toBe(false)
  })

  it('aucune mutation du back-office n’échappe au journal', () => {
    const muettes = GARDES.flatMap(fichier =>
      fichier.gestionnaires.filter(g => !g.journalise).map(g => `${fichier.chemin} — ${g.verbe}`),
    )
    expect(
      muettes,
      [
        'Un gestionnaire MUTE quelque chose sans l’inscrire au journal d’audit (#1666).',
        'Un journal d’audit auquel il manque une opération ne vaut rien : on ne peut',
        'plus conclure de son silence. Ajouter, juste avant la réponse :',
        '',
        '  await journaliserAudit(req, {',
        "    operation: '<domaine.verbe>',",
        "    category: '<ordinaire|permission|export|suppression|impersonation>',",
        "    subjectType: '<user|workspace|plan|…>',",
        '    subjectId: params.<id>,',
        '    statusCode: status,',
        '  })',
        '',
        '⚠️ La catégorie DÉCIDE de la rétention (24 mois / 36 mois / permanent).',
        '',
        ...muettes,
      ].join('\n'),
    ).toEqual([])
  })

  it('les six gestes les plus coûteux portent LA catégorie qui décide de leur rétention', () => {
    // La garde ne sait pas juger un geste ; ces six-là valent d'être épinglés,
    // parce qu'une erreur de catégorie y coûte la trace elle-même — une
    // suppression rangée en « ordinaire » disparaît au bout de deux ans.
    const attendu: Record<string, { operation: string; category: string }> = {
      [join('admin', 'users', '[userId]', 'delete', 'route.ts')]: {
        operation: 'users.delete',
        category: 'suppression',
      },
      [join('admin', 'users', '[userId]', 'impersonate', 'route.ts')]: {
        operation: 'users.impersonate',
        category: 'impersonation',
      },
      [join('admin', 'users', '[userId]', 'suspend', 'route.ts')]: {
        operation: 'users.suspend',
        category: 'permission',
      },
      [join('admin', 'users', '[userId]', 'plan', 'route.ts')]: { operation: 'users.plan', category: 'permission' },
      [join('admin', 'plans', '[key]', 'route.ts')]: { operation: 'plans.write', category: 'permission' },
      [join('admin', 'workspaces', '[id]', 'members', '[userId]', 'route.ts')]: {
        operation: 'workspaces.member_remove',
        category: 'permission',
      },
    }

    for (const [chemin, cible] of Object.entries(attendu)) {
      const source = readFileSync(join(API, chemin), 'utf8')
      expect(source, `${chemin} : opération manquante`).toContain(`operation: '${cible.operation}'`)
      expect(source, `${chemin} : catégorie manquante`).toContain(`category: '${cible.category}'`)
    }
  })

  it('la tentative de SUPPRIMER une ligne d’audit est elle-même journalisée, et permanente', () => {
    // Le test de l'issue produit une trace : c'est la ligne qu'on ne veut
    // surtout pas voir expirer.
    const source = readFileSync(join(API, 'admin', 'audit', '[id]', 'route.ts'), 'utf8')
    expect(source).toContain("operation: 'audit.delete_attempt'")
    expect(source).toContain("category: 'suppression'")
    expect(source).toContain('status: 405')
  })
})
