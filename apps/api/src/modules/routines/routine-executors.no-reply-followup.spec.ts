import { RoutineExecutors } from './routine-executors'
import type { CreditsService } from '../credits/credits.service'
import type { IaClient } from '../ia/ia.client'
import type { MailboxService } from '../mailbox/mailbox.service'
import type { ProviderCostRecorder } from '../analytics/provider-cost-recorder'
import { IA_COST_HEADER } from '../ia/ia.client'

/**
 * #2398.10 (épopée #2843, LAU-FINAL-112) — l'étape « préparer les messages »
 * de l'EXEMPLE routine relances de l'issue. `createDraft` (réutilisé tel
 * quel, jamais réinventé) ne dépose que dans les Brouillons PERSONNELS —
 * aucun envoi n'est possible depuis ce chemin (doctrine : le copilote
 * prépare, le commercial envoie).
 *
 * Aucun cas « salle de démonstration » ici : ce garde vit chez le SEUL
 * appelant (`RoutinesService.runDueFor`), qui ne descend jamais jusqu'à
 * l'exécuteur pour un espace de démonstration — voir `routines.service.ts`.
 */
function executorOver(
  mailbox: Partial<MailboxService>,
  ia?: Partial<IaClient>,
  credits?: Partial<CreditsService>,
  providerCosts?: Partial<ProviderCostRecorder>,
  noGoRefusal: string | null = null,
): RoutineExecutors {
  return new RoutineExecutors(
    undefined as never,
    mailbox as MailboxService,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    // #3405.3 — `CrmRoutinesService.messageRefusalForContact` : la garde NO-GO.
    { messageRefusalForContact: async () => noGoRefusal } as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined,
    undefined,
    undefined,
    ia as IaClient | undefined,
    undefined,
    credits as CreditsService | undefined,
    undefined,
    undefined,
    providerCosts as ProviderCostRecorder | undefined,
  )
}

const NOW = new Date('2026-09-27T09:00:00.000Z')

const THREAD = {
  threadId: 't1',
  subject: 'Suite de notre échange',
  counterpart: 'client@example.com',
  contactId: 'c1',
  daysSinceLastMessage: 9,
}

