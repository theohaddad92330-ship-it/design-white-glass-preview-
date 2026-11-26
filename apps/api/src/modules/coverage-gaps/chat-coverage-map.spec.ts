import type { ChatCoverageContactInput } from './chat-coverage-map'
import { computeChatCoverageMap, resolveMarketMemoryRoleFamilies } from './chat-coverage-map'

// #2308.32 — un signal Market Memory "cyber" réel (`Cybersécurité`, l'un des
// alias de `buyer-role-families.ts`), mêlé à du bruit de domaine sans
// correspondance de rôle.
const mmRows: readonly { family: string }[] = [{ family: 'Cybersécurité' }, { family: 'Data / IA' }]

// #2308 (LAU-FINAL-049) — la carte de couverture du CHAT, assemblée à partir
// des MÊMES signaux que `coverage.service.ts` (`decision_role`, `family`,
// `title`, `entity`, `updated_at`) — aucun second calcul, aucune donnée
// inventée (GA-26).

const NOW = new Date('2026-09-22T00:00:00.000Z')

function contact(overrides: Partial<ChatCoverageContactInput> = {}): ChatCoverageContactInput {
  return {
    decision_role: null,
    family: null,
    title: null,
    entity: null,
    seniority: null,
    scope: null,
    updated_at: NOW,
    ...overrides,
  }
}

describe('#2308.7-16 — familles de rôle : les six déjà connues restent classées pareil', () => {
  it('champion/sponsor → sponsor ; economic → décideur économique ; technical → référent technique', () => {
    const map = computeChatCoverageMap(
      'acc-1',
      [
        contact({ decision_role: 'champion', title: 'VP Sales' }),
        contact({ decision_role: 'economic', title: 'CFO' }),
        contact({ decision_role: 'technical', title: 'CTO' }),
      ],
      null,
      NOW,
    )
    const byFamily = new Map(map.role_families.map(f => [f.role_family, f]))
    expect(byFamily.get('sponsor')?.contact_count).toBe(1)
    expect(byFamily.get('sponsor')?.state).toBe('covered_verified')
    expect(byFamily.get('decideur_economique')?.contact_count).toBe(1)
    expect(byFamily.get('referent_technique')?.contact_count).toBe(1)
  })
})

describe('#2308.7 / #2308.8 — opérationnel vs manager, dérivés du niveau N-2 + un mot-clé de titre RÉEL', () => {
  it('N-2 avec un titre de management → "manager"', () => {
    const map = computeChatCoverageMap(
      'acc-1',
      [contact({ title: 'Manager Infrastructure', seniority: 'manager' })],
      null,
      NOW,
    )
    const byFamily = new Map(map.role_families.map(f => [f.role_family, f]))
    expect(byFamily.get('manager')?.contact_count).toBe(1)
    expect(byFamily.get('operationnel')?.contact_count).toBe(0)
  })

  it('N-2 sans mot-clé de management → "opérationnel", jamais deviné "manager"', () => {
    const map = computeChatCoverageMap('acc-1', [contact({ title: 'Développeur', seniority: 'junior' })], null, NOW)
    const byFamily = new Map(map.role_families.map(f => [f.role_family, f]))
    expect(byFamily.get('operationnel')?.contact_count).toBe(1)
    expect(byFamily.get('manager')?.contact_count).toBe(0)
  })
})

describe('#2308.13 — sécurité / conformité, réutilise la famille de DOMAINE "cyber" (jamais un rôle inventé)', () => {
  it('un contact de famille "cyber" compte pour securite_conformite', () => {
    const map = computeChatCoverageMap('acc-1', [contact({ family: 'cyber', title: 'RSSI' })], null, NOW)
    const byFamily = new Map(map.role_families.map(f => [f.role_family, f]))
    expect(byFamily.get('securite_conformite')?.contact_count).toBe(1)
    expect(byFamily.get('securite_conformite')?.state).toBe('covered_verified')
  })
})

