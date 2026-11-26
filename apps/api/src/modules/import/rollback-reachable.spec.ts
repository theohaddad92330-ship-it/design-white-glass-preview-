import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  IMPORT_ORDER,
  ROLLBACK_FULL_HOURS,
  WRITABLE_IMPORT_OBJECTS,
  isWritableImportObject,
  rollbackDecision,
  type ImportObject,
} from '@bellum/contracts'
import { ImportWriterService } from './import-writer.service'

/**
 * L'annulation d'import est ATTEIGNABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT DU 22/08
 * ─────────────────────────────────────────────────────────────────────────────
 * `planRollback`, `markRolledBack` et `rollbackDecision` étaient écrits, testés
 * et documentés depuis le 21/08 — et n'avaient ni route, ni bouton, ni appelant.
 * Le §12 du PDF 9 en fait pourtant LA garde du scénario le plus grave qu'il
 * décrive : « un import détruit trois ans de données CRM ».
 *
 * Une garde qui existe sur le papier ne protège rien le jour où l'import se
 * passe mal. C'est le pendant du « chemin d'écriture sans appelant », appliqué
 * à un chemin de RÉPARATION.
 */
describe('l’annulation d’import est atteignable', () => {
  const controller = readFileSync(join(__dirname, 'import.controller.ts'), 'utf8')
  const writer = readFileSync(join(__dirname, 'import-writer.service.ts'), 'utf8')

  it('une route l’expose', () => {
    expect(controller).toContain("@Post('sessions/:id/rollback')")
    expect(controller).toContain('planRollback')
    expect(controller).toContain('markRolledBack')
  })

  it('elle RESTAURE et ARCHIVE, elle ne supprime pas', () => {
    // Effacer serait irréversible, et l'annulation d'une annulation n'existe
    // pas. Un compte créé par l'import est archivé, jamais détruit.
    expect(writer).toContain("status: 'archived'")
    expect(writer.includes('.delete(')).toBe(false)
    expect(writer.includes('.remove(')).toBe(false)
  })

  it('elle COMPTE ce qu’elle a laissé, jamais ne le tait', () => {
    // « 12 annulés » sans dire que 3 ont été laissés ferait croire à une
    // annulation complète.
    expect(controller).toContain('keptTouched')
    expect(controller).toContain('leftInPlace')
    expect(controller).toContain('windowClosed')
  })

  it('un objet touché par un HUMAIN n’est jamais annulé', () => {
    // La règle qui rend l'annulation sûre. Elle est pure et testée ailleurs ;
    // on vérifie ici qu'elle dit bien ce que la route promet.
    const importedAt = new Date('2026-08-22T08:00:00.000Z')
    const now = new Date('2026-08-22T12:00:00.000Z')
    expect(
      rollbackDecision({ importedAt, now, updatedAt: new Date('2026-08-22T10:00:00.000Z'), lastWriteBy: 'human' }),
    ).toBe('keep_touched')
    expect(rollbackDecision({ importedAt, now, updatedAt: null, lastWriteBy: null })).toBe('revert')
    expect(ROLLBACK_FULL_HOURS).toBe(24)
  })

  it('seuls les objets dont l’écriture est branchée s’annulent', () => {
    // Un import qui n'a rien écrit n'a rien à annuler : le DIRE vaut mieux
    // qu'un succès muet.
    //
    // ⚠️ Cette garde ÉPINGLAIT un état : elle vérifiait le texte littéral
    // `object !== 'account' && object !== 'contact'`. Elle était donc verte tant
    // que deux objets écrivaient, et rouge le jour où un troisième s'est
    // branché — sans qu'aucune règle n'ait été enfreinte. Ce qu'on protège
    // n'est pas la liste, c'est le LIEN entre elle et le refus.
    expect(controller).toContain('isWritableImportObject(object)')
  })

  it('la liste de l’annulation est la MÊME que celle de l’écriture', () => {
    // Deux listes finiraient par diverger, et la divergence n'a qu'un sens
    // possible : un import qui écrit sans pouvoir s'annuler.
    expect([...ImportWriterService.WRITABLE]).toEqual([...WRITABLE_IMPORT_OBJECTS])
  })

  it('elle sait dire NON — chaque objet NON branché est refusé', () => {
    // Le témoin : la garde ne se contente pas d'accepter les trois qui écrivent.
    const nonBranchés = IMPORT_ORDER.filter(
      objet => !(WRITABLE_IMPORT_OBJECTS as readonly ImportObject[]).includes(objet),
    )
    expect(nonBranchés.length).toBeGreaterThan(0)
    for (const objet of nonBranchés) expect(isWritableImportObject(objet)).toBe(false)
    for (const objet of WRITABLE_IMPORT_OBJECTS) expect(isWritableImportObject(objet)).toBe(true)
  })
})
