// #3819 revient sur #3814, délibérément (Louis 10/10) : en Taille, sans-signal en dernier ; l'effectif ordonne à l'intérieur.
import { describe, expect, it } from 'vitest'
import {
  countHighPotential,
  defaultDiscoverSort,
  FIT_AXES_MIN_MEASURED,
  fitAxesFor,
  fitTierFor,
  isHighPotential,
  keywordMatchNotice,
  scoreRatio,
  sortCandidates,
  keepUndatedBelow,
  lacksDatedSignal,
  lacksShownDatedSignal,
  undatedSeparatorIndex,
  verifiedFirst,
} from './discover-ranking'
import type { DiscoverCandidate } from './discover-types'
import { computeDiscoverSourceAxes } from '@bellum/contracts'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 50,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

describe('scoreRatio', () => {
  it('rapporte le score au maximum RÉELLEMENT mesuré', () => {
    expect(scoreRatio(candidate({ score: 63, scoreMax: 80 }))).toBeCloseTo(0.7875)
  })

  it('reste null sans score — jamais ramené à 0', () => {
    expect(scoreRatio(candidate({ score: null, scoreMax: null }))).toBeNull()
    expect(scoreRatio(candidate({ score: 10, scoreMax: 0 }))).toBeNull()
  })
})

describe('isHighPotential', () => {
  it('retient un score ≥ 70 % du mesurable sur au moins 3 blocs', () => {
    expect(isHighPotential(candidate({ score: 70, scoreMax: 100, scoreUnmeasured: [] }))).toBe(true)
    expect(isHighPotential(candidate({ score: 56, scoreMax: 80, scoreUnmeasured: ['age'] }))).toBe(true)
  })

  it('écarte un ratio flatteur bâti sur trop peu de blocs mesurés', () => {
    const thin = candidate({
      score: 30,
      scoreMax: 30,
      scoreUnmeasured: ['geography', 'headcount', 'signals', 'accessibility', 'evidence'],
    })
    expect(scoreRatio(thin)).toBe(1)
    expect(isHighPotential(thin)).toBe(false)
  })

  it('écarte un score sous le seuil, et un candidat sans score', () => {
    expect(isHighPotential(candidate({ score: 69, scoreMax: 100 }))).toBe(false)
    expect(isHighPotential(candidate({ score: null, scoreMax: null }))).toBe(false)
  })

  it('compte le sous-total sur la liste rendue', () => {
    expect(
      countHighPotential([
        candidate({ score: 90, scoreMax: 100 }),
        candidate({ score: 10, scoreMax: 100 }),
        candidate({ score: null, scoreMax: null }),
      ]),
    ).toBe(1)
  })
})

describe('fitTierFor', () => {
  it('nomme « élevé » exactement la population « à fort potentiel »', () => {
    // Même règle que isHighPotential : ≥ 70 % du mesurable sur au moins 3 blocs.
    expect(fitTierFor(candidate({ score: 70, scoreMax: 100, scoreUnmeasured: [] }))).toBe('high')
    expect(fitTierFor(candidate({ score: 56, scoreMax: 80, scoreUnmeasured: ['age'] }))).toBe('high')
  })

  it('classe « moyen » entre 40 % et le seuil « élevé »', () => {
    expect(fitTierFor(candidate({ score: 40, scoreMax: 100, scoreUnmeasured: [] }))).toBe('medium')
    expect(fitTierFor(candidate({ score: 69, scoreMax: 100, scoreUnmeasured: [] }))).toBe('medium')
  })

  it('classe « faible » sous 40 %', () => {
    expect(fitTierFor(candidate({ score: 39, scoreMax: 100, scoreUnmeasured: [] }))).toBe('low')
    expect(fitTierFor(candidate({ score: 0, scoreMax: 100, scoreUnmeasured: [] }))).toBe('low')
  })

  it('ne promeut jamais « élevé » un ratio flatteur bâti sur trop peu de blocs', () => {
    // ratio = 1 mais trois blocs mesurés sur huit → jamais « élevé » ; retombe
    // sur « moyen ».
    const thin = candidate({
      score: 30,
      scoreMax: 30,
      scoreUnmeasured: ['geography', 'headcount', 'signals', 'accessibility', 'evidence'],
    })
    expect(scoreRatio(thin)).toBe(1)
    expect(fitTierFor(thin)).toBe('medium')
  })

  it('reste null sans score mesurable — « rien mesuré » n’est pas « fit faible »', () => {
    expect(fitTierFor(candidate({ score: null, scoreMax: null }))).toBeNull()
    expect(fitTierFor(candidate({ score: 10, scoreMax: 0 }))).toBeNull()
  })
})

