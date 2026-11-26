import { describe, expect, it } from 'vitest'
import {
  bandeauFond,
  resumeIncidents,
  luIlYA,
  bandeauRailway,
  bandeauDisponibilite,
  bandeauSupabase,
  etatCible,
  formatCommit,
  formatMs,
  formatTls,
  niveauTls,
  formatGoDirect,
  formatUsdMois,
  bandeauSupervision,
  formatCpuSupabase,
  formatUtilisation,
  formatCharge,
  formatCoeurs,
  formatFraicheur,
  formatGo,
  formatNombre,
  formatPct,
  NON_MESURE,
  pointsSparkline,
} from './supervision.logic'

describe('supervision — null ≠ 0', () => {
  it('chaque formateur rend « non mesuré » sur null, jamais « 0 »', () => {
    for (const f of [formatPct, formatGo, formatCoeurs, formatCharge, formatNombre, formatFraicheur]) {
      expect(f(null)).toBe(NON_MESURE)
    }
  })

  it('une vraie mesure à 0 reste 0', () => {
    expect(formatNombre(0)).toBe('0')
    expect(formatPct(0)).toBe('0 %')
  })

  it('formate les unités', () => {
    expect(formatPct(42.456)).toBe('42,5 %')
    expect(formatGo(39.3 * 1024 ** 3)).toBe('39,3 Go')
    expect(formatCoeurs(1.234)).toBe('1,23')
    expect(formatCharge(3.5)).toBe('3,50')
    expect(formatFraicheur(15.4)).toBe('il y a 15 s')
    expect(formatFraicheur(3600 * 2)).toBe('il y a 120 min')
  })
})

describe('bandeauSupervision', () => {
  it('non configurée ⇒ nomme les variables absentes', () => {
    expect(bandeauSupervision({ etat: 'non_configure' })).toBe('Supervision non configurée (GRAFANA_PROM_* absentes)')
  })

  it('injoignable ⇒ raison', () => {
    expect(bandeauSupervision({ etat: 'injoignable', raison: 'HTTP 401' })).toBe('Grafana injoignable — HTTP 401')
  })

  it('panne partielle ⇒ nomme les requêtes en échec', () => {
    expect(
      bandeauSupervision({
        etat: 'mesure',
        mesureA: '2026-09-30T12:00:00Z',
        hotes: [],
        flotte: { runnersVus: null, coeurs: null },
        series: { cpuPct: [], memPct: [] },
        requetesEnEchec: ['hote_mem_pct'],
      }),
    ).toBe('Mesure partielle — requêtes en échec : hote_mem_pct')
  })

  it('tout mesuré ⇒ aucun bandeau', () => {
    expect(
      bandeauSupervision({
        etat: 'mesure',
        mesureA: '2026-09-30T12:00:00Z',
        hotes: [],
        flotte: { runnersVus: 10, coeurs: 40 },
        series: { cpuPct: [], memPct: [] },
        requetesEnEchec: [],
      }),
    ).toBeNull()
  })
})

describe('pointsSparkline', () => {
  it('garde les trous (null) comme trous', () => {
    expect(
      pointsSparkline([
        { t: 1, v: 10 },
        { t: 2, v: null },
      ]),
    ).toEqual([{ value: 10 }, { value: null }])
  })
})

describe('supervision Supabase — null ≠ 0', () => {
  it('CPU : null à la 1re lecture est nommé, un vrai 0 % reste 0', () => {
    expect(formatCpuSupabase(null, true)).toBe('non mesuré (1ʳᵉ lecture)')
    expect(formatCpuSupabase(null, false)).toBe(NON_MESURE)
    expect(formatCpuSupabase(0, false)).toBe('0 %')
    expect(formatCpuSupabase(41.26, false)).toBe('41,3 %')
  })

  it('utilisation « n / max » : jamais 0 pour une valeur absente', () => {
    expect(formatUtilisation(7, 60)).toBe('7 / 60')
    expect(formatUtilisation(0, 60)).toBe('0 / 60')
    expect(formatUtilisation(7, null)).toBe('7 / non mesuré')
    expect(formatUtilisation(null, 60)).toBe('non mesuré / 60')
  })

  it('bandeau : non configuré, injoignable, partiel nommé, complet = aucun', () => {
    expect(bandeauSupabase({ etat: 'non_configure' })).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(bandeauSupabase({ etat: 'injoignable', raison: 'HTTP 401' })).toContain('HTTP 401')
    const base = {
      etat: 'mesure' as const,
      lueA: 0,
      ageSec: 0,
      perime: false,
      mesureA: 'x',
      instance: {
        coeurs: 2,
        cpuPct: 1,
        cpuPremiereLecture: false,
        load1: 1,
        memPct: 1,
        memTotalOctets: 1,
        disques: [],
      },
      connexions: { backendsTotal: 1, backendsParBase: [], maxConnections: 1, pgbouncer: [] },
      volumes: [],
    }
    expect(bandeauSupabase({ ...base, absentes: ['node_load1', 'pgbouncer_databases_pool_size'] })).toContain(
      'node_load1, pgbouncer_databases_pool_size',
    )
    expect(bandeauSupabase({ ...base, absentes: [] })).toBeNull()
  })
})

