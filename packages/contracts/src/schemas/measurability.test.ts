import { describe, expect, it } from 'vitest'
import { computeDso, measuredRate, measurability, MEASURABILITY_THRESHOLDS, unmeasuredShare } from './measurability.js'

/**
 * `measuredRate` — LA division du produit, et ses trois refus.
 *
 * Elle existe parce que trois écrans la refaisaient chacun à sa façon, et que
 * l'une des trois ARRONDISSAIT au centième : douze corrections sur deux mille
 * cinq cents contacts en ressortaient à `0`, c'est-à-dire à un zéro qu'aucune
 * mesure n'avait produit. Mesuré en recette live le 30/08/2026 sur `/pilotage`,
 * carte « Qualité Bellum » : « Taux de correction 0 % » à deux centimètres de
 * « Éléments corrigés 12 ».
 */
describe('measuredRate — un quotient, ou rien', () => {
  it('n’ARRONDIT pas : c’est l’affichage qui arrondit, jamais la mesure', () => {
    // Le défaut exact. `Math.round((12 / 2500) * 100) / 100` valait 0.
    expect(measuredRate(12, 2500)).toBeCloseTo(0.0048, 10)
    expect(measuredRate(12, 2500)).toBeGreaterThan(0)
  })

  it('un numérateur strictement positif ne rend JAMAIS zéro', () => {
    for (const denominator of [2401, 2500, 10_000, 1_000_000]) {
      expect(measuredRate(1, denominator), `sur ${denominator}`).toBeGreaterThan(0)
    }
  })

  it('un dénominateur NUL rend null — « 0 sur 0 » n’est pas « 0 % »', () => {
    expect(measuredRate(0, 0)).toBeNull()
    expect(measuredRate(3, 0)).toBeNull()
    expect(measuredRate(1, -4)).toBeNull()
  })

  it('un terme NON LU rend null — un taux dont on ignore un terme est une opinion', () => {
    expect(measuredRate(null, 20)).toBeNull()
    expect(measuredRate(4, null)).toBeNull()
    expect(measuredRate(undefined, undefined)).toBeNull()
  })

  it('un numérateur nul sur un dénominateur RÉEL vaut bien zéro — c’est une mesure', () => {
    // L'autre moitié de la règle, et il ne faut pas l'inverser : « non mesuré »
    // à la place d'un vrai zéro ment tout autant.
    expect(measuredRate(0, 12)).toBe(0)
  })

  it('encaisse l’absurde sans produire un chiffre absurde', () => {
    expect(measuredRate(Number.NaN, 10)).toBeNull()
    expect(measuredRate(1, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('mesurabilité', () => {
  it('dit COMBIEN il manque, pas seulement « non mesuré »', () => {
    // C'est tout l'objet du module : « non mesuré » fait chercher une panne,
    // « 3 sur 10 » dit que ça vient.
    expect(measurability(3, 10)).toEqual({ measurable: false, observed: 3, required: 10, missing: 7 })
  })

  it('devient mesurable AU seuil, pas au-dessus', () => {
    expect(measurability(10, 10).measurable).toBe(true)
    expect(measurability(10, 10).missing).toBe(0)
  })

  it('ne rend jamais un manque négatif', () => {
    expect(measurability(50, 10).missing).toBe(0)
  })

  it('encaisse une entrée absurde sans produire un chiffre absurde', () => {
    expect(measurability(Number.NaN, 10).observed).toBe(0)
    expect(measurability(-5, 10).observed).toBe(0)
    expect(measurability(1, 0).required).toBe(1)
  })
})

describe('DSO', () => {
  const paid = (invoicedAt: string, paidAt: string) => ({ invoicedAt, paidAt })

  it('reste NULL sous le seuil — trois factures ne font pas un DSO', () => {
    const result = computeDso([paid('2026-01-01', '2026-02-01'), paid('2026-01-01', '2026-01-15')], {
      disputed: 0,
    })
    expect(result.days).toBeNull()
    expect(result.measurability.missing).toBe(MEASURABILITY_THRESHOLDS.dso - 2)
  })

  it('ignore les impayées : elles ont un retard, pas un délai', () => {
    // Les inclure avec « aujourd'hui » ferait monter le DSO chaque jour sans
    // qu'aucun fait nouveau ne se produise.
    const result = computeDso(
      [...Array(10)].map(() => ({ invoicedAt: '2026-01-01', paidAt: null })),
      { required: 1, disputed: 0 },
    )
    expect(result.days).toBeNull()
    expect(result.measurability.observed).toBe(0)
  })

  it('compte à part ce qu’il ne peut pas dater', () => {
    // Un historique mal daté ne doit pas se lire comme un historique court.
    const result = computeDso(
      [
        paid('pas une date', '2026-02-01'),
        { invoicedAt: null, paidAt: '2026-02-01' },
        paid('2026-01-01', '2026-01-31'),
      ],
      { required: 1, disputed: 0 },
    )
    expect(result.undatable).toBe(2)
    expect(result.measurability.observed).toBe(1)
  })

  it('écarte un délai négatif — payée avant d’être émise est une faute de saisie', () => {
    const result = computeDso([paid('2026-02-01', '2026-01-01'), paid('2026-01-01', '2026-01-31')], {
      required: 1,
      disputed: 0,
    })
    expect(result.undatable).toBe(1)
    expect(result.days).toBe(30)
  })

  it('rend une MÉDIANE : une facture payée après relance judiciaire ne déplace pas tout', () => {
    const invoices = [
      ...[...Array(9)].map(() => paid('2026-01-01', '2026-01-31')),
      paid('2026-01-01', '2026-12-01'), // 334 jours
    ]
    const result = computeDso(invoices, { disputed: 0 })
    expect(result.days).toBe(30)
  })
})

/**
 * CE QUI SORT DE L'INDICATEUR SE NOMME À CÔTÉ DE L'INDICATEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QUE CE BLOC FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Le DSO écarte trois populations, et il n'en comptait que deux. Les mal datées
 * étaient comptées (`undatable`) ; les CONTESTÉES étaient écartées en SILENCE,
 * par le `WHERE` de la requête (`revenue.service.ts`, `ir.disputed_at IS NULL`).
 *
 * L'exclusion elle-même est juste — « un litige n'est pas un retard » : le temps
 * qu'une facture contestée met à être réglée mesure la durée d'une négociation,
 * pas la ponctualité d'un client. Ce qui manquait, c'est de le DIRE. Une médiane
 * qui ne dit pas sur quoi elle porte ment dans les deux sens : elle cache de
 * l'argent qui ne rentre pas, et elle laisse croire que le portefeuille est plus
 * sain qu'il n'est.
 *
 * ⚠️ `disputed` est REQUIS dans les options, et c'est le cœur du correctif. Un
 * troisième paramètre optionnel se serait fait oublier au premier appelant
 * ajouté — « paramètre déclaré, jamais passé » est un défaut déjà payé ici. Le
 * type force désormais chaque appelant à répondre à la question : combien en
 * as-tu sorties ?
 */
describe('DSO — ce qui SORT du calcul se NOMME à côté du calcul', () => {
  const paid = (invoicedAt: string, paidAt: string) => ({ invoicedAt, paidAt })

  it('porte le compte des factures CONTESTÉES, écartées en amont du calcul', () => {
    // Elles n'arrivent JAMAIS jusqu'ici : la requête les a déjà retirées. Le
    // compte voyage donc à côté des lignes, et non déduit d'elles.
    const result = computeDso([paid('2026-01-01', '2026-01-31')], { required: 1, disputed: 3 })
    expect(result.disputed).toBe(3)
    // …sans rien changer au chiffre lui-même : compter n'est pas réintégrer.
    expect(result.days).toBe(30)
  })

  it('« aucune contestée » est une MESURE — « pas su compter » n’en est pas une', () => {
    // Les deux se ressemblent à l'écran si on les écrit pareil, et ils appellent
    // deux gestes opposés : l'un ne demande rien, l'autre demande de réessayer.
    // `0` n'est donc JAMAIS le repli d'une lecture ratée (GA-18/GA-19).
    expect(computeDso([paid('2026-01-01', '2026-01-31')], { required: 1, disputed: 0 }).disputed).toBe(0)
    expect(computeDso([paid('2026-01-01', '2026-01-31')], { required: 1, disputed: null }).disputed).toBeNull()
  })

  it('les trois exclusions restent DISTINCTES — un litige n’est pas une date manquante', () => {
    // Les confondre ferait disparaître la seule des trois qui coûte de l'argent.
    const result = computeDso([paid('pas une date', '2026-02-01'), paid('2026-01-01', '2026-01-31')], {
      required: 1,
      disputed: 2,
    })
    expect(result.undatable).toBe(1)
    expect(result.disputed).toBe(2)
    expect(result.measurability.observed).toBe(1)
  })

  it('reste mesurable ou non SANS regarder les contestées — elles ne comblent aucun seuil', () => {
    // Trente factures contestées ne rendent pas mesurable un DSO qui n'a qu'une
    // observation : le seuil porte sur ce qui est CALCULÉ, jamais sur ce qui est
    // écarté. L'inverse ferait publier une médiane sur une seule facture.
    const result = computeDso([paid('2026-01-01', '2026-01-31')], { disputed: 30 })
    expect(result.days).toBeNull()
    expect(result.measurability.observed).toBe(1)
    expect(result.disputed).toBe(30)
  })
})

describe('unmeasuredShare — la part de ce qu’on n’a pas su mesurer', () => {
  it('rend une part, arrondie au dixième', () => {
    expect(unmeasuredShare(9, 1)).toBe(10)
    expect(unmeasuredShare(2, 1)).toBe(33.3)
    // Un espace parfaitement renseigné : `0` est ici une mesure VRAIE, et elle
    // se lit « on sait de quoi on parle ».
    expect(unmeasuredShare(12, 0)).toBe(0)
    expect(unmeasuredShare(0, 4)).toBe(100)
  })

  it('un dénominateur NUL n’est pas « 0 % non mesuré »', () => {
    // LE piège du lot, et il est retors parce que le zéro tombe du BON côté :
    // un espace sans mission afficherait « 0 % de marge non mesurée · cible
    // < 10 % » en vert — « nos données sont parfaites » — alors qu'il n'y a rien
    // à mesurer. La question à se poser : si cette valeur est absente, « 0 »
    // est-il VRAI ? Ici, non.
    expect(unmeasuredShare(0, 0)).toBeNull()
  })

  it('une lecture illisible rend `null`, jamais une part inventée', () => {
    expect(unmeasuredShare(Number.NaN, 3)).toBeNull()
    expect(unmeasuredShare(4, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('des comptes négatifs ne fabriquent pas une part négative', () => {
    expect(unmeasuredShare(-3, -1)).toBeNull()
    expect(unmeasuredShare(-3, 2)).toBe(100)
  })
})
