import { describe, expect, it } from 'vitest'

/**
 * #2125.35-.67 — « Actualiser l'analyse » dit ce qu'il va faire AVANT, et ce
 * qu'il a changé APRÈS.
 *
 * Tout ce qui est vérifié ici est une règle du dépôt appliquée au
 * rafraîchissement, pas une invention de ce lot :
 *  · le coût s'annonce avant le clic crédité, et un coût inconnu se dit « non
 *    mesuré », jamais « 0 » (GA-49 / GA-86, GA-18 / GA-19) ;
 *  · une correction humaine gagne toujours — la décision passe par
 *    `decideFieldWrite`, jamais par un second arbitre (GA-26) ;
 *  · on archive, on ne supprime pas : un fait périmé redevient INCONNU AVEC SA
 *    DATE ;
 *  · un timeout n'est pas un échec : `unknown` arrête la reprise.
 */
describe('modes de rafraîchissement (#2125.42)', () => {
  it('« l’organisation » ne relit que l’organigramme et les contacts', async () => {
    const { REFRESH_MODE_DIMENSIONS } = await import('./refresh-explained.js')
    expect([...REFRESH_MODE_DIMENSIONS.organisation].sort()).toEqual(['contacts', 'entities'])
  })

  it('le mode complet relit les quatre axes', async () => {
    const { REFRESH_MODE_DIMENSIONS } = await import('./refresh-explained.js')
    const { refreshDimensionSchema } = await import('./analysis.js')
    expect([...REFRESH_MODE_DIMENSIONS.full].sort()).toEqual([...refreshDimensionSchema.options].sort())
  })

  it('le coût de « l’organisation » est la SOMME de la grille de ses axes, jamais un prix écrit à la main', async () => {
    const { refreshModeCost } = await import('./refresh-explained.js')
    const { REFRESH_DIMENSION_CREDIT_COST } = await import('./analysis.js')
    const expected = REFRESH_DIMENSION_CREDIT_COST.entities + REFRESH_DIMENSION_CREDIT_COST.contacts
    expect(refreshModeCost('organisation', { fullAnalysisCredits: 8 })).toEqual({ measured: true, credits: expected })
  })

  it('le coût du mode complet est celui que le serveur annonce', async () => {
    const { refreshModeCost } = await import('./refresh-explained.js')
    expect(refreshModeCost('full', { fullAnalysisCredits: 8 })).toEqual({ measured: true, credits: 8 })
  })

  it('un coût que le serveur n’a pas rendu se dit « non mesuré », jamais 0 (GA-18)', async () => {
    const { refreshModeCost } = await import('./refresh-explained.js')
    expect(refreshModeCost('full', { fullAnalysisCredits: null })).toEqual({ measured: false })
    expect(refreshModeCost('full', { fullAnalysisCredits: Number.NaN })).toEqual({ measured: false })
  })
})

describe('le mini-plan, AVANT la confirmation (#2125.35-.38, .46, .49)', () => {
  const NOW = new Date('2026-09-15T10:00:00.000Z')

  it('dit ce qui est ANCIEN avec sa date, ce qui sera relu, conservé, et ce qui pourrait changer', async () => {
    const { buildRefreshPlan } = await import('./refresh-explained.js')
    const plan = buildRefreshPlan({
      mode: 'full',
      fullAnalysisCredits: 8,
      now: NOW,
      freshness: {
        signals: '2026-03-02T09:00:00.000Z',
        contacts: '2026-09-15T08:00:00.000Z',
        entities: null,
        strategy: '2026-03-02T09:00:00.000Z',
      },
    })

    expect(plan.aged).toContainEqual({ dimension: 'signals', measuredAt: '2026-03-02T09:00:00.000Z' })
    // Jamais relu ≠ ancien de zéro jour : la date est INCONNUE, et elle le reste.
    expect(plan.aged).toContainEqual({ dimension: 'entities', measuredAt: null })
    // Relu il y a deux heures : ce n'est pas « ancien ».
    expect(plan.aged.map(entry => entry.dimension)).not.toContain('contacts')

    // #2318.2 — le mode `full` DÉRIVE de `refreshDimensionSchema.options`
    // (GA-26) : les six alias produit y entrent avec les quatre phases.
    expect([...plan.reread].sort()).toEqual([
      'buying_path',
      'contacts',
      'ecosystem',
      'entities',
      'identity_group',
      'positions',
      'projects',
      'signals',
      'strategy',
      'subsidiaries',
    ])
    expect(plan.mayChange).toContain('facts')
    expect(plan.mayChange).toContain('org_chart')
    expect(plan.cost).toEqual({ measured: true, credits: 8 })
  })

  it('le mode « l’organisation » ne promet de relire QUE ses deux axes', async () => {
    const { buildRefreshPlan } = await import('./refresh-explained.js')
    const plan = buildRefreshPlan({ mode: 'organisation', fullAnalysisCredits: 8, now: NOW, freshness: {} })
    expect([...plan.reread].sort()).toEqual(['contacts', 'entities'])
    expect(plan.mayChange).not.toContain('actions')
  })

  it('porte la règle de remboursement, et les quatre choses qu’il ne touchera pas', async () => {
    const { buildRefreshPlan, REFRESH_NEVER_OVERWRITES } = await import('./refresh-explained.js')
    const plan = buildRefreshPlan({ mode: 'full', fullAnalysisCredits: 8, now: NOW, freshness: {} })
    expect(plan.refund).toBe('refunded_if_failed')
    expect([...plan.preserved].sort()).toEqual([...REFRESH_NEVER_OVERWRITES].sort())
  })
})