describe('supervision Disponibilité — null ≠ 0', () => {
  it('état d’une cible : OK sur N/M, dégradé quand hotesOk < hotesTotal, inconnu sans mesure', () => {
    expect(etatCible(4, 4)).toEqual({ niveau: 'ok', texte: 'OK sur 4/4' })
    expect(etatCible(3, 4)).toEqual({ niveau: 'degrade', texte: 'OK sur 3/4' })
    expect(etatCible(0, 4)).toEqual({ niveau: 'degrade', texte: 'OK sur 0/4' })
    expect(etatCible(null, 4)).toEqual({ niveau: 'inconnu', texte: NON_MESURE })
    expect(etatCible(4, null)).toEqual({ niveau: 'inconnu', texte: NON_MESURE })
  })

  it('TLS : orange sous 21 j, rouge sous 7 j, null nommé', () => {
    expect(niveauTls(60)).toBe('ok')
    expect(niveauTls(21)).toBe('ok')
    expect(niveauTls(20.9)).toBe('orange')
    expect(niveauTls(7)).toBe('orange')
    expect(niveauTls(6.9)).toBe('rouge')
    expect(niveauTls(-1)).toBe('rouge')
    expect(niveauTls(null)).toBe('inconnu')
    expect(formatTls(45.4)).toBe('expire dans 45 j')
    expect(formatTls(0.2)).toBe('expire dans 0 j')
    expect(formatTls(null)).toBe(NON_MESURE)
  })

  it('latence en ms : null ⇒ non mesuré, 0 reste 0', () => {
    expect(formatMs(null)).toBe(NON_MESURE)
    expect(formatMs(0)).toBe('0 ms')
    expect(formatMs(123.6)).toBe('124 ms')
  })

  it('commit : abrégé à 7 caractères, null ⇒ non mesuré', () => {
    expect(formatCommit('abcdef0123456789')).toBe('abcdef0')
    expect(formatCommit(null)).toBe(NON_MESURE)
  })

  it('bandeau : sondes pas encore déployées quand aucune série probe_*', () => {
    const base = {
      etat: 'mesure' as const,
      mesureA: 'x',
      cibles: [],
      commits: { api: null, ia: null, main: null },
      requetesEnEchec: [],
    }
    expect(bandeauDisponibilite({ ...base, sondesDeployees: false })).toBe(
      'Sondes pas encore déployées (aucune série probe_*)',
    )
    expect(bandeauDisponibilite({ ...base, sondesDeployees: true })).toBeNull()
    expect(bandeauDisponibilite({ ...base, sondesDeployees: true, requetesEnEchec: ['dispo_tls_jours'] })).toContain(
      'dispo_tls_jours',
    )
    expect(bandeauDisponibilite({ etat: 'non_configure' })).toContain('GRAFANA_PROM_')
    expect(bandeauDisponibilite({ etat: 'injoignable', raison: 'HTTP 401' })).toBe('Grafana injoignable — HTTP 401')
  })
})

describe('supervision Railway — null ≠ 0', () => {
  it('formatGoDirect et formatUsdMois : null ⇒ non mesuré, 0 reste 0', () => {
    expect(formatGoDirect(null)).toBe(NON_MESURE)
    expect(formatUsdMois(null)).toBe(NON_MESURE)
    expect(formatGoDirect(0)).toBe('0 Go')
    expect(formatUsdMois(0)).toBe('0 $/mois')
    expect(formatUsdMois(40.5)).toMatch(/^40,5 \$\/mois$/)
  })

  it('bandeauRailway nomme chaque état, et le total partiel', () => {
    expect(bandeauRailway({ etat: 'non_configure' })).toContain('RAILWAY_METRICS_TOKEN')
    expect(bandeauRailway({ etat: 'injoignable', raison: 'HTTP 401' })).toBe('Railway injoignable — HTTP 401')
    const base = {
      etat: 'mesure' as const,
      lueA: 0,
      ageSec: 0,
      perime: false,
      mesureA: '',
      fenetre: '24h' as const,
      services: [],
      totalEstimeUsd: 10,
      tarifs: { vcpuParMois: 20, goMemParMois: 10, source: 's' },
      nonEvalue: [],
    }
    expect(bandeauRailway({ ...base, totalPartiel: false })).toBeNull()
    expect(bandeauRailway({ ...base, totalPartiel: true })).toContain('partiel')
  })
})