describe('fitAxesFor', () => {
  // La source (archive-05 item 15, T5.md:1066-1088) nomme cinq axes avec leur
  // poids : Sujets 30 · Maturité 25 · Mission 20 · Précédent 15 · Appétence 10.
  // Le Registre n'en mesure honnêtement que trois — les deux autres n'ont
  // structurellement aucune source à ce stade et sortent du dénominateur.

  it('mesure Sujets, Maturité et Précédent par défaut, et nomme Mission et Appétence comme non suivies', () => {
    const c = candidate({ scoreUnmeasured: [], portfolioState: 'new' })
    const result = fitAxesFor(c)
    const byKey = Object.fromEntries(result.axes.map(a => [a.key, a]))

    expect(result.axes).toHaveLength(5)
    expect(byKey.subjects.score).not.toBeNull()
    expect(byKey.maturity.score).not.toBeNull()
    expect(byKey.precedent.score).toBe(0) // pas encore client
    expect(byKey.mission).toEqual({ key: 'mission', max: 20, score: null, reason: 'not_tracked' })
    expect(byKey.appetite).toEqual({ key: 'appetite', max: 10, score: null, reason: 'not_tracked' })
    expect(result.measuredCount).toBe(3)
  })

  it('note Précédent au maximum quand le compte est déjà client — jamais deviné', () => {
    const withHistory = fitAxesFor(candidate({ portfolioState: 'customer' }))
    const withoutHistory = fitAxesFor(candidate({ portfolioState: 'watched' }))
    expect(withHistory.axes.find(a => a.key === 'precedent')?.score).toBe(15)
    expect(withoutHistory.axes.find(a => a.key === 'precedent')?.score).toBe(0)
  })

  it('ramène le bloc backend `signals` (réellement /20) sur le poids « Sujets » (30) — sans recalculer les points', () => {
    const c = candidate({
      scoreUnmeasured: [],
      scoreFactors: [{ label: 'AO IT publié la semaine dernière', points: 14, block: 'signals' }],
    })
    const subjects = fitAxesFor(c).axes.find(a => a.key === 'subjects')
    expect(subjects?.score).toBe(21) // 14/20 * 30
    expect(subjects?.max).toBe(30)
  })

  it('ramène le bloc backend `it_surface` (réellement /20) sur le poids « Maturité » (25)', () => {
    const c = candidate({
      scoreUnmeasured: [],
      scoreFactors: [{ label: 'Stack SaaS visible', points: 10, block: 'it_surface' }],
    })
    const maturity = fitAxesFor(c).axes.find(a => a.key === 'maturity')
    expect(maturity?.score).toBe(13) // 10/20 * 25 = 12,5 → arrondi
  })

  it('nomme un axe non évalué SUR CE COMPTE — ne le remplit jamais d’une valeur plausible', () => {
    const c = candidate({ scoreUnmeasured: ['signals', 'it_surface'] })
    const result = fitAxesFor(c)
    expect(result.axes.find(a => a.key === 'subjects')).toEqual({
      key: 'subjects',
      max: 30,
      score: null,
      reason: 'block_unmeasured',
    })
    expect(result.axes.find(a => a.key === 'maturity')).toEqual({
      key: 'maturity',
      max: 25,
      score: null,
      reason: 'block_unmeasured',
    })
  })

  it('sous le minimum d’axes mesurés, il n’y a pas de score — seulement les cinq axes NOMMÉS', () => {
    // Il ne reste que « Précédent » : subjects/maturity non évalués sur ce
    // compte, mission/appétence jamais suivis.
    const c = candidate({ scoreUnmeasured: ['signals', 'it_surface'] })
    const result = fitAxesFor(c)
    expect(result.measuredCount).toBe(1)
    expect(result.measuredCount).toBeLessThan(FIT_AXES_MIN_MEASURED)
    expect(result.score).toBeNull()
    expect(result.max).toBeNull()
    expect(result.axes).toHaveLength(5)
  })

  it('additionne exactement les axes mesurés — jamais un total recalculé depuis autre chose', () => {
    const c = candidate({ scoreUnmeasured: [], scoreFactors: [], portfolioState: 'customer' })
    const result = fitAxesFor(c)
    // subjects = 0 (bloc mesuré, aucun facteur) · maturity = 0 · precedent = 15
    expect(result.measuredCount).toBe(3)
    expect(result.score).toBe(15)
    expect(result.max).toBe(70) // 30 + 25 + 15
  })

  it('un compte sans aucune mesure d’intérêt ne tombe jamais sur un fit à zéro', () => {
    const c = candidate({
      score: null,
      scoreMax: null,
      scoreUnmeasured: [
        'activity',
        'geography',
        'headcount',
        'age',
        'it_surface',
        'signals',
        'accessibility',
        'evidence',
      ],
    })
    const result = fitAxesFor(c)
    expect(result.score).toBeNull() // 1 seul axe (précédent) < minimum
    expect(result.axes.every(a => a.key !== 'subjects' || a.score === null)).toBe(true)
  })
})

