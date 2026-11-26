import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { EMPTY_STRUCTURED_LEXICON, type OfferPortfolio, offerPortfolioSchema } from '@bellum/contracts'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import type { EsnProfileWorkspaceContext } from './esn-profile-workspace.resolver'
import { OfferPortfolioService } from './offer-portfolio.service'

function row(overrides: Partial<EsnProfileEntity> = {}): EsnProfileEntity {
  return {
    id: 'row-1',
    user_id: 'user-1',
    offer_domain: null,
    offer_domains: [],
    offer_portfolio: null,
    ...overrides,
  } as EsnProfileEntity
}

function context(overrides: Partial<EsnProfileWorkspaceContext> = {}): EsnProfileWorkspaceContext {
  return {
    workspaceId: 'ws-1',
    role: 'owner',
    canManageCompany: true,
    canonicalRow: row(),
    ownRow: row(),
    ...overrides,
  }
}

function build(ctx: EsnProfileWorkspaceContext) {
  const update = jest.fn().mockResolvedValue(undefined)
  const resolver = { resolveContext: jest.fn().mockResolvedValue(ctx) }
  const repo = { update }
  const insert = jest.fn().mockResolvedValue(undefined)
  const service = new OfferPortfolioService(repo as never, resolver as never, { insert } as never)
  return { service, update, insert }
}

