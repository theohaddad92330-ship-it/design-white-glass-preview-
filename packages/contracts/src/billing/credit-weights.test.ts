import { describe, expect, it } from 'vitest'
import { SHIPPED_PLAN_GRID } from './shipped-plan-grid.js'
import {
  analysesAffordable,
  CREDIT_WEIGHTS,
  creditCostOf,
  creditCostRange,
  includedActions,
  isIncludedAction,
} from './credit-weights.js'

describe('la grille pondérée (§9, arbitrage Louis du 02/08)', () => {
  it('une analyse complète annoncée coûte 10 crédits (Approfondie par défaut, Louis 10/10), un enrichissement 1', () => {
    // Le rapport chiffre le ratio de coût réel à environ 8:1. C'est LE chiffre
    // qui justifie d'abandonner « une action = un crédit ».
    expect(creditCostOf('account_analysis')).toBe(10)
    expect(CREDIT_WEIGHTS.account_analysis).toBe(8)
    expect(creditCostOf('contact_enrichment')).toBe(1)
    expect(creditCostOf('account_refresh')).toBe(4)
  })

  it('un brief de marché local coûte 2 crédits, fixe, hors des actions incluses (D8, 04/10/2026)', () => {
    expect(creditCostOf('market_brief')).toBe(2)
    expect(creditCostRange('market_brief')).toEqual({ min: 2, max: 2 })
    expect(isIncludedAction('market_brief')).toBe(false)
    expect(includedActions()).not.toContain('market_brief')
  })

  it('les actions incluses ne débitent rien — elles sont bornées autrement', () => {
    // Facturer au crédit la fonction qu'on veut voir utilisée serait un
    // contresens produit : le copilote est borné par son plafond quotidien, les
    // messages par leur garde-fou de débit.
    for (const action of ['message_generation', 'copilot_message', 'export_or_note'] as const) {
      expect(creditCostOf(action)).toBe(0)
      expect(isIncludedAction(action)).toBe(true)
    }
  })

  it('un refresh ciblé monte avec le périmètre, sans dépasser son plafond', () => {
    expect(creditCostOf('targeted_refresh', { perimeterUnits: 1 })).toBe(1)
    expect(creditCostOf('targeted_refresh', { perimeterUnits: 2 })).toBe(2)
    expect(creditCostOf('targeted_refresh', { perimeterUnits: 3 })).toBe(3)
    // Au-delà, l'action reste possible mais le prix ne monte plus : un plafond
    // protège l'utilisateur, pas la marge.
    expect(creditCostOf('targeted_refresh', { perimeterUnits: 50 })).toBe(3)
  })

  it('une vérification de relation coûte 1 à 2 crédits', () => {
    expect(creditCostRange('relation_verification')).toEqual({ min: 1, max: 2 })
    expect(creditCostOf('relation_verification', { perimeterUnits: 9 })).toBe(2)
  })

  it('une action à prix fixe rend une fourchette dégénérée — l’appelant ne distingue pas les cas', () => {
    expect(creditCostRange('account_analysis')).toEqual({ min: 8, max: 8 })
  })

  it('un périmètre absurde ne casse pas le prix', () => {
    // Une valeur venue d'une URL ou d'un appel mal formé ne doit ni faire
    // exploser le débit, ni le faire tomber à zéro.
    expect(creditCostOf('targeted_refresh', { perimeterUnits: 0 })).toBe(1)
    expect(creditCostOf('targeted_refresh', { perimeterUnits: -5 })).toBe(1)
    expect(creditCostOf('targeted_refresh', { perimeterUnits: Number.NaN })).toBe(1)
  })
})