describe("#2308.15 — partenaire : AUCUN signal contact aujourd'hui, jamais deviné", () => {
  it('reste "inconnu" quel que soit le jeu de contacts (aucun classificateur ne l\'émet)', () => {
    const map = computeChatCoverageMap(
      'acc-1',
      [contact({ decision_role: 'champion' }), contact({ family: 'cyber' })],
      null,
      NOW,
    )
    const byFamily = new Map(map.role_families.map(f => [f.role_family, f]))
    expect(byFamily.get('partenaire')?.contact_count).toBe(0)
    expect(byFamily.get('partenaire')?.state).toBe('unknown')
  })
})

describe('#2308.3-6 — périmètre : BU/direction/programme/site, classés depuis contact.entity', () => {
  it('classe chaque libellé au bon type, sans jamais deviner un type non reconnu', () => {
    const map = computeChatCoverageMap(
      'acc-1',
      [
        contact({ entity: 'BU Cloud' }),
        contact({ entity: "Direction des Systèmes d'Information" }),
        contact({ entity: 'Programme Transformation' }),
        contact({ entity: 'Site de Lyon' }),
        contact({ entity: 'Filiale Sud' }),
        contact({ entity: 'Acme Corp' }), // libellé non reconnu → repli "filiale" (2308.2, déjà là)
      ],
      null,
      NOW,
    )
    const byType = new Map(map.perimeters.map(p => [p.perimeter_type, p]))
    expect(byType.get('bu')?.contact_count).toBe(1)
    expect(byType.get('bu')?.entity_names).toEqual(['BU Cloud'])
    expect(byType.get('direction')?.contact_count).toBe(1)
    expect(byType.get('programme')?.contact_count).toBe(1)
    expect(byType.get('site')?.contact_count).toBe(1)
    expect(byType.get('filiale')?.contact_count).toBe(2)
  })

  it('"groupe" reflète l\'ensemble du compte (compte = groupe, #2308.1 déjà là), jamais 0 contact sur un compte peuplé', () => {
    const map = computeChatCoverageMap('acc-1', [contact({ entity: 'BU Cloud' })], null, NOW)
    const groupe = map.perimeters.find(p => p.perimeter_type === 'groupe')
    expect(groupe?.contact_count).toBe(1)
    expect(groupe?.state).toBe('covered_verified')
  })
})

describe('#2308.17-24 — étapes commerciales : "relation" et "sponsor identifié" ont un signal RÉEL, le reste reste NOMMÉ "inconnu"', () => {
  it('commercial_status "customer" → relation couverte et vérifiée', () => {
    const map = computeChatCoverageMap('acc-1', [], { commercial_status: 'customer' }, NOW)
    const relation = map.sales_stages.find(s => s.sales_stage === 'relation')
    expect(relation?.state).toBe('covered_verified')
  })

  it('commercial_status "archived" → relation "non pertinente" (compte écarté)', () => {
    const map = computeChatCoverageMap('acc-1', [], { commercial_status: 'archived' }, NOW)
    const relation = map.sales_stages.find(s => s.sales_stage === 'relation')
    expect(relation?.state).toBe('not_relevant')
  })

  it("sponsor_identifie hérite de l'état du rôle sponsor", () => {
    const withSponsor = computeChatCoverageMap('acc-1', [contact({ decision_role: 'sponsor' })], null, NOW)
    expect(withSponsor.sales_stages.find(s => s.sales_stage === 'sponsor_identifie')?.state).toBe('covered_verified')
    const withoutSponsor = computeChatCoverageMap('acc-1', [], null, NOW)
    expect(withoutSponsor.sales_stages.find(s => s.sales_stage === 'sponsor_identifie')?.state).toBe('unknown')
  })

  it('les six autres étapes sans signal câblé restent "inconnu", NOMMÉES, jamais "manquant"', () => {
    const map = computeChatCoverageMap('acc-1', [], null, NOW)
    const uncabled = [
      'terrain_compris',
      'probleme_qualifie',
      'budget_confirme',
      'decision',
      'achat',
      'prochaine_action',
    ]
    const states = Object.fromEntries(
      uncabled.map(stage => [stage, map.sales_stages.find(s => s.sales_stage === stage)?.state]),
    )
    expect(states).toEqual(Object.fromEntries(uncabled.map(stage => [stage, 'unknown'])))
  })
})

