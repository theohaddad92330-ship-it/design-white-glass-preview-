import {
  accountsToWatchMarketRank,
  rankAccountsToWatchByMarket,
  reorderAccountActions,
  type WatchedAccount,
} from './accounts-to-watch-market-rank'

/**
 * #1637 — LA MÉMOIRE MARCHÉ SUR « COMPTES À SURVEILLER » (/briefing).
 *
 * Le retour, mot pour mot : « Market Memory ne crée jamais un signal ou une
 * urgence. Elle améliore uniquement le ranking d'un événement réel. » Chaque
 * compte de cette liste porte DÉJÀ un signal réel (c'est le critère qui l'a
 * fait entrer) : la mémoire marché ne peut donc QUE réordonner, jamais ajouter
 * ni retirer un compte. Ces tests défendent exactement ça, dans les mêmes
 * termes que `cockpit-perspective.service.spec.ts` (#1573.5 / #1574.1).
 */

function account(partial: Partial<WatchedAccount> & Pick<WatchedAccount, 'accountId' | 'companyName'>): WatchedAccount {
  return {
    detectedAt: '2026-09-08T09:00:00.000Z',
    detectionExact: true,
    ...partial,
  }
}

describe('accountsToWatchMarketRank — une PRÉSENCE, jamais un volume', () => {
  it('vaut 1 dès que le compte est couvert, quel que soit le nombre de parcours', () => {
    expect(accountsToWatchMarketRank(1)).toBe(1)
    expect(accountsToWatchMarketRank(300)).toBe(1)
  })

  it('vaut 0 quand le compte n’est pas couvert', () => {
    expect(accountsToWatchMarketRank(null)).toBe(0)
  })
})

describe('rankAccountsToWatchByMarket', () => {
  it('ne remonte JAMAIS un compte « suivi depuis » (backfill) au-dessus d’un compte à détection EXACTE', () => {
    const tracked = account({ accountId: 'a-tracked', companyName: 'Tracked SAS', detectionExact: false })
    const exact = account({ accountId: 'b-exact', companyName: 'Exact SAS', detectionExact: true })

    // Le compte backfill est massivement couvert, l'exact ne l'est pas du
    // tout : si la mémoire marché pouvait fabriquer une urgence, elle
    // inverserait l'ordre ici. Elle ne le fait pas.
    const marketPaths = new Map<string, number | null>([
      ['a-tracked', 400],
      ['b-exact', null],
    ])

    const ranked = rankAccountsToWatchByMarket([tracked, exact], marketPaths)

    expect(ranked.map(entry => entry.accountId)).toEqual(['b-exact', 'a-tracked'])
  })

  it('à détection EXACTE égale, un compte couvert par la mémoire marché remonte devant un compte non couvert', () => {
    const covered = account({
      accountId: 'a-covered',
      companyName: 'Covered SAS',
      detectedAt: '2026-09-05T08:00:00.000Z',
    })
    const uncovered = account({
      accountId: 'b-uncovered',
      companyName: 'Uncovered SAS',
      detectedAt: '2026-09-07T08:00:00.000Z',
    })

    const marketPaths = new Map<string, number | null>([
      ['a-covered', 12],
      ['b-uncovered', null],
    ])

    const ranked = rankAccountsToWatchByMarket([uncovered, covered], marketPaths)

    // Sans mémoire marché, `uncovered` (signal plus récent) resterait devant.
    // Ce n'est PAS le test ici — voir « le rang de marché est une présence,
    // jamais un volume » et le test de date ci-dessous, qui vérifient que la
    // date reste un critère quand le rang de marché est LUI-MÊME à égalité.
    // Ce test-ci vérifie seulement que le rang de marché DÉPARTAGE quand il
    // n'est pas à égalité, et qu'il le fait bien avant la date.
    expect(ranked.map(entry => entry.accountId)).toEqual(['a-covered', 'b-uncovered'])
  })

  it('le rang de marché est une PRÉSENCE, jamais un volume — la date tranche entre deux comptes couverts', () => {
    const smallCoverage = account({
      accountId: 'a-small',
      companyName: 'Small SAS',
      detectedAt: '2026-09-08T08:00:00.000Z',
    })
    const bigCoverage = account({
      accountId: 'b-big',
      companyName: 'Big SAS',
      detectedAt: '2026-09-01T08:00:00.000Z',
    })

    // 300 parcours contre 3 : si le tri comparait le NOMBRE, `bigCoverage`
    // remonterait malgré un signal plus ancien — exactement le refus déjà
    // inscrit contre `externalization_score` (#1640.6, GA-257).
    const marketPaths = new Map<string, number | null>([
      ['a-small', 3],
      ['b-big', 300],
    ])

    const ranked = rankAccountsToWatchByMarket([bigCoverage, smallCoverage], marketPaths)

    expect(ranked.map(entry => entry.accountId)).toEqual(['a-small', 'b-big'])
  })

  it('sans AUCUNE couverture marché, l’ordre reste celui du signal — exactitude puis date', () => {
    const older = account({ accountId: 'a-older', companyName: 'Older SAS', detectedAt: '2026-09-01T08:00:00.000Z' })
    const newer = account({ accountId: 'b-newer', companyName: 'Newer SAS', detectedAt: '2026-09-08T08:00:00.000Z' })

    const ranked = rankAccountsToWatchByMarket([older, newer], new Map())

    expect(ranked.map(entry => entry.accountId)).toEqual(['b-newer', 'a-older'])
  })

  it('un compte sans date lisible se range après ceux qui en ont une, à exactitude et marché égaux', () => {
    const undated = account({ accountId: 'a-undated', companyName: 'Undated SAS', detectedAt: null })
    const dated = account({ accountId: 'b-dated', companyName: 'Dated SAS', detectedAt: '2026-09-01T08:00:00.000Z' })

    const ranked = rankAccountsToWatchByMarket([undated, dated], new Map())

    expect(ranked.map(entry => entry.accountId)).toEqual(['b-dated', 'a-undated'])
  })

  it('ne modifie QUE l’ordre — la sélection est strictement préservée', () => {
    const entries = [
      account({ accountId: 'a', companyName: 'A' }),
      account({ accountId: 'b', companyName: 'B' }),
      account({ accountId: 'c', companyName: 'C' }),
    ]
    const marketPaths = new Map<string, number | null>([
      ['a', null],
      ['b', 5],
      ['c', null],
    ])

    const ranked = rankAccountsToWatchByMarket(entries, marketPaths)

    expect(new Set(ranked.map(entry => entry.accountId))).toEqual(new Set(['a', 'b', 'c']))
    expect(ranked).toHaveLength(entries.length)
  })
})

