import { describe, expect, it } from 'vitest'
import { CREDIT_WEIGHTS } from './credit-weights.js'
import {
  ACTION_ESTIMATED_COST_USD,
  CREDIT_COST_FAMILIES,
  CREDIT_COST_SPREAD_ALERT_RATIO,
  FIXED_COST_FAMILIES_UNMEASURED,
  MIN_FAMILIES_FOR_SPREAD,
  UNCREDITED_COST_FEATURES,
  UNCREDITED_COST_SHARE_ALERT,
  measureCreditCost,
  type CreditDebitRow,
  type MeasuredCostRow,
} from './credit-cost.js'

/** Raccourci de lecture : une ligne de coût tarifée. */
const cost = (feature: string, costUsd: number | null): MeasuredCostRow => ({ feature, costUsd })
/** Raccourci de lecture : un débit du registre (delta NÉGATIF = consommé). */
const debit = (
  resource: CreditDebitRow['resource'],
  credits: number,
  reason: string | null = null,
): CreditDebitRow => ({ resource, delta: -credits, reason })

describe('ACTION_ESTIMATED_COST_USD — le coût estimé pour la porte de budget (#2975)', () => {
  it('nomme une estimation positive pour chaque famille de la carte', () => {
    // Une famille sans estimation ouvrirait la porte en silence (pas de
    // défaut à 0 $) — donc chaque famille DOIT avoir une entrée positive.
    for (const family of CREDIT_COST_FAMILIES) {
      expect(ACTION_ESTIMATED_COST_USD[family.key]).toBeGreaterThan(0)
    }
  })
})

describe('la carte des familles — ce que la mesure sait joindre', () => {
  it('chaque famille nomme au moins une fonctionnalité ET une ressource de crédit', () => {
    // Corpus non vide : une carte sans famille rendrait toute la mesure verte
    // en ne mesurant rien.
    expect(CREDIT_COST_FAMILIES.length).toBeGreaterThan(0)
    for (const family of CREDIT_COST_FAMILIES) {
      expect(family.features.length).toBeGreaterThan(0)
      expect(family.resource).toBeTruthy()
      expect(family.label.length).toBeGreaterThan(0)
    }
  })

  it('aucune fonctionnalité n’appartient à deux familles — sinon son coût serait compté deux fois', () => {
    const seen = new Set<string>()
    for (const family of CREDIT_COST_FAMILIES) {
      for (const feature of family.features) {
        expect(seen.has(feature)).toBe(false)
        seen.add(feature)
      }
    }
    for (const feature of UNCREDITED_COST_FEATURES) {
      expect(seen.has(feature)).toBe(false)
    }
  })

  it('toute action rattachée à une famille a un poids NON NUL à la grille', () => {
    // Une action à poids 0 rangée dans une famille créditée diviserait un coût
    // réel par un dénominateur qu'elle n'alimente pas.
    const listed = CREDIT_COST_FAMILIES.flatMap(family => family.actions)
    expect(listed.length).toBeGreaterThan(0)
    for (const action of listed) {
      expect(CREDIT_WEIGHTS[action]).toBeGreaterThan(0)
    }
  })

  it('les fonctionnalités SANS crédit sont celles dont le poids est zéro à la grille', () => {
    // `chat` ↔ `copilot_message`. Le lien n'est pas décoratif : c'est lui qui
    // justifie qu'on ne divise PAS par zéro et qu'on le dise.
    expect(UNCREDITED_COST_FEATURES.length).toBeGreaterThan(0)
    expect(CREDIT_WEIGHTS.copilot_message).toBe(0)
  })
})

