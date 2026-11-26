import { isToRevalidate } from '@bellum/contracts'
import { BPCE_COMPTE_COMPLET_CSV } from './data/bpce-compte-complet.generated'
import { parseCompteCsvRows } from './compte-csv-parser'
import { BPCE_IMPORT_DATE, DEMO_BPCE_REAL_CONTACTS_COMPANY, bpceCsvBlocCounts, routeBpceRows } from './bpce-csv-mapping'
import { DEMO_DOSSIERS } from './demo-dataset'
import { isNonTechnologyLabel } from './compte-csv-writes'

/**
 * Le compte « Groupe BPCE » (30/09/2026, décision Louis) : CHAQUE ligne du CSV
 * source doit finir quelque part à l'écran — « aucune ligne perdue ».
 */
const rows = parseCompteCsvRows(BPCE_COMPTE_COMPLET_CSV)
const seed = routeBpceRows(rows)

describe('routeBpceRows — aucune ligne du CSV BPCE n’est perdue', () => {
  it('lit le fichier entier : 1 073 lignes, 25 blocs', () => {
    expect(rows).toHaveLength(1073)
    expect(Object.keys(bpceCsvBlocCounts(rows))).toHaveLength(25)
  })

  it('chaque `id` du CSV est consommé par au moins un mappeur — rien n’est écarté en silence', () => {
    expect(seed.unconsumedIds).toEqual([])
    const consumed = new Set(seed.consumedIds)
    const missing = rows.map(row => row.id).filter(id => id && !consumed.has(id))
    expect(missing).toEqual([])
    expect(consumed.size).toBe(1073)
  })

  it('le compteur par bloc égale le nombre de lignes du bloc (25 blocs)', () => {
    const counts = bpceCsvBlocCounts(rows)
    const perBloc: Record<string, number> = {}
    for (const row of rows) {
      if (seed.consumedIds.includes(row.id ?? '')) perBloc[row.bloc ?? ''] = (perBloc[row.bloc ?? ''] ?? 0) + 1
    }
    expect(perBloc).toEqual(counts)
    expect(seed.blocConsumption).toEqual(Object.fromEntries(Object.entries(counts).map(([bloc, n]) => [bloc, n])))
  })

  it('sait dire NON : une ligne d’un bloc inconnu reste « non consommée »', () => {
    const extra = routeBpceRows([...rows.slice(0, 3), { id: 'BPCE-X', bloc: '99_INCONNU', objet: 'x' }])
    expect(extra.unconsumedIds).toEqual(['BPCE-X'])
  })
})

