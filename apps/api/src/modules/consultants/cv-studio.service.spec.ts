import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { CvVersionEntity } from '../../database/entities/cv-version.entity'
import { buildWordDocument } from '../documents/document-builders'
import { CvStudioService, cvVersionToDocSections } from './cv-studio.service'
import { DEFAULT_BRAND_NAME } from '@bellum/contracts'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'

const CV = `YANIS BERTHIER — Ingénieur plateforme (8 ans)
2023-2026 — Ingénieur fiabilité chez Orange.
COMPÉTENCES
Kubernetes, Prometheus, Go.`

function makeService(
  overrides: {
    talent?: unknown
    rule?: string
    policy?: string
    needSkills?: { term: string }[]
    rfpExists?: boolean
    missionComparable?: boolean
    opportunityExists?: boolean
  } = {},
) {
  const saved: Record<string, unknown>[] = []
  const talent =
    'talent' in overrides
      ? overrides.talent
      : {
          id: TALENT,
          workspace_id: WORKSPACE,
          full_name: 'Yanis Berthier',
          title: 'Ingénieur plateforme',
          email: 'yanis@example.fr',
          phone: null,
          stack: ['Kubernetes', 'Kafka'],
          cv_text: CV,
          consent_given_at: null,
          consent_expires_at: null,
          consent_basis: null,
        }
  const manager = {
    // Deux requêtes distinctes partagent ce mock (settingsFor et
    // validationPolicyFor) : on route sur le SQL, sinon la seconde recevrait
    // la réponse de la première.
    query: jest.fn(async (sql: string) => {
      if (sql.includes('cv_validation_policy')) return [{ cv_validation_policy: overrides.policy ?? 'aucune' }]
      if (sql.includes('project_needs')) return [{ skills: overrides.needSkills ?? [] }]
      if (sql.includes('FROM opportunities'))
        return overrides.opportunityExists === false ? [] : [{ id: 'opportunity-1' }]
      if (sql.includes('FROM rfps')) return overrides.rfpExists === false ? [] : [{ id: 'rfp-1' }]
      if (sql.includes('FROM missions')) return overrides.missionComparable === false ? [] : [{ id: 'mission-1' }]
      return [{ anonymisation_rule: overrides.rule ?? 'nom_complet', anonymisation_hide: [] }]
    }),
  }
  const consultants = {
    manager,
    // generate() charge la fiche via une requête CLOISONNÉE (finding #2) :
    // createQueryBuilder(...).where(...).andWhere(...).getOne().
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => talent),
    })),
  } as unknown as Repository<ConsultantEntity>
  const versions = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    create: jest.fn((row: Record<string, unknown>) => row),
    save: jest.fn(async (row: Record<string, unknown>) => {
      saved.push(row)
      return { ...row, id: 'v1', generated_at: new Date('2026-08-20T09:00:00.000Z') }
    }),
  } as unknown as Repository<CvVersionEntity>
  return { service: new CvStudioService(consultants, versions), saved, manager, versions }
}

/**
 * Le studio de dossier de compétences (PDF 3 §9, ticket BEL-ATS-202).
 *
 * Deux règles portent l'écran : une compétence sans preuve est BARRÉE avec sa
 * raison (jamais supprimée en silence), et l'anonymisation est vérifiée
 * INDÉPENDAMMENT après génération — une fonction qui se vérifie elle-même ne
 * vérifie rien.
 */
