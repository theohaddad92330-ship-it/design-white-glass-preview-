import { In } from 'typeorm'
import { createMockRepository } from '../../database/test-utils'
import type { OutreachTransitionEntity } from '../../database/entities/outreach-transition.entity'
import type { OutreachMessageVersionEntity } from '../../database/entities/outreach-message-version.entity'
import type { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import type { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { MessageLearningRuleProposalSnapshotEntity } from '../../database/entities/message-learning-rule-proposal-snapshot.entity'
import type { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { MessageLearningSignalsService } from './message-learning-signals.service'

function service(
  transitions: ReturnType<typeof createMockRepository<OutreachTransitionEntity>>,
  versions: ReturnType<
    typeof createMockRepository<OutreachMessageVersionEntity>
  > = createMockRepository<OutreachMessageVersionEntity>(),
  messages: ReturnType<
    typeof createMockRepository<OutreachMessageEntity>
  > = createMockRepository<OutreachMessageEntity>(),
  contactStops: ReturnType<typeof createMockRepository<ContactStopEntity>> = createMockRepository<ContactStopEntity>(),
  userActions: ReturnType<typeof createMockRepository<UserActionEntity>> = createMockRepository<UserActionEntity>(),
  // #2385.5 (LOT écrivain 28/09, passe 2) — APPENDÉ EN FIN, même convention
  // que les cinq repositories ci-dessus (les tests construisent ce service
  // POSITIONNELLEMENT).
  proposalSnapshots: ReturnType<
    typeof createMockRepository<MessageLearningRuleProposalSnapshotEntity>
  > = createMockRepository<MessageLearningRuleProposalSnapshotEntity>(),
  // #2385.5 (LOT écrivain 28/09, passe 2) — APPENDÉ EN FIN, même convention.
  // Le niveau CAMPAGNE lit `outreach_sequences.campaign_label`.
  sequences: ReturnType<
    typeof createMockRepository<OutreachSequenceEntity>
  > = createMockRepository<OutreachSequenceEntity>(),
) {
  return new MessageLearningSignalsService(
    transitions as never,
    versions as never,
    messages as never,
    contactStops as never,
    userActions as never,
    proposalSnapshots as never,
    sequences as never,
  )
}

describe('MessageLearningSignalsService', () => {
  it('ne compte que les transitions de CE workspace — #2385.10, aucune fuite inter-workspaces', async () => {
    const transitions = createMockRepository<OutreachTransitionEntity>()
    // Deux espaces distincts : ws-1 approuve deux fois, ws-2 en annule une.
    // `find` réel filtrerait déjà par `workspace_id` — ce test vérifie que le
    // service DEMANDE ce filtre, pas qu'il le simule après coup.
    transitions.find.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where['workspace_id'] === 'ws-1') {
        return [
          { to_state: 'approved', subject_id: 'm1' },
          { to_state: 'approved', subject_id: 'm2' },
        ]
      }
      if (where['workspace_id'] === 'ws-2') {
        return [{ to_state: 'cancelled', subject_id: 'm3' }]
      }
      return []
    })

    await expect(service(transitions).expressSignals('ws-1')).resolves.toEqual({
      approved: 2,
      approvedWithoutEdit: 2,
      approvedAfterEdit: 0,
      rejected: 0,
      sample: 2,
    })
    await expect(service(transitions).expressSignals('ws-2')).resolves.toEqual({
      approved: 0,
      approvedWithoutEdit: 0,
      approvedAfterEdit: 0,
      rejected: 1,
      sample: 1,
    })
  })

  it('interroge uniquement les transitions de MESSAGE, appliquées, de ce workspace', async () => {
    const transitions = createMockRepository<OutreachTransitionEntity>()

    await service(transitions).expressSignals('ws-1')

    expect(transitions.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspace_id: 'ws-1', subject_kind: 'message', result: 'applied' },
      }),
    )
  })

  it('rend un échantillon à zéro quand ce workspace n’a encore aucune transition', async () => {
    const transitions = createMockRepository<OutreachTransitionEntity>()

    await expect(service(transitions).expressSignals('ws-nouveau')).resolves.toEqual({
      approved: 0,
      approvedWithoutEdit: 0,
      approvedAfterEdit: 0,
      rejected: 0,
      sample: 0,
    })
    // Sans transition, aucune requête de version n'est nécessaire.
    const versions = createMockRepository<OutreachMessageVersionEntity>()
    await expect(service(transitions, versions).expressSignals('ws-nouveau')).resolves.toBeDefined()
    expect(versions.find).not.toHaveBeenCalled()
  })

  // #2385.2 reste — un message approuvé porte une version `user_edit` :
  // approuvé APRÈS édition, distinct de « validé tel quel ».
  it('classe un message approuvé avec une version `user_edit` comme approuvé APRÈS édition', async () => {
    const transitions = createMockRepository<OutreachTransitionEntity>()
    transitions.find.mockResolvedValue([
      { to_state: 'approved', subject_id: 'm-edited' },
      { to_state: 'approved', subject_id: 'm-as-is' },
    ])
    const versions = createMockRepository<OutreachMessageVersionEntity>()
    versions.find.mockResolvedValue([{ message_id: 'm-edited' }])

    const result = await service(transitions, versions).expressSignals('ws-1')

    expect(result).toEqual({ approved: 2, approvedWithoutEdit: 1, approvedAfterEdit: 1, rejected: 0, sample: 2 })
    expect(versions.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspace_id: 'ws-1', kind: 'user_edit' }),
      }),
    )
  })

  // #2385.3 (première tranche, lot g20 26/09) — même journal, même filtre de
  // portée que le signal express (#2385.10 : aucune fuite inter-workspaces).
  describe('behavioralSignals', () => {
    it('interroge le MÊME journal, filtré de la même façon que le signal express', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()

      await service(transitions).behavioralSignals('ws-1')

      expect(transitions.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspace_id: 'ws-1', subject_kind: 'message', result: 'applied' },
        }),
      )
    })

    it('agrège les transitions comportementales de CE workspace uniquement', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        if (where['workspace_id'] === 'ws-1') {
          return [
            { to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' },
            { to_state: 'replied', subject_id: 'm1', occurred_at: '2026-09-01T02:00:00Z' },
          ]
        }
        return [{ to_state: 'bounced', subject_id: 'm2', occurred_at: '2026-09-01T00:00:00Z' }]
      })

      await expect(service(transitions).behavioralSignals('ws-1')).resolves.toEqual({
        sent: 1,
        delivered: 0,
        replied: 1,
        bounced: 0,
        failed: 0,
        expired: 0,
        medianReplyDelayHours: 2,
        optOut: 0,
        meetingBooked: 0,
        sample: 2,
      })
    })

    // #2385.3 (LOT écrivain 28/09) — optOut / meetingBooked : deux faits
    // REJOINTS depuis d'autres tables via le CONTACT du message.
    it('rejoint le contact de chaque message, puis optOut (`contact_stops`) et meetingBooked (`user_actions`)', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue([
        { to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' },
        { to_state: 'sent', subject_id: 'm2', occurred_at: '2026-09-01T00:00:00Z' },
      ])
      const messages = createMockRepository<OutreachMessageEntity>()
      messages.find.mockResolvedValue([
        { id: 'm1', contact_id: 'c1' },
        { id: 'm2', contact_id: 'c2' },
      ])
      const contactStops = createMockRepository<ContactStopEntity>()
      contactStops.find.mockResolvedValue([{ contact_id: 'c1' }])
      const userActions = createMockRepository<UserActionEntity>()
      userActions.find.mockResolvedValue([{ contact_id: 'c2' }])

      const result = await service(transitions, undefined, messages, contactStops, userActions).behavioralSignals(
        'ws-1',
      )

      expect(result.optOut).toBe(1)
      expect(result.meetingBooked).toBe(1)
      expect(messages.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1', id: In(['m1', 'm2']) }) }),
      )
      expect(userActions.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspace_id: 'ws-1', action_type: 'rdv_obtained' }),
        }),
      )
    })

    it('sans message trouvé (contacts hors espace), aucune requête contact_stops/user_actions', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue([{ to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' }])
      const messages = createMockRepository<OutreachMessageEntity>()
      messages.find.mockResolvedValue([])
      const contactStops = createMockRepository<ContactStopEntity>()
      const userActions = createMockRepository<UserActionEntity>()

      const result = await service(transitions, undefined, messages, contactStops, userActions).behavioralSignals(
        'ws-1',
      )

      expect(result.optOut).toBe(0)
      expect(result.meetingBooked).toBe(0)
      expect(contactStops.find).not.toHaveBeenCalled()
      expect(userActions.find).not.toHaveBeenCalled()
    })

    it('sans aucune transition, aucune requête de jointure n’est nécessaire', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      const messages = createMockRepository<OutreachMessageEntity>()

      await service(transitions, undefined, messages).behavioralSignals('ws-nouveau')

      expect(messages.find).not.toHaveBeenCalled()
    })
  })

  // #2385.5 — le candidat de règle workspace compose les deux lectures déjà
  // testées ci-dessus ; ce test vérifie seulement la COMPOSITION, pas le calcul
  // (déjà couvert par message-learning-signals.spec.ts).
  describe('proposedRule', () => {
    it('rend `null` sous le seuil, sans construire de candidat', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue([{ to_state: 'approved', subject_id: 'm1' }])

      await expect(service(transitions).proposedRule('ws-1')).resolves.toBeNull()
    })

    it('propose un candidat gouverné au niveau workspace au-dessus du seuil', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue(
        Array.from({ length: 6 }, (_, i) => ({ to_state: 'approved', subject_id: `m${i}` })),
      )

      const candidate = await service(transitions).proposedRule('ws-1')

      expect(candidate?.scope).toEqual({ level: 'workspace', workspaceId: 'ws-1' })
      expect(candidate?.status).toBe('proposed')
    })
  })

  // #2385.5 (LOT écrivain 28/09, passe 2) — la persistance versionnée que le
  // candidat calculé à la volée n'avait pas : chaque snapshot enregistré
  // porte son propre numéro, jamais réutilisé, et n'écrase jamais le
  // précédent (« on archive, on ne supprime pas »).
  describe('recordProposedRuleSnapshot', () => {
    function abovethreshold() {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue(
        Array.from({ length: 6 }, (_, i) => ({ to_state: 'approved', subject_id: `m${i}` })),
      )
      return transitions
    }

    it('rend `null` sous le seuil, sans écrire de ligne', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue([{ to_state: 'approved', subject_id: 'm1' }])
      const snapshots = createMockRepository<MessageLearningRuleProposalSnapshotEntity>()

      const result = await service(
        transitions,
        undefined,
        undefined,
        undefined,
        undefined,
        snapshots,
      ).recordProposedRuleSnapshot('ws-1')

      expect(result).toBeNull()
      expect(snapshots.save).not.toHaveBeenCalled()
    })

    it('la PREMIÈRE ligne pour un workspace porte la version 1', async () => {
      const transitions = abovethreshold()
      const snapshots = createMockRepository<MessageLearningRuleProposalSnapshotEntity>()
      snapshots.count.mockResolvedValue(0)

      const result = await service(
        transitions,
        undefined,
        undefined,
        undefined,
        undefined,
        snapshots,
      ).recordProposedRuleSnapshot('ws-1')

      expect(snapshots.count).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1' } })
      expect(snapshots.save).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'ws-1', level: 'workspace', version: 1, status: 'proposed' }),
      )
      expect(result?.version).toBe(1)
    })

    it('un DEUXIÈME appel écrit une DEUXIÈME ligne (version 2), n’écrase jamais la première', async () => {
      const transitions = abovethreshold()
      const snapshots = createMockRepository<MessageLearningRuleProposalSnapshotEntity>()
      snapshots.count.mockResolvedValue(1)

      const result = await service(
        transitions,
        undefined,
        undefined,
        undefined,
        undefined,
        snapshots,
      ).recordProposedRuleSnapshot('ws-1')

      expect(snapshots.save).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }))
      expect(snapshots.update).not.toHaveBeenCalled()
      expect(result?.version).toBe(2)
    })
  })

  // #2385.5 (LOT écrivain 28/09, passe 2) — le niveau UTILISATEUR : même
  // donnée (`outreach_transitions.user_id`), même calcul, filtré en plus par
  // utilisateur au lieu d'agrégé sur tout l'espace.
  describe('expressSignalsForUser', () => {
    it('filtre par workspace ET par utilisateur — pas seulement par workspace', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()

      await service(transitions).expressSignalsForUser('ws-1', 'u-1')

      expect(transitions.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspace_id: 'ws-1', user_id: 'u-1', subject_kind: 'message', result: 'applied' },
        }),
      )
    })

    it('ne compte que les transitions de CET utilisateur, pas celles d’un collègue du même espace', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        if (where['user_id'] === 'u-1') return [{ to_state: 'approved', subject_id: 'm1' }]
        return [
          { to_state: 'approved', subject_id: 'm2' },
          { to_state: 'cancelled', subject_id: 'm3' },
        ]
      })

      await expect(service(transitions).expressSignalsForUser('ws-1', 'u-1')).resolves.toEqual({
        approved: 1,
        approvedWithoutEdit: 1,
        approvedAfterEdit: 0,
        rejected: 0,
        sample: 1,
      })
    })
  })

  describe('behavioralSignalsForUser', () => {
    it('filtre par workspace ET par utilisateur', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()

      await service(transitions).behavioralSignalsForUser('ws-1', 'u-1')

      expect(transitions.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspace_id: 'ws-1', user_id: 'u-1', subject_kind: 'message', result: 'applied' },
        }),
      )
    })
  })

  describe('proposedUserRule', () => {
    it('rend `null` sous le seuil', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue([{ to_state: 'approved', subject_id: 'm1' }])

      await expect(service(transitions).proposedUserRule('ws-1', 'u-1')).resolves.toBeNull()
    })

    it('propose un candidat GOUVERNÉ au niveau utilisateur au-dessus du seuil', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue(
        Array.from({ length: 6 }, (_, i) => ({ to_state: 'approved', subject_id: `m${i}` })),
      )

      const candidate = await service(transitions).proposedUserRule('ws-1', 'u-1')

      expect(candidate?.scope).toEqual({ level: 'user', userId: 'u-1' })
      expect(candidate?.status).toBe('proposed')
    })
  })

  // #2385.5 (lot SRC4 28/09) — le niveau MESSAGE, le dernier à se peupler.
  // MÊME lecture que le niveau workspace/utilisateur, restreinte à un SEUL
  // `subject_id`. Voir le docblock de `proposeMessageMessageLearningRule` :
  // ce niveau ne propose quasiment jamais de candidat en usage réel.
  describe('expressSignalsForMessage', () => {
    it('interroge UN SEUL message de CE workspace, jamais tout l’espace', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue([{ to_state: 'approved', subject_id: 'msg-1' }])

      const result = await service(transitions).expressSignalsForMessage('ws-1', 'msg-1')

      expect(transitions.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspace_id: 'ws-1', subject_id: 'msg-1', subject_kind: 'message', result: 'applied' },
        }),
      )
      expect(result).toEqual({ approved: 1, approvedWithoutEdit: 1, approvedAfterEdit: 0, rejected: 0, sample: 1 })
    })

    it('sans transition pour ce message, aucune requête de version n’est nécessaire', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      const versions = createMockRepository<OutreachMessageVersionEntity>()

      await service(transitions, versions).expressSignalsForMessage('ws-1', 'msg-inconnu')

      expect(versions.find).not.toHaveBeenCalled()
    })
  })

  describe('behavioralSignalsForMessage', () => {
    it('rejoint le contact de CE message pour optOut/meetingBooked, jamais tout l’espace', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue([
        { to_state: 'sent', subject_id: 'msg-1', occurred_at: '2026-09-01T00:00:00.000Z' },
      ])
      const messages = createMockRepository<OutreachMessageEntity>()
      messages.findOne.mockResolvedValue({ id: 'msg-1', contact_id: 'c-1' })
      const contactStops = createMockRepository<ContactStopEntity>()
      contactStops.find.mockResolvedValue([{ contact_id: 'c-1' }])
      const userActions = createMockRepository<UserActionEntity>()
      userActions.find.mockResolvedValue([])

      const result = await service(
        transitions,
        undefined,
        messages,
        contactStops,
        userActions,
      ).behavioralSignalsForMessage('ws-1', 'msg-1')

      expect(messages.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspace_id: 'ws-1', id: 'msg-1' } }),
      )
      expect(result.optOut).toBe(1)
      expect(result.meetingBooked).toBe(0)
    })

    it('sans transition pour ce message, aucune requête de fiche n’est nécessaire', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      const messages = createMockRepository<OutreachMessageEntity>()

      await service(transitions, undefined, messages).behavioralSignalsForMessage('ws-1', 'msg-inconnu')

      expect(messages.findOne).not.toHaveBeenCalled()
    })
  })

  describe('proposedMessageRule', () => {
    it('rend `null` sur le signal terminal réel d’un seul message', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue([{ to_state: 'approved', subject_id: 'msg-1' }])

      await expect(service(transitions).proposedMessageRule('ws-1', 'msg-1')).resolves.toBeNull()
    })

    it('propose un candidat GOUVERNÉ au niveau message si le seuil était atteint', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue(
        Array.from({ length: 6 }, () => ({ to_state: 'approved', subject_id: 'msg-1' })),
      )

      const candidate = await service(transitions).proposedMessageRule('ws-1', 'msg-1')

      expect(candidate?.scope).toEqual({ level: 'message', messageId: 'msg-1' })
      expect(candidate?.status).toBe('proposed')
    })
  })

  // #2385.5 (LOT écrivain 28/09, passe 2) — le niveau CAMPAGNE : les séquences
  // qui partagent `campaign_label`, PUIS les messages de ces séquences, PUIS
  // le journal filtré sur ces messages — trois lectures, aucune donnée neuve.
  describe('expressSignalsForCampaign', () => {
    it('sans séquence portant cette étiquette, un échantillon à zéro sans requête de transitions', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      const sequences = createMockRepository<OutreachSequenceEntity>()
      sequences.find.mockResolvedValue([])

      const result = await service(
        transitions,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        sequences,
      ).expressSignalsForCampaign('ws-1', 'rentree-2026')

      expect(result.sample).toBe(0)
      expect(transitions.find).not.toHaveBeenCalled()
    })

    it('résout séquences → messages → transitions, et ne compte que CES messages', async () => {
      const sequences = createMockRepository<OutreachSequenceEntity>()
      sequences.find.mockResolvedValue([{ id: 'seq-1' }, { id: 'seq-2' }])
      const messages = createMockRepository<OutreachMessageEntity>()
      messages.find.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }])
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue([
        { to_state: 'approved', subject_id: 'm1' },
        { to_state: 'approved', subject_id: 'm2' },
      ])

      const result = await service(
        transitions,
        undefined,
        messages,
        undefined,
        undefined,
        undefined,
        sequences,
      ).expressSignalsForCampaign('ws-1', 'rentree-2026')

      expect(sequences.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspace_id: 'ws-1', campaign_label: 'rentree-2026' }),
        }),
      )
      expect(result).toEqual({ approved: 2, approvedWithoutEdit: 2, approvedAfterEdit: 0, rejected: 0, sample: 2 })
    })
  })

  describe('proposedCampaignRule', () => {
    it('propose un candidat GOUVERNÉ au niveau campagne au-dessus du seuil', async () => {
      const sequences = createMockRepository<OutreachSequenceEntity>()
      sequences.find.mockResolvedValue([{ id: 'seq-1' }])
      const messages = createMockRepository<OutreachMessageEntity>()
      messages.find.mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ id: `m${i}` })))
      const transitions = createMockRepository<OutreachTransitionEntity>()
      transitions.find.mockResolvedValue(
        Array.from({ length: 6 }, (_, i) => ({ to_state: 'approved', subject_id: `m${i}` })),
      )

      const candidate = await service(
        transitions,
        undefined,
        messages,
        undefined,
        undefined,
        undefined,
        sequences,
      ).proposedCampaignRule('ws-1', 'rentree-2026')

      expect(candidate?.scope).toEqual({ level: 'campaign', campaignId: 'rentree-2026' })
    })
  })

  describe('proposedRuleHistory', () => {
    it('lit les snapshots de CE workspace, version décroissante', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      const snapshots = createMockRepository<MessageLearningRuleProposalSnapshotEntity>()
      snapshots.find.mockResolvedValue([
        { version: 2, status: 'proposed', summary: 'récent', based_on_sample: 8, created_at: new Date('2026-09-27') },
        { version: 1, status: 'proposed', summary: 'ancien', based_on_sample: 6, created_at: new Date('2026-09-26') },
      ])

      const history = await service(
        transitions,
        undefined,
        undefined,
        undefined,
        undefined,
        snapshots,
      ).proposedRuleHistory('ws-1')

      expect(snapshots.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspace_id: 'ws-1' }, order: { version: 'DESC' } }),
      )
      expect(history.map(s => s.version)).toEqual([2, 1])
    })
  })

  // #2385.1 (épopée #2877, migration `1796405091234`) — LE geste explicite qui
  // sort un snapshot de `proposed`, même discipline que
  // `MessageStyleService.decideRuleProposal` (#2369.8).
  describe('decideProposedRuleSnapshot', () => {
    it('adopte un snapshot `proposed` : status + decidedAt posés, jamais une seconde ligne', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      const snapshots = createMockRepository<MessageLearningRuleProposalSnapshotEntity>()
      const row = {
        workspace_id: 'ws-1',
        version: 1,
        status: 'proposed',
        summary: 'résumé',
        based_on_sample: 6,
        created_at: new Date('2026-09-27'),
        decided_at: null,
      }
      snapshots.findOne.mockResolvedValue(row)

      const result = await service(
        transitions,
        undefined,
        undefined,
        undefined,
        undefined,
        snapshots,
      ).decideProposedRuleSnapshot('ws-1', 1, 'adopted')

      expect(snapshots.findOne).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1', version: 1 } })
      expect(snapshots.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'adopted', decided_at: expect.any(Date) }),
      )
      expect(result.status).toBe('adopted')
      expect(result.decidedAt).not.toBeNull()
    })

    it('refuse un snapshot déjà décidé (409, jamais une redécision silencieuse)', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      const snapshots = createMockRepository<MessageLearningRuleProposalSnapshotEntity>()
      snapshots.findOne.mockResolvedValue({
        workspace_id: 'ws-1',
        version: 1,
        status: 'adopted',
        summary: 'résumé',
        based_on_sample: 6,
        created_at: new Date('2026-09-27'),
        decided_at: new Date('2026-09-28'),
      })

      await expect(
        service(transitions, undefined, undefined, undefined, undefined, snapshots).decideProposedRuleSnapshot(
          'ws-1',
          1,
          'rejected',
        ),
      ).rejects.toThrow('Ce snapshot a déjà été décidé.')
      expect(snapshots.save).not.toHaveBeenCalled()
    })

    it('refuse un snapshot inconnu (404, jamais deviné)', async () => {
      const transitions = createMockRepository<OutreachTransitionEntity>()
      const snapshots = createMockRepository<MessageLearningRuleProposalSnapshotEntity>()
      snapshots.findOne.mockResolvedValue(null)

      await expect(
        service(transitions, undefined, undefined, undefined, undefined, snapshots).decideProposedRuleSnapshot(
          'ws-1',
          9,
          'adopted',
        ),
      ).rejects.toThrow('Aucun snapshot de règle apprise en version 9 pour cet espace.')
    })
  })
})

