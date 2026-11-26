import { describe, expect, it } from 'vitest'
import type { AccountSignalItem, WatchlistRule } from '@bellum/contracts'
import { isOutOfTradeHiring } from '@/features/discover/lib/discover-hiring-domain'
import {
  buildAccountRankReasons,
  buildNeedLine,
  buildWhyLine,
  buildNextActionLabel,
  buildWatchlistItems,
  countWatchlistFacets,
  effectiveFilters,
  filterWatchlistItems,
  groupWatchlistByAccount,
  offerAttachmentView,
  shortPersonName,
  signalDiscardReason,
  signalNeedKind,
  WATCHLIST_DEFAULT_FILTERS,
  WATCHLIST_FILTERS,
} from './watchlist'

/**
 * #4088 — « Ce qui bouge sur tes comptes » : un COMPTE par ligne, le signal le plus
 * fort, la phrase « pourquoi ça compte », « qui ça concerne », la prochaine action,
 * trois filtres, et ce qui est ÉCARTÉ. Chaque test sait dire NON.
 */

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)

const signal = (overrides: Partial<AccountSignalItem>): AccountSignalItem => ({
  id: 's',
  account_id: A1,
  account_created_at: day(200),
  account_score: 8,
  company_name: 'Nordia',
  date: day(3),
  label: 'Programme data',
  sector: 'Services',
  source: 'Communiqué',
  type: 'Recrutement',
  ...overrides,
})

const marie = { contact_id: 'c1', name: 'Marie Durand', title: 'Directrice des SI' }
const cyber = { placedRoles: ['cybersécurité'], noGoSectors: [] }

describe('#4088.2 — « pourquoi ça compte » : une phrase dérivée du TYPE, jamais inventée', () => {
  it.each([
    ['Recrutement', 'hiring', /renfort/],
    ['acquisition', 'mna', /intégration/],
    ['Rachat', 'mna', /intégration/],
    ['Fusion', 'mna', /intégration/],
    ['Nomination', 'exec', /prestataires/],
    ['levee_fonds', 'funding', /montée en charge/],
    ['Croissance', 'funding', /montée en charge/],
    ['appel_offres', 'tender', /projet/],
    ['Contrat', 'tender', /projet/],
  ])('type « %s » → %s', (type, kind, phrase) => {
    expect(signalNeedKind(type)).toBe(kind)
    expect(buildNeedLine({ signalType: type })).toMatch(phrase)
  })

  it('NON : un type inconnu n’a aucune phrase (et aucun pourcentage nulle part)', () => {
    expect(signalNeedKind('Météo')).toBeNull()
    expect(buildNeedLine({ signalType: 'Météo' })).toBeNull()
    for (const type of ['Recrutement', 'acquisition', 'Nomination', 'levee_fonds', 'appel_offres']) {
      expect(buildNeedLine({ signalType: type })).not.toMatch(/%|\d/)
    }
  })
})

describe('#4088.12 — « pourquoi ça compte » n’est JAMAIS vide', () => {
  it('besoin établi : la phrase du besoin, inchangée', () => {
    expect(buildWhyLine({ signalType: 'Recrutement', sector: 'Banque' })).toMatch(/renfort/)
  })

  it('type sans besoin : on dit pourquoi on montre la ligne (type + secteur), sans inventer de besoin', () => {
    const line = buildWhyLine({ signalType: 'partenariat', sector: 'Assurance' })
    expect(line).toBe(
      'Signal « partenariat » · Assurance : aucun besoin de prestation identifié pour ce type de signal : à qualifier avec toi.',
    )
  })

  it('#4088 (recette 15/10) — un signal SANS type (libellé de repli « Signal ») ne s’écrit jamais « Signal « Signal » »', () => {
    const line = buildWhyLine({ signalType: 'Signal', sector: 'Assurance' })
    expect(line).not.toMatch(/Signal\s+«\s*Signal\s*»/)
    expect(line).toContain('Assurance')
  })
  // #4088 (recette R16, MUTUELLE UNEO) : « Signal « Signal » · … » — un libellé de type
  // répété comme valeur. Un type vide ou générique s'affiche seul, jamais entre guillemets.
  it.each(['Signal', 'signal', ' SIGNAL ', 'Signaux', 'Signal détecté'])(
    '#4088 — le type générique « %s » ne se répète pas comme valeur',
    signalType => {
      const line = buildWhyLine({ signalType, sector: 'Assurance' })
      expect(line).not.toMatch(/signal\s*«\s*signal/i)
      expect(line).not.toMatch(/«\s*signal[^»]*»/i)
      expect(line).toMatch(/^Signal · Assurance/)
    },
  )

  it('NON : ni secteur ni type — la ligne le dit en clair, pas de « undefined » ni de case vide', () => {
    const line = buildWhyLine({ signalType: '', sector: '' })
    expect(line.length).toBeGreaterThan(10)
    expect(line).not.toMatch(/undefined|null|«\s*»/)
  })
})