describe('le coût d’un crédit, par famille', () => {
  it('divise le coût mesuré par les crédits réellement débités', () => {
    const measure = measureCreditCost({
      costRows: [cost('analysis', 4), cost('analysis', 4)],
      debitRows: [debit('analysis_slot', 8)],
    })
    const analysis = measure.families.find(f => f.key === 'analysis')
    expect(analysis?.costUsd).toBe(8)
    expect(analysis?.credits).toBe(8)
    expect(analysis?.usdPerCredit).toBe(1)
    expect(analysis?.unmeasurable).toBeNull()
  })

  it('un remboursement rend son crédit au dénominateur', () => {
    // Motif connu du dépôt : « un remboursement doit correspondre au débit
    // pondéré ». Si le registre rend 8 crédits, le dénominateur les rend aussi,
    // sinon le coût du crédit double sans qu'aucune dépense n'ait bougé.
    const measure = measureCreditCost({
      costRows: [cost('analysis', 8)],
      debitRows: [debit('analysis_slot', 16), { resource: 'analysis_slot', delta: +8, reason: null }],
    })
    expect(measure.families.find(f => f.key === 'analysis')?.credits).toBe(8)
    expect(measure.families.find(f => f.key === 'analysis')?.usdPerCredit).toBe(1)
  })

  it('un débit dont le coût n’est JAMAIS enregistré sort du dénominateur, et il est NOMMÉ', () => {
    // `refresh:<dimension>` débite un crédit d'enrichissement (
    // `analysis-refresh.service.ts`) et n'écrit AUCUNE ligne dans
    // `provider_costs`. Le compter au dénominateur ferait passer
    // l'enrichissement pour deux fois moins cher qu'il n'est.
    const measure = measureCreditCost({
      costRows: [cost('enrichment', 2)],
      debitRows: [
        debit('enrichment_credit', 2, 'enrichissement: ACME'),
        debit('enrichment_credit', 2, 'refresh:signals'),
      ],
    })
    const enrichment = measure.families.find(f => f.key === 'enrichment')
    expect(enrichment?.credits).toBe(2)
    expect(enrichment?.creditsWithoutMeasuredCost).toBe(2)
    expect(enrichment?.usdPerCredit).toBe(1)
  })

  it('`cv_rewrite` aussi — le débit existe, la ligne de coût n’existe pas', () => {
    const measure = measureCreditCost({
      costRows: [cost('enrichment', 3)],
      debitRows: [debit('enrichment_credit', 3, 'enrichissement: X'), debit('enrichment_credit', 1, 'cv_rewrite')],
    })
    const enrichment = measure.families.find(f => f.key === 'enrichment')
    expect(enrichment?.creditsWithoutMeasuredCost).toBe(1)
    expect(enrichment?.credits).toBe(3)
  })

  it('une famille sans aucun crédit débité n’a pas de coût du crédit — et ce n’est pas zéro', () => {
    const measure = measureCreditCost({ costRows: [cost('analysis', 12)], debitRows: [] })
    const analysis = measure.families.find(f => f.key === 'analysis')
    expect(analysis?.usdPerCredit).toBeNull()
    expect(analysis?.unmeasurable).toContain('aucun crédit')
  })

  it('une famille dont TOUTES les lignes sont non tarifées n’a pas de coût du crédit non plus', () => {
    // C'est le cœur de l'affaire : « le zéro est un trou, pas un fait ». Sans
    // `PROVIDER_UNIT_COST_*`, la ligne vaut `null` — jamais 0 $.
    const measure = measureCreditCost({
      costRows: [cost('analysis', null), cost('analysis', null)],
      debitRows: [debit('analysis_slot', 8)],
    })
    const analysis = measure.families.find(f => f.key === 'analysis')
    expect(analysis?.untariffedLines).toBe(2)
    expect(analysis?.costUsd).toBe(0)
    expect(analysis?.usdPerCredit).toBeNull()
    expect(analysis?.unmeasurable).toContain('non tarifée')
  })

  it('une famille partiellement tarifée rend un coût du crédit, marqué PLANCHER', () => {
    const measure = measureCreditCost({
      costRows: [cost('analysis', 8), cost('analysis', null)],
      debitRows: [debit('analysis_slot', 8)],
    })
    const analysis = measure.families.find(f => f.key === 'analysis')
    expect(analysis?.usdPerCredit).toBe(1)
    expect(analysis?.untariffedLines).toBe(1)
    expect(measure.isFloor).toBe(true)
  })
})

