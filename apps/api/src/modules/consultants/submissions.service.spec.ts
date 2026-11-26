import { BadRequestException, NotFoundException } from '@nestjs/common'
import { SubmissionsService } from './submissions.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const PROJECT = 'p0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'
const SUB = 's0000000-0000-4000-8000-000000000001'

function row(over: Record<string, unknown> = {}) {
  return {
    id: SUB,
    workspace_id: WORKSPACE,
    project_id: PROJECT,
    need_id: null,
    consultant_id: TALENT,
    stage: 'submitted',
    substatus: 'presented',
    stage_entered_at: '2026-08-01T09:00:00.000Z',
    submitted_at: '2026-08-01T09:00:00.000Z',
    first_feedback_at: null,
    closed_at: null,
    outcome_reason: null,
    outcome_detail: null,
    proposed_rate_cents: '65000',
    cv_snapshot: null,
    owner_id: USER,
    created_at: '2026-08-01T09:00:00.000Z',
    updated_at: '2026-08-01T09:00:00.000Z',
    project_label: 'Renfort plateforme',
    account_id: 'a0000000-0000-4000-8000-000000000001',
    account_name: 'ACME',
    need_role: 'Architecte',
    consultant_name: 'Marie Dupont',
    owner_first: 'Louis',
    owner_last: 'Schlegel',
    owner_email: 'louis@esn.fr',
    ...over,
  }
}

function makeService(overrides: Record<string, unknown> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('FROM opportunities WHERE id'))
        return overrides['projectExists'] === false ? [] : [{ id: PROJECT }]
      if (sql.includes('FROM consultants WHERE id')) return overrides['talentExists'] === false ? [] : [{ id: TALENT }]
      if (sql.includes('INSERT INTO submissions')) return overrides['conflict'] === true ? [] : [{ id: SUB }]
      if (sql.includes('FROM submission_feedback')) return (overrides['feedbackRows'] as unknown[]) ?? []
      if (sql.includes('FROM submission_consultant_feedback'))
        return (overrides['consultantFeedbackRows'] as unknown[]) ?? []
      if (sql.includes('FROM activities')) return (overrides['timelineRows'] as unknown[]) ?? []
      // #2177.6 / .25 — le destinataire doit appartenir au COMPTE du positionnement.
      if (sql.includes('FROM contacts c'))
        return overrides['recipientContactValid'] === false ? [] : [{ id: 'contact-1' }]
      // #2189.10-.16 — la dernière version de CV retrouvée pour ce besoin (aperçu).
      if (sql.includes('SELECT generated_at FROM cv_versions')) return (overrides['cvVersionRows'] as unknown[]) ?? []
      if (sql.includes('FROM submissions s')) return (overrides['rows'] as unknown[]) ?? [row()]
      return []
    }),
  }
  const stored = (overrides['stored'] as Record<string, unknown> | undefined) ?? {
    id: SUB,
    workspace_id: WORKSPACE,
    stage: 'submitted',
    submitted_at: new Date('2026-08-01T09:00:00.000Z'),
    first_feedback_at: null,
    closed_at: null,
    outcome_reason: null,
    outcome_detail: null,
    proposed_rate_cents: null,
    cv_snapshot: null,
  }
  const submissions = {
    manager,
    findOne: jest.fn(async () => (overrides['missing'] === true ? null : stored)),
    save: jest.fn(async (e: unknown) => e),
    // #2339.7 — la recherche du positionnement RETENU d'un besoin.
    find: jest.fn(async () => (overrides['acceptedRows'] as unknown[]) ?? []),
  }
  const interviews = {
    manager,
    create: jest.fn((e: Record<string, unknown>) => ({ id: 'i1', created_at: new Date(), ...e })),
    save: jest.fn(async (e: unknown) => e),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () =>
      overrides['interviewMissing'] === true
        ? null
        : {
            id: 'i1',
            submission_id: SUB,
            outcome: 'pending',
            notes: null,
            mode: 'remote',
            client_attendees: [],
            scheduled_at: new Date(),
            created_at: new Date(),
            brief_viewed_at: null as Date | null,
          },
    ),
  }
  const feedback = {
    manager,
    create: jest.fn((e: unknown) => e),
    save: jest.fn(async (e: unknown) => e),
  }
  const consultantFeedback = {
    manager,
    create: jest.fn((e: unknown) => e),
    save: jest.fn(async (e: unknown) => e),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
  const activities = { ingest: jest.fn(async () => ({ ingested: 1, duplicates: 0 })) }
  const commercialTransitions = { record: jest.fn(async () => undefined) }

  const service = new SubmissionsService(
    submissions as never,
    interviews as never,
    feedback as never,
    consultantFeedback as never,
    workspaceContext as never,
    commercialTransitions as never,
    activities as never,
  )
  return {
    service,
    submissions,
    interviews,
    feedback,
    consultantFeedback,
    activities,
    commercialTransitions,
    queries,
    stored,
  }
}

