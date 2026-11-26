import { BadRequestException, NotFoundException } from '@nestjs/common'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { RecordEditService } from './record-edit.service'
import type { ProvenanceService } from './provenance.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

describe('RecordEditService', () => {
  let accounts: MockRepository<AccountEntity>
  let contacts: MockRepository<ContactEntity>
  let provenance: { currentSources: jest.Mock; commit: jest.Mock }
  let workspaceContext: { resolveActiveWorkspace: jest.Mock; assertMember: jest.Mock }
  let service: RecordEditService

  beforeEach(() => {
    accounts = createMockRepository<AccountEntity>()
    contacts = createMockRepository<ContactEntity>()
    provenance = { currentSources: jest.fn().mockResolvedValue({}), commit: jest.fn().mockResolvedValue(undefined) }
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      assertMember: jest.fn().mockResolvedValue({}),
    }
    service = new RecordEditService(
      accounts as never,
      contacts as never,
      workspaceContext as unknown as WorkspaceContextService,
      provenance as unknown as ProvenanceService,
    )
  })

  describe('patchAccount', () => {
    it('écrit le champ corrigé et enregistre sa provenance humaine', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'a-1', company_name: 'Groupe TF1' } as AccountEntity)

      const result = await service.patchAccount('u-1', 'a-1', { companyName: 'TF1 PUB' })

      expect(accounts.update).toHaveBeenCalledWith({ id: 'a-1' }, { company_name: 'TF1 PUB' })
      expect(result).toEqual({ updated: ['companyName'], rejected: [] })
      expect(provenance.commit).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'account',
          entityId: 'a-1',
          source: 'human',
          actorId: 'u-1',
          changes: [{ field: 'companyName', oldValue: 'Groupe TF1', newValue: 'TF1 PUB' }],
        }),
      )
    })

    it("n'écrit rien quand la valeur est identique — pas de ligne de journal pour du vide", async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'a-1', company_name: 'ACME' } as AccountEntity)

      const result = await service.patchAccount('u-1', 'a-1', { companyName: '  ACME  ' })

      expect(accounts.update).not.toHaveBeenCalled()
      expect(provenance.commit).not.toHaveBeenCalled()
      expect(result).toEqual({ updated: [], rejected: [] })
    })

    it('laisse un humain effacer un champ', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'a-1', headquarters: 'Paris' } as AccountEntity)

      const result = await service.patchAccount('u-1', 'a-1', { headquarters: null })

      expect(accounts.update).toHaveBeenCalledWith({ id: 'a-1' }, { headquarters: null })
      expect(result.updated).toEqual(['headquarters'])
    })

    // #219.6 (#3231, lot X50) — la déclaration MANUELLE de filiales : la saisie
    // texte devient la liste que lisent Laura et la mémoire marché ; la provenance
    // « saisi à la main » (texte lisible) protège ensuite la liste de l'analyse.
    it('écrit la liste de filiales déclarée à partir de la saisie texte', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'a-1', subsidiaries: [] } as unknown as AccountEntity)

      const result = await service.patchAccount('u-1', 'a-1', { subsidiaries: 'Boursorama, Treezor; treezor' })

      expect(accounts.update).toHaveBeenCalledWith({ id: 'a-1' }, { subsidiaries: ['Boursorama', 'Treezor'] })
      expect(result.updated).toEqual(['subsidiaries'])
    })

    it('compare la saisie à la liste existante (même liste = rien à écrire) et sait l’effacer', async () => {
      accounts.findOne.mockResolvedValueOnce({
        id: 'a-1',
        subsidiaries: ['Boursorama', { name: 'Treezor' }],
      } as unknown as AccountEntity)
      const same = await service.patchAccount('u-1', 'a-1', { subsidiaries: 'Boursorama, Treezor' })
      expect(accounts.update).not.toHaveBeenCalled()
      expect(same.updated).toEqual([])

      accounts.findOne.mockResolvedValueOnce({ id: 'a-1', subsidiaries: ['Boursorama'] } as unknown as AccountEntity)
      await service.patchAccount('u-1', 'a-1', { subsidiaries: null })
      expect(accounts.update).toHaveBeenCalledWith({ id: 'a-1' }, { subsidiaries: [] })
    })

    it("ne touche jamais un compte d'un autre espace", async () => {
      accounts.findOne.mockResolvedValueOnce(null)
      await expect(service.patchAccount('u-1', 'a-9', { companyName: 'X' })).rejects.toBeInstanceOf(NotFoundException)
      expect(accounts.update).not.toHaveBeenCalled()
    })

    it("n'accepte QUE les champs de la liste fermée (le reste est refusé par le schéma)", async () => {
      accounts.findOne.mockResolvedValueOnce({ id: 'a-1', company_name: 'ACME', score: 12 } as never)

      // Un appelant interne qui passerait un champ hors liste ne doit pas le voir
      // atterrir dans l'UPDATE : la correspondance champ → colonne est fermée.
      const result = await service.patchAccount('u-1', 'a-1', { score: 99 } as never)

      expect(accounts.update).not.toHaveBeenCalled()
      expect(result).toEqual({ updated: [], rejected: [] })
    })
  })

  describe('patchContact', () => {
    it('refuse un porteur qui n’est pas membre de l’espace', async () => {
      contacts.findOne.mockResolvedValueOnce({ id: 'c-1', assigned_to: null } as ContactEntity)
      workspaceContext.assertMember.mockRejectedValueOnce(new NotFoundException('Membre introuvable'))

      await expect(
        service.patchContact('u-1', 'c-1', { assignedTo: '22222222-2222-4222-8222-222222222222' }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(contacts.update).not.toHaveBeenCalled()
    })

    it('mappe les champs camelCase vers leurs colonnes', async () => {
      contacts.findOne.mockResolvedValueOnce({ id: 'c-1', linkedin_url: null, full_name: 'Camille' } as ContactEntity)

      await service.patchContact('u-1', 'c-1', { linkedinUrl: 'https://linkedin.example/in/camille' })

      expect(contacts.update).toHaveBeenCalledWith(
        { id: 'c-1' },
        { linkedin_url: 'https://linkedin.example/in/camille' },
      )
    })

    // #2861 (#2437.2) — le niveau DESTINATAIRE de langue est corrigeable au
    // même titre que les autres champs de la fiche.
    it('écrit la langue déclarée du destinataire', async () => {
      contacts.findOne.mockResolvedValueOnce({ id: 'c-1', locale: null, full_name: 'Camille' } as ContactEntity)

      await service.patchContact('u-1', 'c-1', { locale: 'en' })

      expect(contacts.update).toHaveBeenCalledWith({ id: 'c-1' }, { locale: 'en' })
    })

    // #219.8 (#3231) — la relation personne↔entreprise DÉCLARÉE : une correction
    // humaine ordinaire (provenance « saisi à la main »), jamais déduite.
    it('écrit la relation personne↔entreprise déclarée, et sait l’effacer', async () => {
      contacts.findOne.mockResolvedValueOnce({
        id: 'c-1',
        declared_person_company_relation: null,
        full_name: 'Camille',
      } as ContactEntity)
      await service.patchContact('u-1', 'c-1', { declaredPersonCompanyRelation: 'employee_former' })
      expect(contacts.update).toHaveBeenCalledWith(
        { id: 'c-1' },
        { declared_person_company_relation: 'employee_former' },
      )

      contacts.update.mockClear()
      contacts.findOne.mockResolvedValueOnce({
        id: 'c-1',
        declared_person_company_relation: 'employee_former',
        full_name: 'Camille',
      } as ContactEntity)
      await service.patchContact('u-1', 'c-1', { declaredPersonCompanyRelation: null })
      expect(contacts.update).toHaveBeenCalledWith({ id: 'c-1' }, { declared_person_company_relation: null })
    })

    // #2159.62 — corriger l'EMPLOI (titre, entité) à la main est une
    // vérification au même titre qu'un match fournisseur.
    describe('#2159.62 — la correction humaine du titre ou de l’entité vérifie l’emploi', () => {
      it('un titre corrigé avance la date de vérification', async () => {
        contacts.findOne.mockResolvedValueOnce({
          id: 'c-1',
          title: 'Chargé de projet',
          full_name: 'Camille',
        } as ContactEntity)

        await service.patchContact('u-1', 'c-1', { title: 'Chef de projet' })

        const patch = contacts.update.mock.calls[0]?.[1] as Record<string, unknown>
        expect(patch.title).toBe('Chef de projet')
        expect(patch.employment_verified_at).toBeInstanceOf(Date)
      })

      it('une entité corrigée avance la date de vérification', async () => {
        contacts.findOne.mockResolvedValueOnce({ id: 'c-1', entity: 'Acme SA', full_name: 'Camille' } as ContactEntity)

        await service.patchContact('u-1', 'c-1', { entity: 'Acme Holding' })

        const patch = contacts.update.mock.calls[0]?.[1] as Record<string, unknown>
        expect(patch.employment_verified_at).toBeInstanceOf(Date)
      })

      it('un champ SANS rapport avec l’emploi n’avance rien', async () => {
        contacts.findOne.mockResolvedValueOnce({ id: 'c-1', linkedin_url: null, full_name: 'Camille' } as ContactEntity)

        await service.patchContact('u-1', 'c-1', { linkedinUrl: 'https://linkedin.example/in/camille' })

        expect(contacts.update).toHaveBeenCalledWith(
          { id: 'c-1' },
          { linkedin_url: 'https://linkedin.example/in/camille' },
        )
      })

      it('un titre envoyé mais IDENTIQUE (rejeté par l’arbitre) n’avance rien — rien n’a été vérifié', async () => {
        contacts.findOne.mockResolvedValueOnce({
          id: 'c-1',
          title: 'Chef de projet',
          full_name: 'Camille',
        } as ContactEntity)

        const result = await service.patchContact('u-1', 'c-1', { title: '  Chef de projet  ' })

        expect(contacts.update).not.toHaveBeenCalled()
        expect(result).toEqual({ updated: [], rejected: [] })
      })
    })
  })

  describe('createContact', () => {
    const input = { accountId: '11111111-1111-4111-8111-111111111111', fullName: 'Camille Roux' }

    it('estampille la saisie `manual` et pose la provenance humaine', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: input.accountId } as AccountEntity)
      contacts.findOne.mockResolvedValueOnce(null)
      contacts.save.mockImplementationOnce(async (row: Partial<ContactEntity>) => ({ ...row, id: 'c-9' }))

      const saved = await service.createContact('u-1', input)

      expect(contacts.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'manual', workspace_id: 'ws-1', user_id: 'u-1', full_name: 'Camille Roux' }),
      )
      expect(saved.id).toBe('c-9')
      expect(provenance.commit).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'contact', entityId: 'c-9', source: 'human' }),
      )
    })

    it('refuse une deuxième fiche avec la même adresse sur le même compte', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: input.accountId } as AccountEntity)
      contacts.findOne.mockResolvedValueOnce({ id: 'c-1', full_name: 'Camille Roux' } as ContactEntity)

      await expect(service.createContact('u-1', { ...input, email: 'camille@acme.example' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(contacts.save).not.toHaveBeenCalled()
    })

    it("refuse un compte d'un autre espace", async () => {
      accounts.findOne.mockResolvedValueOnce(null)
      await expect(service.createContact('u-1', input)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('#4479 — refuse un nom que la clé du compte porte déjà (accent, casse), au lieu d’un 500', async () => {
      accounts.findOne.mockResolvedValueOnce({ id: input.accountId } as AccountEntity)
      contacts.findOne.mockResolvedValueOnce(null)
      contacts.find.mockResolvedValueOnce([{ id: 'c-1', full_name: 'Camille  ROUX' } as ContactEntity])

      await expect(service.createContact('u-1', { ...input, fullName: 'camille roux' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(contacts.save).not.toHaveBeenCalled()
    })
  })

  describe('suppression réversible', () => {
    it('date la suppression au lieu d’effacer la ligne', async () => {
      contacts.findOne.mockResolvedValueOnce({ id: 'c-1', deleted_at: null } as ContactEntity)

      const result = await service.softDeleteContact('u-1', 'c-1')

      expect(contacts.delete).not.toHaveBeenCalled()
      expect(contacts.update).toHaveBeenCalledWith({ id: 'c-1' }, { deleted_at: expect.any(Date) })
      expect(result.deletedAt).toMatch(/^\d{4}-/)
    })

    it('restaure un contact supprimé', async () => {
      contacts.findOne.mockResolvedValueOnce({ id: 'c-1', deleted_at: new Date() } as ContactEntity)

      await service.restoreContact('u-1', 'c-1')

      expect(contacts.update).toHaveBeenCalledWith({ id: 'c-1' }, { deleted_at: null })
    })

    it('ne fait rien quand le contact est déjà vivant', async () => {
      contacts.findOne.mockResolvedValueOnce({ id: 'c-1', deleted_at: null } as ContactEntity)
      await service.restoreContact('u-1', 'c-1')
      expect(contacts.update).not.toHaveBeenCalled()
    })
  })
})
