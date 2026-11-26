import { describe, expect, it } from 'vitest'
import { buildPlanViewData, type PlanRecord } from './planViewData'

/**
 * DoD p31 n°6 — « chaque recommandation cite la règle, le PROFIL et les preuves ».
 *
 * Le SalesContext pilotait le mouvement d'ouverture, le score /25, le tri des
 * contacts et le choix des actions, et n'atteignait aucun écran : `salesContext`
 * ne renvoyait aucun résultat dans `apps/web/src`. Le commercial subissait donc
 * une recommandation qu'il ne pouvait pas contester.
 */
describe('salesContext — le profil qui a produit les recos atteint la vue', () => {
  const dossier = {
    salesContext: {
      salesContextVersion: 1,
      esnProfile: {
        stage: 'petite',
        gtm: { model: 'founder_led', structure: 'founder_solo' },
        businessModel: { rankPosition: 'rang2' },
      },
      account: {
        archetype: 'banque_assurance',
        derivation: 'inferred',
        confidence: 90,
        evidence: ['code NAF officiel: 6419Z'],
      },
      relationship: {
        state: 'client_actif',
        derivation: 'user_declared',
        confidence: 100,
        evidence: ['statut déclaré: active'],
      },
    },
  } as unknown as PlanRecord

  it('expose les trois axes, leur provenance et leurs preuves', () => {
    const data = buildPlanViewData(dossier)

    expect(data.salesContext).not.toBeNull()
    expect(data.salesContext?.esnStage).toBe('petite')
    expect(data.salesContext?.salesStructure).toBe('founder_solo')
    // #2645.1 — « clients finaux via un partenaire, rang 2 » se relit dans le profil.
    expect(data.salesContext?.rankPosition).toBe('rang2')
    expect(data.salesContext?.account).toEqual({
      value: 'banque_assurance',
      derivation: 'inferred',
      confidence: 90,
      evidence: ['code NAF officiel: 6419Z'],
    })
    expect(data.salesContext?.relationship?.value).toBe('client_actif')
    expect(data.salesContext?.relationship?.derivation).toBe('user_declared')
  })

  it('#2645.1 — un rang non mesuré voyage tel quel ; c’est la vue qui décide de le taire', () => {
    const nonMesure = {
      salesContext: { esnProfile: { stage: 'petite', businessModel: { rankPosition: 'inconnu' } } },
    } as unknown as PlanRecord

    expect(buildPlanViewData(nonMesure).salesContext?.rankPosition).toBe('inconnu')
  })

  it('ne renvoie rien pour un dossier analysé avant le SalesContext', () => {
    // La carte doit se retirer d'elle-même plutôt que d'inventer un stade ou une
    // relation — c'est la règle « jamais de donnée fictive ».
    expect(buildPlanViewData({} as PlanRecord).salesContext).toBeNull()
  })

  it('ignore un axe sans valeur au lieu d’afficher une ligne creuse', () => {
    const partiel = {
      salesContext: {
        esnProfile: { stage: 'grande' },
        account: { derivation: 'default', confidence: 0, evidence: [] },
      },
    } as unknown as PlanRecord
    const data = buildPlanViewData(partiel)

    expect(data.salesContext?.esnStage).toBe('grande')
    expect(data.salesContext?.account).toBeNull()
    expect(data.salesContext?.relationship).toBeNull()
  })

  it('ne renvoie rien quand aucun axe n’est résolu', () => {
    const vide = { salesContext: { esnProfile: {}, account: {}, relationship: {} } } as unknown as PlanRecord

    expect(buildPlanViewData(vide).salesContext).toBeNull()
  })
})

/**
 * p27 — « chaque action doit préciser owner, canal, contact, raison, échéance,
 * résultat attendu et feedback ». `owner` et `reason` étaient générés par le
 * plan et lus par personne : la vue lisait `responsable`, le modèle écrivait
 * `owner`.
 */
describe('actions du plan — owner et raison atteignent la vue', () => {
  it('lit owner comme responsable et expose la raison', () => {
    const dossier = {
      user_plan_actions: [
        {
          text: 'Demander une introduction via Marc',
          owner: 'toi (le fondateur)',
          reason: 'petite ESN sur un compte lourd : la relation ouvre, pas le froid',
          contact: 'Marc Oliveira',
          channel: 'linkedin',
        },
      ],
    } as unknown as PlanRecord

    const [action] = buildPlanViewData(dossier).userActions

    expect(action?.responsable).toBe('toi (le fondateur)')
    expect(action?.reason).toBe('petite ESN sur un compte lourd : la relation ouvre, pas le froid')
    expect(action?.contact).toBe('Marc Oliveira')
    expect(action?.outil).toBe('linkedin')
  })

  it('garde la priorité au champ historique quand les deux existent', () => {
    // RÉTRO-COMPAT : un dossier déjà en base porte `responsable`. Il ne doit pas
    // changer d'affichage parce que le modèle produit désormais aussi `owner`.
    const dossier = {
      user_plan_actions: [{ text: 'Relancer', responsable: 'Sophie', owner: 'toi' }],
    } as unknown as PlanRecord

    expect(buildPlanViewData(dossier).userActions[0]?.responsable).toBe('Sophie')
  })
})

/**
 * #2645.2 — le MODÈLE DE REVENU change l'angle proposé et la cadence de
 * relance. Le commercial doit pouvoir voir le fait qui a produit ces deux
 * changements, sinon il subit des dates qu'il ne peut pas contester.
 */
describe('#2645.2 — le modèle de revenu voyage jusqu’à la vue', () => {
  const withRevenue = (revenueModel: unknown) =>
    buildPlanViewData({
      salesContext: {
        salesContextVersion: 1,
        esnProfile: { stage: 'petite', businessModel: { revenueModel } },
      },
    } as unknown as PlanRecord)

  it('porte la valeur déclarée telle quelle', () => {
    expect(withRevenue('ponctuel').salesContext?.revenueModel).toBe('ponctuel')
    expect(withRevenue('recurrent').salesContext?.revenueModel).toBe('recurrent')
  })

  it('porte aussi « inconnu » — c’est la VUE qui décide de le taire, pas la normalisation', () => {
    expect(withRevenue('inconnu').salesContext?.revenueModel).toBe('inconnu')
  })

  it('un dossier sans businessModel ne fabrique rien', () => {
    expect(withRevenue(undefined).salesContext?.revenueModel).toBe('')
  })
})