describe('#1637 — les DEUX blocs de /briefing montrent le même ordre', () => {
  const compte = (id: string, nom: string): WatchedAccount => ({
    accountId: id,
    companyName: nom,
    detectedAt: '2026-09-09T08:00:00.000Z',
    detectionExact: true,
  })
  const carte = (id: string, kind = 'account') => ({ id, kind })

  it('les cartes de compte suivent l’ordre de la liste, sans quitter leurs EMPLACEMENTS', () => {
    // Le défaut que ce test empêche : `accountsToWatch` est trié dans le
    // contrôleur, les cartes sont construites dans le service AVANT ce tri.
    // Avant le correctif, les deux ordres divergeaient sur le même écran.
    const actions = [
      carte('meeting:1', 'meeting'),
      carte('account:b'),
      carte('account:a'),
      carte('reply:9', 'reply'),
      carte('account:c'),
    ]
    const ordonnes = [compte('a', 'Alpha'), compte('c', 'Charlie'), compte('b', 'Bravo')]

    const resultat = reorderAccountActions(actions, ordonnes)

    expect(resultat.map(a => a.id)).toEqual(['meeting:1', 'account:a', 'account:c', 'reply:9', 'account:b'])
  })

  it('un compte ne remonte JAMAIS au-dessus d’une carte d’une autre famille', () => {
    // « La mémoire marché ne fabrique jamais d'urgence » vaut aussi ENTRE
    // familles de cartes, pas seulement dans une liste de comptes : une réunion
    // à préparer reste devant, quel que soit le rang de marché.
    const actions = [carte('meeting:1', 'meeting'), carte('account:b'), carte('account:a')]
    const resultat = reorderAccountActions(actions, [compte('a', 'Alpha'), compte('b', 'Bravo')])
    expect(resultat[0]?.kind).toBe('meeting')
  })

  it('une carte dont le compte est INCONNU garde sa place en fin de groupe — jamais en tête', () => {
    // `?? Number.MAX_SAFE_INTEGER` est un « je ne sais pas », pas un « premier ».
    const actions = [carte('account:inconnu'), carte('account:a')]
    const resultat = reorderAccountActions(actions, [compte('a', 'Alpha')])
    expect(resultat.map(a => a.id)).toEqual(['account:a', 'account:inconnu'])
  })

  it('ne touche à rien quand il y a moins de deux cartes de compte', () => {
    // Témoin : la fonction ne doit pas réécrire un tableau qu'elle n'a aucune
    // raison de changer — sinon elle « corrige » du code qui allait bien.
    const actions = [carte('meeting:1', 'meeting'), carte('account:a')]
    expect(reorderAccountActions(actions, [compte('a', 'Alpha')])).toEqual(actions)
  })
})