describe('supervision — lecture de fond (30/09)', () => {
  const fond = { lueA: 0, ageSec: 12, perime: false }
  const railway = {
    etat: 'mesure' as const,
    mesureA: 'x',
    fenetre: '24h' as const,
    services: [],
    totalEstimeUsd: null,
    totalPartiel: false,
    tarifs: { vcpuParMois: 1, goMemParMois: 1, source: 'x' },
    nonEvalue: [],
    ...fond,
  }

  it('luIlYA : secondes puis minutes, rien sans mesure', () => {
    expect(luIlYA(railway)).toBe('lu il y a 12 s')
    expect(luIlYA({ ...railway, ageSec: 300 })).toBe('lu il y a 5 min')
    expect(luIlYA({ etat: 'en_attente' })).toBeNull()
  })

  it('en_attente : première lecture en cours', () => {
    expect(bandeauRailway({ etat: 'en_attente' })).toBe('Première lecture en cours')
    expect(bandeauSupabase({ etat: 'en_attente' })).toBe('Première lecture en cours')
  })

  it('bandeauFond : rien si tout va bien ; discret si dernière erreur ; orange si périmé', () => {
    expect(bandeauFond(railway)).toBeNull()
    const discret = bandeauFond({ ...railway, derniereErreur: 'délai dépassé (20 s)' })
    expect(discret?.niveau).toBe('discret')
    expect(discret?.texte).toBe('Dernière lecture en échec : délai dépassé (20 s) — valeurs il y a 12 s')
    const orange = bandeauFond({ ...railway, ageSec: 400, perime: true })
    expect(orange?.niveau).toBe('orange')
    expect(orange?.texte).toContain('depuis il y a 7 min')
  })
})

describe('incidents infra ouverts', () => {
  it('liste vide ⇒ « aucun incident ouvert »', () => {
    expect(resumeIncidents({ etat: 'mesure', incidents: [] })).toEqual({
      etat: 'aucun',
      texte: 'aucun incident ouvert',
    })
  })

  it('Redis illisible ou API injoignable ⇒ jamais « aucun »', () => {
    const attendu = { etat: 'illisible', texte: 'état des incidents non lisible' }
    expect(resumeIncidents({ etat: 'illisible' })).toEqual(attendu)
    expect(resumeIncidents(null)).toEqual(attendu)
  })

  it('un incident ouvert : règle, sujet, valeur, seuil, depuis et lien vers son onglet', () => {
    const r = resumeIncidents({
      etat: 'mesure',
      incidents: [
        {
          regle: 'runner_disque',
          sujet: 'runner-1',
          message: 'Le disque dépasse 85 %',
          valeur: 91.234,
          seuil: 85,
          unite: '%',
          depuis: '2026-09-30T10:00:00.000Z',
          onglet: 'runners',
        },
      ],
    })
    expect(r.etat).toBe('ouverts')
    if (r.etat !== 'ouverts') return
    expect(r.lignes[0]).toMatchObject({
      cle: 'runner_disque:runner-1',
      titre: 'runner_disque — runner-1',
      detail: 'Le disque dépasse 85 % · mesuré 91,2 % (seuil 85 %) · depuis 2026-09-30 10:00 UTC',
      lien: '/supervision',
    })
  })

  it('le lien d’un onglet autre que runners porte ?onglet=', () => {
    const r = resumeIncidents({
      etat: 'mesure',
      incidents: [
        {
          regle: 'tls_expire',
          sujet: 'site',
          message: 'm',
          valeur: 3,
          seuil: 14,
          unite: 'jours',
          depuis: '2026-09-30T10:00:00.000Z',
          onglet: 'disponibilite',
        },
      ],
    })
    expect(r.etat === 'ouverts' && r.lignes[0]?.lien).toBe('/supervision?onglet=disponibilite')
  })
})
