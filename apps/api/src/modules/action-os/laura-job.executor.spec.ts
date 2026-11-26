import { Logger } from '@nestjs/common'
import {
  LAURA_JOB_CAPABILITIES,
  lauraJobBriefSchema,
  type ActionDispatchResult,
  type ActionIntent,
} from '@bellum/contracts'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { LauraJobExecutor } from './laura-job.executor'
import { inMemoryRepository } from './testing/in-memory-repository'

/**
 * #2276 tranche 2 — l'exécution PAR ÉTAPES d'un job confirmé. Chaque étape passe
 * par le routeur d'actions (la seule porte : droits, mandat, débit observé) ;
 * la fiche s'écrit au fil de l'eau ; un timeout n'est pas un échec.
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const USER = '9d359267-0000-4000-8000-000000000001'
const OTHER_USER = '9d359267-0000-4000-8000-000000000002'
const C1 = '22222222-2222-4222-8222-222222222221'
const C2 = '22222222-2222-4222-8222-222222222222'
const C3 = '22222222-2222-4222-8222-222222222223'
const JOB = 'job-1'
const data = { jobId: JOB, workspaceId: WS, userId: USER, email: 'rep@esn.fr' }

type Step = Record<string, unknown>

function seed(steps: Step[], options: { status?: string; contactIds?: string[]; userId?: string } = {}) {
  const runs = inMemoryRepository<WorkflowRunEntity>()
  const job = lauraJobBriefSchema.parse({
    originalRequest: 'Trouve les décideurs et prépare un message',
    intent: 'Préparer une approche',
    expectedOutcome: 'Des brouillons prêts',
    scope: { description: 'Trois contacts', contactIds: options.contactIds ?? [C1, C2, C3] },
    steps,
  })
  runs.rows.push({
    id: JOB,
    workspace_id: WS,
    user_id: options.userId ?? USER,
    definition_key: 'laura_job',
    trigger: 'laura_job',
    status: options.status ?? 'planned',
    correlation_id: 'job_turn',
    estimated_credits: 10,
    spent_credits: 0,
    started_at: null,
    finished_at: null,
    turn_id: '33333333-3333-4333-8333-333333333331',
    conversation_id: 'thread-1',
    job,
  } as unknown as WorkflowRunEntity)
  return runs
}

function harness(
  runs: ReturnType<typeof seed>,
  answer: (intent: ActionIntent) => Promise<ActionDispatchResult> | ActionDispatchResult = intent => ({
    type: intent.type,
    status: 'done',
    ...(intent.type === 'enrich_contact' ? { creditsDebited: 1 } : {}),
    ...(intent.type === 'generate_message'
      ? {
          artifact: {
            kind: 'message_draft' as const,
            channel: 'email' as const,
            subject: 'Bonjour',
            body: 'Texte',
            angle: null,
          },
        }
      : {}),
  }),
) {
  const dispatched: ActionIntent[] = []
  const dispatcher = {
    dispatch: jest.fn(async (intent: ActionIntent) => {
      dispatched.push(intent)
      return answer(intent)
    }),
  }
  const reservations = { reserve: jest.fn(async () => ({})), settle: jest.fn(async () => undefined) }
  const drafts = { keep: jest.fn(async () => 'draft-1') }
  const notifier = { notifyUser: jest.fn(async () => undefined) }
  // #2276.62 — le retour dans Laura, par la cloche existante (le port n'est
  // qu'une signature, le câblage réel vit dans `action-os.module.ts`).
  const jobReturnNotifier = {
    notify: jest.fn(async (_userId: string, _input: { title: string; link: string }) => undefined),
  }
  const accounts = inMemoryRepository<{ id: string; workspace_id: string }>()
  const contacts = inMemoryRepository<{ id: string; workspace_id: string }>()
  contacts.rows.push({ id: C1, workspace_id: WS }, { id: C2, workspace_id: WS }, { id: C3, workspace_id: 'other-ws' })
  const executor = new LauraJobExecutor(
    runs as never,
    accounts as never,
    contacts as never,
    reservations as never,
    dispatcher as never,
    drafts as never,
    notifier as never,
    jobReturnNotifier as never,
    // #3860.1 — les capacités hors routeur, câblées comme en production (`action-os.module.ts`).
    {
      startAnalysis: jest.fn(async () => ({ refused: 'Non lancée dans cette spec.' })),
      analysisState: jest.fn(async () => 'unknown' as const),
      searchMarketMemory: jest.fn(async () => null),
      matchNeed: jest.fn(async () => null),
      latestTerritorySnapshot: jest.fn(async () => null),
    },
  )
  return { executor, dispatched, reservations, drafts, notifier, jobReturnNotifier, row: () => runs.rows[0] }
}

const enrich = { key: 'enrich', label: 'Enrichir', capability: 'contact_enrichment', units: 2 }
const write = {
  key: 'message',
  label: 'Préparer un message',
  capability: 'message_generation',
  units: 3,
  dependsOn: ['enrich'],
}
const crm = { key: 'crm', label: 'Consigner dans le CRM', capability: 'crm_write', units: 3, dependsOn: ['enrich'] }

describe('LauraJobExecutor — #2276.1 exécution par étapes', () => {
  it('exécute les étapes dans l’ordre, par le routeur, sans dépasser le nombre annoncé', async () => {
    const { executor, dispatched, row, notifier } = harness(seed([enrich, write]))
    await executor.run(data)

    // units = 2 : trois contacts au périmètre, deux enrichis — jamais plus que le coût confirmé.
    expect(dispatched.filter(intent => intent.type === 'enrich_contact')).toHaveLength(2)
    expect(dispatched.filter(intent => intent.type === 'generate_message')).toHaveLength(3)
    // Laura n'envoie jamais : aucun envoi n'a été demandé au routeur.
    expect(dispatched.some(intent => intent.type === 'send_email')).toBe(false)
    expect(row().status).toBe('done')
    expect(row().spent_credits).toBe(2)
    expect(row().finished_at).toBeInstanceOf(Date)
    const steps = row().job?.steps ?? []
    expect(steps.map(step => step.status)).toEqual(['done', 'done'])
    // #2276.59 — la preuve de l'étape : dates et débit observé.
    expect(steps[0]).toMatchObject({ creditsSpent: 2 })
    expect(steps[0]?.startedAt).toEqual(expect.any(String))
    expect(steps[0]?.finishedAt).toEqual(expect.any(String))
    // #2276.21 — les brouillons gardés sont des objets créés, pas un texte perdu.
    expect(row().job?.createdObjects).toHaveLength(3)
    expect(row().job?.intermediateResults.length).toBeGreaterThan(0)
    // #2276.61 — la fin s'annonce.
    expect(notifier.notifyUser).toHaveBeenCalledTimes(1)
  })

  it('NON : un job qui n’est pas « planifié » ne part pas (double exécution, annulation)', async () => {
    const { executor, dispatched } = harness(seed([enrich], { status: 'to_confirm' }))
    await executor.run(data)
    expect(dispatched).toHaveLength(0)
  })

  it('NON : le job d’un autre utilisateur ne s’exécute pas sous cette identité', async () => {
    const { executor, dispatched, row } = harness(seed([enrich], { userId: OTHER_USER }))
    await executor.run(data)
    expect(dispatched).toHaveLength(0)
    expect(row().status).toBe('planned')
  })

  // #3860.1 — l'analyse est raccordée : sans compte dans le périmètre, elle est BLOQUÉE de la même façon.
  it('une analyse sans compte dans le périmètre est BLOQUÉE, rien ne part, ses dépendantes sont sautées', async () => {
    const analyse = { key: 'analyse', label: 'Analyser', capability: 'account_analysis', units: 3 }
    const after = { ...enrich, dependsOn: ['analyse'] }
    const { executor, dispatched, row } = harness(seed([analyse, after]))
    await executor.run(data)
    expect(dispatched).toHaveLength(0)
    const steps = row().job?.steps ?? []
    expect(steps[0]).toMatchObject({ status: 'blocked', note: 'no_target_in_scope', creditsSpent: null })
    expect(steps[1]).toMatchObject({ status: 'dropped', note: 'dependency_not_done' })
    expect(row().status).toBe('blocked')
  })

  // #2276.51 — la prévisualisation dit « ne s'exécute pas dans un job » à partir
  // du contrat ; l'exécuteur doit dire EXACTEMENT la même chose, capacité par capacité.
  it.each(Object.entries(LAURA_JOB_CAPABILITIES).filter(([capability]) => capability !== 'read_workspace'))(
    '%s : exécutable dans un job si et seulement si le contrat le dit',
    async (capability, entry) => {
      const step = { key: 'one', label: 'Une étape', capability, units: 1 }
      const { executor, row } = harness(seed([step]))
      await executor.run(data)
      const note = row().job?.steps[0]?.note
      expect(note === 'not_executable_in_job').toBe(!entry.executableInJob)
    },
  )

  it('lire l’espace est une VRAIE lecture, gratuite : les cibles du périmètre encore dans l’espace', async () => {
    const read = { key: 'read', label: 'Relire le périmètre', capability: 'read_workspace' }
    const { executor, dispatched, row } = harness(seed([read]))
    await executor.run(data)
    expect(dispatched).toHaveLength(0)
    // C3 n'est plus dans l'espace : il n'est pas compté.
    expect(row().job?.steps[0]).toMatchObject({ status: 'done', creditsSpent: null })
    expect(row().job?.intermediateResults[0]).toMatchObject({ stepKey: 'read', summary: '0 + 2' })
  })

  it('#2276.60 — un timeout n’est pas un échec : `unknown` ARRÊTE, rien ne continue', async () => {
    const runs = seed([enrich, write])
    const { executor, dispatched, row } = harness(runs, intent =>
      intent.type === 'enrich_contact'
        ? { type: intent.type, status: 'unknown', reason: 'Délai dépassé' }
        : { type: intent.type, status: 'done' },
    )
    await executor.run(data)
    // Le premier contact est parti peut-être : on ne relance ni le second, ni l'étape suivante.
    expect(dispatched).toHaveLength(1)
    expect(row().job?.steps[0]).toMatchObject({ status: 'unknown', note: 'timeout' })
    expect(row().job?.steps[1]?.status).toBe('todo')
    expect(row().status).toBe('unknown')
  })

  it('une exception pendant une étape = `unknown`, jamais `failed` : on ne sait pas ce qui est parti', async () => {
    const { executor, row } = harness(seed([enrich]), () => {
      throw new Error('socket hang up')
    })
    await executor.run(data)
    expect(row().job?.steps[0]?.status).toBe('unknown')
    expect(row().status).toBe('unknown')
  })

  // #2276.29 — « Échoué » : quand TOUTES les étapes échouent (rien d'obtenu), l'exécuteur écrit `failed`, pas `partial`.
  it('#2276.29 — une étape qui échoue sans rien d’obtenu écrit `failed` et fixe la fin', async () => {
    const { executor, row } = harness(seed([enrich]), intent => ({
      type: intent.type,
      status: 'failed',
      reason: 'Modèle indisponible',
    }))
    await executor.run(data)
    expect(row().job?.steps[0]?.status).toBe('failed')
    expect(row().status).toBe('failed')
    expect(row().finished_at).not.toBeNull()
  })

  it('#2276.54 / .58 — une erreur n’efface pas ce qui est déjà obtenu : partiel', async () => {
    const { executor, row } = harness(seed([enrich, write]), intent =>
      intent.type === 'generate_message'
        ? { type: intent.type, status: 'failed', reason: 'Modèle indisponible' }
        : { type: intent.type, status: 'done', creditsDebited: 1 },
    )
    await executor.run(data)
    expect(row().job?.steps.map(step => step.status)).toEqual(['done', 'failed'])
    expect(row().job?.errors.length).toBeGreaterThan(0)
    expect(row().spent_credits).toBe(2)
    expect(row().status).toBe('partial')
  })

  it('doctrine — une écriture CRM attend la validation : le job s’arrête AVANT, rien n’est écrit', async () => {
    const { executor, dispatched, row } = harness(seed([enrich, crm]))
    await executor.run(data)
    expect(dispatched.some(intent => intent.type === 'create_crm_note')).toBe(false)
    expect(row().status).toBe('awaiting_approval')
    expect(row().finished_at).toBeNull()
  })

  it('validée par la personne, l’écriture CRM part par le routeur — le texte validé, rien d’autre', async () => {
    const runs = seed([
      { ...enrich, status: 'done' },
      { ...crm, approvedBy: USER, approvedAt: '2026-09-24T10:00:00.000Z' },
    ])
    const { executor, dispatched, row } = harness(runs)
    await executor.run(data)
    const notes = dispatched.filter(intent => intent.type === 'create_crm_note')
    expect(notes).toHaveLength(3)
    expect(notes[0]).toMatchObject({ note: 'Consigner dans le CRM' })
    expect(row().status).toBe('done')
  })

  it('#2276.57 — une annulation entre deux étapes arrête le job', async () => {
    const runs = seed([enrich, write])
    const { executor, dispatched } = harness(runs, intent => {
      if (intent.type === 'enrich_contact') runs.rows[0].status = 'cancelled'
      return { type: intent.type, status: 'done', creditsDebited: 1 }
    })
    await executor.run(data)
    expect(dispatched.filter(intent => intent.type === 'generate_message')).toHaveLength(0)
    expect(runs.rows[0].status).toBe('cancelled')
  })

  it('I3 — la réservation se solde au fil des étapes, jamais réservée ET débitée', async () => {
    const { executor, reservations } = harness(seed([enrich]))
    await executor.run(data)
    expect(reservations.settle).toHaveBeenCalledWith(WS, 'job_turn', 'consumed')
  })

  // #2852.21-23 — cost_reserved/cost_charged/cost_refunded, au niveau de
  // l'étape qui débite RÉELLEMENT (le seul outil qui débite, `enrich_contact`,
  // ne débite JAMAIS de façon synchrone dans `chat_tools.py` — la dépense
  // observée vient d'ici, l'exécution asynchrone du job).
  describe('#2852.21-23 — crédits réservés/débités/remboursés par étape', () => {
    it('une étape intégralement consommée réserve autant qu’elle dépense, rembourse 0', async () => {
      const { executor, row } = harness(seed([enrich]))
      await executor.run(data)
      const step = row().job?.steps[0]
      expect(step).toMatchObject({ creditsSpent: 2, creditsReserved: 2, creditsRefunded: 0 })
    })

    it('une étape partiellement débitée rembourse la différence, jamais recopiée du débit', async () => {
      let calls = 0
      const { executor, row } = harness(seed([enrich]), intent => {
        calls += 1
        return { type: intent.type, status: 'done', creditsDebited: calls === 1 ? 1 : 0 }
      })
      await executor.run(data)
      const step = row().job?.steps[0]
      // units=2, un seul crédit RÉELLEMENT débité sur les deux cibles.
      expect(step).toMatchObject({ creditsSpent: 1, creditsReserved: 2, creditsRefunded: 1 })
    })

    it('une lecture gratuite (aucune capacité créditée) ne réserve ni ne rembourse rien', async () => {
      const readOnly = { key: 'scope', label: 'Lire le périmètre', capability: 'read_workspace', units: 1 }
      const { executor, row } = harness(seed([readOnly]))
      await executor.run(data)
      const step = row().job?.steps[0]
      expect(step).toMatchObject({ creditsSpent: null, creditsReserved: null, creditsRefunded: null })
    })

    it('#2276.60 — un timeout ne rembourse RIEN tant que l’étape reste `unknown` : non mesuré ≠ 0', async () => {
      const { executor, row } = harness(seed([enrich]), intent =>
        intent.type === 'enrich_contact'
          ? { type: intent.type, status: 'unknown', reason: 'Délai dépassé' }
          : { type: intent.type, status: 'done' },
      )
      await executor.run(data)
      const step = row().job?.steps[0]
      expect(step?.status).toBe('unknown')
      expect(step?.creditsReserved).toBe(2)
      expect(step?.creditsRefunded).toBeNull()
    })
  })

  it('NON : un brouillon généré mais pas gardé ne compte pas comme fait', async () => {
    const runs = seed([{ ...enrich, status: 'done' }, write])
    const { executor, drafts, row } = harness(runs)
    drafts.keep.mockRejectedValue(new Error('contact introuvable'))
    await executor.run(data)
    expect(row().job?.steps[1]).toMatchObject({ status: 'failed', note: 'capability_failed' })
    expect(row().job?.createdObjects).toEqual([])
  })

  it('#2276.53 — une étape déjà faite n’est jamais rejouée', async () => {
    const { executor, dispatched } = harness(seed([{ ...enrich, status: 'done', creditsSpent: 2 }, write]))
    await executor.run(data)
    expect(dispatched.some(intent => intent.type === 'enrich_contact')).toBe(false)
  })

  it('un worker mort en pleine étape : l’étape en cours devient `unknown`, pas `failed`', async () => {
    const runs = seed([{ ...enrich, status: 'running' }], { status: 'running' })
    const { executor, row } = harness(runs)
    await executor.markUnknown(data)
    expect(row().job?.steps[0]?.status).toBe('unknown')
    expect(row().status).toBe('unknown')
  })
})

/**
 * #2276.62 — LE RÉSULTAT DU JOB REVIENT DANS LAURA, PAR LA CLOCHE EXISTANTE.
 *
 * Échec de recette du 25/09 : la notification de fin d'un job Laura menait à
 * `/mailbox`, sans aucun chemin vers le fil qui l'avait demandé. `seed()` pose
 * toujours `conversation_id: 'thread-1'` (le job composite vient TOUJOURS d'un
 * tour de conversation, #2276) : le témoin sans fil d'origine l'efface à la main.
 */
