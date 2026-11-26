import { orgEntitySchema } from '@bellum/contracts'
import { SG_COMPTE_COMPLET_CSV } from './data/sg-compte-complet.generated'
import { DEMO_DOSSIERS, DEMO_SG_COMPLETE_LEAD, DEMO_SG_ESN_PARTNERS, DEMO_SG_NEED_ANNOTATIONS } from './demo-dataset'
import { parseCompteCsvRows, type CompteCsvRow } from './compte-csv-parser'
import {
  SG_ORG_GRAPH_ROOT_ID,
  applySgCompleteLead,
  applySgPartnersAndNeeds,
  mapSgContactTechnologyCounts,
  mapSgEsnPartners,
  mapSgJobFamilyNote,
  mapSgNeedAnnotations,
  mapSgOrgGraphEntities,
  mergeSgRawAnalysis,
  type SgSqlExecutor,
} from './sg-csv-complement'

/**
 * Complément SG du 28/09/2026 (retour de démo de Théo) — trois écrans vides
 * alors que le CSV les portait : l'organigramme du groupe (4 entités), « Les
 * ESN présentes » (aucune), et les pistes « Besoin détecté » sans source.
 */
const rows: CompteCsvRow[] = parseCompteCsvRows(SG_COMPTE_COMPLET_CSV)

/** Les personnes RÉELLES des blocs 06/07/08 — jamais semées nom par nom. */
const PERSON_BLOCS = [
  '06_CONTACTS_OPERATIONNELS',
  '07_PRESTATAIRES_EXTERNES_EN_POSTE',
  '08_PROFILS_AYANT_EXERCE_CHEZ_LE_COMPTE',
]
const personNames = rows
  .filter(row => row.bloc && PERSON_BLOCS.includes(row.bloc))
  .map(row => row.objet)
  .filter((name): name is string => Boolean(name && name.trim().length >= 5))

