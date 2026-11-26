import { describe, expect, it } from 'vitest'
import { computeWaterfall } from '@/app/_components/charts.logic'
import type { BusinessCurrent, BusinessMonth } from '@/lib/business-metrics'
import {
  REPERES,
  controleDuSolde,
  etapesDuMois,
  formaterEuros,
  libelleMois,
  messageDErreurApi,
  metriquesDerivees,
  moisDe,
  periodeDeLaSerie,
  seriesDuGraphique,
  totalToutesSources,
} from './revenus.logic'

/**
 * Les trois tests que #1651 EXIGE, et ce qui les entoure.
 *
 *  T1  4 mois d'historique → LTV non mesurable, message explicite.
 *  T2  waterfall : la somme des composantes = mrrEnd EXACTEMENT.
 *  T3  aucun repère sans source citée.
 *
 * Tout est pur : aucune horloge lue, aucune requête. Ce fichier est l'endroit où
 * un mensonge pourrait s'écrire — « non mesuré » rendu « 0 % », une LTV calculée
 * sur deux mois, un repère de marché sans provenance.
 */

/**
 * `Intl` sépare le nombre de son unité par une espace fine INSÉCABLE (U+202F),
 * et la nuance change selon la version d'ICU embarquée dans Node. Comparer des
 * chaînes brutes ferait rougir ce fichier sur une autre machine sans qu'aucun
 * calcul n'ait bougé — le test mentirait sur ce qu'il mesure.
 */
function espacesNormales(texte: string): string {
  return texte.replace(/\s/g, ' ')
}

/** Un mois FIGÉ réaliste. Les mouvements bouclent : 11 200 + 900 + 580 − 0 − 200 = 12 480. */
const AOUT: BusinessMonth = {
  month: '2026-08',
  mrrStartCents: 1_120_000,
  mrrNewCents: 90_000,
  mrrExpansionCents: 58_000,
  mrrContractionCents: 0,
  mrrChurnedCents: 20_000,
  mrrEndCents: 1_248_000,
  customersStart: 15,
  customersNew: 2,
  customersChurned: 1,
  customersEnd: 16,
  contractedRevenueCents: 320_000,
  contractedCustomers: 3,
  oneOffCents: 900_000,
  oneOffCustomers: 1,
  computedAt: '2026-09-01T02:00:00.000Z',
}

/** Le PREMIER mois de la série : aucun terme de comparaison, cinq `null`. */
const PREMIER: BusinessMonth = {
  ...AOUT,
  month: '2026-05',
  mrrStartCents: null,
  mrrNewCents: null,
  mrrExpansionCents: null,
  mrrContractionCents: null,
  mrrChurnedCents: null,
  mrrEndCents: 1_000_000,
  customersStart: null,
  customersNew: null,
  customersChurned: null,
  customersEnd: 13,
}

function moisSuivant(month: string): string {
  const [annee = '', mois = ''] = month.split('-')
  const index = Number(mois)
  return index === 12 ? `${Number(annee) + 1}-01` : `${annee}-${String(index + 1).padStart(2, '0')}`
}

/**
 * Une série de `combien` mois qui bouclent tous, du plus ancien au plus récent —
 * l'ordre que l'API rend. Le premier porte ses `null`, comme en production : la
 * série réelle compte donc `combien − 1` mois de churn OBSERVÉ.
 */
function serie(combien: number): BusinessMonth[] {
  const mois: BusinessMonth[] = []
  let month = '2026-01'
  let debut = 1_000_000
  for (let i = 0; i < combien; i += 1) {
    if (i === 0) {
      mois.push({ ...PREMIER, month, mrrEndCents: debut })
    } else {
      const fin = debut + 90_000 + 10_000 - 0 - 20_000
      mois.push({
        ...AOUT,
        month,
        mrrStartCents: debut,
        mrrNewCents: 90_000,
        mrrExpansionCents: 10_000,
        mrrContractionCents: 0,
        mrrChurnedCents: 20_000,
        mrrEndCents: fin,
        customersStart: 14 + i,
        customersNew: 2,
        customersChurned: 1,
        customersEnd: 15 + i,
      })
      debut = fin
    }
    month = moisSuivant(month)
  }
  return mois
}