describe('routine relances — préparation du brouillon (#2398.10)', () => {
  it('sans IaClient injecté (@Optional) : compte comme avant, rien ne casse', async () => {
    const outcome = await executorOver({
      search: async () => ({ threads: [THREAD] }) as never,
    }).run('no_reply_follow_up', 'u1', NOW, '')
    expect(outcome.notified).toBe(true)
    expect(outcome.outcome).toBe('1 fil(s) sans réponse.')
    expect(outcome.notification?.body).not.toContain('préparée')
  })

  it('#4181.3 — le brouillon préparé est consigné pour son contact, afin qu’une réponse ultérieure le retire', async () => {
    const recordFollowUpDraft = jest.fn().mockResolvedValue(undefined)
    await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft: jest.fn().mockResolvedValue({ draftId: 'd1' }),
        recordFollowUpDraft,
      },
      { generateMessage: jest.fn().mockResolvedValue({ success: true, data: { subject: 'R', body: 'Bonjour,' } }) },
    ).run('no_reply_follow_up', 'u1', NOW, '')

    expect(recordFollowUpDraft).toHaveBeenCalledWith('u1', 'c1', 'd1')
  })

  it('#4181.3 — SAIT DIRE NON : un échec de consignation ne fait pas échouer la routine', async () => {
    const outcome = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft: jest.fn().mockResolvedValue({ draftId: 'd1' }),
        recordFollowUpDraft: jest.fn().mockRejectedValue(new Error('base indisponible')),
      },
      { generateMessage: jest.fn().mockResolvedValue({ success: true, data: { subject: 'R', body: 'Bonjour,' } }) },
    ).run('no_reply_follow_up', 'u1', NOW, '')

    expect(outcome.outcome).toContain('préparée pour client@example.com')
  })

  it('mailbox connectée, capacité brouillon présente : prépare un VRAI brouillon, jamais un envoi', async () => {
    const createDraft = jest.fn().mockResolvedValue({ draftId: 'd1' })
    const generateMessage = jest
      .fn()
      .mockResolvedValue({ success: true, data: { subject: 'Relance', body: 'Bonjour,' } })
    const outcome = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft,
      },
      { generateMessage },
    ).run('no_reply_follow_up', 'u1', NOW, '')

    expect(generateMessage).toHaveBeenCalledWith(
      { userId: 'u1', contactId: 'c1', channel: 'email' },
      expect.objectContaining({ responseHeaderName: IA_COST_HEADER }),
    )
    expect(createDraft).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ to: 'client@example.com', subject: 'Relance', body: 'Bonjour,', threadId: 't1' }),
    )
    expect(outcome.outcome).toContain('préparée pour client@example.com')
    expect(outcome.notification?.body).toContain('brouillons')
    // #2205.54 — `createDraft` n'a rendu qu'un `draftId` ici (pas de
    // `messageId`/`threadId`) : la MÊME garde que `mailDraftHasProof`
    // (GA-26, `action-router.service.ts::dispatchMailDraft`) — un
    // identifiant seul n'est pas une preuve VÉRIFIABLE. `prepared` reste
    // inchangé (comportement d'avant ce lot), `proofRef` seul est absent.
    expect(outcome.proofRef).toBeNull()
  })

  // #2205.54 — la PREUVE de ce que la routine a réellement produit, jamais
  // devinée : la même dérivation que `mailDraftHasProof` (GA-26), jamais un
  // second calcul de ce qui compte comme « déposé ».
  it('preuve vérifiable (messageId + threadId) : `proofRef` porte le lien, sinon l’identifiant', async () => {
    const createDraft = jest
      .fn()
      .mockResolvedValue({ draftId: 'd1', messageId: 'm1', threadId: 't1', webUrl: 'https://mail.example/d1' })
    const outcome = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft,
      },
      { generateMessage: jest.fn().mockResolvedValue({ success: true, data: { body: 'Bonjour,' } }) },
    ).run('no_reply_follow_up', 'u1', NOW, '')
    expect(outcome.proofRef).toBe('https://mail.example/d1')
  })

  it('preuve vérifiable sans lien fournisseur : `proofRef` retombe sur l’identifiant du brouillon', async () => {
    const createDraft = jest.fn().mockResolvedValue({ draftId: 'd1', messageId: 'm1', threadId: 't1', webUrl: null })
    const outcome = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft,
      },
      { generateMessage: jest.fn().mockResolvedValue({ success: true, data: { body: 'Bonjour,' } }) },
    ).run('no_reply_follow_up', 'u1', NOW, '')
    expect(outcome.proofRef).toBe('d1')
  })

  it('aucun fil sans réponse : `proofRef` est absent, jamais une valeur inventée', async () => {
    const outcome = await executorOver({
      search: async () => ({ threads: [] }) as never,
    }).run('no_reply_follow_up', 'u1', NOW, '')
    expect(outcome.proofRef).toBeUndefined()
  })

  it('la messagerie n’autorise pas le brouillon : retombe sur la notification d’avant ce lot', async () => {
    const createDraft = jest.fn()
    const outcome = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: false } }) as never,
        createDraft,
      },
      { generateMessage: jest.fn() },
    ).run('no_reply_follow_up', 'u1', NOW, '')
    expect(createDraft).not.toHaveBeenCalled()
    expect(outcome.notification?.body).toContain('Le plus ancien')
  })

  it('une génération qui échoue ne casse jamais la routine', async () => {
    const outcome = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft: jest.fn(),
      },
      { generateMessage: jest.fn().mockRejectedValue(new Error('réseau')) },
    ).run('no_reply_follow_up', 'u1', NOW, '')
    expect(outcome.notified).toBe(true)
    expect(outcome.outcome).toBe('1 fil(s) sans réponse.')
  })

  // #3405.3 — la relance AUTOMATIQUE ne rédige jamais sur un compte en NO-GO.
  it('compte en NO-GO : aucun appel modèle, aucun brouillon, la notification d’avant ce lot', async () => {
    const generateMessage = jest.fn()
    const createDraft = jest.fn()
    const outcome = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft,
      },
      { generateMessage },
      undefined,
      undefined,
      'Ce compte est en NO-GO : pas de relance sans nouveau motif.',
    ).run('no_reply_follow_up', 'u1', NOW, '')
    expect(generateMessage).not.toHaveBeenCalled()
    expect(createDraft).not.toHaveBeenCalled()
    expect(outcome.notification?.body).toContain('Le plus ancien')
  })

  // #2205.42/#2205.61 — un solde épuisé refuse AVANT l'appel modèle payé.
  it('solde d’enrichissement épuisé : refuse AVANT l’appel modèle, retombe sur la notification d’avant ce lot', async () => {
    const generateMessage = jest.fn()
    const createDraft = jest.fn()
    const hasEnrichmentCredit = jest.fn().mockResolvedValue(false)
    const outcome = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft,
      },
      { generateMessage },
      { hasEnrichmentCredit },
    ).run('no_reply_follow_up', 'u1', NOW, '')
    expect(hasEnrichmentCredit).toHaveBeenCalledWith('u1')
    expect(generateMessage).not.toHaveBeenCalled()
    expect(createDraft).not.toHaveBeenCalled()
    expect(outcome.notification?.body).toContain('Le plus ancien')
  })

  it('#2843 (#2205.45) — plafond > 1 : prépare plusieurs relances, une par fil, jusqu’au plafond', async () => {
    const threads = [
      THREAD,
      { threadId: 't2', subject: 'Suite', counterpart: 'autre@example.com', contactId: 'c2', daysSinceLastMessage: 12 },
      {
        threadId: 't3',
        subject: 'Suite',
        counterpart: 'troisieme@example.com',
        contactId: 'c3',
        daysSinceLastMessage: 20,
      },
    ]
    const createDraft = jest.fn().mockResolvedValue({ draftId: 'd1' })
    const generateMessage = jest.fn().mockResolvedValue({ success: true, data: { body: 'Bonjour,' } })
    const outcome = await executorOver(
      {
        search: async () => ({ threads }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft,
      },
      { generateMessage },
    ).run('no_reply_follow_up', 'u1', NOW, '', {}, 2)

    expect(createDraft).toHaveBeenCalledTimes(2)
    expect(outcome.outcome).toBe('3 fil(s) sans réponse — 2 relances préparées.')
    expect(outcome.notification?.body).toBe('2 relances sont prêtes dans tes brouillons.')
  })

  it('#2843 (#2205.45) — plafond au-delà de la borne haute : jamais plus que le maximum réglable', async () => {
    const threads = Array.from({ length: 6 }, (_, i) => ({
      threadId: `t${i}`,
      subject: 'Suite',
      counterpart: `c${i}@example.com`,
      contactId: `c${i}`,
      daysSinceLastMessage: 10,
    }))
    const createDraft = jest.fn().mockResolvedValue({ draftId: 'd1' })
    const outcome = await executorOver(
      {
        search: async () => ({ threads }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft,
      },
      { generateMessage: jest.fn().mockResolvedValue({ success: true, data: { body: 'Bonjour,' } }) },
    ).run('no_reply_follow_up', 'u1', NOW, '', {}, 999)

    expect(createDraft).toHaveBeenCalledTimes(5)
    expect(outcome.outcome).toBe('6 fil(s) sans réponse — 5 relances préparées.')
  })

  it('sans plafond réglé (`undefined`) : comportement BYTE-IDENTIQUE à avant ce champ, UN seul brouillon', async () => {
    const createDraft = jest.fn().mockResolvedValue({ draftId: 'd1' })
    const outcome = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft,
      },
      { generateMessage: jest.fn().mockResolvedValue({ success: true, data: { body: 'Bonjour,' } }) },
    ).run('no_reply_follow_up', 'u1', NOW, '')

    expect(createDraft).toHaveBeenCalledTimes(1)
    expect(outcome.outcome).toBe('1 fil(s) sans réponse — une relance préparée pour client@example.com.')
  })

  it('sans CreditsService injecté (@Optional) : compte comme avant, rien ne casse', async () => {
    const createDraft = jest.fn().mockResolvedValue({ draftId: 'd1' })
    const outcome = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft,
      },
      { generateMessage: jest.fn().mockResolvedValue({ success: true, data: { body: 'Bonjour,' } }) },
    ).run('no_reply_follow_up', 'u1', NOW, '')
    expect(createDraft).toHaveBeenCalledTimes(1)
    expect(outcome.outcome).toContain('préparée')
  })
})

