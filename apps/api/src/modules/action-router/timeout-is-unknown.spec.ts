import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dispatchFailureOutcome } from '@bellum/contracts'

/**
 * L'invariant n°6 du socle : « Action OS N0→N5 avec outcome `unknown` ; un
 * timeout n'est pas un succès. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE PASSAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `dispatchOne` attrapait TOUTE exception et rendait `failed`. Aucun `unknown`
 * n'était produit nulle part en production : le seul qui existait venait d'un
 * mock de test. L'invariant était déclaré dans le contrat, testé sur le runner,
 * et inatteignable par le chemin réel.
 *
 * Le prix de ce défaut est écrit dans le contrat lui-même : déclarer échoué un
 * envoi peut-être parti fait rejouer, et le client reçoit deux fois. C'est
 * l'autre moitié du scénario n°1 du PDF 9 — « une action annoncée comme faite
 * ne l'a pas été », vue par le mauvais bout.
 */
describe('un timeout n’est ni un succès ni un échec', () => {
  const source = readFileSync(join(__dirname, 'action-router.service.ts'), 'utf8')

  it('le routeur CLASSE ses erreurs au lieu de tout replier dans `failed`', () => {
    expect(source).toContain('dispatchFailureOutcome')
    // Le repli en dur est ce qui a produit le défaut : s'il revient, la garde
    // tombe. On cherche la forme littérale, pas la valeur — `status` reste une
    // variable légitime.
    expect(source.includes("status: 'failed', reason: errorMessage(error)")).toBe(false)
  })

  it('`unknown` est réellement atteignable par le chemin de production', () => {
    // La preuve tient en une ligne : l'erreur qu'un fournisseur lève en vol
    // produit `unknown`, celle qui prouve que rien n'est parti produit `failed`.
    const inFlight = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    const neverLeft = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    expect(dispatchFailureOutcome(inFlight)).toBe('unknown')
    expect(dispatchFailureOutcome(neverLeft)).toBe('failed')
  })

  it('la garde lit bien le bon fichier', () => {
    // Sans cette assertion, un chemin cassé rendrait les deux premières
    // inoffensives.
    expect(source).toContain('private async dispatchOne')
    expect(source.length).toBeGreaterThan(1000)
  })
})