describe('sortCandidates', () => {
  const strong = candidate({ name: 'Bêta', score: 63, scoreMax: 80, dataConfidence: 40 })
  const weak = candidate({ name: 'Alpha', siren: '2', score: 70, scoreMax: 100, dataConfidence: 90 })
  const unscored = candidate({ name: 'Gamma', siren: '3', score: null, scoreMax: null, dataConfidence: null })

  it('classe par part du maximum mesurable, pas par score brut', () => {
    expect(sortCandidates([weak, strong, unscored], 'score').map(c => c.name)).toEqual(['Bêta', 'Alpha', 'Gamma'])
  })

  it('renvoie les candidats sans mesure en dernier, jamais retirés', () => {
    const sorted = sortCandidates([unscored, weak], 'confidence')
    expect(sorted.map(c => c.name)).toEqual(['Alpha', 'Gamma'])
    expect(sorted).toHaveLength(2)
  })

  it('classe par fraîcheur du signal le plus récent', () => {
    const older = candidate({ name: 'Vieux', siren: '4', signals: [signal('2026-01-05')] })
    const fresher = candidate({ name: 'Frais', siren: '5', signals: [signal('2026-01-04'), signal('2026-07-01')] })
    expect(sortCandidates([older, fresher], 'signalRecency').map(c => c.name)).toEqual(['Frais', 'Vieux'])
  })

  it('#3819 — un signal COMMERCIAL passe devant, la vie juridique seule est classée après', () => {
    const legalOnly = candidate({
      name: 'Greffe',
      siren: '6',
      score: 90,
      scoreMax: 100,
      signals: [{ type: 'legal', label: 'Modification du capital', date: '2026-10-01' }],
    })
    const tender = candidate({
      name: 'Appel',
      siren: '7',
      score: 40,
      scoreMax: 100,
      signals: [{ type: 'tender', label: 'AO maintenance', date: '2026-09-01' }],
    })
    expect(sortCandidates([legalOnly, tender], 'score').map(c => c.name)).toEqual(['Appel', 'Greffe'])
    expect(sortCandidates([legalOnly, tender], 'signalRecency').map(c => c.name)).toEqual(['Appel', 'Greffe'])
    // Le tri alphabétique reste ce qu'il dit.
    expect(sortCandidates([legalOnly, tender], 'name').map(c => c.name)).toEqual(['Appel', 'Greffe'])
  })

  // #3819.4 (ajout bêta 08/10, Louis/L04-L05) — un compte SANS AUCUN signal
  // (sélectionné sur le profil, « juste une liste de vérification » selon le
  // second bêta-testeur) classe après tout compte qui porte au moins une
  // raison DATÉE, même la seule vie juridique — pas seulement après un signal
  // commercial. Score flatteur sans rapport : la présence d'une raison prime.
  it('#3819.4 — un compte sans aucun signal classe après un compte qui porte au moins une raison datée, même légale', () => {
    const legalOnly = candidate({
      name: 'Greffe',
      siren: '6',
      score: 10,
      scoreMax: 100,
      signals: [{ type: 'legal', label: 'Modification du capital', date: '2026-10-01' }],
    })
    const noSignal = candidate({ name: 'Muet', siren: '11', score: 95, scoreMax: 100, signals: [] })
    expect(sortCandidates([noSignal, legalOnly], 'score').map(c => c.name)).toEqual(['Greffe', 'Muet'])
    expect(sortCandidates([noSignal, legalOnly], 'signalRecency').map(c => c.name)).toEqual(['Greffe', 'Muet'])
    // Le tri alphabétique reste ce qu'il dit.
    expect(sortCandidates([noSignal, legalOnly], 'name').map(c => c.name)).toEqual(['Greffe', 'Muet'])
  })

  it('trie par nom et ne mute jamais la liste source', () => {
    const source = [strong, weak]
    expect(sortCandidates(source, 'name').map(c => c.name)).toEqual(['Alpha', 'Bêta'])
    expect(source.map(c => c.name)).toEqual(['Bêta', 'Alpha'])
  })

  // #3814.2 — tri « Taille (effectif) » : les grands comptes en tête, un
  // effectif illisible ou absent jamais devant un effectif connu.
  it('classe par effectif décroissant, un effectif illisible en dernier', () => {
    const giant = candidate({ name: 'Géant', siren: '6', headcountRange: '1 000 à 1 999 salariés' })
    const mid = candidate({ name: 'Moyen', siren: '7', headcountRange: '50 à 99 salariés' })
    const unlabeled = candidate({ name: 'Flou', siren: '8', headcountRange: null })
    expect(sortCandidates([mid, unlabeled, giant], 'headcount').map(c => c.name)).toEqual(['Géant', 'Moyen', 'Flou'])
  })

  it('un libellé « et plus » classe devant toute tranche bornée', () => {
    const open = candidate({ name: 'Ouvert', siren: '9', headcountRange: '1000 salariés et plus' })
    const bounded = candidate({ name: 'Borné', siren: '10', headcountRange: '250 à 999 salariés' })
    expect(sortCandidates([bounded, open], 'headcount').map(c => c.name)).toEqual(['Ouvert', 'Borné'])
  })

  // #3814 — recette prod 08/10 (U 22edd95fe1) : « 0 salarié » (tranche INSEE
  // « 00 », une coquille/holding) remontait devant une tranche 20-49 bien
  // réelle. Doctrine « non mesuré ≠ 0 » : ce tri sert à faire remonter de
  // VRAIS grands comptes, pas à récompenser un zéro déclaré — il rejoint le
  // panier « illisible/absent », toujours en fin de tri, et jamais avant une
  // tranche effectivement peuplée.
  it('#3814 — « 0 salarié » rejoint les effectifs illisibles en fin de tri, jamais avant une tranche peuplée', () => {
    const mid = candidate({ name: 'Mid', siren: '11', headcountRange: '20 à 49 salariés' })
    const small = candidate({ name: 'Small', siren: '12', headcountRange: '3 à 5 salariés' })
    const tiny = candidate({ name: 'Tiny', siren: '13', headcountRange: '1 à 2 salariés' })
    const shell = candidate({ name: 'Shell', siren: '14', headcountRange: '0 salarié' })
    const unlabeled = candidate({ name: 'Flou', siren: '15', headcountRange: null })
    expect(sortCandidates([shell, mid, unlabeled, small, tiny], 'headcount').map(c => c.name)).toEqual([
      'Mid',
      'Small',
      'Tiny',
      // Égalité (toutes deux `null`) : retombe sur le nom, « Flou » < « Shell ».
      'Flou',
      'Shell',
    ])
  })

  // #3814 — recette prod 08/10 (U 22edd95fe1) : ARCHEOS (0 salarié, un AO en
  // cours) remontait en tête d'un tri « Taille » via la priorité commerciale
  // de #3819 — correcte pour un tri de PERTINENCE (score, fraîcheur…), fausse
  // pour un tri qui promet un ordre de TAILLE et rien d'autre.
  // #3814 — renversé par Louis 14/10 : sans signal en dernier
  it('#3814 — un signal commercial ne fait PAS passer un petit effectif devant un grand, entre comptes à signal, en tri « Taille »', () => {
    const sig = [{ type: 'tender' as const, label: 'AO en cours', date: '2026-09-01' }]
    const shellWithSignal = candidate({ name: 'ARCHEOS', siren: '16', headcountRange: '0 salarié', signals: sig })
    const mid = candidate({ name: 'Mid', siren: '17', headcountRange: '20 à 49 salariés', signals: sig })
    expect(sortCandidates([shellWithSignal, mid], 'headcount').map(c => c.name)).toEqual(['Mid', 'ARCHEOS'])
  })

  // #3819 (Louis 10/10) : les comptes SANS AUCUN signal passent après tous ceux
  // qui en ont, même en Taille ; l'effectif ordonne à l'intérieur de chaque groupe.
  it('#3819 — en tri « Taille », sans-signal en dernier ; l’effectif ordonne à l’intérieur', () => {
    const sig = [{ type: 'tender' as const, label: 'AO en cours', date: '2026-09-01' }]
    const shell = candidate({ name: 'ARCHEOS', siren: '16', headcountRange: '0 salarié', signals: sig })
    const small = candidate({ name: 'Petit', siren: '18', headcountRange: '3 à 5 salariés', signals: sig })
    const bigNone = candidate({ name: 'Castelnau', siren: '19', headcountRange: '1 000 à 1 999 salariés' })
    const midNone = candidate({ name: 'Mid', siren: '17', headcountRange: '20 à 49 salariés' })
    expect(sortCandidates([bigNone, shell, midNone, small], 'headcount').map(c => c.name)).toEqual([
      'Petit',
      'ARCHEOS',
      'Castelnau',
      'Mid',
    ])
  })
})

