import { NotFoundException } from '@nestjs/common'
import { TalentService } from './talent.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'

const SKILL_ROW = {
  id: 's1',
  skill: 'kubernetes',
  raw_label: 'K8s' as string | null,
  level: 'expert',
  years: 6,
  last_used_year: 2026,
  source: 'interview',
  created_at: '2026-08-01T09:00:00.000Z',
}

const EXPERIENCE_ROW = {
  id: 'e1',
  entreprise: 'Acme SSII',
  client_final: 'Grand Groupe',
  client_masked: false,
  client_masked_reason: null,
  secteur: 'Banque',
  role: 'Tech Lead',
  date_debut: '2022-01-01',
  date_fin: '2023-06-30',
  contexte: 'Migration cloud',
  realisations: 'Réduction de 30% des coûts',
  technologies: ['kubernetes', 'terraform'],
  responsabilites: 'Pilotage technique',
  preuve: 'CV, section « expériences »',
  created_at: '2026-08-01T09:00:00.000Z',
}

function makeService(overrides: Record<string, unknown> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('SELECT count(*)')) return [{ count: String(overrides['total'] ?? 0) }]
      if (sql.includes('FROM workspaces WHERE id')) {
        return [
          {
            talent_retention_months: overrides['months'] ?? 24,
            talent_retention_enabled: overrides['enabled'] ?? false,
          },
        ]
      }
      if (sql.includes('SELECT c.* FROM consultants')) return (overrides['rows'] as unknown[]) ?? []
      if (sql.includes('FROM mission_assignments ma')) return (overrides['missions'] as unknown[]) ?? []
      if (sql.includes('FROM mission_assignments')) return (overrides['assignments'] as unknown[]) ?? []
      // #3068 — les interruptions déclarées et PAS ENCORE confirmées.
      if (sql.includes('FROM mission_interruptions')) return (overrides['unconfirmedInterruptions'] as unknown[]) ?? []
      if (sql.includes('FROM submissions WHERE consultant_id')) return (overrides['submissions'] as unknown[]) ?? []
      if (sql.includes('FROM consultant_skills\n')) return (overrides['typedSkills'] as unknown[]) ?? []
      if (sql.includes('FROM profiles')) return (overrides['profiles'] as unknown[]) ?? []
      if (sql.includes('FROM user_favorites')) return (overrides['favorites'] as unknown[]) ?? []
      if (sql.includes('INSERT INTO user_favorites') || sql.includes('DELETE FROM user_favorites')) return []
      // `UPDATE … RETURNING` : le pilote Postgres de TypeORM rend `[lignes, nombre]`.
      if (sql.includes('UPDATE consultant_documents')) {
        const archived = (overrides['archived'] as number | undefined) ?? 1
        return [archived > 0 ? [{ id: 'doc-1' }] : [], archived]
      }
      if (sql.includes('FROM consultant_documents')) return (overrides['documents'] as unknown[]) ?? []
      if (sql.includes('FROM talent_prepared_messages')) return (overrides['preparedMessages'] as unknown[]) ?? []
      if (sql.includes('INSERT INTO consultant_skills'))
        return overrides['skillConflict'] === true ? [] : [{ id: 's1' }]
      return []
    }),
  }

  const talent = {
    id: TALENT,
    workspace_id: WORKSPACE,
    kind: 'candidate',
    cv_text: overrides['cvText'] ?? null,
    last_contact_at: null,
    created_at: new Date('2023-01-01T00:00:00.000Z'),
  }
  const consultants = {
    manager,
    findOne: jest.fn(async () => (overrides['missing'] === true ? null : talent)),
    find: jest.fn(async () => (overrides['candidates'] as unknown[]) ?? []),
    save: jest.fn(async (entity: unknown) => entity),
    delete: jest.fn(async () => ({ affected: 1 })),
  }
  const skills = {
    manager,
    find: jest.fn(async () => [SKILL_ROW]),
    findOne: jest.fn(async () => SKILL_ROW),
    delete: jest.fn(async () => ({ affected: overrides['missingSkill'] === true ? 0 : 1 })),
    update: jest.fn(async (_where: unknown, _patch: Record<string, unknown>) => ({ affected: 1 })),
  }
  const experiences = {
    manager,
    find: jest.fn(async () => (overrides['experienceRows'] as unknown[]) ?? [EXPERIENCE_ROW]),
    findOne: jest.fn(async () => (overrides['missingExperience'] === true ? null : EXPERIENCE_ROW)),
    create: jest.fn((entity: unknown) => entity),
    save: jest.fn(async (entity: Record<string, unknown>) => ({ ...EXPERIENCE_ROW, ...entity })),
  }
  const documents = {
    manager,
    save: jest.fn(async (entity: unknown) => entity),
    create: jest.fn((entity: unknown) => entity),
    delete: jest.fn(async () => ({ affected: 1 })),
  }
  const preparedMessages = {
    manager,
    save: jest.fn(async (entity: unknown) => entity),
    create: jest.fn((entity: unknown) => entity),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
  const geocodeCalls: string[] = []
  const geocoding = {
    geocode: jest.fn(async (query: string) => {
      geocodeCalls.push(query)
      return overrides['geocoded'] === undefined
        ? { latitude: 48.8566, longitude: 2.3522 }
        : (overrides['geocoded'] as { latitude: number; longitude: number } | null)
    }),
  }

  const service = new TalentService(
    consultants as never,
    skills as never,
    experiences as never,
    documents as never,
    preparedMessages as never,
    workspaceContext as never,
    geocoding as never,
  )
  return {
    service,
    consultants,
    skills,
    experiences,
    documents,
    preparedMessages,
    queries,
    manager,
    talent,
    geocoding,
    geocodeCalls,
  }
}

// #3812.1 — `consultant_skills` est la source canonique, `consultants.stack` son
// miroir : une compétence ajoutée ou retirée dans l'onglet Compétences se
// retrouve dans la liste libre (fiche, matching, Laura), et inversement
// (`consultants.service.ts` sème déjà stack → consultant_skills).
describe('TalentService — onglet Compétences → liste libre (#3812.1)', () => {
  const input = (skill: string) => ({
    skill,
    level: 'autonome' as const,
    years: null,
    lastUsedYear: null,
    source: 'declared' as const,
  })

  it('ajouter « Vue » dans l’onglet l’ajoute à la liste libre de la fiche', async () => {
    const { service, consultants, talent } = makeService()
    Object.assign(talent, { stack: ['Java'] })
    await service.upsertSkill(TALENT, WORKSPACE, input('Vue'))
    expect(consultants.save).toHaveBeenCalledTimes(1)
    expect((consultants.save.mock.calls[0]?.[0] as { stack: string[] }).stack).toEqual(['Java', 'Vue'])
  })

  it('une compétence déjà là sous un autre libellé (K8s / Kubernetes) ne s’ajoute pas deux fois', async () => {
    const { service, consultants, talent } = makeService()
    Object.assign(talent, { stack: ['Kubernetes'] })
    await service.upsertSkill(TALENT, WORKSPACE, input('K8s'))
    expect(consultants.save).not.toHaveBeenCalled()
  })

  it('retirer une compétence de l’onglet la retire de la liste libre, sans toucher aux autres', async () => {
    const { service, consultants, talent } = makeService()
    Object.assign(talent, { stack: ['Java', 'K8s'] })
    await service.removeSkill(TALENT, WORKSPACE, 's1')
    expect((consultants.save.mock.calls[0]?.[0] as { stack: string[] }).stack).toEqual(['Java'])
  })

  it('retirer une compétence absente de la liste libre n’écrit rien', async () => {
    const { service, consultants, talent } = makeService()
    Object.assign(talent, { stack: ['Java'] })
    await service.removeSkill(TALENT, WORKSPACE, 's1')
    expect(consultants.save).not.toHaveBeenCalled()
  })
})