describe('ce que le rafraîchissement n’écrase JAMAIS (#2125.58-.61)', () => {
  it('nomme exactement la note privée, l’action validée, la preuve et la relation déclarée', async () => {
    const { REFRESH_NEVER_OVERWRITES } = await import('./refresh-explained.js')
    expect([...REFRESH_NEVER_OVERWRITES].sort()).toEqual([
      'declared_relation',
      'evidence',
      'private_note',
      'validated_action',
    ])
  })

  it.each(['private_note', 'validated_action', 'evidence', 'declared_relation'] as const)(
    'un patch de pipeline qui vise « %s » est refusé',
    async kind => {
      const { refreshMayOverwrite } = await import('./refresh-explained.js')
      expect(refreshMayOverwrite(kind)).toBe(false)
    },
  )

  it('laisse écrire ce qui n’est pas protégé', async () => {
    const { refreshMayOverwrite } = await import('./refresh-explained.js')
    expect(refreshMayOverwrite('signal')).toBe(true)
  })
})

describe('le diff, APRÈS le retour (#2125.50-.56)', () => {
  const before = [
    { kind: 'fact', key: 'effectif', label: 'Effectif', value: '1200', measuredAt: '2026-03-02T09:00:00.000Z' },
    { kind: 'fact', key: 'ca', label: "Chiffre d'affaires", value: '90 M€', measuredAt: '2026-03-02T09:00:00.000Z' },
    {
      kind: 'fact',
      key: 'siege',
      label: 'Siège',
      value: 'Lyon',
      source: 'human',
      measuredAt: '2026-04-01T09:00:00.000Z',
    },
    { kind: 'recommendation', key: 'angle-data', label: 'Angle data', value: 'priorité 2' },
    { kind: 'action', key: 'relance-dsi', label: 'Relancer le DSI', value: 'à faire' },
  ] as const

  const after = [
    { kind: 'fact', key: 'effectif', label: 'Effectif', value: '1450', measuredAt: '2026-09-15T09:00:00.000Z' },
    {
      kind: 'fact',
      key: 'cto',
      label: 'Directeur technique',
      value: 'A. Morel',
      measuredAt: '2026-09-15T09:00:00.000Z',
    },
    {
      kind: 'fact',
      key: 'siege',
      label: 'Siège',
      value: 'Paris',
      source: 'pipeline',
      measuredAt: '2026-09-15T09:00:00.000Z',
    },
    { kind: 'recommendation', key: 'angle-data', label: 'Angle data', value: 'priorité 1' },
  ] as const

  it('sépare nouveaux faits, faits modifiés et faits devenus obsolètes', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({ before: [...before], after: [...after] })

    expect(diff.newFacts.map(f => f.key)).toEqual(['cto'])
    expect(diff.changedFacts).toContainEqual(
      expect.objectContaining({ key: 'effectif', before: '1200', after: '1450' }),
    )
    expect(diff.obsoleteFacts.map(f => f.key)).toEqual(['ca'])
  })

  it('un fait devenu obsolète redevient INCONNU AVEC SA DATE — il ne disparaît pas', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({ before: [...before], after: [...after] })
    expect(diff.obsoleteFacts[0]).toEqual(
      expect.objectContaining({ key: 'ca', lastKnownValue: '90 M€', lastSeenAt: '2026-03-02T09:00:00.000Z' }),
    )
  })

  it('une correction utilisateur est CONSERVÉE, et la décision passe par decideFieldWrite', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({ before: [...before], after: [...after] })
    expect(diff.preservedCorrections).toContainEqual(
      expect.objectContaining({ key: 'siege', keptValue: 'Lyon', discardedValue: 'Paris' }),
    )
    // …et surtout : elle n'est ni dans les faits modifiés, ni dans les obsolètes.
    expect(diff.changedFacts.map(f => f.key)).not.toContain('siege')
    expect(diff.obsoleteFacts.map(f => f.key)).not.toContain('siege')
  })

  it('une correction utilisateur que la collecte ne revoit plus reste CONSERVÉE, jamais obsolète', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [...before],
      after: [...after].filter(item => item.key !== 'siege'),
    })
    expect(diff.obsoleteFacts.map(f => f.key)).not.toContain('siege')
    expect(diff.preservedCorrections).toContainEqual(
      expect.objectContaining({ key: 'siege', keptValue: 'Lyon', discardedValue: null }),
    )
  })

  it('une correction utilisateur que le run a relue SANS la toucher est listée comme conservée', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    // Le pipeline a bien relu le siège et a rendu la MÊME valeur que la
    // correction : rien n'a été écrasé, et c'est précisément ce qu'il faut dire
    // — sinon l'utilisateur ne sait pas que sa correction a survécu au run.
    const diff = buildRefreshDiff({
      before: [...before],
      after: [...after].map(item => (item.key === 'siege' ? { ...item, value: 'Lyon' } : item)),
    })
    expect(diff.preservedCorrections).toContainEqual(
      expect.objectContaining({ key: 'siege', keptValue: 'Lyon', discardedValue: null }),
    )
    expect(diff.changedFacts.map(f => f.key)).not.toContain('siege')
  })

  it('liste séparément les recommandations modifiées et les actions devenues obsolètes', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({ before: [...before], after: [...after] })
    expect(diff.changedRecommendations).toContainEqual(
      expect.objectContaining({ key: 'angle-data', before: 'priorité 2', after: 'priorité 1' }),
    )
    expect(diff.obsoleteActions.map(a => a.key)).toEqual(['relance-dsi'])
  })

  // #2555.2 — François (call bêta 17/09) : « je ne sais ni ce qu'elle va
  // coûter, ni ce qu'elle aura changé ». Un fait relu à l'IDENTIQUE (même
  // valeur, source non humaine) ne passait ni dans `changedFacts` (la valeur
  // n'a pas changé) ni dans `preservedCorrections` (réservé aux corrections
  // HUMAINES) : `decideFieldWrite` répondait `{ write: false, reason:
  // 'unchanged' }`, et `buildRefreshDiff` faisait un `continue` muet — le fait
  // disparaissait du diff sans être nommé nulle part. C'est exactement le
  // défaut que la doctrine interdit : rien ne s'efface entre deux étapes sans
  // un mot (GA-259 appliqué au diff, pas à la couverture).
  it('un fait relu IDENTIQUE (source non humaine) compte en INCHANGÉ, il ne disparaît pas', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [...before],
      after: [...after].map(item => (item.key === 'effectif' ? { ...item, value: '1200' } : item)),
    })
    // Toujours là quelque part, jamais nulle part.
    expect(diff.changedFacts.map(f => f.key)).not.toContain('effectif')
    expect(diff.obsoleteFacts.map(f => f.key)).not.toContain('effectif')
    expect(diff.preservedCorrections.map(f => f.key)).not.toContain('effectif')
    expect(diff.unchangedFacts).toBe(1)
  })

  it('une phase qui n’a rien rendu est NOMMÉE — jamais rendue comme « aucun changement »', async () => {
    const { buildRefreshDiff, refreshDiffSaysNothingChanged } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({ before: [...before], after: [...before], unmeasured: ['contacts'] })
    expect(diff.unmeasured).toEqual(['contacts'])
    expect(refreshDiffSaysNothingChanged(diff)).toBe(false)
  })

  it('sans phase muette, un diff vide dit bien « aucun changement »', async () => {
    const { buildRefreshDiff, refreshDiffSaysNothingChanged } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({ before: [...before], after: [...before] })
    expect(refreshDiffSaysNothingChanged(diff)).toBe(true)
    // #2555.2 — « rien n'a changé » compte quand même CE QUI a été relu : le
    // siège (humain) est conservé à part, les trois autres (effectif, ca,
    // angle-data, relance-dsi) sont INCHANGÉS, pas absents.
    expect(diff.unchangedFacts).toBe(4)
  })

  // #2591.1 — un score jamais recalculé par la dimension rejouée et un score
  // VÉRIFIÉ stable produisaient le MÊME `scoreChanged: null` : l'écran ne
  // pouvait pas distinguer « rien n'a bougé » de « on n'a pas regardé ».
  // `scoreRecalculated` nomme le troisième état plutôt que de le taire.
  describe('le score non recalculé (#2591.1)', () => {
    const scoreItem = { kind: 'score', key: 'priority_score', label: 'priority_score', value: '62' } as const

    it('une dimension qui n’écrit jamais `priority_score` le NOMME, avec la dernière valeur connue', async () => {
      const { buildRefreshDiff } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({
        before: [scoreItem],
        after: [scoreItem],
        scoreRecalculated: false,
      })
      expect(diff.scoreChanged).toBeNull()
      expect(diff.scoreNotRecalculated).toEqual({ lastKnownValue: '62' })
    })

    it('une dimension qui recalcule VRAIMENT le score, et le rend stable, reste silencieuse (arbitrage d’écran)', async () => {
      const { buildRefreshDiff } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({
        before: [scoreItem],
        after: [scoreItem],
        scoreRecalculated: true,
      })
      expect(diff.scoreChanged).toBeNull()
      expect(diff.scoreNotRecalculated).toBeNull()
    })

    it('sans indication de dimension (compte rendu ancien), le silence d’avant n’est pas réinterprété', async () => {
      const { buildRefreshDiff } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({ before: [scoreItem], after: [scoreItem] })
      expect(diff.scoreNotRecalculated).toBeNull()
    })

    it('un score réellement changé prime — `scoreNotRecalculated` ne double jamais `scoreChanged`', async () => {
      const { buildRefreshDiff } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({
        before: [scoreItem],
        after: [{ ...scoreItem, value: '78' }],
        scoreRecalculated: false,
      })
      expect(diff.scoreChanged).toEqual(expect.objectContaining({ before: '62', after: '78' }))
      expect(diff.scoreNotRecalculated).toBeNull()
    })

    it('« non recalculé » n’est jamais une lecture de « aucun changement »', async () => {
      const { buildRefreshDiff, refreshDiffSaysNothingChanged } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({ before: [scoreItem], after: [scoreItem], scoreRecalculated: false })
      expect(refreshDiffSaysNothingChanged(diff)).toBe(false)
    })
  })

  // #2591.6 — la CONFIANCE (`raw_analysis.confidence.score`) n'était recalculée
  // que par l'axe 'signals' (et ses alias 'identity_group'/'ecosystem'/
  // 'projects' — Phase 1 la réémet via `AccountsService.mergeRawAnalysis` /
  // `applyResearch`) ; 'contacts', 'entities'/'subsidiaries'/'positions' et
  // 'strategy'/'buying_path' ne l'ont JAMAIS recalculée, et l'écran ne le
  // disait pas — exactement l'ambiguïté que #2591.1 a corrigée pour le score.
  describe('la confiance non recalculée (#2591.6)', () => {
    const confidenceItem = { kind: 'confidence', key: 'confidence', label: 'confidence', value: '54' } as const

    it('une dimension qui n’écrit jamais `confidence` le NOMME, avec la dernière valeur connue', async () => {
      const { buildRefreshDiff } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({
        before: [confidenceItem],
        after: [confidenceItem],
        confidenceRecalculated: false,
      })
      expect(diff.confidenceChanged).toBeNull()
      expect(diff.confidenceNotRecalculated).toEqual({ lastKnownValue: '54' })
    })

    it('une dimension qui recalcule VRAIMENT la confiance, et la rend stable, reste silencieuse (arbitrage d’écran)', async () => {
      const { buildRefreshDiff } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({
        before: [confidenceItem],
        after: [confidenceItem],
        confidenceRecalculated: true,
      })
      expect(diff.confidenceChanged).toBeNull()
      expect(diff.confidenceNotRecalculated).toBeNull()
    })

    it('sans indication de dimension (compte rendu ancien), le silence d’avant n’est pas réinterprété', async () => {
      const { buildRefreshDiff } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({ before: [confidenceItem], after: [confidenceItem] })
      expect(diff.confidenceNotRecalculated).toBeNull()
    })

    it('une confiance réellement changée prime — `confidenceNotRecalculated` ne double jamais `confidenceChanged`', async () => {
      const { buildRefreshDiff } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({
        before: [confidenceItem],
        after: [{ ...confidenceItem, value: '80' }],
        confidenceRecalculated: false,
      })
      expect(diff.confidenceChanged).toEqual(expect.objectContaining({ before: '54', after: '80' }))
      expect(diff.confidenceNotRecalculated).toBeNull()
    })

    it('« non recalculée » n’est jamais une lecture de « aucun changement »', async () => {
      const { buildRefreshDiff, refreshDiffSaysNothingChanged } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({
        before: [confidenceItem],
        after: [confidenceItem],
        confidenceRecalculated: false,
      })
      expect(refreshDiffSaysNothingChanged(diff)).toBe(false)
    })

    // « Non mesuré » n'est jamais « 0 » : sans confiance du tout au dossier
    // (aucun item ni avant ni après), rien ne s'affiche — jamais « confiance 0
    // non recalculée ».
    it('sans confiance du tout au dossier, rien ne s’affiche — jamais « confiance 0 non recalculée »', async () => {
      const { buildRefreshDiff } = await import('./refresh-explained.js')
      const diff = buildRefreshDiff({
        before: [{ kind: 'fact', key: 'employees', label: 'employees', value: '1200' }],
        after: [{ kind: 'fact', key: 'employees', label: 'employees', value: '1200' }],
        confidenceRecalculated: false,
      })
      expect(diff.confidenceNotRecalculated).toBeNull()
    })
  })
})