// #3814.4 — décision Louis 14/10/2026 : en « Taille », les comptes SANS signal passent EN DERNIER, puis la taille
// décroissante à l'intérieur de chaque groupe. Le cas de la salle démo (Vaucelle : 0 salarié mais des signaux ;
// Castelnau : plus grand mais aucun signal) : le premier précède le second.
describe('sortCandidates — « Taille » : sans signal en dernier (#3814.4)', () => {
  const sig = [{ type: 'legal' as const, label: 'Ventes et cessions', date: '2026-09-28' }]

  it('un 0 salarié AVEC signal précède un grand compte SANS signal ; la taille ordonne dans chaque groupe', () => {
    const vaucelle = candidate({ name: 'Vaucelle', siren: '41', headcountRange: '0 salarié', signals: sig })
    const castelnau = candidate({ name: 'Castelnau', siren: '42', headcountRange: '50 à 249 salariés' })
    const geant = candidate({ name: 'Géant', siren: '43', headcountRange: '1 000 à 1 999 salariés' })
    const petit = candidate({ name: 'Petit', siren: '44', headcountRange: '3 à 5 salariés', signals: sig })
    expect(sortCandidates([castelnau, vaucelle, petit, geant], 'headcount').map(c => c.name)).toEqual([
      'Petit',
      'Vaucelle',
      'Géant',
      'Castelnau',
    ])
  })
})

