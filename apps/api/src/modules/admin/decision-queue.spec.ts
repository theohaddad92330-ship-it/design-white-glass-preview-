import {
  ANALYSIS_FAILING_MIN_RUNS,
  buildDecisionQueue,
  carriesFigure,
  COST_SPIKE_BASELINE_DAYS,
  DECISION_NATURES,
  emptyDecisionQueueInput,
  type DecisionNature,
  type DecisionQueueInput,
  type WorkspaceFacts,
} from './decision-queue'
import { billingHealth } from './manual-billing-schedule'

/**
 * LA FILE DE DÉCISION — et surtout LE SILENCE (#1647).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * T1 — DOUZE NATURES, DOUZE TESTS D'ABSENCE DE DONNÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est le test qui tient tout le lot. Chaque nature est nourrie de tout ce
 * qu'il lui faut SAUF sa donnée, et on vérifie deux choses : elle ne produit
 * AUCUNE ligne, et elle DIT pourquoi. Une nature muette sans raison serait
 * indiscernable d'une nature qui n'a rien trouvé — et c'est exactement la
 * confusion qu'un `?? 0` installe.
 *
 * T3 — AUCUNE LIGNE SANS DÉTAIL CHIFFRÉ, pour les douze.
 * Une ligne qui dit « il y a un problème » sans le nombre est une ligne qu'on
 * n'actionne pas. La porte est {@link carriesFigure}, et elle sait dire NON.
 */

const NOW = new Date('2026-09-07T10:00:00.000Z')
/** `today` au format des dates de facturation, aligné sur {@link NOW}. */
const TODAY = '2026-09-07'

/** Un client sur facture dont la période d'août n'a jamais été facturée. */
function clientAvecFactureManquante() {
  return {
    workspaceId: 'w-facture',
    label: 'Acme ESN',
    health: billingHealth(
      { period: 'monthly' as const, startDate: '2026-06-01', commitmentMonths: null },
      [
        { reference: 'F-06', periodStart: '2026-06-01', periodEnd: '2026-06-30', paid: true },
        { reference: 'F-07', periodStart: '2026-07-01', periodEnd: '2026-07-31', paid: true },
      ],
      TODAY,
    ),
  }
}

/** Un client dont la facture d'août est émise mais jamais encaissée. */
function clientAvecImpaye() {
  return {
    workspaceId: 'w-impaye',
    label: 'Bêta ESN',
    health: billingHealth(
      { period: 'monthly' as const, startDate: '2026-07-01', commitmentMonths: null },
      [
        { reference: 'F-07', periodStart: '2026-07-01', periodEnd: '2026-07-31', paid: false },
        { reference: 'F-08', periodStart: '2026-08-01', periodEnd: '2026-08-31', paid: true },
        { reference: 'F-09', periodStart: '2026-09-01', periodEnd: '2026-09-30', paid: true },
      ],
      TODAY,
    ),
  }
}

/** Un engagement d'un an qui s'achève dans neuf jours. */
function clientAvecEngagementQuiSAcheve() {
  return {
    workspaceId: 'w-engagement',
    label: 'Gamma ESN',
    health: billingHealth(
      { period: 'yearly' as const, startDate: '2025-09-17', commitmentMonths: 12 },
      [{ reference: 'F-25', periodStart: '2025-09-17', periodEnd: '2026-09-16', paid: true }],
      TODAY,
    ),
  }
}

function espace(over: Partial<WorkspaceFacts> = {}): WorkspaceFacts {
  return {
    workspaceId: 'w1',
    label: 'Espace 1',
    plan: 'growth',
    trialEndsAt: null,
    lastActivityAt: null,
    creditsUsed: null,
    creditsCapacity: null,
    cycleStart: null,
    planAllowance: null,
    monthlyUsage: null,
    ...over,
  }
}

/** Une entrée où CHAQUE nature a de quoi lever une ligne. */
function entreeComplete(): DecisionQueueInput {
  return {
    billing: [clientAvecFactureManquante(), clientAvecImpaye(), clientAvecEngagementQuiSAcheve()],
    workspaces: [
      espace({ workspaceId: 'w-essai', label: 'Essai SAS', plan: 'trial', trialEndsAt: '2026-09-09T10:00:00.000Z' }),
      espace({ workspaceId: 'w-churn', label: 'Silence SARL', lastActivityAt: '2026-08-01T10:00:00.000Z' }),
      espace({
        workspaceId: 'w-credits',
        label: 'Gourmand SAS',
        creditsUsed: 238,
        creditsCapacity: 250,
        cycleStart: '2026-09-01T00:00:00.000Z',
      }),
      espace({
        workspaceId: 'w-offre',
        label: 'Trop petit SAS',
        planAllowance: 250,
        monthlyUsage: [
          { month: '2026-07', consumed: 312 },
          { month: '2026-08', consumed: 288 },
        ],
      }),
    ],
    providerCosts: [
      { provider: 'apollo', latestDay: '2026-09-06', latestUsd: 18.4, baselineUsd: [6, 6.1, 6.2, 5.9, 6.1, 6, 6.3] },
    ],
    queues: [{ name: 'analysis', waiting: 4, oldestWaiting: { etat: 'mesure', plusVieuxMs: 3 * 3_600_000 } }],
    analyses: { total: 96, errors: 14 },
    feedback: [{ id: 'f1', category: 'bug', createdAt: '2026-09-01T10:00:00.000Z', treated: false }],
    suspensions: [{ userId: 'u1', label: 'compte #u1', suspendedAt: '2026-06-01T10:00:00.000Z' }],
  }
}

