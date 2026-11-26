import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IMPORT_SESSION_STATES, importResumeDecision } from '@bellum/contracts'

/**
 * La reprise d'un import interrompu est ATTEIGNABLE — de la boucle d'écriture
 * jusqu'au bouton.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE, ET PAS SEULEMENT DES TESTS UNITAIRES
 * ─────────────────────────────────────────────────────────────────────────────
 * Le défaut n°1 de ce dépôt est « du code juste, calculé, testé, que personne
 * n'appelle ». L'annulation d'import en a été l'exemple : `planRollback`,
 * `markRolledBack` et `rollbackDecision` étaient écrits, testés et documentés
 * depuis le 21/08 — sans route, sans bouton, sans appelant. `rollback-reachable`
 * existe pour ça.
 *
 * La reprise tombe dans la même famille, en pire : elle ne sert QUE le jour où
 * quelque chose se passe mal, donc son absence de câblage ne se voit jamais en
 * conditions normales. Cette garde suit la chaîne complète — la boucle, le
 * service, la route, l'écran — et chaque maillon est LU dans son fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE QU'ELLE SAIT DIRE NON (29/08/2026, cassé exprès puis restauré)
 * ─────────────────────────────────────────────────────────────────────────────
 *  · retirer `dispatchFailureOutcome` de `runRows` → « la boucle CLASSE l'échec »
 *    tombe ;
 *  · remplacer `state = 'partial'` par `state = 'failed'` dans `writeSession` →
 *    « le service NOMME l'état » tombe ;
 *  · retirer `session.state === 'partial'` du bouton d'annulation de l'écran →
 *    « un import interrompu s'annule » tombe.
 *
 * Et le corpus est vérifié non vide : une garde qui lit un fichier absent passe
 * au vert pour toujours (`rg` sur un chemin inexistant sort en 0).
 */

const HERE = __dirname
const WEB = join(HERE, '..', '..', '..', '..', '..', 'apps', 'web', 'src', 'features', 'import')

const writer = readFileSync(join(HERE, 'import-writer.service.ts'), 'utf8')
const service = readFileSync(join(HERE, 'import.service.ts'), 'utf8')
const controller = readFileSync(join(HERE, 'import.controller.ts'), 'utf8')
const wizard = readFileSync(join(WEB, 'view', 'ImportWizard.tsx'), 'utf8')
const api = readFileSync(join(WEB, 'api.ts'), 'utf8')

describe('la garde LIT quelque chose', () => {
  it('les cinq fichiers du chemin existent et ne sont pas vides', () => {
    // Un `readFileSync` sur un chemin déplacé jette ; un fichier vide, lui,
    // passerait toutes les assertions `toContain` au rouge — mais un corpus
    // découpé ou filtré au mauvais endroit passerait au VERT. On le mesure.
    for (const source of [writer, service, controller, wizard, api]) {
      expect(source.length).toBeGreaterThan(1_000)
    }
  })
})

describe('1. la boucle d’écriture s’arrête proprement', () => {
  it('elle ATTRAPE au lieu de laisser remonter', () => {
    // Une exception qui remonte perd les compteurs, l'instantané, et le fait
    // même que des lignes soient en base.
    expect(writer).toContain('catch (error)')
    expect(writer).toContain('failure: {')
  })

  it('elle CLASSE l’échec avec la seule dérivation du dépôt', () => {
    // « Un timeout n'est pas un échec. » Recopier ce classement ici en ferait
    // une seconde version qui divergerait au premier code réseau ajouté.
    expect(writer).toContain('dispatchFailureOutcome(error)')
  })

  it('elle pose son point de reprise PENDANT la boucle', () => {
    expect(writer).toContain('IMPORT_CHECKPOINT_ROWS')
    expect(writer).toContain('await input.checkpoint(')
  })
})

/**
 * La BRANCHE d'échec de `writeSession`, isolée.
 *
 * ⚠️ Sans cet isolement, la garde était BORGNE — mesuré le 29/08/2026 en la
 * cassant volontairement : `state = 'partial'` apparaît DEUX fois dans le
 * fichier (le point de contrôle intermédiaire, et la branche d'échec), si bien
 * qu'un `toContain` sur le fichier entier restait vert alors que la branche
 * d'échec écrivait `failed`. Une garde qui ne voit qu'une des deux occurrences
 * passe au vert sur l'autre.
 */
function failureBranch(): string {
  const start = service.indexOf('if (outcome.failure) {')
  expect(start).toBeGreaterThan(0)
  const end = service.indexOf('await this.markApplied(', start)
  expect(end).toBeGreaterThan(start)
  return service.slice(start, end)
}