describe('quand une phase échoue (#2125.64-.67)', () => {
  it('nomme la phase, ce qui a été conservé, et le coût remboursé', async () => {
    const { buildRefreshFailureReport, REFRESH_NEVER_OVERWRITES } = await import('./refresh-explained.js')
    const report = buildRefreshFailureReport({
      mode: 'full',
      phase: 'contacts',
      error: Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
      creditsDebited: 8,
      refunded: true,
    })
    expect(report.phase).toBe('contacts')
    expect(report.outcome).toBe('failed')
    expect(report.credits).toEqual({ debited: 8, refunded: true })
    expect([...report.preservedKinds].sort()).toEqual([...REFRESH_NEVER_OVERWRITES].sort())
    // Les axes que la panne n'a pas touchés restent au dossier, et on le dit.
    // #2318.2 — même dérivation que `plan.reread` ci-dessus.
    expect([...report.keptDimensions].sort()).toEqual([
      'buying_path',
      'ecosystem',
      'entities',
      'identity_group',
      'positions',
      'projects',
      'signals',
      'strategy',
      'subsidiaries',
    ])
  })

  it('une connexion jamais établie est un échec REJOUABLE — la phase seule se relance', async () => {
    const { buildRefreshFailureReport } = await import('./refresh-explained.js')
    const report = buildRefreshFailureReport({
      mode: 'full',
      phase: 'signals',
      error: Object.assign(new Error('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }),
      creditsDebited: 8,
      refunded: true,
    })
    // ⚠️ `UND_ERR_CONNECT_TIMEOUT` n'est PAS un timeout au sens qui compte.
    expect(report.outcome).toBe('failed')
    expect(report.retry).toEqual({ dimension: 'signals', allowed: true, needsConfirmation: false })
  })

  it('une requête partie sans réponse est `unknown` : on ne la rejoue pas sans le dire', async () => {
    const { buildRefreshFailureReport } = await import('./refresh-explained.js')
    const report = buildRefreshFailureReport({
      mode: 'organisation',
      phase: 'contacts',
      error: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      creditsDebited: 2,
      refunded: false,
    })
    expect(report.outcome).toBe('unknown')
    expect(report.retry).toEqual({ dimension: 'contacts', allowed: true, needsConfirmation: true })
    expect(report.credits).toEqual({ debited: 2, refunded: false })
  })

  it('un coût qu’on n’a pas pu lire se dit « non mesuré », jamais 0 (GA-18)', async () => {
    const { buildRefreshFailureReport } = await import('./refresh-explained.js')
    const report = buildRefreshFailureReport({
      mode: 'full',
      phase: 'strategy',
      error: new Error('boom'),
      creditsDebited: null,
      refunded: false,
    })
    expect(report.credits).toEqual({ debited: null, refunded: false })
  })
})

// #2318.3 — la préview à HUIT champs (LAU-FINAL-059) : dernière analyse,
// sections fraîches, sections périmées, changements probables, sources
// consultées, coût, durée, résultat attendu. Les quatre premiers champs sont
// déjà couverts plus haut (aged/reread/mayChange/cost) ; ce bloc couvre les
// quatre qui manquaient au 17/09.
describe('la préview nomme aussi la dernière analyse, ce qui est frais, les sources et la durée (#2318.3)', () => {
  const NOW = new Date('2026-09-18T10:00:00.000Z')

  it('« sections encore fraîches » : les axes de reread absents de aged', async () => {
    const { buildRefreshPlan } = await import('./refresh-explained.js')
    const plan = buildRefreshPlan({
      mode: 'organisation',
      fullAnalysisCredits: 8,
      now: NOW,
      freshness: { contacts: '2026-09-18T08:00:00.000Z', entities: null },
    })
    expect(plan.fresh).toEqual(['contacts'])
    expect(plan.aged.map(e => e.dimension)).toEqual(['entities'])
  })

  it('« dernière analyse » : la date la plus RÉCENTE parmi les axes du mode', async () => {
    const { buildRefreshPlan } = await import('./refresh-explained.js')
    const plan = buildRefreshPlan({
      mode: 'organisation',
      fullAnalysisCredits: 8,
      now: NOW,
      freshness: { contacts: '2026-09-18T08:00:00.000Z', entities: '2026-01-01T00:00:00.000Z' },
    })
    expect(plan.lastAnalyzedAt).toBe('2026-09-18T08:00:00.000Z')
  })

  it('« dernière analyse » reste INCONNUE (jamais une date de zéro) si rien n’a de date lisible', async () => {
    const { buildRefreshPlan } = await import('./refresh-explained.js')
    const plan = buildRefreshPlan({ mode: 'organisation', fullAnalysisCredits: 8, now: NOW, freshness: {} })
    expect(plan.lastAnalyzedAt).toBeNull()
  })

  it('« sources consultées » nomme des NATURES, jamais un fournisseur (GA-44)', async () => {
    const { buildRefreshPlan, REFRESH_SOURCE_NATURES } = await import('./refresh-explained.js')
    const plan = buildRefreshPlan({ mode: 'full', fullAnalysisCredits: 8, now: NOW, freshness: {} })
    for (const nature of plan.sources) expect(REFRESH_SOURCE_NATURES).toContain(nature)
    // Aucun nom de fournisseur (Pappers, Apollo, Brave, Firecrawl…) ne doit
    // pouvoir apparaître — la liste fermée des natures l'empêche déjà, mais on
    // le vérifie explicitement pour que la garde du dépôt ait quelque chose à
    // lire si quelqu'un ajoute une nature un jour.
    const forbidden = ['pappers', 'apollo', 'brave', 'firecrawl', 'linkedin']
    for (const source of plan.sources) {
      expect(forbidden.some(name => source.toLowerCase().includes(name))).toBe(false)
    }
  })

  it('« l’organisation » ne consulte que les natures de ses deux axes', async () => {
    const { buildRefreshPlan } = await import('./refresh-explained.js')
    const plan = buildRefreshPlan({ mode: 'organisation', fullAnalysisCredits: 8, now: NOW, freshness: {} })
    expect([...plan.sources].sort()).toEqual(['company_website', 'official_registry', 'professional_network'].sort())
  })

  it('« durée » : deux bornes par mode, jamais un chiffre unique', async () => {
    const { buildRefreshPlan } = await import('./refresh-explained.js')
    const full = buildRefreshPlan({ mode: 'full', fullAnalysisCredits: 8, now: NOW, freshness: {} })
    const organisation = buildRefreshPlan({ mode: 'organisation', fullAnalysisCredits: 8, now: NOW, freshness: {} })
    expect(full.durationMinutes).toEqual({ min: 3, max: 6 })
    expect(organisation.durationMinutes).toEqual({ min: 1, max: 2 })
  })
})

// #2318.4 — le diff à ONZE champs. Sept sont déjà couverts plus haut
// (newFacts/changedFacts/obsoleteFacts/preservedCorrections/
// changedRecommendations/obsoleteActions/unmeasured) ; ce bloc couvre les
// trois qui manquaient au 17/09 pour `buildRefreshDiff` lui-même
// (expiredSignals/scoreChanged/confidenceChanged). « contacts partis »,
// « nouveaux contacts » et « nouvelles entités » sont couverts par
// `org-graph-refresh-diff.test.ts` — mécanisme DISTINCT et déjà branché
// (GA-26), que ce fichier ne duplique pas.
describe('le diff nomme aussi les signaux expirés, le score et la confiance modifiés (#2318.4)', () => {
  it('« signaux expirés » : un signal qui n’est plus dans le relevé redevient INCONNU AVEC SA DATE', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [
        {
          kind: 'signal',
          key: 'levee',
          label: 'Levée de fonds',
          value: '20M€',
          measuredAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      after: [],
    })
    expect(diff.expiredSignals).toEqual([
      { key: 'levee', label: 'Levée de fonds', lastKnownValue: '20M€', lastSeenAt: '2026-06-01T00:00:00.000Z' },
    ])
  })

  it('un signal NOUVEAU ou MODIFIÉ retombe sur les faits génériques (pas de « nouveau signal » séparé)', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [],
      after: [{ kind: 'signal', key: 'recrutement', label: 'Recrutement DSI', value: 'oui', measuredAt: null }],
    })
    expect(diff.newFacts.map(f => f.key)).toEqual(['recrutement'])
    expect(diff.expiredSignals).toEqual([])
  })

  it('« score modifié » : avant/après, jamais une probabilité', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [{ kind: 'score', key: 'priority_score', label: 'Score', value: '62' }],
      after: [{ kind: 'score', key: 'priority_score', label: 'Score', value: '78' }],
    })
    expect(diff.scoreChanged).toEqual({ key: 'priority_score', label: 'Score', before: '62', after: '78' })
  })

  it('« confiance modifiée » : même forme que le score, un champ distinct', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [{ kind: 'confidence', key: 'confidence', label: 'Confiance', value: '54' }],
      after: [{ kind: 'confidence', key: 'confidence', label: 'Confiance', value: '80' }],
    })
    expect(diff.confidenceChanged).toEqual({ key: 'confidence', label: 'Confiance', before: '54', after: '80' })
    // Le score et la confiance ne se confondent jamais.
    expect(diff.scoreChanged).toBeNull()
  })

  it('un score ou une confiance INCHANGÉS restent `null`, jamais un objet à vide', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [{ kind: 'score', key: 'priority_score', label: 'Score', value: '62', source: 'pipeline' }],
      after: [{ kind: 'score', key: 'priority_score', label: 'Score', value: '62' }],
    })
    expect(diff.scoreChanged).toBeNull()
  })

  it('un score/une confiance modifiés empêchent « aucun changement » de se dire', async () => {
    const { buildRefreshDiff, refreshDiffSaysNothingChanged } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [{ kind: 'score', key: 'priority_score', label: 'Score', value: '62' }],
      after: [{ kind: 'score', key: 'priority_score', label: 'Score', value: '78' }],
    })
    expect(refreshDiffSaysNothingChanged(diff)).toBe(false)
  })

  it('un signal expiré, seul, empêche aussi « aucun changement » de se dire', async () => {
    const { buildRefreshDiff, refreshDiffSaysNothingChanged } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [
        {
          kind: 'signal',
          key: 'levee',
          label: 'Levée de fonds',
          value: '20M€',
          measuredAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      after: [],
    })
    expect(refreshDiffSaysNothingChanged(diff)).toBe(false)
  })
})