describe('SubmissionsService.create', () => {
  it('ne pose PAS de date d’envoi sur une simple sélection', async () => {
    // Retenir n'est pas envoyer : dater l'envoi ici compterait le temps de la
    // sélection interne comme du temps client.
    const { service, queries } = makeService()
    await service.create(USER, {
      projectId: PROJECT,
      consultantId: TALENT,
      stage: 'shortlisted',
      proposedRateCents: null,
    })
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO submissions'))
    expect(insert?.params[7]).toBeNull()
  })

  it('date l’envoi quand le CV part dès la création', async () => {
    const { service, queries } = makeService()
    await service.create(USER, {
      projectId: PROJECT,
      consultantId: TALENT,
      stage: 'submitted',
      proposedRateCents: null,
    })
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO submissions'))
    expect(insert?.params[7]).toBeInstanceOf(Date)
  })

  // #2335.1 — le sous-statut d'entrée est posé DÈS la création, pas
  // seulement à la première avancée.
  it('pose le sous-statut d’entrée de l’étape choisie', async () => {
    const { service, queries } = makeService()
    await service.create(USER, {
      projectId: PROJECT,
      consultantId: TALENT,
      stage: 'submitted',
      proposedRateCents: null,
    })
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO submissions'))
    expect(insert?.params[5]).toBe('presented')
  })

  it('REFUSE un doublon avec sa raison — deux fois la même personne se voit', async () => {
    const { service } = makeService({ conflict: true })
    await expect(
      service.create(USER, { projectId: PROJECT, consultantId: TALENT, stage: 'shortlisted', proposedRateCents: null }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuse un projet d’un autre espace', async () => {
    const { service } = makeService({ projectExists: false })
    await expect(
      service.create(USER, { projectId: PROJECT, consultantId: TALENT, stage: 'shortlisted', proposedRateCents: null }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('trace l’envoi dans l’historique du compte, sous une clé stable', async () => {
    const { service, activities } = makeService()
    await service.create(USER, {
      projectId: PROJECT,
      consultantId: TALENT,
      stage: 'submitted',
      proposedRateCents: null,
    })
    expect(activities.ingest).toHaveBeenCalledWith(WORKSPACE, USER, [
      expect.objectContaining({ externalId: `submission:${SUB}:submitted` }),
    ])
  })

  // #2339.1-.13 (épopée #2795) — le POSITIONNEMENT entre dans le journal
  // besoin→shortlist→positionnement→mission (#2320.23) dès sa création :
  // dernier des quatre sujets déclarés par ce chantier à n'avoir aucun appelant.
  it('journalise sa création dans `commercial_transitions`', async () => {
    const { service, commercialTransitions } = makeService()
    await service.create(USER, {
      projectId: PROJECT,
      consultantId: TALENT,
      stage: 'shortlisted',
      proposedRateCents: null,
    })
    expect(commercialTransitions.record).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      subjectType: 'submission',
      subjectId: SUB,
      fromState: null,
      toState: 'submitted',
      actorId: USER,
      proof: null,
    })
  })
})

describe('SubmissionsService.advance', () => {
  it('REFUSE de ressusciter un profil refusé', async () => {
    const { service } = makeService({ stored: { id: SUB, workspace_id: WORKSPACE, stage: 'rejected' } })
    await expect(service.advance(USER, SUB, { stage: 'submitted' })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('ne RÉÉCRIT PAS la date d’envoi déjà posée', async () => {
    // La réécrire ferait fondre tous les délais mesurés.
    const first = new Date('2026-08-01T09:00:00.000Z')
    const { service, submissions } = makeService({
      stored: { id: SUB, workspace_id: WORKSPACE, stage: 'withdrawn', submitted_at: first },
    })
    await service.advance(USER, SUB, { stage: 'submitted' })
    expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ submitted_at: first }))
  })

  it('date le premier retour à la clôture — une réponse EST un retour', async () => {
    const { service, submissions } = makeService()
    await service.advance(USER, SUB, { stage: 'rejected', outcomeReason: 'price' })
    const saved = submissions.save.mock.calls[0]?.[0] as { first_feedback_at: Date | null }
    expect(saved.first_feedback_at).toBeInstanceOf(Date)
  })

  it('NE date PAS de retour quand le motif est « sans retour »', async () => {
    // Sinon un silence compterait comme une réponse instantanée et écraserait
    // la latence médiane.
    const { service, submissions } = makeService()
    await service.advance(USER, SUB, { stage: 'rejected', outcomeReason: 'no_feedback' })
    const saved = submissions.save.mock.calls[0]?.[0] as { first_feedback_at: Date | null }
    expect(saved.first_feedback_at).toBeNull()
  })

  it('efface la clôture quand un positionnement retiré repart', async () => {
    // « À envoyer » avec une date de clôture est un état impossible.
    const { service, submissions } = makeService({
      stored: {
        id: SUB,
        workspace_id: WORKSPACE,
        stage: 'withdrawn',
        closed_at: new Date(),
        outcome_reason: 'availability',
        submitted_at: null,
      },
    })
    await service.advance(USER, SUB, { stage: 'shortlisted' })
    expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ closed_at: null, outcome_reason: null }))
  })

  it('fige le CV envoyé quand il est fourni', async () => {
    const { service, submissions } = makeService({
      stored: { id: SUB, workspace_id: WORKSPACE, stage: 'shortlisted', submitted_at: null },
    })
    await service.advance(USER, SUB, { stage: 'submitted', cvSnapshot: 'CV version envoyée' })
    expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ cv_snapshot: 'CV version envoyée' }))
  })

  it('404 sur un positionnement d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(service.advance(USER, SUB, { stage: 'interview' })).rejects.toBeInstanceOf(NotFoundException)
  })

  // #2335.1 — le sous-statut suit l'étape choisie, et distingue « sans
  // réponse » d'un refus argumenté.
  it('pose le sous-statut d’entrée de la nouvelle étape', async () => {
    const { service, submissions } = makeService()
    await service.advance(USER, SUB, { stage: 'interview' })
    expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ substatus: 'interview_scheduled' }))
  })

  it('distingue « sans réponse » d’un refus argumenté au niveau du sous-statut', async () => {
    const { service, submissions } = makeService()
    await service.advance(USER, SUB, { stage: 'rejected', outcomeReason: 'no_feedback' })
    expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ substatus: 'no_response' }))
  })

  // #2339.1-.13 (épopée #2795) — chaque AVANCÉE du positionnement se
  // journalise aussi, même porte que sa création — la machine fermée de
  // `canTransition` est déjà la garde, ce service n'ENREGISTRE que ce qui a
  // été décidé.
  it('journalise chaque avancée dans `commercial_transitions`, avec l’état d’origine NOMMÉ', async () => {
    const { service, commercialTransitions } = makeService({
      stored: { id: SUB, workspace_id: WORKSPACE, stage: 'shortlisted', submitted_at: null },
    })
    await service.advance(USER, SUB, { stage: 'submitted' })
    expect(commercialTransitions.record).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      subjectType: 'submission',
      subjectId: SUB,
      fromState: 'shortlisted',
      toState: 'submitted',
      actorId: USER,
      proof: null,
    })
  })
})

