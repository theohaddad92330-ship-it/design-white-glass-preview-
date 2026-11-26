import { describe, expect, it } from 'vitest'
import { MAX_SERIES } from '@/app/_components/charts.logic'
import type { BellumMargin, CostAggregate, CostDay, CostSpike } from '@/lib/costs'
import {
  ACTIONS_NON_MESUREES,
  CLE_AUTRES,
  bornageDeLaListe,
  formaterUsd,
  lectureDeLaMarge,
  lectureDuPic,
  libelleAction,
  libelleJour,
  periodeDeLaSerie,
  phraseDesOutilsBornes,
  phraseDuBornage,
  pileDesCouts,
} from './couts.logic'

/** Une journée MESURÉE, avec sa décomposition par fournisseur. */
function mesuree(day: string, perProvider: Record<string, number>, untariffed = 0): CostDay {
  return {
    day,
    measured: true,
    costUsd: Object.values(perProvider).reduce((somme, cout) => somme + cout, 0),
    perProvider,
    untariffed,
  }
}

/** Une journée dont le registre n'a rien vu — ce n'est PAS une journée à zéro. */
function nonMesuree(day: string, untariffed = 0): CostDay {
  return { day, measured: false, costUsd: null, perProvider: {}, untariffed }
}

describe('libelleJour / periodeDeLaSerie', () => {
  it('découpe la CHAÎNE du jour, sans jamais construire de date', () => {
    // Le jour civil est déjà résolu à Paris par le SQL. Lui redonner un instant
    // le ferait basculer d'un jour dès que le fuseau change de côté de minuit —
    // et ce test tournerait alors différemment selon la machine.
    expect(libelleJour('2026-09-08')).toBe('08/09')
    expect(libelleJour('2026-01-01')).toBe('01/01')
  })

  it('une série vide n’invente pas de période', () => {
    expect(periodeDeLaSerie([])).toBe('—')
    expect(periodeDeLaSerie([mesuree('2026-09-01', { anthropic: 1 }), nonMesuree('2026-09-03')])).toBe('01/09 → 03/09')
  })
})

describe('pileDesCouts (#1661, bloc 1)', () => {
  it('empile chaque journée par fournisseur, du plus cher au moins cher', () => {
    const pile = pileDesCouts([
      mesuree('2026-09-01', { anthropic: 4, firecrawl: 1 }),
      mesuree('2026-09-02', { anthropic: 6, firecrawl: 2 }),
    ])

    expect(pile.keys).toEqual(['anthropic', 'firecrawl'])
    expect(pile.replies).toBe(0)
    expect(pile.categories).toEqual([
      { label: '01/09', values: { anthropic: 4, firecrawl: 1 } },
      { label: '02/09', values: { anthropic: 6, firecrawl: 2 } },
    ])
  })

  it('une journée NON MESURÉE n’a AUCUNE série — pas une colonne à zéro', () => {
    // C'est ce qui fait dessiner un repère en pointillés plutôt qu'une barre de
    // hauteur nulle. « 0 $ dépensé » et « rien vu » ne se ressemblent que sur
    // un graphique, et l'un des deux est un mensonge.
    const pile = pileDesCouts([mesuree('2026-09-01', { anthropic: 4 }), nonMesuree('2026-09-02')])

    expect(pile.categories[1]).toEqual({ label: '02/09', values: {} })
  })

  it('un VRAI zéro reste dessiné — une journée mesurée à 0 $ garde sa série', () => {
    const pile = pileDesCouts([mesuree('2026-09-01', { serper: 0 })])

    expect(pile.categories[0]).toEqual({ label: '01/09', values: { serper: 0 } })
  })

  it('replie les fournisseurs au-delà de ce que la pile sait dessiner', () => {
    // ⚠️ Le piège exact : `StackedBar` clampe ses séries à MAX_SERIES. Lui en
    // passer huit n'en dessinerait que cinq, et le total de chaque colonne
    // serait celui de ces cinq-là — un total FAUX présenté comme un total.
    const perProvider = Object.fromEntries(
      Array.from({ length: MAX_SERIES + 3 }, (_, index) => [`f${index}`, MAX_SERIES + 3 - index]),
    )
    const pile = pileDesCouts([mesuree('2026-09-01', perProvider)])

    expect(pile.keys).toHaveLength(MAX_SERIES)
    expect(pile.keys[MAX_SERIES - 1]).toBe(CLE_AUTRES)
    expect(pile.replies).toBe(4)
    expect(pile.labels[CLE_AUTRES]).toBe('autres (4 fournisseurs)')
  })

  it('le repli CONSERVE le total de la journée — rien ne disparaît', () => {
    // La raison d'être du repli : la somme des parts dessinées doit rester la
    // dépense réelle du jour.
    const perProvider = Object.fromEntries(
      Array.from({ length: MAX_SERIES + 3 }, (_, index) => [`f${index}`, index + 1]),
    )
    const attendu = Object.values(perProvider).reduce((somme, cout) => somme + cout, 0)
    const [colonne] = pileDesCouts([mesuree('2026-09-01', perProvider)]).categories

    expect(Object.values(colonne?.values ?? {}).reduce((somme, cout) => somme + cout, 0)).toBe(attendu)
  })

  it('n’attrape pas ce qu’elle ne vise pas — exactement MAX_SERIES fournisseurs ne se replient pas', () => {
    const perProvider = Object.fromEntries(Array.from({ length: MAX_SERIES }, (_, index) => [`f${index}`, index + 1]))
    const pile = pileDesCouts([mesuree('2026-09-01', perProvider)])

    expect(pile.replies).toBe(0)
    expect(pile.keys).not.toContain(CLE_AUTRES)
    expect(pile.labels).toEqual({})
  })
})

