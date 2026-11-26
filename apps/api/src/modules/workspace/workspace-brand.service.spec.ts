import { DEFAULT_BRAND_NAME, DEFAULT_COPILOT_NAME } from '@bellum/contracts'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { normalizeHost, WorkspaceBrandService } from './workspace-brand.service'
import type { WorkspaceContextService } from './workspace-context.service'

/**
 * La marque d'un espace.
 *
 * Deux familles de vérifications, et la seconde compte plus que la première :
 * ce que le service ÉCRIT, et ce qu'il refuse d'écrire. Une marque mal
 * normalisée ne casse pas un écran — elle sert la marque d'un client à un
 * autre, ou fait tomber un client en marque blanche sur la nôtre.
 */

const WORKSPACE = 'ws-1'
const USER = 'user-1'

function makeService(rows: Partial<WorkspaceEntity>[] = []) {
  const state = { rows: rows as WorkspaceEntity[] }
  const repo = {
    state,
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        state.rows.find(row =>
          Object.entries(where).every(([key, value]) => {
            // `Not(x)` de TypeORM : on ne simule que ce que le service utilise.
            if (value && typeof value === 'object' && '_type' in (value as object)) {
              return (row as unknown as Record<string, unknown>)[key] !== (value as { _value: unknown })._value
            }
            return (row as unknown as Record<string, unknown>)[key] === value
          }),
        ) ?? null
      )
    }),
    update: jest.fn(async (where: { id: string }, patch: Partial<WorkspaceEntity>) => {
      const row = state.rows.find(r => r.id === where.id)
      if (!row) return { affected: 0 }
      Object.assign(row, patch)
      return { affected: 1 }
    }),
  }
  const context = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })),
    assertRole: jest.fn(async () => ({})),
    isDemoWorkspace: jest.fn(async () => false),
  }
  const service = new WorkspaceBrandService(
    context as unknown as WorkspaceContextService,
    repo as unknown as Repository<WorkspaceEntity>,
  )
  return { service, repo, context }
}

describe('normalizeHost', () => {
  it('ramène un hôte à la forme que la base stocke', () => {
    // Ce que le navigateur peut réellement envoyer dans `Host`.
    for (const input of ['APP.ACME.COM', 'app.acme.com:443', 'https://app.acme.com/', 'app.acme.com.']) {
      expect(normalizeHost(input)).toBe('app.acme.com')
    }
  })

  it('rend `null` sur ce qui ne peut PAS être un domaine', () => {
    // Jamais une valeur approchée : mieux vaut tomber sur la marque du produit
    // que servir celle d'un AUTRE client sur une comparaison approximative.
    for (const input of ['', '   ', 'localhost', 'pas un domaine', '..', '-acme.com', undefined, null]) {
      expect(normalizeHost(input)).toBeNull()
    }
  })
})

