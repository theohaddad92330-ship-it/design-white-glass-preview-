import {
  DATAFORGE_DISCARDED_COLUMNS,
  classifyDataforgeColumn,
  classifyDataforgeHeader,
  createColumnAudit,
} from './dataforge-columns'
import { DATAFORGE_V10_HEADER } from './dataforge-v10-header.fixture'

/**
 * Le registre de colonnes — la réponse au défaut mesuré le 29/08/2026.
 *
 * Le parseur ne gardait que trois préfixes (`account__`, `domain__`, `bellum_`),
 * la liste de la V9. La V10 en ajoute quatre — `domain_taxonomy__` (7 colonnes),
 * `domain_gap__` (4), `talent_supply__` (4), `tjm__` (3) : **18 colonnes sur 158
 * tombaient, et surtout ne comptaient pas comme rejets.** Un filtre silencieux
 * se lit « il n'y avait rien ».
 *
 * Deux exigences se répondent ici :
 *  · TOTALITÉ — aucune colonne du fichier réel ne peut être ni classée ni
 *    signalée ; ce que le registre ne connaît pas ressort en `unknown`, ce qui
 *    est précisément ce qui aurait fait voir l'arrivée de la V10 ;
 *  · VÉRIFIABILITÉ — un motif d'écart (« vide », « doublon de X ») n'est pas une
 *    affirmation dans un commentaire : l'audit le CONTRÔLE ligne par ligne et
 *    compte les contradictions.
 */
describe('registre de colonnes DATAFORGE', () => {
  it('lit un corpus non vide : les 158 colonnes du fichier canonique', () => {
    // Sans ce test, le registre se vérifierait contre sa propre copie.
    expect(DATAFORGE_V10_HEADER).toHaveLength(158)
    expect(new Set(DATAFORGE_V10_HEADER).size).toBe(158)
  })

  it('classe la TOTALITÉ de l’en-tête réel — zéro colonne inconnue', () => {
    const report = classifyDataforgeHeader([...DATAFORGE_V10_HEADER])
    expect(report.unknown).toEqual([])
    expect(
      report.typed.length + report.accountPayload.length + report.domainPayload.length + report.discarded.length,
    ).toBe(158)
  })

  it('les 18 colonnes que la V9 jetait sont désormais NOMMÉES, une par une', () => {
    const v10Only = DATAFORGE_V10_HEADER.filter(column =>
      /^(domain_taxonomy__|domain_gap__|talent_supply__|tjm__)/.test(column),
    )
    expect(v10Only).toHaveLength(18)
    for (const column of v10Only) {
      const fate = classifyDataforgeColumn(column)
      expect(fate.destination === 'domain' || fate.destination === 'discarded').toBe(true)
    }
  })

  it('treize entrent dans le payload domaine, cinq restent écartées AVEC leur raison', () => {
    const report = classifyDataforgeHeader([...DATAFORGE_V10_HEADER])
    const ingested = [...DATAFORGE_V10_HEADER].filter(
      column =>
        /^(domain_taxonomy__|domain_gap__|talent_supply__|tjm__)/.test(column) &&
        classifyDataforgeColumn(column).destination === 'domain',
    )
    expect(ingested).toHaveLength(13)
    expect(report.discarded.map(entry => entry.column).sort()).toEqual([
      'domain_gap__candidate_supply_rows',
      'domain_taxonomy__barriers',
      'domain_taxonomy__buyers',
      'domain_taxonomy__contracts',
      'domain_taxonomy__cross_sell_logic',
    ])
  })

  it('chaque écart porte une raison écrite, jamais un silence', () => {
    for (const [column, entry] of Object.entries(DATAFORGE_DISCARDED_COLUMNS)) {
      expect(entry.reason.trim().length).toBeGreaterThan(40)
      expect(column).not.toBe(entry.check.kind === 'duplicate-of' ? entry.check.column : '')
    }
  })

  it('une colonne inconnue du registre ressort — c’est ce qui aurait vu arriver la V10', () => {
    const report = classifyDataforgeHeader(['bellum_account_source_id', 'v11_nouvelle_famille__quelque_chose'])
    expect(report.unknown).toEqual(['v11_nouvelle_famille__quelque_chose'])
    expect(classifyDataforgeColumn('v11_nouvelle_famille__quelque_chose').destination).toBe('unknown')
  })
})

describe('audit de colonnes — un motif d’écart se CONTRÔLE, il ne se déclare pas', () => {
  const header = [
    'bellum_account_source_id',
    'domain__buyer_personas',
    'domain_taxonomy__buyers',
    'domain_taxonomy__cross_sell_logic',
    'v11_inconnue',
  ]

  function row(overrides: Record<string, string>): Record<string, string> {
    return Object.fromEntries(header.map(column => [column, overrides[column] ?? '']))
  }

  it('compte les cellules non vides de chaque colonne écartée', () => {
    const audit = createColumnAudit(header)
    audit.observe(row({ domain__buyer_personas: 'DAF; COO', domain_taxonomy__buyers: 'DAF; COO' }))
    audit.observe(row({ domain__buyer_personas: 'DAF; COO', domain_taxonomy__buyers: 'DAF; COO' }))
    const report = audit.report()
    expect(report.rows).toBe(2)
    const buyers = report.discarded.find(entry => entry.column === 'domain_taxonomy__buyers')
    expect(buyers).toMatchObject({ nonEmptyRows: 2, contradictions: 0 })
    // La colonne mesurée vide dans le pack l'est ici aussi — et elle est
    // COMPTÉE à zéro, ce qui n'est pas la même chose que de ne pas la citer.
    expect(report.discarded.find(entry => entry.column === 'domain_taxonomy__cross_sell_logic')).toMatchObject({
      nonEmptyRows: 0,
      contradictions: 0,
    })
  })

  it('sait dire NON : un doublon qui diverge est compté comme contradiction', () => {
    const audit = createColumnAudit(header)
    audit.observe(row({ domain__buyer_personas: 'DAF', domain_taxonomy__buyers: 'DAF' }))
    audit.observe(row({ domain__buyer_personas: 'DAF', domain_taxonomy__buyers: 'DSI' }))
    const buyers = audit.report().discarded.find(entry => entry.column === 'domain_taxonomy__buyers')
    expect(buyers?.contradictions).toBe(1)
  })

  it('sait dire NON : une colonne déclarée vide qui ne l’est pas est une contradiction', () => {
    const audit = createColumnAudit(header)
    audit.observe(row({ domain_taxonomy__cross_sell_logic: 'adjacence ERP → data' }))
    const entry = audit.report().discarded.find(row_ => row_.column === 'domain_taxonomy__cross_sell_logic')
    expect(entry).toMatchObject({ nonEmptyRows: 1, contradictions: 1 })
  })

  it('une colonne inconnue est comptée, pas avalée', () => {
    const audit = createColumnAudit(header)
    audit.observe(row({ v11_inconnue: 'une valeur' }))
    audit.observe(row({}))
    expect(audit.report().unknown).toEqual([{ column: 'v11_inconnue', nonEmptyRows: 1 }])
  })

  it('une référence de doublon ABSENTE de l’en-tête ne passe pas pour une égalité', () => {
    // `domain_taxonomy__buyers` sans `domain__buyer_personas` : on ne peut PAS
    // conclure au doublon, donc chaque ligne est une contradiction.
    const audit = createColumnAudit(['domain_taxonomy__buyers'])
    audit.observe({ domain_taxonomy__buyers: 'DAF' })
    const entry = audit.report().discarded.find(row_ => row_.column === 'domain_taxonomy__buyers')
    expect(entry?.contradictions).toBe(1)
  })
})