describe('#4088.2 — une ligne = un compte, le signal le plus fort en tête, « +N autres » derrière', () => {
  it('le type qui porte un besoin passe avant un type inconnu, même moins récent', () => {
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([
        signal({ id: 'inconnu', type: 'Météo', label: 'Canicule', date: day(1) }),
        signal({ id: 'recrute', type: 'Recrutement', label: 'Recrute 12 data engineers', date: day(20) }),
        signal({ id: 'marche', type: 'appel_offres', label: 'AO SI', date: day(10) }),
      ]),
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]?.latest.id).toBe('marche')
    expect(groups[0]?.others.map(item => item.id)).toEqual(['recrute', 'inconnu'])
  })

  it('l’importance départage deux besoins de même nature (haute avant basse)', () => {
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([
        signal({ id: 'basse', importance: 'low', date: day(1) }),
        signal({ id: 'haute', importance: 'high', date: day(30) }),
      ]),
    )
    expect(groups[0]?.latest.id).toBe('haute')
  })

  it('le décideur voyage avec le compte ; sans contact, null — jamais un nom deviné', () => {
    const [withHead, without] = groupWatchlistByAccount(
      buildWatchlistItems([
        signal({ id: 'a', account_id: A1, decision_maker: marie }),
        signal({ id: 'b', account_id: A2, account_score: 5 }),
      ]),
    )
    expect(withHead?.decisionMaker).toEqual({ name: 'Marie Durand', title: 'Directrice des SI' })
    expect(without?.decisionMaker).toBeNull()
  })
})

describe('#4088.4 — « prochaine action » : un verbe + une personne, selon le type', () => {
  // #4283.1 — un type « Nomination » ne vaut « exec » que si le libellé porte un changement de dirigeant.
  const group = (type: string, decision_maker: AccountSignalItem['decision_maker']) =>
    groupWatchlistByAccount(
      buildWatchlistItems([
        signal({ type, decision_maker, ...(type === 'Nomination' ? { label: 'Nouveau DSI chez Nordia' } : {}) }),
      ]),
    )[0]!

  it('Marie Durand → « Marie D. »', () => {
    expect(shortPersonName('Marie Durand')).toBe('Marie D.')
    expect(shortPersonName('Madonna')).toBe('Madonna')
    expect(shortPersonName('  ')).toBe('')
  })

  it.each([
    ['Recrutement', 'Proposer un profil à Marie D.'],
    ['Nomination', 'Écrire à Marie D.'],
    ['levee_fonds', 'Écrire à Marie D.'],
    ['acquisition', 'Appeler Marie D.'],
    ['appel_offres', 'Appeler Marie D.'],
    ['Météo', 'Appeler Marie D.'],
  ])('type « %s » → %s', (type, expected) => {
    expect(buildNextActionLabel(group(type, marie))).toBe(expected)
  })

  it('NON : sans contact connu, aucun nom — « Identifier le décideur »', () => {
    expect(buildNextActionLabel(group('Recrutement', null))).toBe('Identifier le décideur')
    expect(buildNextActionLabel(group('Recrutement', undefined))).not.toMatch(/ à |Appeler/)
  })
})

describe('#4088.3 — la raison de rang, en clair, trois au plus, jamais un score nu', () => {
  const rules = [{ id: 'r1', kind: 'sector', value: 'Services' }] as unknown as WatchlistRule[]

  it('compte prioritaire · N signaux ce mois-ci · règle', () => {
    const [g] = groupWatchlistByAccount(
      buildWatchlistItems([
        signal({ id: 'a', date: day(2) }),
        signal({ id: 'b', date: day(5) }),
        signal({ id: 'c', date: day(9) }),
      ]),
    )
    expect(buildAccountRankReasons(g!, rules)).toEqual([
      'Compte prioritaire',
      '3 signaux ce mois-ci',
      'correspond à ta règle « Services »',
    ])
  })

  it('NON : un compte sans score ni règle ni signal récent n’a aucune raison — pas de « 0 », pas de score', () => {
    const [g] = groupWatchlistByAccount(
      buildWatchlistItems([signal({ account_score: null, date: day(200), sector: 'Banque' })]),
    )
    const reasons = buildAccountRankReasons(g!, rules)
    expect(reasons).toEqual([])
    expect(reasons.join(' ')).not.toMatch(/\d\/10|\b0\b/)
  })

  it('un seul signal ce mois-ci s’écrit au singulier', () => {
    const [g] = groupWatchlistByAccount(buildWatchlistItems([signal({ date: day(2), account_score: 4 })]))
    expect(buildAccountRankReasons(g!, [])).toEqual(['1 signal ce mois-ci'])
  })
})

