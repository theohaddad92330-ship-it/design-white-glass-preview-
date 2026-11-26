import { describe, expect, it } from 'vitest'
import { aggregatedTrajectoryDestinations, buildPlanViewData, type ReverseProspect } from './planViewData'

describe('buildPlanViewData', () => {
  it('falls back to the root action plan when the plan envelope has other data', () => {
    const data = buildPlanViewData({
      plan: { competitive_strategy: { positioning_statement: 'Niche senior' } },
      action_plan: {
        phases: [{ name: 'Découverte', actions: [{ action: 'Qualifier le DSI' }] }],
      },
    })

    expect(data.planWeeks[0]?.items[0]?.text).toBe('Qualifier le DSI')
  })

  // #3720 (vu en passant, recette MO 10/10) — `/accounts/<id>?tab=plan` affichait la clé brute « land_and_expand ».
  it('#3720 — un identifiant de stratégie (snake_case) se lit en libellé, jamais en clé brute', () => {
    expect(buildPlanViewData({ action_plan: { strategy: 'land_and_expand' } }).strategy).toBe(
      'Prendre pied, puis étendre',
    )
    expect(buildPlanViewData({ strategy_type: 'land_and_expand' }).strategy).toBe('Prendre pied, puis étendre')
  })

  it('#3720 — sait dire NON : une stratégie rédigée en phrases reste telle quelle, un identifiant inconnu se lit sans tiret bas', () => {
    const prose = 'Ouvrir le compte par deux axes en parallèle.'
    expect(buildPlanViewData({ action_plan: { strategy: prose } }).strategy).toBe(prose)
    expect(buildPlanViewData({ action_plan: { strategy: 'middle_out' } }).strategy).toBe('middle out')
  })

  it('reads persisted user actions and attack angles', () => {
    const data = buildPlanViewData({
      user_plan_actions: [{ text: 'Qualifier le signal', expected_outcome: 'Obtenir un rendez-vous' }],
      user_attack_angles: [{ title: 'Angle cybersécurité', entry_point: 'DSI', recommended: true }],
    })

    expect({ actions: data.userActions.length, angles: data.angles.length }).toEqual({ actions: 1, angles: 1 })
  })

  it('reads the recommended movement and ranked next actions from the plan envelope', () => {
    const data = buildPlanViewData({
      plan: {
        recommendedMovement: {
          movement: 'top_down',
          sequence: 'sponsor → délégation → opérationnels',
          rationale: 'relation forte : entrer par le sponsor',
        },
        nextActions: [
          {
            id: 'enrichir_p1',
            chantier: 'contacts',
            label: 'Enrichir les contacts prioritaires',
            why: 'donnée manquante',
          },
          { id: 'blank', chantier: 'compte', label: '', why: 'ignored — no label' },
        ],
      },
    })

    expect(data.recommendedMovement).toEqual({
      movement: 'top_down',
      sequence: 'sponsor → délégation → opérationnels',
      rationale: 'relation forte : entrer par le sponsor',
    })
    expect(data.nextActions).toEqual([
      {
        id: 'enrichir_p1',
        chantier: 'contacts',
        label: 'Enrichir les contacts prioritaires',
        why: 'donnée manquante',
        // Dossier analysé avant les horizons p27 : pas d'échéance, pas de
        // regroupement — l'écran retombe sur la liste à plat d'avant.
        horizon: '',
      },
    ])
    expect(data.nextActionsByHorizon).toEqual([])
  })

  it('#2959 — reads the computed commercial route from the plan envelope, dropping empty attributes', () => {
    const data = buildPlanViewData({
      plan: {
        recommendedRoute: {
          route: 'partenaire',
          label: 'l’entrée passe par un partenaire déjà en place',
          rationale: 'un partenaire est déjà en place sur le compte',
          first_door: 'le partenaire',
          proof: '',
        },
      },
    })
    expect(data.recommendedRoute).toEqual({
      route: 'partenaire',
      rationale: 'un partenaire est déjà en place sur le compte',
      details: [{ key: 'first_door', value: 'le partenaire' }],
    })
  })

  it('#2959 — a plan without a route leaves it null, never an invented one', () => {
    expect(buildPlanViewData({ plan: { competitive_strategy: {} } }).recommendedRoute).toBeNull()
    expect(buildPlanViewData({ plan: { recommendedRoute: { route: '' } } }).recommendedRoute).toBeNull()
  })

  it('leaves movement null and next actions empty when the plan omits them', () => {
    const data = buildPlanViewData({ plan: { competitive_strategy: {} } })
    expect(data.recommendedMovement).toBeNull()
    expect(data.nextActions).toEqual([])
    expect(data.nextActionsByHorizon).toEqual([])
  })

  it('reads the next actions grouped by horizon, in 7j → 90j order, empty buckets dropped', () => {
    const data = buildPlanViewData({
      plan: {
        nextActions: [
          { id: 'enrichir_p1', chantier: 'contacts', label: 'Enrichir', why: 'w', horizon: '7j' },
          { id: 'foisonner_bu', chantier: 'expansion', label: 'Foisonner', why: 'w', horizon: '90j' },
        ],
        nextActionsByHorizon: {
          '90j': [{ id: 'foisonner_bu', chantier: 'expansion', label: 'Foisonner', why: 'w', horizon: '90j' }],
          '7j': [{ id: 'enrichir_p1', chantier: 'contacts', label: 'Enrichir', why: 'w', horizon: '7j' }],
        },
      },
    })

    expect(data.nextActionsByHorizon.map(group => group.horizon)).toEqual(['7j', '90j'])
    expect(data.nextActionsByHorizon[0]?.actions[0]?.id).toBe('enrichir_p1')
  })

  it('groups from each action horizon when the plan carries no grouped view', () => {
    const data = buildPlanViewData({
      plan: {
        nextActions: [
          { id: 'envoyer_m1', chantier: 'messages', label: 'Envoyer M1', why: 'w', horizon: '7j' },
          { id: 'demander_intro', chantier: 'contacts', label: 'Demander une intro', why: 'w', horizon: '30j' },
          { id: 'enrichir_p1', chantier: 'contacts', label: 'Enrichir', why: 'w', horizon: '7j' },
        ],
      },
    })

    expect(data.nextActionsByHorizon.map(group => [group.horizon, group.actions.length])).toEqual([
      ['7j', 2],
      ['30j', 1],
    ])
  })

  it("orders « aujourd'hui » before 7j, and drops it when empty (#2317.4/.5, épopée #2923)", () => {
    const withToday = buildPlanViewData({
      plan: {
        nextActions: [
          { id: 'x', chantier: 'contacts', label: 'X', why: 'w', horizon: "aujourd'hui" },
          { id: 'enrichir_p1', chantier: 'contacts', label: 'Enrichir', why: 'w', horizon: '7j' },
        ],
      },
    })
    expect(withToday.nextActionsByHorizon.map(group => group.horizon)).toEqual(["aujourd'hui", '7j'])

    // Aucune action « aujourd'hui » aujourd'hui : jamais une section creuse.
    const withoutToday = buildPlanViewData({
      plan: { nextActions: [{ id: 'enrichir_p1', chantier: 'contacts', label: 'Enrichir', why: 'w', horizon: '7j' }] },
    })
    expect(withoutToday.nextActionsByHorizon.map(group => group.horizon)).toEqual(['7j'])
  })

  it('reads the reverse prospects (ex-collaborateurs) and drops nameless entries', () => {
    const data = buildPlanViewData({
      plan: {
        reverseProspects: [
          {
            fullName: 'Claire Dupont',
            title: 'Architecte Data',
            currentCompany: 'Sopra Steria',
            linkedinUrl: 'https://linkedin.com/in/claire',
          },
          { title: 'DSI' },
        ],
      },
    })

    expect(data.reverseProspects).toEqual([
      {
        fullName: 'Claire Dupont',
        title: 'Architecte Data',
        currentCompany: 'Sopra Steria',
        linkedinUrl: 'https://linkedin.com/in/claire',
      },
    ])
  })

  it('#4399.5 ne garde que les PERSONNES (prénom + nom) : ni intitulé, ni entité, ni chaîne vide', () => {
    const data = buildPlanViewData({
      plan: {
        reverseProspects: [
          { fullName: 'Claire Dupont', title: 'Architecte Data' },
          { fullName: 'Directeur des systèmes d’information' },
          { fullName: 'TotalEnergies SE' },
          { fullName: '   ' },
          { fullName: 'Denis P.' },
        ],
      },
    })
    expect(data.reverseProspects.map(p => p.fullName)).toEqual(['Claire Dupont', 'Denis P.'])
  })

  it('leaves the reverse prospects empty when the dossier has none (rien d’inventé)', () => {
    expect(buildPlanViewData({ plan: {} }).reverseProspects).toEqual([])
    expect(buildPlanViewData({}).reverseProspects).toEqual([])
  })
})