describe('formaterEuros / libelleMois (remontés d’un cran — GA-26)', () => {
  it('une valeur absente n’affiche JAMAIS 0 €', () => {
    expect(formaterEuros(null)).toBe('—')
    expect(formaterEuros(undefined)).toBe('—')
  })

  it('un vrai zéro s’affiche, lui', () => {
    expect(formaterEuros(0)).toContain('0')
  })

  it('rend des euros lisibles, et nomme le mois en français', () => {
    expect(formaterEuros(1_248_000).replace(/\s/g, '')).toBe('12480€')
    expect(libelleMois('2026-09')).toBe('Septembre 2026')
    expect(libelleMois('pas-un-mois')).toBe('pas-un-mois')
  })

  it('moisDe lit l’horloge en UTC, comme l’API étiquette ses instantanés', () => {
    // 00 h 30 le 1er septembre UTC, c'est 2 h 30 le 1er septembre à Paris : même
    // mois. Le piège est de l'autre côté — voir le cas suivant.
    expect(moisDe(new Date('2026-09-01T00:30:00Z'))).toBe('2026-09')
    // 23 h 30 le 31 août UTC = 1 h 30 le 1er septembre à Paris. Lu à Paris, ce
    // serait « 2026-09 » ; l'API, elle, l'a rangé sous « 2026-08 ». On suit
    // l'API, sinon on proposerait de figer un mois déjà figé sous un autre nom.
    expect(moisDe(new Date('2026-08-31T23:30:00Z'))).toBe('2026-08')
    expect(moisDe(new Date('2026-01-15T12:00:00Z'))).toBe('2026-01')
  })
})

describe('T2 — la somme des composantes du waterfall = mrrEnd EXACTEMENT (#1651)', () => {
  it('sur un mois réaliste, le contrôle du solde est EXACT', () => {
    // 1 120 000 + 90 000 + 58 000 − 0 − 20 000 = 1 248 000.
    expect(controleDuSolde(AOUT)).toEqual({ etat: 'exact', cents: 1_248_000 })
  })

  it('les six étapes portent les bons signes — contraction et churn RETRANCHENT', () => {
    // L'API stocke contraction et churn en MAGNITUDE positive (mrr-movements.ts).
    // Les passer tels quels au waterfall les ferait MONTER : c'est ici que le
    // signe se pose, une fois, plutôt que dans le JSX de l'écran.
    expect(etapesDuMois(AOUT)).toEqual([
      { label: 'MRR début', kind: 'start', value: 1_120_000 },
      { label: '+ Nouveau', kind: 'delta', value: 90_000 },
      { label: '+ Expansion', kind: 'delta', value: 58_000 },
      { label: '− Contraction', kind: 'delta', value: 0 },
      { label: '− Churn', kind: 'delta', value: -20_000 },
      { label: '= MRR fin', kind: 'end', value: 1_248_000 },
    ])
  })

  it('le waterfall DESSINÉ arrive exactement sur mrrEnd', () => {
    // La preuve de bout en bout : on empile vraiment les barres avec le calcul
    // de production (`computeWaterfall`) et on relit le total courant.
    const barres = computeWaterfall(etapesDuMois(AOUT))
    expect(barres).toHaveLength(6)

    const churn = barres[4]
    if (!churn) throw new Error('barre de churn absente')
    // Une étape négative descend : le total courant après elle est son `y0`.
    const apresChurn = (churn.value ?? 0) >= 0 ? churn.y1 : churn.y0
    expect(apresChurn).toBe(AOUT.mrrEndCents)
    expect(barres[5]?.value).toBe(AOUT.mrrEndCents)
  })

  it('un écart entre le calcul et le mois figé se DIT, il ne se masque pas', () => {
    const fausse = { ...AOUT, mrrEndCents: 1_250_000 }
    expect(controleDuSolde(fausse)).toEqual({
      etat: 'ecart',
      calculeCents: 1_248_000,
      figeCents: 1_250_000,
      ecartCents: 2_000,
    })
  })

  it('le premier mois n’a pas de décomposition — et ce n’est pas un écart', () => {
    // Cinq `null` ne valent pas cinq zéros : il n'y a pas de mois précédent.
    expect(controleDuSolde(PREMIER)).toEqual({ etat: 'sans_comparaison' })
    expect(etapesDuMois(PREMIER).map(e => e.value)).toEqual([null, null, null, null, null, 1_000_000])
  })
})