describe('#4088.5 — trois filtres, « À traiter » par défaut, un filtre à 0 ne s’affiche ni ne s’applique', () => {
  it('les filtres sont À traiter / prioritaires / règles — plus Nouveaux, À analyser, À requalifier', () => {
    expect([...WATCHLIST_FILTERS]).toEqual(['todo', 'priority', 'rules'])
    expect([...WATCHLIST_DEFAULT_FILTERS]).toEqual(['todo'])
  })

  it('« À traiter » retire les signaux qui ont déjà déclenché une action', () => {
    const items = buildWatchlistItems([
      signal({
        id: 'fait',
        action_id: '33333333-3333-4333-8333-333333333333',
        action_label: 'Appeler',
        history_status: 'active',
      }),
      signal({ id: 'afaire', account_id: A2 }),
    ])
    // `triggeredActionLabel` ne vient que de la jointure historique : on le pose comme l'API le rend.
    const done = items.map(item => (item.id === 'fait' ? { ...item, triggeredActionLabel: 'Appeler' } : item))
    const kept = filterWatchlistItems(done, { active: new Set(['todo']), query: '', rules: [] })
    expect(kept.map(item => item.id)).toEqual(['afaire'])
  })

  it('les comptes sont comptés par COMPTE, pas par signal', () => {
    const items = buildWatchlistItems([
      signal({ id: 'a' }),
      signal({ id: 'b' }),
      signal({ id: 'c', account_id: A2, account_score: 4 }),
    ])
    const counts = countWatchlistFacets(items, { query: '', rules: [] })
    expect(counts.todo).toBe(2)
    expect(counts.priority).toBe(1)
    expect(counts.rules).toBe(0)
  })

  it('NON : un filtre dont le compte vaut 0 n’est pas appliqué (la vue ne se vide pas pour un filtre invisible)', () => {
    const counts = { todo: 0, priority: 2, rules: 0 }
    expect([...effectiveFilters(new Set(['todo', 'priority']), counts)]).toEqual(['priority'])
    expect([...effectiveFilters(new Set(['todo']), counts)]).toEqual([])
  })
})

describe('#4088.7 — ce qui est écarté de la vue par défaut (jamais supprimé), UN prédicat', () => {
  const item = (type: string, label: string) => ({ signalType: type, signalLabel: label })

  it.each([
    ['Recrutement', 'Offre de stage — développeur', 'internship'],
    ['Recrutement', 'Alternance data analyst', 'internship'],
    ['Recrutement', 'Internship software engineer', 'internship'],
    ['Presse', 'Inflation : le marché attentiste', 'general'],
    ['Résultats financiers', 'Publication des résultats annuels', 'general'],
  ])('%s « %s » → %s', (type, label, reason) => {
    expect(signalDiscardReason(item(type, label), undefined)).toBe(reason)
  })

  it('une offre hors du domaine déclaré n’est JAMAIS écartée (#4284.10) : elle est marquée hors métier', () => {
    expect(signalDiscardReason(item('Recrutement', 'Recrutement — Ingénieur HSE'), cyber)).toBeNull()
    expect(isOutOfTradeHiring({ type: 'Recrutement', label: 'Recrutement — Ingénieur HSE' }, cyber)).toBe(true)
    expect(isOutOfTradeHiring({ type: 'Recrutement', label: 'Recrutement — Ingénieur HSE' }, undefined)).toBe(false)
    expect(signalDiscardReason(item('Recrutement', 'Recrutement IT — Analyste cybersécurité'), cyber)).toBeNull()
  })

  it('NON : profil muet, on ne peut pas dire « hors domaine » ; un vrai besoin n’est jamais « général »', () => {
    expect(signalDiscardReason(item('Recrutement', 'Recrutement — Ingénieur HSE'), undefined)).toBeNull()
    expect(
      signalDiscardReason(item('Recrutement', 'Recrute 12 data engineers (presse spécialisée)'), undefined),
    ).toBeNull()
    expect(signalDiscardReason(item('levee_fonds', 'Série B annoncée dans la presse'), undefined)).toBeNull()
  })

  it('NON : « stage » dans un signal qui n’est pas une offre ne l’écarte pas', () => {
    expect(signalDiscardReason(item('Projet', 'Passage au stage 2 de la transformation SI'), undefined)).toBeNull()
  })

  it('un type inconnu mais pas « presse » reste affiché, sans phrase', () => {
    expect(signalDiscardReason(item('Météo', 'Canicule'), undefined)).toBeNull()
  })

  it('le compte est écarté quand son signal le plus fort l’est, et un signal utile le sauve', () => {
    const onlyIntern = groupWatchlistByAccount(
      buildWatchlistItems([signal({ id: 'stage', type: 'Recrutement', label: 'Stage développeur' })]),
    )
    expect(onlyIntern[0]?.discardReason).toBe('internship')

    const mixed = groupWatchlistByAccount(
      buildWatchlistItems([
        signal({ id: 'stage', type: 'Recrutement', label: 'Stage développeur', date: day(1) }),
        signal({ id: 'ao', type: 'appel_offres', label: 'AO SI', date: day(40) }),
      ]),
    )
    expect(mixed[0]?.discardReason).toBeNull()
    expect(mixed[0]?.latest.id).toBe('ao')
    // Rien n'est perdu : le stage reste joignable derrière « +N autres ».
    expect(mixed[0]?.others.map(i => i.id)).toEqual(['stage'])
  })
})