/**
 * Ce qu'il faut RETIRER de l'entrée complète pour éteindre chaque nature — et
 * c'est toujours la DONNÉE, jamais le sujet. Un espace qui existe mais dont on
 * ignore la dernière activité doit rester muet : c'est la différence entre
 * « personne n'utilise ce produit » et « on ne mesure rien ».
 */
const PRIVER: Record<DecisionNature, (input: DecisionQueueInput) => DecisionQueueInput> = {
  invoice_missing: input => ({ ...input, billing: input.billing!.map(c => ({ ...c, health: null })) }),
  invoice_unpaid: input => ({ ...input, billing: input.billing!.map(c => ({ ...c, health: null })) }),
  commitment_ending: input => ({ ...input, billing: null }),
  trial_ending: input => ({ ...input, workspaces: input.workspaces!.map(w => ({ ...w, trialEndsAt: null })) }),
  churn_risk: input => ({ ...input, workspaces: input.workspaces!.map(w => ({ ...w, lastActivityAt: null })) }),
  credits_exhausted: input => ({
    ...input,
    workspaces: input.workspaces!.map(w => ({ ...w, creditsUsed: null, creditsCapacity: null })),
  }),
  cost_spike: input => ({
    ...input,
    // La médiane sur 7 jours n'existe pas : six jours d'historique.
    providerCosts: input.providerCosts!.map(p => ({ ...p, baselineUsd: p.baselineUsd.slice(0, 6) })),
  }),
  queue_stuck: input => ({ ...input, queues: null }),
  analysis_failing: input => ({ ...input, analyses: null }),
  feedback_unanswered: input => ({ ...input, feedback: input.feedback!.map(f => ({ ...f, treated: null })) }),
  user_suspended_long: input => ({ ...input, suspensions: null }),
  plan_mismatch: input => ({ ...input, workspaces: input.workspaces!.map(w => ({ ...w, monthlyUsage: null })) }),
}