describe('2. le service enregistre où ça s’est arrêté', () => {
  it('il NOMME l’état au lieu de laisser `simulated`', () => {
    const branch = failureBranch()
    expect(branch).toContain("session.state = 'partial'")
    expect(branch).toContain('session.processed_rows = outcome.processedRows')
    expect(branch).toContain('session.failed_at_row = outcome.failure.row')
    expect(branch).toContain('session.resume_outcome = outcome.failure.outcome')
  })

  it('il ne JETTE pas — un 500 effacerait le seul fait qui compte', () => {
    // Les 4 000 lignes SONT en base. Une exception rendrait un 500 et l'écran
    // n'aurait rien à afficher : ni le compte, ni le point d'arrêt.
    expect(failureBranch()).not.toMatch(/\bthrow\b/)
  })

  it('il CUMULE l’instantané au lieu de le remplacer', () => {
    // Le remplacer perdrait les 4 000 premiers objets pour l'annulation.
    expect(service).toContain('[...carried.snapshot, ...outcome.snapshot]')
  })

  it('il décide de la reprise avec la fonction PURE, pas à la main', () => {
    expect(service).toContain('importResumeDecision({')
    expect(service).toContain('importContentFingerprint(content)')
  })

  it('un import INTERROMPU s’annule aussi — c’est lui qui a laissé des lignes', () => {
    expect(service).toContain("session.state !== 'applied' && session.state !== 'partial'")
  })
})

describe('3. une route l’expose et un écran l’appelle', () => {
  it('la route accepte le point de reprise CHOISI par un humain, et le TRANSMET', () => {
    // ⚠️ `toContain('resumeFrom')` seul était BORGNE — mesuré le 29/08/2026 en
    // remplaçant le calcul par `const resume = {}` : le mot survivait dans la
    // signature et dans les commentaires, et la garde restait verte pendant que
    // le choix humain était jeté en silence. Ce qu'il faut vérifier n'est pas
    // que le mot existe, c'est que la VALEUR REÇUE est lue et passée.
    expect(controller).toContain('resumeFrom: body.resumeFrom')
    const call = controller.slice(controller.indexOf('this.imports.writeSession('))
    expect(call.slice(0, call.indexOf(')'))).toContain('resume')
    expect(controller).toContain('stopped')
  })

  it('le client transmet ce choix', () => {
    expect(api).toContain('resumeFrom')
    expect(api).toContain('processed_rows')
  })

  it('l’écran offre de REPRENDRE un import interrompu', () => {
    expect(wizard).toContain("t('resume.action')")
    expect(wizard).toContain('onClick={() => resume(session)}')
  })

  it('l’écran offre d’ANNULER un import interrompu', () => {
    // C'est le cas qui compte le plus : il a laissé des lignes derrière lui, et
    // `state === 'applied'` seul le refusait.
    expect(wizard).toContain("session.state === 'applied' || session.state === 'partial'")
  })

  it('l’écran distingue « aucune ligne » de « on ne sait pas combien »', () => {
    // La règle du dépôt appliquée à une panne : si la valeur est absente,
    // « 0 » est-il VRAI ?
    expect(wizard).toContain("t('resume.stoppedUnknown')")
    expect(wizard).toContain('session.processed_rows !== null && session.total_rows !== null')
  })
})

describe('4. les invariants qui rendent la reprise sûre', () => {
  it('`partial` existe dans la taxonomie, ajouté EN FIN', () => {
    expect(IMPORT_SESSION_STATES.at(-1)).toBe('partial')
  })

  it('la contrainte SQL connaît `partial` — élargie AVANT le code qui l’écrit', () => {
    // GA-11 / GA-12 en pratique : la valeur voyage du code vers la base.
    const migration = readFileSync(
      join(HERE, '..', '..', 'migrations', '1790800000801-ImportResumeCheckpoint.ts'),
      'utf8',
    )
    const up = migration.split('public async down')[0] ?? ''
    expect(up).toContain("'rolled_back', 'failed', 'partial'")
    // Et aucune valeur existante n'a disparu au passage.
    for (const state of IMPORT_SESSION_STATES) expect(up).toContain(`'${state}'`)
  })

  it('un fichier DIFFÉRENT ne fait sauter aucune ligne', () => {
    // Le contrôle qui passe avant tous les autres : un numéro de ligne ne veut
    // rien dire hors de SON fichier.
    expect(
      importResumeDecision({
        state: 'partial',
        processedRows: 4_000,
        failedAtRow: 4_000,
        resumeOutcome: 'failed',
        storedFingerprint: 'a',
        incomingFingerprint: 'b',
      }).kind,
    ).toBe('different_file')
  })
})