describe('defaultDiscoverSort', () => {
  // #3814.1 — aucun secteur choisi : le tri par défaut devient la taille, pour
  // que les grands comptes pertinents ne restent pas noyés sous les TPE quand
  // rien d'autre ne les distingue (recherche « tous secteurs »).
  it('retombe sur la taille quand aucun secteur n’est choisi, quelle que soit la recommandation serveur', () => {
    expect(defaultDiscoverSort([], 'interest')).toBe('headcount')
    expect(defaultDiscoverSort([], 'balanced')).toBe('headcount')
    expect(defaultDiscoverSort([], undefined)).toBe('headcount')
  })

  it('suit la recommandation du serveur dès qu’un secteur est choisi', () => {
    expect(defaultDiscoverSort(['software_tech'], 'interest')).toBe('score')
    expect(defaultDiscoverSort(['software_tech'], 'addressability')).toBe('addressability')
    expect(defaultDiscoverSort(['software_tech'], 'balanced')).toBe('balanced')
    expect(defaultDiscoverSort(['software_tech'], undefined)).toBe('score')
  })
})

function signal(date: string) {
  return { type: 'hiring' as const, label: 'Recrutement', date }
}

/**
 * #4067 (décision Louis 12/10) — ce que l'espace sait déjà PÈSE dans le
 * classement : les points des sources mesurées s'ajoutent au score, leur
 * plafond au dénominateur. Une source non mesurée ne change rien.
 */
describe('sortCandidates — axes de sources (#4067)', () => {
  const NOW = new Date('2026-10-12T00:00:00Z')
  const NO_FACTS = { signalHistory: null, crm: null, marketMemory: null, dataforge: null, drive: null, missions: null }
  const won = computeDiscoverSourceAxes(
    { ...NO_FACTS, crm: { won: 1, lost: 0, open: 0, dormant: 0, contacts: 4, lastActivityAt: null } },
    NOW,
  )
  const nothing = computeDiscoverSourceAxes(NO_FACTS, NOW)
  const tender = [{ type: 'tender' as const, label: 'AO', date: '2026-10-01' }]

  it('à score registre égal, l’affaire gagnée passe devant (tri « score »)', () => {
    const sorted = sortCandidates(
      [
        candidate({ name: 'A', score: 60, signals: tender, sourceAxes: nothing }),
        candidate({ name: 'B', score: 60, signals: tender, sourceAxes: won }),
      ],
      'score',
    )
    expect(sorted.map(c => c.name)).toEqual(['B', 'A'])
  })

  it('un compte sans signal récent mais avec un historique pèse avant un compte sans AUCUNE raison', () => {
    const history = computeDiscoverSourceAxes(
      { ...NO_FACTS, signalHistory: { signals: [{ type: 'hiring', date: '2026-02-01', changeCount: 0 }] } },
      NOW,
    )
    const sorted = sortCandidates(
      [
        candidate({ name: 'Sans raison', score: 90 }),
        candidate({ name: 'Historique', score: 40, sourceAxes: history }),
      ],
      'score',
    )
    expect(sorted.map(c => c.name)).toEqual(['Historique', 'Sans raison'])
  })

  it('sans source mesurée, l’ordre est exactement celui d’avant ce lot', () => {
    const sorted = sortCandidates(
      [
        candidate({ name: 'A', score: 50, signals: tender, sourceAxes: nothing }),
        candidate({ name: 'B', score: 70, signals: tender }),
      ],
      'score',
    )
    expect(sorted.map(c => c.name)).toEqual(['B', 'A'])
  })
})