describe('#2308.33-43 — les gaps portent une catégorie de priorité et une action cohérente avec la règle #2308.43', () => {
  it('un rôle critique manquant (sponsor) produit un gap "bloque l\'action" avec une action suggérée', () => {
    const map = computeChatCoverageMap('acc-1', [], null, NOW)
    const gap = map.gaps.find(g => g.axis === 'role_family' && g.key === 'sponsor')
    expect(gap?.priority_category).toBe('bloque_action')
    expect(gap?.suggested_action).not.toBeNull()
  })

  it('#2308.43 — le gap "partenaire" (information secondaire) n\'a JAMAIS d\'action suggérée', () => {
    // Tout couvert SAUF "partenaire" (aucun signal contact ne l'émet jamais,
    // #2308.15) : sans ça, les sept gaps "bloque_action" d'un compte VIDE
    // saturent le plafond avant que "partenaire" (information secondaire, la
    // catégorie la moins prioritaire) n'y figure — comportement voulu, pas un
    // bug du test.
    const covered = [
      contact({ decision_role: 'champion' }), // sponsor
      contact({ decision_role: 'economic' }), // decideur_economique
      contact({ decision_role: 'technical' }), // referent_technique
      contact({ decision_role: 'procurement' }), // achats
      contact({ decision_role: 'user' }), // utilisateur
      contact({ decision_role: 'influencer' }), // relais
      contact({ family: 'cyber', title: 'RSSI' }), // securite_conformite
      contact({ title: 'Manager Infrastructure', seniority: 'manager' }), // manager
      contact({ title: 'Développeur', seniority: 'junior' }), // operationnel
      contact({ entity: 'Filiale Sud' }),
      contact({ entity: 'BU Cloud' }),
      contact({ entity: "Direction des Systèmes d'Information" }),
      contact({ entity: 'Programme Transformation' }),
      contact({ entity: 'Site de Lyon' }),
    ]
    const map = computeChatCoverageMap('acc-1', covered, { commercial_status: 'customer' }, NOW)
    const gap = map.gaps.find(g => g.axis === 'role_family' && g.key === 'partenaire')
    expect(gap?.priority_category).toBe('information_secondaire')
    expect(gap?.suggested_action).toBeNull()
  })

  it('#2308.39 (corrigé 23/09/2026) — le gap "filiale" (améliore la confiance) produit désormais l\'action « enrichissement », atteignable pour la première fois', () => {
    // Tous les axes "bloque_action"/"bloque_etape_suivante" câblés sont
    // couverts (sponsor/décideur/référent/achats/utilisateur/relais/
    // opérationnel/manager/BU/direction/programme/site/relation) SAUF
    // "filiale" — aucun contact n'y est classé (`classifyPerimeter` n'y
    // retombe que si `entity` est renseigné et ne matche aucun autre motif ;
    // ici aucun contact ne porte d'entité "filiale"). Avant ce correctif,
    // `suggestGapAction` rendait TOUJOURS `null` pour `ameliore_confiance` —
    // `enrichissement` était la seule action du contrat qu'aucun gap ne
    // pouvait jamais porter, même dans ce cas favorable.
    const covered = [
      contact({ decision_role: 'champion' }), // sponsor
      contact({ decision_role: 'economic' }), // decideur_economique
      contact({ decision_role: 'technical' }), // referent_technique
      contact({ decision_role: 'procurement' }), // achats
      contact({ decision_role: 'user' }), // utilisateur
      contact({ decision_role: 'influencer' }), // relais
      contact({ family: 'cyber', title: 'RSSI' }), // securite_conformite
      contact({ title: 'Manager Infrastructure', seniority: 'manager' }), // manager
      contact({ title: 'Développeur', seniority: 'junior' }), // operationnel
      contact({ entity: 'BU Cloud' }),
      contact({ entity: "Direction des Systèmes d'Information" }),
      contact({ entity: 'Programme Transformation' }),
      contact({ entity: 'Site de Lyon' }),
    ]
    const map = computeChatCoverageMap('acc-1', covered, { commercial_status: 'customer' }, NOW)
    const gap = map.gaps.find(g => g.axis === 'perimeter' && g.key === 'filiale')
    expect(gap?.priority_category).toBe('ameliore_confiance')
    expect(gap?.suggested_action).toBe('enrichissement')
  })

  it('un axe COUVERT ne produit jamais de gap (liste : une absence ne fait aucune ligne)', () => {
    const map = computeChatCoverageMap('acc-1', [contact({ decision_role: 'sponsor' })], null, NOW)
    expect(map.gaps.some(g => g.axis === 'role_family' && g.key === 'sponsor')).toBe(false)
  })

  it('un axe "non pertinent" ne produit jamais de gap (compte archivé)', () => {
    const map = computeChatCoverageMap('acc-1', [], { commercial_status: 'archived' }, NOW)
    expect(map.gaps.some(g => g.axis === 'sales_stage' && g.key === 'relation')).toBe(false)
  })
})

