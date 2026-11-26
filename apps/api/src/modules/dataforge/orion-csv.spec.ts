import {
  parseOrionAccountStatusRecord,
  parseOrionAnomalyRecord,
  parseOrionRagChunkRecord,
  toAccountStatusUpsertRow,
  valueOrPlaceholderNull,
} from './orion-csv'
import {
  ORION_ACCOUNTS_MASTER_HEADER,
  ORION_ANOMALIES_HEADER,
  ORION_RAG_CHUNKS_HEADER,
} from './orion-v12-headers.fixture'

/** Construit une ligne CSV `;` à partir d'un en-tête et d'un objet colonne → valeur. */
function buildRecord(header: readonly string[], values: Record<string, string>): string {
  return header
    .map(column => {
      const value = values[column] ?? ''
      return value.includes(';') || value.includes('"') || value.includes('\n')
        ? `"${value.replace(/"/g, '""')}"`
        : value
    })
    .join(';')
}

describe('parseOrionRagChunkRecord', () => {
  const header = ORION_RAG_CHUNKS_HEADER

  it('lit un chunk normal, rattaché à un compte', () => {
    const record = buildRecord(header, {
      chunk_id: 'CK-test0001',
      account_id: 'DF-9001',
      entreprise: 'ACME Test',
      type_chunk: 'IDENTITE_COMPTE',
      titre: 'Fiche identité',
      texte: 'ACME Test est un compte de test.',
      source: 'ORION_DATAPACK_V12',
      niveau_confiance: '[issu fichier]',
      date_verification: '2026-08-27',
      priorite_indexation: '1',
      longueur: '33',
    })
    const parsed = parseOrionRagChunkRecord(header, record)
    expect(parsed.kind).toBe('row')
    if (parsed.kind !== 'row') throw new Error('expected row')
    expect(parsed.row).toEqual({
      chunkId: 'CK-test0001',
      accountId: 'DF-9001',
      entreprise: 'ACME Test',
      typeChunk: 'IDENTITE_COMPTE',
      titre: 'Fiche identité',
      texte: 'ACME Test est un compte de test.',
      source: 'ORION_DATAPACK_V12',
      niveauConfiance: '[issu fichier]',
      dateVerification: '2026-08-27',
      prioriteIndexation: 1,
      longueur: 33,
    })
  })

  it('accepte un chunk GARDE_FOU_QUALITE sans account_id — ce n’est pas un oubli', () => {
    const record = buildRecord(header, {
      chunk_id: 'CK-gf0001',
      account_id: '',
      entreprise: '',
      type_chunk: 'GARDE_FOU_QUALITE',
      titre: 'Alerte qualité TEST',
      texte: '[CRITIQUE] Ceci est une alerte de test.',
      source: 'test_fixture.md',
      niveau_confiance: '[garde-fou interne]',
      date_verification: '2026-08-27',
      priorite_indexation: '0',
      longueur: '40',
    })
    const parsed = parseOrionRagChunkRecord(header, record)
    expect(parsed.kind).toBe('row')
    if (parsed.kind !== 'row') throw new Error('expected row')
    expect(parsed.row.accountId).toBeNull()
    expect(parsed.row.typeChunk).toBe('GARDE_FOU_QUALITE')
    expect(parsed.row.prioriteIndexation).toBe(0)
  })

  it('refuse un chunk sans identifiant', () => {
    const record = buildRecord(header, { chunk_id: '', texte: 'x', type_chunk: 'X', priorite_indexation: '1' })
    const parsed = parseOrionRagChunkRecord(header, record)
    expect(parsed).toEqual({ kind: 'rejected', reason: 'chunk sans identifiant' })
  })

  it('refuse un chunk sans texte', () => {
    const record = buildRecord(header, { chunk_id: 'CK-x', texte: '', type_chunk: 'X', priorite_indexation: '1' })
    const parsed = parseOrionRagChunkRecord(header, record)
    expect(parsed).toEqual({ kind: 'rejected', reason: 'texte absent (CK-x)' })
  })

  it('refuse une priorité d’indexation hors de la liste fermée {0,1,2}', () => {
    const record = buildRecord(header, { chunk_id: 'CK-x', texte: 'x', type_chunk: 'X', priorite_indexation: '3' })
    const parsed = parseOrionRagChunkRecord(header, record)
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') throw new Error('expected rejection')
    expect(parsed.reason).toContain('priorité')
  })

  it('refuse une ligne dont le nombre de colonnes ne correspond pas à l’en-tête', () => {
    const parsed = parseOrionRagChunkRecord(header, 'a;b;c')
    expect(parsed.kind).toBe('rejected')
  })
})