describe('#1647 — la file de décision', () => {
  describe('T1 — une nature dont la donnée est ABSENTE ne produit AUCUNE ligne', () => {
    // Le corpus n'est pas vide : sans cette vérification, un `DECISION_NATURES`
    // vide rendrait les douze cas suivants verts sans rien lire.
    it('les douze natures sont bien au rendez-vous', () => {
      expect(DECISION_NATURES).toHaveLength(12)
      expect(Object.keys(PRIVER).sort()).toEqual([...DECISION_NATURES].sort())
    })

    it.each(DECISION_NATURES)('%s : muette, et elle DIT pourquoi', nature => {
      const complet = buildDecisionQueue(entreeComplete(), NOW)
      const avant = complet.natures.find(n => n.nature === nature)!
      // La nature parle AVANT qu'on la prive — sinon le test d'absence
      // passerait sur une nature qui ne sait de toute façon rien dire.
      expect(avant.raised).toBeGreaterThan(0)

      const prive = buildDecisionQueue(PRIVER[nature](entreeComplete()), NOW)
      const apres = prive.natures.find(n => n.nature === nature)!
      expect(apres.raised).toBe(0)
      expect(apres.measured).toBe(0)
      expect(apres.unmeasured).toEqual(expect.any(String))
      expect(prive.items.some(item => item.nature === nature)).toBe(false)
    })

    it('une entrée entièrement vide n’alerte sur rien et le dit douze fois', () => {
      const result = buildDecisionQueue(emptyDecisionQueueInput(), NOW)
      expect(result.items).toEqual([])
      expect(result.natures).toHaveLength(12)
      for (const nature of result.natures) {
        expect(nature.measured).toBe(0)
        expect(nature.unmeasured).toEqual(expect.any(String))
      }
    })

    it('un espace sans dernière activité n’est PAS un espace inactif depuis 21 jours', () => {
      const result = buildDecisionQueue(
        { ...emptyDecisionQueueInput(), workspaces: [espace({ lastActivityAt: null })] },
        NOW,
      )
      expect(result.items).toEqual([])
      expect(result.natures.find(n => n.nature === 'churn_risk')!.unmeasured).toContain('geste')
    })

    it('une enveloppe de crédits à zéro ne vaut pas « 100 % consommé »', () => {
      const result = buildDecisionQueue(
        { ...emptyDecisionQueueInput(), workspaces: [espace({ creditsUsed: 0, creditsCapacity: 0 })] },
        NOW,
      )
      expect(result.items).toEqual([])
      expect(result.natures.find(n => n.nature === 'credits_exhausted')!.measured).toBe(0)
    })

    it('une médiane de coût à zéro n’alerte jamais — 150 % de rien est rien', () => {
      const result = buildDecisionQueue(
        {
          ...emptyDecisionQueueInput(),
          providerCosts: [
            { provider: 'brave', latestDay: '2026-09-06', latestUsd: 0.4, baselineUsd: [0, 0, 0, 0, 0, 0, 0] },
          ],
        },
        NOW,
      )
      expect(result.items).toEqual([])
      expect(result.natures.find(n => n.nature === 'cost_spike')!.measured).toBe(0)
    })

    it('un taux d’échec sur trop peu d’analyses n’est pas un taux', () => {
      const result = buildDecisionQueue(
        { ...emptyDecisionQueueInput(), analyses: { total: ANALYSIS_FAILING_MIN_RUNS - 1, errors: 5 } },
        NOW,
      )
      expect(result.items).toEqual([])
      const statut = result.natures.find(n => n.nature === 'analysis_failing')!
      expect(statut.measured).toBe(0)
      expect(statut.unmeasured).toContain(String(ANALYSIS_FAILING_MIN_RUNS - 1))
    })
  })

  describe('une file ILLISIBLE n’est ni saine ni bloquée', () => {
    it('elle ne lève rien, elle ne compte pas comme mesurée, et elle se DIT', () => {
      // Le défaut que l'union de #1662 a fermé : `oldestWaitingAgeMs: null`
      // confondait « file vide » et « Redis muet ». Les traiter pareil aurait
      // fait annoncer « rien ne demande de décision » pendant une panne — c'est
      // exactement « ce qu'on ne sait pas n'alerte jamais » retourné à l'envers.
      const partiel: DecisionQueueInput = {
        ...emptyDecisionQueueInput(),
        queues: [
          { name: 'analysis', waiting: 0, oldestWaiting: { etat: 'vide' } },
          { name: 'enrichment', waiting: 12, oldestWaiting: { etat: 'inconnu' } },
        ],
      }
      const result = buildDecisionQueue(partiel, NOW)

      expect(result.items.filter(i => i.nature === 'queue_stuck')).toEqual([])
      const nature = result.natures.find(n => n.nature === 'queue_stuck')
      // Une seule file compte : celle qu'on a pu lire. Compter l'autre ferait
      // dire « 2 files mesurées » alors qu'on n'en voit qu'une.
      expect(nature).toMatchObject({ measured: 1, raised: 0 })
      // `unmeasured` se tait puisque quelque chose a été lu — c'est `partial`
      // qui porte la lacune, et c'est exactement pour ça qu'il existe.
      expect(nature?.unmeasured).toBeNull()
      expect(nature?.partial).toMatch(/n’ont pas pu être lues/)
    })

    it('une file illisible ne masque pas une file RÉELLEMENT bloquée', () => {
      const melange: DecisionQueueInput = {
        ...emptyDecisionQueueInput(),
        queues: [
          { name: 'analysis', waiting: 7, oldestWaiting: { etat: 'mesure', plusVieuxMs: 5 * 3_600_000 } },
          { name: 'enrichment', waiting: 3, oldestWaiting: { etat: 'inconnu' } },
        ],
      }
      const result = buildDecisionQueue(melange, NOW)

      const lignes = result.items.filter(i => i.nature === 'queue_stuck')
      expect(lignes).toHaveLength(1)
      expect(lignes[0]?.subject.id).toBe('analysis')
    })
  })

  describe('T2 — file vide', () => {
    it('rien à décider : aucune ligne, et les natures sont MESURÉES', () => {
      const sain: DecisionQueueInput = {
        ...emptyDecisionQueueInput(),
        analyses: { total: 200, errors: 2 },
        queues: [{ name: 'analysis', waiting: 0, oldestWaiting: { etat: 'vide' } }],
        workspaces: [espace({ lastActivityAt: '2026-09-06T10:00:00.000Z', creditsUsed: 10, creditsCapacity: 250 })],
      }
      const result = buildDecisionQueue(sain, NOW)
      expect(result.items).toEqual([])
      // Mesurées et RASSURANTES — pas muettes. C'est la nuance que l'écran rend.
      expect(result.natures.find(n => n.nature === 'analysis_failing')).toMatchObject({
        measured: 1,
        raised: 0,
        unmeasured: null,
      })
      expect(result.natures.find(n => n.nature === 'churn_risk')).toMatchObject({ measured: 1, raised: 0 })
    })
  })

  describe('T3 — aucune ligne sans détail chiffré', () => {
    it('les douze natures produisent un détail qui porte un nombre', () => {
      const result = buildDecisionQueue(entreeComplete(), NOW)
      const vues = new Set(result.items.map(item => item.nature))
      expect([...vues].sort()).toEqual([...DECISION_NATURES].sort())
      for (const item of result.items) {
        expect(carriesFigure(item.detail)).toBe(true)
      }
    })

    it('la porte sait dire NON — un détail sans chiffre n’en est pas un', () => {
      expect(carriesFigure('il y a un problème')).toBe(false)
      expect(carriesFigure('12 j de retard')).toBe(true)
      // Sans le drapeau `g` : `test()` n'est pas STATEFUL, deux appels
      // consécutifs sur la même chaîne rendent la même chose.
      expect(carriesFigure('3 j')).toBe(true)
      expect(carriesFigure('3 j')).toBe(true)
    })
  })

  describe('chaque ligne porte ses cinq champs', () => {
    it('nature, sujet, détail chiffré, ancienneté et UNE action', () => {
      for (const item of buildDecisionQueue(entreeComplete(), NOW).items) {
        expect(DECISION_NATURES).toContain(item.nature)
        expect(item.subject.label.length).toBeGreaterThan(0)
        expect(item.subject.id.length).toBeGreaterThan(0)
        expect(carriesFigure(item.detail)).toBe(true)
        expect(item.ageDays === null || item.ageDays >= 0).toBe(true)
        expect(item.action.label.length).toBeGreaterThan(0)
        expect(item.action.href.startsWith('/')).toBe(true)
      }
    })

    it('les seuils de facturation ne sont PAS redéfinis — ils viennent de billingHealth', () => {
      const result = buildDecisionQueue({ ...emptyDecisionQueueInput(), billing: [clientAvecFactureManquante()] }, NOW)
      const lignes = result.items.filter(item => item.nature === 'invoice_missing')
      // ⚠️ UNE seule ligne, celle d'août. La période de septembre a commencé il
      // y a six jours : la fenêtre de grâce de sept jours du module la protège,
      // et ce test tomberait si la file recopiait le seuil au lieu de le lire.
      expect(lignes).toHaveLength(1)
      expect(lignes[0]!.detail).toContain('01/08/2026')
      expect(lignes[0]!.ageDays).toBe(37)
      expect(lignes[0]!.subject.id).toBe('w-facture')
      // 37 jours ≥ 30 : la sévérité vient elle aussi de `billingHealth`.
      expect(lignes[0]!.severity).toBe('danger')
    })

    it('l’ancienneté d’un fait à venir compte depuis son ENTRÉE dans la fenêtre', () => {
      const result = buildDecisionQueue(
        {
          ...emptyDecisionQueueInput(),
          workspaces: [espace({ plan: 'trial', trialEndsAt: '2026-09-09T10:00:00.000Z' })],
        },
        NOW,
      )
      const ligne = result.items.find(item => item.nature === 'trial_ending')!
      // L'essai finit dans 2 jours ; la fenêtre est de 3 : le fait est vrai
      // depuis 1 jour. Jamais `0` par défaut — c'est une soustraction.
      expect(ligne.ageDays).toBe(1)
      expect(ligne.detail).toContain('2 j')
    })

    it('l’ordre place le plus grave en tête, puis le plus ancien', () => {
      const result = buildDecisionQueue(entreeComplete(), NOW)
      const rang = { danger: 0, warning: 1, info: 2 }
      const rangs = result.items.map(item => rang[item.severity])
      expect(rangs).toEqual([...rangs].sort((a, b) => a - b))
    })
  })

  describe('les bornes du pic de coût', () => {
    it(`${COST_SPIKE_BASELINE_DAYS} jours de médiane, et 150 % pour lever`, () => {
      const base = Array.from({ length: COST_SPIKE_BASELINE_DAYS }, () => 10)
      const sous = buildDecisionQueue(
        {
          ...emptyDecisionQueueInput(),
          providerCosts: [{ provider: 'apollo', latestDay: '2026-09-06', latestUsd: 14, baselineUsd: base }],
        },
        NOW,
      )
      expect(sous.items).toEqual([])
      expect(sous.natures.find(n => n.nature === 'cost_spike')).toMatchObject({ measured: 1, raised: 0 })

      const sur = buildDecisionQueue(
        {
          ...emptyDecisionQueueInput(),
          providerCosts: [{ provider: 'apollo', latestDay: '2026-09-06', latestUsd: 16, baselineUsd: base }],
        },
        NOW,
      )
      expect(sur.items).toHaveLength(1)
      expect(sur.items[0]!.detail).toContain('160 %')
    })
  })
})
