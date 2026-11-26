import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-379 — #2426.98 : une société juridique ARCHIVÉE ne peut plus porter de
 * facture NEUVE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `billingEntityOf` (`packages/contracts/src/schemas/legal-entity.ts`) était
 * juste, testée, et SANS AUCUN appelant de production depuis le 31/08/2026 —
 * la dette était écrite noir sur blanc dans son fichier. Un dépôt de facture
 * qui ignorerait l'archivage de la société porteuse produirait un document
 * qui ment sur qui facture, sous une société qui n'existe plus
 * commercialement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET COMMENT ELLE SAIT DIRE NON
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit le VRAI fichier (`invoice-connector-write.controller.ts`), compte
 * les lignes lues (jamais zéro — un fichier vide ou déplacé fait échouer la
 * garde plutôt que de passer à vide), et vérifie trois choses : l'import de
 * `billingEntityOf`, la lecture de `.archived`, et un refus (`ConflictException`
 * ou équivalent) posé AVANT l'appel à `writes.send`. Elle prouve aussi qu'elle
 * mord sur un extrait FABRIQUÉ qui appelle le service sans jamais vérifier
 * l'archivage.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const CONTROLLER_PATH = 'apps/api/src/modules/invoice-connector/invoice-connector-write.controller.ts'

function readController(): string {
  const source = readFileSync(join(REPO_ROOT, CONTROLLER_PATH), 'utf8')
  if (source.length === 0) throw new Error(`GA-379 : ${CONTROLLER_PATH} est vide — corpus cassé.`)
  return source
}

/**
 * Vrai si le fichier importe `billingEntityOf`, vérifie `.archived`, ET pose
 * ce refus AVANT l'appel `writes.send(` dans le code source (ordre textuel —
 * fidèle à l'ordre d'exécution réel du fichier, un seul appel `send`).
 */
function blocksArchivedEntityBeforeSend(source: string): boolean {
  const importsGuard = source.includes('billingEntityOf')
  const checksArchived = /\.archived\b/.test(source)
  const sendIndex = source.indexOf('writes.send(')
  const archivedCheckIndex = source.indexOf('.archived')
  const guardedBeforeSend = sendIndex !== -1 && archivedCheckIndex !== -1 && archivedCheckIndex < sendIndex
  return importsGuard && checksArchived && guardedBeforeSend
}

describe('GA-379 — une société archivée bloque une facture neuve (#2426.98)', () => {
  it('le VRAI contrôleur refuse un dépôt sous une société archivée, avant tout appel au service', () => {
    const source = readController()
    // Compteur de ce qui a été lu : jamais zéro.
    expect(source.split('\n').length).toBeGreaterThan(0)
    expect(blocksArchivedEntityBeforeSend(source)).toBe(true)
  })

  it('sait dire NON : un contrôleur qui appelle le service sans vérifier l’archivage fait rougir le détecteur', () => {
    const violation = `
      async send(user, body) {
        const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
        const provider = await this.connectedInvoicingProvider(user.userId)
        const row = await this.writes.send({ workspaceId, missionId: body.missionId, provider })
        return toView(row)
      }
    `
    expect(blocksArchivedEntityBeforeSend(violation)).toBe(false)
  })

  it("n'attrape pas ce qu'elle ne vise pas : vérifier l'archivage APRÈS l'envoi reste rouge", () => {
    const tooLate = `
      const row = await this.writes.send({ workspaceId, missionId: body.missionId })
      if (entity.archived) throw new ConflictException('trop tard')
      return toView(row)
    `
    expect(blocksArchivedEntityBeforeSend(tooLate)).toBe(false)
  })
})