// Recette 21/10 C.1/C.2 — une fiche ANCIENNE garde « java spring vue » d'un trait.
describe('TalentService.listSkills — compétences collées (recette 21/10 C.1)', () => {
  it('découpe « java spring vue » en trois lignes sans doublon, et retire la ligne collée', async () => {
    const { service, skills, queries } = makeService()
    skills.find.mockResolvedValueOnce([
      { ...SKILL_ROW, id: 'glued', skill: 'java spring vue', raw_label: null },
      { ...SKILL_ROW, id: 'sp', skill: 'spring', raw_label: null },
    ])
    await service.listSkills(TALENT, WORKSPACE)
    const inserted = queries
      .filter(q => q.sql.includes('INSERT INTO consultant_skills'))
      .map(q => q.params[2])
      .sort()
    expect(inserted).toEqual(['java', 'spring', 'vue.js'])
    expect(skills.delete).toHaveBeenCalledWith({ id: 'glued', consultant_id: TALENT })
    expect(skills.find).toHaveBeenCalledTimes(2)
  })

  it('une ligne « java » au libellé brut collé : Spring et Vue ajoutées, libellé vidé', async () => {
    const { service, skills, queries } = makeService()
    skills.find.mockResolvedValueOnce([{ ...SKILL_ROW, id: 'j', skill: 'java', raw_label: 'java spring vue' }])
    await service.listSkills(TALENT, WORKSPACE)
    expect(
      queries
        .filter(q => q.sql.includes('INSERT INTO consultant_skills'))
        .map(q => q.params[2])
        .sort(),
    ).toEqual(['spring', 'vue.js'])
    expect(skills.update).toHaveBeenCalledWith({ id: 'j', consultant_id: TALENT }, { raw_label: null })
    expect(skills.delete).not.toHaveBeenCalled()
  })

  it('une fiche saine ne déclenche aucune écriture', async () => {
    const { service, skills, queries } = makeService()
    await service.listSkills(TALENT, WORKSPACE)
    expect(queries.some(q => q.sql.includes('INSERT INTO consultant_skills'))).toBe(false)
    expect(skills.find).toHaveBeenCalledTimes(1)
  })
})