describe('CvStudioService.generate', () => {
  const input = {
    versionKind: 'client' as const,
    templateKey: 'default',
    language: 'fr' as const,
    needId: null,
  }

  it('BARRE une compétence sans preuve, avec sa raison — jamais en silence', async () => {
    const { service } = makeService()
    const version = await service.generate(TALENT, WORKSPACE, USER, input)
    // « Kafka » est déclaré et absent du CV : le client doit le savoir AVANT
    // de poser la question en soutenance.
    expect(version.excludedSkills.map(entry => entry.term)).toEqual(['Kafka'])
    expect(version.excludedSkills[0]?.reason).toContain('absente du CV source')
  })

  it('énonce ce que le dossier NE PROUVE PAS, dans une section à part', async () => {
    const { service } = makeService()
    const version = await service.generate(TALENT, WORKSPACE, USER, input)
    const section = version.sections.find(entry => entry.title.includes('ne prouve pas'))
    expect(section?.body).toContain('Kafka')
  })

  it('FORCE l’anonymat sur une version anonyme, quelle que soit la règle d’espace', async () => {
    const { service } = makeService({ rule: 'nom_complet' })
    const version = await service.generate(TALENT, WORKSPACE, USER, { ...input, versionKind: 'anonyme' })
    expect(version.anonymisationRule).toBe('initiales')
    // Vérification indépendante : le nom complet ne doit apparaître NULLE PART.
    for (const section of version.sections) expect(section.body).not.toContain('Yanis Berthier')
  })

  it('n’anonymise PAS une version interne — masquer un nom que seule l’ESN lit ne protège personne', async () => {
    const { service } = makeService({ rule: 'initiales' })
    const version = await service.generate(TALENT, WORKSPACE, USER, { ...input, versionKind: 'enrichi' })
    expect(version.anonymisationRule).toBe('nom_complet')
  })

  it('AJOUTE une version, n’en écrase aucune', async () => {
    // Quand un client répond trois semaines plus tard, il faut savoir ce qu'il
    // a reçu. Une ligne écrasée ne le dit plus.
    const { service, saved } = makeService()
    await service.generate(TALENT, WORKSPACE, USER, input)
    await service.generate(TALENT, WORKSPACE, USER, { ...input, versionKind: 'anonyme' })
    expect(saved).toHaveLength(2)
    expect(saved.map(row => row['version_kind'])).toEqual(['client', 'anonyme'])
  })

  it('#2187.31 — nomme QUI a composé la version', async () => {
    const { service } = makeService()
    const version = await service.generate(TALENT, WORKSPACE, USER, input)
    expect(version.generatedBy).toBe(USER)
  })

  it('refuse de composer SANS CV source', async () => {
    const { service } = makeService({ talent: { id: TALENT, workspace_id: WORKSPACE, full_name: 'X', cv_text: null } })
    await expect(service.generate(TALENT, WORKSPACE, USER, input)).rejects.toThrow(UnprocessableEntityException)
  })
})

/**
 * #2333.2/.5/.8/.9/.11 — statut, validation et diff de la version générée.
 *
 * NO-GO (#2333.11) : une version ne s'affirme jamais « adaptée » sans son
 * diff complet, sa policy de validation appliquée et son identité exacte
 * (id, versionKind) — c'est ce que ce bloc vérifie sur CHAQUE génération.
 */
describe('CvStudioService — statut, validation et diff', () => {
  const input = { versionKind: 'client' as const, templateKey: 'default', language: 'fr' as const, needId: null }

  it('policy « aucune » : la génération ELLE-MÊME vaut validation', async () => {
    const { service } = makeService({ policy: 'aucune' })
    const version = await service.generate(TALENT, WORKSPACE, USER, input)
    expect(version.status).toBe('validated')
    expect(version.validatedBy).toBe(USER)
    expect(version.validatedAt).not.toBeNull()
  })

  it('policy « recruteur » : la version reste EN ATTENTE tant que personne ne valide', async () => {
    const { service } = makeService({ policy: 'recruteur' })
    const version = await service.generate(TALENT, WORKSPACE, USER, input)
    expect(version.status).toBe('pending_validation')
    expect(version.validatedBy).toBeNull()
    expect(version.validatedAt).toBeNull()
  })

  it('un consentement EXPIRÉ force la validation, même sur policy « aucune »', async () => {
    const { service } = makeService({
      policy: 'aucune',
      talent: {
        id: TALENT,
        workspace_id: WORKSPACE,
        full_name: 'Yanis Berthier',
        stack: ['Kubernetes'],
        cv_text: CV,
        consent_given_at: new Date('2026-01-01T00:00:00.000Z'),
        consent_expires_at: new Date('2026-02-01T00:00:00.000Z'),
        consent_basis: 'intérêt légitime',
      },
    })
    const version = await service.generate(TALENT, WORKSPACE, USER, input)
    expect(version.status).toBe('pending_validation')
  })

  it('le diff couvre CHAQUE compétence déclarée — retenue avec sa preuve, barrée avec sa raison', async () => {
    const { service } = makeService()
    const version = await service.generate(TALENT, WORKSPACE, USER, input)
    expect(version.changes).toHaveLength(2)
    const retained = version.changes.find(change => change.before.includes('Kubernetes'))
    expect(retained?.after).toBe('retenue dans le dossier')
    expect(retained?.sourceProof).toContain('Kubernetes')
    const excluded = version.changes.find(change => change.before.includes('Kafka'))
    expect(excluded?.after).toBe('retirée du dossier')
    expect(excluded?.reason).toContain('absente du CV source')
    expect(excluded?.sourceProof).toBeNull()
  })

  it('NO-GO : jamais de version sans identité exacte ni diff, même vide de compétences', async () => {
    const { service } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, full_name: 'Yanis Berthier', stack: [], cv_text: CV },
    })
    const version = await service.generate(TALENT, WORKSPACE, USER, input)
    expect(version.id).toBe('v1')
    expect(version.versionKind).toBe('client')
    expect(version.changes).toEqual([])
  })
})

