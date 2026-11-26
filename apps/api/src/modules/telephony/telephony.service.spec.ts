import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { TelephonyCallLogEntity } from '../../database/entities/telephony-call-log.entity'
import { TelephonyCallStateEntity } from '../../database/entities/telephony-call-state.entity'
import { TelephonyConnectionEntity } from '../../database/entities/telephony-connection.entity'
import { CrmService } from '../crm/crm.service'
import { IaClient } from '../ia/ia.client'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { TelephonyService } from './telephony.service'
import * as client from './telephony.client'

const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const USER = '11111111-1111-1111-1111-111111111111'

// Le chiffrement des identifiants réutilise la clé du CRM ; sans elle, le
// module refuse d'écrire un secret — c'est voulu, et le test la pose.
process.env['CRM_TOKEN_ENC_KEY'] ??= 'test-encryption-key-with-enough-entropy-123456'

const CALL = {
  id: 'call-1',
  provider: 'aircall' as const,
  direction: 'outbound' as const,
  counterpartNumber: '+33123456789',
  counterpartName: 'Marc Dupuis',
  counterpartEmail: 'marc@acme.test',
  agentName: 'Théo',
  startedAt: '2026-08-01T09:00:00.000Z',
  durationSeconds: 120,
  answered: true,
  transcript: null,
}

