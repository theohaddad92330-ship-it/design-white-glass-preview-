import { ConflictException } from '@nestjs/common'
import { ConsultantsService } from './consultants.service'

/**
 * Réactiver un talent ne remet pas en circulation un consentement expiré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `reactivate()` remettait une fiche dans le vivier actif — donc dans le
 * matching, donc dans les propositions envoyées à des clients — **sans lire le
 * consentement**. Le contrôle existait pourtant juste à côté
 * (`submission-preflight.ts`), au moment de positionner.
 *
 * L'arbitrage du dépôt est déjà écrit, et on l'applique tel quel plutôt que
 * d'en inventer un second :
 *
 *  - `expired` REFUSE — l'accord a été donné puis a expiré ; le reposer est un
 *    geste, pas une formalité ;
 *  - `none` LAISSE PASSER — un dossier sans consentement recueilli n'est pas un
 *    dossier dont l'accord a expiré. Bloquer ici empêcherait de ranger un
 *    talent qu'on vient justement de rappeler pour lui poser la question.
 *
 * C'est exactement la distinction que `consentState` porte depuis le premier
 * jour : « l'un demande de poser la question, l'autre de la reposer ».
 */

const NOW = new Date('2026-08-25T00:00:00Z')

function serviceWith(row: Record<string, unknown>) {
  const saved: Record<string, unknown>[] = []
  const repo = {
    findOne: async () => row,
    save: async (entity: Record<string, unknown>) => {
      saved.push(entity)
      return entity
    },
  }
  const service = new ConsultantsService(
    repo as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  )
  // `findScoped` est privée et fait sa propre requête ; on la court-circuite,
  // le sujet du test étant la garde de consentement, pas le cloisonnement.
  ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () => row
  ;(service as unknown as { toWire: (r: unknown) => unknown }).toWire = (r: unknown) => r
  return { service, saved }
}

describe('reactivate — le consentement se lit AVANT de remettre en circulation', () => {
  it('REFUSE un consentement expiré, et le dit', async () => {
    const { service, saved } = serviceWith({
      id: 'c1',
      archived_at: new Date('2026-01-01T00:00:00Z'),
      consent_given_at: new Date('2025-01-01T00:00:00Z'),
      consent_expires_at: new Date('2026-01-01T00:00:00Z'),
    })

    await expect(service.reactivate('c1', 'w1', 'u1', NOW)).rejects.toBeInstanceOf(ConflictException)
    // Et surtout : rien n'a été écrit. Une garde qui refuse après avoir
    // enregistré ne garde rien.
    expect(saved).toEqual([])
  })

  it('LAISSE PASSER un consentement jamais recueilli — ce n’est pas la même chose', async () => {
    const { service, saved } = serviceWith({
      id: 'c2',
      archived_at: new Date('2026-01-01T00:00:00Z'),
      consent_given_at: null,
      consent_expires_at: null,
    })

    await expect(service.reactivate('c2', 'w1', 'u1', NOW)).resolves.toBeTruthy()
    expect(saved).toHaveLength(1)
    expect(saved[0].archived_at).toBeNull()
  })

  it('laisse passer un consentement VALIDE', async () => {
    const { service, saved } = serviceWith({
      id: 'c3',
      archived_at: new Date('2026-01-01T00:00:00Z'),
      consent_given_at: new Date('2026-01-01T00:00:00Z'),
      consent_expires_at: new Date('2027-01-01T00:00:00Z'),
    })

    await expect(service.reactivate('c3', 'w1', 'u1', NOW)).resolves.toBeTruthy()
    expect(saved).toHaveLength(1)
  })

  it('laisse passer un consentement SANS échéance — il ne peut pas avoir expiré', async () => {
    const { service } = serviceWith({
      id: 'c4',
      archived_at: new Date('2026-01-01T00:00:00Z'),
      consent_given_at: new Date('2026-01-01T00:00:00Z'),
      consent_expires_at: null,
    })

    await expect(service.reactivate('c4', 'w1', 'u1', NOW)).resolves.toBeTruthy()
  })
})