// #2177.11, #2177.12, #2177.13, #2177.15, #2177.20, #2177.21 — les seize
// sous-statuts existaient (#2335.1) mais seule leur valeur d'ENTRÉE d'étape
// était jamais posée : rien ne les faisait avancer manuellement.
describe('SubmissionsService.advanceSubstatus', () => {
  it('avance vers un sous-statut ATTEIGNABLE', async () => {
    const { service, submissions } = makeService({
      stored: { id: SUB, workspace_id: WORKSPACE, stage: 'shortlisted', substatus: 'to_qualify' },
    })
    await service.advanceSubstatus(USER, SUB, { substatus: 'consultant_agreement_pending' })
    expect(submissions.save).toHaveBeenCalledWith(
      expect.objectContaining({ substatus: 'consultant_agreement_pending' }),
    )
  })

  it('REFUSE un saut hors de la machine des sous-statuts', async () => {
    const { service } = makeService({
      stored: { id: SUB, workspace_id: WORKSPACE, stage: 'shortlisted', substatus: 'to_qualify' },
    })
    await expect(service.advanceSubstatus(USER, SUB, { substatus: 'selected' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('REFUSE une cible qui retombe sur une AUTRE étape — la route ne bouge jamais `stage`', async () => {
    // `to_validate` (shortlisted) → `presented` (submitted) est un ordre
    // valide dans la machine des sous-statuts, mais ferait mentir le badge
    // d'étape si la route ne touche jamais `stage`.
    const { service } = makeService({
      stored: { id: SUB, workspace_id: WORKSPACE, stage: 'shortlisted', substatus: 'to_validate' },
    })
    await expect(service.advanceSubstatus(USER, SUB, { substatus: 'presented' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('REFUSE quand aucun sous-statut n’a encore été posé — rien à deviner', async () => {
    const { service } = makeService({
      stored: { id: SUB, workspace_id: WORKSPACE, stage: 'shortlisted', substatus: null },
    })
    await expect(
      service.advanceSubstatus(USER, SUB, { substatus: 'consultant_agreement_pending' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('404 sur un positionnement d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(
      service.advanceSubstatus(USER, SUB, { substatus: 'consultant_agreement_pending' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  // #2189.1 (épopée #2940) — le contrôle « avant présentation » se pose sur
  // les cibles qui font RÉELLEMENT partir un CV, jamais avant.
  describe('le contrôle « avant présentation » (#2189)', () => {
    it('REFUSE de faire entrer en « à valider » un consultant qui a EXPLICITEMENT refusé', async () => {
      const { service } = makeService({
        stored: {
          id: SUB,
          workspace_id: WORKSPACE,
          stage: 'shortlisted',
          substatus: 'ready_to_present',
          consultant_agreement: false,
        },
      })
      await expect(service.advanceSubstatus(USER, SUB, { substatus: 'to_validate' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('n’empêche PAS d’entrer en « à valider » sur un simple avertissement (accord non déclaré)', async () => {
      const { service, submissions } = makeService({
        stored: {
          id: SUB,
          workspace_id: WORKSPACE,
          stage: 'shortlisted',
          substatus: 'ready_to_present',
          consultant_agreement: null,
        },
      })
      await service.advanceSubstatus(USER, SUB, { substatus: 'to_validate' })
      expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ substatus: 'to_validate' }))
    })

    it('ne contrôle rien pour une cible qui ne présente rien', async () => {
      const { service, submissions } = makeService({
        stored: {
          id: SUB,
          workspace_id: WORKSPACE,
          stage: 'shortlisted',
          substatus: 'to_qualify',
          consultant_agreement: false,
        },
      })
      // `consultant_agreement_pending` ne présente rien : le refus déclaré ne bloque pas ICI.
      await service.advanceSubstatus(USER, SUB, { substatus: 'consultant_agreement_pending' })
      expect(submissions.save).toHaveBeenCalledWith(
        expect.objectContaining({ substatus: 'consultant_agreement_pending' }),
      )
    })
  })
})

// #2177.6 / .8 / .24 / .25 / .28 / .30 — le détail d'un positionnement,
// absent du contrat jusqu'à ce lot.
// #2189.10-.16 (épopée #2940) — l'aperçu, lecture seule.
describe('SubmissionsService.preview', () => {
  it('nomme le compte et le besoin dans l’objet, aucun CV tant que rien n’est figé', async () => {
    const { service } = makeService({ rows: [row({ cv_snapshot: null })] })
    const preview = await service.preview(USER, SUB)
    expect(preview.subject).toContain('ACME')
    expect(preview.subject).toContain('Architecte')
    expect(preview.cv).toBeNull()
    expect(preview.argumentsSource).toBeNull()
  })

  it('nomme la version de CV figée quand une génération est retrouvée', async () => {
    const { service } = makeService({
      rows: [row({ cv_snapshot: 'texte du cv' })],
      cvVersionRows: [{ generated_at: new Date('2026-09-20T00:00:00.000Z') }],
    })
    const preview = await service.preview(USER, SUB)
    expect(preview.cv).toEqual({ capturedAt: '2026-09-20T00:00:00.000Z' })
    expect(preview.argumentsSource).not.toBeNull()
  })
})

describe('SubmissionsService.recordDetails', () => {
  it('pose le canal, le message, la disponibilité et les conditions', async () => {
    const { service, submissions } = makeService()
    await service.recordDetails(USER, SUB, {
      channel: 'linkedin',
      message: 'Voici le profil proposé.',
      availability: 'Disponible sous deux semaines',
      conditions: 'Télétravail deux jours par semaine',
    })
    expect(submissions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'linkedin',
        message: 'Voici le profil proposé.',
        availability: 'Disponible sous deux semaines',
        conditions: 'Télétravail deux jours par semaine',
      }),
    )
  })

  it('pose le destinataire quand il appartient au COMPTE du positionnement', async () => {
    const { service, submissions } = makeService({ recipientContactValid: true })
    await service.recordDetails(USER, SUB, { recipientContactId: 'contact-1' })
    expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ recipient_contact_id: 'contact-1' }))
  })

  it('REFUSE un contact qui n’appartient PAS au compte du positionnement', async () => {
    const { service } = makeService({ recipientContactValid: false })
    await expect(service.recordDetails(USER, SUB, { recipientContactId: 'contact-ailleurs' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('ne touche AUCUN champ absent de l’entrée — un objet vide ne change rien', async () => {
    const { service, submissions } = makeService()
    await service.recordDetails(USER, SUB, {})
    expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ stage: 'submitted' }))
  })

  it('404 sur un positionnement d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(service.recordDetails(USER, SUB, { message: 'x' })).rejects.toBeInstanceOf(NotFoundException)
  })

  // #2320.18 (épopée #2967) — « Shortlist → Positionnement nécessite accord
  // consultant et package ». Même vocabulaire que `mission_assignments`
  // (#2407.4) : un booléen déclaré, jamais deviné, et une date qui n'a de
  // sens QUE si le booléen est renseigné.
  it('pose l’accord du consultant — oui ou non, jamais deviné', async () => {
    const { service, submissions } = makeService()
    await service.recordDetails(USER, SUB, { consultantAgreement: true, consultantAgreementDate: '2026-09-25' })
    expect(submissions.save).toHaveBeenCalledWith(
      expect.objectContaining({ consultant_agreement: true, consultant_agreement_date: '2026-09-25' }),
    )
  })

  it('pose un REFUS du consultant — un « non » se date aussi', async () => {
    const { service, submissions } = makeService()
    await service.recordDetails(USER, SUB, { consultantAgreement: false, consultantAgreementDate: '2026-09-25' })
    expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ consultant_agreement: false }))
  })

  it('ne touche pas l’accord consultant quand il est ABSENT de l’entrée', async () => {
    const { service, submissions } = makeService()
    await service.recordDetails(USER, SUB, { message: 'x' })
    expect(submissions.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ consultant_agreement: expect.anything() }),
    )
  })
})

// #2335.3 — chaque étape avec sa date, lue depuis `activities`.
describe('SubmissionsService.listTimeline', () => {
  it('lit les traces déjà posées par `trace()`, dans l’ordre chronologique', async () => {
    const { service } = makeService({
      timelineRows: [
        { subject: 'Marie Dupont — CV envoyé', occurred_at: '2026-08-01T09:00:00.000Z' },
        { subject: 'Marie Dupont — Entretien', occurred_at: '2026-08-05T09:00:00.000Z' },
      ],
    })
    const items = await service.listTimeline(USER, SUB)
    expect(items).toEqual([
      { subject: 'Marie Dupont — CV envoyé', occurredAt: '2026-08-01T09:00:00.000Z' },
      { subject: 'Marie Dupont — Entretien', occurredAt: '2026-08-05T09:00:00.000Z' },
    ])
  })

  it('filtre sur LE PRÉFIXE de CE positionnement, pas un autre', async () => {
    const { service, queries } = makeService({ timelineRows: [] })
    await service.listTimeline(USER, SUB)
    const query = queries.find(entry => entry.sql.includes('FROM activities'))
    expect(query?.params).toEqual([WORKSPACE, `submission:${SUB}:%`])
  })

  it('404 sur un positionnement d’un autre espace', async () => {
    const { service } = makeService({ missing: true })
    await expect(service.listTimeline(USER, SUB)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('SubmissionsService.scheduleInterview', () => {
  it('fait AVANCER le positionnement à « entretien »', async () => {
    // Sinon l'écran affiche « CV envoyé » alors qu'un rendez-vous est posé, et
    // l'entonnoir sous-compte les entretiens.
    const { service, submissions } = makeService()
    await service.scheduleInterview(USER, SUB, {
      scheduledAt: '2026-08-20T09:00:00.000Z',
      mode: 'remote',
      clientAttendees: [],
    })
    expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ stage: 'interview' }))
  })

  it('n’avance pas un positionnement déjà en entretien', async () => {
    const { service, submissions } = makeService({
      stored: { id: SUB, workspace_id: WORKSPACE, stage: 'interview', submitted_at: new Date() },
    })
    await service.scheduleInterview(USER, SUB, {
      scheduledAt: '2026-08-20T09:00:00.000Z',
      mode: 'onsite',
      clientAttendees: ['DSI'],
    })
    expect(submissions.save).not.toHaveBeenCalled()
  })

  it('crée l’entretien en attente — un rendez-vous à venir n’est pas un échec', async () => {
    const { service, interviews } = makeService()
    await service.scheduleInterview(USER, SUB, {
      scheduledAt: '2026-08-20T09:00:00.000Z',
      mode: 'remote',
      clientAttendees: [],
    })
    expect(interviews.create).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'pending' }))
  })
})

describe('SubmissionsService.markInterviewBriefViewed', () => {
  it('#2875/#3398 (BM) — pose la trace à la première ouverture du brief', async () => {
    const { service, interviews } = makeService()
    const result = await service.markInterviewBriefViewed(USER, SUB, 'i1')
    expect(interviews.save).toHaveBeenCalledWith(expect.objectContaining({ brief_viewed_at: expect.any(Date) }))
    expect(result.briefViewedAt).not.toBeNull()
  })

  it('ne recule jamais une trace déjà posée — une réouverture ne la bouge pas', async () => {
    const { service, interviews } = makeService()
    const alreadyViewed = new Date('2026-10-01T08:00:00.000Z')
    interviews.findOne.mockResolvedValueOnce({
      id: 'i1',
      submission_id: SUB,
      outcome: 'pending',
      notes: null,
      mode: 'remote',
      client_attendees: [],
      scheduled_at: new Date(),
      created_at: new Date(),
      brief_viewed_at: alreadyViewed,
    })
    const result = await service.markInterviewBriefViewed(USER, SUB, 'i1')
    expect(interviews.save).not.toHaveBeenCalled()
    expect(result.briefViewedAt).toBe(alreadyViewed.toISOString())
  })

  it('un entretien introuvable échoue plutôt que de poser une trace sur rien', async () => {
    const { service } = makeService({ interviewMissing: true })
    await expect(service.markInterviewBriefViewed(USER, SUB, 'ghost')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('SubmissionsService.recordFeedback', () => {
  const input = {
    technical: 'meets' as const,
    experience: 'above' as const,
    communication: 'unknown' as const,
    price: 'below' as const,
    seniority: 'unknown' as const,
    context: 'unknown' as const,
    availability: 'unknown' as const,
    location: 'unknown' as const,
    timing: 'unknown' as const,
    other: 'unknown' as const,
    // #2178.29 — onzième axe, additif.
    personality: 'unknown' as const,
    verbatim: 'Trop cher pour le budget.',
  }
  const feedbackRow = {
    id: 'f1',
    submission_id: SUB,
    technical: 'meets',
    experience: 'above',
    communication: 'unknown',
    price: 'below',
    seniority: 'unknown',
    context: 'unknown',
    availability: 'unknown',
    location: 'unknown',
    timing: 'unknown',
    other_axis: 'unknown',
    personality: 'unknown',
    verbatim: 'Trop cher pour le budget.',
    learning: null,
    created_at: '2026-08-05T09:00:00.000Z',
    first_name: 'Louis',
    last_name: 'Schlegel',
    email: 'louis@esn.fr',
  }

  it('date le PREMIER retour sur le positionnement', async () => {
    const { service, submissions } = makeService({ feedbackRows: [feedbackRow] })
    await service.recordFeedback(USER, SUB, input)
    expect(submissions.save).toHaveBeenCalledWith(expect.objectContaining({ first_feedback_at: expect.any(Date) }))
  })

  it('ne RACCOURCIT PAS le premier délai avec un second retour', async () => {
    const already = new Date('2026-08-03T09:00:00.000Z')
    const { service, submissions } = makeService({
      feedbackRows: [feedbackRow],
      stored: { id: SUB, workspace_id: WORKSPACE, stage: 'interview', first_feedback_at: already },
    })
    await service.recordFeedback(USER, SUB, input)
    expect(submissions.save).not.toHaveBeenCalled()
  })

  it('garde le verbatim TEL QUEL', async () => {
    // Reformuler un retour client, c'est perdre la seule phrase qui servira en
    // soutenance.
    const { service, feedback } = makeService({ feedbackRows: [feedbackRow] })
    await service.recordFeedback(USER, SUB, input)
    expect(feedback.create).toHaveBeenCalledWith(expect.objectContaining({ verbatim: 'Trop cher pour le budget.' }))
  })

  it('garde l’apprentissage TEL QUEL, sans toucher aucun autre champ que le retour', async () => {
    // #2335.6 — l'apprentissage est une ligne de PLUS dans `submission_feedback`,
    // jamais une écriture sur `consultants`/`consultant_skills`. Aucune requête
    // vers ces tables ne doit partir d'ici : c'est la preuve que la mise à jour
    // n'écrase RIEN d'existant sur le profil.
    const { service, feedback, queries } = makeService({ feedbackRows: [feedbackRow] })
    await service.recordFeedback(USER, SUB, {
      ...input,
      price: 'below',
      learning: 'Le TJM annoncé était 100€ trop haut pour ce client.',
    })
    expect(feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ learning: 'Le TJM annoncé était 100€ trop haut pour ce client.' }),
    )
    expect(queries.some(entry => /consultants|consultant_skills/i.test(entry.sql))).toBe(false)
  })

  it('laisse `learning` à `null` quand rien n’est écrit', async () => {
    const { service, feedback } = makeService({ feedbackRows: [feedbackRow] })
    await service.recordFeedback(USER, SUB, input)
    expect(feedback.create).toHaveBeenCalledWith(expect.objectContaining({ learning: null }))
  })
})

// #2335.5 — le retour CONSULTANT, jamais mêlé au retour client ci-dessus.
describe('SubmissionsService.recordConsultantFeedback', () => {
  const consultantInput = {
    interest: 'above' as const,
    understanding: 'meets' as const,
    manager: 'unknown' as const,
    mission: 'unknown' as const,
    conditions: 'unknown' as const,
    concerns: 'unknown' as const,
    availability: 'unknown' as const,
    decision: 'unknown' as const,
    verbatim: 'Très motivé, veut y aller.',
  }
  const consultantFeedbackRow = {
    id: 'cf1',
    submission_id: SUB,
    interest: 'above',
    understanding: 'meets',
    manager: 'unknown',
    mission: 'unknown',
    conditions: 'unknown',
    concerns: 'unknown',
    availability: 'unknown',
    decision: 'unknown',
    verbatim: 'Très motivé, veut y aller.',
    created_at: '2026-08-05T09:00:00.000Z',
    first_name: 'Louis',
    last_name: 'Schlegel',
    email: 'louis@esn.fr',
  }

  it('écrit dans `submission_consultant_feedback`, JAMAIS dans `submission_feedback`', async () => {
    const { service, consultantFeedback, feedback } = makeService({
      consultantFeedbackRows: [consultantFeedbackRow],
    })
    await service.recordConsultantFeedback(USER, SUB, consultantInput)
    expect(consultantFeedback.create).toHaveBeenCalledWith(expect.objectContaining({ interest: 'above' }))
    expect(feedback.create).not.toHaveBeenCalled()
  })

  it('garde le verbatim consultant TEL QUEL', async () => {
    const { service, consultantFeedback } = makeService({ consultantFeedbackRows: [consultantFeedbackRow] })
    await service.recordConsultantFeedback(USER, SUB, consultantInput)
    expect(consultantFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ verbatim: 'Très motivé, veut y aller.' }),
    )
  })

  it('lit le retour consultant enregistré', async () => {
    const { service } = makeService({ consultantFeedbackRows: [consultantFeedbackRow] })
    const items = await service.listConsultantFeedback(USER, SUB)
    expect(items).toEqual([expect.objectContaining({ id: 'cf1', interest: 'above', understanding: 'meets' })])
  })

  // #2329.52 (épopée #2948) — « Le poste m'intéresse » n'est jamais lu comme
  // « je m'engage à être présenté » : un intérêt même très positif (`above`)
  // n'écrit JAMAIS `submissions.consultant_agreement`, qui reste un geste
  // séparé et explicite (`recordDetails`, #2320.18).
  it('n’écrit JAMAIS `consultant_agreement` depuis un retour d’intérêt, même très positif', async () => {
    const { service, submissions } = makeService({ consultantFeedbackRows: [consultantFeedbackRow] })
    await service.recordConsultantFeedback(USER, SUB, consultantInput)
    expect(submissions.save).not.toHaveBeenCalledWith(expect.objectContaining({ consultant_agreement: true }))
  })
})

describe('SubmissionsService.list', () => {
  it('rend le TJM en nombre — un bigint traverse en chaîne', async () => {
    // Le laisser tel quel enverrait « 65000 » au client, qui l'afficherait
    // comme un texte et refuserait de l'additionner.
    const { service } = makeService()
    const result = await service.list(USER)
    expect(result.items[0]?.proposedRateCents).toBe(65000)
  })

  // #3544.5 — « Chargement… » prolongé sur Positionnements : la liste ramenait
  // `cv_snapshot` (CV figé, volumineux) de CHAQUE ligne, que l'écran n'affiche pas.
  it('#3544.5 — la liste ne lit PAS le CV figé de chaque ligne (il vit sur la lecture d’un positionnement)', async () => {
    const { service, queries } = makeService()
    await service.list(USER)
    const sql = String(queries.find(q => /FROM submissions s/.test(q.sql))?.sql)
    expect(sql).not.toMatch(/\bs\.\*/)
    expect(sql).not.toMatch(/\bs\.cv_snapshot/)
    expect(sql).toContain('s.stage')
  })

  // #4502 (PR 12C) — le POSTE du consultant voyage avec la présentation : la table « Présentations » le montre.
  it('#4502 — la liste lit le poste du consultant dans la même jointure, sans requête de plus', async () => {
    const { service, queries } = makeService()
    await service.list(USER)
    const sql = String(queries.find(q => /FROM submissions s/.test(q.sql))?.sql)
    expect(sql).toContain('c.title AS consultant_title')
    expect(queries.filter(q => /FROM consultants/.test(q.sql) && /title/.test(q.sql))).toHaveLength(0)
  })

  it('#4502 — le poste est rendu tel que stocké ; absent ou vide = null, jamais un libellé deviné', async () => {
    const { service } = makeService({
      rows: [
        row({ consultant_title: 'Architecte cloud' }),
        row({ id: 's2', consultant_title: null }),
        row({ id: 's3', consultant_title: '   ' }),
        row({ id: 's4' }),
      ],
    })
    const result = await service.list(USER)
    expect(result.items.map(item => item.consultantTitle)).toEqual(['Architecte cloud', null, null, null])
  })

  it('rend l’entonnoir avec les lignes lues', async () => {
    const { service } = makeService({
      rows: [
        row(),
        row({ id: 's2', stage: 'accepted' }),
        row({ id: 's3', stage: 'rejected', outcome_reason: 'no_feedback' }),
      ],
    })
    const result = await service.list(USER)
    expect(result.funnel.submitted).toBe(3)
    expect(result.funnel.noFeedback).toBe(1)
    // Un accepté, zéro refus argumenté : 100 % de ce qui a vraiment répondu.
    expect(result.funnel.acceptanceRate).toBe(1)
  })
})

/**
 * #2339.7 (épopée #2795) — LE positionnement RETENU d'un besoin, pour la
 * conversion en mission (`create_mission`, `projects.controller.ts`).
 */
describe('SubmissionsService.acceptedForNeed', () => {
  const NEED = 'n0000000-0000-4000-8000-000000000001'

  it('rend l’UNIQUE positionnement accepté du besoin', async () => {
    const { service, submissions } = makeService({
      acceptedRows: [{ id: SUB, consultant_id: TALENT }],
    })
    const result = await service.acceptedForNeed(WORKSPACE, NEED)
    expect(submissions.find).toHaveBeenCalledWith({
      where: { workspace_id: WORKSPACE, need_id: NEED, stage: 'accepted' },
      select: ['id', 'consultant_id'],
    })
    expect(result).toEqual({ id: SUB, consultantId: TALENT })
  })

  it('rend `null` sans positionnement accepté — jamais un talent deviné', async () => {
    const { service } = makeService({ acceptedRows: [] })
    expect(await service.acceptedForNeed(WORKSPACE, NEED)).toBeNull()
  })

  it('rend `null` quand PLUSIEURS positionnements sont acceptés — un headcount > 1 le permet, aucun n’est « le » talent retenu', async () => {
    const { service } = makeService({
      acceptedRows: [
        { id: SUB, consultant_id: TALENT },
        { id: 's2', consultant_id: 'c2' },
      ],
    })
    expect(await service.acceptedForNeed(WORKSPACE, NEED)).toBeNull()
  })
})