/**
 * #1611.6 — LE SECOND BLOC AGRÉGÉ, ANONYME DÈS 3 OCCURRENCES.
 */
describe('aggregatedTrajectoryDestinations', () => {
  const prospect = (currentCompany: string): ReverseProspect => ({
    fullName: 'Peu importe',
    title: '',
    currentCompany,
    linkedinUrl: '',
  })

  it('rend une destination dès qu’elle atteint le seuil de 3', () => {
    const prospects = [prospect('Sopra Steria'), prospect('Sopra Steria'), prospect('Sopra Steria')]
    expect(aggregatedTrajectoryDestinations(prospects)).toEqual([{ company: 'Sopra Steria', persons: 3 }])
  })

  it('sous le seuil, la destination n’apparaît PAS — zéro identité, zéro coïncidence affichée', () => {
    const prospects = [prospect('Capgemini'), prospect('Capgemini')]
    expect(aggregatedTrajectoryDestinations(prospects)).toEqual([])
  })

  it('trie par nombre décroissant, puis alphabétique à égalité', () => {
    const prospects = [
      ...Array(3).fill(prospect('Atos')),
      ...Array(5).fill(prospect('Sopra Steria')),
      ...Array(3).fill(prospect('Accenture')),
    ]
    expect(aggregatedTrajectoryDestinations(prospects)).toEqual([
      { company: 'Sopra Steria', persons: 5 },
      { company: 'Accenture', persons: 3 },
      { company: 'Atos', persons: 3 },
    ])
  })

  it('jette les entrées sans employeur actuel connu — jamais une ligne « (vide) »', () => {
    const prospects = [prospect(''), prospect(''), prospect('')]
    expect(aggregatedTrajectoryDestinations(prospects)).toEqual([])
  })

  it('rend une liste vide sans aucun prospect', () => {
    expect(aggregatedTrajectoryDestinations([])).toEqual([])
  })

  it('un espace de saisie en trop ne crée pas une seconde destination', () => {
    const prospects = [prospect('Sopra Steria'), prospect('Sopra Steria '), prospect(' Sopra Steria')]
    expect(aggregatedTrajectoryDestinations(prospects)).toEqual([{ company: 'Sopra Steria', persons: 3 }])
  })
})