describe('la série 12 mois (bloc 2)', () => {
  it('rend cinq lignes, bornées aux douze derniers mois', () => {
    const lignes = seriesDuGraphique(serie(18))
    expect(lignes.map(l => l.name)).toEqual(['MRR fin', 'Nouveau', 'Expansion', 'Contraction', 'Churn'])
    for (const ligne of lignes) expect(ligne.points).toHaveLength(12)
  })

  it('un mois sans mouvement mesuré fait un TROU, jamais un zéro', () => {
    const lignes = seriesDuGraphique([PREMIER, AOUT])
    const nouveau = lignes.find(l => l.name === 'Nouveau')
    expect(nouveau?.points.map(p => p.value)).toEqual([null, 90_000])
  })

  it('contraction et churn voyagent en MAGNITUDE — une ligne ne descend pas sous zéro', () => {
    const lignes = seriesDuGraphique([AOUT])
    expect(lignes.find(l => l.name === 'Churn')?.points[0]?.value).toBe(20_000)
  })

  it('nomme sa période, et ne fabrique rien sur une série vide', () => {
    expect(periodeDeLaSerie(serie(3))).toBe('Janvier 2026 → Mars 2026')
    expect(periodeDeLaSerie([AOUT])).toBe('Août 2026')
    expect(periodeDeLaSerie([])).toBe('aucun mois figé')
  })
})

describe('T1 — la LTV n’existe pas sous 6 mois de churn OBSERVÉ (#1651)', () => {
  function ltv(series: BusinessMonth[]) {
    const trouvee = metriquesDerivees(series).find(m => m.cle === 'ltv')
    if (!trouvee) throw new Error('métrique LTV absente')
    return trouvee.valeur
  }

  it('4 mois d’historique → non mesurable, et la phrase dit COMBIEN il en manque', () => {
    // `serie(4)` : le premier mois n'a aucun mouvement, donc 3 mois de churn
    // observé seulement — c'est la situation réelle de la série aujourd'hui.
    const valeur = ltv(serie(4))
    expect(valeur.mesure).toBe(false)
    if (valeur.mesure) throw new Error('mesurée alors qu’elle ne devrait pas l’être')
    expect(valeur.raison).toContain('6 mois')
    expect(valeur.raison).toContain('3')
  })

  it('une série VIDE ne dit pas « 0 € » — elle dit qu’aucun mois n’est figé', () => {
    const valeur = ltv([])
    expect(valeur.mesure).toBe(false)
    if (valeur.mesure) throw new Error('mesurée sur une série vide')
    expect(valeur.raison).toContain('aucun mois figé')
  })

  it('exactement 5 mois observés : toujours NON — la borne est stricte', () => {
    expect(ltv(serie(6)).mesure).toBe(false)
  })

  it('6 mois observés : la LTV se calcule, et elle est en euros', () => {
    const valeur = ltv(serie(7))
    expect(valeur.mesure).toBe(true)
    if (!valeur.mesure) throw new Error('non mesurée alors que 6 mois sont observés')
    expect(valeur.texte).toContain('€')
  })

  it('un churn moyen NUL ne rend pas une LTV infinie', () => {
    const sansChurn = serie(9).map(mois => (mois.mrrChurnedCents === null ? mois : { ...mois, mrrChurnedCents: 0 }))
    // Les mois ne bouclent plus (on a retiré le churn du calcul) : peu importe,
    // c'est le REFUS qui est testé ici, pas le solde.
    const valeur = ltv(sansChurn)
    expect(valeur.mesure).toBe(false)
    if (valeur.mesure) throw new Error('LTV infinie rendue comme un nombre')
    expect(valeur.raison).toContain('nul')
  })
})