/**
 * #2187.38 (épopée #2943) — les compétences RETENUES qui recoupent le besoin
 * ciblé sont mises en avant, distinctement des autres compétences retenues.
 */
describe('CvStudioService.generate — compétences mises en avant', () => {
  it('met en avant les compétences retenues qui recoupent le besoin ciblé', async () => {
    const needId = 'n0000000-0000-4000-8000-000000000001'
    const { service } = makeService({ needSkills: [{ term: 'kubernetes' }, { term: 'Terraform' }] })
    const version = await service.generate(TALENT, WORKSPACE, USER, {
      versionKind: 'client',
      templateKey: 'default',
      language: 'fr',
      needId,
    })
    expect(version.highlightedSkills).toEqual(['Kubernetes'])
  })

  it('ne met rien en avant sans besoin ciblé', async () => {
    const { service } = makeService()
    const version = await service.generate(TALENT, WORKSPACE, USER, {
      versionKind: 'client',
      templateKey: 'default',
      language: 'fr',
      needId: null,
    })
    expect(version.highlightedSkills).toEqual([])
  })
})

/**
 * #2187.25-27 (épopée #2943) — trois sources de génération : un besoin
 * (déjà là), un appel d'offres, une mission comparable. Chacune est VÉRIFIÉE,
 * jamais devinée sur un identifiant qui ne se contrôle pas.
 */
describe('CvStudioService.generate — sources', () => {
  const opportunityId = 'o0000000-0000-4000-8000-000000000001'
  const rfpId = 'r0000000-0000-4000-8000-000000000001'
  const missionId = 'm0000000-0000-4000-8000-000000000001'

  it('accepte une opportunité qui existe dans l’espace, et la porte sur la version', async () => {
    const { service } = makeService({ opportunityExists: true })
    const version = await service.generate(TALENT, WORKSPACE, USER, {
      versionKind: 'client',
      templateKey: 'default',
      language: 'fr',
      opportunityId,
    })
    expect(version.opportunityId).toBe(opportunityId)
  })

  it('refuse (422) une opportunité introuvable dans SON espace', async () => {
    const { service } = makeService({ opportunityExists: false })
    await expect(
      service.generate(TALENT, WORKSPACE, USER, {
        versionKind: 'client',
        templateKey: 'default',
        language: 'fr',
        opportunityId,
      }),
    ).rejects.toThrow(UnprocessableEntityException)
  })

  it('accepte un appel d’offres qui existe dans l’espace, et le porte sur la version', async () => {
    const { service } = makeService({ rfpExists: true })
    const version = await service.generate(TALENT, WORKSPACE, USER, {
      versionKind: 'client',
      templateKey: 'default',
      language: 'fr',
      rfpId,
    })
    expect(version.rfpId).toBe(rfpId)
  })

  it('refuse (422) un appel d’offres introuvable dans SON espace', async () => {
    const { service } = makeService({ rfpExists: false })
    await expect(
      service.generate(TALENT, WORKSPACE, USER, {
        versionKind: 'client',
        templateKey: 'default',
        language: 'fr',
        rfpId,
      }),
    ).rejects.toThrow(UnprocessableEntityException)
  })

  it('accepte une mission DÉJÀ FAITE par ce consultant comme référence comparable', async () => {
    const { service } = makeService({ missionComparable: true })
    const version = await service.generate(TALENT, WORKSPACE, USER, {
      versionKind: 'client',
      templateKey: 'default',
      language: 'fr',
      comparableMissionId: missionId,
    })
    expect(version.comparableMissionId).toBe(missionId)
  })

  it('refuse (422) une mission qui n’est pas une mission de CE consultant', async () => {
    const { service } = makeService({ missionComparable: false })
    await expect(
      service.generate(TALENT, WORKSPACE, USER, {
        versionKind: 'client',
        templateKey: 'default',
        language: 'fr',
        comparableMissionId: missionId,
      }),
    ).rejects.toThrow(UnprocessableEntityException)
  })
})

