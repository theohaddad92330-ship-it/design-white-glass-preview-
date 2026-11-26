import { BadRequestException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { AccountsService } from '../accounts/accounts.service'
import { CrmService } from '../crm/crm.service'
import { AccountMemoryService } from '../crm-core/account-memory.service'
import { NotesService } from '../crm-core/notes.service'
import { ContactEntity } from '../../database/entities/contact.entity'
import { IaClient } from '../ia/ia.client'
import { ProjectPipelineService } from '../projects/project-pipeline.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MeetingNotesService } from './meeting-notes.service'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
/** Une source citable, telle que le modèle la rend. */
const TRANSCRIPT = { kind: 'transcript', excerpt: 'deux profils pour septembre' } as const

describe('MeetingNotesService', () => {
  let service: MeetingNotesService
  let ia: { structureMeetingNotes: jest.Mock; cvExtract: jest.Mock }
  let crm: { createTask: jest.Mock; proposeDealStage: jest.Mock; proposeCreateDeal: jest.Mock }
  let accounts: { findOneForWorkspace: jest.Mock }
  let notes: { create: jest.Mock; existsForSourceEvent: jest.Mock }
  let contactsRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock }
  let projectPipeline: { addNeedForAccount: jest.Mock }
  let accountMemory: { record: jest.Mock }
  const OLD_ENV = { ...process.env }

  beforeEach(async () => {
    process.env = { ...OLD_ENV }
    delete process.env['TRANSCRIPTION_API_KEY']

    ia = {
      structureMeetingNotes: jest.fn().mockResolvedValue({ data: {} }),
      cvExtract: jest.fn().mockResolvedValue({ data: { text: 'Compte rendu importé.', partial: false } }),
    }
    crm = {
      createTask: jest.fn().mockResolvedValue({ id: 't1' }),
      proposeDealStage: jest.fn().mockResolvedValue({ requestId: 'owr-1', pending: true }),
      proposeCreateDeal: jest.fn().mockResolvedValue({ requestId: 'owr-2', pending: true }),
    }
    accounts = {
      findOneForWorkspace: jest.fn().mockResolvedValue({ type: 'success', output: { company_name: 'ACME' } }),
    }
    notes = {
      create: jest.fn().mockResolvedValue({ id: 'note-1' }),
      existsForSourceEvent: jest.fn().mockResolvedValue(false),
    }
    contactsRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((row: Record<string, unknown>) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({ ...row, id: 'new-contact-1' })),
    }
    projectPipeline = { addNeedForAccount: jest.fn().mockResolvedValue({ id: 'need-1' }) }
    accountMemory = { record: jest.fn().mockResolvedValue({ created: 1 }) }

    const moduleRef = await Test.createTestingModule({
      providers: [
        MeetingNotesService,
        { provide: IaClient, useValue: ia },
        {
          provide: WorkspaceContextService,
          useValue: {
            resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
            isDemoWorkspace: jest.fn().mockResolvedValue(false),
          },
        },
        { provide: AccountsService, useValue: accounts },
        { provide: CrmService, useValue: crm },
        { provide: NotesService, useValue: notes },
        { provide: getRepositoryToken(ContactEntity), useValue: contactsRepo },
        { provide: ProjectPipelineService, useValue: projectPipeline },
        { provide: AccountMemoryService, useValue: accountMemory },
      ],
    }).compile()

    service = moduleRef.get(MeetingNotesService)
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  describe('transcription', () => {
    it('déclare la capacité éteinte sans clé, et refuse explicitement', async () => {
      expect(service.status()).toEqual({ available: false })
      await expect(
        service.transcribe(USER, { audioB64: 'AAAA', filename: 'a.m4a', recordingConsent: true }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException)
    })

    it('le refus propose le chemin qui marche — coller ses notes', async () => {
      await expect(
        service.transcribe(USER, { audioB64: 'AAAA', filename: 'a.m4a', recordingConsent: true }),
      ).rejects.toThrow(/Colle tes notes/)
    })

    it('refuse un enregistrement trop long AVANT de l’envoyer', async () => {
      process.env['TRANSCRIPTION_API_KEY'] = 'k'
      const fetchSpy = jest.spyOn(global, 'fetch' as never)
      const huge = Buffer.alloc(25 * 1024 * 1024).toString('base64')
      await expect(
        service.transcribe(USER, { audioB64: huge, filename: 'a.m4a', recordingConsent: true }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })
  })

  describe('#2103.4 — extraction du texte d’un document joint (PDF/Word)', () => {
    it('rend le texte extrait, en réutilisant /cv/extract (aucun second parseur)', async () => {
      const result = await service.extractDocument({
        fileB64: Buffer.from('brief').toString('base64'),
        filename: 'brief.pdf',
      })
      expect(result).toEqual({ text: 'Compte rendu importé.', partial: false })
      expect(ia.cvExtract).toHaveBeenCalledWith({
        fileB64: Buffer.from('brief').toString('base64'),
        filename: 'brief.pdf',
      })
    })

    it('fait voyager le signal `partial` (#2542.3) — non mesuré n’est jamais 0', async () => {
      ia.cvExtract.mockResolvedValue({ data: { text: 'Une partie lisible.', partial: true } })
      const result = await service.extractDocument({ fileB64: 'QQ==', filename: 'scan-partiel.pdf' })
      expect(result.partial).toBe(true)
    })

    it('un fichier vide est refusé AVANT tout appel au service IA', async () => {
      await expect(service.extractDocument({ fileB64: '', filename: 'vide.pdf' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(ia.cvExtract).not.toHaveBeenCalled()
    })

    it('un fichier trop lourd est refusé AVANT tout appel au service IA', async () => {
      const huge = Buffer.alloc(9 * 1024 * 1024).toString('base64')
      await expect(service.extractDocument({ fileB64: huge, filename: 'trop-lourd.pdf' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(ia.cvExtract).not.toHaveBeenCalled()
    })

    it('un fichier illisible rend une erreur NOMMÉE, jamais un texte inventé', async () => {
      ia.cvExtract.mockResolvedValue({ detail: 'PDF illisible (corrompu ou protégé par mot de passe).' })
      await expect(service.extractDocument({ fileB64: 'QQ==', filename: 'corrompu.pdf' })).rejects.toThrow(
        /PDF illisible/,
      )
    })

    it('un service IA injoignable rend une erreur claire, jamais un texte inventé', async () => {
      ia.cvExtract.mockRejectedValue(new Error('ECONNRESET'))
      await expect(service.extractDocument({ fileB64: 'QQ==', filename: 'brief.pdf' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
    })

    it('sans aucun motif du service IA, un message par défaut reste explicite', async () => {
      ia.cvExtract.mockResolvedValue({ data: {} })
      await expect(service.extractDocument({ fileB64: 'QQ==', filename: 'brief.pdf' })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      )
    })
  })

  describe('structuration', () => {
    it('n’envoie que le nom d’un compte RÉELLEMENT dans l’espace', async () => {
      await service.structure(USER, { notes: 'n', accountId: '33333333-3333-3333-3333-333333333333' })
      expect(ia.structureMeetingNotes).toHaveBeenCalledWith(expect.objectContaining({ accountName: 'ACME' }))
    })

    it('n’invente pas de nom quand le dossier est introuvable', async () => {
      // Un nom fourni par le client serait un moyen simple de faire écrire
      // n'importe quel en-tête dans un document qui circule.
      accounts.findOneForWorkspace.mockResolvedValue({ type: 'not_found' })
      await service.structure(USER, { notes: 'n', accountId: '33333333-3333-3333-3333-333333333333' })
      expect(ia.structureMeetingNotes).toHaveBeenCalledWith(expect.objectContaining({ accountName: '' }))
    })

    // #2103.37 — toutes les sorties restent rattachées au RDV source : le
    // compte rendu dont elles sont TOUTES dérivées (résumé, cascade, tâches,
    // brouillon, stade CRM) porte l'id de l'événement d'agenda transmis par le
    // client, jamais un id deviné côté serveur.
    it('#2103.37 — le compte rendu porte l’id du rendez-vous source, quand il est transmis', async () => {
      const recap = await service.structure(USER, { notes: 'n', sourceEventId: 'evt-42' })
      expect(recap.sourceEventId).toBe('evt-42')
    })

    it('#2103.37 — reste `null` sans rendez-vous source, jamais un id inventé', async () => {
      const recap = await service.structure(USER, { notes: 'n' })
      expect(recap.sourceEventId).toBeNull()
    })

    it('une réponse vide donne un compte rendu vide, pas une erreur', async () => {
      const recap = await service.structure(USER, { notes: 'n' })
      expect(recap.summary).toBe('')
      expect(recap.decisions).toEqual([])
      expect(recap.nextSteps).toEqual([])
      expect(recap.openQuestions).toEqual([])
      expect(recap.signals).toEqual([])
      expect(recap.followUpEmail).toBe('')
      // Les sorties de la partie « après » sont ABSENTES, pas vides et
      // affichables : `null` dit « rien de tel n'a été entendu ».
      expect(recap.opportunity).toBeNull()
      expect(recap.need).toBeNull()
      expect(recap.crmStage).toBeNull()
      expect(recap.reminder).toBeNull()
      expect(recap.mentionedContacts).toEqual([])
      expect(recap.learnings).toEqual([])
    })

    it('traduit les champs de l’IA et écarte les entrées vides', async () => {
      ia.structureMeetingNotes.mockResolvedValue({
        data: {
          summary: ' Le client cherche deux profils Java. ',
          decisions: ['Deux CV avant vendredi', '  ', null],
          next_steps: [
            { action: 'Envoyer les CV', owner: 'Théo', due: 'vendredi', evidence: TRANSCRIPT },
            { action: 'Rappeler', evidence: TRANSCRIPT },
          ],
          open_questions: ['Quel TJM ?'],
          signals: ['Budget voté'],
          follow_up_email: 'Bonjour,',
        },
      })
      const recap = await service.structure(USER, { notes: 'n' })
      expect(recap.summary).toBe('Le client cherche deux profils Java.')
      expect(recap.decisions).toEqual(['Deux CV avant vendredi'])
      // Une action sans propriétaire ni échéance reste une action valable.
      expect(recap.nextSteps[1]).toEqual({
        action: 'Rappeler',
        owner: '',
        due: '',
        evidence: { kind: 'transcript', excerpt: 'deux profils pour septembre' },
      })
    })

    it('n’annonce que les sources RÉELLEMENT lues', async () => {
      // La maquette écrit « transcript + CRM + agenda ». L'agenda n'est pas lu
      // ici, donc il n'est pas annoncé : une source affichée qu'on n'a pas
      // ouverte est une garantie inventée.
      const recap = await service.structure(USER, { notes: 'n', fromTranscript: true })
      expect(recap.sources).toEqual([{ kind: 'transcript', detail: '' }])
      expect(ia.structureMeetingNotes).toHaveBeenCalledWith(expect.objectContaining({ fromTranscript: true }))
    })

    it('ajoute le CRM aux sources quand un dossier a réellement été lu', async () => {
      const recap = await service.structure(USER, { notes: 'n', accountId: '33333333-3333-3333-3333-333333333333' })
      expect(recap.sources).toEqual([
        { kind: 'notes', detail: '' },
        { kind: 'crm', detail: 'ACME' },
      ])
    })
  })

  describe('une sortie sans source ne remonte pas', () => {
    it('une opportunité non sourcée est refusée à l’entrée', async () => {
      // C'est la ligne qui sépare « le client a dit ça » de « le modèle le
      // pense ». Un objet sans extrait n'entre pas dans le compte rendu.
      ia.structureMeetingNotes.mockResolvedValue({
        data: { opportunity: { title: 'Refonte du SI', account_name: 'ACME' } },
      })
      expect((await service.structure(USER, { notes: 'n' })).opportunity).toBeNull()
    })

    it('un extrait de transcript VIDE ne cite personne', async () => {
      ia.structureMeetingNotes.mockResolvedValue({
        data: { need: { title: 'Deux devs', evidence: { kind: 'transcript', excerpt: '   ' } } },
      })
      expect((await service.structure(USER, { notes: 'n' })).need).toBeNull()
    })

    it('des notes dictées se déclarent telles quelles', async () => {
      ia.structureMeetingNotes.mockResolvedValue({
        data: { need: { title: 'Deux devs', evidence: { kind: 'notes-derived' } } },
      })
      expect((await service.structure(USER, { notes: 'n' })).need).toEqual({
        title: 'Deux devs',
        detail: '',
        // #2319.82 — sans qualification explicite, un besoin reste POTENTIEL.
        qualification: 'potential',
        evidence: { kind: 'notes-derived' },
      })
    })

    it('une personne citée sans source ne se retrouve pas dans la liste', async () => {
      ia.structureMeetingNotes.mockResolvedValue({
        data: {
          mentioned_contacts: [
            { full_name: 'Camille Rey', role: 'DSI', evidence: TRANSCRIPT },
            { full_name: 'Quelqu’un d’inventé' },
          ],
        },
      })
      const recap = await service.structure(USER, { notes: 'n' })
      expect(recap.mentionedContacts).toHaveLength(1)
      expect(recap.mentionedContacts[0]?.fullName).toBe('Camille Rey')
    })
  })

  describe('la cascade et son lot', () => {
    it('rend les cartes dérivées du compte rendu, jamais recalculées ici', async () => {
      ia.structureMeetingNotes.mockResolvedValue({
        data: {
          summary: 'Camille cherche deux profils.',
          recap_evidence: TRANSCRIPT,
          follow_up_email: 'Bonjour Camille,',
          follow_up_evidence: TRANSCRIPT,
          reminder: { content: 'Relancer', due_label: '', evidence: TRANSCRIPT },
        },
      })
      const { cascade } = await service.cascade(USER, { notes: 'n' })
      expect(cascade.cards.map(card => card.kind)).toEqual(['recap', 'follow_up_email', 'reminder'])
      expect(cascade.summary.externalDrafts).toEqual(['follow_up_email', 'reminder'])
      expect(cascade.summary.internalWrites).toEqual([{ kind: 'recap', count: 1 }])
    })

    it('le lot ne peut pas nommer un brouillon externe — le type l’interdit', async () => {
      // Preuve à l'exécution du même refus que le compilateur oppose : la
      // méthode ne connaît que les sorties internes.
      const result = await service.approveInternal(USER, { kinds: ['recap', 'opportunity'] })
      expect(result.outcomes.map(outcome => outcome.kind)).toEqual(['recap', 'opportunity'])
      expect(crm.createTask).not.toHaveBeenCalled()
    })

    it('pose réellement les actions retenues', async () => {
      const result = await service.approveInternal(USER, {
        kinds: ['next_steps'],
        tasks: [{ subject: 'Envoyer les CV', dueAt: '2026-09-07T09:00:00.000Z' }],
      })
      expect(result.outcomes[0]).toEqual({ kind: 'next_steps', outcome: 'done', missing: null, detail: null })
    })

    /**
     * #2777 / #2103.10 — LES HUIT SORTIES INTERNES ONT DÉSORMAIS TOUTES LEUR
     * PORTE. `client_issue` ferme la liste ; il n'existe plus de sortie
     * interne qui réponde `blocked` par défaut quand tout est branché.
     * « Bloqué, et voici la capacité qui manque » ne se démontre plus qu'en
     * RETIRANT une porte — voir les tests `répond blocked …` de chaque
     * sortie ci-dessus.
     */
    it('aucune sortie interne ne répond plus `blocked` quand tout est branché', async () => {
      const result = await service.approveInternal(USER, {
        kinds: ['recap', 'opportunity', 'need', 'contacts', 'next_steps', 'crm_stage', 'learnings', 'client_issue'],
      })
      expect(result.outcomes.map(outcome => outcome.outcome)).not.toContain('blocked')
    })

    /**
     * #1903.12 — le compte rendu ÉCRIT réellement une note sur le compte,
     * quand l'appelant l'a identifié. Avant ce lot, `recap` répondait
     * toujours `blocked` / « il manque : le carnet du compte ».
     */
    describe('#1903.12 — le compte rendu s’écrit dans le carnet du compte', () => {
      const ACCOUNT = '33333333-3333-3333-3333-333333333333'

      it('pose une note sur le compte identifié', async () => {
        const result = await service.approveInternal(USER, {
          kinds: ['recap'],
          recap: { accountId: ACCOUNT, body: 'Camille cherche deux profils.' },
        })
        expect(notes.create).toHaveBeenCalledWith(
          USER,
          {
            entityType: 'account',
            entityId: ACCOUNT,
            body: 'Camille cherche deux profils.',
          },
          { sourceEventId: null, meetingRecapSnapshot: null },
        )
        expect(result.outcomes).toEqual([{ kind: 'recap', outcome: 'done', missing: null, detail: null }])
      })

      /**
       * #3758 — reste du lot J14 : la carte `post_meeting_summary` de Laura
       * relit un instantané STRUCTURÉ (décisions, prochaines étapes,
       * relance), jamais le texte libre de `body`. Posé à CÔTÉ, jamais à la
       * place.
       */
      it('enregistre l’instantané structuré à côté du texte, quand l’écran en a dérivé un', async () => {
        const snapshot = {
          decisions: ['Go sur le pilote.'],
          nextSteps: [{ action: 'Envoyer le devis', owner: 'Théo', due: 'vendredi', evidence: TRANSCRIPT }],
          reminder: { content: 'Relancer après le comité budget.', dueLabel: '', evidence: TRANSCRIPT },
        }
        await service.approveInternal(USER, {
          kinds: ['recap'],
          recap: { accountId: ACCOUNT, body: 'Camille cherche deux profils.', snapshot },
        })
        expect(notes.create).toHaveBeenCalledWith(
          USER,
          {
            entityType: 'account',
            entityId: ACCOUNT,
            body: 'Camille cherche deux profils.',
          },
          { sourceEventId: null, meetingRecapSnapshot: snapshot },
        )
      })

      it('sans instantané dérivé, la note n’en porte aucun — jamais un objet vide', async () => {
        await service.approveInternal(USER, {
          kinds: ['recap'],
          recap: { accountId: ACCOUNT, body: 'Camille cherche deux profils.', snapshot: null },
        })
        expect(notes.create).toHaveBeenCalledWith(
          USER,
          expect.anything(),
          expect.objectContaining({ meetingRecapSnapshot: null }),
        )
      })

      /**
       * #2103.1 — la note GARDE son rendez-vous d'origine : c'est le préalable
       * du déclencheur post-RDV (« ce rendez-vous a-t-il déjà un CR ? »).
       */
      it('garde le rendez-vous d’origine sur la note, quand connu', async () => {
        await service.approveInternal(USER, {
          kinds: ['recap'],
          sourceEventId: 'gcal-evt-42',
          recap: { accountId: ACCOUNT, body: 'Camille cherche deux profils.' },
        })
        expect(notes.create).toHaveBeenCalledWith(
          USER,
          {
            entityType: 'account',
            entityId: ACCOUNT,
            body: 'Camille cherche deux profils.',
          },
          { sourceEventId: 'gcal-evt-42', meetingRecapSnapshot: null },
        )
      })

      it('ne fabrique aucune note sans compte identifié — jamais deviné', async () => {
        const result = await service.approveInternal(USER, { kinds: ['recap'] })
        expect(notes.create).not.toHaveBeenCalled()
        expect(result.outcomes).toEqual([
          { kind: 'recap', outcome: 'skipped', missing: null, detail: 'Aucun compte identifié.' },
        ])
      })
    })

    /**
     * #2103.1 — LE PRÉALABLE du déclencheur post-RDV : savoir si un
     * rendez-vous a déjà un compte rendu, pour ne jamais en reproposer un.
     */
    describe('#2103.1 — recapExists', () => {
      it('interroge le carnet de notes par rendez-vous', async () => {
        notes.existsForSourceEvent.mockResolvedValue(true)
        const result = await service.recapExists(USER, 'gcal-evt-42')
        expect(notes.existsForSourceEvent).toHaveBeenCalledWith(USER, 'gcal-evt-42')
        expect(result).toEqual({ exists: true })
      })

      it('rend false sans carnet de notes branché — jamais deviné', async () => {
        const bareModule = await Test.createTestingModule({
          providers: [
            MeetingNotesService,
            { provide: IaClient, useValue: ia },
            {
              provide: WorkspaceContextService,
              useValue: { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }) },
            },
          ],
        }).compile()
        const bare = bareModule.get(MeetingNotesService)
        await expect(bare.recapExists(USER, 'gcal-evt-42')).resolves.toEqual({ exists: false })
      })
    })

    /**
     * #2777 — les personnes CITÉES pendant le rendez-vous s'écrivent
     * réellement dans le répertoire de contacts, quand l'appelant a identifié
     * le compte. Avant ce lot, `contacts` répondait toujours `blocked` / « il
     * manque : le répertoire de contacts ».
     */
    describe('#2777 — les personnes citées s’écrivent dans le répertoire de contacts', () => {
      const ACCOUNT = '33333333-3333-3333-3333-333333333333'

      it('crée une fiche par personne citée, estampillée `meeting`', async () => {
        const result = await service.approveInternal(USER, {
          kinds: ['contacts'],
          contacts: { accountId: ACCOUNT, mentioned: [{ fullName: 'Camille Rey', role: 'DSI' }] },
        })
        expect(contactsRepo.save).toHaveBeenCalledTimes(1)
        expect(contactsRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({
            account_id: ACCOUNT,
            user_id: USER,
            workspace_id: WORKSPACE,
            full_name: 'Camille Rey',
            title: 'DSI',
            source: 'meeting',
          }),
        )
        expect(result.outcomes).toEqual([{ kind: 'contacts', outcome: 'done', missing: null, detail: null }])
      })

      it('SAIT DIRE NON — un doublon par nom, accents et casse pliés, ne crée rien', async () => {
        contactsRepo.find.mockResolvedValue([{ id: 'c-7', full_name: 'camille rèy' }])
        const result = await service.approveInternal(USER, {
          kinds: ['contacts'],
          contacts: { accountId: ACCOUNT, mentioned: [{ fullName: 'Camille Rey' }] },
        })
        expect(contactsRepo.save).not.toHaveBeenCalled()
        expect(result.outcomes).toEqual([{ kind: 'contacts', outcome: 'done', missing: null, detail: null }])
      })

      it('SAIT DIRE NON — deux fiches répondent : on le DIT, on ne fusionne ni ne choisit', async () => {
        contactsRepo.find.mockResolvedValue([
          { id: 'c-1', full_name: 'Camille Rey' },
          { id: 'c-2', full_name: 'Camille REY' },
        ])
        const result = await service.approveInternal(USER, {
          kinds: ['contacts'],
          contacts: { accountId: ACCOUNT, mentioned: [{ fullName: 'Camille Rey' }] },
        })
        expect(contactsRepo.save).not.toHaveBeenCalled()
        expect(result.outcomes).toEqual([
          {
            kind: 'contacts',
            outcome: 'skipped',
            missing: null,
            detail: 'Homonymes non créés (plusieurs fiches déjà présentes) : Camille Rey',
          },
        ])
      })

      it('un mélange créé/homonyme est dit PARTIEL', async () => {
        contactsRepo.find.mockResolvedValue([
          { id: 'c-1', full_name: 'Camille Rey' },
          { id: 'c-2', full_name: 'Camille REY' },
        ])
        const result = await service.approveInternal(USER, {
          kinds: ['contacts'],
          contacts: {
            accountId: ACCOUNT,
            mentioned: [{ fullName: 'Camille Rey' }, { fullName: 'Théo Martin', role: 'RSSI' }],
          },
        })
        expect(contactsRepo.save).toHaveBeenCalledTimes(1)
        expect(result.outcomes).toEqual([
          {
            kind: 'contacts',
            outcome: 'partial',
            missing: null,
            detail: 'Homonymes non créés (plusieurs fiches déjà présentes) : Camille Rey',
          },
        ])
      })

      it('ne fabrique aucune fiche sans compte identifié — jamais deviné', async () => {
        const result = await service.approveInternal(USER, { kinds: ['contacts'] })
        expect(contactsRepo.save).not.toHaveBeenCalled()
        expect(result.outcomes).toEqual([
          { kind: 'contacts', outcome: 'skipped', missing: null, detail: 'Aucun compte identifié.' },
        ])
      })

      it('répond `blocked` / « le répertoire de contacts » quand il n’est pas branché', async () => {
        const moduleRef = await Test.createTestingModule({
          providers: [
            MeetingNotesService,
            { provide: IaClient, useValue: ia },
            {
              provide: WorkspaceContextService,
              useValue: {
                resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
                isDemoWorkspace: jest.fn().mockResolvedValue(false),
              },
            },
          ],
        }).compile()
        const bare = moduleRef.get(MeetingNotesService)
        const result = await bare.approveInternal(USER, {
          kinds: ['contacts'],
          contacts: { accountId: ACCOUNT, mentioned: [{ fullName: 'Camille Rey' }] },
        })
        expect(result.outcomes).toEqual([{ kind: 'contacts', outcome: 'blocked', missing: 'contacts', detail: null }])
      })
    })

    /**
     * #1934.18 — LE STADE CRM PASSE PAR LA PORTE.
     *
     * Il rendait `blocked` / « il manque : ton CRM » — un refus honnête, mais un
     * refus. Ce que ces trois tests tiennent : la proposition est DÉPOSÉE, elle
     * n'ÉCRIT rien, et une case vide ne fabrique pas une proposition.
     */
    describe('#1934.18 — le stade CRM se propose', () => {
      const PROPOSAL = {
        dealId: 'hs-deal-42',
        stageId: 'contractsent',
        rationale: 'Ils ont demandé un devis.',
      }

      it('dépose la proposition et le DIT — rien n’est écrit, tout attend une validation', async () => {
        const result = await service.approveInternal(USER, { kinds: ['crm_stage'], crmStage: PROPOSAL })

        expect(crm.proposeDealStage).toHaveBeenCalledTimes(1)
        expect(crm.proposeDealStage).toHaveBeenCalledWith(USER, expect.objectContaining(PROPOSAL))
        expect(result.outcomes[0]?.kind).toBe('crm_stage')
        // Ni `done` (rien n'est écrit) ni `blocked` (le chemin existe) : la
        // proposition attend quelqu'un.
        expect(result.outcomes[0]?.outcome).toBe('proposed')
        expect(result.outcomes[0]?.missing).toBeNull()
      })

      it('sait dire NON : sans stade retenu, AUCUNE proposition n’est déposée', async () => {
        const result = await service.approveInternal(USER, { kinds: ['crm_stage'] })
        expect(crm.proposeDealStage).not.toHaveBeenCalled()
        expect(result.outcomes[0]?.outcome).toBe('skipped')
      })

      it('un échec de dépôt est dit ÉCHEC, jamais « proposé »', async () => {
        crm.proposeDealStage.mockRejectedValueOnce(new Error('Aucun CRM connecté.'))
        const result = await service.approveInternal(USER, { kinds: ['crm_stage'], crmStage: PROPOSAL })
        expect(result.outcomes[0]?.outcome).toBe('failed')
        expect(result.outcomes[0]?.detail).toContain('Aucun CRM connecté.')
      })

      /**
       * #2855 (#2201.14) — la PROVENANCE de la proposition : quel compte rendu
       * l'a composée. `sourceEventId` vient du rendez-vous source
       * (`structureNotesSchema.sourceEventId`, déjà porté par le compte rendu),
       * jamais recalculé — le même identifiant voyage jusqu'à l'approbation.
       */
      it('#2855 — nomme la provenance quand le compte rendu vient d’un rendez-vous', async () => {
        await service.approveInternal(USER, {
          kinds: ['crm_stage'],
          crmStage: PROPOSAL,
          sourceEventId: 'evt-42',
        })
        expect(crm.proposeDealStage).toHaveBeenCalledWith(
          USER,
          expect.objectContaining({ source: { kind: 'meeting_note', ref: 'evt-42' } }),
        )
      })

      it('#2855 — sans rendez-vous source, ne nomme AUCUNE provenance devinée', async () => {
        await service.approveInternal(USER, { kinds: ['crm_stage'], crmStage: PROPOSAL })
        expect(crm.proposeDealStage).toHaveBeenCalledWith(USER, expect.objectContaining({ source: null }))
      })
    })

    /**
     * #2777 — L'OPPORTUNITÉ CANDIDATE SE PROPOSE COMME DEAL, ELLE NE S'ÉCRIT
     * PAS. Avant ce lot, `opportunity` rendait toujours `blocked` / « il
     * manque : ton CRM ». Même raisonnement que `crm_stage` : le titre vient
     * d'un modèle, la carte validée reste une PROPOSITION en file.
     */
    describe('#2777 — l’opportunité se propose au CRM', () => {
      const ACCOUNT = '33333333-3333-3333-3333-333333333333'

      it('dépose la proposition avec le nom de compte RÉSOLU, jamais celui de la requête', async () => {
        const result = await service.approveInternal(USER, {
          kinds: ['opportunity'],
          opportunity: { accountId: ACCOUNT, title: 'Deux profils data pour septembre' },
        })
        expect(accounts.findOneForWorkspace).toHaveBeenCalledWith(ACCOUNT, WORKSPACE, null)
        expect(crm.proposeCreateDeal).toHaveBeenCalledWith(USER, {
          title: 'Deux profils data pour septembre',
          accountName: 'ACME',
        })
        expect(result.outcomes).toEqual([{ kind: 'opportunity', outcome: 'proposed', missing: null, detail: null }])
      })

      it('sait dire NON : sans opportunité retenue, AUCUNE proposition n’est déposée', async () => {
        const result = await service.approveInternal(USER, { kinds: ['opportunity'] })
        expect(crm.proposeCreateDeal).not.toHaveBeenCalled()
        expect(result.outcomes).toEqual([
          { kind: 'opportunity', outcome: 'skipped', missing: null, detail: 'Aucune opportunité retenue.' },
        ])
      })

      it('répond `blocked` / « ton CRM » quand aucun CRM n’est connecté', async () => {
        const moduleRef = await Test.createTestingModule({
          providers: [
            MeetingNotesService,
            { provide: IaClient, useValue: ia },
            {
              provide: WorkspaceContextService,
              useValue: {
                resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
                isDemoWorkspace: jest.fn().mockResolvedValue(false),
              },
            },
          ],
        }).compile()
        const bare = moduleRef.get(MeetingNotesService)
        const result = await bare.approveInternal(USER, {
          kinds: ['opportunity'],
          opportunity: { accountId: ACCOUNT, title: 'X' },
        })
        expect(result.outcomes).toEqual([{ kind: 'opportunity', outcome: 'blocked', missing: 'crm', detail: null }])
      })

      it('un dépôt refusé est dit ÉCHEC, jamais « proposé »', async () => {
        crm.proposeCreateDeal.mockRejectedValueOnce(new Error('Aucun CRM connecté.'))
        const result = await service.approveInternal(USER, {
          kinds: ['opportunity'],
          opportunity: { accountId: ACCOUNT, title: 'X' },
        })
        expect(result.outcomes[0]?.outcome).toBe('failed')
        expect(result.outcomes[0]?.detail).toContain('Aucun CRM connecté.')
      })
    })

    /**
     * #2777 — LE BESOIN EXPRIMÉ S'ÉCRIT RÉELLEMENT DANS LE PIPE, SANS PROJET
     * (#2558.1). Avant ce lot, `need` rendait toujours `blocked` / « il
     * manque : les besoins ».
     */
    describe('#2777 — le besoin s’écrit dans le pipe, sans projet', () => {
      const ACCOUNT = '33333333-3333-3333-3333-333333333333'

      it('crée une ligne CHEZ LE COMPTE, sans projet, estampillée `meeting_notes` / `model`', async () => {
        const result = await service.approveInternal(USER, {
          kinds: ['need'],
          need: { accountId: ACCOUNT, title: 'Deux profils data pour septembre', detail: 'Stack Python, remote ok' },
        })
        expect(projectPipeline.addNeedForAccount).toHaveBeenCalledWith(WORKSPACE, ACCOUNT, {
          title: 'Deux profils data pour septembre',
          source: 'meeting_notes',
          provenance: 'model',
          context: 'Stack Python, remote ok',
        })
        expect(result.outcomes).toEqual([{ kind: 'need', outcome: 'done', missing: null, detail: null }])
      })

      it('sait dire NON : sans besoin retenu, AUCUNE ligne n’est écrite', async () => {
        const result = await service.approveInternal(USER, { kinds: ['need'] })
        expect(projectPipeline.addNeedForAccount).not.toHaveBeenCalled()
        expect(result.outcomes).toEqual([
          { kind: 'need', outcome: 'skipped', missing: null, detail: 'Aucun besoin identifié.' },
        ])
      })

      it('répond `blocked` / « les besoins » quand le pipe n’est pas branché', async () => {
        const moduleRef = await Test.createTestingModule({
          providers: [
            MeetingNotesService,
            { provide: IaClient, useValue: ia },
            {
              provide: WorkspaceContextService,
              useValue: {
                resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
                isDemoWorkspace: jest.fn().mockResolvedValue(false),
              },
            },
          ],
        }).compile()
        const bare = moduleRef.get(MeetingNotesService)
        const result = await bare.approveInternal(USER, {
          kinds: ['need'],
          need: { accountId: ACCOUNT, title: 'X' },
        })
        expect(result.outcomes).toEqual([{ kind: 'need', outcome: 'blocked', missing: 'needs', detail: null }])
      })

      it('un échec d’écriture est NOMMÉ', async () => {
        projectPipeline.addNeedForAccount.mockRejectedValueOnce(new Error('Compte introuvable'))
        const result = await service.approveInternal(USER, {
          kinds: ['need'],
          need: { accountId: ACCOUNT, title: 'X' },
        })
        expect(result.outcomes[0]?.outcome).toBe('failed')
        expect(result.outcomes[0]?.detail).toContain('Compte introuvable')
      })
    })

    /**
     * #2777 — LES APPRENTISSAGES S'ÉCRIVENT DANS LA MÉMOIRE DU COMPTE, SANS
     * FILE DE VALIDATION (bande `n4_bounded_auto`). Avant ce lot, `learnings`
     * rendait toujours `blocked` / « il manque : la mémoire du compte ».
     */
    describe('#2777 — les apprentissages s’écrivent dans la mémoire du compte', () => {
      const ACCOUNT = '33333333-3333-3333-3333-333333333333'

      it('écrit chaque apprentissage retenu, DIRECTEMENT — aucune file de validation', async () => {
        const result = await service.approveInternal(USER, {
          kinds: ['learnings'],
          learnings: { accountId: ACCOUNT, entries: [{ kind: 'objection', content: 'Budget gelé.' }] },
        })
        expect(accountMemory.record).toHaveBeenCalledWith(USER, ACCOUNT, [
          { kind: 'objection', content: 'Budget gelé.' },
        ])
        expect(result.outcomes).toEqual([{ kind: 'learnings', outcome: 'done', missing: null, detail: null }])
      })

      it('sait dire NON : sans apprentissage retenu, RIEN n’est écrit', async () => {
        const result = await service.approveInternal(USER, { kinds: ['learnings'] })
        expect(accountMemory.record).not.toHaveBeenCalled()
        expect(result.outcomes).toEqual([
          { kind: 'learnings', outcome: 'skipped', missing: null, detail: 'Aucun apprentissage retenu.' },
        ])
      })

      it('répond `blocked` / « la mémoire du compte » quand elle n’est pas branchée', async () => {
        const moduleRef = await Test.createTestingModule({
          providers: [
            MeetingNotesService,
            { provide: IaClient, useValue: ia },
            {
              provide: WorkspaceContextService,
              useValue: {
                resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
                isDemoWorkspace: jest.fn().mockResolvedValue(false),
              },
            },
          ],
        }).compile()
        const bare = moduleRef.get(MeetingNotesService)
        const result = await bare.approveInternal(USER, {
          kinds: ['learnings'],
          learnings: { accountId: ACCOUNT, entries: [{ kind: 'objection', content: 'X' }] },
        })
        expect(result.outcomes).toEqual([
          { kind: 'learnings', outcome: 'blocked', missing: 'account_memory', detail: null },
        ])
      })

      it('un mélange écrit/refusé est dit PARTIEL', async () => {
        accountMemory.record.mockResolvedValueOnce({ created: 1 })
        const result = await service.approveInternal(USER, {
          kinds: ['learnings'],
          learnings: {
            accountId: ACCOUNT,
            entries: [
              { kind: 'objection', content: 'Budget gelé.' },
              { kind: 'commitment', content: 'Rappellent après le comité.' },
            ],
          },
        })
        expect(result.outcomes).toEqual([{ kind: 'learnings', outcome: 'partial', missing: null, detail: null }])
      })

      it('un échec d’écriture est NOMMÉ', async () => {
        accountMemory.record.mockRejectedValueOnce(new Error('Compte introuvable'))
        const result = await service.approveInternal(USER, {
          kinds: ['learnings'],
          learnings: { accountId: ACCOUNT, entries: [{ kind: 'objection', content: 'X' }] },
        })
        expect(result.outcomes[0]?.outcome).toBe('failed')
        expect(result.outcomes[0]?.detail).toContain('Compte introuvable')
      })
    })

    /**
     * #2103.10 — LE PROBLÈME CLIENT S'ÉCRIT DANS LE CARNET DU COMPTE, même
     * porte que `recap` (`notesService`) : ni CRM ni ERP, pas de file de
     * validation dédiée à fabriquer pour une sortie sans cible propre.
     */
    describe('#2103.10 — le problème client s’écrit dans le carnet du compte', () => {
      const ACCOUNT = '33333333-3333-3333-3333-333333333333'

      it('pose une note sur le compte identifié, titre et détail réunis', async () => {
        const result = await service.approveInternal(USER, {
          kinds: ['client_issue'],
          clientIssue: {
            accountId: ACCOUNT,
            title: 'Portail transporteurs instable',
            detail: 'Tombe en heures de pointe',
          },
        })
        expect(notes.create).toHaveBeenCalledWith(USER, {
          entityType: 'account',
          entityId: ACCOUNT,
          body: 'Portail transporteurs instable — Tombe en heures de pointe',
        })
        expect(result.outcomes).toEqual([{ kind: 'client_issue', outcome: 'done', missing: null, detail: null }])
      })

      it('sans détail, la note ne porte que le titre', async () => {
        await service.approveInternal(USER, {
          kinds: ['client_issue'],
          clientIssue: { accountId: ACCOUNT, title: 'Portail transporteurs instable' },
        })
        expect(notes.create).toHaveBeenCalledWith(
          USER,
          expect.objectContaining({ body: 'Portail transporteurs instable' }),
        )
      })

      it('ne fabrique aucune note sans problème retenu — jamais deviné', async () => {
        const result = await service.approveInternal(USER, { kinds: ['client_issue'] })
        expect(notes.create).not.toHaveBeenCalled()
        expect(result.outcomes).toEqual([
          { kind: 'client_issue', outcome: 'skipped', missing: null, detail: 'Aucun problème client retenu.' },
        ])
      })

      it('répond `blocked` / « notes » quand le carnet n’est pas branché', async () => {
        const moduleRef = await Test.createTestingModule({
          providers: [
            MeetingNotesService,
            { provide: IaClient, useValue: ia },
            {
              provide: WorkspaceContextService,
              useValue: {
                resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
                isDemoWorkspace: jest.fn().mockResolvedValue(false),
              },
            },
          ],
        }).compile()
        const bare = moduleRef.get(MeetingNotesService)
        const result = await bare.approveInternal(USER, {
          kinds: ['client_issue'],
          clientIssue: { accountId: ACCOUNT, title: 'X' },
        })
        expect(result.outcomes).toEqual([{ kind: 'client_issue', outcome: 'blocked', missing: 'notes', detail: null }])
      })

      it('un échec d’écriture est NOMMÉ', async () => {
        notes.create.mockRejectedValueOnce(new Error('Compte introuvable'))
        const result = await service.approveInternal(USER, {
          kinds: ['client_issue'],
          clientIssue: { accountId: ACCOUNT, title: 'X' },
        })
        expect(result.outcomes[0]?.outcome).toBe('failed')
        expect(result.outcomes[0]?.detail).toContain('Compte introuvable')
      })
    })

    it('un échec partiel est dit partiel', async () => {
      crm.createTask.mockRejectedValueOnce(new Error('quota CRM')).mockResolvedValueOnce({ id: 't2' })
      const result = await service.approveInternal(USER, {
        kinds: ['next_steps'],
        tasks: [
          { subject: 'A', dueAt: '2026-09-07T09:00:00.000Z' },
          { subject: 'B', dueAt: '2026-09-07T09:00:00.000Z' },
        ],
      })
      expect(result.outcomes[0]?.outcome).toBe('partial')
      expect(result.outcomes[0]?.detail).toContain('quota CRM')
    })
  })

  describe('espace de démonstration', () => {
    it('n’appelle AUCUN modèle : le compte rendu est scripté', async () => {
      const context = (service as unknown as { workspaceContext: { isDemoWorkspace: jest.Mock } }).workspaceContext
      context.isDemoWorkspace.mockResolvedValue(true)

      const recap = await service.structure(USER, { notes: 'Ligne un\nLigne deux\nLigne trois' })

      expect(ia.structureMeetingNotes).not.toHaveBeenCalled()
      expect(recap.summary).toBe('Ligne un')
      expect(recap.decisions).toEqual(['Ligne deux'])
      expect(recap.nextSteps).toEqual([
        { action: 'Ligne trois', owner: '', due: '', evidence: { kind: 'notes-derived' } },
      ])
    })

    it('découpe un PARAGRAPHE, pas seulement des lignes', async () => {
      // Le défaut vu en démonstration : personne ne colle une liste à puces
      // devant un prospect, on colle un paragraphe. Le découpage ne coupant que
      // sur les retours à la ligne, tout tenait dans un seul fragment.
      const context = (service as unknown as { workspaceContext: { isDemoWorkspace: jest.Mock } }).workspaceContext
      context.isDemoWorkspace.mockResolvedValue(true)

      const notes =
        'RDV du 3 août avec Claire Vasseur. Ils confirment le budget Helios 2027. ' +
        'Le référencement passe par les achats. Prochain point le 12 août.'
      const recap = await service.structure(USER, { notes })

      expect(recap.summary).toBe('RDV du 3 août avec Claire Vasseur.')
      expect(recap.decisions).toEqual([
        'Ils confirment le budget Helios 2027.',
        'Le référencement passe par les achats.',
      ])
      expect(recap.nextSteps).toEqual([
        { action: 'Prochain point le 12 août.', owner: '', due: '', evidence: { kind: 'notes-derived' } },
      ])
      // La personne nommée dans les notes remonte, et son extrait dit qu'elle
      // vient de notes TAPÉES — la démonstration ne prétend pas citer un
      // transcript qui n'existe pas.
      expect(recap.mentionedContacts).toEqual([
        { fullName: 'Claire Vasseur', role: '', evidence: { kind: 'notes-derived' } },
      ])
    })

    it('ne montre JAMAIS deux fois le même fragment', async () => {
      // C'est la forme exacte du défaut : le résumé et la décision étaient le
      // même bloc de texte, recopié — la fonctionnalité avait l'air de ne rien
      // faire.
      const context = (service as unknown as { workspaceContext: { isDemoWorkspace: jest.Mock } }).workspaceContext
      context.isDemoWorkspace.mockResolvedValue(true)

      const recap = await service.structure(USER, {
        notes: 'Un premier point. Un deuxième point. Un troisième point. Un quatrième point.',
      })

      const shown = [recap.summary, ...recap.decisions, ...recap.nextSteps.map(step => step.action)]
      expect(new Set(shown).size).toBe(shown.length)
    })

    it('dit que les notes sont trop courtes plutôt que de les recopier', async () => {
      const context = (service as unknown as { workspaceContext: { isDemoWorkspace: jest.Mock } }).workspaceContext
      context.isDemoWorkspace.mockResolvedValue(true)

      const recap = await service.structure(USER, { notes: 'ok' })

      expect(recap.summary).toBe('Notes trop courtes pour un compte rendu.')
      expect(recap.decisions).toEqual([])
      expect(recap.nextSteps).toEqual([])
    })

    it('garde une question posée dans les notes comme question ouverte', async () => {
      const context = (service as unknown as { workspaceContext: { isDemoWorkspace: jest.Mock } }).workspaceContext
      context.isDemoWorkspace.mockResolvedValue(true)

      const recap = await service.structure(USER, {
        notes: 'Le budget est voté. Qui pilote le sujet côté achats ? Relance prévue lundi.',
      })

      expect(recap.openQuestions).toEqual(['Qui pilote le sujet côté achats ?'])
      expect(recap.decisions).not.toContain('Qui pilote le sujet côté achats ?')
    })

    it('remplit les NEUF cartes de la cascade — un écran vide se découvre en réunion', async () => {
      const context = (service as unknown as { workspaceContext: { isDemoWorkspace: jest.Mock } }).workspaceContext
      context.isDemoWorkspace.mockResolvedValue(true)

      const notes = [
        'Rendez-vous avec Camille Rey, DSI.',
        'Ils confirment le budget de la refonte.',
        'Le référencement passe par les achats.',
        'Deux CV attendus avant vendredi.',
        'Ils cherchent deux profils Java pour septembre.',
        'Le besoin porte sur cinq ans d’expérience.',
        'Le sujet est piloté depuis la direction technique.',
        'Le TJM leur paraît élevé.',
        'Merci pour cet échange, je reviens vers toi.',
        'Prochain point à la rentrée.',
      ].join('\n')

      const { cascade } = await service.cascade(USER, { notes })

      expect(cascade.cards).toHaveLength(9)
      expect(cascade.cards.map(card => card.band)).toEqual(['a1', 'a2', 'a2', 'a2', 'a2', 'a3', 'a2', 'a3', 'a0'])
      // Aucune carte n'est écartée : la salle montre la cascade entière.
      expect(cascade.summary.droppedWithoutEvidence).toBe(0)
      // Aucun modèle n'est appelé en démonstration : ce zéro-là est VRAI.
      expect(cascade.summary.estimatedCredits).toBe(0)
      expect(cascade.summary.sources).toEqual([{ kind: 'notes', detail: '' }])
    })

    it('des notes courtes rendent moins de cartes, jamais des cartes vides', async () => {
      const context = (service as unknown as { workspaceContext: { isDemoWorkspace: jest.Mock } }).workspaceContext
      context.isDemoWorkspace.mockResolvedValue(true)

      const { cascade } = await service.cascade(USER, { notes: 'Ligne un\nLigne deux\nLigne trois' })
      expect(cascade.cards.map(card => card.kind)).toEqual(['recap', 'next_steps', 'reminder'])
      expect(cascade.summary.droppedWithoutEvidence).toBe(0)
    })

    it('refuse le dépôt d’un enregistrement', async () => {
      const context = (service as unknown as { workspaceContext: { isDemoWorkspace: jest.Mock } }).workspaceContext
      context.isDemoWorkspace.mockResolvedValue(true)
      await expect(
        service.transcribe(USER, { audioB64: 'AAAA', filename: 'a.m4a', recordingConsent: true }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('pose des actions dans le CRM', () => {
    it('crée ce que l’utilisateur a retenu', async () => {
      const result = await service.createTasks(USER, [{ subject: 'Envoyer les CV', dueAt: '2026-08-07T09:00:00.000Z' }])
      expect(result).toEqual({ created: 1, failed: [] })
    })

    it('un échec est nommé et n’empêche pas les autres', async () => {
      crm.createTask.mockRejectedValueOnce(new Error('quota CRM')).mockResolvedValueOnce({ id: 't2' })
      const result = await service.createTasks(USER, [
        { subject: 'A', dueAt: '2026-08-07T09:00:00.000Z' },
        { subject: 'B', dueAt: '2026-08-07T09:00:00.000Z' },
      ])
      expect(result.created).toBe(1)
      expect(result.failed).toEqual([{ subject: 'A', reason: 'quota CRM' }])
    })
  })
})
