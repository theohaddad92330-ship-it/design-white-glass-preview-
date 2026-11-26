import { computeCrmKpis, CRM_KPI_KEYS, type CrmKpiInput } from './crm-kpis'

const EMPTY: CrmKpiInput = {
  prioritisedInWindow: 0,
  trackedAccounts: 0,
  accountsWithoutNextAction: 0,
  signalToActionDays: [],
  detectedProjects: 0,
  qualifiedProjects: 0,
  stageAges: [],
  openNeeds: 0,
  needsWithoutShortlist: 0,
  unstaffableByReason: {},
  planAges: [],
  totalContacts: 0,
  contactsInDuplicatePairs: 0,
  totalActivities: 0,
  autoCapturedActivities: 0,
}

const by = (key: string) => (kpis: ReturnType<typeof computeCrmKpis>) => kpis.find(kpi => kpi.key === key)!

describe('les neuf KPI CRM du §16', () => {
  it('rendent TOUS les indicateurs, même sans donnée', () => {
    // Un indicateur qui disparaît quand il n'a rien à dire fait croire qu'il
    // n'existe pas — et personne ne se demande pourquoi il manque.
    const kpis = computeCrmKpis(EMPTY)
    expect(kpis.map(kpi => kpi.key).sort()).toEqual([...CRM_KPI_KEYS].sort())
  })

  it('un taux sans dénominateur vaut null, jamais 0 %', () => {
    // C'est la règle qui évite qu'un espace créé hier affiche « 0 % » et qu'on
    // passe la journée à chercher la panne.
    const kpis = computeCrmKpis(EMPTY)
    for (const kpi of kpis.filter(entry => entry.unit === 'rate')) {
      expect(kpi.value).toBeNull()
      expect(kpi.sample).toBe(0)
    }
  })

  it('rend une MÉDIANE, pas une moyenne', () => {
    // Un signal repris six mois plus tard déplacerait une moyenne de plusieurs
    // semaines et ferait conclure que l'équipe est lente.
    const kpis = computeCrmKpis({ ...EMPTY, signalToActionDays: [1, 2, 3, 4, 180] })
    expect(by('signal_to_action_days')(kpis).value).toBe(3)
  })

  it('la non-staffabilité porte sa RÉPARTITION, sinon elle ne vaut rien', () => {
    // « 12 besoins non staffables » ne dit pas s'il manque des Java ou une
    // couverture géographique — c'est pourtant tout l'intérêt du chiffre.
    const kpis = computeCrmKpis({
      ...EMPTY,
      unstaffableByReason: { skill_missing: 8, zone_not_covered: 4 },
    })
    const kpi = by('unstaffable_by_reason')(kpis)
    expect(kpi.value).toBe(12)
    expect(kpi.breakdown).toEqual({ skill_missing: 8, zone_not_covered: 4 })
  })

  it('n’attache PAS une répartition vide quand il n’y a rien', () => {
    // Un objet vide se lirait « aucune cause », ce qui est faux : la vraie
    // réponse est « aucun besoin déclaré non staffable ».
    expect(by('unstaffable_by_reason')(computeCrmKpis(EMPTY)).breakdown).toBeUndefined()
  })

  it('compte les PASSAGES en priorisé, pas les comptes créés', () => {
    const kpis = computeCrmKpis({ ...EMPTY, prioritisedInWindow: 7 })
    expect(by('accounts_prioritised')(kpis).value).toBe(7)
  })

  it('calcule les taux sur leur propre dénominateur', () => {
    const kpis = computeCrmKpis({
      ...EMPTY,
      trackedAccounts: 20,
      accountsWithoutNextAction: 5,
      detectedProjects: 40,
      qualifiedProjects: 10,
      totalContacts: 200,
      contactsInDuplicatePairs: 12,
      totalActivities: 50,
      autoCapturedActivities: 35,
    })
    expect(by('accounts_without_next_action')(kpis).value).toBeCloseTo(0.25)
    expect(by('detected_to_qualified')(kpis).value).toBeCloseTo(0.25)
    expect(by('duplicate_contact_rate')(kpis).value).toBeCloseTo(0.06)
    expect(by('auto_captured_activity')(kpis).value).toBeCloseTo(0.7)
  })

  it('n’expose AUCUNE probabilité', () => {
    // La « chance de closing » du §16 reste refusée — quatrième refus, même
    // raison que les trois précédents.
    expect(CRM_KPI_KEYS.some(key => /closing|probab|chance/i.test(key))).toBe(false)
  })
})