describe('lectureDuPic (#1661, l’alerte)', () => {
  it('dit OUI et NOMME le seuil sans le recopier', () => {
    // Le montant du seuil VOYAGE dans le verdict : ce fichier n'écrit jamais
    // « 150 % », qui serait une seconde maison pour COST_SPIKE_RATIO.
    const pic: CostSpike = { spike: true, day: '2026-09-08', costUsd: 40, medianUsd: 10, ratio: 4, thresholdUsd: 15 }

    const lecture = lectureDuPic(pic)

    expect(lecture.ton).toBe('alerte')
    expect(lecture.valeur).toBe('×4')
    expect(lecture.titre).toContain('08/09')
    expect(lecture.detail).toContain(formaterUsd(15))
  })

  it('sans médiane, la tuile est VIDE — jamais « ×1 » de repos', () => {
    const lecture = lectureDuPic({ spike: false, reason: 'not_enough_days', observedDays: 3, requiredDays: 7 })

    expect(lecture.valeur).toBeNull()
    expect(lecture.ton).toBe('inconnu')
    expect(lecture.detail).toContain('3')
    expect(lecture.detail).toContain('7')
  })

  it('une médiane à zéro est un TROU, et le dit', () => {
    const lecture = lectureDuPic({ spike: false, reason: 'baseline_is_zero', observedDays: 7 })

    expect(lecture.valeur).toBeNull()
    expect(lecture.ton).toBe('inconnu')
    expect(lecture.detail).toContain('registre')
  })

  it('une journée non mesurée ne se lit pas « tout va bien »', () => {
    const lecture = lectureDuPic({ spike: false, reason: 'day_not_measured', day: '2026-09-08' })

    expect(lecture.ton).toBe('inconnu')
    expect(lecture.valeur).toBeNull()
  })

  it('sous le seuil, le ton est CALME et le ratio est mesuré', () => {
    const lecture = lectureDuPic({
      spike: false,
      reason: 'under_threshold',
      day: '2026-09-08',
      costUsd: 11,
      medianUsd: 10,
      ratio: 1.1,
      thresholdUsd: 15,
    })

    expect(lecture.ton).toBe('calme')
    expect(lecture.valeur).toBe('×1,1')
  })
})

describe('lectureDeLaMarge (#1661, bloc 4)', () => {
  const socle: BellumMargin = {
    measurability: { measurable: false, observed: 0, required: 1, missing: 1 },
    marginRate: null,
    blockedReason: 'currency_mismatch',
    fixedCostsExcluded: [{ label: 'Hébergement', reason: 'facture non fournie' }],
    isFloor: true,
  }

  it('le refus de devise dit sa raison ET ce qui le lèverait', () => {
    // Un tiret muet ferait chercher une panne ; pire, quelqu'un finirait par
    // « réparer » en inventant un taux de change.
    const lecture = lectureDeLaMarge(socle, null)

    expect(lecture.valeur).toBeNull()
    expect(lecture.raison).toContain('EUROS')
    expect(lecture.raison).toContain('DOLLARS')
    expect(lecture.debloquer).toContain('DEVISE UNIQUE')
  })

  it('le ratio coût/MRR est refusé dans la MÊME phrase — la règle se dit une fois', () => {
    expect(lectureDeLaMarge(socle, null).raison).toContain('coût fournisseur / MRR')
  })

  it('une API en panne n’affiche pas « 0 % »', () => {
    const lecture = lectureDeLaMarge(null, 'Endpoint marge: 503 Service Unavailable')

    expect(lecture.valeur).toBeNull()
    expect(lecture.raison).toContain('503')
    expect(lecture.raison).toContain('0 %')
  })

  it('un échantillon trop petit DIT combien il manque', () => {
    const lecture = lectureDeLaMarge(
      { ...socle, blockedReason: null, measurability: { measurable: false, observed: 2, required: 5, missing: 3 } },
      null,
    )

    expect(lecture.valeur).toBeNull()
    expect(lecture.debloquer).toContain('3')
  })

  it('mesurable, elle affiche un pourcentage — et jamais un « 0 % » par défaut', () => {
    const lecture = lectureDeLaMarge(
      {
        ...socle,
        blockedReason: null,
        marginRate: 0.83,
        measurability: { measurable: true, observed: 9, required: 5, missing: 0 },
      },
      null,
    )

    expect(lecture.valeur).toBe('83 %')
  })

  it('mesurable mais sans taux (revenu nul), la valeur reste VIDE', () => {
    // `measuredRate` refuse un dénominateur nul : `marginRate` vaut `null` et ne
    // doit surtout pas devenir « 0 % ».
    const lecture = lectureDeLaMarge(
      {
        ...socle,
        blockedReason: null,
        marginRate: null,
        measurability: { measurable: true, observed: 9, required: 5, missing: 0 },
      },
      null,
    )

    expect(lecture.valeur).toBeNull()
  })
})