describe('contacts — décision Louis du 30/09/2026 : nommés, coordonnées incluses', () => {
  const byName = (name: string) => seed.contacts.find(contact => contact.full_name === name)

  it('sème les cinq blocs de personnes (459 lignes), homonymes fusionnés, noms uniques', () => {
    const names = seed.contacts.map(contact => contact.full_name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    const personRows = rows.filter(row =>
      [
        '04_GOUVERNANCE',
        '09_CONTACTS_OPERATIONNELS',
        '09B_MANAGERS_OPERATIONNELS_FILIALE_IT',
        '10_PRESTATAIRES_EXTERNES_EN_POSTE',
        '11_PROFILS_AYANT_EXERCE_CHEZ_LE_COMPTE',
      ].includes(row.bloc ?? ''),
    )
    expect(personRows).toHaveLength(459)
    expect(seed.contacts.length).toBe(459 - 6)
  })

  // Recette démo 05/10/2026 — Groupe BPCE : « 0 coordonnées trouvées » à l'entonnoir /contacts alors
  // que la liste porte des e-mails et des téléphones. Le semis posait `detecte` en dur ; l'état
  // persisté bat le calcul, donc l'étape « enrichi » ne comptait personne.
  it('une personne avec e-mail ou téléphone n’est jamais semée « detecte » (entonnoir « coordonnées trouvées »)', () => {
    const withCoordinate = seed.contacts.filter(contact => contact.email || contact.phone)
    expect(withCoordinate.length).toBeGreaterThan(100)
    expect(withCoordinate.filter(contact => contact.lifecycle_state === 'detecte')).toEqual([])
  })

  it('porte email (pro d’abord), téléphone, LinkedIn — et garde les autres coordonnées lisibles', () => {
    const prestataire = byName('fabrice CHANE-ALUNE')
    expect(prestataire).toBeDefined()
    expect(prestataire?.email).toBe('fabrice.chane-alune@bpce-it.fr')
    expect(prestataire?.phone).toBe('+33 1 87 25 40 00')
    expect(prestataire?.linkedin_url).toBe('https://www.linkedin.com/in/fabricechanealune')
    expect(prestataire?.profile_summary).toContain('fabricechane@gmail.com')
    expect(prestataire?.profile_summary).toContain('+33 1 58 40 40 96')
    expect(prestataire?.title).toBe('Chef de projet IT')
    expect(prestataire?.entity).toBe('BPCE Infogérance & Technologies')
    expect(prestataire?.tags).toContain('Prestataire externe')
  })

  it('distingue prestataires externes et anciens du compte, lisible à l’écran (étiquette + texte)', () => {
    const ancien = byName('Ludovic Vieuxloup')
    expect(ancien?.tags).toContain('Ancien du compte')
    expect(ancien?.profile_summary).toContain('Software Engineer')
    expect(seed.contacts.filter(c => c.tags.includes('Prestataire externe')).length).toBeGreaterThanOrEqual(50)
    expect(seed.contacts.filter(c => c.tags.includes('Ancien du compte')).length).toBeGreaterThanOrEqual(40)
  })

  it('la gouvernance (49) est nommée, avec fonction, rôle de décision et priorité', () => {
    const gouvernance = seed.contacts.filter(c => c.tags.includes('Gouvernance'))
    expect(gouvernance.length).toBeGreaterThanOrEqual(48)
    const crespel = byName('Maxime Crespel')
    expect(crespel?.title).toBe('Directeur BPCE Consulting')
    expect(crespel?.decision_role).toBe('influencer')
    // État CALCULÉ (même fonction que la liste) : identité complète + rôle de décision connu, sans
    // coordonnée relevée ⇒ « qualifié » — jamais « identité vérifiée » en dur (recette démo 05/10/2026).
    expect(crespel?.lifecycle_state).toBe('qualifie')
  })

  // Théo A comptes-fiche-reference.N5 — « À revalider » : les 49 identités de gouvernance, et elles seules.
  it('les 49 identités de gouvernance sont « À revalider » (étiquette), les autres personnes non', () => {
    const toRevalidate = seed.contacts.filter(contact => isToRevalidate(contact.tags))
    // 49 lignes de gouvernance ; deux homonymes fusionnés en une seule personne (voir `mergeHomonym`).
    expect(toRevalidate.length).toBeGreaterThanOrEqual(48)
    expect(toRevalidate.length).toBeLessThanOrEqual(49)
    expect(toRevalidate.every(contact => contact.tags.includes('Gouvernance'))).toBe(true)
  })

  it('les managers opérationnels (09B) portent leur téléphone', () => {
    const managers = seed.contacts.filter(c => c.tags.includes('Manager opérationnel'))
    expect(managers).toHaveLength(9)
    expect(managers.every(c => Boolean(c.phone))).toBe(true)
  })

  it('n’invente aucune coordonnée : une ligne sans email n’en reçoit pas', () => {
    const sansEmail = rows.filter(
      row => row.bloc === '09_CONTACTS_OPERATIONNELS' && !row.email && !row.email_pro && !row.telephone && !row.mobile,
    )
    expect(sansEmail.length).toBeGreaterThan(0)
    for (const row of sansEmail) {
      const contact = byName(row.objet ?? '')
      expect(contact?.email ?? null).toBeNull()
      expect(contact?.phone ?? null).toBeNull()
    }
  })
})

describe('autres blocs → ce que le dossier sait porter', () => {
  it('12_ENTITES_JURIDIQUES (276) → entities_exhaustive, et les 15 implantations hors France y sont aussi', () => {
    expect(seed.entitiesExhaustive.length).toBe(276 + 15)
  })

  it('05_SITES : 26 sites en France (ville, coordonnées de la ville), adresses conservées en note', () => {
    expect(seed.sitesFrance).toHaveLength(26)
    expect(seed.sitesFrance.every(site => Boolean(site.city))).toBe(true)
    const note = seed.structuralReadingAxes.find(n => n.label === 'Adresses des sites en France')
    expect(note?.constat).toContain('4 rue de la Haye')
  })

  it('13_PROGRAMMES → program_names (15)', () => {
    expect(seed.programNames).toHaveLength(15)
  })

  it('08_BESOINS_OBSERVES → 17 besoins (la ligne « stack observée » alimente la stack, pas un besoin)', () => {
    expect(seed.pains).toHaveLength(17)
    expect(seed.detectedTechStack.length).toBeGreaterThan(0)
    const monitoring = seed.pains.find(p => p.pain?.includes('Chef de projet Monitoring Risk'))
    expect(monitoring?.pain).toContain('Natixis')
    const cloud = seed.pains.find(p => p.pain?.startsWith('Ingénieur Cloud'))
    expect(cloud?.business_impact).toContain('630 € / jour')
    expect(cloud?.business_impact).toContain('David Leite')
    expect(cloud?.urgency ?? null).toBeNull()
  })

  it('14_HYPOTHESES_DE_BESOIN (60) → pistes, nommées hypothèses', () => {
    expect(seed.itChallenges).toHaveLength(60)
    expect(seed.itChallenges[0]?.description).toContain('Hypothèse commerciale')
  })

  it('08C (11) + 12B (7) → 18 signaux non datés, sourcés sur leur ligne', () => {
    expect(seed.recentSignals).toHaveLength(18)
    for (const signal of seed.recentSignals) {
      expect(signal.source).toContain(BPCE_IMPORT_DATE)
      expect(signal.date ?? null).toBeNull()
      expect(signal.freshness).toBe('undated')
    }
  })

  it('16_DOMAINES_OPPORTUNITE → 14 angles d’attaque, un seul recommandé (rang 1), triés par note', () => {
    expect(seed.attackAngles).toHaveLength(14)
    expect(seed.attackAngles.filter(a => a.is_recommended)).toHaveLength(1)
    expect(seed.attackAngles[0]).toMatchObject({ rank: 1, is_recommended: true })
    expect(seed.attackAngles.map(a => a.rank)).toEqual(seed.attackAngles.map((_, i) => i + 1))
    expect(seed.opportunityDomains).toHaveLength(14)
    expect(seed.opportunityDomains[0]?.constat).toContain('/100')
  })

  it('17_INDICATEURS + 08B → indicateurs ; aucun montant n’est deviné (unité non précisée par la source)', () => {
    expect(seed.financialIndicators).toHaveLength(33 + 9)
    expect(seed.financialIndicators.every(n => n.amount == null)).toBe(true)
    const pnb = seed.financialIndicators.find(n => n.label?.startsWith('Produit net bancaire S1 2026'))
    expect(pnb?.constat).toContain('13 919')
    const prix = seed.financialIndicators.find(n => n.label?.startsWith('Data, réglementaire et BI'))
    expect(prix?.constat).toContain('800 à 850 € par jour')
  })

  it('07_PRESTATAIRES_EN_PLACE (15) → les ESN présentes', () => {
    expect(seed.partners).toHaveLength(15)
    expect(new Set(seed.partners.map(p => p.name.toLowerCase())).size).toBe(15)
  })

  it('02 + 03 → 55 unités d’organigramme ; 06 → 6 étapes de la chaîne d’achats', () => {
    expect(seed.orgUnits).toHaveLength(26 + 29)
    expect(seed.decisionChain.steps).toHaveLength(6)
  })

  it('01, 06B, 10B, 15 → notes de lecture ; 07B → écosystème ; 18 → garde-fous', () => {
    expect(seed.ecosystemThirdParties).toHaveLength(4)
    expect(seed.dataReliabilityNotes).toHaveLength(24)
    expect(seed.structuralReadingAxes.length).toBeGreaterThanOrEqual(15 + 4 + 4 + 2)
  })

  it('15_TECHNOLOGIES → la stack pondérée des profils en poste', () => {
    const sql = seed.technologyStack.find(t => t.name === 'SQL')
    expect(sql?.usage).toContain('62')
  })

  // #3503 — « contenu · présente » : le relevé pondéré écrit « Marketing (29) |
  // contenu (29) » — une étiquette composée DÉJÀ coupée en deux. Un fragment
  // qui ne nomme pas une technologie ne fait AUCUNE pastille.
  it('#3503 — aucun fragment de métier (« contenu », « Marketing », « coaching »…) dans la stack technique', () => {
    const names = seed.technologyStack.map(t => t.name ?? '')
    expect(names.length).toBeGreaterThan(5)
    expect(names.filter(isNonTechnologyLabel)).toEqual([])
    for (const fragment of ['contenu', 'Marketing', 'coaching', 'Formation', 'PMO', 'contrôle', 'transformation']) {
      expect(names).not.toContain(fragment)
    }
  })

  it('#3503 — SAIT DIRE NON : une vraie technologie (SQL, Java, DevOps) garde sa pastille', () => {
    const names = seed.technologyStack.map(t => t.name)
    expect(names).toEqual(expect.arrayContaining(['SQL', 'Java']))
    expect(isNonTechnologyLabel('SQL')).toBe(false)
    expect(isNonTechnologyLabel('DevOps')).toBe(false)
    expect(isNonTechnologyLabel('contenu')).toBe(true)
    expect(isNonTechnologyLabel('Marketing / contenu')).toBe(true)
  })

  it('les faits sont datés du 30/09/2026 (date d’import), jamais du 27/09', () => {
    expect(BPCE_IMPORT_DATE).toBe('30/09/2026')
    expect(JSON.stringify(seed)).not.toContain('27/09/2026')
  })

  it('une piste, un besoin ou un signal ne porte pas deux fois le même libellé (index unique compte/nature/libellé)', () => {
    const pains = seed.pains.map(p => p.pain)
    expect(new Set(pains).size).toBe(pains.length)
    const challenges = seed.itChallenges.map(c => c.title)
    expect(new Set(challenges).size).toBe(challenges.length)
    const signals = seed.recentSignals.map(s => s.signal)
    expect(new Set(signals).size).toBe(signals.length)
    const programs = seed.programNames.map(p => p.name)
    expect(new Set(programs).size).toBe(programs.length)
  })

  it('les annotations des pistes citent leur ligne source', () => {
    expect(seed.needAnnotations.length).toBe(17 + 60 + 18 + 15)
    for (const annotation of seed.needAnnotations) {
      expect(annotation.source).toContain(annotation.csvId)
    }
  })
})

/**
 * #3499 — « le siège c'est mis Strasbourg alors que c'est Paris » (Théo,
 * 01/10/2026). « BPCE SI — Strasbourg » est un SITE de la filiale informatique
 * (bloc 05_SITES), jamais le siège du Groupe BPCE. Le CSV ne porte aucune ligne
 * de siège (BPCE SA, bloc 12, n'a pas de ville) : le siège reste VIDE, donc
 * omis à l'écran — jamais deviné depuis un site.
 */
describe('#3499 — le siège de BPCE ne vient jamais d’une ligne de site', () => {
  const bpce = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === DEMO_BPCE_REAL_CONTACTS_COMPANY)

  it('le dossier BPCE existe (la garde lit quelque chose)', () => {
    expect(bpce).toBeDefined()
    expect(seed.sitesFrance.some(site => site.city === 'Strasbourg')).toBe(true)
  })

  it('SAIT DIRE NON — siège semé ≠ Strasbourg, et aucun site n’est promu siège', () => {
    expect(bpce?.account.headquarters ?? '').not.toMatch(/Strasbourg/i)
    expect(seed.sitesFrance.filter(site => site.is_headquarters)).toEqual([])
  })

  it('sans ligne de siège dans le CSV, le siège reste vide — jamais une ville devinée', () => {
    expect(rows.some(row => /siège|siege/i.test(`${row.bloc ?? ''} ${row.objet ?? ''}`))).toBe(false)
    // Depuis le brief commercial du 01/10/2026 le siège est dit — par le BRIEF (Tours
    // Duo, Paris 13e), jamais par une ligne de site du CSV (« Strasbourg » n'est pas le siège).
    expect(bpce?.account.headquarters).toBe('7 promenade Germaine Sablon, 75013 Paris')
  })
})