describe('les métriques dérivées (bloc 3)', () => {
  const derniere = () => metriquesDerivees([PREMIER, AOUT])

  it('rend les six métriques annoncées, dans l’ordre', () => {
    expect(derniere().map(m => m.cle)).toEqual(['nrr', 'grr', 'arpa', 'ltv', 'churn_logo', 'marge_brute'])
  })

  it('NRR et GRR se calculent sur le dernier mois figé', () => {
    // NRR = (1 120 000 + 58 000 − 0 − 20 000) / 1 120 000 = 103,4 %
    // GRR = (1 120 000 − 0 − 20 000) / 1 120 000 = 98,2 %
    const nrr = derniere().find(m => m.cle === 'nrr')?.valeur
    const grr = derniere().find(m => m.cle === 'grr')?.valeur
    expect(nrr?.mesure === true && espacesNormales(nrr.texte)).toBe('103,4 %')
    expect(grr?.mesure === true && espacesNormales(grr.texte)).toBe('98,2 %')
  })

  it('ARPA et churn logo aussi', () => {
    // ARPA = 1 248 000 / 16 = 78 000 c = 780 € ; churn logo = 1 / 15 = 6,7 %
    const arpa = derniere().find(m => m.cle === 'arpa')?.valeur
    const churn = derniere().find(m => m.cle === 'churn_logo')?.valeur
    expect(arpa?.mesure === true && arpa.texte.replace(/\s/g, '')).toBe('780€')
    expect(churn?.mesure === true && espacesNormales(churn.texte)).toBe('6,7 %')
  })

  it('sans mois précédent, NRR / GRR / churn logo disent « — » et POURQUOI', () => {
    // Le piège de cet écran : un dénominateur absent rendu « 0 % » ferait croire
    // à une rétention nulle, c'est-à-dire à la faillite.
    for (const cle of ['nrr', 'grr', 'churn_logo']) {
      const valeur = metriquesDerivees([PREMIER]).find(m => m.cle === cle)?.valeur
      expect(valeur?.mesure, cle).toBe(false)
      expect(valeur?.mesure === false && valeur.raison.length, cle).toBeGreaterThan(20)
    }
  })

  it('un dénominateur à ZÉRO refuse le ratio plutôt que de rendre l’infini', () => {
    const vide: BusinessMonth = { ...AOUT, mrrStartCents: 0, customersStart: 0, customersEnd: 0 }
    for (const cle of ['nrr', 'grr', 'arpa', 'churn_logo']) {
      const valeur = metriquesDerivees([PREMIER, vide]).find(m => m.cle === cle)?.valeur
      expect(valeur?.mesure, cle).toBe(false)
    }
  })

  it('la marge brute est NOMMÉE non mesurée plutôt que tue', () => {
    // Doctrine : un axe qu'on ne peut pas évaluer se NOMME, il ne disparaît pas.
    // Son repère existe et est sourcé ; c'est sa valeur qui manque, pas sa place.
    const marge = derniere().find(m => m.cle === 'marge_brute')
    expect(marge?.valeur.mesure).toBe(false)
    expect(marge?.repere).toBe('marge_brute')
  })
})