function expectNoPersonalData(value: unknown): void {
  const text = JSON.stringify(value)
  expect(text).not.toMatch(/@/)
  expect(text).not.toMatch(/linkedin\.com\/in\//i)
  expect(text).not.toMatch(/(\+33|\b0[1-9])([ .-]?\d{2}){4}/)
  for (const name of personNames) expect(text).not.toContain(name)
}

describe('mapSgOrgGraphEntities — blocs 02_STRUCTURE_GROUPE + 09_ENTITES_ET_PERIMETRE → orgGraph.entities', () => {
  const entities = mapSgOrgGraphEntities(rows)

  it('porte les 31 unités du bloc 02 et les 52 entités du bloc 09 absentes du graphe (83)', () => {
    expect(entities.filter(entity => entity.id.startsWith('e-sg-csv-02-'))).toHaveLength(31)
    // 55 lignes moins les trois déjà dans le graphe écrit à la main
    // (maison mère, Treezor, Boursorama) — jamais deux nœuds pour une société.
    expect(entities.filter(entity => entity.id.startsWith('e-sg-csv-09-'))).toHaveLength(52)
    expect(new Set(entities.map(entity => entity.id)).size).toBe(entities.length)
    expect(entities.map(entity => entity.name)).not.toContain('Société Générale S.A.')
    expect(entities.map(entity => entity.name)).not.toContain('Treezor SAS')
  })

  it('range chaque niveau sous le bon type, et dit « statut inconnu » pour ce que le CSV dit historique', () => {
    const komercni = entities.find(entity => entity.name === 'Komerční banka')
    expect(komercni).toMatchObject({ type: 'filiale', status: 'operating', parentId: SG_ORG_GRAPH_ROOT_ID })
    const creditDuNord = entities.find(entity => entity.name === 'Crédit du Nord')
    expect(creditDuNord?.status).toBe('unknown')
    const globalMarkets = entities.find(entity => entity.name === 'Global Markets')
    expect(globalMarkets?.type).toBe('bu')
    const crossRisk = entities.find(entity => entity.name === 'Cross Risk Metrics')
    expect(crossRisk?.type).toBe('departement')
  })

  it('chaque nœud passe le contrat et cite sa ligne source', () => {
    for (const entity of entities) {
      expect(orgEntitySchema.safeParse(entity).success).toBe(true)
      expect(entity.sources[0]?.ref).toMatch(/SG-\d{4}/)
      expect(entity.sources[0]?.kind).toBe('workspace_import')
    }
  })
})

describe('mapSgEsnPartners — bloc 07_PRESTATAIRES_EXTERNES_EN_POSTE → account_partners', () => {
  const partners = mapSgEsnPartners(rows)

  it('nomme les cinq sociétés employeuses citées, et elles seules', () => {
    expect(partners.map(partner => partner.name).sort()).toEqual([
      'ANGPOW Consultancy',
      'Awalee Consulting',
      'Nexialog Consulting',
      'Sogeti',
      'mc2i',
    ])
    for (const partner of partners) {
      expect(partner.profiles).toBeGreaterThanOrEqual(1)
      expect(partner.detectedAt).toBe('2026-09-27T00:00:00.000Z')
      expect(partner.rank).toBe('unknown')
      expect(partner.relationship).toBe('unknown')
      expect(partner.partnerSource).toBe('analysis')
    }
  })

  it('ne porte AUCUNE donnée personnelle — ni nom, ni e-mail, ni téléphone (RGPD, décision du 27/09)', () => {
    expectNoPersonalData(partners)
  })
})

describe('mapSgNeedAnnotations — les pistes « Besoin détecté » reliées à leur ligne source', () => {
  const annotations = mapSgNeedAnnotations(rows)

  it('relie les cinq programmes du bloc 11 à leur propre ligne', () => {
    const programs = annotations.filter(
      annotation => annotation.kind === 'program' && annotation.csvId.startsWith('SG-217'),
    )
    expect(programs).toHaveLength(5)
  })

  it('renseigne source, périmètre, rôle et détail sur chaque lien — jamais un champ vide', () => {
    expect(annotations.length).toBeGreaterThanOrEqual(13)
    for (const annotation of annotations) {
      expect(annotation.source).toContain(annotation.csvId)
      expect(annotation.source).toMatch(/fiabilité/)
      expect(annotation.perimeter.length).toBeGreaterThan(5)
      expect(annotation.role).toMatch(/^Rôles concernés : /)
      expect(annotation.detail).toMatch(/Constat : /)
    }
    expectNoPersonalData(annotations)
  })
})

describe('technologies et familles de métiers — agrégats comptés des profils en poste', () => {
  it('compte chaque technologie par profil (SQL : 53 profils en poste, comme la ligne SG-2191 du CSV)', () => {
    const technologies = mapSgContactTechnologyCounts(rows)
    expect(technologies.length).toBeGreaterThan(5)
    expect(technologies.length).toBeLessThanOrEqual(15)
    expect(technologies[0]).toMatchObject({ name: 'SQL' })
    expect(technologies[0]?.usage).toContain('53 profils')
    expect(technologies.map(entry => entry.name)).toContain('Java')
    expect(technologies.map(entry => entry.name)).toContain('DevOps / CI-CD')
    // Une posture ou un métier n'est pas une technologie.
    expect(technologies.map(entry => entry.name)).not.toContain('Product / Agilité')
    expectNoPersonalData(technologies)
  })

  it('compte les 91 profils en poste par famille — la répartition que le CSV publie (SG-2192)', () => {
    const note = mapSgJobFamilyNote(rows)
    expect(note?.constat).toContain('91 profils')
    expect(note?.constat).toContain('Développement logiciel (36)')
    expect(note?.constat).toContain('Data / IA (14)')
    expectNoPersonalData(note)
  })
})

/** Exécuteur SQL enregistreur : rend `rows` pour chaque requête lue. */
function recorder(respond: (sql: string) => unknown[] = () => []) {
  const calls: { sql: string; params: unknown[] }[] = []
  const exec: SgSqlExecutor = async (sql, params = []) => {
    calls.push({ sql, params })
    return respond(sql) as never
  }
  return { calls, exec }
}

describe('applySgPartnersAndNeeds — les écritures, bornées au compte ET à son espace', () => {
  it('en réel : insère les ESN sans jamais doubler, et complète les pistes sans écraser une saisie', async () => {
    const { calls, exec } = recorder(sql => (sql.includes('RETURNING') ? [{ id: 'x' }] : []))
    const result = await applySgPartnersAndNeeds(exec, 'ws-1', 'acc-1', { dryRun: false })
    const inserts = calls.filter(call => call.sql.includes('INSERT INTO account_partners'))
    expect(inserts).toHaveLength(5)
    for (const call of inserts) {
      expect(call.sql).toContain('ON CONFLICT (account_id, lower(name)) DO NOTHING')
      expect(call.sql).toContain('workspace_id = $1')
      expect(call.params.slice(0, 2)).toEqual(['ws-1', 'acc-1'])
    }
    const updates = calls.filter(call => call.sql.includes('UPDATE opportunities'))
    expect(updates.length).toBeGreaterThanOrEqual(13)
    for (const call of updates) {
      expect(call.sql).toContain('COALESCE(o.source')
      expect(call.sql).toContain('a.workspace_id = $2')
    }
    // Aucune autre table n'est touchée.
    for (const call of calls) expect(call.sql).toMatch(/account_partners|opportunities/)
    expect(result.partners).toBe(5)
  })

  it('compte les pistes complétées sur la forme RÉELLE de TypeORM — UPDATE … RETURNING rend `[lignes, nombre]`', async () => {
    // Zéro piste réellement touchée : `updated.length` lu à la main valait 2 (le couple),
    // donc le compte annonçait deux complétions par annotation qui n'avaient pas eu lieu.
    const { exec } = recorder(sql => (sql.trim().startsWith('UPDATE') ? [[], 0] : []))
    const result = await applySgPartnersAndNeeds(exec, 'ws-1', 'acc-1', { dryRun: false })
    expect(result.needs).toBe(0)
  })

  it('en --dry-run : aucune écriture, seulement des lectures qui comptent', async () => {
    const { calls, exec } = recorder(() => [{ count: 2 }])
    const result = await applySgPartnersAndNeeds(exec, 'ws-1', 'acc-1', { dryRun: true })
    for (const call of calls) expect(call.sql.trim()).toMatch(/^SELECT/i)
    expect(result.partners).toBeGreaterThan(0)
  })
})

describe('mergeSgRawAnalysis — le dossier déjà semé reçoit ce qui lui manque, rien d’autre', () => {
  const raw = {
    org: { orgGraph: { entities: [{ id: 'e-sg', name: 'Société Générale', type: 'groupe' }], people: [] } },
    entities_exhaustive: [{ name: 'Treezor' }],
    program_names: [{ name: 'Plan stratégique à horizon 2029' }],
    detected_tech_stack: ['Apache'],
    other_key: 'intact',
  }

  it('ajoute les entités et programmes absents, par identifiant ou par nom, sans toucher au reste', () => {
    const { merged, added } = mergeSgRawAnalysis(raw)
    const graphEntities = (merged.org as { orgGraph: { entities: { id: string }[] } }).orgGraph.entities
    expect(graphEntities).toHaveLength(1 + 83)
    expect(added.orgGraphEntities).toBe(83)
    expect(added.programNames).toBe(5)
    expect(merged.other_key).toBe('intact')
    expect(raw.org.orgGraph.entities).toHaveLength(1)
  })

  it('est idempotent : un second passage n’ajoute rien', () => {
    const once = mergeSgRawAnalysis(raw).merged
    const twice = mergeSgRawAnalysis(once)
    expect(Object.values(twice.added).every(count => count === 0)).toBe(true)
  })
})

describe('le dossier Société Générale du jeu de démonstration porte le complément', () => {
  const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
  const raw = (sg?.account.raw_analysis ?? {}) as Record<string, unknown>

  it('la vue Groupe passe de 5 à 88 entités (racine + 4 écrites à la main + 83 du CSV)', () => {
    const graph = (raw['org'] as { orgGraph: { entities: { id: string }[] } }).orgGraph
    expect(graph.entities).toHaveLength(88)
  })

  it('chaque lien de piste désigne une ligne que `materialize` écrit vraiment depuis ce dossier', () => {
    const labels = new Set<string>([
      ...((raw['it_challenges'] as { title: string }[]) ?? []).map(entry => entry.title),
      ...((raw['pains'] as { pain: string }[]) ?? []).map(entry => entry.pain),
      ...((raw['program_names'] as { name: string }[]) ?? []).map(entry => entry.name),
    ])
    for (const annotation of DEMO_SG_NEED_ANNOTATIONS) {
      if (annotation.label === null) {
        expect(typeof raw['it_implications_for_esn']).toBe('string')
        continue
      }
      expect(labels).toContain(annotation.label)
    }
  })

  it('les technologies comptées et la répartition des familles sont dans le dossier', () => {
    const stack = raw['technology_stack'] as { name: string; usage: string }[]
    expect(stack.find(entry => entry.name === 'SQL')?.usage).toContain('53 profils')
    const axes = raw['structural_reading_axes'] as { label: string }[]
    expect(axes.map(axis => axis.label)).toContain('Familles de métiers des profils en poste')
    expect(DEMO_SG_ESN_PARTNERS).toHaveLength(5)
  })

  it('un dossier déjà complet ne reçoit plus rien du rattrapage (le script est idempotent sur le jeu)', () => {
    const { added } = mergeSgRawAnalysis(raw)
    expect(added).toEqual({
      orgGraphEntities: 0,
      entitiesExhaustive: 0,
      programNames: 0,
      technologyStack: 0,
      detectedTechStack: 0,
      jobFamilyNote: 0,
    })
  })
})

describe('applySgCompleteLead — la piste complète d’une salle SG DÉJÀ semée (« Préparer l’approche »)', () => {
  type Call = { sql: string; params: unknown[] | undefined }
  const run = async (inserted: unknown[], dryRun = false) => {
    const calls: Call[] = []
    const exec: SgSqlExecutor = async (sql, params) => {
      calls.push({ sql, params })
      return inserted
    }
    const written = await applySgCompleteLead(exec, 'ws-1', 'acc-sg', DEMO_SG_COMPLETE_LEAD, dryRun)
    return { calls, written }
  }

  it('écrit la piste (périmètre + rôle) BORNÉE au compte et à son espace, seulement si le libellé manque', async () => {
    const { calls, written } = await run([{ id: 'opp-1' }])
    expect(written).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.sql).toMatch(/INSERT INTO opportunities/)
    expect(calls[0]?.sql).toMatch(/NOT EXISTS/)
    expect(calls[0]?.sql).toMatch(/workspace_id = \$1/)
    expect(calls[0]?.params).toEqual(
      expect.arrayContaining(['ws-1', 'acc-sg', DEMO_SG_COMPLETE_LEAD.label, DEMO_SG_COMPLETE_LEAD.offer]),
    )
    expect(JSON.stringify(calls[0]?.params)).toContain(DEMO_SG_COMPLETE_LEAD.management)
  })

  it('déjà présente ⇒ 0 écriture (idempotent)', async () => {
    expect((await run([])).written).toBe(0)
  })

  it('--dry-run ne fait qu’un SELECT, jamais d’INSERT', async () => {
    const { calls } = await run([{ count: 1 }], true)
    expect(calls.every(call => !/INSERT/.test(call.sql))).toBe(true)
  })
})
