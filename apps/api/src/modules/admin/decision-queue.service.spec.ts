import { DecisionQueueService, lastCompleteDays, lastCompleteMonths } from './decision-queue.service'
import type { CreditCapacityReader, FeedbackTrackingReader } from './decision-queue-tokens'
import type { DecisionNature } from './decision-queue'

/**
 * Ce que le SERVICE décide, par-dessus le calcul pur (#1647).
 *
 * `decision-queue.spec.ts` garde les douze natures et leur silence ; celui-ci
 * garde la LECTURE : d'où vient chaque fait, et surtout ce qui arrive quand une
 * source TOMBE. C'est le mensonge le plus facile de cet écran — une panne de
 * Redis ou de GitHub ne doit pas allumer la file, elle doit l'éteindre en le
 * disant.
 */

const MAINTENANT = new Date('2026-09-07T12:00:00.000Z')

function ilYA(jours: number): Date {
  return new Date(MAINTENANT.getTime() - jours * 86_400_000)
}

type QbResult = { rawMany?: unknown[]; rawOne?: unknown }

/** Un query-builder chaînable : chaque méthode se rend elle-même. */
function qb(result: QbResult): unknown {
  const self: Record<string, unknown> = {}
  for (const nom of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy', 'setParameter']) {
    self[nom] = (): unknown => self
  }
  self['getRawMany'] = async (): Promise<unknown[]> => result.rawMany ?? []
  self['getRawOne'] = async (): Promise<unknown> => result.rawOne ?? null
  return self
}

function repo(result: QbResult = {}, find: unknown[] = []): never {
  return {
    createQueryBuilder: (): unknown => qb(result),
    find: async (): Promise<unknown[]> => find,
  } as never
}

/** Un abonnement à 250 crédits dont 240 sont consommés — 96 %. */
const ABONNEMENT = {
  user_id: 'u-owner',
  plan: 'growth',
  accounts_limit: 250,
  accounts_used: 240,
  topup_analyses: 0,
  rollover_credits: 0,
  rollover_expires_at: null,
  trial_end: null,
  period_start: ilYA(6),
}

const SANTE_CLIENT = {
  rows: [
    {
      workspaceId: 'w1',
      name: 'Abricot Labs',
      ownerUserId: 'u-owner',
      plan: 'growth',
      lastActivityAt: ilYA(40).toISOString(),
    },
  ],
}

type Deps = {
  provisioning?: unknown
  clientHealth?: unknown
  queues?: unknown
  subscriptions?: never
  ledger?: never
  costs?: never
  runs?: never
  capacity?: CreditCapacityReader
  feedback?: FeedbackTrackingReader
}

function service(over: Deps = {}): DecisionQueueService {
  return new DecisionQueueService(
    (over.provisioning ?? { listManualClients: async () => [] }) as never,
    (over.clientHealth ?? { list: async () => SANTE_CLIENT }) as never,
    (over.queues ?? { listQueues: async () => [] }) as never,
    over.subscriptions ?? repo({}, [ABONNEMENT]),
    over.ledger ?? repo({ rawMany: [] }),
    over.costs ?? repo({ rawMany: [] }),
    over.runs ?? repo({ rawOne: { total: '0', errors: '0' } }),
    over.capacity ?? ((row): number => (row?.accounts_limit ?? 0) + (row?.topup_analyses ?? 0)),
    over.feedback ?? (async () => null),
  )
}

function statut(natures: { nature: DecisionNature; measured: number; raised: number; unmeasured: string | null }[]) {
  return (nature: DecisionNature) => natures.find(n => n.nature === nature)!
}