// #4045 (recette prod 13/10) — le mot-clé « cybersécurité » sur banque/assurance laissait l'ordre identique
// et ne disait rien. Il RECLASSE (signal qui le recoupe en tête), et dit quand rien ne correspond.
describe('mot-clé de la recherche', () => {
  const sig = (keywordMatch?: boolean) => ({
    type: 'hiring' as const,
    label: 'Recrute',
    date: '2026-09-01',
    source: 'France Travail',
    ...(keywordMatch === undefined ? {} : { keywordMatch }),
  })
  const strong = candidate({ name: 'Alpha', siren: '1', score: 90, signals: [sig(false)] })
  const matching = candidate({ name: 'Zeta', siren: '2', score: 40, signals: [sig(true)] })

  // #3915.42 — « Renault » : des cartes Renault / Renault Trucks sont rendues, le mot-clé doit les reconnaître
  // par le NOM de l'employeur (normalisé), sans fusionner les deux employeurs.
  it('#3915.42 — le nom de l’employeur recoupe le mot-clé, accents et casse ignorés', () => {
    const renault = candidate({ name: 'RENAULT', siren: '441639465', signals: [sig(false)] })
    const trucks = candidate({ name: 'Renault Trucks', siren: '954506077', signals: [sig(false)] })
    const other = candidate({ name: 'Peugeot', siren: '552144503', signals: [sig(false)] })
    expect(keywordMatchNotice([renault, trucks, other], 'renault')).toBeNull()
    expect(keywordMatchNotice([candidate({ name: 'Société Générale', signals: [sig(false)] })], 'generale')).toBeNull()
    expect(keywordMatchNotice([other], 'Renault')).toEqual({ keyword: 'Renault' })
    // deux employeurs distincts : « Renault Trucks » ne désigne que le second, la liste n'est jamais fusionnée
    const sorted = sortCandidates([other, renault, trucks], 'score', { keyword: 'Renault Trucks' })
    expect(sorted[0]?.siren).toBe('954506077')
    expect(sorted).toHaveLength(3)
    expect(keywordMatchNotice([renault], 'Renault Trucks')).toEqual({ keyword: 'Renault Trucks' })
  })

  it('sans mot-clé, l’ordre est celui du critère, byte-identique', () => {
    expect(sortCandidates([matching, strong], 'score').map(c => c.name)).toEqual(['Alpha', 'Zeta'])
  })

  it('avec un mot-clé, le compte dont un signal le recoupe passe en tête', () => {
    expect(sortCandidates([strong, matching], 'score', { keyword: 'cybersécurité' }).map(c => c.name)).toEqual([
      'Zeta',
      'Alpha',
    ])
  })

  it('le tri alphabétique reste ce qu’il annonce', () => {
    expect(sortCandidates([matching, strong], 'name', { keyword: 'cybersécurité' }).map(c => c.name)).toEqual([
      'Alpha',
      'Zeta',
    ])
  })

  it('dit quand AUCUN signal ne correspond, et se tait sinon', () => {
    expect(keywordMatchNotice([strong], 'cybersécurité')).toEqual({ keyword: 'cybersécurité' })
    expect(keywordMatchNotice([strong, matching], 'cybersécurité')).toBeNull()
    expect(keywordMatchNotice([strong], '  ')).toBeNull()
    expect(keywordMatchNotice([], 'cybersécurité')).toBeNull()
  })

  // #4419 — « java, vue » : la saisie multi-valeurs ne s'affiche plus brute, et une preuve par offre vaut mention.
  it('#4419 — un compte porteur de skillEvidence est « mentionné » : aucun message', () => {
    const found = candidate({
      name: 'Acme',
      signals: [sig(false)],
      skillEvidence: {
        skill: 'java',
        offerCount: 2,
        latestOffer: { title: null, city: null, date: null, url: null, source: null },
      },
    })
    expect(keywordMatchNotice([found, strong], 'java, vue')).toBeNull()
  })

  it('#4419 — un seul terme absent : le message nomme ce terme, pas la chaîne brute', () => {
    const javaShop = candidate({ name: 'Java Factory', siren: '31', signals: [sig(false)] })
    expect(keywordMatchNotice([javaShop, strong], 'java, vue')).toEqual({ keyword: 'vue' })
    expect(keywordMatchNotice([javaShop, strong], 'java; vue')).toEqual({ keyword: 'vue' })
    expect(keywordMatchNotice([strong], 'java, vue')).toEqual({ keyword: 'java, vue' })
  })

  it('#4419 — un terme unique absent : comportement inchangé', () => {
    expect(keywordMatchNotice([strong], ' cybersécurité ')).toEqual({ keyword: 'cybersécurité' })
  })
})

