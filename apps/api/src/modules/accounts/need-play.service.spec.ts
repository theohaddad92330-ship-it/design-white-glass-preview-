import { NeedPlayService } from './need-play.service'
import type { CreditsService } from '../credits/credits.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { IaClient } from '../ia/ia.client'

/**
 * Plan d'attaque d'un besoin (D9 option A).
 *
 * Les trois règles que ces tests tiennent sont des règles d'honnêteté
 * commerciale, pas de comptabilité :
 *  - un plan déjà payé par l'équipe se relit GRATUITEMENT (sinon trois sièges
 *    paient trois fois le même besoin) ;
 *  - un solde vide est refusé AVANT l'appel modèle (pas d'attente pour rien) ;
 *  - un échec IA ne persiste rien et ne débite rien.
 */
describe('NeedPlayService', () => {
  const account = { id: 'acc-1', company_name: 'ACME', sector: 'Industrie', raw_analysis: {} }
  const input = { accountId: 'acc-1', kind: 'program', label: 'Migration ERP' }

  function setup(opts: { existing?: unknown; hasCredit?: boolean; iaThrows?: boolean; account?: unknown } = {}) {
    const plays = {
      findOne: jest.fn().mockResolvedValue(opts.existing ?? null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn(row => row),
      save: jest.fn(row => Promise.resolve({ id: 'play-1', ...row })),
    }
    const accounts = { findOne: jest.fn().mockResolvedValue(opts.account === undefined ? account : opts.account) }
    const contacts = { find: jest.fn().mockResolvedValue([{ full_name: 'Claire Vasseur', title: 'DSI' }]) }
    const ia = {
      needPlay: opts.iaThrows
        ? jest.fn().mockRejectedValue(new Error('boom'))
        : jest.fn().mockResolvedValue({ data: { angle: 'x', proofs: [], targets: [], missing: [] } }),
    } as unknown as IaClient
    const credits = {
      hasEnrichmentCredit: jest.fn().mockResolvedValue(opts.hasCredit ?? true),
      consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: true, remaining: 5 }),
    } as unknown as CreditsService
    const esnProfile = {
      resolveProfileData: jest.fn().mockResolvedValue({ name: 'ESN' }),
    } as unknown as EsnProfileReader

    const userActions = {
      create: jest.fn(row => row),
      save: jest.fn(row => Promise.resolve(row)),
    }

    const service = new NeedPlayService(
      plays as never,
      accounts as never,
      contacts as never,
      ia,
      credits,
      esnProfile,
      userActions as never,
    )
    return { service, plays, ia, credits, userActions }
  }

  it('génère, persiste et débite 1 crédit', async () => {
    const { service, ia, credits, plays } = setup()

    const result = await service.generate(input, 'ws-1', 'user-1')

    expect(result).toMatchObject({ ok: true, charged: true })
    expect(ia.needPlay).toHaveBeenCalled()
    expect(plays.save).toHaveBeenCalled()
    expect(credits.consumeEnrichmentCredit).toHaveBeenCalledWith('user-1', {
      reason: 'need_play',
      accountId: 'acc-1',
    })
  })

  it('journalise le plan — un geste qui DÉBITE doit être retrouvable', async () => {
    // Vu en production le 04/08 : un plan préparé à 16h05 n'apparaissait nulle
    // part dans « Dernières actions enregistrées », alors que l'enrichissement
    // du même après-midi y figurait. Le journal est l'endroit où un commercial
    // vérifie ce qu'il a consommé.
    const { service, userActions } = setup()

    await service.generate(input, 'ws-1', 'user-1')

    expect(userActions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        workspace_id: 'ws-1',
        account_id: 'acc-1',
        action_type: 'need_play_generated',
        metadata: { detail: input.label },
      }),
    )
  })

  it('une relecture GRATUITE ne journalise rien — rien n’a été consommé', async () => {
    const { service, userActions } = setup({ existing: { id: 'play-1' } })

    await service.generate(input, 'ws-1', 'user-1')

    expect(userActions.save).not.toHaveBeenCalled()
  })

  it('relit GRATUITEMENT un plan déjà payé par l’équipe', async () => {
    // La promesse de l'option A : le crédit paie une génération, une fois, pour
    // tout le monde. Un deuxième siège ne repaie pas.
    const { service, ia, credits } = setup({ existing: { id: 'play-1', need_key: 'k' } })

    const result = await service.generate(input, 'ws-1', 'user-2')

    expect(result).toMatchObject({ ok: true, charged: false })
    expect(ia.needPlay).not.toHaveBeenCalled()
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('refuse AVANT l’appel modèle quand le solde est vide', async () => {
    const { service, ia } = setup({ hasCredit: false })

    await expect(service.generate(input, 'ws-1', 'user-1')).resolves.toEqual({
      ok: false,
      code: 'insufficient_credits',
    })
    expect(ia.needPlay).not.toHaveBeenCalled()
  })

  it('ne persiste ni ne débite quand l’IA échoue', async () => {
    const { service, plays, credits } = setup({ iaThrows: true })

    await expect(service.generate(input, 'ws-1', 'user-1')).resolves.toEqual({ ok: false, code: 'ia_failed' })
    expect(plays.save).not.toHaveBeenCalled()
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('refuse un compte d’une autre équipe (404, aucun crédit touché)', async () => {
    const { service, credits } = setup({ account: null })

    await expect(service.generate(input, 'ws-1', 'user-1')).resolves.toEqual({ ok: false, code: 'not_found' })
    expect(credits.hasEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('scope la lecture du plan sur le workspace, jamais sur l’utilisateur', async () => {
    const { service, plays } = setup()

    await service.generate(input, 'ws-1', 'user-1')

    expect(plays.findOne).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1', need_key: expect.any(String) } })
  })
})
