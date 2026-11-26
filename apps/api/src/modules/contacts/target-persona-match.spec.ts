import {
  matchTargetLevel,
  normalizeRoleTitle,
  prepareTargetPersonas,
  titleMatchesFunction,
} from './target-persona-match'

// #3754.3 — rapprochement intitulé du contact ↔ poste cible de l'ESN, sans modèle.
describe('normalizeRoleTitle', () => {
  it('minuscules, accents retirés, ponctuation et « / » en espace', () => {
    expect(normalizeRoleTitle('  Directeur  Systèmes/Réseaux, (IT) ')).toBe('directeur systemes reseaux it')
  })

  it('ramène les alias FR/EN à un même jeton', () => {
    expect(normalizeRoleTitle('Chief Technology Officer')).toBe('cto')
    expect(normalizeRoleTitle('Directeur Technique')).toBe('cto')
    expect(normalizeRoleTitle('CIO')).toBe('cio')
    expect(normalizeRoleTitle('DSI')).toBe('cio')
    expect(normalizeRoleTitle("Directeur des Systèmes d'Information")).toBe('cio')
    expect(normalizeRoleTitle('Vice President Engineering')).toBe('vp engineering')
    expect(normalizeRoleTitle('VP Engineering')).toBe('vp engineering')
  })

  it('retire les mots vides', () => {
    expect(normalizeRoleTitle('Responsable de la Transformation Digitale')).toBe('responsable transformation digitale')
  })
})

describe('matchTargetLevel', () => {
  const prepared = prepareTargetPersonas([
    { title: 'Chief Technology Officer', decision_level: 1 },
    { title: 'VP Tech & Architecture', decision_level: 1 },
    { title: 'Tech Lead', decision_level: 4 },
    { title: 'Directeur Architecture', decision_level: 2 },
    { title: 'Directeur', decision_level: 3 },
  ])

  it('exact après normalisation', () => {
    expect(matchTargetLevel('VP Tech and Architecture', prepared)).toBe(1)
    expect(matchTargetLevel('tech lead', prepared)).toBe(4)
  })

  it('alias FR/EN : « Directeur Technique » rapproche « Chief Technology Officer »', () => {
    expect(matchTargetLevel('Directeur Technique', prepared)).toBe(1)
  })

  it('« CTO / Directeur Architecture » : le meilleur niveau des segments', () => {
    expect(matchTargetLevel('CTO / Directeur Architecture', prepared)).toBe(1)
  })

  it('inclusion de jetons : le poste cible est contenu dans l’intitulé du contact', () => {
    expect(matchTargetLevel('Senior Tech Lead Cloud', prepared)).toBe(4)
  })

  it('un poste cible générique (un seul mot vague) ne rapproche que par égalité', () => {
    expect(matchTargetLevel('Directeur Achats', prepared)).toBeNull()
    expect(matchTargetLevel('Directeur', prepared)).toBe(3)
  })

  it('aucun rapprochement → null, jamais un niveau deviné', () => {
    expect(matchTargetLevel('Responsable Paie', prepared)).toBeNull()
    expect(matchTargetLevel(null, prepared)).toBeNull()
    expect(matchTargetLevel('', prepared)).toBeNull()
  })

  it('#3754.6 — un jeton générique ne suffit jamais : un poste ne rapproche pas un AUTRE poste', () => {
    const commercial = prepareTargetPersonas([
      { title: 'Directeur commercial', decision_level: 1 },
      { title: 'Senior Manager', decision_level: 1 },
    ])
    expect(matchTargetLevel('Directeur des systèmes d’information', commercial)).toBeNull()
    expect(matchTargetLevel('Directeur technique', commercial)).toBeNull()
    expect(matchTargetLevel('Chief Financial Officer', commercial)).toBeNull()
    // Tous les jetons d'un poste « Senior Manager » sont génériques : égalité seulement.
    expect(matchTargetLevel('Senior Manager Cloud', commercial)).toBeNull()
    expect(matchTargetLevel('Senior Manager', commercial)).toBe(1)
    expect(matchTargetLevel('Directeur commercial grands comptes', commercial)).toBe(1)
  })

  it('#3754.6 — un poste cible à un seul jeton (DSI, CTO) ne rapproche que par égalité', () => {
    const si = prepareTargetPersonas([
      { title: 'Directeur des systèmes d’information', decision_level: 1 },
      { title: 'Directeur technique', decision_level: 1 },
    ])
    expect(matchTargetLevel('DSI', si)).toBe(1)
    expect(matchTargetLevel('Dsi Décisionnel et Data', si)).toBeNull()
    expect(matchTargetLevel('Directeur Technique Collectives', si)).toBeNull()
    // Qualificatif de périmètre groupe/group/france : même poste.
    expect(matchTargetLevel('DSI Group', si)).toBe(1)
    expect(matchTargetLevel('Directeur technique France', si)).toBe(1)
    // Un autre périmètre reste un autre poste.
    expect(matchTargetLevel('DSI Banque de détail', si)).toBeNull()
  })

  it('#3754.6 — un adjoint / assistant ne prend jamais le niveau du poste qu’il assiste', () => {
    const personas = prepareTargetPersonas([
      { title: 'DSI', decision_level: 1 },
      { title: 'Directeur de la transformation digitale', decision_level: 2 },
    ])
    expect(matchTargetLevel('Adjoint au DSI', personas)).toBeNull()
    expect(matchTargetLevel('Assistante du DSI', personas)).toBeNull()
    expect(matchTargetLevel('Deputy CIO', personas)).toBeNull()
    expect(matchTargetLevel('Adjoint au directeur de la transformation digitale', personas)).toBeNull()
    expect(matchTargetLevel('Directeur de la transformation digitale groupe', personas)).toBe(2)
  })

  it('sans postes cibles → toujours null', () => {
    expect(matchTargetLevel('CTO', prepareTargetPersonas([]))).toBeNull()
  })
})

