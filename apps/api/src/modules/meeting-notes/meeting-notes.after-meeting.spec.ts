import { BadRequestException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AccountsService } from '../accounts/accounts.service'
import { CrmService } from '../crm/crm.service'
import { IaClient } from '../ia/ia.client'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { approveInternalSchema, structureNotesSchema, transcribeSchema } from './dto/meeting-notes.dto'
import { MeetingNotesService } from './meeting-notes.service'

/**
 * #2319.57 / .61-.82 — le rendez-vous, APRÈS :
 *  · aucun enregistrement transcrit sans l'accord explicite des participants ;
 *  · trois entrées de plus (compte rendu importé, e-mail collé, déclaration) ;
 *  · six extractions séparées ;
 *  · aucun budget inventé, aucune mission créée, et les libellés prudents.
 */

const USER = '11111111-1111-1111-1111-111111111111'
const HEARD = { kind: 'transcript', excerpt: 'on lance le projet en mars' }

describe('MeetingNotesService — après le rendez-vous (#2319)', () => {
  let service: MeetingNotesService
  let ia: { structureMeetingNotes: jest.Mock }
  let isDemo: jest.Mock
  const OLD_ENV = { ...process.env }

  beforeEach(async () => {
    process.env = { ...OLD_ENV, TRANSCRIPTION_API_KEY: 'k' }
    ia = { structureMeetingNotes: jest.fn().mockResolvedValue({ data: {} }) }
    isDemo = jest.fn().mockResolvedValue(false)
    const moduleRef = await Test.createTestingModule({
      providers: [
        MeetingNotesService,
        { provide: IaClient, useValue: ia },
        {
          provide: WorkspaceContextService,
          useValue: {
            resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w' }),
            isDemoWorkspace: isDemo,
          },
        },
        { provide: AccountsService, useValue: { findOneForWorkspace: jest.fn() } },
        { provide: CrmService, useValue: {} },
      ],
    }).compile()
    service = moduleRef.get(MeetingNotesService)
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  describe('#2319.57 — aucun enregistrement sans consentement explicite', () => {
    it('la requête sans accord est REFUSÉE à l’entrée', () => {
      expect(transcribeSchema.safeParse({ audioB64: 'AAAA', filename: 'a.m4a' }).success).toBe(false)
      expect(transcribeSchema.safeParse({ audioB64: 'AAAA', filename: 'a.m4a', recordingConsent: false }).success).toBe(
        false,
      )
      expect(transcribeSchema.safeParse({ audioB64: 'AAAA', filename: 'a.m4a', recordingConsent: true }).success).toBe(
        true,
      )
    })

    it('le service refuse lui aussi, AVANT tout appel réseau — même appelé sans le schéma', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch' as never)
      await expect(service.transcribe(USER, { audioB64: 'AAAA', filename: 'a.m4a' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      await expect(
        service.transcribe(USER, { audioB64: 'AAAA', filename: 'a.m4a', recordingConsent: false }),
      ).rejects.toThrow(/accord/)
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })
  })

  describe('#2319.61-.63 — les entrées', () => {
    it('accepte un compte rendu importé, un e-mail collé et une déclaration à part', () => {
      const parsed = structureNotesSchema.parse({ notes: 'n', inputKind: 'email', userStatement: 'Je rappelle' })
      expect(parsed).toMatchObject({ inputKind: 'email', userStatement: 'Je rappelle' })
      expect(structureNotesSchema.safeParse({ notes: 'n', inputKind: 'mailbox' }).success).toBe(false)
    })

    it('transmet la nature du texte et la déclaration au modèle, et les ANNONCE comme lues', async () => {
      const recap = await service.structure(USER, {
        notes: 'Bonjour, suite à notre échange…',
        inputKind: 'imported_report',
        userStatement: 'J’ai promis deux CV',
      })
      expect(ia.structureMeetingNotes).toHaveBeenCalledWith(
        expect.objectContaining({ inputKind: 'imported_report', userStatement: 'J’ai promis deux CV' }),
      )
      expect(recap.sources.map(source => source.kind)).toEqual(['imported_report', 'user_statement'])
    })

    it('sans déclaration, la déclaration n’est pas annoncée comme lue', async () => {
      const recap = await service.structure(USER, { notes: 'n' })
      expect(recap.sources.map(source => source.kind)).toEqual(['notes'])
    })

    it('une transcription reste une transcription, quelle que soit la nature annoncée', async () => {
      const recap = await service.structure(USER, { notes: 'n', fromTranscript: true, inputKind: 'email' })
      expect(ia.structureMeetingNotes).toHaveBeenCalledWith(expect.objectContaining({ inputKind: 'transcript' }))
      expect(recap.sources[0]?.kind).toBe('transcript')
    })
  })

  describe('#2319.64-.74 — six extractions séparées', () => {
    it('lit chaque liste, et écarte ce qui n’a pas de source', async () => {
      ia.structureMeetingNotes.mockResolvedValue({
        data: {
          facts: [{ content: 'Trois équipes data', evidence: HEARD }, { content: 'Sans source' }],
          requests: [{ content: 'Deux CV', evidence: HEARD }],
          criteria: [{ content: 'Expérience assurance', evidence: HEARD }],
          dates: [
            { label: 'Comité', when: 'fin octobre', evidence: HEARD },
            { label: 'Sans échéance', when: '', evidence: HEARD },
          ],
          client_commitments: [{ content: 'Ils envoient le cahier des charges', evidence: HEARD }],
          user_commitments: [{ content: 'Je rappelle lundi', evidence: { kind: 'user-statement' } }],
        },
      })
      const recap = await service.structure(USER, { notes: 'n' })
      expect(recap.facts).toEqual([{ content: 'Trois équipes data', evidence: HEARD }])
      expect(recap.requests.map(item => item.content)).toEqual(['Deux CV'])
      expect(recap.criteria.map(item => item.content)).toEqual(['Expérience assurance'])
      expect(recap.dates).toEqual([{ label: 'Comité', when: 'fin octobre', evidence: HEARD }])
      expect(recap.clientCommitments.map(item => item.content)).toEqual(['Ils envoient le cahier des charges'])
      expect(recap.userCommitments).toEqual([{ content: 'Je rappelle lundi', evidence: { kind: 'user-statement' } }])
    })
  })

  describe('#2319.79-.82 — ne pas surqualifier', () => {
    it('une opportunité et un besoin sans qualification explicite restent prudents', async () => {
      ia.structureMeetingNotes.mockResolvedValue({
        data: {
          opportunity: { title: 'Migration', qualification: 'probably', evidence: HEARD },
          need: { title: 'Deux devs', evidence: HEARD },
        },
      })
      const { recap, cascade } = await service.cascade(USER, { notes: 'n' })
      expect(recap.opportunity?.qualification).toBe('to_qualify')
      expect(recap.need?.qualification).toBe('potential')
      expect(cascade.cards.find(card => card.kind === 'opportunity')?.state).toBe('to_qualify')
      expect(cascade.cards.find(card => card.kind === 'need')?.state).toBe('potential_need')
    })

    it('la qualification CONFIRMÉE par le modèle passe, citée', async () => {
      ia.structureMeetingNotes.mockResolvedValue({
        data: {
          opportunity: { title: 'Migration', qualification: 'confirmed', evidence: HEARD },
          need: { title: 'Deux devs', qualification: 'expressed', evidence: HEARD },
        },
      })
      const { cascade } = await service.cascade(USER, { notes: 'n' })
      expect(cascade.cards.find(card => card.kind === 'opportunity')?.state).toBe('draft')
      expect(cascade.cards.find(card => card.kind === 'need')?.state).toBe('draft_go_no_go')
    })

    it('.79 — un budget glissé par le modèle ne remonte NULLE PART', async () => {
      ia.structureMeetingNotes.mockResolvedValue({
        data: {
          budget: '500 k€',
          opportunity: { title: 'Migration', budget: '500 k€', evidence: HEARD },
          need: { title: 'Deux devs', budget: '500 k€', evidence: HEARD },
        },
      })
      const recap = await service.structure(USER, { notes: 'n' })
      expect(recap.opportunity?.title).toBe('Migration')
      expect(JSON.stringify(recap)).not.toContain('500 k€')
    })

    it('.81 — aucune mission ne se crée : le lot refuse de la nommer', () => {
      expect(approveInternalSchema.safeParse({ kinds: ['mission'] }).success).toBe(false)
      expect(approveInternalSchema.safeParse({ kinds: ['need'] }).success).toBe(true)
    })

    it('.81 — une mission glissée par le modèle ne remonte nulle part', async () => {
      ia.structureMeetingNotes.mockResolvedValue({ data: { mission: { title: 'Mission Alpha' } } })
      const recap = await service.structure(USER, { notes: 'n' })
      expect(JSON.stringify(recap)).not.toContain('Mission Alpha')
    })

    // #2855 (#2201.14) — `sourceEventId` nomme la PROVENANCE de l'approbation,
    // même champ optionnel que `structureNotesSchema.sourceEventId`.
    it('#2855 — `sourceEventId` est un champ optionnel accepté', () => {
      expect(approveInternalSchema.safeParse({ kinds: ['need'], sourceEventId: 'evt-1' }).success).toBe(true)
      expect(approveInternalSchema.safeParse({ kinds: ['need'] }).success).toBe(true)
    })

    // #3758 — l'instantané structuré que la carte `post_meeting_summary` de
    // Laura relira : accepté sur `recap`, optionnel, et nullable (une
    // réunion sans décision ni prochaine étape ni relance n'en a pas).
    it('#3758 — `recap.snapshot` est accepté, absent et `null` compris', () => {
      const ACCOUNT_ID = '33333333-3333-3333-3333-333333333333'
      expect(
        approveInternalSchema.safeParse({
          kinds: ['recap'],
          recap: { accountId: ACCOUNT_ID, body: 'Point.' },
        }).success,
      ).toBe(true)
      expect(
        approveInternalSchema.safeParse({
          kinds: ['recap'],
          recap: { accountId: ACCOUNT_ID, body: 'Point.', snapshot: null },
        }).success,
      ).toBe(true)
      expect(
        approveInternalSchema.safeParse({
          kinds: ['recap'],
          recap: {
            accountId: ACCOUNT_ID,
            body: 'Point.',
            snapshot: {
              decisions: ['Go.'],
              nextSteps: [{ action: 'Envoyer le devis', owner: '', due: '', evidence: { kind: 'notes-derived' } }],
              reminder: null,
            },
          },
        }).success,
      ).toBe(true)
    })
  })

  describe('démonstration — les nouveautés se voient aussi', () => {
    it('le compte rendu scripté montre « Projet à qualifier » et « Besoin potentiel »', async () => {
      isDemo.mockResolvedValue(true)
      const notes = [
        'Point avec la DSI sur la plateforme data.',
        'Budget non évoqué.',
        'Cadrage en deux temps.',
        'Revue des risques.',
        'Projet de migration vers le cloud.',
        'Deux développeurs data recherchés.',
        'Le client hésite entre deux prestataires.',
        'Le TJM est jugé élevé.',
        'Merci pour l’échange de ce matin.',
        'Trois équipes data en place.',
        'Envoyer deux CV avant vendredi.',
        'Expérience en assurance exigée.',
        'Ils envoient le cahier des charges.',
        'Je rappelle lundi.',
        'On se revoit la semaine prochaine.',
      ].join('\n')
      const { recap, cascade } = await service.cascade(USER, { notes })
      expect(ia.structureMeetingNotes).not.toHaveBeenCalled()
      expect(cascade.cards.find(card => card.kind === 'opportunity')?.state).toBe('to_qualify')
      expect(cascade.cards.find(card => card.kind === 'need')?.state).toBe('potential_need')
      expect(recap.facts.length).toBeGreaterThan(0)
      expect(recap.requests.length).toBeGreaterThan(0)
      expect(recap.criteria.length).toBeGreaterThan(0)
      expect(recap.clientCommitments.length).toBeGreaterThan(0)
      expect(recap.userCommitments.length).toBeGreaterThan(0)
      // Aucun fragment ne paraît deux fois — la règle de la démonstration tient.
      const texts = [
        recap.summary,
        ...recap.decisions,
        ...recap.facts.map(item => item.content),
        ...recap.requests.map(item => item.content),
        ...recap.criteria.map(item => item.content),
        ...recap.clientCommitments.map(item => item.content),
        ...recap.userCommitments.map(item => item.content),
      ]
      expect(new Set(texts).size).toBe(texts.length)
    })

    it('la déclaration tapée par le visiteur devient SES engagements, et le dit', async () => {
      isDemo.mockResolvedValue(true)
      const recap = await service.structure(USER, { notes: 'Point court.', userStatement: 'Je rappelle lundi.' })
      expect(recap.userCommitments).toEqual([{ content: 'Je rappelle lundi.', evidence: { kind: 'user-statement' } }])
      expect(recap.sources.map(source => source.kind)).toContain('user_statement')
    })
  })
})
