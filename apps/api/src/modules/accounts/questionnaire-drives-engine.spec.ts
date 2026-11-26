import type { AnalysisProfileData, CompanySuggestion } from '@bellum/contracts'
import { SIMILARITY_AXES_REQUIRED } from '@bellum/contracts'
import { decisiveSignalKinds, orderSignalsByDecisiveKinds } from './signal-relevance'
import {
  evaluableSimilarityAxes,
  isNoGoCandidate,
  matchSimilarCandidate,
  rankSimilarCandidates,
} from './similar-scoring'

/**
 * #2040.15 / #2040.17 / #2040.18 — LE QUESTIONNAIRE ENTRE DANS LE MOTEUR.
 *
 * Les trois derniers points de #2040 demandent la même chose sous trois angles :
 * que ce qu'un commercial répond à l'onboarding CHANGE ce que le produit lui
 * sert. Jusqu'ici, `no_go_sectors`, `staffing_modes` et `recruits_for_clients`
 * voyageaient jusqu'aux prompts et s'arrêtaient là ; le classement des comptes
 * et la Veille étaient les mêmes pour deux ESN aux métiers opposés.
 *
 * Ce que cette garde tient :
 *  - #2040.15 — deux jeux de réponses rendent deux JEUX de comptes (exclusion),
 *    pas deux ordres du même jeu ;
 *  - #2040.17 — deux jeux de réponses rendent deux LISTES de signaux ;
 *  - #2040.18 — aucun score n'est publié nu : ses axes sont nommés, ce qui n'a
 *    pas pu être évalué est nommé, et sous trois axes évalués il n'y a pas de
 *    score du tout.
 *
 * Chaque bloc porte ses trois preuves : elle sait dire NON (la valeur attendue
 * bascule quand le comportement disparaît), elle LIT un corpus dont le compte
 * est affirmé, et elle laisse passer un voisin légitime (témoin).
 */