describe('#4088.3 — un compte sans aucune raison à nommer sort de la vue par défaut', () => {
  const undated = signal({
    id: 'nu',
    type: '',
    label: 'Quelque chose',
    date: '',
    account_created_at: '',
    account_score: 3,
  })

  it('ni priorité, ni signal du mois, ni règle, ni nature ni date : motif « noReason », pas de cellule vide', () => {
    const [group] = groupWatchlistByAccount(buildWatchlistItems([undated]))
    expect(group?.discardReason).toBe('noReason')
  })

  it('une règle qui correspond SUFFIT : le compte reste dans la vue', () => {
    const rules = [{ id: 'r', kind: 'account', value: 'Nordia' }] as unknown as WatchlistRule[]
    const [group] = groupWatchlistByAccount(buildWatchlistItems([undated]), undefined, undefined, rules)
    expect(group?.discardReason).toBeNull()
  })

  it('un signal daté et typé garde sa ligne (type + fraîcheur) : jamais écarté à tort', () => {
    const [group] = groupWatchlistByAccount(buildWatchlistItems([signal({ id: 'ok' })]))
    expect(group?.discardReason).toBeNull()
  })
})

describe('#4437.5 — le rattachement d’une offre se lit, « non classé » se nomme', () => {
  it('compétences + famille quand l’intitulé les nomme', () => {
    expect(
      offerAttachmentView({
        status: 'attached',
        fact_type: 'hiring',
        skills: ['React'],
        job_family: 'developpement',
        extract: 'Développeur React',
      }),
    ).toEqual({ unclassified: false, factType: 'hiring', skills: ['React'], family: 'developpement' })
  })

  // #4437.5 — le TYPE est le troisième rattachement : « hiring » / « project » se disent ; « other » ne dit rien.
  it('le type de fait suit : un type « autre » ou absent reste nu', () => {
    const base = { status: 'attached' as const, skills: ['Figma'], job_family: null, extract: 'Ninja du pixel' }
    expect(offerAttachmentView({ ...base, fact_type: 'project' })).toMatchObject({ factType: 'project' })
    expect(offerAttachmentView({ ...base, fact_type: 'other' })).toMatchObject({ factType: null })
    expect(offerAttachmentView({ ...base, fact_type: null })).toMatchObject({ factType: null })
  })

  it('un intitulé qui ne nomme rien est « non classé », jamais une famille par défaut', () => {
    expect(
      offerAttachmentView({ status: 'unclassified', fact_type: 'hiring', skills: [], job_family: null, extract: 'X' }),
    ).toEqual({ unclassified: true })
  })

  it('aucun rattachement posé (collecte antérieure) : l’écran se tait, rien n’est inventé', () => {
    expect(offerAttachmentView(null)).toBeNull()
    expect(offerAttachmentView(undefined)).toBeNull()
  })
})
