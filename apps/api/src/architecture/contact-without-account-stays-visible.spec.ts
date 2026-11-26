import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1473 — un contact SANS entreprise reste VISIBLE partout où il doit l'être.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET POURQUOI C'EST LE POINT QUI CASSE EN SILENCE
 * ─────────────────────────────────────────────────────────────────────────────
 * `contacts.account_id` est nullable depuis la migration
 * `1791601447382-ContactWithoutAccount` : le commercial qui rencontre quelqu'un
 * en salon peut enfin le saisir sans lui inventer une société.
 *
 * Mais quatre lectures joignaient `accounts` en INNER JOIN. Un INNER JOIN sur
 * une colonne nullable n'échoue pas, ne journalise rien, ne lève aucune
 * exception : il RETIRE la ligne. Concrètement, avant ce chantier :
 *
 *  - la LISTE `/contacts` n'aurait jamais montré la fiche qu'on vient de créer —
 *    le commercial aurait conclu que sa saisie a été perdue ;
 *  - une TÂCHE visant ce contact aurait rendu « Contact introuvable » (404) ;
 *  - l'index de dédoublonnage d'IMPORT ne l'aurait pas vu, donc l'import suivant
 *    aurait recréé la même personne — le doublon qu'on retrouve six mois plus
 *    tard sans savoir lequel est à jour ;
 *  - ses e-mails et appels ne se seraient rattachés à RIEN : historique vide
 *    alors que la trace existe.
 *
 * Aucun de ces quatre défauts ne produit d'erreur. C'est exactement pourquoi ils
 * ont besoin d'une garde plutôt que d'un test de comportement : un test qui
 * n'existe pas ne remarque pas une ligne absente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle n'interdit pas l'INNER JOIN entre `contacts` et `accounts`. Trois
 * lectures le gardent délibérément — elles répondent à une question qui n'a de
 * sens QUE pour un contact rattaché (ancrer un fil de messagerie à un compte,
 * compter les contacts des entités d'un compte donné, détecter un changement
 * d'employeur en comparant au nom du compte). Une garde qui les interdirait
 * inventerait une règle que personne n'a posée. Elle vérifie les QUATRE
 * lectures nommées ci-dessus, celles dont l'INNER JOIN retire une ligne d'une
 * liste que quelqu'un regarde.
 *
 * ⚠️ Elle lit du SOURCE, pas une base : elle prouve que la requête est écrite en
 * LEFT JOIN et que sa portée d'espace ne repose pas sur le seul compte. Elle ne
 * remplace pas la recette live.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (rejouée à l'écriture)
 * ─────────────────────────────────────────────────────────────────────────────
 * · Code protégé : remis `.innerJoin('accounts', 'account', …)` dans
 *   `contacts.service.ts` → ROUGE en nommant la liste.
 * · Corpus : pointé `SOURCES` sur un fichier vide → ROUGE sur « la garde LIT
 *   ses quatre sources », avant toute autre assertion.
 */

const MODULES = join(__dirname, '..', 'modules')

type Reading = {
  /** Ce que l'utilisateur PERD si la jointure redevient INNER. */
  what: string
  file: string
  /** La jointure telle qu'elle doit être écrite. */
  leftJoin: string
  /** La même, repassée en INNER — ce que la garde doit refuser. */
  innerJoin: string
  /**
   * La preuve que la PORTÉE d'espace ne repose pas sur le seul compte.
   *
   * Un LEFT JOIN ne suffit pas : `WHERE a.workspace_id = $1` rejette la ligne
   * dont `a` est NULL tout aussi silencieusement. Il faut soit scoper sur le
   * CONTACT, soit tolérer explicitement l'absence de compte.
   */
  scope: string
}

/**
 * Les quatre lectures dont l'INNER JOIN ferait DISPARAÎTRE un contact.
 *
 * Chacune est nommée par ce qu'elle COÛTE et non par sa fonction : le jour où
 * quelqu'un lit cette garde, c'est la conséquence qu'il doit comprendre.
 */
const READINGS: Reading[] = [
  {
    what: 'la liste /contacts — le contact qu’on vient de créer',
    file: join(MODULES, 'contacts', 'contacts.service.ts'),
    leftJoin: ".leftJoin('accounts', 'account', 'account.id = contact.account_id')",
    innerJoin: ".innerJoin('accounts', 'account', 'account.id = contact.account_id')",
    scope: "applyWorkspaceScope(qb, 'contact', workspaceId)",
  },
  {
    what: 'la cible d’une tâche — sinon « Contact introuvable »',
    file: join(MODULES, 'tasks', 'tasks.service.ts'),
    leftJoin: 'FROM contacts c LEFT JOIN accounts a ON a.id = c.account_id',
    innerJoin: 'FROM contacts c JOIN accounts a ON a.id = c.account_id',
    scope: 'c.account_id IS NULL AND c.workspace_id = $2',
  },
  {
    what: 'l’index de dédoublonnage d’import — sinon un doublon à chaque import',
    file: join(MODULES, 'crm', 'crm-import.service.ts'),
    leftJoin: 'LEFT JOIN accounts a ON a.id = c.account_id',
    innerJoin: 'JOIN accounts a ON a.id = c.account_id',
    scope: 'c.account_id IS NULL AND c.workspace_id = $1',
  },
  {
    what: 'le rattachement des activités — sinon un historique vide',
    file: join(MODULES, 'activities', 'activity-capture.service.ts'),
    leftJoin: 'LEFT JOIN accounts a ON a.id = c.account_id',
    innerJoin: 'JOIN accounts a ON a.id = c.account_id',
    scope: 'c.account_id IS NULL AND c.workspace_id = $1',
  },
]

/**
 * La jointure est-elle écrite en LEFT dans ce source ?
 *
 * ⚠️ `leftJoin` contient `Join`, et `LEFT JOIN accounts` contient
 * `JOIN accounts` : chercher la forme INNER par simple inclusion attraperait
 * la forme LEFT. On RETIRE donc les occurrences LEFT avant de chercher l'INNER
 * — c'est la différence entre une garde et une garde trop gourmande.
 */
function joinIsLeft(source: string, reading: Reading): boolean {
  if (!source.includes(reading.leftJoin)) return false
  const withoutLeft = source.split(reading.leftJoin).join('«LEFT»')
  return !withoutLeft.includes(reading.innerJoin)
}

describe('#1473 — un contact sans entreprise ne disparaît d’aucune lecture', () => {
  const sources = READINGS.map(reading => ({ reading, source: readFileSync(reading.file, 'utf8') }))

  // Une garde qui ne lit rien est verte sur du vide. Ce test-ci passe AVANT.
  it('LIT ses quatre sources, et y trouve la jointure qu’elle surveille', () => {
    expect(sources).toHaveLength(4)
    for (const { reading, source } of sources) {
      expect(source.length).toBeGreaterThan(500)
      // La jointure existe, sous UNE forme ou l'autre — sinon l'ancre a bougé et
      // la garde surveillerait un fichier qui ne la contient plus.
      expect(source.includes(reading.leftJoin) || source.includes(reading.innerJoin)).toBe(true)
    }
  })

  it.each(sources.map(s => [s.reading.what, s] as const))('%s — la jointure est un LEFT JOIN', (_what, entry) => {
    expect(joinIsLeft(entry.source, entry.reading)).toBe(true)
  })

  it.each(sources.map(s => [s.reading.what, s] as const))(
    '%s — la portée d’espace ne repose pas sur le seul compte',
    (_what, entry) => {
      expect(entry.source).toContain(entry.reading.scope)
    },
  )

  // La preuve qu'elle sait dire NON, jouée sur une version MUTÉE du vrai source
  // — pas sur une chaîne fabriquée pour l'occasion.
  it.each(sources.map(s => [s.reading.what, s] as const))(
    '%s — sait dire NON : la même lecture repassée en INNER JOIN est refusée',
    (_what, entry) => {
      const mutated = entry.source.split(entry.reading.leftJoin).join(entry.reading.innerJoin)
      expect(joinIsLeft(mutated, entry.reading)).toBe(false)
    },
  )

  // Et le SECOND défaut, celui qu'un LEFT JOIN seul laisse passer : la portée
  // reposée sur le compte. Mutée elle aussi depuis le vrai source.
  it.each(sources.slice(1).map(s => [s.reading.what, s] as const))(
    '%s — sait dire NON : la tolérance retirée de la portée est refusée',
    (_what, entry) => {
      const mutated = entry.source.split(entry.reading.scope).join('a.workspace_id = $9')
      expect(mutated).not.toContain(entry.reading.scope)
    },
  )
})