describe('MessageLearningSignalsService.qualityFlagSignals (#2385.4)', () => {
  it('lit les signaux DÉCLARÉS de CET espace seulement', async () => {
    const transitions = createMockRepository<OutreachTransitionEntity>()
    ;(transitions.manager.query as jest.Mock).mockResolvedValueOnce([
      { kind: 'wrong_fact', message_id: 'm1' },
      { kind: 'wrong_cta', message_id: 'm2' },
    ])
    const signals = await service(transitions).qualityFlagSignals('ws-1')
    expect(signals).toEqual({ wrongFact: 1, wrongCta: 1, wrongPersona: 0, flaggedMessages: 2 })
    const [sql, params] = (transitions.manager.query as jest.Mock).mock.calls[0]
    expect(String(sql)).toContain('outreach_message_quality_flags')
    expect(String(sql)).toContain('workspace_id = $1')
    expect(params).toEqual(['ws-1'])
  })
})

// #2877 (#2385.5 GLOBAL, Louis 11/10/2026) — le niveau global ne lit QUE les
// cellules communes (k >= 3 espaces), jamais la table d'un espace.
describe('MessageLearningSignalsService.proposedGlobalRule (#2385.5 GLOBAL)', () => {
  it('lit la base commune réelle, au seuil des trois espaces, et propose un candidat global', async () => {
    const transitions = createMockRepository<OutreachTransitionEntity>()
    ;(transitions.manager.query as jest.Mock).mockResolvedValueOnce([
      { signal: 'approved_without_edit', count: 6 },
      { signal: 'rejected', count: 3 },
    ])
    const candidate = await service(transitions).proposedGlobalRule()
    expect(candidate?.scope).toEqual({ level: 'global' })
    const [sql, params] = (transitions.manager.query as jest.Mock).mock.calls[0]
    expect(String(sql)).toContain('FROM shared_message_learning_aggregates')
    expect(String(sql)).not.toContain('workspace_id')
    expect(params).toEqual(['live', 3])
    expect(transitions.find).not.toHaveBeenCalled()
  })

  it('sait dire NON — base commune vide : aucun candidat', async () => {
    const transitions = createMockRepository<OutreachTransitionEntity>()
    await expect(service(transitions).proposedGlobalRule()).resolves.toBeNull()
  })
})

// #2877.1 — l'écran de l'espace lit AUSSI la règle commune (anonymisée, k >= 3).
describe('MessageLearningSignalsService.summaryForWorkspace — règle globale (#2877.1)', () => {
  it('joint la règle commune à la lecture de l’espace', async () => {
    const transitions = createMockRepository<OutreachTransitionEntity>()
    ;(transitions.manager.query as jest.Mock).mockResolvedValue([
      { signal: 'approved_without_edit', count: 6 },
      { signal: 'rejected', count: 3 },
    ])
    const summary = await service(transitions).summaryForWorkspace('ws-1')
    expect(summary.globalRule).toEqual({ summary: expect.any(String), basedOnSample: 9 })
  })

  it('base commune vide : globalRule null', async () => {
    const transitions = createMockRepository<OutreachTransitionEntity>()
    const summary = await service(transitions).summaryForWorkspace('ws-1')
    expect(summary.globalRule).toBeNull()
  })
})