/**
 * #2398.13/#2205.38 — la simulation : ZÉRO écriture, ZÉRO appel modèle,
 * quel que soit le résultat. Le témoin qui compte dans chaque cas où un
 * brouillon PARTIRAIT en exécution réelle : `generateMessage`/`createDraft`
 * ne sont JAMAIS appelés ici.
 */
describe('routine relances — simulation (#2398.13/#2205.38, ZÉRO écriture)', () => {
  it('aucun fil trouvé : le dit, sans écrire', async () => {
    const dryRun = await executorOver({ search: async () => ({ threads: [] }) as never }).dryRunNoReplyFollowUp('u1')
    expect(dryRun).toEqual({ threadsFound: 0, oldest: null, wouldPrepareDraft: false, blockedReason: 'no_thread' })
  })

  it('mailbox connectée, capacité brouillon présente : dirait "oui", sans jamais appeler le modèle ni écrire', async () => {
    const createDraft = jest.fn()
    const generateMessage = jest.fn()
    const dryRun = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
        createDraft,
      },
      { generateMessage },
    ).dryRunNoReplyFollowUp('u1')

    expect(dryRun).toEqual({
      threadsFound: 1,
      oldest: { counterpart: 'client@example.com', daysSinceLastMessage: 9 },
      wouldPrepareDraft: true,
      blockedReason: null,
    })
    expect(generateMessage).not.toHaveBeenCalled()
    expect(createDraft).not.toHaveBeenCalled()
  })

  it('sans contact identifié : dirait "non", et nomme pourquoi', async () => {
    const dryRun = await executorOver(
      { search: async () => ({ threads: [{ ...THREAD, contactId: null }] }) as never },
      { generateMessage: jest.fn() },
    ).dryRunNoReplyFollowUp('u1')
    expect(dryRun).toMatchObject({ threadsFound: 1, wouldPrepareDraft: false, blockedReason: 'no_contact' })
  })

  it('sans IaClient injecté (@Optional) : dirait "non" comme l’exécution réelle', async () => {
    const dryRun = await executorOver({ search: async () => ({ threads: [THREAD] }) as never }).dryRunNoReplyFollowUp(
      'u1',
    )
    expect(dryRun).toMatchObject({ wouldPrepareDraft: false, blockedReason: 'no_contact' })
  })

  it('messagerie sans capacité brouillon : dirait "non", et nomme pourquoi', async () => {
    const dryRun = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: false } }) as never,
      },
      { generateMessage: jest.fn() },
    ).dryRunNoReplyFollowUp('u1')
    expect(dryRun).toMatchObject({ wouldPrepareDraft: false, blockedReason: 'mailbox_not_ready' })
  })

  // #2205.42/#2205.61 — la simulation lit le MÊME solde, sans jamais le débiter.
  it('solde d’enrichissement épuisé : dirait "non", et nomme pourquoi — sans jamais appeler le modèle', async () => {
    const generateMessage = jest.fn()
    const hasEnrichmentCredit = jest.fn().mockResolvedValue(false)
    const dryRun = await executorOver(
      {
        search: async () => ({ threads: [THREAD] }) as never,
        status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
      },
      { generateMessage },
      { hasEnrichmentCredit },
    ).dryRunNoReplyFollowUp('u1')
    expect(dryRun).toMatchObject({ wouldPrepareDraft: false, blockedReason: 'no_credit' })
    expect(generateMessage).not.toHaveBeenCalled()
  })
})