/**
 * #2187.42 (épopée #2943) — l'action « Comparer » entre deux versions.
 */
describe('CvStudioService.compare', () => {
  function row(overrides: Record<string, unknown>) {
    return {
      id: 'v1',
      consultant_id: TALENT,
      workspace_id: WORKSPACE,
      status: 'validated',
      validated_by: USER,
      validated_at: new Date('2026-08-20T09:00:00.000Z'),
      sections: [{ title: 'Profil', body: 'Ingénieur plateforme' }],
      excluded_skills: [],
      changes: [],
      highlighted_skills: [],
      anonymisation_rule: 'nom_complet',
      version_kind: 'client',
      template_key: 'default',
      language: 'fr',
      need_id: null,
      generated_at: new Date('2026-08-20T09:00:00.000Z'),
      sent_to_contact_id: null,
      ...overrides,
    }
  }

  it('nomme la section qui a changé entre deux versions, jamais les identiques', async () => {
    const versions = {
      find: jest.fn(async () => [
        row({ id: 'v1', sections: [{ title: 'Profil', body: 'Ingénieur plateforme' }] }),
        row({ id: 'v2', sections: [{ title: 'Profil', body: 'Ingénieur plateforme senior' }] }),
      ]),
    } as unknown as Repository<CvVersionEntity>
    const service = new CvStudioService({} as never, versions)
    const diff = await service.compare(TALENT, 'v1', 'v2', WORKSPACE)
    expect(diff.sections).toEqual([
      { title: 'Profil', before: 'Ingénieur plateforme', after: 'Ingénieur plateforme senior' },
    ])
  })

  it('refuse (NotFound) une version introuvable dans SON espace', async () => {
    const versions = { find: jest.fn(async () => [row({ id: 'v1' })]) } as unknown as Repository<CvVersionEntity>
    const service = new CvStudioService({} as never, versions)
    await expect(service.compare(TALENT, 'v1', 'inconnu', WORKSPACE)).rejects.toThrow(NotFoundException)
  })
})

/**
 * #2187.42 (épopée #2943) — l'action « Modifier ».
 */
describe('CvStudioService.updateSections', () => {
  function row(overrides: Record<string, unknown>) {
    return {
      id: 'v1',
      consultant_id: TALENT,
      workspace_id: WORKSPACE,
      status: 'pending_validation',
      validated_by: null,
      validated_at: null,
      sections: [{ title: 'Profil', body: 'Ingénieur plateforme' }],
      excluded_skills: [],
      changes: [],
      highlighted_skills: [],
      anonymisation_rule: 'nom_complet',
      version_kind: 'client',
      template_key: 'default',
      language: 'fr',
      need_id: null,
      generated_at: new Date('2026-08-20T09:00:00.000Z'),
      sent_to_contact_id: null,
      ...overrides,
    }
  }

  it('modifie les sections d’une version PAS ENCORE validée', async () => {
    const versions = {
      findOne: jest.fn(async () => row({})),
      save: jest.fn(async (updated: Record<string, unknown>) => updated),
    } as unknown as Repository<CvVersionEntity>
    const service = new CvStudioService({} as never, versions)
    const updated = await service.updateSections(TALENT, 'v1', WORKSPACE, [
      { title: 'Profil', body: 'Ingénieur plateforme senior' },
    ])
    expect(updated.sections).toEqual([{ title: 'Profil', body: 'Ingénieur plateforme senior' }])
  })

  it('refuse (422) de modifier une version DÉJÀ VALIDÉE — un client a pu la recevoir', async () => {
    const versions = {
      findOne: jest.fn(async () => row({ status: 'validated' })),
    } as unknown as Repository<CvVersionEntity>
    const service = new CvStudioService({} as never, versions)
    await expect(
      service.updateSections(TALENT, 'v1', WORKSPACE, [{ title: 'Profil', body: 'Modifié' }]),
    ).rejects.toThrow(UnprocessableEntityException)
  })

  it('refuse (NotFound) une version introuvable dans SON espace', async () => {
    const versions = { findOne: jest.fn(async () => null) } as unknown as Repository<CvVersionEntity>
    const service = new CvStudioService({} as never, versions)
    await expect(service.updateSections(TALENT, 'inconnu', WORKSPACE, [])).rejects.toThrow(NotFoundException)
  })
})

