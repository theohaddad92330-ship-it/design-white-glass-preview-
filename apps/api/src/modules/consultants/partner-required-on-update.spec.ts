import { BadRequestException } from '@nestjs/common'
import { ConsultantsService } from './consultants.service'

/**
 * Le trou du PUT PARTIEL — celui qui rend la contrainte SQL nécessaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `ConsultantsController.assertPartnerForSubcontracting` lit le CORPS de la
 * requête, et `missingPartnerForEngagement` rend `false` dès que le corps ne
 * porte pas `engagement_kind` (`packages/contracts/src/schemas/consultant.ts`).
 * C'est juste pour une création, où le corps EST la ligne. Ça ne l'est pas pour
 * une mise à jour partielle :
 *
 *     PUT /consultants/:id   { "full_name": "…", "partner_account_id": null }
 *
 * sur une fiche déjà `sous_traitance` passe la garde — `engagement_kind` est
 * absent du corps — et `fromUpsert` écrit bien `partner_account_id = null`. La
 * fiche se retrouve sous-traitante sans personne qui la porte : exactement ce
 * que la règle 3 du §2 interdit, et personne ne le voit avant le jour où la
 * mission se passe mal.
 *
 * La contrainte SQL le refuse désormais côté base. Cette garde-ci existe pour
 * que l'utilisateur lise une PHRASE plutôt qu'un 500 : une violation de `CHECK`
 * remonte en erreur de driver, pas en message.
 *
 * Le prédicat reste celui du contrat, appliqué à la ligne FUSIONNÉE — la seule
 * forme où la question « cette fiche est-elle portée ? » a une réponse.
 */

/** Une ligne d'entité minimale : le sujet est l'engagement et le partenaire. */
function rowWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'c1',
    full_name: 'Nadia Berger',
    engagement_kind: 'sous_traitance',
    partner_account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ...overrides,
  }
}

function serviceWith(row: Record<string, unknown>) {
  const saved: Record<string, unknown>[] = []
  const repo = {
    save: async (entity: Record<string, unknown>) => {
      saved.push({ ...entity })
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
  ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () => row
  ;(service as unknown as { toWire: (r: unknown) => unknown }).toWire = (r: unknown) => r
  return { service, saved }
}

describe('update — un sous-traitant reste porté, même quand le corps ne le dit pas', () => {
  it('REFUSE de vider le partenaire d’une fiche déjà sous-traitante', async () => {
    const { service, saved } = serviceWith(rowWith({}))

    await expect(
      service.update('c1', 'w1', 'u1', { full_name: 'Nadia Berger', partner_account_id: null }),
    ).rejects.toBeInstanceOf(BadRequestException)
    // Une garde qui refuse après avoir enregistré ne garde rien.
    expect(saved).toEqual([])
  })

  it('REFUSE de basculer en sous-traitance une fiche sans partenaire', async () => {
    const { service, saved } = serviceWith(rowWith({ engagement_kind: 'salarie', partner_account_id: null }))

    await expect(
      service.update('c1', 'w1', 'u1', { full_name: 'Nadia Berger', engagement_kind: 'sous_traitance' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(saved).toEqual([])
  })

  it('LAISSE PASSER une bascule en sous-traitance qui apporte son partenaire', async () => {
    const { service, saved } = serviceWith(rowWith({ engagement_kind: 'salarie', partner_account_id: null }))

    await expect(
      service.update('c1', 'w1', 'u1', {
        full_name: 'Nadia Berger',
        engagement_kind: 'sous_traitance',
        partner_account_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).resolves.toBeTruthy()
    expect(saved).toHaveLength(1)
  })

  it('LAISSE PASSER une modification qui ne touche ni l’engagement ni le partenaire', async () => {
    const { service, saved } = serviceWith(rowWith({}))

    await expect(service.update('c1', 'w1', 'u1', { full_name: 'Nadia Berger-Costa' })).resolves.toBeTruthy()
    expect(saved).toHaveLength(1)
  })

  it('LAISSE PASSER le retrait du partenaire quand l’engagement change en même temps', async () => {
    const { service, saved } = serviceWith(rowWith({}))

    await expect(
      service.update('c1', 'w1', 'u1', {
        full_name: 'Nadia Berger',
        engagement_kind: 'freelance',
        partner_account_id: null,
      }),
    ).resolves.toBeTruthy()
    expect(saved).toHaveLength(1)
  })

  it('LAISSE PASSER un partenaire sur une autre nature — la règle est à sens UNIQUE', async () => {
    const { service, saved } = serviceWith(rowWith({ engagement_kind: 'freelance', partner_account_id: null }))

    await expect(
      service.update('c1', 'w1', 'u1', {
        full_name: 'Nadia Berger',
        partner_account_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).resolves.toBeTruthy()
    expect(saved).toHaveLength(1)
  })

  it('ne juge pas une fiche introuvable — elle rend null, comme avant', async () => {
    const { service } = serviceWith(rowWith({}))
    ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () => null

    await expect(service.update('c1', 'w1', 'u1', { full_name: 'X', partner_account_id: null })).resolves.toBeNull()
  })
})
