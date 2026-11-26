import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_COPILOT_ACTION_LEVEL_COVERAGE } from '../modules/demo/demo-coverage'

/**
 * #2449 — LA PORTE DES QUATRE NIVEAUX D'ACTION EST SUR LE CHEMIN, ET AVANT
 * TOUT EFFET.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le motif qui revient dans tout ce dépôt est « du code juste, calculé, testé,
 * que personne n'appelle ». `copilot-action-gate.ts` a ses propres tests, et
 * ils resteraient verts si `dispatchIdempotent` cessait de l'appeler : le
 * niveau redeviendrait une étiquette, exactement ce que #2449 refuse.
 *
 * Et « appelée » ne suffit pas : appelée APRÈS la réclamation de clé
 * d'idempotence, ou après `dispatchOne`, la porte se prononcerait sur un geste
 * déjà tenté. C'est la même discipline que D1 pour le droit
 * (« AVANT toute réclamation de clé : un geste refusé n'a rien tenté »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET COMMENT ELLE SAIT DIRE NON
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit `action-router.service.ts` SUR LE DISQUE — jamais une copie de son
 * code collée ici (GA-26 : deux versions divergent). La décision est portée par
 * une fonction PURE, éprouvée sur des sources SYNTHÉTIQUES : porte absente,
 * porte après la réclamation de clé, porte après `dispatchOne`. Les trois
 * doivent rougir sans qu'on touche au vrai fichier.
 */

const ROUTER_FILE = join(__dirname, '../modules/action-router/action-router.service.ts')

/** Les marqueurs, dans l'ordre où ils DOIVENT apparaître dans la méthode. */
const GATE_CALL = 'this.actionLevelRefusal('
const KEY_CLAIM = 'INSERT INTO action_dispatch_attempts'
const EFFECT = 'this.dispatchOne('

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

/**
 * La porte est-elle appelée dans `dispatchIdempotent`, AVANT la réclamation de
 * clé et avant tout effet ?
 *
 * On borne la lecture au corps de la méthode : un appel qui vivrait ailleurs
 * dans le fichier (dans `observe`, par exemple) ne prouverait rien du chemin
 * qu'empruntent réellement `dispatch` et `dispatchBulk`.
 */
export function gateRunsBeforeAnyEffect(rawSource: string): boolean {
  const source = stripComments(rawSource)
  const start = source.indexOf('private async dispatchIdempotent(')
  if (start === -1) return false
  const body = source.slice(start)
  const gate = body.indexOf(GATE_CALL)
  const claim = body.indexOf(KEY_CLAIM)
  const effect = body.indexOf(EFFECT)
  if (gate === -1 || claim === -1 || effect === -1) return false
  return gate < claim && gate < effect
}

describe('#2449 — le niveau d’action est une porte, appelée avant tout effet', () => {
  it('LIT vraiment : la méthode et ses trois repères existent dans le fichier réel', () => {
    const source = stripComments(readFileSync(ROUTER_FILE, 'utf8'))
    expect(source).toContain('private async dispatchIdempotent(')
    for (const marker of [GATE_CALL, KEY_CLAIM, EFFECT]) {
      expect(source).toContain(marker)
    }
  })

  it('la porte est appelée dans `dispatchIdempotent`, avant la clé et avant l’effet', () => {
    expect(gateRunsBeforeAnyEffect(readFileSync(ROUTER_FILE, 'utf8'))).toBe(true)
  })

  it('sait dire NON — porte ABSENTE', () => {
    expect(
      gateRunsBeforeAnyEffect(
        [
          'private async dispatchIdempotent(intent, ctx) {',
          '  await this.accounts.query(`INSERT INTO action_dispatch_attempts (a) VALUES ($1)`, [1])',
          '  return this.dispatchOne(intent, ctx)',
          '}',
        ].join('\n'),
      ),
    ).toBe(false)
  })

  it('sait dire NON — porte APRÈS la réclamation de clé', () => {
    expect(
      gateRunsBeforeAnyEffect(
        [
          'private async dispatchIdempotent(intent, ctx) {',
          '  await this.accounts.query(`INSERT INTO action_dispatch_attempts (a) VALUES ($1)`, [1])',
          '  const beyond = this.actionLevelRefusal(intent, ctx)',
          '  if (beyond) return beyond',
          '  return this.dispatchOne(intent, ctx)',
          '}',
        ].join('\n'),
      ),
    ).toBe(false)
  })

  it('sait dire NON — porte APRÈS l’effet', () => {
    expect(
      gateRunsBeforeAnyEffect(
        [
          'private async dispatchIdempotent(intent, ctx) {',
          '  const result = await this.dispatchOne(intent, ctx)',
          '  await this.accounts.query(`INSERT INTO action_dispatch_attempts (a) VALUES ($1)`, [1])',
          '  const beyond = this.actionLevelRefusal(intent, ctx)',
          '  return beyond ?? result',
          '}',
        ].join('\n'),
      ),
    ).toBe(false)
  })

  it('sait dire NON — un appel en COMMENTAIRE ne compte pas', () => {
    // Une garde qui lit la prose accuse le bien, et absout le mal : ici, c'est
    // le second cas qu'on ferme.
    expect(
      gateRunsBeforeAnyEffect(
        [
          'private async dispatchIdempotent(intent, ctx) {',
          '  // this.actionLevelRefusal(intent, ctx) — à rebrancher un jour',
          '  await this.accounts.query(`INSERT INTO action_dispatch_attempts (a) VALUES ($1)`, [1])',
          '  return this.dispatchOne(intent, ctx)',
          '}',
        ].join('\n'),
      ),
    ).toBe(false)
  })

  it('la couverture démo est classée, avec une raison écrite', () => {
    expect(DEMO_COPILOT_ACTION_LEVEL_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_COPILOT_ACTION_LEVEL_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