describe('CvStudioService.validate', () => {
  it('valide une version EN ATTENTE et nomme QUI l’a fait', async () => {
    const row = {
      id: 'v1',
      consultant_id: TALENT,
      workspace_id: WORKSPACE,
      status: 'pending_validation',
      validated_by: null,
      validated_at: null,
      sections: [],
      excluded_skills: [],
      changes: [],
      anonymisation_rule: 'nom_complet',
      version_kind: 'client',
      template_key: 'default',
      language: 'fr',
      need_id: null,
      generated_at: new Date('2026-08-20T09:00:00.000Z'),
      sent_to_contact_id: null,
    }
    const versions = {
      findOne: jest.fn(async () => row),
      save: jest.fn(async (updated: typeof row) => updated),
    } as unknown as Repository<CvVersionEntity>
    const service = new CvStudioService({} as never, versions)
    const validated = await service.validate(TALENT, 'v1', WORKSPACE, 'validator-1')
    expect(validated.status).toBe('validated')
    expect(validated.validatedBy).toBe('validator-1')
    expect(validated.validatedAt).not.toBeNull()
  })

  it('refuse (NotFound) une version introuvable dans SON espace', async () => {
    const versions = {
      findOne: jest.fn(async () => null),
    } as unknown as Repository<CvVersionEntity>
    const service = new CvStudioService({} as never, versions)
    await expect(service.validate(TALENT, 'inconnu', WORKSPACE, 'validator-1')).rejects.toThrow(NotFoundException)
  })
})

/**
 * L'export, relu depuis le FICHIER produit.
 *
 * Ce qui casse dans un export, c'est la mise en page, et ça ne se voit qu'à
 * l'ouverture chez le client. On relit donc le document, on ne se contente pas
 * de vérifier qu'un buffer est sorti.
 */
describe('l’export du dossier', () => {
  it('produit un DOCX réel, contenant les sections', async () => {
    const { service } = makeService()
    const version = await service.generate(TALENT, WORKSPACE, USER, {
      versionKind: 'client',
      templateKey: 'default',
      language: 'fr',
      needId: null,
    })
    const buffer = await buildWordDocument({
      brandName: DEFAULT_BRAND_NAME,
      title: 'dossier',
      sections: cvVersionToDocSections(version),
    })
    // Un DOCX est une archive ZIP : son entête le prouve mieux qu'une taille.
    expect(buffer.subarray(0, 2).toString('binary')).toBe('PK')
    expect(buffer.byteLength).toBeGreaterThan(1000)
  })

  it('ne produit AUCUN paragraphe vide — les lignes vides d’un CV structurent la lecture, pas le document', () => {
    const sections = cvVersionToDocSections({
      id: 'v1',
      consultantId: TALENT,
      needId: null,
      opportunityId: null,
      rfpId: null,
      comparableMissionId: null,
      versionKind: 'client',
      templateKey: 'default',
      language: 'fr',
      anonymisationRule: 'nom_complet',
      generatedBy: null,
      sections: [{ title: 'Parcours', body: 'Ligne 1\n\n\nLigne 2\n   \n' }],
      excludedSkills: [],
      highlightedSkills: [],
      generatedAt: '2026-08-20T09:00:00.000Z',
      sentToContactId: null,
      // #2333.2/.5/.8/.9/.11 — une version déjà en base ne demande jamais de
      // validation (même défaut que la migration `CvVersionValidation`).
      status: 'validated',
      validatedBy: null,
      validatedAt: null,
      changes: [],
    })
    expect(sections[0]?.paragraphs).toEqual(['Ligne 1', 'Ligne 2'])
  })
})