// #2533 (recette prod 07/10, UNEO) — « qui contacter à la DSI de X ».
describe('titleMatchesFunction', () => {
  it('« DSI » reconnaît la Directrice des Systèmes d’information', () => {
    expect(titleMatchesFunction("Directrice des Systèmes d'information", 'DSI')).toBe(true)
    expect(titleMatchesFunction('CIO Groupe', 'DSI')).toBe(true)
  })

  it('« la DSI » attrape aussi ses membres', () => {
    expect(titleMatchesFunction('Chef de projet SI', 'DSI')).toBe(true)
    expect(titleMatchesFunction('Responsable informatique', 'DSI')).toBe(true)
  })

  it('sait dire NON : une autre fonction ne rapproche pas', () => {
    expect(titleMatchesFunction('Directeur administratif et financier', 'DSI')).toBe(false)
    expect(titleMatchesFunction('Chargé de mission', 'Directeur des achats')).toBe(false)
    expect(titleMatchesFunction(null, 'DSI')).toBe(false)
  })

  it('une fonction plurijeton exige tous ses jetons', () => {
    expect(titleMatchesFunction('Directeur des achats Europe', 'Directeur des achats')).toBe(true)
    expect(titleMatchesFunction('Directeur commercial', 'Directeur des achats')).toBe(false)
  })

  // #4058 (recette R8a, 14/10) — « interlocuteurs cyber GRC de EDF » : le RSSI
  // déjà en base n'était jamais retrouvé par la fonction « cyber » (aucun
  // alias ne la rapprochait d'un intitulé de poste), alors que la fiche EDF
  // le liste dans « Contacts proches ». `get_account_contacts` doit lire les
  // contacts déjà en base AVANT toute recherche externe.
  it('#4058 — une EXPERTISE (« cyber », « GRC ») rapproche aussi les intitulés qui la portent', () => {
    expect(titleMatchesFunction('RSSI', 'cyber')).toBe(true)
    expect(titleMatchesFunction('Responsable sécurité informatique', 'cybersécurité')).toBe(true)
    expect(titleMatchesFunction('Risk manager', 'GRC')).toBe(true)
    expect(titleMatchesFunction('Directeur des risques', 'gouvernance, risque et conformité')).toBe(true)
  })

  it('#4058 — une expertise reconnue ne rapproche jamais un intitulé hors catalogue', () => {
    expect(titleMatchesFunction('Directeur commercial', 'cyber')).toBe(false)
    expect(titleMatchesFunction(null, 'cyber')).toBe(false)
  })
})