describe('T3 — aucun repère sans source citée (#1651)', () => {
  it('LIT quelque chose — le registre des repères n’est pas vide', () => {
    // Contrôle positif : un registre vidé rendrait chaque boucle ci-dessous
    // creuse, et la garde resterait verte sans rien avoir lu.
    expect(Object.keys(REPERES)).toEqual(['nrr', 'grr', 'churn_logo', 'marge_brute'])
  })

  it('chaque repère porte sa valeur ET sa source', () => {
    for (const [cle, repere] of Object.entries(REPERES)) {
      expect(repere.valeur.length, cle).toBeGreaterThan(0)
      expect(repere.source.length, cle).toBeGreaterThan(8)
    }
  })

  it('chaque repère cité par une métrique existe dans le registre', () => {
    for (const metrique of metriquesDerivees([PREMIER, AOUT])) {
      if (metrique.repere === null) continue
      expect(REPERES[metrique.repere], metrique.cle).toBeDefined()
    }
  })

  it('ARPA et LTV n’ont PAS de repère — on n’en invente pas', () => {
    const sans = metriquesDerivees([PREMIER, AOUT]).filter(m => m.repere === null)
    expect(sans.map(m => m.cle)).toEqual(['arpa', 'ltv'])
  })

  it('une année absente se DIT, elle ne s’invente pas', () => {
    // L'issue date trois des quatre repères. Le quatrième (churn médian
    // ChartMogul) arrive sans année : `null` plutôt qu'une année plausible.
    expect(REPERES['churn_logo'].date).toBeNull()
    expect(REPERES['nrr'].date).toBe('2026')
    expect(REPERES['grr'].date).toBe('2025')
    expect(REPERES['marge_brute'].date).toBe('T1 2025')
  })
})

describe('le refus de l’API se lit tel qu’il est ÉCRIT (porte « figer », 07/09/2026)', () => {
  it('rend le `message` de NestJS, pas le nom du code HTTP', () => {
    // La forme EXACTE d'une `BadRequestException` : le champ `error` porte
    // « Bad Request », le champ `message` porte la phrase écrite pour l'humain.
    // Lire `error` — ce que faisait l'écran — jetait la phrase.
    const refus = {
      statusCode: 400,
      message: 'Un mois manqué reste un trou nommé dans la série : il ne se rattrape pas.',
      error: 'Bad Request',
    }
    expect(messageDErreurApi(refus, 400)).toBe(
      'Un mois manqué reste un trou nommé dans la série : il ne se rattrape pas.',
    )
  })

  it('sait dire NON — « Bad Request » seul n’est pas une explication', () => {
    expect(messageDErreurApi({ statusCode: 400, error: 'Bad Request' }, 400)).toBe('Échec (400).')
    expect(messageDErreurApi(null, 502)).toBe('Échec (502).')
    expect(messageDErreurApi('du texte brut', 500)).toBe('Échec (500).')
    expect(messageDErreurApi({ message: '   ' }, 400)).toBe('Échec (400).')
  })

  it('n’attrape pas ce qu’elle ne vise pas — nos propres relais Next écrivent `error`', () => {
    expect(messageDErreurApi({ ok: false, error: 'API injoignable. fetch failed' }, 502)).toBe(
      'API injoignable. fetch failed',
    )
  })

  it('une liste de messages (pipe de validation) se lit en entier', () => {
    expect(messageDErreurApi({ message: ['month doit être AAAA-MM', 'month est requis'] }, 400)).toBe(
      'month doit être AAAA-MM · month est requis',
    )
  })
})

describe('bloc 4 — le MRR et le contracté ne s’additionnent jamais en silence', () => {
  const POSITION: BusinessCurrent = {
    mrrCents: 1_248_000,
    customers: 16,
    contractedRevenueCents: 320_000,
    contractedCustomers: 3,
    oneOffCents: 900_000,
    oneOffCustomers: 1,
  }

  it('le total mensuel DIT ce qu’il contient', () => {
    const total = totalToutesSources(POSITION)
    expect(total.mensuelCents).toBe(1_568_000)
    expect(total.phraseTotal.replace(/\s/g, '')).toContain('15680€')
    expect(total.phraseTotal.replace(/\s/g, '')).toContain('3200€')
  })

  it('le non-récurrent est HORS total, et il le dit', () => {
    const total = totalToutesSources(POSITION)
    expect(total.nonRecurrentCents).toBe(900_000)
    expect(total.phraseNonRecurrent).toContain('hors total')
    expect(total.phraseNonRecurrent.replace(/\s/g, '')).toContain('9000€')
  })

  it('zéro contrat ponctuel se dit aussi — c’est un zéro MESURÉ', () => {
    const total = totalToutesSources({ ...POSITION, oneOffCents: 0, oneOffCustomers: 0 })
    expect(total.nonRecurrentCents).toBe(0)
    expect(total.phraseNonRecurrent).toContain('Aucun')
  })
})