// #2318.8 — « Elle ne doit pas modifier silencieusement la mémoire partagée »
// (LAU-FINAL-059, section PROPAGATION).
//
// Le défaut mesuré le 20/09/2026, et la raison d'être de ce bloc : au niveau du
// CONTRAT, `after` est ce que la collecte PROPOSE, et `decideFieldWrite` tranche
// — une correction humaine gagne, elle part en `preservedCorrections`. Mais
// `AnalysisRefreshService` relit son instantané d'APRÈS **dans la base, une fois
// la phase écrite** : son `after` n'est plus une proposition, c'est l'état
// PERSISTÉ. Si un writer aveugle a réellement écrasé la correction en base,
// l'arbitrage rejoué ici répondait « on garde Lyon » et le diff affichait
// « correction conservée » — alors que la base contient Paris. Le mensonge
// était silencieux, et c'est exactement le NO-GO de l'issue.
//
// D'où `overwrittenCorrections` : ce que l'appelant a MESURÉ écrasé, jamais ce
// qu'un second arbitrage suppose. Un appelant qui ne mesure rien ne remplit
// rien — « non mesuré » n'est pas « aucun écrasement ».
describe('#2318.8 — une correction réellement écrasée ne se dit jamais « conservée »', () => {
  const corrected = [
    {
      kind: 'fact',
      key: 'siege',
      label: 'Siège',
      value: 'Lyon',
      source: 'human',
      measuredAt: '2026-04-01T09:00:00.000Z',
    },
  ] as const

  const overwritten = [
    {
      kind: 'fact',
      key: 'siege',
      label: 'Siège',
      value: 'Paris',
      measuredAt: '2026-09-20T09:00:00.000Z',
    },
  ] as const

  it('NOMME l’écrasement mesuré, avec la valeur corrigée et celle qui l’a remplacée', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [...corrected],
      after: [...overwritten],
      overwrittenCorrections: [
        {
          key: 'siege',
          label: 'Siège',
          correctedValue: 'Lyon',
          overwrittenWith: 'Paris',
          byPhase: 'entities',
          correctedAt: '2026-04-01T09:00:00.000Z',
        },
      ],
    })

    expect(diff.overwrittenCorrections).toEqual([
      {
        key: 'siege',
        label: 'Siège',
        correctedValue: 'Lyon',
        overwrittenWith: 'Paris',
        byPhase: 'entities',
        correctedAt: '2026-04-01T09:00:00.000Z',
      },
    ])
  })

  it('ne l’annonce PAS aussi comme conservée — les deux à la fois seraient le mensonge', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [...corrected],
      after: [...overwritten],
      overwrittenCorrections: [
        {
          key: 'siege',
          label: 'Siège',
          correctedValue: 'Lyon',
          overwrittenWith: 'Paris',
          byPhase: 'entities',
          correctedAt: null,
        },
      ],
    })

    expect(diff.preservedCorrections.map(c => c.key)).not.toContain('siege')
  })

  it('un écrasement mesuré interdit à lui seul de dire « aucun changement »', async () => {
    const { buildRefreshDiff, refreshDiffSaysNothingChanged } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({
      before: [...corrected],
      after: [...corrected],
      overwrittenCorrections: [
        {
          key: 'siege',
          label: 'Siège',
          correctedValue: 'Lyon',
          overwrittenWith: 'Paris',
          byPhase: 'entities',
          correctedAt: null,
        },
      ],
    })
    expect(refreshDiffSaysNothingChanged(diff)).toBe(false)
  })

  // La garde doit savoir NE PAS accuser : sans mesure d'écrasement, une
  // correction conservée reste conservée, et la liste reste VIDE — pas nulle,
  // pas peuplée « au cas où ».
  it('n’accuse RIEN quand l’appelant n’a mesuré aucun écrasement', async () => {
    const { buildRefreshDiff } = await import('./refresh-explained.js')
    const diff = buildRefreshDiff({ before: [...corrected], after: [...overwritten] })
    expect(diff.overwrittenCorrections).toEqual([])
    expect(diff.preservedCorrections.map(c => c.key)).toContain('siege')
  })
})