/**
 * #4559 (cas 5 et 6) — `workspaceId` NUL NE DOIT PAS OUVRIR LA REQUÊTE.
 *
 * Le filtre d'espace n'existait que « si l'espace est résolu » : sans espace, la
 * requête partait nue et l'existence d'un besoin ou d'une opportunité devenait
 * observable. Fail-closed : pas d'espace ⇒ on refuse (opportunité) ou on ne
 * lit rien (besoin), on ne lit jamais « tout ».
 */
describe('CvStudioService.generate — espace non résolu (fail-closed)', () => {
  const sqlOf = (manager: { query: jest.Mock }) => manager.query.mock.calls.map(call => String(call[0]))

  it('refuse (422) une opportunité SANS lire la table quand l’espace est nul', async () => {
    const { service, manager } = makeService({ opportunityExists: true })
    await expect(
      service.generate(TALENT, null, USER, {
        versionKind: 'client',
        templateKey: 'default',
        language: 'fr',
        opportunityId: 'o0000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow(UnprocessableEntityException)
    expect(sqlOf(manager).some(sql => sql.includes('FROM opportunities'))).toBe(false)
  })

  it('ne lit AUCUN besoin quand l’espace est nul — rien n’est mis en avant', async () => {
    const { service, manager } = makeService({ needSkills: [{ term: 'kubernetes' }] })
    const version = await service.generate(TALENT, null, USER, {
      versionKind: 'client',
      templateKey: 'default',
      language: 'fr',
      needId: 'n0000000-0000-4000-8000-000000000001',
    })
    expect(sqlOf(manager).some(sql => sql.includes('project_needs'))).toBe(false)
    expect(version.highlightedSkills).toEqual([])
  })

  // #4559 — le cas jumeau laissé par le premier lot : un appel d'offres d'un autre
  // espace ne doit pas devenir observable (ni stocké) faute d'espace résolu.
  it('refuse (422) un appel d’offres SANS lire la table quand l’espace est nul', async () => {
    const { service, manager } = makeService({ rfpExists: true })
    await expect(
      service.generate(TALENT, null, USER, {
        versionKind: 'client',
        templateKey: 'default',
        language: 'fr',
        rfpId: 'r0000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow(UnprocessableEntityException)
    expect(sqlOf(manager).some(sql => sql.includes('FROM rfps'))).toBe(false)
  })

  // #4559.6 — le même défaut conditionnel sur la mission comparable : sans espace, la requête partait SANS
  // filtre d'espace (une mission d'un autre espace, rattachée au même identifiant, devenait une référence).
  it('refuse (422) une mission comparable SANS lire la table quand l’espace est nul', async () => {
    const { service, manager } = makeService({ missionComparable: true })
    await expect(
      service.generate(TALENT, null, USER, {
        versionKind: 'client',
        templateKey: 'default',
        language: 'fr',
        comparableMissionId: 'm0000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow(UnprocessableEntityException)
    expect(sqlOf(manager).some(sql => sql.includes('FROM missions'))).toBe(false)
  })
})

// #4559 (jumeau) — sans espace, `listVersions` lisait les versions de N'IMPORTE QUEL consultant dont on
// connaît l'identifiant. Fail-closed : aucune version lue.
describe('CvStudioService.listVersions — espace non résolu (fail-closed)', () => {
  it('ne lit rien et rend une liste vide quand l’espace est nul', async () => {
    const { service, versions } = makeService()
    await expect(service.listVersions(TALENT, null)).resolves.toEqual([])
    expect(versions.find).not.toHaveBeenCalled()
  })

  it('avec un espace, filtre toujours sur lui', async () => {
    const { service, versions } = makeService()
    await service.listVersions(TALENT, WORKSPACE)
    expect(versions.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { consultant_id: TALENT, workspace_id: WORKSPACE } }),
    )
  })
})