describe('#2276.62 — le résultat du job revient dans la conversation d’origine', () => {
  it('la cloche pointe vers LE fil qui a demandé le job', async () => {
    const { executor, jobReturnNotifier } = harness(seed([enrich]))
    await executor.run(data)

    expect(jobReturnNotifier.notify).toHaveBeenCalledTimes(1)
    const [userId, input] = jobReturnNotifier.notify.mock.calls[0]
    expect(userId).toBe(USER)
    expect(input.link).toBe('/chat?conversationId=thread-1')
  })

  // #2276.61 (recette prod 31/10) — « RIEN dans la cloche » : sans fil d'origine, la cloche restait muette. Le
  // témoin d'avant (« rien n'est inventé ») garde son sens pour le LIEN : sans fil, on pointe `/chat`, jamais un
  // identifiant deviné — mais la fin du job est TOUJOURS dite à celui qui l'a lancé.
  it('TÉMOIN — sans conversation d’origine, la cloche reçoit quand même la fin, avec le lien actuel `/chat`', async () => {
    const runs = seed([enrich])
    runs.rows[0].conversation_id = null
    const { executor, jobReturnNotifier } = harness(runs)
    await executor.run(data)

    expect(jobReturnNotifier.notify).toHaveBeenCalledTimes(1)
    expect(jobReturnNotifier.notify.mock.calls[0]?.[1].link).toBe('/chat')
  })
})