describe('TelephonyService', () => {
  let service: TelephonyService
  let connections: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; delete: jest.Mock; update: jest.Mock }
  let logs: { insert: jest.Mock; update: jest.Mock }
  let callStates: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; delete: jest.Mock }
  let crm: { findContactRecord: jest.Mock; logActivity: jest.Mock }
  let ia: { structureMeetingNotes: jest.Mock }
  let workspaceContext: { resolveActiveWorkspace: jest.Mock; isDemoWorkspace: jest.Mock }

  beforeEach(async () => {
    jest.restoreAllMocks()
    connections = {
      findOne: jest.fn().mockResolvedValue({
        workspace_id: WORKSPACE,
        provider: 'aircall',
        credentials_enc: encryptToken('api-id\napi-key'),
        transcripts_enabled: false,
        created_at: new Date('2026-08-01T00:00:00.000Z'),
      }),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(v => v),
      delete: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    }
    logs = { insert: jest.fn().mockResolvedValue(undefined), update: jest.fn().mockResolvedValue(undefined) }
    callStates = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(v => v),
      delete: jest.fn().mockResolvedValue(undefined),
    }
    crm = {
      findContactRecord: jest
        .fn()
        .mockResolvedValue({ recordId: 'crm-1', provider: 'hubspot', email: CALL.counterpartEmail }),
      logActivity: jest.fn().mockResolvedValue({ id: 'note-1' }),
    }

    ia = {
      structureMeetingNotes: jest.fn().mockResolvedValue({
        data: {
          summary: 'Le client veut un devis avant fin septembre.',
          decisions: ['Envoyer le devis'],
          next_steps: [{ action: 'Envoyer le devis', owner: 'Théo', due: 'vendredi' }],
          open_questions: ['Budget ?'],
          signals: ['Objection : le prix'],
        },
      }),
    }
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelephonyService,
        { provide: getRepositoryToken(TelephonyConnectionEntity), useValue: connections },
        { provide: getRepositoryToken(TelephonyCallLogEntity), useValue: logs },
        { provide: getRepositoryToken(TelephonyCallStateEntity), useValue: callStates },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: CrmService, useValue: crm },
        { provide: IaClient, useValue: ia },
      ],
    }).compile()

    service = moduleRef.get(TelephonyService)
  })

  describe('transcriptions', () => {
    it('ne lit AUCUNE transcription tant que la case n’est pas cochée', async () => {
      const fetchTranscript = jest.spyOn(client, 'fetchTranscript')
      jest.spyOn(client, 'listCalls').mockResolvedValue([CALL])

      const calls = await service.listRecentCalls(USER)

      expect(fetchTranscript).not.toHaveBeenCalled()
      expect(calls[0]?.transcript).toBeNull()
    })

    it('les lit quand l’espace l’a autorisé', async () => {
      connections.findOne.mockResolvedValue({
        workspace_id: WORKSPACE,
        provider: 'aircall',
        credentials_enc: encryptToken('api-id\napi-key'),
        transcripts_enabled: true,
        created_at: new Date(),
      })
      jest.spyOn(client, 'listCalls').mockResolvedValue([CALL])
      jest.spyOn(client, 'fetchTranscript').mockResolvedValue('Bonjour')

      const calls = await service.listRecentCalls(USER)

      expect(calls[0]?.transcript).toBe('Bonjour')
    })
  })

  describe('versement au CRM', () => {
    it('réserve la trace AVANT d’écrire la note', async () => {
      // L'ordre est la garantie : si l'écriture échoue après, on aura sauté un
      // appel — ce qui se répare — plutôt que d'en avoir déposé deux.
      const order: string[] = []
      logs.insert.mockImplementation(async () => void order.push('insert'))
      crm.logActivity.mockImplementation(async () => {
        order.push('note')
        return { id: 'note-1' }
      })
      jest.spyOn(client, 'listCalls').mockResolvedValue([CALL])

      await service.logCallsToCrm(USER)

      expect(order).toEqual(['insert', 'note'])
    })

    // #2855 — la PROVENANCE : cette note vient d'un APPEL précis, jamais d'un
    // clic direct. `call.id` en `ref` — le seul identifiant que ce versement
    // connaît, jamais un nom de fournisseur.
    it('porte la provenance de l’appel jusqu’à la porte d’écriture', async () => {
      jest.spyOn(client, 'listCalls').mockResolvedValue([CALL])

      await service.logCallsToCrm(USER)

      expect(crm.logActivity).toHaveBeenCalledWith(
        USER,
        'crm-1',
        expect.any(String),
        expect.objectContaining({ origin: 'system', source: { kind: 'call', ref: 'call-1' } }),
      )
    })

    it('ne journalise pas deux fois le même appel', async () => {
      logs.insert.mockRejectedValue(new Error('duplicate key'))
      jest.spyOn(client, 'listCalls').mockResolvedValue([CALL])

      const outcome = await service.logCallsToCrm(USER)

      expect(crm.logActivity).not.toHaveBeenCalled()
      expect(outcome).toMatchObject({ logged: 0 })
      expect(outcome.skipped[0]?.reason).toBe('Déjà journalisé')
    })

    it('saute un appel qu’on ne sait rapprocher de personne', async () => {
      // Une note orpheline dans un CRM est du bruit que personne ne nettoie.
      jest.spyOn(client, 'listCalls').mockResolvedValue([{ ...CALL, counterpartEmail: null }])

      const outcome = await service.logCallsToCrm(USER)

      expect(logs.insert).not.toHaveBeenCalled()
      expect(outcome.skipped[0]?.reason).toContain('Aucun e-mail')
    })

    it('saute un appel dont la fiche est inconnue du CRM', async () => {
      crm.findContactRecord.mockResolvedValue(null)
      jest.spyOn(client, 'listCalls').mockResolvedValue([CALL])

      const outcome = await service.logCallsToCrm(USER)

      expect(outcome.skipped[0]?.reason).toContain('Aucune fiche')
    })

    it('un échec d’écriture est nommé et n’arrête pas les autres', async () => {
      crm.logActivity.mockRejectedValueOnce(new Error('quota CRM')).mockResolvedValueOnce({ id: 'note-2' })
      jest.spyOn(client, 'listCalls').mockResolvedValue([CALL, { ...CALL, id: 'call-2' }])

      const outcome = await service.logCallsToCrm(USER)

      expect(outcome.logged).toBe(1)
      expect(outcome.skipped[0]).toMatchObject({ callId: 'call-1', reason: 'quota CRM' })
    })
  })

  describe('connexion', () => {
    it('n’expose jamais le secret dans le statut', async () => {
      const status = await service.status(USER)
      expect(JSON.stringify(status)).not.toContain('api-key')
      expect(status).toMatchObject({ connected: true, provider: 'aircall', transcriptsEnabled: false })
    })

    it('sans connexion, la liste d’appels est vide — et le statut le dit', async () => {
      connections.findOne.mockResolvedValue(null)
      expect(await service.listRecentCalls(USER)).toEqual([])
      expect(await service.status(USER)).toMatchObject({ connected: false, provider: null })
    })
  })

  describe('Allo (SRC8, 28/09/2026)', () => {
    it('connect() stocke le numéro ET la clé, chiffrés ensemble — comme apiId/apiKey pour Aircall', async () => {
      await service.connect(USER, {
        provider: 'allo',
        apiKey: 'ak_live_test',
        alloNumber: '+33987654321',
        transcriptsEnabled: false,
        recordingConsentAnnounced: false,
      })
      const [saved] = connections.save.mock.calls.at(-1) as [{ credentials_enc: string }]
      expect(decryptToken(saved.credentials_enc)).toBe('+33987654321\nak_live_test')
    })

    it('resolveAccess (via listRecentCalls) lit le numéro et la clé stockés', async () => {
      connections.findOne.mockResolvedValue({
        workspace_id: WORKSPACE,
        provider: 'allo',
        credentials_enc: encryptToken('+33987654321\nak_live_test'),
        transcripts_enabled: false,
        created_at: new Date(),
      })
      const listCalls = jest.spyOn(client, 'listCalls').mockResolvedValue([])

      await service.listRecentCalls(USER)

      expect(listCalls).toHaveBeenCalledWith(
        { provider: 'allo', alloNumber: '+33987654321', apiKey: 'ak_live_test' },
        expect.any(Date),
        undefined,
      )
    })

    it('un secret Allo illisible (numéro ou clé manquants) rend une liste vide, jamais une erreur', async () => {
      connections.findOne.mockResolvedValue({
        workspace_id: WORKSPACE,
        provider: 'allo',
        credentials_enc: encryptToken('juste-une-cle-sans-numero'),
        transcripts_enabled: false,
        created_at: new Date(),
      })
      expect(await service.listRecentCalls(USER)).toEqual([])
    })
  })

  describe('#2403.12 — le secret du webhook « appel en cours »', () => {
    it('rotateWebhookSecret rend un secret en clair et le stocke chiffré', async () => {
      const result = await service.rotateWebhookSecret(USER, 'https://api.bellum.example')

      expect(result.webhookUrl).toBe(`https://api.bellum.example/webhooks/telephony/${WORKSPACE}`)
      expect(result.secret).toHaveLength(64)
      const [, update] = connections.update.mock.calls.at(-1) as [unknown, { webhook_secret_enc: string }]
      expect(update.webhook_secret_enc).not.toContain(result.secret)
      expect(decryptToken(update.webhook_secret_enc)).toBe(result.secret)
    })

    it('sans connexion, la rotation est refusée', async () => {
      connections.findOne.mockResolvedValue(null)
      await expect(service.rotateWebhookSecret(USER, 'https://api.bellum.example')).rejects.toThrow(
        'Aucun outil d’appel connecté.',
      )
    })

    it('webhookSecretFor rend `null` quand aucun secret n’a jamais été généré', async () => {
      expect(await service.webhookSecretFor(WORKSPACE)).toBeNull()
    })

    it('webhookSecretFor déchiffre le secret posé par la rotation', async () => {
      const { secret } = await service.rotateWebhookSecret(USER, 'https://api.bellum.example')
      const [, update] = connections.update.mock.calls.at(-1) as [unknown, { webhook_secret_enc: string }]
      connections.findOne.mockResolvedValue({ workspace_id: WORKSPACE, webhook_secret_enc: update.webhook_secret_enc })

      expect(await service.webhookSecretFor(WORKSPACE)).toBe(secret)
    })
  })

  describe('#2403.12 — l’état « appel en cours »', () => {
    it('applyCallEvent(call.started) pose un état in_progress avec expiration future', async () => {
      const now = new Date('2026-09-28T10:00:00.000Z')
      jest.useFakeTimers().setSystemTime(now)

      await service.applyCallEvent(WORKSPACE, { event: 'call.started', userId: USER, callId: 'c1' })

      expect(callStates.save).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: WORKSPACE, user_id: USER, state: 'in_progress', call_id: 'c1' }),
      )
      const saved = callStates.save.mock.calls[0][0] as { expires_at: Date }
      expect(saved.expires_at.getTime()).toBeGreaterThan(now.getTime())
      jest.useRealTimers()
    })

    it('applyCallEvent(call.ended) rafraîchit la MÊME ligne plutôt que d’en créer une seconde', async () => {
      callStates.findOne.mockResolvedValue({ id: 'row-1', workspace_id: WORKSPACE, user_id: USER })

      await service.applyCallEvent(WORKSPACE, { event: 'call.ended', userId: USER, callId: 'c1' })

      expect(callStates.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'row-1', state: 'terminated' }))
    })

    it('isCallInProgress rend `true` sur un état in_progress non périmé', async () => {
      const now = new Date('2026-09-28T10:00:00.000Z')
      callStates.findOne.mockResolvedValue({
        state: 'in_progress',
        expires_at: new Date(now.getTime() + 60_000),
      })

      expect(await service.isCallInProgress(WORKSPACE, USER, now)).toBe(true)
    })

    it('isCallInProgress rend `false` sur un état in_progress PÉRIMÉ (call.ended jamais reçu)', async () => {
      const now = new Date('2026-09-28T10:00:00.000Z')
      callStates.findOne.mockResolvedValue({
        state: 'in_progress',
        expires_at: new Date(now.getTime() - 1),
      })

      expect(await service.isCallInProgress(WORKSPACE, USER, now)).toBe(false)
    })

    it('isCallInProgress rend `false` sur un état terminated', async () => {
      const now = new Date('2026-09-28T10:00:00.000Z')
      callStates.findOne.mockResolvedValue({ state: 'terminated', expires_at: new Date(now.getTime() + 60_000) })

      expect(await service.isCallInProgress(WORKSPACE, USER, now)).toBe(false)
    })

    it('isCallInProgress rend `false` sans aucun état connu', async () => {
      callStates.findOne.mockResolvedValue(null)
      expect(await service.isCallInProgress(WORKSPACE, USER)).toBe(false)
    })

    it('disconnect efface l’état d’appel — pas d’état orphelin que plus rien ne peut terminer', async () => {
      await service.disconnect(USER)
      expect(callStates.delete).toHaveBeenCalledWith({ workspace_id: WORKSPACE })
    })
  })

  // #4016 L12 (Louis 11/10) — analyse des appels enregistrés, AVEC consentement annoncé.
  describe('#4016 L12 — analyse d’un appel : le consentement annoncé est un préalable', () => {
    const connectionWith = (flags: { transcripts: boolean; consent: boolean }) => ({
      workspace_id: WORKSPACE,
      provider: 'aircall',
      credentials_enc: encryptToken('api-id\napi-key'),
      transcripts_enabled: flags.transcripts,
      recording_consent_announced: flags.consent,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
    })

    it('connect() garde la déclaration ET sa date ; sans elle, rien n’est daté', async () => {
      await service.connect(USER, {
        provider: 'ringover',
        apiKey: 'k',
        transcriptsEnabled: true,
        recordingConsentAnnounced: true,
      })
      const announced = connections.create.mock.calls.at(-1)?.[0]
      expect(announced.recording_consent_announced).toBe(true)
      expect(announced.recording_consent_announced_at).toBeInstanceOf(Date)

      await service.connect(USER, {
        provider: 'ringover',
        apiKey: 'k',
        transcriptsEnabled: true,
        recordingConsentAnnounced: false,
      })
      const silent = connections.create.mock.calls.at(-1)?.[0]
      expect(silent.recording_consent_announced).toBe(false)
      expect(silent.recording_consent_announced_at).toBeNull()
    })

    it('le statut dit si l’enregistrement est annoncé', async () => {
      connections.findOne.mockResolvedValue(connectionWith({ transcripts: true, consent: true }))
      expect((await service.status(USER)).recordingConsentAnnounced).toBe(true)
      connections.findOne.mockResolvedValue(connectionWith({ transcripts: true, consent: false }))
      expect((await service.status(USER)).recordingConsentAnnounced).toBe(false)
    })

    it('SANS consentement annoncé : refus, aucune transcription lue, aucun appel au modèle', async () => {
      connections.findOne.mockResolvedValue(connectionWith({ transcripts: true, consent: false }))
      const fetchTranscript = jest.spyOn(client, 'fetchTranscript')
      await expect(service.analyzeCall(USER, 'call-1')).rejects.toThrow(/annoncé/)
      expect(fetchTranscript).not.toHaveBeenCalled()
      expect(ia.structureMeetingNotes).not.toHaveBeenCalled()
    })

    it('transcriptions non lues : refus nommé, aucun appel au modèle', async () => {
      connections.findOne.mockResolvedValue(connectionWith({ transcripts: false, consent: true }))
      await expect(service.analyzeCall(USER, 'call-1')).rejects.toThrow(/transcriptions/)
      expect(ia.structureMeetingNotes).not.toHaveBeenCalled()
    })

    it('AVEC les deux : le texte de la transcription part au modèle, l’analyse revient mappée', async () => {
      connections.findOne.mockResolvedValue(connectionWith({ transcripts: true, consent: true }))
      jest.spyOn(client, 'fetchTranscript').mockResolvedValue('Agent : Bonjour. Client : Le prix est élevé.')

      const analysis = await service.analyzeCall(USER, 'call-1')

      expect(ia.structureMeetingNotes).toHaveBeenCalledTimes(1)
      expect(ia.structureMeetingNotes.mock.calls[0]?.[0]).toMatchObject({
        notes: 'Agent : Bonjour. Client : Le prix est élevé.',
        fromTranscript: true,
        inputKind: 'transcript',
      })
      expect(analysis).toEqual({
        callId: 'call-1',
        summary: 'Le client veut un devis avant fin septembre.',
        decisions: ['Envoyer le devis'],
        nextSteps: [{ action: 'Envoyer le devis', owner: 'Théo', due: 'vendredi' }],
        openQuestions: ['Budget ?'],
        signals: ['Objection : le prix'],
      })
    })

    it('un appel sans transcription n’est pas analysé : on n’invente pas une conversation', async () => {
      connections.findOne.mockResolvedValue(connectionWith({ transcripts: true, consent: true }))
      jest.spyOn(client, 'fetchTranscript').mockResolvedValue(null)
      await expect(service.analyzeCall(USER, 'call-1')).rejects.toThrow(/transcription/)
      expect(ia.structureMeetingNotes).not.toHaveBeenCalled()
    })

    it('sans outil d’appel connecté : refus, pas de résultat vide', async () => {
      connections.findOne.mockResolvedValue(null)
      await expect(service.analyzeCall(USER, 'call-1')).rejects.toThrow()
      expect(ia.structureMeetingNotes).not.toHaveBeenCalled()
    })

    it('en démonstration : refus (aucun outil d’appel n’y est connecté)', async () => {
      workspaceContext.isDemoWorkspace.mockResolvedValue(true)
      await expect(service.analyzeCall(USER, 'call-1')).rejects.toThrow(/démonstration/)
      expect(ia.structureMeetingNotes).not.toHaveBeenCalled()
    })
  })
})