// V4-CORRECTIFS-C 4284.15 — le séparateur se pose sur ce que la CARTE montre : un signal que la carte écarte
// (acte juridique, stage, trop ancien) ne fait pas d'un compte un compte « à signal récent ».
describe('4284.15 — le séparateur précède la première carte sans signal AFFICHÉ', () => {
  const shown = { type: 'hiring' as const, label: 'Développeur Java', date: new Date().toISOString().slice(0, 10) }
  const admin = { type: 'legal' as const, label: 'Modification statutaire', date: shown.date }
  const stale = { type: 'tender' as const, label: 'AO de support', date: '2019-01-01' }

  it('un signal que la carte écarte ne protège pas du séparateur', () => {
    const list = [
      candidate({ name: 'A', siren: '1', score: 10, signals: [shown] }),
      candidate({ name: 'B', siren: '2', score: 99, signals: [admin] }),
      candidate({ name: 'C', siren: '3', score: 98, signals: [stale] }),
    ]
    const sorted = sortCandidates(list, 'score')
    expect(sorted.map(c => c.name)).toEqual(['A', 'C', 'B'])
    expect(lacksShownDatedSignal(list[1]!)).toBe(true)
    expect(lacksShownDatedSignal(list[2]!)).toBe(true)
    expect(undatedSeparatorIndex(sorted)).toBe(1)
  })

  it('sait dire NON : un signal affiché garde son compte au-dessus', () => {
    expect(lacksShownDatedSignal(candidate({ name: 'A', siren: '1', signals: [shown] }))).toBe(false)
  })
})

describe('#3819.9 — « Sans signal récent » en bas', () => {
  const dated = { type: 'hiring' as const, label: 'Recrute', date: '2026-10-01' }
  const detectedOnly = { type: 'legal' as const, label: 'Modif.', date: '2026-09-01', dateIsDetection: true }
  const list = [
    candidate({ name: 'A', siren: '1', score: 40, signals: [dated] }),
    candidate({ name: 'B', siren: '2', score: 90, signals: [detectedOnly] }),
    candidate({ name: 'C', siren: '3', score: 95, signals: [] }),
    candidate({ name: 'D', siren: '4', score: 10, signals: [{ ...dated, type: 'tender' }] }),
  ]

  it('Score : les comptes sans signal daté passent en bas, même mieux notés', () => {
    const sorted = sortCandidates(list, 'score')
    expect(sorted.map(c => c.name)).toEqual(['A', 'D', 'C', 'B'])
    expect(undatedSeparatorIndex(sorted)).toBe(2)
  })

  it('Fraîcheur aussi ; et, depuis le 21/10 (#4284.15), TOUS les autres tris posent le séparateur', () => {
    const sorted = sortCandidates(list, 'signalRecency')
    expect(undatedSeparatorIndex(sorted)).toBe(2)
    // Louis 21/10 RENVERSE #3941.4 (17/10) : Nom, Taille, Intérêt… posent le même séparateur.
    expect(undatedSeparatorIndex(sortCandidates(list, 'name'))).toBe(2)
  })

  it('une date de DÉTECTION seule (même signal commercial) ⇒ sous le séparateur', () => {
    const hiringDetected = { type: 'hiring' as const, label: 'Recrute', date: '2026-10-10', dateIsDetection: true }
    const l = [
      candidate({ name: 'X', siren: '5', score: 99, signals: [hiringDetected] }),
      candidate({ name: 'A', siren: '1', score: 40, signals: [dated] }),
    ]
    for (const sort of ['score', 'signalRecency'] as const) {
      const sorted = sortCandidates(l, sort)
      expect(sorted.map(c => c.name)).toEqual(['A', 'X'])
      expect(undatedSeparatorIndex(sorted)).toBe(1)
    }
  })

  it('aucun séparateur quand tout est daté ou quand rien ne l’est', () => {
    expect(undatedSeparatorIndex([list[0]!, list[3]!])).toBe(-1)
    expect(undatedSeparatorIndex([list[2]!, list[1]!])).toBe(-1)
  })
})

