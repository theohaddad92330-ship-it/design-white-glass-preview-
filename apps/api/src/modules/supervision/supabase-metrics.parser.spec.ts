import { NOMS_AUTORISES, parserMetriquesPrometheus } from './supabase-metrics.parser'

describe('parserMetriquesPrometheus (format texte Prometheus)', () => {
  it('ignore commentaires # HELP / # TYPE et lignes vides', () => {
    const texte = ['# HELP node_load1 charge', '# TYPE node_load1 gauge', '', '   ', 'node_load1 0.42'].join('\n')
    expect(parserMetriquesPrometheus(texte)).toEqual([{ nom: 'node_load1', labels: {}, valeur: 0.42 }])
  })

  it('lit les labels, y compris guillemets échappés, virgules et accolades dans une valeur', () => {
    const texte = 'pg_database_size_bytes{datname="post,gres}",note="a\\"b"} 1024 1690000000000'
    expect(parserMetriquesPrometheus(texte)).toEqual([
      { nom: 'pg_database_size_bytes', labels: { datname: 'post,gres}', note: 'a"b' }, valeur: 1024 },
    ])
  })

  it('NaN, +Inf et -Inf donnent null, jamais 0', () => {
    const texte = 'node_load1 NaN\nnode_memory_MemTotal_bytes +Inf\nnode_memory_MemAvailable_bytes -Inf'
    expect(parserMetriquesPrometheus(texte).map(e => e.valeur)).toEqual([null, null, null])
  })

  it('un 0 mesuré reste 0 ; notation scientifique acceptée', () => {
    const r = parserMetriquesPrometheus('node_load1 0\nnode_memory_MemTotal_bytes 1.6e+10')
    expect(r.map(e => e.valeur)).toEqual([0, 1.6e10])
  })

  it('jette les lignes illisibles sans lever', () => {
    expect(parserMetriquesPrometheus('n{a="b" 1\nrien\nnode_load1 abc\nnode_load1 2')).toEqual([
      { nom: 'node_load1', labels: {}, valeur: 2 },
    ])
  })

  it('liste blanche de NOMS : le reste est jeté, pg_stat_replication_* ignoré', () => {
    const texte = [
      'node_load1 1',
      'secret_metric{token="x"} 5',
      'pg_stat_replication_pg_current_wal_lsn_bytes 9',
      'go_goroutines 12',
    ].join('\n')
    const r = parserMetriquesPrometheus(texte, NOMS_AUTORISES)
    expect(r.map(e => e.nom)).toEqual(['node_load1'])
  })
})