describe('les volumes des offres tiennent la promesse annoncée (§10)', () => {
  it('chaque palier payant permet le nombre d’analyses annoncé', () => {
    // Grille tranchée par Louis le 16/08 : 80 crédits à 119 € (Starter), 250 à
    // 249 € (Growth), un utilisateur inclus dans chacun. Ce qu'on vérifie n'est
    // pas le chiffre pour lui-même mais sa traduction en ANALYSES — la grandeur
    // que le commercial manipule, au prix de l'analyse PAR DÉFAUT (10, Louis
    // 10/10 soir — RAB2) : on promet ce qu'on tient, pas le poids plein 8.
    const price = creditCostOf('account_analysis')
    expect(price).toBe(10)
    expect(analysesAffordable(SHIPPED_PLAN_GRID.starter.creditsPerCycle)).toBe(8)
    expect(analysesAffordable(SHIPPED_PLAN_GRID.growth.creditsPerCycle)).toBe(25)
    // Team / Enterprise ne s'achète plus sur la grille publique : son enveloppe
    // se négocie. La valeur embarquée n'est que le repli d'un provisionnement
    // fait à la main.
    expect(analysesAffordable(SHIPPED_PLAN_GRID.team.creditsPerCycle)).toBe(60)
    // Le volume = crédits ÷ prix par défaut, arrondi vers le bas ; échoue si
    // quelqu'un remet le poids plein 8.
    for (const key of ['starter', 'growth', 'team'] as const) {
      const credits = SHIPPED_PLAN_GRID[key].creditsPerCycle
      expect(analysesAffordable(credits)).toBe(Math.floor(credits / price))
    }
    expect(analysesAffordable(79)).toBe(7)
  })

  it('monter de palier donne plus d’analyses, jamais moins', () => {
    // La règle qui survit à tous les arbitrages de prix : payer plus cher et
    // recevoir moins serait invendable — et personne ne s'en apercevrait avant
    // un client.
    expect(analysesAffordable(SHIPPED_PLAN_GRID.growth.creditsPerCycle)).toBeGreaterThan(
      analysesAffordable(SHIPPED_PLAN_GRID.starter.creditsPerCycle),
    )
    expect(SHIPPED_PLAN_GRID.growth.priceCents).toBeGreaterThan(SHIPPED_PLAN_GRID.starter.priceCents)
  })

  it('un compte créé en self-service ne peut lancer AUCUNE analyse — il n’a pas de licence', () => {
    // Retournement du 02/09/2026. Ce test exigeait l'inverse (« au moins une
    // analyse ») tant qu'un compte neuf était censé découvrir le produit par
    // lui-même. Il ne l'est plus : la découverte se fait dans la salle de
    // DÉMONSTRATION, qui ne débite rien parce qu'elle ne facture rien, et le
    // compte self-service arrive sur l'écran de choix de licence.
    //
    // Garder l'ancienne exigence reviendrait à réserver un budget d'analyses
    // réelles — donc des appels fournisseurs payants — à quelqu'un qui n'a rien
    // signé.
    expect(analysesAffordable(SHIPPED_PLAN_GRID.decouverte.creditsPerCycle)).toBe(0)
    expect(analysesAffordable(SHIPPED_PLAN_GRID.trial.creditsPerCycle)).toBe(0)
  })

  it('les prix restent ceux de la grille affichée', () => {
    // Ces chiffres sont ce que le site annonce et ce que Stripe prélève : les
    // changer ici sans changer les cartes fait mentir la page de tarifs, ce que
    // le test de parité attrape à son tour.
    //
    // Grille du 27/08/2026 : UN seul palier achetable, à 199 €.
    expect(SHIPPED_PLAN_GRID.growth.priceCents).toBe(19900)
    // Et il est le seul : `starter` a rejoint `team` hors de la vente. Cette
    // ligne est la garde de la décision — si quelqu'un remet un deuxième palier
    // en self-service, il devra l'assumer ici avant que la page ne l'affiche.
    expect(SHIPPED_PLAN_GRID.starter.selfServe).toBe(false)
    expect(SHIPPED_PLAN_GRID.team.selfServe).toBe(false)
    // Growth est mono-utilisateur : aucun siège ne s'y achète (0 = « pas de
    // siège vendable », pas « siège gratuit »). Au-delà d'un utilisateur, c'est
    // un devis Entreprise.
    expect(SHIPPED_PLAN_GRID.growth.seats).toBe(1)
    expect(SHIPPED_PLAN_GRID.growth.extraSeatPriceCents).toBe(0)
  })

  it('aucun poids n’est négatif ni fractionnaire — le compteur reste entier', () => {
    for (const weight of Object.values(CREDIT_WEIGHTS)) {
      expect(Number.isInteger(weight)).toBe(true)
      expect(weight).toBeGreaterThanOrEqual(0)
    }
  })
})

/**
 * #2003.22 — un solde à zéro n'est pas une panne, c'est un état NOMMÉ. Ce qui
 * le rend tenable est la réponse à « qu'est-ce qui reste utilisable ? », et
 * cette réponse se DÉRIVE de la grille : une action à poids nul ne débite rien,
 * donc rien ne l'arrête quand il ne reste rien. Une liste écrite à la main
 * promettrait un jour une action devenue payante.
 */
describe('includedActions — ce qui reste utilisable à zéro crédit (#2003.22)', () => {
  it('rend exactement les actions à poids nul, jamais une liste écrite à la main', () => {
    const derived = Object.entries(CREDIT_WEIGHTS)
      .filter(([, weight]) => weight === 0)
      .map(([action]) => action)
    expect([...includedActions()]).toEqual(derived)
  })

  it("LIT quelque chose : la liste n'est pas vide, et n'est pas la grille entière", () => {
    expect(includedActions().length).toBeGreaterThan(0)
    expect(includedActions().length).toBeLessThan(Object.keys(CREDIT_WEIGHTS).length)
  })

  it("n'attrape aucune action qui débite — c'est ce qui rend la promesse vraie", () => {
    for (const action of includedActions()) {
      expect(creditCostOf(action)).toBe(0)
      expect(isIncludedAction(action)).toBe(true)
    }
    // Témoin : les actions que le serveur ARRÊTE réellement à zéro crédit
    // (`insufficient_credits`, mesuré dans analysis / contacts / need-play) ne
    // doivent jamais entrer dans la liste.
    for (const gated of ['account_analysis', 'contact_enrichment', 'account_refresh', 'need_play'] as const) {
      expect(includedActions()).not.toContain(gated)
    }
  })
})