describe('la réponse nomme toujours les trois axes en entier (score jamais nu)', () => {
  it('10 familles de rôle, 6 périmètres, 8 étapes — même sur un compte totalement vide', () => {
    const map = computeChatCoverageMap('acc-1', [], null, NOW)
    expect(map.role_families).toHaveLength(10)
    expect(map.perimeters).toHaveLength(6)
    expect(map.sales_stages).toHaveLength(8)
  })

  it('la phrase de sens est POSITIVE, jamais un fait de marché (GA-259)', () => {
    const map = computeChatCoverageMap('acc-1', [], null, NOW)
    expect(map.meaning.toLowerCase()).not.toContain('externalis')
    expect(map.meaning.length).toBeGreaterThan(10)
  })
})

describe('#2308.32 (corrigé 23/09/2026, réfuté sur la prod 7e7105fb7) — Market Memory câblée dans computeChatCoverageMap', () => {
  it('sans signal Market Memory (comportement par défaut, paramètre omis) : sponsor reste "unknown", jamais élevé', () => {
    const map = computeChatCoverageMap('acc-1', [], null, NOW)
    const sponsor = map.role_families.find(f => f.role_family === 'sponsor')
    expect(sponsor?.state).toBe('unknown')
  })

  it('un signal Market Memory "cyber" élève securite_conformite à "à vérifier", JAMAIS "couvert" (GA-259, #2308.32)', () => {
    // Avant ce correctif, `computeChatCoverageMap` n'acceptait aucun 5e
    // paramètre : `applyMarketMemoryContext` existait, testée, mais aucun
    // appelant ne pouvait jamais lui fournir la moindre famille observée —
    // du code juste, jamais atteint.
    const withoutSignal = computeChatCoverageMap('acc-1', [], null, NOW)
    expect(withoutSignal.role_families.find(f => f.role_family === 'securite_conformite')?.state).toBe('unknown')

    const withSignal = computeChatCoverageMap('acc-1', [], null, NOW, resolveMarketMemoryRoleFamilies(mmRows))
    const secu = withSignal.role_families.find(f => f.role_family === 'securite_conformite')
    expect(secu?.state).toBe('to_verify')
  })

  it('sait dire NON — un vrai contact CYBER reste "couvert", Market Memory ne le DÉGRADE jamais', () => {
    const map = computeChatCoverageMap(
      'acc-1',
      [contact({ family: 'cyber', title: 'RSSI' })],
      null,
      NOW,
      resolveMarketMemoryRoleFamilies(mmRows),
    )
    const secu = map.role_families.find(f => f.role_family === 'securite_conformite')
    expect(secu?.state).toBe('covered_verified')
  })

  it("resolveMarketMemoryRoleFamilies — SEULE securite_conformite a une correspondance ; les neuf autres familles ne reçoivent JAMAIS de signal (rôle de comité d'achat, orthogonal au domaine observé par la mémoire marché)", () => {
    // Vocabulaire RÉEL du corpus mémoire marché (voir market-memory-import.spec.ts) :
    // aucun de ces libellés de DOMAINE ne nomme un rôle de comité d'achat.
    const domainRows = [
      { family: 'Data / IA' },
      { family: 'Infra / Cloud' },
      { family: 'Direction / Conseil' },
      { family: 'Développement' },
      { family: 'PMO' },
      { family: 'Autre' },
    ]
    expect(resolveMarketMemoryRoleFamilies(domainRows)).toEqual(new Set())
    expect(resolveMarketMemoryRoleFamilies(mmRows)).toEqual(new Set(['securite_conformite']))
  })
})