describe('BPCE — décideurs (recette R24, 15/10/2026)', () => {
  it('un prescripteur de rang C-level porte le rôle `economic` (badge « Décideur »), un directeur reste `influencer`', () => {
    const president = seed.contacts.find(c => c.title.toLowerCase().includes('président'))
    expect(president?.decision_role).toBe('economic')
    expect(seed.contacts.find(c => c.full_name === 'Maxime Crespel')?.decision_role).toBe('influencer')
    expect(seed.contacts.filter(c => c.decision_role === 'economic').length).toBeGreaterThan(0)
  })
})

describe('#5107.7 — le périmètre d’un partenaire semé se lit, jamais un jeton du CSV', () => {
  const RAW_TOKEN = /\b[A-Za-z]+_[A-Za-z_]+\b/

  it('aucun `scope` ni `note` de partenaire ne porte un jeton brut (ESN_et_conseil, rapporte_par_presse…)', () => {
    expect(seed.partners.length).toBeGreaterThan(0)
    const offenders = seed.partners.filter(p => RAW_TOKEN.test(p.scope) || RAW_TOKEN.test(p.note))
    expect(offenders.map(p => `${p.name} → ${p.scope}`)).toEqual([])
  })

  it('le niveau devient un libellé, la nature de la preuve passe dans la note', () => {
    const sopra = seed.partners.find(p => p.name === 'Sopra Steria')
    expect(sopra?.scope).toBe('ESN et conseil')
    expect(sopra?.note).toContain('Rapporté par la presse.')
  })

  it('sait dire NON : la garde attrape bien un jeton brut', () => {
    expect(RAW_TOKEN.test('ESN_et_conseil — rapporte_par_presse')).toBe(true)
    expect(RAW_TOKEN.test('ESN et conseil')).toBe(false)
  })
})

describe('#5107.7 (famille) — le statut d’une entité juridique se lit', () => {
  it('aucune raison d’entité ne recopie IDENTIFIE_DANS_PERIMETRE_COMPTABLE_2025', () => {
    const reasons = seed.entitiesExhaustive.map(e => e.relevanceReason ?? '')
    expect(reasons.some(r => r.includes('Statut : identifiée dans le périmètre comptable 2025'))).toBe(true)
    expect(reasons.filter(r => /[A-Z]+_[A-Z_]+/.test(r))).toEqual([])
  })
})