describe('parseOrionAccountStatusRecord', () => {
  const header = ORION_ACCOUNTS_MASTER_HEADER

  function baseValues(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      pack_version: 'ORION_DATAPACK_V12',
      snapshot: '2026-08-27',
      account_id: 'DF-9001',
      Entreprise: 'ACME Test',
      statut_code: 'CIBLE_PRIORITAIRE',
      statut_cible: 'Cible prioritaire',
      penetrabilite: '72.0',
      couverture_totale: '18',
      siren_siret: '[à compléter lot 2 — Pappers/Sirene]',
      barriere_plateforme: 'False',
      barriere_publique: 'True',
      internal_contacts_count: '42',
      ...overrides,
    }
  }

  it('lit un compte, avec pénétrabilité ET couverture appariées', () => {
    const record = buildRecord(header, baseValues())
    const parsed = parseOrionAccountStatusRecord(header, record)
    expect(parsed.kind).toBe('row')
    if (parsed.kind !== 'row') throw new Error('expected row')
    expect(parsed.row.accountId).toBe('DF-9001')
    expect(parsed.row.statutCode).toBe('CIBLE_PRIORITAIRE')
    expect(parsed.row.penetrabiliteScore).toBe(72)
    expect(parsed.row.couvertureTotale).toBe(18)
    expect(parsed.row.barrierePlateforme).toBe(false)
    expect(parsed.row.barrierePublique).toBe(true)
    expect(parsed.row.internalContactsCount).toBe(42)
  })

  it('transforme un marque-place entre crochets en null, sans le perdre du payload', () => {
    const record = buildRecord(header, baseValues())
    const parsed = parseOrionAccountStatusRecord(header, record)
    if (parsed.kind !== 'row') throw new Error('expected row')
    expect(parsed.row.sirenSiret).toBeNull()
    expect(parsed.row.payload['siren_siret']).toBe('[à compléter lot 2 — Pappers/Sirene]')
  })

  it('valueOrPlaceholderNull ne touche pas un texte normal contenant des crochets partiels', () => {
    expect(valueOrPlaceholderNull('Paris (75) [confirmé]')).toBe('Paris (75) [confirmé]')
    expect(valueOrPlaceholderNull('[non trouvé publiquement]')).toBeNull()
    expect(valueOrPlaceholderNull('')).toBeNull()
    expect(valueOrPlaceholderNull(undefined)).toBeNull()
  })

  it('refuse un compte sans identifiant', () => {
    const record = buildRecord(header, baseValues({ account_id: '' }))
    const parsed = parseOrionAccountStatusRecord(header, record)
    expect(parsed).toEqual({ kind: 'rejected', reason: 'compte sans identifiant' })
  })

  it('refuse un statut_code hors de la liste fermée à 9 valeurs', () => {
    const record = buildRecord(header, baseValues({ statut_code: 'INCONNU' }))
    const parsed = parseOrionAccountStatusRecord(header, record)
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') throw new Error('expected rejection')
    expect(parsed.reason).toContain('statut_code inconnu')
  })

  it('garde le reste des colonnes non typées dans payload, sans les dupliquer', () => {
    const record = buildRecord(header, baseValues({ recent_it_projects: 'Migration cloud 2026' }))
    const parsed = parseOrionAccountStatusRecord(header, record)
    if (parsed.kind !== 'row') throw new Error('expected row')
    expect(parsed.row.payload['recent_it_projects']).toBe('Migration cloud 2026')
    expect('recent_it_projects' in parsed.row).toBe(false)
  })
})

describe('parseOrionAnomalyRecord', () => {
  const header = ORION_ANOMALIES_HEADER

  it('lit une anomalie complète', () => {
    const record = buildRecord(header, {
      anomalie_id: 'AN-TEST',
      code: 'TEST_CODE',
      portee: 'Socle test',
      objet: 'Objet test',
      constat: 'Constat test',
      impact_commercial: 'Impact test',
      action_recommandee: 'Action test',
      severite: 'CRITIQUE',
      source: 'fixture',
      detecte_le: '2026-08-27',
    })
    const parsed = parseOrionAnomalyRecord(header, record)
    expect(parsed.kind).toBe('row')
    if (parsed.kind !== 'row') throw new Error('expected row')
    expect(parsed.row.anomalieId).toBe('AN-TEST')
    expect(parsed.row.severite).toBe('CRITIQUE')
  })

  it('refuse une sévérité hors de la liste fermée {CRITIQUE,MAJEUR,MINEUR}', () => {
    const record = buildRecord(header, {
      anomalie_id: 'AN-TEST',
      code: 'TEST_CODE',
      severite: 'GRAVISSIME',
    })
    const parsed = parseOrionAnomalyRecord(header, record)
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') throw new Error('expected rejection')
    expect(parsed.reason).toContain('sévérité inconnue')
  })

  it('refuse une anomalie sans code', () => {
    const record = buildRecord(header, { anomalie_id: 'AN-TEST', code: '', severite: 'MAJEUR' })
    const parsed = parseOrionAnomalyRecord(header, record)
    expect(parsed).toEqual({ kind: 'rejected', reason: 'code absent (AN-TEST)' })
  })
})

describe('toAccountStatusUpsertRow', () => {
  it("écrit l'account_id du pack dans source_id (la colonne NOT NULL de dataforge_account_statuses)", () => {
    const parsed = parseOrionAccountStatusRecord(
      [...ORION_ACCOUNTS_MASTER_HEADER],
      buildRecord(ORION_ACCOUNTS_MASTER_HEADER, { account_id: 'DF-0001', statut_code: 'CIBLE_PRIORITAIRE' }),
    )
    if (parsed.kind !== 'row') throw new Error(`ligne rejetée : ${parsed.reason}`)

    const row = toAccountStatusUpsertRow(parsed.row)

    expect(row.sourceId).toBe('DF-0001')
    expect('accountId' in row).toBe(false)
  })
})
