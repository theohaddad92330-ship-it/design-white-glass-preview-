import { HttpException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { EnrichContactResponse } from '@bellum/contracts'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { IaClient } from '../ia/ia.client'
import { ConsultantsController } from './consultants.controller'
import { ConsultantsService } from './consultants.service'

// H-DECISIONS #4348 — l'URL d'un profil LinkedIn pré-remplit la fiche, via le
// fournisseur sous contrat (c95_linkedin_fournisseur_sous_contrat). Jamais de visite
// de linkedin.com ; 1 crédit par SUCCÈS, 0 résultat = 0 débit (règle d'enrichissement).

const USER = 'u0000000-0000-4000-8000-000000000001'
const URL = 'https://www.linkedin.com/in/nadia-benali'

function matched(extra: Partial<EnrichContactResponse['data']> = {}): EnrichContactResponse {
  return {
    data: {
      matched: true,
      first_name: 'Nadia',
      last_name: 'Benali',
      email: null,
      email_status: null,
      phone: null,
      linkedin_url: null,
      title: 'Lead Data Engineer',
      organization_name: 'Nordia',
      ...extra,
    },
  }
}

function makeService(enrichContact: jest.Mock) {
  const ia = { enrichContact } as unknown as IaClient
  return new ConsultantsService(
    {} as unknown as Repository<ConsultantEntity>,
    {} as never,
    {} as never,
    {} as never,
    ia,
    {} as never,
  )
}

describe('ConsultantsService.lookupLinkedinProfile', () => {
  it('refuse ce qui n’est pas un profil linkedin.com/in/<slug> SANS appeler le fournisseur', async () => {
    const enrich = jest.fn()
    const outcome = await makeService(enrich).lookupLinkedinProfile('https://www.linkedin.com/company/bellum', {
      demo: false,
    })
    expect(outcome).toEqual({ ok: false, code: 'invalid_url' })
    expect(enrich).not.toHaveBeenCalled()
  })

  it('passe la clé d’identité (URL canonique du slug) et rend le brouillon', async () => {
    const enrich = jest.fn(async () => matched())
    const outcome = await makeService(enrich).lookupLinkedinProfile('linkedin.com/in/Nadia-Benali/?utm=x', {
      demo: false,
    })
    expect(enrich).toHaveBeenCalledWith({ linkedinUrl: URL })
    expect(outcome).toMatchObject({ ok: true, draft: { full_name: 'Nadia Benali', source: 'linkedin_profile' } })
  })

  it('aucun résultat → profile_not_found, rien d’inventé', async () => {
    const enrich = jest.fn(async () => matched({ matched: false }))
    expect(await makeService(enrich).lookupLinkedinProfile(URL, { demo: false })).toEqual({
      ok: false,
      code: 'profile_not_found',
    })
  })

  it('sans clé / fournisseur en panne → le MÊME message, jamais une erreur technique', async () => {
    const enrich = jest.fn(async () => {
      throw new Error('APOLLO_API_KEY missing')
    })
    expect(await makeService(enrich).lookupLinkedinProfile(URL, { demo: false })).toEqual({
      ok: false,
      code: 'profile_not_found',
    })
  })

  it('démo : brouillon FICTIF étiqueté, zéro appel réseau', async () => {
    const enrich = jest.fn()
    const outcome = await makeService(enrich).lookupLinkedinProfile(URL, { demo: true })
    expect(enrich).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ ok: true, draft: { source: 'linkedin_profile', public_profile_url: URL } })
  })
})

describe('ConsultantsController.linkedinLookup — le débit', () => {
  function makeController(opts: { outcome: unknown; credit?: boolean; demo?: boolean }) {
    const consume = jest.fn(async () => ({ ok: true, remaining: 9 }))
    const consultants = { lookupLinkedinProfile: jest.fn(async () => opts.outcome) }
    const credits = { hasEnrichmentCredit: jest.fn(async () => opts.credit ?? true), consumeEnrichmentCredit: consume }
    const workspaceContext = { isDemoWorkspace: jest.fn(async () => opts.demo ?? false) }
    const controller = new ConsultantsController(
      consultants as never,
      workspaceContext as never,
      credits as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    return { controller, consume, consultants }
  }
  const draft = { full_name: 'Nadia Benali', source: 'linkedin_profile' }

  it('un succès débite 1 crédit', async () => {
    const { controller, consume } = makeController({ outcome: { ok: true, draft } })
    const res = await controller.linkedinLookup({ url: URL }, { userId: USER } as never)
    expect(res).toEqual({ found: true, draft })
    expect(consume).toHaveBeenCalledTimes(1)
    expect(consume).toHaveBeenCalledWith(USER, { reason: 'talent_linkedin_lookup' })
  })

  it('0 résultat = 0 débit', async () => {
    const { controller, consume } = makeController({ outcome: { ok: false, code: 'profile_not_found' } })
    expect(await controller.linkedinLookup({ url: URL }, { userId: USER } as never)).toEqual({
      found: false,
      code: 'profile_not_found',
    })
    expect(consume).not.toHaveBeenCalled()
  })

  it('démo = 0 débit, même sur un succès', async () => {
    const { controller, consume } = makeController({ outcome: { ok: true, draft }, demo: true })
    await controller.linkedinLookup({ url: URL }, { userId: USER } as never)
    expect(consume).not.toHaveBeenCalled()
  })

  it('solde vide → 402 AVANT tout appel fournisseur', async () => {
    const { controller, consultants } = makeController({ outcome: { ok: true, draft }, credit: false })
    await expect(controller.linkedinLookup({ url: URL }, { userId: USER } as never)).rejects.toBeInstanceOf(
      HttpException,
    )
    expect(consultants.lookupLinkedinProfile).not.toHaveBeenCalled()
  })

  it('URL invalide → 400, 0 débit', async () => {
    const { controller, consume } = makeController({ outcome: { ok: false, code: 'invalid_url' } })
    await expect(controller.linkedinLookup({ url: 'nope' }, { userId: USER } as never)).rejects.toMatchObject({
      status: 400,
    })
    expect(consume).not.toHaveBeenCalled()
  })
})