describe('préparation du rendez-vous — produite à chaque run, affichée nulle part', () => {
  it('lit les questions et la trame depuis le dossier', () => {
    const view = buildPlanViewData({
      powerQuestions: ['Qui décide ? — [montre le circuit]', 'Quel KPI ? — [fait verbaliser]'],
      rdvScript: { opening: 'Accroche', exploration: 'Cinq questions', closing: 'Prochaine étape' },
    })
    expect(view.meetingPrep?.powerQuestions).toHaveLength(2)
    expect(view.meetingPrep?.script.map(s => s.key)).toEqual(['opening', 'exploration', 'closing'])
  })

  it('garde l’ordre CHRONOLOGIQUE de la trame, pas celui des clés', () => {
    const view = buildPlanViewData({
      rdvScript: { closing: 'Fin', opening: 'Début', proposal: 'Offre' },
    })
    expect(view.meetingPrep?.script.map(s => s.key)).toEqual(['opening', 'proposal', 'closing'])
  })

  it('rien à préparer n’est pas une carte vide, c’est une carte absente', () => {
    expect(buildPlanViewData({}).meetingPrep).toBeNull()
    expect(buildPlanViewData({ rdvScript: { opening: '   ' } }).meetingPrep).toBeNull()
    expect(buildPlanViewData({ powerQuestions: [] }).meetingPrep).toBeNull()
  })

  it('accepte les deux graphies du dossier', () => {
    expect(buildPlanViewData({ power_questions: ['Q ?'] }).meetingPrep?.powerQuestions).toEqual(['Q ?'])
    expect(buildPlanViewData({ rdv_script: { opening: 'A' } }).meetingPrep?.script).toHaveLength(1)
  })
})

// LUDOVIC-D LC.2 — le plan de STILL ne montre plus l'angle d'un homonyme déjà stocké.
describe('LC.2 — angles : homonymes masqués à la lecture', () => {
  const raw = {
    recent_signals: [{ signal: 'Still Waters Farm opens a barn', url: 'https://stillwatersfarm.com/n' }],
    angles: [{ title: 'Audit logistique chez Still Waters Farm' }, { title: 'Renfort méthodes sur Lyon' }],
    user_attack_angles: [{ title: 'Stillwater : salon noté par moi' }],
  }
  it('masque l’angle de l’IA qui vise l’homonyme, garde celui du compte et celui saisi par un humain', () => {
    expect(buildPlanViewData(raw, 'https://www.still.fr').angles.map(a => a.title)).toEqual([
      'Stillwater : salon noté par moi',
      'Renfort méthodes sur Lyon',
    ])
  })
  it('SAIT DIRE NON : sans site connu, tout reste', () => {
    expect(buildPlanViewData(raw).angles).toHaveLength(3)
  })
})