/**
 * #2276.61 (recette prod 31/10) — la cloche de l'app reçoit la fin du job, quel que soit l'état terminal,
 * pour celui qui l'a lancé et pour lui seul.
 */
describe('#2276.61 — la cloche reçoit la fin du job, statut dit tel quel', () => {
  it('terminé : UNE notification, pour l’utilisateur qui a lancé le job et personne d’autre', async () => {
    const { executor, jobReturnNotifier } = harness(seed([enrich]))
    await executor.run(data)

    expect(jobReturnNotifier.notify).toHaveBeenCalledTimes(1)
    expect(jobReturnNotifier.notify.mock.calls.map(call => call[0])).toEqual([USER])
    expect(jobReturnNotifier.notify.mock.calls[0]?.[1].title).toContain('Laura a terminé')
  })

  it('en partie : le titre dit « en partie », il ne maquille pas en « terminé »', async () => {
    const runs = seed([enrich, write])
    const { executor, jobReturnNotifier } = harness(runs)
    // La 2e étape échoue : le job s'arrête « partiel ».
    ;(executor as unknown as { dispatcher: { dispatch: jest.Mock } }).dispatcher.dispatch.mockImplementation(
      async (intent: { type: string }) =>
        intent.type === 'generate_message'
          ? { type: intent.type, status: 'failed', reason: 'Modèle indisponible' }
          : { type: intent.type, status: 'done', creditsSpent: 2 },
    )
    await executor.run(data)
    expect(jobReturnNotifier.notify.mock.calls[0]?.[1].title).toContain('en partie')
  })

  it('un worker mort (`unknown`) s’annonce aussi : la cloche dit « ne sait pas », jamais le silence', async () => {
    const runs = seed([{ ...enrich, status: 'running' }], { status: 'running' })
    const { executor, jobReturnNotifier, notifier } = harness(runs)
    await executor.markUnknown(data)

    expect(jobReturnNotifier.notify).toHaveBeenCalledTimes(1)
    expect(jobReturnNotifier.notify.mock.calls[0]?.[0]).toBe(USER)
    expect(jobReturnNotifier.notify.mock.calls[0]?.[1].title).toContain('ne sait pas')
    expect(notifier.notifyUser).toHaveBeenCalledTimes(1)
  })

  it('une cloche qui échoue ne fait pas échouer le job, et l’échec se LIT dans le journal', async () => {
    const { executor, jobReturnNotifier, row } = harness(seed([enrich]))
    jobReturnNotifier.notify.mockRejectedValue(new Error('base indisponible'))
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    await executor.run(data)

    expect(row().status).toBe('done')
    expect(warn.mock.calls.some(call => String(call[0]).includes('base indisponible'))).toBe(true)
    warn.mockRestore()
  })
})
