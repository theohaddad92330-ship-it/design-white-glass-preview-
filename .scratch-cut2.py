B='apps/api/src/modules/demo/'
def edit(f, pairs):
    p=B+f if not f.startswith('apps/') else f
    s=open(p).read()
    for a,b in pairs:
        assert a in s,(f,a[:80])
        s=s.replace(a,b)
    open(p,'w').write(s)

edit('demo-scripts.ts',[
("""      // #2166.11 — NAF EXACTEMENT celui de Decathlon (démo-dataset.ts,
      // `decathlonDossier`) : c'est ce qui permet à `similarityHeadline`
      // ci-dessous d'être une référence VRAIE, pas un texte de secteur libre —
      // même précision que `resolveSimilarityHeadlines`
      // (discover-portfolio.service.ts).
      nafCode: '47.64Z',
      // #2166.11 — LA RÉFÉRENCE COMPARABLE (craft rule n°9) : ce candidat NEUF
      // partage le NAF exact d'un compte du portefeuille de démonstration.
      similarityHeadline: { kind: 'sector', referenceAccount: 'Decathlon' },
""","""      // Retrait des quatre comptes non cibles (01/10/2026) : plus aucun
      // compte du portefeuille ne partage ce NAF, donc ce candidat ne porte
      // PLUS de `similarityHeadline` (jamais une référence devinée). La
      // référence comparable est re-semée sur Marenval Financement (démo),
      // qui partage le NAF exact de Société Générale.
      nafCode: '47.11F',
"""),
("""    candidate({
      name: 'Pharmatek Santé (démo)',""","""    candidate({
      name: 'Marenval Financement (démo)',
      sector: 'Services financiers — financement spécialisé',
      city: 'Nantes',
      department: '44',
      headcountRange: '1 000 à 1 999 salariés',
      // #2166.11 — LA RÉFÉRENCE COMPARABLE (craft rule n°9, re-semée le
      // 01/10/2026) : NAF EXACTEMENT celui de Société Générale
      // (`societeGeneraleDossier`, 64.19Z), ce qui rend `similarityHeadline`
      // VRAIE, pas un texte de secteur libre — même précision que
      // `resolveSimilarityHeadlines` (discover-portfolio.service.ts).
      nafCode: '64.19Z',
      similarityHeadline: { kind: 'sector', referenceAccount: 'Société Générale' },
      signals: [
        { type: 'legal', label: 'Réorganisation des filiales de financement annoncée', date: '2026-06-02' },
      ],
      factors: [{ label: 'Secteur comparable à un compte analysé', points: 10, evidence: 'Même code d’activité (64.19Z)' }],
      angle: 'Ouvrir par la réorganisation annoncée, avant que les budgets de filiale ne soient arbitrés.',
      roles: [{ title: 'Directeur des systèmes d’information', department: 'DSI' }],
      people: [],
    }),
    candidate({
      name: 'Pharmatek Santé (démo)',"""),
])
edit('demo-discover-similarity-headline-coverage.spec.ts',[
("""  it('un candidat NEUF nomme Decathlon, avec le même NAF exact', () => {""","""  it('un candidat NEUF nomme Société Générale, avec le même NAF exact', () => {"""),
("""    const verdal = parsed.candidates.find(c => c.name === 'Verdal Distribution (démo)')
    expect(verdal?.portfolioState).toBe('new')
    expect(verdal?.nafCode).toBe('47.64Z')
    expect(verdal?.similarityHeadline).toEqual({ kind: 'sector', referenceAccount: 'Decathlon' })""","""    const marenval = parsed.candidates.find(c => c.name === 'Marenval Financement (démo)')
    expect(marenval?.portfolioState).toBe('new')
    expect(marenval?.nafCode).toBe('64.19Z')
    expect(marenval?.similarityHeadline).toEqual({ kind: 'sector', referenceAccount: 'Société Générale' })"""),
])
edit('demo-coverage.ts',[
("""Verdal Distribution (démo) porte le NAF EXACT de Decathlon (`47.64Z`, `decathlonDossier` dans `demo-dataset.ts`) et `similarityHeadline: { kind: 'sector', referenceAccount: 'Decathlon' }`""","""Marenval Financement (démo, re-semée le 01/10/2026 après le retrait de Decathlon) porte le NAF EXACT de Société Générale (`64.19Z`, `societeGeneraleDossier` dans `demo-dataset.ts`) et `similarityHeadline: { kind: 'sector', referenceAccount: 'Société Générale' }`"""),
("""comme Verdal l'est déjà pour `DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE`. Vérifié par `demo-discover-similarity""","""comme Verdal l'est pour `DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE`. Vérifié par `demo-discover-similarity"""),
("""  // Générale, Thales, SNCF, Decathlon, BlaBlaCar, leboncoin) sont de VRAIES""","""  // Générale, Groupe BPCE, SNCF) sont de VRAIES"""),
])
edit('demo-scripts.spec.ts',[
("""les huit candidats survivent""","""les neuf candidats survivent"""),
("""    expect(parsed.candidates).toHaveLength(8)
  })

""","""    expect(parsed.candidates).toHaveLength(9)
  })

"""),
("""        'Grande distribution & retail',
        'Industrie — équipements électromécaniques',
        'Santé & médico-social',
      ],""","""        'Grande distribution & retail',
        'Industrie — équipements électromécaniques',
        'Santé & médico-social',
        'Services financiers — financement spécialisé',
      ],"""),
("excludedCount: 4,","excludedCount: 5,"),
("""    expect(parsed.candidates).toHaveLength(8)
    expect(parsed.targetSectorFilter).toEqual({ applied: false""","""    expect(parsed.candidates).toHaveLength(9)
    expect(parsed.targetSectorFilter).toEqual({ applied: false"""),
("""includeOutOfTarget: true })).candidates).toHaveLength(8)""","""includeOutOfTarget: true })).candidates).toHaveLength(9)"""),
("""      'Pharmatek Santé (démo)',
      'Aubrac Aerostructures (démo)',""","""      'Marenval Financement (démo)',
      'Pharmatek Santé (démo)',
      'Aubrac Aerostructures (démo)',""") if False else ("a","a"),
])
print('ok')