describe('DecisionQueueService', () => {
  it('user_suspended_long est livrée SILENCIEUSE, et elle dit pourquoi', async () => {
    const result = await service().list(MAINTENANT)
    const suspension = statut(result.natures)('user_suspended_long')
    expect(suspension.measured).toBe(0)
    expect(suspension.raised).toBe(0)
    // La raison NOMME la cause : la date vit chez le fournisseur d'identité.
    expect(suspension.unmeasured).toContain('suspension')
    expect(result.items.some(item => item.nature === 'user_suspended_long')).toBe(false)
  })

  it('une source qui TOMBE éteint sa nature — elle ne l’allume pas', async () => {
    const result = await service({
      queues: {
        listQueues: async () => {
          throw new Error('Redis injoignable')
        },
      },
      provisioning: {
        listManualClients: async () => {
          throw new Error('base injoignable')
        },
      },
    }).list(MAINTENANT)

    const par = statut(result.natures)
    expect(par('queue_stuck')).toMatchObject({ measured: 0, raised: 0 })
    expect(par('queue_stuck').unmeasured).toEqual(expect.any(String))
    expect(par('invoice_missing')).toMatchObject({ measured: 0, raised: 0 })
    expect(result.items.some(item => item.nature === 'queue_stuck')).toBe(false)
  })

  it('le suivi des retours muet rend `feedback_unanswered` muette, jamais bavarde', async () => {
    const result = await service({ feedback: async () => null }).list(MAINTENANT)
    expect(statut(result.natures)('feedback_unanswered')).toMatchObject({ measured: 0, raised: 0 })
  })

  it('un retour dont le suivi ne dit rien ne compte pas comme « sans réponse »', async () => {
    const result = await service({
      feedback: async () => [{ id: 'f1', category: 'bug', createdAt: ilYA(9), treated: null }],
    }).list(MAINTENANT)
    expect(statut(result.natures)('feedback_unanswered')).toMatchObject({ measured: 0, raised: 0 })
  })

  it('le plafond de crédits vient du JETON, il n’est pas recalculé ici', async () => {
    // Le jeton rend un plafond LARGE : 240 sur 1 000 ne franchit pas 90 %.
    const large = await service({ capacity: () => 1000 }).list(MAINTENANT)
    expect(large.items.some(item => item.nature === 'credits_exhausted')).toBe(false)
    expect(statut(large.natures)('credits_exhausted').measured).toBe(1)

    // Le même abonnement, avec le plafond réel : 240 sur 250, soit 96 %.
    const reel = await service({ capacity: row => row?.accounts_limit ?? 0 }).list(MAINTENANT)
    const ligne = reel.items.find(item => item.nature === 'credits_exhausted')!
    expect(ligne.detail).toContain('240 crédits consommés sur 250')
    expect(ligne.detail).toContain('96 %')
    // L'ancienneté de la bascule n'est enregistrée nulle part : `null`, pas `0`.
    expect(ligne.ageDays).toBeNull()
  })

  it('le dernier geste vient de la santé client — une seule lecture, un seul verdict', async () => {
    const result = await service().list(MAINTENANT)
    const churn = result.items.find(item => item.nature === 'churn_risk')!
    expect(churn.detail).toBe('aucune activité depuis 40 j')
    expect(churn.subject.label).toBe('Abricot Labs')
  })

  it('un journal de crédits VIDE laisse `plan_mismatch` muette, jamais « sous son offre »', async () => {
    const result = await service({ ledger: repo({ rawMany: [] }) }).list(MAINTENANT)
    expect(statut(result.natures)('plan_mismatch')).toMatchObject({ measured: 0, raised: 0 })
  })

  it('un journal alimenté mesure les deux mois complets, zéro compris', async () => {
    const [premier, second] = lastCompleteMonths(MAINTENANT, 2)
    const result = await service({
      ledger: repo({
        rawMany: [
          { ownerId: 'u-owner', month: premier, consumed: '312', total: '400' },
          { ownerId: 'u-owner', month: second, consumed: '288', total: '350' },
        ],
      }),
    }).list(MAINTENANT)
    const ligne = result.items.find(item => item.nature === 'plan_mismatch')!
    expect(ligne.detail).toContain('312 puis 288')
    expect(ligne.detail).toContain('offre à 250')
  })

  it('le coût compare le dernier jour COMPLET, jamais la journée en cours', () => {
    const jours = lastCompleteDays(MAINTENANT, 8)
    expect(jours).toHaveLength(8)
    // `MAINTENANT` est le 07 : le dernier jour évalué est le 06, pas le 07.
    expect(jours[jours.length - 1]).toBe('2026-09-06')
    expect(jours).not.toContain('2026-09-07')
  })

  it('les deux mois de `plan_mismatch` sont les deux mois RÉVOLUS', () => {
    expect(lastCompleteMonths(MAINTENANT, 2)).toEqual(['2026-07', '2026-08'])
  })
})
