import {
  findAnomalyCodesMissingFromChunkTitles,
  parseOrionAnomalyRecord,
  parseOrionRagChunkRecord,
} from '../modules/dataforge/orion-csv'
import {
  ORION_ANOMALIES_HEADER,
  ORION_KNOWN_ANOMALY_CODES,
  ORION_QUALITY_GUARD_CHUNK_TYPE,
  ORION_RAG_CHUNKS_HEADER,
} from '../modules/dataforge/orion-v12-headers.fixture'

/**
 * Point 6 de la tâche — le registre qualité ORION V12 n'est pas de la
 * documentation : chacune des 20 anomalies DOIT être lisible depuis une
 * recherche produit, via son miroir `type_chunk = GARDE_FOU_QUALITE` dans
 * `dataforge_rag_chunks`. Sans ce miroir, une anomalie ingérée dans
 * `dataforge_data_anomalies` ne remonte jamais dans une réponse — elle
 * redevient de la documentation malgré l'ingestion.
 *
 * Le pack réel n'est jamais commité : cette garde construit des lignes
 * SYNTHÉTIQUES (mêmes 20 codes courts que le pack — un identifiant n'est pas
 * une donnée sensible, contrairement au `constat`/`impact_commercial`) et fait
 * tourner les VRAIS parseurs de production dessus, pour prouver que le
 * MÉCANISME de correspondance fonctionne — pas seulement qu'il est décrit.
 */
function buildCsvRecord(header: readonly string[], values: Record<string, string>): string {
  return header.map(column => values[column] ?? '').join(';')
}

describe('ORION V12 — chaque anomalie a son miroir RAG garde-fou (lisible depuis le produit)', () => {
  it('lit un corpus non vide — 20 codes mesurés, ni plus ni moins', () => {
    expect(ORION_KNOWN_ANOMALY_CODES.length).toBe(20)
    expect(new Set(ORION_KNOWN_ANOMALY_CODES).size).toBe(20)
  })

  it('quand chaque code a son chunk garde-fou, la correspondance est complète', () => {
    const anomalyCodes = ORION_KNOWN_ANOMALY_CODES.map(code => {
      const record = buildCsvRecord(ORION_ANOMALIES_HEADER, {
        anomalie_id: `AN-${code}`,
        code,
        severite: 'MAJEUR',
      })
      const parsed = parseOrionAnomalyRecord(ORION_ANOMALIES_HEADER, record)
      if (parsed.kind !== 'row') throw new Error(`fixture invalide pour ${code}`)
      return parsed.row.code
    })

    const chunkTitles = ORION_KNOWN_ANOMALY_CODES.map(code => {
      const record = buildCsvRecord(ORION_RAG_CHUNKS_HEADER, {
        chunk_id: `CK-${code}`,
        type_chunk: ORION_QUALITY_GUARD_CHUNK_TYPE,
        titre: `Alerte qualité ${code}`,
        texte: `[MAJEUR] Alerte de test pour ${code}.`,
        priorite_indexation: '0',
      })
      const parsed = parseOrionRagChunkRecord(ORION_RAG_CHUNKS_HEADER, record)
      if (parsed.kind !== 'row') throw new Error(`fixture invalide pour ${code}`)
      return parsed.row.titre ?? ''
    })

    expect(findAnomalyCodesMissingFromChunkTitles(anomalyCodes, chunkTitles)).toEqual([])
  })

  it('la garde sait dire NON — un code sans miroir RAG est nommé, pas juste signalé', () => {
    const allCodes = [...ORION_KNOWN_ANOMALY_CODES]
    const orphanCode = allCodes[0] as string
    const titlesMissingOneMirror = allCodes.slice(1).map(code => `Alerte qualité ${code}`)

    const missing = findAnomalyCodesMissingFromChunkTitles(allCodes, titlesMissingOneMirror)
    expect(missing).toEqual([orphanCode])
  })
})