describe('WorkspaceBrandService', () => {
  describe('la lecture par DOMAINE — publique, donc bornée', () => {
    it('rend la marque du PRODUIT sur un domaine inconnu, jamais une erreur', async () => {
      // Une 404 dirait à qui balaie les domaines lesquels sont pris. Et l'écran
      // de connexion doit s'afficher de toute façon.
      const { service } = makeService([])
      const brand = await service.getForDomain('inconnu.example.com')
      // ⚠️ On lit les CONSTANTES et on ne recopie pas leurs valeurs : un test
      // qui écrit « Bellum » en dur re-crée à lui seul le problème que ce lot
      // supprime, et il passerait au vert le jour où le produit change de nom
      // sans que rien ne l'ait suivi.
      expect(brand.name).toBe(DEFAULT_BRAND_NAME)
      expect(brand.copilotName).toBe(DEFAULT_COPILOT_NAME)
      expect(brand.isCustom).toBe(false)
    })

    it('rend la marque du produit quand l’en-tête `Host` manque', async () => {
      const { service, repo } = makeService([])
      const brand = await service.getForDomain(undefined)
      expect(brand.isCustom).toBe(false)
      // …et sans même interroger la base : rien à chercher.
      expect(repo.findOne).not.toHaveBeenCalled()
    })

    it('trouve l’espace malgré la casse et le port', async () => {
      const { service } = makeService([
        {
          id: WORKSPACE,
          custom_domain: 'app.acme.com',
          brand_name: 'AcmeSales',
          copilot_name: 'Iris',
        } as WorkspaceEntity,
      ])
      const brand = await service.getForDomain('APP.ACME.COM:443')
      expect(brand.name).toBe('AcmeSales')
      expect(brand.copilotName).toBe('Iris')
      expect(brand.isCustom).toBe(true)
    })
  })

  describe('l’écriture', () => {
    it('distingue « ne touche pas » de « efface »', async () => {
      // `undefined` laisse le champ ; `null` le vide. Les confondre ferait
      // d'un formulaire qui n'envoie qu'un champ un formulaire qui efface les
      // autres.
      const row = { id: WORKSPACE, brand_name: 'AcmeSales', copilot_name: 'Iris' } as WorkspaceEntity
      const { service } = makeService([row])

      await service.update(USER, { brandName: null })
      expect(row.brand_name).toBeNull()
      expect(row.copilot_name).toBe('Iris')
    })

    it('traite une chaîne vide comme un effacement', async () => {
      const row = { id: WORKSPACE, brand_name: 'AcmeSales' } as WorkspaceEntity
      const { service } = makeService([row])
      await service.update(USER, { brandName: '   ' })
      expect(row.brand_name).toBeNull()
    })

    it('normalise l’accent en minuscules avant de l’écrire', async () => {
      // La contrainte SQL n'accepte que des minuscules : laisser passer
      // `#AB12CD` ferait échouer l'écriture en base avec une erreur brute.
      const row = { id: WORKSPACE } as WorkspaceEntity
      const { service } = makeService([row])
      await service.update(USER, { brandAccent: '#AB12CD' })
      expect(row.brand_accent).toBe('#ab12cd')
    })

    it('normalise le domaine avant de l’écrire', async () => {
      const row = { id: WORKSPACE } as WorkspaceEntity
      const { service } = makeService([row])
      await service.update(USER, { customDomain: 'HTTPS://App.Acme.com/' })
      expect(row.custom_domain).toBe('app.acme.com')
    })

    it('REFUSE un domaine déjà pris par un autre espace, avec un 409 qui le dit', async () => {
      // Deux espaces sur le même `Host` rendraient la résolution de TENANT
      // ambiguë — c'est une fuite entre clients, pas un défaut d'affichage.
      const mine = { id: WORKSPACE } as WorkspaceEntity
      const autre = { id: 'ws-2', custom_domain: 'app.acme.com' } as WorkspaceEntity
      const { service } = makeService([mine, autre])

      await expect(service.update(USER, { customDomain: 'app.acme.com' })).rejects.toBeInstanceOf(ConflictException)
      expect(mine.custom_domain).toBeUndefined()
    })

    it('laisse un espace GARDER son propre domaine', async () => {
      // Le contrôle d'unicité exclut la ligne courante : sans ça, renommer sa
      // marque sans toucher au domaine échouerait sur son propre domaine.
      const mine = { id: WORKSPACE, custom_domain: 'app.acme.com' } as WorkspaceEntity
      const { service } = makeService([mine])
      await expect(service.update(USER, { customDomain: 'app.acme.com', brandName: 'Acme' })).resolves.toBeDefined()
      expect(mine.brand_name).toBe('Acme')
    })

    it('exige le rôle propriétaire ou administrateur', async () => {
      // Un réglage qui change ce que TOUTE l'équipe — et tous ses clients —
      // voient ne se prend pas depuis un siège de membre.
      const { service, context } = makeService([{ id: WORKSPACE } as WorkspaceEntity])
      await service.update(USER, { brandName: 'Acme' })
      expect(context.assertRole).toHaveBeenCalledWith(USER, WORKSPACE, ['owner', 'admin'])
    })

    it('REFUSE de renommer la salle de démonstration', async () => {
      /*
       * Le rôle ne protège pas ici : un visiteur de la démo publique EST
       * `owner` de sa salle. Or la ligne `workspaces` n'est pas purgée entre
       * deux baux — seul son contenu l'est. Un nom posé par un visiteur
       * survivrait donc à son passage, et le prospect suivant ouvrirait le
       * produit sous ce nom-là.
       */
      const row = { id: WORKSPACE } as WorkspaceEntity
      const { service, context } = makeService([row])
      context.isDemoWorkspace.mockResolvedValue(true)

      await expect(service.update(USER, { brandName: 'Salut à tous' })).rejects.toBeInstanceOf(ForbiddenException)
      expect(row.brand_name).toBeUndefined()
    })

    it('n’écrit RIEN quand le corps est vide', async () => {
      const { service, repo } = makeService([{ id: WORKSPACE } as WorkspaceEntity])
      await service.update(USER, {})
      expect(repo.update).not.toHaveBeenCalled()
    })
  })
})

/**
 * Théo D settings-espace.N5 — la signature proposée et le pied de document de l'espace. Ce qui compte : ce qui est
 * posé se relit tel quel, un champ vide EFFACE, et un espace qui n'a rien posé n'a NI signature NI pied (jamais une
 * valeur par défaut inventée).
 */
describe('WorkspaceBrandService — identité des documents (N5)', () => {
  it('relit la signature et le pied posés, rognés', async () => {
    const { service } = makeService([
      {
        id: WORKSPACE,
        document_signature: '  L’équipe Altaïs Conseil\n04 78 92 15 60  ',
        document_footer: 'Altaïs Conseil SAS · Document confidentiel',
      },
    ])
    await expect(service.getDocumentIdentity(WORKSPACE)).resolves.toEqual({
      signature: 'L’équipe Altaïs Conseil\n04 78 92 15 60',
      footer: 'Altaïs Conseil SAS · Document confidentiel',
    })
  })

  it('rend null/null quand rien n’est posé — et sans espace — plutôt qu’une valeur par défaut', async () => {
    const { service } = makeService([{ id: WORKSPACE, document_signature: null, document_footer: '   ' }])
    await expect(service.getDocumentIdentity(WORKSPACE)).resolves.toEqual({ signature: null, footer: null })
    await expect(service.getDocumentIdentity(null)).resolves.toEqual({ signature: null, footer: null })
  })

  it('l’administrateur pose les deux ; un champ vidé efface ; un champ absent ne touche à rien', async () => {
    const { service, repo } = makeService([
      { id: WORKSPACE, document_signature: 'Ancienne', document_footer: 'Ancien pied' },
    ])
    await service.update(USER, { documentSignature: '  Nouvelle signature ' })
    expect(repo.state.rows[0]?.document_signature).toBe('Nouvelle signature')
    expect(repo.state.rows[0]?.document_footer).toBe('Ancien pied')

    await service.update(USER, { documentFooter: '   ' })
    expect(repo.state.rows[0]?.document_footer).toBeNull()
    expect(repo.state.rows[0]?.document_signature).toBe('Nouvelle signature')
  })

  it('NON : la salle de démonstration ne change pas l’identité des documents', async () => {
    const { service, context } = makeService([{ id: WORKSPACE }])
    context.isDemoWorkspace.mockResolvedValueOnce(true)
    await expect(service.update(USER, { documentFooter: 'x' })).rejects.toBeInstanceOf(ForbiddenException)
  })
})