describe('TalentService.upsertSkill', () => {
  it('CANONISE la compétence — « K8s » et « Kubernetes » sont la même ligne', async () => {
    // Sans ça, le vivier contient deux compétences qui ne se rencontrent jamais
    // et le matching produit des faux négatifs silencieux.
    const { service, queries } = makeService()
    await service.upsertSkill(TALENT, WORKSPACE, {
      skill: 'K8s',
      level: 'expert',
      years: 6,
      lastUsedYear: 2026,
      source: 'interview',
    })
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO consultant_skills'))
    expect(insert?.params[1]).toBe('kubernetes')
  })

  it('GARDE le libellé d’origine — l’effacer serait une correction non demandée', async () => {
    const { service, queries } = makeService()
    await service.upsertSkill(TALENT, WORKSPACE, {
      skill: 'K8s',
      level: 'autonome',
      years: null,
      lastUsedYear: null,
      source: 'declared',
    })
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO consultant_skills'))
    expect(insert?.params[2]).toBe('K8s')
  })

  it('ne recopie PAS le libellé quand il est déjà canonique', async () => {
    // « kubernetes » affiché deux fois côte à côte a l'air d'un bug.
    const { service, queries } = makeService()
    await service.upsertSkill(TALENT, WORKSPACE, {
      skill: 'kubernetes',
      level: 'autonome',
      years: null,
      lastUsedYear: null,
      source: 'declared',
    })
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO consultant_skills'))
    expect(insert?.params[2]).toBeNull()
  })

  it('écrit un UPSERT et non un insert nu', async () => {
    // Deux lignes « kubernetes » sur la même fiche afficheraient deux niveaux
    // contradictoires, et le matching en compterait deux.
    const { service, queries } = makeService()
    await service.upsertSkill(TALENT, WORKSPACE, {
      skill: 'Java',
      level: 'confirme',
      years: 3,
      lastUsedYear: 2025,
      source: 'cv',
    })
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO consultant_skills'))
    expect(insert?.sql).toContain('ON CONFLICT (consultant_id, skill)')
    expect(insert?.sql).toContain('DO UPDATE')
  })

  it('refuse un talent d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(
      service.upsertSkill(TALENT, WORKSPACE, {
        skill: 'Java',
        level: 'autonome',
        years: null,
        lastUsedYear: null,
        source: 'declared',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('TalentService.validateSkill (#2328.6/.11/.12/.13/.14/.26)', () => {
  it('pose la validation SANS toucher `level`, `source` ni `raw_label`', async () => {
    // #2328.26 — une validation ENRICHIT le graphe, elle ne supprime pas la
    // source initiale : `update()` ne doit recevoir QUE les colonnes de preuve.
    const { service, skills } = makeService()
    await service.validateSkill(TALENT, WORKSPACE, 's1', {
      validatedBy: 'recruiter',
      validatedLevel: 'expert',
      certification: true,
    })
    expect(skills.update).toHaveBeenCalledTimes(1)
    const [, patch] = skills.update.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(patch).not.toHaveProperty('level')
    expect(patch).not.toHaveProperty('source')
    expect(patch).not.toHaveProperty('raw_label')
    expect(patch.validated_level).toBe('expert')
    expect(patch.certification).toBe(true)
    expect(patch.validated_by_recruiter_at).toBeInstanceOf(Date)
    expect(patch).not.toHaveProperty('validated_by_consultant_at')
  })

  it('horodate le validateur CONSULTANT, distinctement du recruteur', async () => {
    const { service, skills } = makeService()
    await service.validateSkill(TALENT, WORKSPACE, 's1', { validatedBy: 'consultant' })
    const [, patch] = skills.update.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(patch.validated_by_consultant_at).toBeInstanceOf(Date)
    expect(patch).not.toHaveProperty('validated_by_recruiter_at')
  })

  it('refuse une compétence introuvable', async () => {
    const { service, skills } = makeService()
    skills.update = jest.fn(async (_where: unknown, _patch: Record<string, unknown>) => ({ affected: 0 }))
    await expect(
      service.validateSkill(TALENT, WORKSPACE, 'unknown', { validatedBy: 'consultant' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuse un talent d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(service.validateSkill(TALENT, WORKSPACE, 's1', { validatedBy: 'consultant' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

describe('TalentService.validateSkill — expérience/projet source (#2328.9/.10)', () => {
  it('cite l’expérience qui prouve la compétence', async () => {
    const { service, skills, experiences } = makeService()
    await service.validateSkill(TALENT, WORKSPACE, 's1', { validatedBy: 'recruiter', sourceExperienceId: 'e1' })
    expect(experiences.findOne).toHaveBeenCalledWith({ where: { id: 'e1', consultant_id: TALENT } })
    const [, patch] = skills.update.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(patch.source_experience_id).toBe('e1')
  })

  it('refuse une expérience qui n’appartient pas à ce talent — jamais une preuve empruntée', async () => {
    const { service } = makeService({ missingExperience: true })
    await expect(
      service.validateSkill(TALENT, WORKSPACE, 's1', { validatedBy: 'recruiter', sourceExperienceId: 'e1' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('retire la citation avec `null`, sans supprimer l’expérience elle-même', async () => {
    const { service, skills, experiences } = makeService()
    await service.validateSkill(TALENT, WORKSPACE, 's1', { validatedBy: 'recruiter', sourceExperienceId: null })
    expect(experiences.findOne).not.toHaveBeenCalled()
    const [, patch] = skills.update.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(patch.source_experience_id).toBeNull()
  })

  it('pose le projet source', async () => {
    const { service, skills } = makeService()
    await service.validateSkill(TALENT, WORKSPACE, 's1', {
      validatedBy: 'recruiter',
      sourceExperienceId: 'e1',
      sourceProject: 'Migration cloud',
    })
    const [, patch] = skills.update.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(patch.source_project).toBe('Migration cloud')
  })
})

describe('TalentService.listExperiences / addExperience (#2328.22/.23)', () => {
  it('rend les expériences du talent', async () => {
    const { service } = makeService()
    const rows = await service.listExperiences(TALENT, WORKSPACE)
    expect(rows).toEqual([
      expect.objectContaining({ id: 'e1', entreprise: 'Acme SSII', technologies: ['kubernetes', 'terraform'] }),
    ])
  })

  it('#3935 — rend la précision de chaque date ; une saisie à la main n’en porte aucune', async () => {
    const { service, experiences } = makeService()
    ;(experiences.find as jest.Mock).mockResolvedValueOnce([
      {
        id: 'e9',
        consultant_id: TALENT,
        date_debut: '2019-01-01',
        date_debut_precision: 'year',
        date_fin: null,
        date_fin_precision: null,
        technologies: [],
        created_at: new Date('2026-10-09T00:00:00.000Z'),
      },
    ])
    const [row] = await service.listExperiences(TALENT, WORKSPACE)
    expect(row).toMatchObject({ dateDebut: '2019-01-01', dateDebutPrecision: 'year', dateFinPrecision: null })

    await service.addExperience(TALENT, WORKSPACE, {
      entreprise: 'Acme SSII',
      clientFinal: null,
      clientMasked: false,
      clientMaskedReason: null,
      secteur: null,
      role: 'Tech Lead',
      dateDebut: '2022-01-01',
      dateFin: null,
      contexte: null,
      realisations: null,
      technologies: [],
      responsabilites: null,
      preuve: null,
    })
    const created = (experiences.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>
    expect(created).toMatchObject({ date_debut_precision: null, date_fin_precision: null })
  })

  it('ajoute une expérience', async () => {
    const { service, experiences } = makeService()
    const row = await service.addExperience(TALENT, WORKSPACE, {
      entreprise: 'Acme SSII',
      clientFinal: 'Grand Groupe',
      clientMasked: false,
      clientMaskedReason: null,
      secteur: 'Banque',
      role: 'Tech Lead',
      dateDebut: '2022-01-01',
      dateFin: '2023-06-30',
      contexte: 'Migration cloud',
      realisations: 'Réduction de 30% des coûts',
      technologies: ['kubernetes'],
      responsabilites: 'Pilotage technique',
      preuve: 'CV, section « expériences »',
    })
    expect(experiences.create).toHaveBeenCalledWith(expect.objectContaining({ consultant_id: TALENT }))
    expect(row.entreprise).toBe('Acme SSII')
  })

  it('#3935.2b — une expérience saisie à la main porte la provenance human sur chaque champ renseigné', async () => {
    const { service, experiences } = makeService()
    await service.addExperience(TALENT, WORKSPACE, {
      entreprise: 'Acme SSII',
      clientFinal: null,
      clientMasked: false,
      clientMaskedReason: null,
      secteur: null,
      role: 'Tech Lead',
      dateDebut: '2022-01-01',
      dateFin: null,
      contexte: null,
      realisations: null,
      technologies: [],
      responsabilites: null,
      preuve: null,
    })
    const created = (experiences.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>
    // Ce qu'un humain a écrit est protégé contre toute relecture de CV ; un
    // champ laissé vide reste ouvert (la lecture peut le remplir).
    expect(created['field_provenance']).toEqual({ entreprise: 'human', role: 'human', date_debut: 'human' })
  })

  it('refuse un client masqué SANS raison — jamais un masquage inventé (#2328.23)', async () => {
    const { service } = makeService()
    await expect(
      service.addExperience(TALENT, WORKSPACE, {
        entreprise: null,
        clientFinal: null,
        clientMasked: true,
        clientMaskedReason: null,
        secteur: null,
        role: null,
        dateDebut: null,
        dateFin: null,
        contexte: null,
        realisations: null,
        technologies: [],
        responsabilites: null,
        preuve: null,
      }),
    ).rejects.toThrow('Un client masqué doit porter sa raison')
  })

  it('refuse un talent d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(service.listExperiences(TALENT, WORKSPACE)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('TalentService.addDocument', () => {
  const cv = {
    kind: 'cv' as const,
    filename: 'cv.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    text: 'Consultant Java confirmé, Kubernetes en production depuis 2021.',
  }

  it('renseigne `cv_text` quand le talent n’en avait pas', async () => {
    const { service, consultants } = makeService({ documents: [docRow()] })
    await service.addDocument(TALENT, WORKSPACE, USER, cv)
    expect(consultants.save).toHaveBeenCalledWith(expect.objectContaining({ cv_text: cv.text }))
  })

  it('n’ÉCRASE PAS un `cv_text` déjà là', async () => {
    // Le texte présent peut avoir été corrigé à la main ; un import le
    // remplacerait sans que personne l'ait demandé.
    const { service, consultants } = makeService({ cvText: 'Version relue à la main', documents: [docRow()] })
    await service.addDocument(TALENT, WORKSPACE, USER, cv)
    expect(consultants.save).not.toHaveBeenCalled()
  })

  it('ajoute les compétences reconnues SANS écraser un niveau saisi', async () => {
    const { service, queries } = makeService({ documents: [docRow()] })
    const result = await service.addDocument(TALENT, WORKSPACE, USER, cv)
    const inserts = queries.filter(entry => entry.sql.includes('INSERT INTO consultant_skills'))
    expect(inserts.length).toBeGreaterThan(0)
    // `DO NOTHING` : ce qui a été saisi à la main a plus de valeur qu'une
    // extraction, et le perdre découragerait la saisie.
    expect(inserts[0]?.sql).toContain('DO NOTHING')
    expect(result.skillsAdded).toBeGreaterThan(0)
  })

  it('#2328.24 — marque une compétence extraite `inferred` et de niveau `inconnu`, jamais `autonome`', async () => {
    // NO-GO de l'épopée : « le moteur déclare une compétence maîtrisée
    // uniquement parce que son mot apparaît quelque part dans le CV ». Un mot
    // trouvé par `extractSkills` n'est PAS une expérience détaillée — il ne
    // peut donc jamais poser un niveau qui prétend une maîtrise.
    const { service, queries } = makeService({ documents: [docRow()] })
    await service.addDocument(TALENT, WORKSPACE, USER, cv)
    const inserts = queries.filter(entry => entry.sql.includes('INSERT INTO consultant_skills'))
    expect(inserts.length).toBeGreaterThan(0)
    for (const insert of inserts) {
      expect(insert.sql).toContain("'inconnu'")
      expect(insert.sql).toContain('true')
      expect(insert.sql).not.toContain("'autonome'")
    }
  })

  it('ne cherche AUCUNE compétence dans un document qui n’est pas un CV', async () => {
    const { service, queries } = makeService({ documents: [docRow()] })
    await service.addDocument(TALENT, WORKSPACE, USER, { ...cv, kind: 'certificate' })
    expect(queries.filter(entry => entry.sql.includes('INSERT INTO consultant_skills'))).toHaveLength(0)
  })

  it('coupe un texte trop long et le DIT', async () => {
    const { service } = makeService({ documents: [docRow()] })
    const result = await service.addDocument(TALENT, WORKSPACE, USER, { ...cv, text: 'x'.repeat(250_000) })
    expect(result.truncated).toBe(true)
  })
})

/** #2327.22 — « aucun document source n'est supprimé ». */
describe('TalentService.removeDocument', () => {
  it('ARCHIVE le document au lieu de le supprimer', async () => {
    const { service, documents, queries } = makeService()
    await service.removeDocument(TALENT, WORKSPACE, 'doc-1')
    expect(documents.delete).not.toHaveBeenCalled()
    const archive = queries.find(call => call.sql.includes('UPDATE consultant_documents'))
    expect(archive?.sql).toContain('archived_at = now()')
    // #4034.6 — filtré par ESPACE aussi, jamais `where id` seul.
    expect(archive?.params).toEqual(['doc-1', TALENT, WORKSPACE])
  })

  it('ne liste plus un document archivé', async () => {
    const { service, queries } = makeService()
    await service.listDocuments(TALENT, WORKSPACE)
    const list = queries.find(call => call.sql.includes('FROM consultant_documents d'))
    expect(list?.sql).toContain('d.archived_at IS NULL')
  })

  it('404 quand rien n’a été archivé', async () => {
    const { service } = makeService({ archived: 0 })
    await expect(service.removeDocument(TALENT, WORKSPACE, 'doc-1')).rejects.toThrow('Document introuvable')
  })
})

/** #2185.51 — un brouillon, jamais un envoi. */
describe('TalentService.prepareMessage', () => {
  it('enregistre le brouillon et le relit, avec le nom de son auteur', async () => {
    const { service, preparedMessages } = makeService({ preparedMessages: [preparedMessageRow()] })
    const result = await service.prepareMessage(TALENT, WORKSPACE, USER, {
      channel: 'email',
      subject: 'Suite de notre échange',
      body: 'Bonjour, ...',
    })
    expect(preparedMessages.save).toHaveBeenCalledWith(
      expect.objectContaining({ consultant_id: TALENT, channel: 'email', body: 'Bonjour, ...', prepared_by: USER }),
    )
    expect(result.preparedByName).toBe('Louis Schlegel')
  })

  it('n’écrit AUCUNE colonne d’envoi — un brouillon, jamais un envoi', async () => {
    const { service, preparedMessages } = makeService({ preparedMessages: [preparedMessageRow()] })
    await service.prepareMessage(TALENT, WORKSPACE, USER, { channel: 'phone', body: 'À rappeler.' })
    const saved = preparedMessages.save.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Object.keys(saved)).not.toContain('sent_at')
    expect(Object.keys(saved)).not.toContain('sentAt')
  })
})

describe('TalentService.listPreparedMessages', () => {
  it('nomme un auteur disparu de l’espace par son e-mail, jamais silencieusement', async () => {
    const { service } = makeService({
      preparedMessages: [{ ...preparedMessageRow(), first_name: null, last_name: null }],
    })
    const [message] = await service.listPreparedMessages(TALENT, WORKSPACE)
    expect(message?.preparedByName).toBe('louis@esn.fr')
  })
})

describe('TalentService.search', () => {
  it('exige TOUTES les compétences demandées, pas au moins une', async () => {
    // Un besoin « Java ET Kubernetes » satisfait par « Java seul » fait perdre
    // le rendez-vous.
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { skills: ['Java', 'K8s'], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    // #3830.4 — un `EXISTS` par compétence demandée, joints par AND : les deux
    // doivent être vrais, jamais « au moins un ».
    expect(read?.sql.match(/EXISTS \(/g)?.length).toBe(2)
    expect(read?.sql).toContain(') AND EXISTS (')
  })

  it('canonise les compétences du filtre — chercher « K8s » trouve « kubernetes »', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { skills: ['K8s'], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.params).toContainEqual('kubernetes')
  })

  // #3830.4 (recette prod 08/10, 8c42a4032c) — /consultants, filtre compétences : « Analyse de
  // risque » et « risque » rendaient 0 alors que la ligne d'Alexandre Avakian affiche ce chip.
  // `canonicalSkill` ne connaît pas « risque » (hors référentiel) : le filtre retombait sur une
  // égalité EXACTE contre la colonne canonique, qui n'est jamais ce qu'affiche la fiche quand la
  // personne a écrit un libellé libre (`raw_label`). Le filtre doit aussi chercher en SOUS-CHAÎNE
  // dans ce qui est AFFICHÉ (`raw_label`, à défaut `skill`), insensible à la casse et aux accents.
  it('trouve une compétence par sous-chaîne de ce qui est affiché, même hors référentiel', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { skills: ['risque'], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('coalesce(cs.raw_label, cs.skill)')
    expect(read?.sql.toLowerCase()).toContain('like')
    expect(read?.params).toContainEqual('%risque%')
  })

  it('la sous-chaîne est insensible aux accents (« Sécurité » retrouve « sécurité des SI »)', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { skills: ['Sécurité'], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.params).toContainEqual('%securite%')
  })

  it('N’ÉCARTE PAS un talent sans TJM sur un filtre de prix', async () => {
    // « Pas de prix » n'est pas « trop cher » : l'écarter cacherait le profil
    // le plus souvent négociable.
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { maxTjm: 600, skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('c.tjm IS NULL OR')
  })

  it('N’ÉCARTE PAS non plus un talent sans TJM sur le plancher', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { minTjm: 400, skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('c.tjm IS NULL OR c.tjm >=')
  })

  it('#2183.52 — filtre sur le statut de revue, pour retrouver les exceptions d’un import', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { reviewStatus: 'needs_review', skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('c.review_status =')
    expect(read?.params).toContainEqual('needs_review')
  })

  it('filtre sur le secteur — colonne existante, critère neuf (PDF-22 §01)', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { sector: 'Banque', skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('= ANY(c.sectors)')
    expect(read?.params).toContainEqual('Banque')
  })

  it('filtre sur le mode de travail (`remote_preference`)', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { remotePreference: 'hybride', skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('c.remote_preference =')
    expect(read?.params).toContainEqual('hybride')
  })

  it('« CV disponible » ne filtre RIEN quand la bascule est absente', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).not.toContain('cv_text IS NOT NULL')
  })

  it('« CV disponible » filtre sur un CV source non vide', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { cvAvailable: true, skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('c.cv_text IS NOT NULL AND length(trim(c.cv_text)) > 0')
  })

  it('filtre sur une langue parlée, par son code', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { language: 'en', skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('jsonb_array_elements(c.languages)')
    expect(read?.params).toContainEqual('en')
  })

  it('pagine sans tout charger', async () => {
    const { service, queries } = makeService({ total: 137 })
    const page = await service.search(WORKSPACE, { skills: [], page: 3, limit: 25 })
    expect(page.total).toBe(137)
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.params.slice(-2)).toEqual([25, 50])
  })

  it('N’ÉCARTE PAS un talent sans années d’expérience saisies', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { minYearsExperience: 5, skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('c.years_experience IS NULL OR c.years_experience >=')
    expect(read?.params).toContainEqual(5)
  })
})

describe('TalentService.search — le rayon en km (décision du 31/08/2026)', () => {
  it('géocode la ville cherchée, puis filtre en SQL par distance haversine', async () => {
    const { service, queries, geocodeCalls } = makeService()
    await service.search(WORKSPACE, { zone: 'Paris', radiusKm: 50, skills: [], page: 1, limit: 25 })

    expect(geocodeCalls).toEqual(['Paris'])
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('acos')
    expect(read?.sql).toContain('c.latitude IS NOT NULL AND c.longitude IS NOT NULL')
    expect(read?.params).toContainEqual(48.8566)
    expect(read?.params).toContainEqual(2.3522)
    expect(read?.params).toContainEqual(50)
  })

  it('REMPLACE la correspondance exacte sur `zones[]` — pas les DEUX à la fois', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { zone: 'Paris', radiusKm: 50, skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).not.toContain('= ANY(c.zones)')
  })

  it('sans `radiusKm`, garde la correspondance exacte de toujours', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { zone: 'Paris', skills: [], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('= ANY(c.zones)')
    expect(read?.sql).not.toContain('acos')
  })

  it('IGNORE le rayon proprement quand le géocodage de la ville cherchée échoue', async () => {
    const { service, queries } = makeService({ geocoded: null })
    const page = await service.search(WORKSPACE, {
      zone: 'Villeinconnue',
      radiusKm: 50,
      skills: [],
      page: 1,
      limit: 25,
    })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).not.toContain('acos')
    expect(read?.sql).not.toContain('= ANY(c.zones)')
    // La recherche entière n'échoue PAS pour autant.
    expect(page).toBeTruthy()
  })

  it('sans `zone`, `radiusKm` seul n’a aucun effet — un rayon n’a pas de centre', async () => {
    const { service, queries, geocodeCalls } = makeService()
    await service.search(WORKSPACE, { radiusKm: 50, skills: [], page: 1, limit: 25 })
    expect(geocodeCalls).toEqual([])
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).not.toContain('acos')
  })
})

describe('TalentService.search — les alias validés par l’espace (§5.3)', () => {
  it('applique un alias APPROUVÉ : chercher « React » trouve « ReactJS »', async () => {
    const { service, queries } = makeService()
    await service.search(
      WORKSPACE,
      { skills: ['ReactJS'], page: 1, limit: 25 },
      { finance: false },
      new Map([['reactjs', 'react']]),
    )
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.params).toContainEqual('react')
  })

  it('sans alias validé, le référentiel seul décide', async () => {
    // Un rapprochement NON validé remonterait des profils sur un mot qu'ils
    // n'ont jamais écrit.
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { skills: ['ReactJS'], page: 1, limit: 25 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    // Le référentiel connaît déjà « reactjs » → « react ».
    expect(read?.params).toContainEqual('react')
  })

  it('un alias d’espace l’emporte sur le référentiel pour un terme qu’il ne connaît pas', async () => {
    const { service, queries } = makeService()
    await service.search(
      WORKSPACE,
      { skills: ['SAP S4'], page: 1, limit: 25 },
      { finance: false },
      new Map([['sap s4', 'sap']]),
    )
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.params).toContainEqual('sap')
  })
})

describe('TalentService.search — les filtres du §6.3', () => {
  const ROW = {
    id: TALENT,
    kind: 'consultant',
    full_name: 'Yanis Berthier',
    seniority: 'senior',
    availability: 'immediate',
    tjm: 620,
    contract_type: 'cdi',
    engagement_kind: 'salarie',
    zones: [],
    updated_at: new Date('2026-08-01T00:00:00.000Z'),
  }

  it('« jamais positionné » se lit sur les positionnements, pas sur une colonne', () => {
    const { service, queries } = makeService()
    return service.search(WORKSPACE, { skills: [], page: 1, limit: 25, neverSubmitted: true }).then(() => {
      const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
      expect(read?.sql).toContain('NOT EXISTS (SELECT 1 FROM submissions')
    })
  })

  it('« dormant » retombe sur la création quand aucun contact n’a jamais été noté', async () => {
    // Ne rien faire garderait hors du filtre exactement les fiches les plus
    // anciennes — celles que la question vise.
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { skills: [], page: 1, limit: 25, dormantMonths: 6 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('COALESCE(c.last_contact_at, c.created_at)')
  })

  it('#2182.23 / #2182.53 — « sans mission depuis N mois » porte sur la FIN de la dernière mission', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { skills: [], page: 1, limit: 25, noMissionMonths: 6 })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('NOT EXISTS')
    expect(read?.sql).toContain('FROM mission_assignments ma')
    expect(read?.sql).toContain('JOIN missions m ON m.id = ma.mission_id')
    expect(read?.params).toContainEqual(6)
  })

  it('#2182.51 — filtre sur l’état du consentement, même vocabulaire que `consentState()`', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, { skills: [], page: 1, limit: 25, consentState: 'expiring' })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('c.consent_given_at')
    expect(read?.sql).toContain('c.consent_expires_at')
    expect(read?.params).toContainEqual('expiring')
  })

  it('exclut les profils DÉJÀ vus par un compte, en passant par le projet', async () => {
    const { service, queries } = makeService()
    await service.search(WORKSPACE, {
      skills: [],
      page: 1,
      limit: 25,
      excludeSeenByAccount: 'a0000000-0000-4000-8000-000000000001',
    })
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.sql).toContain('JOIN opportunities o ON o.id = s.project_id')
  })

  it('filtre sur la disponibilité DÉRIVÉE, jamais sur la colonne déclarée', async () => {
    // La fiche dit « immediate ». Une affectation sans fin court. Chercher les
    // gens disponibles ne doit PAS le remonter — c'est tout le §6.2.
    const { service } = makeService({
      total: 1,
      rows: [ROW],
      assignments: [{ consultant_id: TALENT, load_percent: 100, starts_on: '2000-01-01', ends_on: null }],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25, derived: 'available' })
    expect(page.items).toEqual([])
    // Le total suit le filtre : promettre une page qu'on ne peut pas remplir
    // envoie l'utilisateur sur du vide.
    expect(page.total).toBe(0)
  })

  it('#2182.21 — filtre sur la complétude, même calcul/seuil que `talentCompleteness`/`ENRICHED_MIN_AXES`', async () => {
    // ROW : identité + TJM remplis, ni compétence typée, ni CV, ni affectation
    // (`availability` retombe donc à `unknown`) — 2 axes sur 5, sous le seuil.
    const incomplete = await makeService({ total: 1, rows: [ROW] }).service.search(WORKSPACE, {
      skills: [],
      page: 1,
      limit: 25,
      completeness: 'incomplete',
    })
    expect(incomplete.items).toHaveLength(1)
    expect(incomplete.total).toBe(1)

    const hiddenFromEnriched = await makeService({ total: 1, rows: [ROW] }).service.search(WORKSPACE, {
      skills: [],
      page: 1,
      limit: 25,
      completeness: 'enriched',
    })
    expect(hiddenFromEnriched.items).toEqual([])
    expect(hiddenFromEnriched.total).toBe(0)

    // Un CV s'ajoute : identité + TJM + CV, 3 axes sur 5 — au seuil, « enrichi ».
    const enrichedRow = { ...ROW, cv_text: 'texte de CV' }
    const enriched = await makeService({ total: 1, rows: [enrichedRow] }).service.search(WORKSPACE, {
      skills: [],
      page: 1,
      limit: 25,
      completeness: 'enriched',
    })
    expect(enriched.items).toHaveLength(1)

    const hiddenFromIncomplete = await makeService({ total: 1, rows: [enrichedRow] }).service.search(WORKSPACE, {
      skills: [],
      page: 1,
      limit: 25,
      completeness: 'incomplete',
    })
    expect(hiddenFromIncomplete.items).toEqual([])
  })

  it('#2182.55 — « preuves » garde ceux qui ont au moins une compétence PROUVÉE (mission/entretien)', async () => {
    const declaredOnly = { consultant_id: TALENT, skill: 'kubernetes', level: 'expert', source: 'declared' }
    const hiddenByDeclared = await makeService({ total: 1, rows: [ROW], typedSkills: [declaredOnly] }).service.search(
      WORKSPACE,
      { skills: [], page: 1, limit: 25, provenSkillsOnly: true },
    )
    expect(hiddenByDeclared.items).toEqual([])
    expect(hiddenByDeclared.total).toBe(0)

    const provenByMission = { consultant_id: TALENT, skill: 'kubernetes', level: 'expert', source: 'mission' }
    const kept = await makeService({ total: 1, rows: [ROW], typedSkills: [provenByMission] }).service.search(
      WORKSPACE,
      { skills: [], page: 1, limit: 25, provenSkillsOnly: true },
    )
    expect(kept.items).toHaveLength(1)

    // Absent/`false` : indifférent, même garde que `cvAvailable`.
    const untouched = await makeService({ total: 1, rows: [ROW], typedSkills: [declaredOnly] }).service.search(
      WORKSPACE,
      { skills: [], page: 1, limit: 25 },
    )
    expect(untouched.items).toHaveLength(1)
  })

  it('« libre avant le … » garde ceux qui le sont DÉJÀ et écarte les fins inconnues', async () => {
    const free = await makeService({ total: 1, rows: [ROW], assignments: [] })
    // Aucune affectation ⇒ `unknown` : on ne PROMET pas une libération.
    expect(
      (await free.service.search(WORKSPACE, { skills: [], page: 1, limit: 25, freeBefore: '2026-09-30' })).items,
    ).toEqual([])

    const soon = makeService({
      total: 1,
      rows: [ROW],
      assignments: [{ consultant_id: TALENT, load_percent: 100, starts_on: '2000-01-01', ends_on: '2026-09-01' }],
    })
    expect(
      (await soon.service.search(WORKSPACE, { skills: [], page: 1, limit: 25, freeBefore: '2026-09-30' })).items,
    ).toHaveLength(1)
  })

  it('« en mission » se lit sur la disponibilité DÉRIVÉE, jamais sur le déclaratif', async () => {
    const busy = await makeService({
      total: 1,
      rows: [ROW],
      assignments: [{ consultant_id: TALENT, load_percent: 100, starts_on: '2000-01-01', ends_on: null }],
    }).service.search(WORKSPACE, { skills: [], page: 1, limit: 25, onMission: 'yes' })
    expect(busy.items).toHaveLength(1)

    const free = await makeService({ total: 1, rows: [ROW], assignments: [] }).service.search(WORKSPACE, {
      skills: [],
      page: 1,
      limit: 25,
      onMission: 'yes',
    })
    // `unknown` (aucune affectation) n'est pas « en mission ».
    expect(free.items).toEqual([])
  })

  it('RETIRE les montants sans `finance:read` — jamais un zéro', async () => {
    const { service } = makeService({
      total: 1,
      rows: [{ ...ROW, min_tjm_cents: '55000', cost_rate_cents: '42000' }],
    })
    const hidden = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(hidden.items[0]?.financeVisible).toBe(false)
    expect(hidden.items[0]).not.toHaveProperty('costCents')

    const shown = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 }, { finance: true })
    expect(shown.items[0]?.costCents).toBe(42000)
    expect(shown.items[0]?.minTjmCents).toBe(55000)
  })

  it('montre le coût qui vaut pour la NATURE, jamais les deux', async () => {
    // Un salarié coûte un salaire chargé, un freelance un prix d'achat. Les
    // afficher ensemble ferait saisir les deux puis calculer une marge fausse.
    const { service } = makeService({
      total: 1,
      rows: [{ ...ROW, engagement_kind: 'freelance', cost_rate_cents: '42000', purchase_tjm_cents: '58000' }],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 }, { finance: true })
    expect(page.items[0]?.costCents).toBe(58000)
  })
})

describe('TalentService.search — #4016 L4.3, les années voyagent pour que l’écran estime la séniorité', () => {
  const ROW = {
    id: TALENT,
    kind: 'consultant',
    full_name: 'Anthony Vasseur',
    title: 'Développeur',
    seniority: 'inconnu',
    years_experience: 6,
    availability: 'immediate',
    tjm: 500,
    contract_type: 'cdi',
    zones: ['IDF'],
    updated_at: new Date('2026-08-01T00:00:00.000Z'),
  }

  it('rend `yearsExperience` tel que saisi, SANS toucher à la séniorité stockée', async () => {
    const { service } = makeService({ total: 1, rows: [ROW] })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.yearsExperience).toBe(6)
    expect(page.items[0]?.seniority).toBe('inconnu')
  })

  it('rend `null` quand les années ne sont pas saisies — jamais 0', async () => {
    const { service } = makeService({ total: 1, rows: [{ ...ROW, years_experience: undefined }] })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.yearsExperience).toBeNull()
  })
})

describe('TalentService.search — la disponibilité DÉRIVÉE voyage jusqu’à l’écran', () => {
  const ROW = {
    id: TALENT,
    kind: 'consultant',
    full_name: 'Yanis Berthier',
    title: 'Ingénieur plateforme',
    seniority: 'senior',
    // La fiche DÉCLARE « disponible tout de suite ». C'est justement le
    // mensonge que le §6.2 vise : ce qui compte, ce sont les affectations.
    availability: 'immediate',
    tjm: 620,
    contract_type: 'cdi',
    zones: ['IDF'],
    updated_at: new Date('2026-08-01T00:00:00.000Z'),
  }

  it('rend `unknown` quand AUCUNE affectation n’est enregistrée — sans conclure', async () => {
    const { service } = makeService({ total: 1, rows: [ROW] })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.staffing.availability).toBe('unknown')
    // Le déclaratif reste rendu À CÔTÉ : l'écran montre ce que la fiche dit,
    // il ne le prend pas pour la vérité.
    expect(page.items[0]?.declaredAvailability).toBe('immediate')
  })

  it('contredit une fiche « disponible » quand une affectation court', async () => {
    const { service } = makeService({
      total: 1,
      rows: [ROW],
      assignments: [{ consultant_id: TALENT, load_percent: 100, starts_on: '2000-01-01', ends_on: null }],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.staffing.availability).toBe('busy_open_ended')
    expect(page.items[0]?.staffing.freeFrom).toBeNull()
  })

  /**
   * #3068 — une INTERRUPTION déclarée et pas encore confirmée
   * (`mission_interruptions.availability_confirmed = false`) ne doit jamais
   * laisser le vivier annoncer « disponible » : `deriveStaffing` était la
   * fonction UNIQUE qui l'ignorait partout ailleurs que dans l'écran de fin de
   * mission.
   */
  it('bascule en « à confirmer » sur une mission INTERROMPUE non confirmée — jamais « disponible »', async () => {
    const { service } = makeService({
      total: 1,
      rows: [ROW],
      assignments: [
        { consultant_id: TALENT, load_percent: 100, starts_on: '2026-01-01', ends_on: '2026-08-01', mission_id: 'm1' },
      ],
      unconfirmedInterruptions: [{ mission_id: 'm1' }],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.staffing.availability).toBe('a_confirmer')
  })

  it('reste « disponible » sur une fin de mission NORMALE — hors NO-GO de l’interruption', async () => {
    const { service } = makeService({
      total: 1,
      rows: [ROW],
      assignments: [
        { consultant_id: TALENT, load_percent: 100, starts_on: '2026-01-01', ends_on: '2026-08-01', mission_id: 'm2' },
      ],
      unconfirmedInterruptions: [],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.staffing.availability).toBe('available')
  })

  /**
   * #2186.14 — l'expiration bascule SEULE en « à confirmer », jamais en
   * silence sur « disponible ». Réutilise le seuil déjà tranché pour le score
   * poussable (`availabilityIsStale`, 60 jours) : voir
   * `declared-availability.spec.ts` pour la fonction pure.
   */
  it('#2186.14 — une disponibilité déclarée PÉRIMÉE bascule en `a_confirmer`, jamais `immediate`', async () => {
    const { service } = makeService({
      total: 1,
      rows: [{ ...ROW, availability_checked_at: new Date('2000-01-01T00:00:00.000Z') }],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.declaredAvailability).toBe('a_confirmer')
  })

  it('#2186.14 — contrôle négatif : une vérification RÉCENTE reste `immediate`', async () => {
    const { service } = makeService({
      total: 1,
      rows: [{ ...ROW, availability_checked_at: new Date() }],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.declaredAvailability).toBe('immediate')
  })

  it('expose `hasCv` — présence, jamais le contenu', async () => {
    const withCv = await makeService({
      total: 1,
      rows: [{ ...ROW, cv_text: 'CAMILLE ROUSSEL — Architecte' }],
    }).service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(withCv.items[0]?.hasCv).toBe(true)

    const blank = await makeService({ total: 1, rows: [{ ...ROW, cv_text: '   ' }] }).service.search(WORKSPACE, {
      skills: [],
      page: 1,
      limit: 25,
    })
    // Un CV blanc n'en est pas un — même garde que le filtre `cvAvailable`.
    expect(blank.items[0]?.hasCv).toBe(false)

    const none = await makeService({ total: 1, rows: [ROW] }).service.search(WORKSPACE, {
      skills: [],
      page: 1,
      limit: 25,
    })
    expect(none.items[0]?.hasCv).toBe(false)
  })

  it('expose `workMode` depuis `remote_preference` — déjà saisi, jamais atteint la ligne', async () => {
    const { service } = makeService({ total: 1, rows: [{ ...ROW, remote_preference: 'hybride' }] })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.workMode).toBe('hybride')

    const { service: withoutIt } = makeService({ total: 1, rows: [ROW] })
    const unset = await withoutIt.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(unset.items[0]?.workMode).toBeNull()
  })

  it('ne remonte que cinq compétences, la SOURCE la plus forte d’abord', async () => {
    const { service, queries } = makeService({
      total: 1,
      rows: [ROW],
      typedSkills: [
        { consultant_id: TALENT, skill: 'kubernetes', level: 'expert', source: 'mission' },
        { consultant_id: TALENT, skill: 'go', level: 'confirme', source: 'cv' },
        // Le référentiel range PostgreSQL sous « sql » : la colonne doit
        // afficher ce qui a été ÉCRIT, pas la famille.
        { consultant_id: TALENT, skill: 'sql', raw_label: 'PostgreSQL', level: 'confirme', source: 'cv' },
        { consultant_id: TALENT, skill: 'a', level: 'notions', source: 'declared' },
        { consultant_id: TALENT, skill: 'b', level: 'notions', source: 'declared' },
        { consultant_id: TALENT, skill: 'c', level: 'notions', source: 'declared' },
        { consultant_id: TALENT, skill: 'd', level: 'notions', source: 'declared' },
      ],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.topSkills).toHaveLength(5)
    expect(page.items[0]?.skillCount).toBe(7)
    expect(page.items[0]?.topSkills.find(entry => entry.skill === 'sql')?.label).toBe('PostgreSQL')
    expect(page.items[0]?.topSkills[0]).toEqual({
      skill: 'kubernetes',
      label: 'kubernetes',
      level: 'expert',
      source: 'mission',
    })
    // Une requête groupée, pas une par ligne.
    expect(queries.filter(entry => entry.sql.includes('FROM consultant_skills\n'))).toHaveLength(1)
  })

  it('ne lit RIEN de plus quand la page est vide', async () => {
    const { service, queries } = makeService({ total: 0, rows: [] })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items).toEqual([])
    expect(queries.some(entry => entry.sql.includes('FROM mission_assignments'))).toBe(false)
  })
})

describe('TalentService.purgeExpiredCandidates', () => {
  const expired = [
    { id: 'cand-1', kind: 'candidate', last_contact_at: null, created_at: new Date('2022-01-01T00:00:00.000Z') },
  ]

  it('ne purge RIEN tant que l’espace n’a pas armé sa politique', async () => {
    // Effacer est irréversible : l'armer par surprise détruirait un vivier
    // constitué.
    const { service, consultants } = makeService({ enabled: false, candidates: expired })
    await expect(service.purgeExpiredCandidates(WORKSPACE, new Date('2026-08-17T12:00:00.000Z'))).resolves.toBe(0)
    expect(consultants.delete).not.toHaveBeenCalled()
  })

  it('efface les dossiers échus une fois la politique armée', async () => {
    const { service, consultants } = makeService({ enabled: true, candidates: expired })
    await expect(service.purgeExpiredCandidates(WORKSPACE, new Date('2026-08-17T12:00:00.000Z'))).resolves.toBe(1)
    expect(consultants.delete).toHaveBeenCalled()
  })

  it('ne lit QUE les candidats — un consultant n’entre jamais dans la sélection', async () => {
    const { service, consultants } = makeService({ enabled: true, candidates: [] })
    await service.purgeExpiredCandidates(WORKSPACE, new Date('2026-08-17T12:00:00.000Z'))
    expect(consultants.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ kind: 'candidate' }) }),
    )
  })

  it('laisse un dossier recontacté récemment', async () => {
    const { service, consultants } = makeService({
      enabled: true,
      candidates: [
        {
          id: 'cand-2',
          kind: 'candidate',
          last_contact_at: new Date('2026-06-01T00:00:00.000Z'),
          created_at: new Date('2020-01-01T00:00:00.000Z'),
        },
      ],
    })
    await expect(service.purgeExpiredCandidates(WORKSPACE, new Date('2026-08-17T12:00:00.000Z'))).resolves.toBe(0)
    expect(consultants.delete).not.toHaveBeenCalled()
  })
})

describe('TalentService.previewPurge', () => {
  it('dit combien de dossiers partiraient AVANT que la case se coche', async () => {
    // Armer un effacement irréversible sans savoir ce qu'il emporte est le
    // genre de réglage qu'on regrette une fois.
    const { service } = makeService({
      enabled: false,
      candidates: [
        { id: 'a', kind: 'candidate', last_contact_at: null, created_at: new Date('2021-01-01T00:00:00.000Z') },
        { id: 'b', kind: 'candidate', last_contact_at: null, created_at: new Date('2026-08-01T00:00:00.000Z') },
      ],
    })
    const preview = await service.previewPurge(WORKSPACE, new Date('2026-08-17T12:00:00.000Z'))
    expect(preview.due).toBe(1)
    expect(preview.months).toBe(24)
  })
})

function docRow() {
  return {
    id: 'd1',
    kind: 'cv',
    filename: 'cv.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024,
    extracted_len: '62',
    created_at: '2026-08-17T09:00:00.000Z',
    first_name: 'Louis',
    last_name: 'Schlegel',
    email: 'louis@esn.fr',
  }
}

function preparedMessageRow() {
  return {
    id: 'm1',
    channel: 'email',
    subject: 'Suite de notre échange',
    body: 'Bonjour, ...',
    created_at: '2026-09-26T09:00:00.000Z',
    first_name: 'Louis',
    last_name: 'Schlegel',
    email: 'louis@esn.fr',
  }
}

describe('TalentService.stats', () => {
  const ROW = {
    id: TALENT,
    kind: 'consultant',
    full_name: 'Yanis Berthier',
    seniority: 'senior',
    availability: 'immediate',
    tjm: 620,
    contract_type: 'cdi',
    zones: [],
    cv_text: 'CV',
    updated_at: new Date('2026-08-30T00:00:00.000Z'),
  }

  it('rend des zéros et des `null`, jamais une division par zéro, sur un vivier vide', async () => {
    const { service } = makeService({ rows: [] })
    await expect(service.stats(WORKSPACE)).resolves.toEqual({
      total: 0,
      availableNow: 0,
      availabilityUnknownCount: 0,
      enrichedPercent: null,
      incompleteCount: 0,
      refreshedThisWeekPercent: null,
      lastUpdatedAt: null,
    })
  })

  it('compte les disponibles MAINTENANT sur la disponibilité DÉRIVÉE, pas déclarée', async () => {
    // La fiche déclare « immediate » ; aucune affectation ne le confirme —
    // même garde que le reste du §6.2 : on ne conclut pas « disponible ».
    const { service } = makeService({ rows: [ROW] })
    const stats = await service.stats(WORKSPACE)
    expect(stats.total).toBe(1)
    expect(stats.availableNow).toBe(0)
  })

  // #1839 — le bandeau affichait « Disponibles maintenant : 0 » NU : un zéro
  // orphelin, qui ne dit pas combien de fiches n'ont AUCUNE affectation
  // enregistrée et dont la disponibilité dérivée ne peut donc être ni
  // « disponible » ni « occupée ». Même doctrine que `accountResourceMeasure`
  // (laura-account-context.ts) : un compte sans son compagnon rassure toujours.
  it('#1839 — compte, sur la MÊME population que `availableNow`, les fiches sans affectation enregistrée', async () => {
    const freeRow = { ...ROW, id: 'free' }
    const unknownRow = { ...ROW, id: 'sans-affectation' }
    const { service } = makeService({
      rows: [freeRow, unknownRow],
      // `free` a une affectation PASSÉE, sans fin qui court aujourd'hui :
      // `deriveStaffing` la lit « available » (assignments.length > 0, aucune
      // active). `sans-affectation` n'a AUCUNE ligne dans
      // `mission_assignments` — exactement la population que ce compagnon vise.
      assignments: [{ consultant_id: 'free', load_percent: 100, starts_on: '2020-01-01', ends_on: '2020-06-01' }],
    })
    const stats = await service.stats(WORKSPACE)
    expect(stats.total).toBe(2)
    expect(stats.availableNow).toBe(1)
    expect(stats.availabilityUnknownCount).toBe(1)
  })

  it('#1839 — un enum d\'affectation TERMINÉE compte comme mesurée, jamais comme "sans affectation"', async () => {
    // Garde-fou de non-régression : une fiche avec un historique d'affectation
    // (donc `staffing.availability !== 'unknown'`) ne doit JAMAIS gonfler
    // `availabilityUnknownCount` — sinon la garde attraperait des fiches
    // parfaitement mesurées.
    const busyRow = { ...ROW, id: 'busy' }
    const { service } = makeService({
      rows: [busyRow],
      assignments: [{ consultant_id: 'busy', load_percent: 100, starts_on: '2020-01-01', ends_on: null }],
    })
    const stats = await service.stats(WORKSPACE)
    expect(stats.availabilityUnknownCount).toBe(0)
  })

  it('calcule un pourcentage enrichi sur trois axes remplis ou plus', async () => {
    // ROW porte : identité (nom), tarif (tjm), CV — trois axes sur cinq.
    // Compétences et disponibilité manquent (aucune affectation, aucune
    // compétence typée) : c'est assez pour franchir le seuil « enrichi ».
    const { service } = makeService({ rows: [ROW] })
    const stats = await service.stats(WORKSPACE)
    expect(stats.enrichedPercent).toBe(100)
  })

  it('rend `null` pour un pourcentage sans dénominateur mesurable — jamais un zéro qui ment', async () => {
    const { service } = makeService({ rows: [] })
    const stats = await service.stats(WORKSPACE)
    expect(stats.enrichedPercent).toBeNull()
    expect(stats.refreshedThisWeekPercent).toBeNull()
  })

  // #2182.10 — le résumé « Fiches incomplètes » : le COMPTE (jamais un
  // pourcentage) des fiches SOUS le seuil « enrichi », sur la MÊME fonction
  // pure `talentCompleteness` et le MÊME seuil que `enrichedPercent` — un
  // second seuil inventé ici divergerait du premier au premier correctif.
  it('#2182.10 — compte les fiches sous le seuil « enrichi » comme incomplètes', async () => {
    // ROW porte trois axes sur cinq (identité, tarif, CV) : au-dessus du
    // seuil, donc PAS incomplète.
    const bare = { ...ROW, id: 'bare', tjm: null, cv_text: '' }
    const { service } = makeService({ rows: [ROW, bare] })
    const stats = await service.stats(WORKSPACE)
    expect(stats.total).toBe(2)
    expect(stats.incompleteCount).toBe(1)
  })

  it('compte les fiches mises à jour dans les sept derniers jours', async () => {
    const now = new Date('2026-08-31T12:00:00.000Z')
    const fresh = { ...ROW, id: 'fresh', updated_at: new Date('2026-08-30T00:00:00.000Z') }
    const stale = { ...ROW, id: 'stale', updated_at: new Date('2026-06-01T00:00:00.000Z') }
    const { service } = makeService({ rows: [fresh, stale] })
    // `Date.now()` est figé pour ce test via un espion, sans quoi « sept jours »
    // dériverait d'une exécution à l'autre.
    jest.useFakeTimers().setSystemTime(now)
    try {
      const stats = await service.stats(WORKSPACE)
      expect(stats.refreshedThisWeekPercent).toBe(50)
      expect(stats.lastUpdatedAt).toBe('2026-08-30T00:00:00.000Z')
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('TalentService.search — la déclaration datée, le référent et les preuves voyagent (Théo C talents-vivier.N1/N2/N4)', () => {
  const OWNER = 'u0000000-0000-4000-8000-0000000000aa'
  const ROW = {
    id: TALENT,
    kind: 'consultant',
    full_name: 'Inès Kaczmarek',
    title: 'Consultante sécurité applicative',
    availability: 'immediate',
    available_from: '2026-11-03',
    availability_checked_at: new Date('2026-10-16T08:00:00.000Z'),
    owner_user_id: OWNER,
    updated_at: new Date('2026-10-01T00:00:00.000Z'),
  }

  it('rend la date annoncée, sa dernière confirmation et le référent NOMMÉ', async () => {
    const { service } = makeService({
      total: 1,
      rows: [ROW],
      profiles: [{ userId: OWNER, firstName: 'Maëlle', lastName: 'Lorquin', email: 'maelle@example.com' }],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    const item = page.items[0]
    expect(item?.declaredAvailableFrom).toBe('2026-11-03')
    expect(item?.availabilityCheckedAt).toBe('2026-10-16T08:00:00.000Z')
    expect(item?.ownerUserId).toBe(OWNER)
    expect(item?.ownerName).toBe('Maëlle Lorquin')
  })

  it('une fiche sans référent ni déclaration ne porte que des `null`, jamais une date inventée', async () => {
    const { service } = makeService({
      total: 1,
      rows: [{ ...ROW, available_from: null, availability_checked_at: null, owner_user_id: null }],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    const item = page.items[0]
    expect(item?.declaredAvailableFrom).toBeNull()
    expect(item?.availabilityCheckedAt).toBeNull()
    expect(item?.ownerUserId).toBeNull()
    expect(item?.ownerName).toBeNull()
  })

  it('compte les compétences PROUVÉES (mission, entretien) — pas les déclarées ni lues dans un CV', async () => {
    const { service } = makeService({
      total: 1,
      rows: [ROW],
      typedSkills: [
        { consultant_id: TALENT, skill: 'owasp', raw_label: null, level: 'expert', source: 'mission' },
        { consultant_id: TALENT, skill: 'devsecops', raw_label: null, level: 'confirme', source: 'interview' },
        { consultant_id: TALENT, skill: 'java', raw_label: null, level: 'autonome', source: 'cv' },
        { consultant_id: TALENT, skill: 'sql', raw_label: null, level: 'autonome', source: 'declared' },
      ],
    })
    const page = await service.search(WORKSPACE, { skills: [], page: 1, limit: 25 })
    expect(page.items[0]?.skillCount).toBe(4)
    expect(page.items[0]?.provenSkillCount).toBe(2)
  })
})

describe('TalentService — « Mes favoris » (Théo C talents-vivier.A12)', () => {
  const ROW = {
    id: TALENT,
    kind: 'consultant',
    full_name: 'Camille Roussel',
    title: 'Architecte de plateforme',
    availability: 'immediate',
    updated_at: new Date('2026-10-01T00:00:00.000Z'),
  }

  it('marque `isFavorite` sur MES favoris seulement', async () => {
    const { service } = makeService({ total: 1, rows: [ROW], favorites: [{ entity_id: TALENT }] })
    const page = await service.search(
      WORKSPACE,
      { skills: [], page: 1, limit: 25 },
      { finance: false },
      new Map(),
      USER,
    )
    expect(page.items[0]?.isFavorite).toBe(true)
  })

  it('une ligne qui n’est pas dans mes favoris porte `false`, jamais l’absence', async () => {
    const { service } = makeService({ total: 1, rows: [ROW], favorites: [] })
    const page = await service.search(
      WORKSPACE,
      { skills: [], page: 1, limit: 25 },
      { finance: false },
      new Map(),
      USER,
    )
    expect(page.items[0]?.isFavorite).toBe(false)
  })

  it('`favorite: mine` restreint la recherche aux favoris de l’appelant, par SQL', async () => {
    const { service, queries } = makeService({ total: 1, rows: [ROW], favorites: [{ entity_id: TALENT }] })
    await service.search(
      WORKSPACE,
      { skills: [], favorite: 'mine', page: 1, limit: 25 },
      { finance: false },
      new Map(),
      USER,
    )
    const select = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(select?.sql).toContain("f.entity_type = 'talent'")
    expect(select?.params).toContain(USER)
  })

  it('sans appelant identifié, `favorite: mine` ne rend RIEN plutôt que les favoris de tout le monde', async () => {
    const { service } = makeService({ total: 0, rows: [] })
    const page = await service.search(WORKSPACE, { skills: [], favorite: 'mine', page: 1, limit: 25 })
    expect(page.items).toEqual([])
    expect(page.total).toBe(0)
  })

  it('setFavorite pose et retire le favori de l’appelant sur une fiche de SON espace', async () => {
    const { service, queries } = makeService({})
    expect(await service.setFavorite(WORKSPACE, USER, TALENT, true)).toBe(true)
    expect(queries.some(entry => entry.sql.includes('INSERT INTO user_favorites'))).toBe(true)
    expect(await service.setFavorite(WORKSPACE, USER, TALENT, false)).toBe(false)
    expect(queries.some(entry => entry.sql.includes('DELETE FROM user_favorites'))).toBe(true)
  })

  it('setFavorite refuse une fiche d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(service.setFavorite(WORKSPACE, USER, TALENT, true)).rejects.toThrow()
  })
})