describe('OfferPortfolioService', () => {
  it('sans portefeuille enregistré, rend le chemin LEGACY et le dit', async () => {
    const { service } = build(context({ canonicalRow: row({ offer_domain: 'finance' }) }))
    const resolved = await service.read('user-1')
    expect(resolved.source).toBe('legacy')
    expect(resolved.company_type).toBe('finance')
  })

  it('le type de société suit les DOMAINES, pas la valeur legacy', async () => {
    const { service } = build(
      context({
        canonicalRow: row({
          offer_domain: 'esn_it',
          offer_domains: ['MECHANICAL_ENGINEERING', 'MAINTENANCE_MRO'],
          offer_portfolio: offerPortfolioSchema.parse({}),
        }),
      }),
    )
    const resolved = await service.read('user-1')
    expect(resolved.source).toBe('portfolio')
    expect(resolved.company_type).toBe('industrial_engineering')
  })

  it('une forme illisible en base ne fait pas tomber la lecture', async () => {
    // Un portefeuille écrit par un build plus récent (champ inconnu, type
    // inattendu) doit dégrader vers les défauts, jamais lever : un profil
    // illisible casserait toute analyse de l'espace.
    // Le TYPE l'interdit ; la colonne `jsonb`, elle, accepte n'importe quoi —
    // c'est exactement ce que la lecture doit encaisser.
    const stored = { company_type: 42, bogus: true } as unknown as EsnProfileEntity['offer_portfolio']
    const { service } = build(context({ canonicalRow: row({ offer_portfolio: stored }) }))
    const resolved = await service.read('user-1')
    expect(resolved.company_type).toBeNull()
  })

  it('écrit sur la ligne CANONIQUE de l’espace, pas sur celle du membre', async () => {
    const canonical = row({ id: 'canonical', user_id: 'owner' })
    const { service, update } = build(context({ canonicalRow: canonical, ownRow: row({ id: 'mine' }) }))
    await service.write('user-1', { target_geographies: ['AURA'] })
    expect(update).toHaveBeenCalledWith({ id: 'canonical' }, expect.anything())
  })

  it('refuse l’écriture à un membre sans team:manage — le portefeuille est celui de la SOCIÉTÉ', async () => {
    const { service, update } = build(context({ role: 'member', canManageCompany: false }))
    await expect(service.write('user-1', {})).rejects.toBeInstanceOf(ForbiddenException)
    expect(update).not.toHaveBeenCalled()
  })

  it('sans espace (chemin historique), écrit sur sa propre ligne', async () => {
    const { service, update } = build(
      context({
        workspaceId: null,
        role: null,
        canManageCompany: false,
        canonicalRow: null,
        ownRow: row({ id: 'mine' }),
      }),
    )
    await service.write('user-1', {})
    expect(update).toHaveBeenCalledWith({ id: 'mine' }, expect.anything())
  })

  it('une écriture PARTIELLE ne remet pas les autres réglages à leur défaut', async () => {
    const stored = offerPortfolioSchema.parse({ target_geographies: ['AURA'], forbidden_terms: ['ESN'] })
    const { service, update } = build(context({ canonicalRow: row({ offer_portfolio: stored }) }))
    await service.write('user-1', { target_geographies: ['PACA'] })
    const written = update.mock.calls[0]?.[1] as {
      offer_portfolio: { target_geographies: string[]; forbidden_terms: string[] }
    }
    expect(written.offer_portfolio.target_geographies).toEqual(['PACA'])
    // Le terme interdit n'était pas dans le patch : il survit.
    expect(written.offer_portfolio.forbidden_terms).toEqual(['ESN'])
  })

  it('laisse une trace au journal partagé — le portefeuille engage toute l’équipe', async () => {
    const { service, insert } = build(context())
    await service.write('user-1', { forbidden_terms: ['ESN'] })
    const row = insert.mock.calls[0]?.[0] as { action_type: string; metadata: { fields: string[] } }
    expect(row.action_type).toBe('profile_updated')
    // Les CLÉS, jamais les valeurs : le lexique d'un espace est sa donnée.
    expect(row.metadata.fields).toEqual(['forbidden_terms'])
    expect(JSON.stringify(row.metadata)).not.toContain('ESN')
  })

  it('une trace en échec ne fait pas perdre le réglage', async () => {
    const { service, update, insert } = build(context())
    insert.mockRejectedValue(new Error('journal indisponible'))
    await expect(service.write('user-1', { target_geographies: ['AURA'] })).resolves.toBeDefined()
    expect(update).toHaveBeenCalled()
  })

  /**
   * D17 — un terme interdit doit EMPÊCHER quelque chose, sinon c'est une case
   * décorative. Ces trois cas sont le refus côté serveur.
   */
  describe('le lexique de l’espace', () => {
    it('refuse de PRÉFÉRER un mot que l’espace s’interdit', async () => {
      const { service, update } = build(context())
      await expect(
        service.write('user-1', {
          forbidden_terms: ['régie'],
          lexicon: { overrides: [{ concept: 'mission', locale: 'fr', one: 'Régie', other: 'Régies' }] },
        }),
      ).rejects.toThrow(BadRequestException)
      expect(update).not.toHaveBeenCalled()
    })

    it('refuse d’interdire un mot du produit sans dire ce qu’on met à la place', async () => {
      const { service, update } = build(context())
      await expect(service.write('user-1', { forbidden_terms: ['Vivier'] })).rejects.toThrow(
        /donne le terme à employer/,
      )
      expect(update).not.toHaveBeenCalled()
    })

    it('… et l’accepte dès que le remplaçant est posé', async () => {
      const { service, update } = build(context())
      await service.write('user-1', {
        forbidden_terms: ['Vivier'],
        lexicon: { overrides: [{ concept: 'talent_pool', locale: 'fr', one: 'Banc', other: 'Bancs' }] },
      })
      const written = update.mock.calls[0]?.[1] as { offer_portfolio: OfferPortfolio }
      expect(written.offer_portfolio.lexicon.overrides).toHaveLength(1)
    })

    /**
     * Le piège que le refus doit couvrir : un patch qui n'envoie QUE les mots
     * interdits ne rencontre pas les termes préférés déjà enregistrés. La règle
     * se juge donc sur le portefeuille FUSIONNÉ, pas sur le patch.
     */
    it('juge le lexique FUSIONNÉ, pas le patch envoyé', async () => {
      const stored = offerPortfolioSchema.parse({
        lexicon: { overrides: [{ concept: 'mission', locale: 'fr', one: 'Régie', other: 'Régies' }] },
      })
      const { service, update } = build(context({ canonicalRow: row({ offer_portfolio: stored }) }))
      await expect(service.write('user-1', { forbidden_terms: ['Régie'] })).rejects.toThrow(BadRequestException)
      expect(update).not.toHaveBeenCalled()
    })

    it('un espace SANS lexique enregistre comme avant — le no-op est strict', async () => {
      const { service, update } = build(context())
      await service.write('user-1', { forbidden_terms: ['ESN', 'cabinet'] })
      const written = update.mock.calls[0]?.[1] as { offer_portfolio: OfferPortfolio }
      expect(written.offer_portfolio.lexicon).toEqual(EMPTY_STRUCTURED_LEXICON)
    })
  })

  /**
   * #2862 (#2437.8) — la moitié VERSIONNÉE de l'épopée : `version`/`updatedAt`/
   * `updatedBy` calculés côté serveur, jamais fournis par le patch.
   */
  describe('la version du lexique (#2862)', () => {
    it('la PREMIÈRE surcharge RÉELLE pose la version à 1, signée par son auteur', async () => {
      const { service, update } = build(context())
      await service.write('user-1', {
        lexicon: { overrides: [{ concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' }] },
      })
      const written = update.mock.calls[0]?.[1] as { offer_portfolio: OfferPortfolio }
      expect(written.offer_portfolio.lexicon.version).toBe(1)
      expect(written.offer_portfolio.lexicon.updatedAt).not.toBeNull()
      // #2862 — recette 27/09 : la version affichée doit nommer QUI l'a posée.
      expect(written.offer_portfolio.lexicon.updatedBy).toBe('user-1')
    })

    it('une écriture qui NE touche pas le lexique garde le MÊME auteur', async () => {
      const ORIGINAL_AUTHOR = '11111111-1111-1111-1111-111111111111'
      const stored = offerPortfolioSchema.parse({
        lexicon: {
          overrides: [{ concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' }],
          version: 3,
          updatedAt: '2026-09-01T00:00:00.000Z',
          updatedBy: ORIGINAL_AUTHOR,
        },
      })
      const { service, update } = build(context({ canonicalRow: row({ offer_portfolio: stored }) }))
      await service.write('user-2', { target_geographies: ['AURA'] })
      const written = update.mock.calls[0]?.[1] as { offer_portfolio: OfferPortfolio }
      expect(written.offer_portfolio.lexicon.updatedBy).toBe(ORIGINAL_AUTHOR)
    })

    it('une écriture qui ne touche PAS le lexique laisse sa version INCHANGÉE', async () => {
      const stored = offerPortfolioSchema.parse({
        lexicon: {
          overrides: [{ concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' }],
          version: 3,
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      })
      const { service, update } = build(context({ canonicalRow: row({ offer_portfolio: stored }) }))
      await service.write('user-1', { target_geographies: ['AURA'] })
      const written = update.mock.calls[0]?.[1] as { offer_portfolio: OfferPortfolio }
      expect(written.offer_portfolio.lexicon.version).toBe(3)
      expect(written.offer_portfolio.lexicon.updatedAt).toBe('2026-09-01T00:00:00.000Z')
    })

    it('renvoyer le MÊME lexique (mêmes surcharges) n’incrémente PAS la version', async () => {
      const stored = offerPortfolioSchema.parse({
        lexicon: {
          overrides: [{ concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' }],
          version: 2,
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      })
      const { service, update } = build(context({ canonicalRow: row({ offer_portfolio: stored }) }))
      await service.write('user-1', {
        lexicon: { overrides: [{ concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' }] },
      })
      const written = update.mock.calls[0]?.[1] as { offer_portfolio: OfferPortfolio }
      expect(written.offer_portfolio.lexicon.version).toBe(2)
      expect(written.offer_portfolio.lexicon.updatedAt).toBe('2026-09-01T00:00:00.000Z')
    })

    it('un contenu RÉELLEMENT différent incrémente la version', async () => {
      const stored = offerPortfolioSchema.parse({
        lexicon: {
          overrides: [{ concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' }],
          version: 2,
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      })
      const { service, update } = build(context({ canonicalRow: row({ offer_portfolio: stored }) }))
      await service.write('user-1', {
        lexicon: { overrides: [{ concept: 'need', locale: 'fr', one: 'Affaire', other: 'Affaires' }] },
      })
      const written = update.mock.calls[0]?.[1] as { offer_portfolio: OfferPortfolio }
      expect(written.offer_portfolio.lexicon.version).toBe(3)
      expect(written.offer_portfolio.lexicon.updatedAt).not.toBe('2026-09-01T00:00:00.000Z')
    })
  })
})