/** Candidat de découverte — la forme semée par NAF (seed = jeton de division). */
function candidate(overrides: Partial<CompanySuggestion> = {}, seed = 'construction') {
  const suggestion: CompanySuggestion = {
    name: 'ACME',
    siren: '123456789',
    city: 'Paris',
    sector: 'Construction de bâtiments résidentiels',
    ...overrides,
  }
  return { suggestion, seed }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  #2040.15 — les réponses modifient le MATCHING                             */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('#2040.15 — un secteur refusé au questionnaire sort du jeu de comptes', () => {
  const CORPUS = [
    candidate({ name: 'BTP DU NORD', siren: '1', sector: 'Construction de bâtiments résidentiels' }, 'construction'),
    candidate({ name: 'SOFTWARE ONE', siren: '2', sector: 'Programmation informatique' }, 'informatique'),
    candidate({ name: 'BATI SUD', siren: '3', sector: 'Travaux de construction spécialisés' }, 'construction'),
  ]

  it('LIT un corpus non vide — trois candidats, deux secteurs distincts', () => {
    expect(CORPUS).toHaveLength(3)
    expect(new Set(CORPUS.map(item => item.seed)).size).toBe(2)
  })

  it('deux jeux de réponses rendent deux JEUX de comptes, pas deux ordres du même jeu', () => {
    const sansRefus: AnalysisProfileData = { sectors: ['BTP & Construction'] }
    const avecRefus: AnalysisProfileData = { sectors: ['BTP & Construction'], noGoSectors: ['BTP & Construction'] }

    const jeuA = rankSimilarCandidates(CORPUS, sansRefus).map(item => item.suggestion.name)
    const jeuB = rankSimilarCandidates(CORPUS, avecRefus).map(item => item.suggestion.name)

    // Le jeu A porte les trois ; le jeu B n'en porte qu'un — c'est une
    // DIFFÉRENCE D'ENSEMBLE, la preuve que le point demande.
    expect(jeuA.sort()).toEqual(['BATI SUD', 'BTP DU NORD', 'SOFTWARE ONE'])
    expect(jeuB).toEqual(['SOFTWARE ONE'])
    expect(new Set(jeuA)).not.toEqual(new Set(jeuB))
  })

  it('sait dire NON — le candidat refusé est bien reconnu comme refusé', () => {
    const profile: AnalysisProfileData = { noGoSectors: ['BTP & Construction'] }
    expect(isNoGoCandidate(CORPUS[0]!, profile)).toBe(true)
    expect(isNoGoCandidate(CORPUS[2]!, profile)).toBe(true)
  })

  it('témoin — un secteur qui n’est PAS refusé traverse le filtre intact', () => {
    const profile: AnalysisProfileData = { noGoSectors: ['BTP & Construction'] }
    expect(isNoGoCandidate(CORPUS[1]!, profile)).toBe(false)
  })

  it('témoin — questionnaire muet sur les refus : la liste est celle d’avant, entière', () => {
    const rendus = rankSimilarCandidates(CORPUS, {}).map(item => item.suggestion.name)
    expect(rendus).toEqual(['BTP DU NORD', 'SOFTWARE ONE', 'BATI SUD'])
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  #2040.17 — les réponses modifient la NATURE des signaux                   */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('#2040.17 — les réponses désignent les natures de signal décisives', () => {
  const VEILLE = [
    { label: 'Levée de 40 M€', type: 'budget' },
    { label: 'Rachat de Nexio', type: 'acquisition' },
    { label: 'Quinze postes ouverts en data', type: 'recrutement' },
    { label: 'Refonte du SI RH annoncée', type: 'projet' },
    { label: 'Alliance avec Atos', type: 'partenariat' },
  ]

  it('LIT un corpus non vide — cinq signaux, cinq natures distinctes', () => {
    expect(VEILLE).toHaveLength(5)
    expect(new Set(VEILLE.map(item => item.type)).size).toBe(5)
  })

  it('deux jeux de réponses rendent deux LISTES de signaux', () => {
    const placeur: AnalysisProfileData = { recruitsForClients: true }
    const partenarial: AnalysisProfileData = { staffingModes: ['Sous-traitance', 'Partenaires'] }

    const listePlaceur = orderSignalsByDecisiveKinds(VEILLE, decisiveSignalKinds(placeur)).map(item => item.label)
    const listePartenariale = orderSignalsByDecisiveKinds(VEILLE, decisiveSignalKinds(partenarial)).map(
      item => item.label,
    )

    expect(listePlaceur[0]).toBe('Quinze postes ouverts en data')
    expect(listePartenariale[0]).toBe('Alliance avec Atos')
    expect(listePlaceur).not.toEqual(listePartenariale)
    // Rien n'est retiré : les deux listes portent les cinq signaux.
    expect(listePlaceur.sort()).toEqual(listePartenariale.sort())
  })

  it('sait dire NON — « recrutement après besoin » ouvre bien recrutement ET projet', () => {
    expect(decisiveSignalKinds({ staffingModes: ['Recrutement après besoin'] })).toEqual(['recrutement', 'projet'])
  })

  it('témoin — questionnaire muet : aucune nature décisive, ordre inchangé', () => {
    expect(decisiveSignalKinds({})).toEqual([])
    expect(orderSignalsByDecisiveKinds(VEILLE, []).map(item => item.label)).toEqual(VEILLE.map(item => item.label))
  })

  it('témoin — un mode de staffing inconnu n’ouvre aucune nature (rien d’inventé)', () => {
    expect(decisiveSignalKinds({ staffingModes: ['Portage salarial de luxe'] })).toEqual([])
  })

  it('témoin — un signal sans nature reste dans la liste, derrière, jamais remonté', () => {
    const avecMuet = [{ label: 'Bruit', type: null }, ...VEILLE]
    const ordonne = orderSignalsByDecisiveKinds(avecMuet, decisiveSignalKinds({ recruitsForClients: true }))
    expect(ordonne.map(item => item.label)).toContain('Bruit')
    expect(ordonne[0]?.label).toBe('Quinze postes ouverts en data')
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  #2040.18 — les réponses modifient le SCORING, et le score n'est jamais nu  */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('#2040.18 — un score n’est jamais nu : ses axes, et ce qui n’a pas pu être évalué', () => {
  it('LIT un corpus non vide — les trois axes du rapprochement sont nommés', () => {
    const complet: AnalysisProfileData = {
      sectors: ['Assurance & Mutuelles'],
      geoZone: 'Lyon & Auvergne-Rhône-Alpes',
      targetCompanyTypes: ['ETI (500-5 000 salariés)'],
    }
    expect(evaluableSimilarityAxes(complet)).toEqual(['sector', 'geo', 'size'])
    expect(evaluableSimilarityAxes(complet)).toHaveLength(SIMILARITY_AXES_REQUIRED)
  })

  it('trois axes évaluables ⇒ confiance « etayee », rien à nommer en creux', () => {
    const match = matchSimilarCandidate(candidate({ sector: 'Assurance', postal_code: '38000' }, 'assurance'), {
      sectors: ['Assurance & Mutuelles'],
      geoZone: 'Lyon & Auvergne-Rhône-Alpes',
      targetCompanyTypes: ['ETI (500-5 000 salariés)'],
    })
    expect(match.confidence).toBe('etayee')
    expect(match.unevaluated).toEqual([])
  })

  it('sait dire NON — un seul axe répondu ⇒ « partielle », et les deux axes muets sont NOMMÉS', () => {
    const match = matchSimilarCandidate(candidate({ sector: 'Assurance' }, 'assurance'), {
      sectors: ['Assurance & Mutuelles'],
    })
    expect(match.confidence).toBe('partielle')
    // « on ne t'a pas demandé » se dit ; « ça ne matche pas » serait faux.
    expect(match.unevaluated).toEqual(['geo', 'size'])
    // Le critère matché reste nommé — la carte n'est jamais muette.
    expect(match.reasons).toEqual(['sector'])
  })

  it('témoin — questionnaire entièrement muet ⇒ « non_etayee », les trois axes nommés', () => {
    const match = matchSimilarCandidate(candidate(), {})
    expect(match.confidence).toBe('non_etayee')
    expect(match.unevaluated).toEqual(['sector', 'geo', 'size'])
    expect(match.reasons).toEqual([])
  })

  it('témoin — un axe muet ne RETIRE rien au score brut : il n’ajoute simplement rien', () => {
    // Le même candidat, jugé sur un profil à un axe puis sur un profil à trois :
    // le score du seul axe commun est identique — « non mesuré » n'est pas « 0 ».
    const suggestion = candidate({ sector: 'Assurance' }, 'assurance')
    const unAxe = matchSimilarCandidate(suggestion, { sectors: ['Assurance & Mutuelles'] })
    const troisAxes = matchSimilarCandidate(suggestion, {
      sectors: ['Assurance & Mutuelles'],
      geoZone: 'Lille & Hauts-de-France',
      targetCompanyTypes: ['ETI (500-5 000 salariés)'],
    })
    expect(unAxe.score).toBe(troisAxes.score)
    expect(unAxe.confidence).not.toBe(troisAxes.confidence)
  })
})
