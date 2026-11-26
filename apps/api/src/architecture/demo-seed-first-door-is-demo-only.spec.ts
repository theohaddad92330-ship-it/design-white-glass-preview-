import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2295.4bis — décision Louis 18/09/2026 (question 24 des questions en
 * attente, née de la livraison de #2295.4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `contacts.demo_seed_first_door` (migration `1795712710555`) sépare « cette
 * adresse a été VÉRIFIÉE » (`email_verified`, un fait technique sur une vraie
 * adresse) de « ce contact est UTILISABLE EN DÉMONSTRATION » (un fait de
 * SEMIS qui n'affirme RIEN sur une adresse réelle). `classifyGroup()`
 * (`contact-ranking.ts`) accepte désormais le groupe « première porte » sur
 * l'un OU l'autre — voir #2295.4bis dans ce fichier.
 *
 * Un contact d'un espace RÉEL qui porterait `demo_seed_first_door: true`
 * serait présenté comme « première porte » sans qu'aucune vérification ni
 * aucun semis ne le justifie — exactement ce que « jamais de donnée fictive »
 * interdit, et un défaut GRAVE : c'est la promesse même de #2295.4 qui
 * redeviendrait creuse. Le SEUL écrivain légitime de `true` est le jeu de
 * données de démonstration (`demo-dataset.ts`), lu tel quel par
 * `DemoSeedService.demoContactRow` (`demo-seed.service.ts`) — qui ne POSE
 * jamais lui-même `true`, il ne fait que transmettre ce que le jeu de données
 * lui donne (`contact.demo_seed_first_door ?? false`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE VISE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `contact-ranking.ts::classifyGroup` LIT le champ (`row.demo_seed_first_door
 * === true`) — une COMPARAISON, jamais une affectation à `true` — et
 * `contact.entity.ts` / `packages/contracts/src/schemas/contact.ts` le
 * DÉCLARENT sans jamais l'affecter. `demo-seed.service.ts` le TRANSMET
 * (`contact.demo_seed_first_door ?? false`), il ne l'affecte jamais à `true`
 * en dur. Un test témoin ci-dessous le prouve sur le contenu réel de ces
 * fichiers, pour que la garde ne s'attrape pas elle-même.
 */

const SRC = join(__dirname, '..')
/** Le seul fichier autorisé à écrire `demo_seed_first_door: true`. */
const ALLOWED_WRITER = join(SRC, 'modules', 'demo', 'demo-dataset.ts')
const CLASSIFY_GROUP = join(SRC, 'modules', 'contacts', 'contact-ranking.ts')
const DEMO_SEED_SERVICE = join(SRC, 'modules', 'demo', 'demo-seed.service.ts')

/**
 * Affectation à `true`, littérale (objet `: true`) ou par assignation (`=`
 * simple). N'attrape jamais une comparaison (`==`/`===`) : après le premier
 * `=` matché, `\s*true` exige `true` immédiatement — un second ou troisième
 * `=` de `==`/`===` casse ce motif avant `true`, donc aucun match. Un test
 * témoin ci-dessous le prouve.
 */
const ASSIGNS_TRUE = /demo_seed_first_door\s*[:=]\s*true\b/

/** Retire les commentaires AVANT lecture — une garde qui lit ses propres
 *  commentaires (ou une docstring qui la CITE) compare du bruit à du bruit. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

describe('#2295.4bis — demo_seed_first_door ne franchit jamais la frontière de la démo', () => {
  it('lit un corpus non vide, et voit bien le semis de démonstration', () => {
    const files = sourceFiles(SRC)
    expect(files.length).toBeGreaterThan(200)
    expect(files).toContain(ALLOWED_WRITER)
  })

  it('contrôle positif — la garde ATTRAPE une affectation à vrai (le jeu de démonstration ne la pose plus)', () => {
    // Décision Louis 04/10/2026 — « première porte » est VIDE À DESSEIN en
    // démonstration (aucune déclaration inventée sur une personne réelle) : le
    // jeu de données, seul écrivain autorisé, ne pose plus le champ. Le
    // contrôle positif prouve donc que le motif MORD sur un échantillon, et que
    // la garde LIT bien le fichier autorisé.
    expect(ASSIGNS_TRUE.test(stripComments('const c = { demo_seed_first_door: true }'))).toBe(true)
    const source = stripComments(readFileSync(ALLOWED_WRITER, 'utf8'))
    expect(source.length).toBeGreaterThan(0)
    expect(ASSIGNS_TRUE.test(source)).toBe(false)
  })

  it("n'attrape pas ce qu'elle ne vise pas — trois témoins de code légitime", () => {
    // Témoin 1 : `classifyGroup()` LIT le champ (comparaison ===), jamais ne
    // l'affecte à `true`.
    const ranking = stripComments(readFileSync(CLASSIFY_GROUP, 'utf8'))
    expect(ranking.includes('demo_seed_first_door')).toBe(true)
    expect(ASSIGNS_TRUE.test(ranking)).toBe(false)

    // Témoin 2 : `DemoSeedService.demoContactRow` TRANSMET le champ
    // (`contact.demo_seed_first_door ?? false`), il ne l'affecte jamais à
    // `true` en dur.
    const seedService = stripComments(readFileSync(DEMO_SEED_SERVICE, 'utf8'))
    expect(seedService.includes('demo_seed_first_door')).toBe(true)
    expect(ASSIGNS_TRUE.test(seedService)).toBe(false)

    // Témoin 3 : un commentaire qui NOMME le champ (comme celui de cette
    // garde) ne doit pas se faire piéger par sa propre justification une fois
    // copié ailleurs.
    const commentaireSeul = `// ne jamais écrire demo_seed_first_door: true hors du semis`
    expect(ASSIGNS_TRUE.test(stripComments(commentaireSeul))).toBe(false)
  })

  it('SAIT DIRE NON — une affectation fautive hors du semis est détectée, et une simple comparaison ne l’est pas', () => {
    const fautifLitteral = `
      @Injectable()
      export class RogueContactsService {
        async promoteToFirstDoor(id: string) {
          return this.contacts.update({ id }, { demo_seed_first_door: true })
        }
      }
    `
    expect(ASSIGNS_TRUE.test(stripComments(fautifLitteral))).toBe(true)

    const fautifAssignation = `contact.demo_seed_first_door = true`
    expect(ASSIGNS_TRUE.test(stripComments(fautifAssignation))).toBe(true)

    // ⚠️ Sanity check du regex : `===`/`==` ne doivent JAMAIS matcher, sinon
    // la garde ferait rougir `contact-ranking.ts` (témoin 1 ci-dessus).
    const comparaisonStricte = `if (row.demo_seed_first_door === true) return 'first_door'`
    expect(ASSIGNS_TRUE.test(stripComments(comparaisonStricte))).toBe(false)
    const comparaisonLache = `if (row.demo_seed_first_door == true) return 'first_door'`
    expect(ASSIGNS_TRUE.test(stripComments(comparaisonLache))).toBe(false)
  })

  it('AUCUN fichier hors du semis de démonstration n’affecte `demo_seed_first_door` à `true`', () => {
    const offenders = sourceFiles(SRC)
      .filter(file => file !== ALLOWED_WRITER)
      .map(file => ({ file, source: stripComments(readFileSync(file, 'utf8')) }))
      .filter(({ source }) => ASSIGNS_TRUE.test(source))
      .map(({ file }) => file.slice(file.indexOf('/src/') + 1))

    // ⚠️ Si cette liste cesse d'être vide : un contact d'un espace RÉEL peut
    // devenir « première porte » sans email vérifié ni semis — un défaut
    // GRAVE (#2295.4bis). La correction n'ajoute JAMAIS ce fichier à une
    // liste d'exceptions : elle retire l'affectation fautive.
    expect(offenders.sort()).toEqual([])
  })
})