describe('bornageDeLaListe (#1661, blocs 2 et 3)', () => {
  const lignes: CostAggregate[] = [
    { key: 'ws-1', calls: 10, units: 10, cost_usd: 30, untariffed: 0 },
    { key: 'ws-2', calls: 5, units: 5, cost_usd: 20, untariffed: 0 },
  ]

  it('une liste COMPLÈTE n’a pas de coût « hors liste » — il n’existe pas', () => {
    const bornage = bornageDeLaListe(lignes, 2, 50)

    expect(bornage).toEqual({ borne: false, distinctes: 2 })
    expect(phraseDuBornage(bornage, 'espaces')).toBeNull()
  })

  it('une liste BORNÉE dit qu’elle en est une, et chiffre ce qu’elle laisse dehors', () => {
    // « Si tu l'affiches comme un total, tu mens. »
    const bornage = bornageDeLaListe(lignes, 47, 90)

    expect(bornage).toEqual({ borne: true, affichees: 2, distinctes: 47, coutNonAffiche: 40 })
    const phrase = phraseDuBornage(bornage, 'espaces')
    expect(phrase).toContain('47')
    expect(phrase).toContain('pas un total')
  })

  it('le bruit des flottants ne fabrique jamais un coût négatif', () => {
    const bornage = bornageDeLaListe(lignes, 47, 49.999_999_9)

    expect(bornage).toMatchObject({ borne: true, coutNonAffiche: 0 })
  })

  it('sans aucune ligne ni aucune clé, rien n’est borné', () => {
    expect(bornageDeLaListe([], 0, 0)).toEqual({ borne: false, distinctes: 0 })
  })
})

describe('libelleAction', () => {
  it('nomme les quatre familles que le registre écrit RÉELLEMENT', () => {
    // Les quatre appelants de `ProviderCostService.record()` dans le dépôt.
    expect(libelleAction('analysis')).toBe('Analyse de compte')
    expect(libelleAction('enrichment')).toBe('Enrichissement de contacts')
    expect(libelleAction('need_play')).toBe('Plan de besoin')
    expect(libelleAction('chat')).toBe('Copilote (Laura)')
  })

  it('une clé inconnue s’affiche TELLE QUELLE — un joli nom deviné est une donnée fictive', () => {
    expect(libelleAction('quelque_chose_de_neuf')).toBe('quelque_chose_de_neuf')
  })

  it('les familles que l’issue nomme et que rien n’enregistre sont DITES', () => {
    // Les taire ferait lire l'absence d'une ligne « messages » comme
    // « les messages ne coûtent rien ».
    expect(ACTIONS_NON_MESUREES.length).toBeGreaterThan(0)
    expect(ACTIONS_NON_MESUREES.join(' ')).toContain('Messages')
    expect(ACTIONS_NON_MESUREES.join(' ')).toContain('embeddings')
  })
})

describe('formaterUsd', () => {
  it('affiche des DOLLARS — le registre est en dollars et il le reste', () => {
    // Convertir ici serait exactement ce que la doctrine refuse : un taux
    // appliqué à la volée fait diverger la comptabilité de ce qui a été vu.
    expect(formaterUsd(1234.5)).toMatch(/1\s?234,50/)
    expect(formaterUsd(0)).toMatch(/0,00/)
  })
})

// #2442.12 — le coût par outil est un top 20 : il le dit quand il peut être tronqué, et se tait sinon.
describe('phraseDesOutilsBornes', () => {
  const outils = (n: number): CostAggregate[] =>
    Array.from({ length: n }, (_, i) => ({ key: `outil_${i}`, calls: 1, units: 1, cost_usd: 1, untariffed: 0 }))

  it('se tait sous le plafond (rien n’est tronqué)', () => {
    expect(phraseDesOutilsBornes(outils(19))).toBeNull()
    expect(phraseDesOutilsBornes([])).toBeNull()
  })

  it('dit « ce n’est pas un total » au plafond', () => {
    expect(phraseDesOutilsBornes(outils(20))).toContain('pas un total')
  })
})