describe('le coût qui ne débite RIEN', () => {
  it('le copilote est mesuré à part : un coût réel, zéro crédit, aucun ratio', () => {
    const measure = measureCreditCost({
      costRows: [cost('analysis', 1), cost('chat', 9)],
      debitRows: [debit('analysis_slot', 8)],
    })
    expect(measure.uncredited.costUsd).toBe(9)
    // 9 sur 10 : c'est l'ordre de grandeur que l'audit de juillet a mesuré
    // (« ~87 % de la facture vient des fonctions hors analyse »).
    expect(measure.uncreditedShare).toBeCloseTo(0.9, 6)
    expect(measure.uncreditedShare! > UNCREDITED_COST_SHARE_ALERT).toBe(true)
  })

  it('sans aucun coût mesuré, la part n’est pas 0 % — elle est inconnue', () => {
    const measure = measureCreditCost({ costRows: [], debitRows: [] })
    expect(measure.uncreditedShare).toBeNull()
  })

  it('une fonctionnalité inconnue de la carte est NOMMÉE, jamais absorbée', () => {
    // Une nouvelle fonctionnalité qui écrit dans `provider_costs` sans être
    // rattachée fausserait tous les ratios en silence.
    const measure = measureCreditCost({
      costRows: [cost('analysis', 1), cost('transcription', 40)],
      debitRows: [debit('analysis_slot', 1)],
    })
    expect(measure.unmappedFeatures).toEqual(['transcription'])
    expect(measure.unmappedCostUsd).toBe(40)
  })
})

describe('l’écart entre familles — le chiffre de l’item 5', () => {
  it('rend le rapport entre la famille la plus chère et la moins chère', () => {
    const measure = measureCreditCost({
      costRows: [cost('analysis', 10), cost('enrichment', 40)],
      debitRows: [debit('analysis_slot', 100), debit('enrichment_credit', 10)],
    })
    // 0,10 $ le crédit contre 4,00 $ : rapport 40.
    expect(measure.spread?.ratio).toBe(40)
    expect(measure.spread?.dearest).toBe('enrichment')
    expect(measure.spread?.cheapest).toBe('analysis')
  })

  it('sous deux familles mesurables, il n’y a PAS d’écart — et on le dit', () => {
    const measure = measureCreditCost({
      costRows: [cost('analysis', 10)],
      debitRows: [debit('analysis_slot', 100)],
    })
    expect(measure.spread).toBeNull()
    expect(measure.spreadUnmeasurable).toContain(String(MIN_FAMILIES_FOR_SPREAD))
  })

  it('le seuil d’alerte est un rapport, pas un montant — il survit à un changement de tarif', () => {
    expect(CREDIT_COST_SPREAD_ALERT_RATIO).toBeGreaterThan(1)
  })
})

describe('les coûts FIXES — ce que la mesure ne contient PAS (item 12)', () => {
  it('les familles non mesurées sont nommées, avec leur raison', () => {
    // « Le zéro est un trou, pas un fait » : quatre postes du modèle sont à 0 €
    // faute de facture. Aucun d'eux n'a de représentation dans le dépôt — la
    // mesure ci-dessus ne porte QUE les fournisseurs facturés à l'appel.
    expect(FIXED_COST_FAMILIES_UNMEASURED.length).toBeGreaterThan(0)
    for (const family of FIXED_COST_FAMILIES_UNMEASURED) {
      expect(family.label.length).toBeGreaterThan(0)
      expect(family.reason.length).toBeGreaterThan(0)
    }
  })

  it('aucune ne porte de montant — une absence ne se chiffre pas', () => {
    for (const family of FIXED_COST_FAMILIES_UNMEASURED) {
      expect(Object.keys(family).sort()).toEqual(['label', 'reason'])
    }
  })
})