// #4284.15 (Louis 21/10) RENVERSE #3941.4 (17/10) : le séparateur « Sans signal récent » vaut pour TOUS les tris,
// y compris un tri choisi à la main. Le tri choisi garde le reste de son pouvoir (pas de paliers commerciaux).
describe('tri explicite — le séparateur vaut pour tous les tris (21/10)', () => {
  const sig = [{ type: 'tender' as const, label: 'AO en cours', date: '2026-09-01' }]
  const bigNone = candidate({ name: 'Castelnau', siren: '19', headcountRange: '1 000 à 1 999 salariés' })
  const smallSig = candidate({ name: 'Petit', siren: '18', headcountRange: '3 à 5 salariés', signals: sig })

  it('« Taille » choisi : sans signal daté sous le séparateur, l’effectif ordonne dans chaque partie', () => {
    const sorted = sortCandidates([bigNone, smallSig], 'headcount', { explicit: true })
    expect(sorted.map(c => c.name)).toEqual(['Petit', 'Castelnau'])
    expect(undatedSeparatorIndex(sorted)).toBe(1)
  })

  it('« Taille » par défaut (non choisi) : inchangé, sans-signal en dernier', () => {
    expect(sortCandidates([bigNone, smallSig], 'headcount').map(c => c.name)).toEqual(['Petit', 'Castelnau'])
  })

  it('Score choisi : la partition vaut aussi ; le score ordonne dans chaque partie', () => {
    const hi = candidate({ name: 'Haut', siren: '1', score: 95, signals: [] })
    const lo = candidate({ name: 'Bas', siren: '2', score: 10, signals: [{ ...sig[0]!, date: '2026-10-01' }] })
    expect(sortCandidates([hi, lo], 'score', { explicit: true }).map(c => c.name)).toEqual(['Bas', 'Haut'])
  })

  it('un séparateur existe aussi quand le tri est choisi', () => {
    const sorted = sortCandidates([smallSig, bigNone], 'score', { explicit: true })
    expect(undatedSeparatorIndex(sorted)).toBe(1)
  })
})

describe('#4284.15 (#3819.9) — le séparateur « Sans signal récent » précède la PREMIÈRE carte sans signal daté', () => {
  const dated = { type: 'hiring' as const, label: 'Recrute', date: '2026-10-01' }
  const mixed = [
    candidate({ name: 'A', siren: '1', score: 40, signals: [dated] }),
    candidate({ name: 'B', siren: '2', score: 90, signals: [] }),
    candidate({ name: 'C', siren: '3', score: 30, signals: [dated] }),
    candidate({ name: 'D', siren: '4', score: 95, signals: [] }),
  ]

  it('liste mélangée (re-rangée après le tri) : le séparateur est avant la première carte sans signal daté', () => {
    expect(undatedSeparatorIndex(mixed)).toBe(1)
  })

  it('la passe stable remet les comptes datés au-dessus : plus aucune carte sans signal au-dessus du séparateur', () => {
    const fixed = keepUndatedBelow(mixed)
    expect(fixed.map(c => c.name)).toEqual(['A', 'C', 'B', 'D'])
    const at = undatedSeparatorIndex(fixed)
    expect(at).toBe(2)
    expect(fixed.slice(0, at).every(c => !lacksDatedSignal(c))).toBe(true)
  })

  it('sait dire NON : une liste déjà partitionnée reste telle quelle, quel que soit le tri (21/10)', () => {
    const ordered = [mixed[0]!, mixed[2]!, mixed[1]!, mixed[3]!]
    for (const sort of ['score', 'name', 'headcount'] as const)
      expect(keepUndatedBelow(ordered).map(c => c.name)).toEqual(['A', 'C', 'B', 'D'])
  })

  it('tous les tris remettent les comptes datés au-dessus (renverse #3941.4, 21/10)', () => {
    for (const sort of ['name', 'headcount', 'addressability'] as const)
      expect(keepUndatedBelow(mixed).map(c => c.name)).toEqual(['A', 'C', 'B', 'D'])
  })
})

describe('verifiedFirst — lot T point 4 : sans NAF/SIREN en bas, quel que soit le tri', () => {
  const verified = (name: string, headcountRange: string) =>
    candidate({ name, nafCode: '62.02A', headcountRange, signals: [] })
  const unverified = (name: string, headcountRange: string) =>
    candidate({ name, nafCode: null, headcountRange, signals: [] })

  it('sous le tri « Taille (effectif) » choisi, les comptes sans NAF vont après les vérifiés', () => {
    const list = [
      unverified('GROS SANS NAF', '1000 à 1999 salariés'),
      verified('PETIT VERIFIE', '10 à 19 salariés'),
      unverified('MOYEN SANS NAF', '200 à 249 salariés'),
      verified('MOYEN VERIFIE', '100 à 199 salariés'),
    ]
    const sorted = verifiedFirst(sortCandidates(list, 'headcount', { explicit: true }))
    expect(sorted.map(c => c.name)).toEqual(['MOYEN VERIFIE', 'PETIT VERIFIE', 'GROS SANS NAF', 'MOYEN SANS NAF'])
  })

  it('un SIREN vide compte comme non vérifié ; rien n’est retiré', () => {
    const list = [candidate({ name: 'A', siren: '', nafCode: '62.01Z' }), verified('B', '10 à 19 salariés')]
    expect(verifiedFirst(list).map(c => c.name)).toEqual(['B', 'A'])
  })
})
