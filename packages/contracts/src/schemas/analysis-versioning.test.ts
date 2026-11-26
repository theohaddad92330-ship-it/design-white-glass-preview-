import { describe, expect, it } from 'vitest'

describe('#2318.5 — buildAnalysisVersioning (LAU-FINAL-059, VERSIONING)', () => {
  it('rassemble les neuf identifiants, SANS en fabriquer un seul', async () => {
    const { buildAnalysisVersioning } = await import('./analysis-versioning.js')

    const versioning = buildAnalysisVersioning({
      created_at: new Date('2026-09-15T10:00:00.000Z'),
      scope_mode: 'france',
      prompt_versions: { research: 'v3' },
      analysis_version: 'abc123f',
      account_context_version: '2026-09-10T08:00:00.000Z',
      profile_provenance: {
        mode: 'personalised',
        reason: null,
        esnProfileVersion: 4,
        profileContextVersion: 2,
        answered: 10,
        required: 10,
        esnName: 'Acme ESN',
      },
    })

    // Les neuf clés existent — c'est le premier fait que LAU-FINAL-059 demande.
    expect(Object.keys(versioning).sort()).toEqual(
      [
        'analysis_version',
        'profile_version',
        'account_context_version',
        'dataforge_version',
        'market_memory_version',
        'prompt_version',
        'scoring_version',
        'date',
        'scope',
      ].sort(),
    )

    // Les quatre qui SONT tracées aujourd'hui sortent réellement de la source
    // (#3212.3, épopée #3235 : `analysis_version` avait rejoint `profile_version`
    // et `prompt_version` ; `account_context_version` — la révision de la
    // fiche compte qui a nourri le run, `accounts.updated_at` timbré au
    // lancement — les rejoint à son tour, lot E7 du 28/09).
    expect(versioning.prompt_version).toEqual({ research: 'v3' })
    expect(versioning.profile_version).toBe('esn:4/context:2')
    expect(versioning.analysis_version).toBe('abc123f')
    expect(versioning.account_context_version).toBe('2026-09-10T08:00:00.000Z')
    expect(versioning.date).toBe('2026-09-15T10:00:00.000Z')
    expect(versioning.scope).toBe('france')

    // `scoring_version` est null ICI parce que ce fixture ne porte pas de hash
    // `prompts.scorer` — voir le test dédié plus bas pour le cas où il est
    // lisible. `dataforge_version` reste INCONNU sur TOUT run aujourd'hui ;
    // `market_memory_version` ne se lit que si le run l'a timbré (test dédié), jamais un zéro ou une valeur devinée (doctrine
    // « non mesuré n'est jamais 0 ») : voir le docblock du fichier (lot E7 du
    // 28/09) pour la raison — DIFFÉRENTE pour chacun des deux.
    expect(versioning.dataforge_version).toBeNull()
    expect(versioning.market_memory_version).toBeNull()
    expect(versioning.scoring_version).toBeNull()
  })

  it('#3235 / #3212.3 — `market_memory_version` relit la colonne timbrée par le run, `null` sinon', async () => {
    const { buildAnalysisVersioning } = await import('./analysis-versioning.js')
    const base = {
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      scope_mode: null,
      prompt_versions: null,
      profile_provenance: null,
    }
    expect(buildAnalysisVersioning({ ...base, market_memory_version: '2026-09-v3' }).market_memory_version).toBe(
      '2026-09-v3',
    )
    // Un run antérieur à la colonne, ou qui n'a pas lu la mémoire marché.
    expect(buildAnalysisVersioning(base).market_memory_version).toBeNull()
    expect(buildAnalysisVersioning({ ...base, market_memory_version: null }).market_memory_version).toBeNull()
    // Jamais une chaîne vide présentée comme une version.
    expect(buildAnalysisVersioning({ ...base, market_memory_version: '  ' }).market_memory_version).toBeNull()
  })

  it('#3212.3 (épopée #3235, lot E7) — un run sans `account_context_version` (antérieur à la colonne) rend `null`, jamais deviné', async () => {
    const { buildAnalysisVersioning } = await import('./analysis-versioning.js')
    const versioning = buildAnalysisVersioning({
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      scope_mode: null,
      prompt_versions: null,
      profile_provenance: null,
    })
    expect(versioning.account_context_version).toBeNull()
  })

  it('#3212.3 (épopée #3235, lot E7) — `scoring_version` reprend le hash du prompt "scorer" déjà timbré, jamais recalculé', async () => {
    const { buildAnalysisVersioning } = await import('./analysis-versioning.js')
    const versioning = buildAnalysisVersioning({
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      scope_mode: null,
      prompt_versions: { model: 'claude-sonnet-5', prompts: { research: 'abc', scorer: 'def456' } },
      profile_provenance: null,
    })
    expect(versioning.scoring_version).toBe('def456')
  })

  it('#3212.3 (épopée #3235, lot E7) — `scoring_version` rend `null` (jamais deviné) quand `prompt_versions` ne porte aucun hash "scorer" lisible', async () => {
    const { buildAnalysisVersioning } = await import('./analysis-versioning.js')
    const withoutPrompts = buildAnalysisVersioning({
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      scope_mode: null,
      prompt_versions: null,
      profile_provenance: null,
    })
    expect(withoutPrompts.scoring_version).toBeNull()

    const withoutScorer = buildAnalysisVersioning({
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      scope_mode: null,
      prompt_versions: { model: 'claude-sonnet-5', prompts: { research: 'abc' } },
      profile_provenance: null,
    })
    expect(withoutScorer.scoring_version).toBeNull()
  })

  it('#3212.3 — un run antérieur à la colonne `analysis_version` (champ absent) rend `null`, jamais deviné', async () => {
    const { buildAnalysisVersioning } = await import('./analysis-versioning.js')
    const versioning = buildAnalysisVersioning({
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      scope_mode: null,
      prompt_versions: null,
      profile_provenance: null,
    })
    expect(versioning.analysis_version).toBeNull()
  })

  it('un run sans provenance de profil (générique, ou antérieur à la colonne) rend `profile_version` null — jamais 0', async () => {
    const { buildAnalysisVersioning } = await import('./analysis-versioning.js')

    const versioning = buildAnalysisVersioning({
      created_at: '2026-01-01T00:00:00.000Z',
      scope_mode: null,
      prompt_versions: null,
      profile_provenance: null,
    })

    expect(versioning.profile_version).toBeNull()
    expect(versioning.prompt_version).toBeNull()
    expect(versioning.scope).toBeNull()
  })

  it('valide via le schéma zod — le contrat que l’écran lira', async () => {
    const { buildAnalysisVersioning, analysisVersioningSchema } = await import('./analysis-versioning.js')
    const versioning = buildAnalysisVersioning({
      created_at: new Date('2026-09-15T10:00:00.000Z'),
      scope_mode: null,
      prompt_versions: null,
      profile_provenance: null,
    })
    expect(() => analysisVersioningSchema.parse(versioning)).not.toThrow()
  })
})

describe('#3235 — withDataforgeVersion (dataforge_version via la façade)', () => {
  const base = {
    analysis_version: 'abc',
    profile_version: null,
    account_context_version: null,
    dataforge_version: null,
    market_memory_version: null,
    prompt_version: null,
    scoring_version: null,
    date: '2026-10-10T00:00:00.000Z',
    scope: 'france',
  }

  it('pose la version que la façade a lue, sans toucher aux huit autres', async () => {
    const { withDataforgeVersion } = await import('./analysis-versioning.js')
    const out = withDataforgeVersion(base, 'ORION_V12')
    expect(out?.dataforge_version).toBe('ORION_V12')
    expect({ ...out, dataforge_version: null }).toEqual(base)
  })

  it('une version absente ou vide reste null — jamais une valeur devinée', async () => {
    const { withDataforgeVersion } = await import('./analysis-versioning.js')
    expect(withDataforgeVersion(base, null)?.dataforge_version).toBeNull()
    expect(withDataforgeVersion(base, '   ')?.dataforge_version).toBeNull()
    expect(withDataforgeVersion(null, 'X')).toBeNull()
  })
})