/**
 * #2205.53 (épopée #2843) — le COÛT FOURNISSEUR d'une exécution de routine.
 * Jamais un débit de crédit (`message_generation` est INCLUSE, poids 0 —
 * #2205.42/#2205.61) : une ligne `provider_costs` interne, comme le composeur
 * manuel et `need_play`, rattachée à la fonctionnalité de la routine.
 */
describe('routine relances — coût fournisseur (#2205.53)', () => {
  const DRAFT_MAILBOX = {
    search: async () => ({ threads: [THREAD] }) as never,
    status: async () => ({ connected: true, capabilities: { draft: true } }) as never,
    createDraft: jest.fn().mockResolvedValue({ draftId: 'd1' }),
  }

  it('enregistre le coût lu dans l’en-tête de l’appel modèle, sous la fonctionnalité de la routine', async () => {
    const recordHeader = jest.fn().mockResolvedValue(undefined)
    const generateMessage = jest.fn().mockImplementation(async (_input, opts) => {
      opts.onResponseHeader(IA_COST_HEADER, 'h-cost')
      return { success: true, data: { body: 'Bonjour,' } }
    })
    await executorOver(DRAFT_MAILBOX, { generateMessage }, undefined, { recordHeader }).run(
      'no_reply_follow_up',
      'u1',
      NOW,
      'ws1',
    )
    expect(recordHeader).toHaveBeenCalledWith('h-cost', {
      workspaceId: 'ws1',
      userId: 'u1',
      feature: 'routine_no_reply_follow_up',
    })
  })

  it('sans appel modèle (capacité brouillon absente), aucune ligne de coût', async () => {
    const recordHeader = jest.fn()
    await executorOver(
      { ...DRAFT_MAILBOX, status: async () => ({ connected: false, capabilities: { draft: false } }) as never },
      { generateMessage: jest.fn() },
      undefined,
      { recordHeader },
    ).run('no_reply_follow_up', 'u1', NOW, 'ws1')
    expect(recordHeader).not.toHaveBeenCalled()
  })

  it('sans ProviderCostService injecté (@Optional) : comportement d’avant, rien ne casse', async () => {
    const outcome = await executorOver(DRAFT_MAILBOX, {
      generateMessage: jest.fn().mockResolvedValue({ success: true, data: { body: 'Bonjour,' } }),
    }).run('no_reply_follow_up', 'u1', NOW, 'ws1')
    expect(outcome.notified).toBe(true)
  })
})
