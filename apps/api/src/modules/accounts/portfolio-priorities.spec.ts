import { FOCUS_MAX_ACCOUNTS, type AccountFact } from '@bellum/contracts'
import { derivePortfolioPriorities, pickInterlocutor, whyNowOf, type PortfolioAccountRow } from './portfolio-priorities'

/**
 * #3209.4/.6/.7 (LAU-FINAL-215) — Laura répartit le portefeuille en quatre
 * catégories nommées plutôt qu'un tri par score descendant, avec un plafond
 * réel sur « maintenant » (le même que le board d'effort, D80) et une garde
 * de diversité par groupe.
 */
function row(overrides: Partial<PortfolioAccountRow>): PortfolioAccountRow {
  return {
    id: 'acc-1',
    companyName: 'Compte',
    sprint: null,
    sprintExitReason: null,
    priorityGate: 'pending',
    priorityScore: 50,
    priorityJustification: null,
    commercialStatus: 'watching',
    groupHeadSiren: null,
    lastActionAt: null,
    movementRationale: null,
    firstActionLabel: null,
    firstActionHorizon: null,
    betHorizon: null,
    betSize: null,
    betAccess: null,
    betResource: null,
    headquarters: null,
    ...overrides,
  }
}

describe('derivePortfolioPriorities', () => {
  it('range un compte en focus dans « maintenant », avec sa justification', () => {
    const result = derivePortfolioPriorities([
      row({ id: 'a', sprint: 'focus', priorityJustification: 'Signal actuel : appel entrant.' }),
    ])
    expect(result.now).toEqual([
      expect.objectContaining({ id: 'a', bucket: 'now', reason: 'Signal actuel : appel entrant.' }),
    ])
    expect(result.toVerify).toEqual([])
    expect(result.toWatch).toEqual([])
    expect(result.notNow).toEqual([])
  })

  it('range un compte sans score dans « à vérifier », jamais dans un autre panier', () => {
    const result = derivePortfolioPriorities([row({ id: 'b', priorityScore: null })])
    expect(result.toVerify).toEqual([
      expect.objectContaining({ id: 'b', bucket: 'to_verify', reason: 'Score non mesuré — le dossier est incomplet.' }),
    ])
  })

  it('range un compte no_go ou parqué dans « à ne pas travailler », avec le motif de sortie', () => {
    const withReason = derivePortfolioPriorities([
      row({ id: 'c', sprint: 'no_go', sprintExitReason: 'Aucun budget avant 2027.' }),
    ])
    expect(withReason.notNow).toEqual([
      expect.objectContaining({ id: 'c', bucket: 'not_now', reason: 'Aucun budget avant 2027.' }),
    ])

    const parked = derivePortfolioPriorities([row({ id: 'd', priorityGate: 'parked' })])
    expect(parked.notNow).toEqual([expect.objectContaining({ id: 'd', bucket: 'not_now' })])
  })

  it('range le reste (extension/volume/en attente) dans « à surveiller »', () => {
    const result = derivePortfolioPriorities([
      row({ id: 'e', sprint: 'extension' }),
      row({ id: 'f', sprint: null, priorityGate: 'pending' }),
    ])
    expect(result.toWatch.map(i => i.id)).toEqual(['e', 'f'])
  })

  it('NO-GO #3209.7 — ne trie jamais uniquement par score : deux comptes au même score peuvent finir dans deux paniers différents', () => {
    const result = derivePortfolioPriorities([
      row({
        id: 'high-score-no-go',
        priorityScore: 90,
        sprint: 'no_go',
        sprintExitReason: 'Concurrent déjà en place.',
      }),
      row({ id: 'low-score-focus', priorityScore: 10, sprint: 'focus' }),
    ])
    expect(result.notNow.map(i => i.id)).toContain('high-score-no-go')
    expect(result.now.map(i => i.id)).toContain('low-score-focus')
  })

  it("rend le plafond réel du board d'effort (D80), jamais un nombre inventé", () => {
    const result = derivePortfolioPriorities([])
    expect(result.capacityCap).toBe(FOCUS_MAX_ACCOUNTS)
  })

  it('#3209.6 — diversité : au-delà de deux comptes du même groupe en focus, les suivants redescendent en « à surveiller »', () => {
    const result = derivePortfolioPriorities([
      row({ id: 'g1', sprint: 'focus', groupHeadSiren: 'SIREN-1' }),
      row({ id: 'g2', sprint: 'focus', groupHeadSiren: 'SIREN-1' }),
      row({ id: 'g3', sprint: 'focus', groupHeadSiren: 'SIREN-1' }),
    ])
    expect(result.now.map(i => i.id)).toEqual(['g1', 'g2'])
    expect(result.toWatch).toEqual([
      expect.objectContaining({ id: 'g3', bucket: 'to_watch', reason: expect.stringContaining('même groupe') }),
    ])
  })

  it('#3209.3 — chaque compte porte une condition d’arrêt, dans les quatre catégories', () => {
    const result = derivePortfolioPriorities([
      row({ id: 'n', sprint: 'focus' }),
      row({ id: 'v', priorityScore: null }),
      row({ id: 'w' }),
      row({ id: 'x', sprint: 'no_go' }),
    ])
    for (const item of [...result.now, ...result.toVerify, ...result.toWatch, ...result.notNow]) {
      expect(item.stopCondition.length).toBeGreaterThan(10)
    }
  })

  it('#3209.4 — une catégorie vide se NOMME vide, jamais remplie', () => {
    const result = derivePortfolioPriorities([row({ id: 'w1' }), row({ id: 'w2' }), row({ id: 'w3' })])
    expect(result.emptyBuckets).toEqual(['now', 'to_verify', 'not_now'])
    expect(result.toVerify).toEqual([])
    expect(derivePortfolioPriorities([]).emptyBuckets).toEqual(['now', 'to_verify', 'to_watch', 'not_now'])
  })

  it('#3209.5 — « maintenant » ne dépasse jamais le plafond, le surplus redescend en « à surveiller »', () => {
    const rows = Array.from({ length: FOCUS_MAX_ACCOUNTS + 3 }, (_, i) => row({ id: `f${i}`, sprint: 'focus' }))
    const result = derivePortfolioPriorities(rows)
    expect(result.now).toHaveLength(FOCUS_MAX_ACCOUNTS)
    expect(result.toWatch).toHaveLength(3)
    expect(result.toWatch[0]?.reason).toContain('Plafond')
  })

  it('ne borne pas la diversité les comptes sans groupe connu', () => {
    const result = derivePortfolioPriorities([
      row({ id: 'h1', sprint: 'focus', groupHeadSiren: null }),
      row({ id: 'h2', sprint: 'focus', groupHeadSiren: null }),
      row({ id: 'h3', sprint: 'focus', groupHeadSiren: null }),
    ])
    expect(result.now.map(i => i.id)).toEqual(['h1', 'h2', 'h3'])
  })

  // #3245 (reste de #3209.5) — objectif / première action / temps attendu
  // pour « maintenant » : les MÊMES champs que `get_account_briefing`
  // (`raw_analysis.plan.recommendedMovement.rationale` et
  // `raw_analysis.plan.nextActions[0]`), jamais recalculés ici.
  it('#3209.5 — un compte « maintenant » porte objectif/première action/temps attendu quand le dossier les a', () => {
    const result = derivePortfolioPriorities([
      row({
        id: 'i1',
        sprint: 'focus',
        movementRationale: 'relation forte : entrer par le sponsor et faire ruisseler',
        firstActionLabel: 'Relancer le sponsor historique',
        firstActionHorizon: '7j',
      }),
    ])
    expect(result.now).toEqual([
      expect.objectContaining({
        id: 'i1',
        objective: 'relation forte : entrer par le sponsor et faire ruisseler',
        firstAction: 'Relancer le sponsor historique',
        expectedTime: '7j',
      }),
    ])
  })

  it("#3209.5 — n'invente rien : un dossier sans plan ne porte aucune des trois clés (jamais une valeur devinée)", () => {
    const result = derivePortfolioPriorities([row({ id: 'i2', sprint: 'focus' })])
    expect(result.now[0]).not.toHaveProperty('objective')
    expect(result.now[0]).not.toHaveProperty('firstAction')
    expect(result.now[0]).not.toHaveProperty('expectedTime')
  })

  it('#3209.5 — un compte redescendu en « à surveiller » par la diversité ne garde pas ces champs « maintenant »', () => {
    const result = derivePortfolioPriorities([
      row({ id: 'g1', sprint: 'focus', groupHeadSiren: 'SIREN-1', movementRationale: 'r1' }),
      row({ id: 'g2', sprint: 'focus', groupHeadSiren: 'SIREN-1', movementRationale: 'r2' }),
      row({ id: 'g3', sprint: 'focus', groupHeadSiren: 'SIREN-1', movementRationale: 'r3' }),
    ])
    expect(result.toWatch.find(i => i.id === 'g3')).not.toHaveProperty('objective')
  })

  describe('#3209.6 — diversité au-delà du groupe (profil de pari DÉCLARÉ)', () => {
    const focus = (id: string, extra: Partial<PortfolioAccountRow> = {}) => row({ id, sprint: 'focus', ...extra })

    it('nomme « uniquement des paris longs » quand tous les comptes de « maintenant » le déclarent', () => {
      const result = derivePortfolioPriorities([focus('a', { betHorizon: 'long' }), focus('b', { betHorizon: 'long' })])
      expect(result.diversityNotes.map(n => n.code)).toEqual(['only_long_bets'])
      expect(result.now).toHaveLength(2)
    })

    it("ne dit RIEN quand un seul compte n'a pas déclaré son horizon (non mesuré ≠ long)", () => {
      const result = derivePortfolioPriorities([focus('a', { betHorizon: 'long' }), focus('b')])
      expect(result.diversityNotes).toEqual([])
    })

    it('ne dit rien avec un seul compte en « maintenant » : pas de portefeuille à diversifier', () => {
      expect(derivePortfolioPriorities([focus('a', { betHorizon: 'long' })]).diversityNotes).toEqual([])
    })

    it('nomme « uniquement de très grands comptes fermés » seulement si taille ET accès sont déclarés partout', () => {
      const closedLarge = { betSize: 'very_large', betAccess: 'closed' }
      const all = derivePortfolioPriorities([focus('a', closedLarge), focus('b', closedLarge)])
      expect(all.diversityNotes.map(n => n.code)).toEqual(['only_closed_large_accounts'])
      const mixed = derivePortfolioPriorities([focus('a', closedLarge), focus('b', { betSize: 'very_large' })])
      expect(mixed.diversityNotes).toEqual([])
    })

    it('redescend le troisième compte qui réclame la même ressource, avec sa raison', () => {
      const result = derivePortfolioPriorities([
        focus('a', { betResource: 'Architecte cloud' }),
        focus('b', { betResource: 'architecte CLOUD ' }),
        focus('c', { betResource: 'Architecte cloud' }),
      ])
      expect(result.now.map(i => i.id)).toEqual(['a', 'b'])
      expect(result.toWatch).toEqual([
        expect.objectContaining({ id: 'c', reason: expect.stringContaining('même ressource') }),
      ])
    })

    it('une ressource non déclarée ne compte jamais comme « la même »', () => {
      const result = derivePortfolioPriorities([focus('a'), focus('b'), focus('c')])
      expect(result.now).toHaveLength(3)
    })

    /**
     * #3245 — recette 07/10 : Accor et AIRBUS sont « Pari long » déclaré, mais un
     * troisième compte « maintenant » non déclaré empêchait `diversityNotes` de dire
     * quoi que ce soit (règle : CHACUN doit le déclarer) — Laura ne pouvait alors
     * jamais citer un pari long individuel. L'horizon voyage maintenant par compte,
     * exactement comme `objective`/`firstAction`/`expectedTime`.
     */
    it("#3245 — porte l'horizon de pari PAR COMPTE, même quand tous ne l'ont pas déclaré", () => {
      const result = derivePortfolioPriorities([focus('accor', { betHorizon: 'long' }), focus('other')])
      expect(result.diversityNotes).toEqual([])
      expect(result.now.find(i => i.id === 'accor')).toEqual(expect.objectContaining({ betHorizon: 'long' }))
      expect(result.now.find(i => i.id === 'other')?.betHorizon).toBeUndefined()
    })

    it("#3245 (recette NB 10/10) — l'horizon de pari DÉCLARÉ survit à la redescente et se lit aussi en « à surveiller »", () => {
      const result = derivePortfolioPriorities(
        Array.from({ length: FOCUS_MAX_ACCOUNTS + 1 }, (_, i) => focus(`a${i}`, { betHorizon: 'long' })),
      )
      const overflow = result.toWatch.find(i => i.id === `a${FOCUS_MAX_ACCOUNTS}`)
      expect(overflow).toBeDefined()
      expect(overflow?.betHorizon).toBe('long')
      // objective/firstAction/expectedTime, eux, restent propres à « maintenant ».
      expect(overflow?.objective).toBeUndefined()
    })

    it('#3245 (recette NB 10/10) — 0 compte en focus : un compte « pari long » à surveiller le porte quand même', () => {
      const result = derivePortfolioPriorities([row({ id: 'accor', betHorizon: 'long' }), row({ id: 'plain' })])
      expect(result.now).toEqual([])
      expect(result.toWatch.find(i => i.id === 'accor')?.betHorizon).toBe('long')
      expect(result.toWatch.find(i => i.id === 'plain')?.betHorizon).toBeUndefined()
    })
  })

  // #3245 (RAN, recette ND 10/10 en prod) — Réglages marquaient Accor ET AIRBUS « Pari long », la
  // réponse ne citait qu'AIRBUS. Un pari déclaré n'est jamais perdu : ni par la catégorie
  // « à ne pas travailler » (qui ne portait pas l'horizon), ni par une liste de 55 lignes où le
  // modèle en oublie une — `declaredBets` les nomme TOUS, avec leur catégorie.
  describe('#3245 — chaque pari long déclaré est nommé, quelle que soit sa catégorie', () => {
    it('un compte parqué déclaré « long » porte son horizon dans « à ne pas travailler »', () => {
      const result = derivePortfolioPriorities([row({ id: 'accor', priorityGate: 'parked', betHorizon: 'long' })])
      expect(result.notNow[0]).toEqual(expect.objectContaining({ id: 'accor', betHorizon: 'long' }))
    })

    it('declaredBets liste tous les paris déclarés (toutes catégories), jamais un compte non déclaré', () => {
      const result = derivePortfolioPriorities([
        row({ id: 'airbus', companyName: 'AIRBUS', betHorizon: 'long' }),
        row({ id: 'accor', companyName: 'Accor', priorityGate: 'parked', betHorizon: 'long' }),
        row({ id: 'noscore', companyName: 'Sans score', priorityScore: null, betHorizon: 'long' }),
        row({ id: 'plain', companyName: 'Autre' }),
      ])
      expect(result.declaredBets).toEqual([
        { id: 'airbus', companyName: 'AIRBUS', bucket: 'to_watch', betHorizon: 'long' },
        { id: 'accor', companyName: 'Accor', bucket: 'not_now', betHorizon: 'long' },
        { id: 'noscore', companyName: 'Sans score', bucket: 'to_verify', betHorizon: 'long' },
      ])
    })

    it('sans aucune déclaration, declaredBets est vide (jamais inventé)', () => {
      expect(derivePortfolioPriorities([row({ id: 'plain' })]).declaredBets).toEqual([])
    })
  })

  it("#5014 — importedCount dénombre les dossiers importés : 0 = l'espace n'a AUCUN import (mesuré, pas deviné)", () => {
    expect(derivePortfolioPriorities([row({ id: 'a' }), row({ id: 'b' })]).importedCount).toBe(0)
    expect(
      derivePortfolioPriorities([row({ id: 'a', imported: true }), row({ id: 'b' }), row({ id: 'c', imported: true })])
        .importedCount,
    ).toBe(2)
  })

  it('#3540 — dénombre chaque catégorie et le total : Laura ne compte jamais seule', () => {
    const result = derivePortfolioPriorities([
      row({ id: 'a', sprint: 'focus' }),
      row({ id: 'b' }),
      row({ id: 'c' }),
      row({ id: 'd', sprint: 'no_go' }),
    ])
    expect(result.counts).toEqual({
      now: result.now.length,
      toVerify: result.toVerify.length,
      toWatch: result.toWatch.length,
      notNow: 1,
      total: 4,
      outsideNow: 4 - result.now.length,
    })
    expect(result.counts.outsideNow).toBe(result.counts.total - result.counts.now)
    expect(result.counts.now + result.counts.toVerify + result.counts.toWatch + result.counts.notNow).toBe(4)
  })
})

/**
 * #3399 (Y1 01/10) — « Quel compte attaquer en premier ? » : la carte ne nommait ni la
 * personne ni le périmètre. La source est BRANCHÉE ici : l'interlocuteur principal du
 * compte (contact le mieux noté, visible) voyage avec chaque compte rangé ; `null` =
 * AUCUN contact lisible, ce que Laura écrit « Interlocuteur à identifier ».
 */
describe('derivePortfolioPriorities — l’interlocuteur voyage avec le compte (#3399)', () => {
  const dsi = { name: 'Claire Martin', role: 'DSI', scope: 'Filiale Systèmes' }

  it('porte l’interlocuteur nommé (nom, rôle, périmètre) sur « maintenant », « à vérifier » et « à surveiller »', () => {
    const result = derivePortfolioPriorities([
      row({ id: 'a', sprint: 'focus', interlocutor: dsi }),
      row({ id: 'b', priorityScore: null, interlocutor: dsi }),
      row({ id: 'c', interlocutor: dsi }),
    ])
    expect(result.now[0]?.interlocutor).toEqual(dsi)
    expect(result.toVerify[0]?.interlocutor).toEqual(dsi)
    expect(result.toWatch[0]?.interlocutor).toEqual(dsi)
  })

  it('sans contact lisible : `interlocutor: null` explicite, jamais un nom deviné', () => {
    const result = derivePortfolioPriorities([row({ id: 'a', sprint: 'focus', interlocutor: null })])
    expect(result.now[0]).toHaveProperty('interlocutor', null)
  })

  it('un compte écarté (« ne pas travailler ») ne porte pas d’interlocuteur — rien à proposer', () => {
    const result = derivePortfolioPriorities([row({ id: 'n', sprint: 'no_go', interlocutor: dsi })])
    expect(result.notNow[0]).not.toHaveProperty('interlocutor')
  })

  it('la redescente en « à surveiller » (plafond) garde l’interlocuteur', () => {
    const rows = Array.from({ length: FOCUS_MAX_ACCOUNTS + 1 }, (_, i) =>
      row({ id: `f${i}`, sprint: 'focus', interlocutor: dsi }),
    )
    const result = derivePortfolioPriorities(rows)
    expect(result.toWatch[0]?.interlocutor).toEqual(dsi)
  })
})

/**
 * #3769.7 (recette prod nuit 08→09/10) — « priorise mes comptes » rendait une carte, mais
 * « seulement en Occitanie » (raffinement sur CETTE carte) retombait sur une clarification :
 * aucun champ de localisation ne voyageait jusqu'à Laura, qui ne pouvait ni filtrer ni même
 * dire où sont ses comptes. `headquarters` est une colonne RÉELLE de `accounts` (le siège du
 * registre, #3762 déjà l'utilise pour `run_account_search`) — ce n'est jamais une région
 * DEVINÉE : Laura lit le même fait que sur une fiche compte, elle ne le recalcule pas.
 */
describe('derivePortfolioPriorities — le siège voyage avec le compte (#3769.7)', () => {
  it('porte le siège (headquarters) sur « maintenant », « à vérifier » et « à surveiller »', () => {
    const result = derivePortfolioPriorities([
      row({ id: 'a', sprint: 'focus', headquarters: 'Toulouse' }),
      row({ id: 'b', priorityScore: null, headquarters: 'Montpellier' }),
      row({ id: 'c', headquarters: 'Lyon' }),
    ])
    expect(result.now[0]).toHaveProperty('headquarters', 'Toulouse')
    expect(result.toVerify[0]).toHaveProperty('headquarters', 'Montpellier')
    expect(result.toWatch[0]).toHaveProperty('headquarters', 'Lyon')
  })

  it('siège non renseigné : `headquarters: null` explicite, jamais une ville devinée', () => {
    const result = derivePortfolioPriorities([row({ id: 'a', sprint: 'focus', headquarters: null })])
    expect(result.now[0]).toHaveProperty('headquarters', null)
  })

  it('la redescente en « à surveiller » (plafond, groupe, ressource) garde le siège', () => {
    const rows = Array.from({ length: FOCUS_MAX_ACCOUNTS + 1 }, (_, i) =>
      row({ id: `f${i}`, sprint: 'focus', headquarters: 'Nantes' }),
    )
    const result = derivePortfolioPriorities(rows)
    expect(result.toWatch[0]).toHaveProperty('headquarters', 'Nantes')
  })
})

/**
 * #3399 (Y3 02/10) — « Antoine » seul, sans rôle, sortait comme interlocuteur : le contact le
 * mieux noté était une fiche à moitié remplie. On préfère une personne NOMMÉE (prénom + nom)
 * qui porte un rôle ; sans rôle nulle part, le rôle reste `null` (Laura écrit « rôle non renseigné »).
 */
describe('pickInterlocutor (#3399)', () => {
  const antoine = { name: 'Antoine', role: null, scope: 'BU Systèmes' }
  const claire = { name: 'Claire Martin', role: 'DSI', scope: null }
  const paul = { name: 'Paul Durand', role: null, scope: null }

  it('préfère une personne nommée avec un rôle à un prénom seul mieux noté', () => {
    expect(pickInterlocutor([antoine, claire])).toEqual(claire)
  })

  it('à défaut de rôle, préfère un nom complet à un prénom seul', () => {
    expect(pickInterlocutor([antoine, paul])).toEqual(paul)
  })

  it('un prénom seul reste rendu s’il est le seul — avec son rôle `null`, jamais inventé', () => {
    expect(pickInterlocutor([antoine])).toEqual(antoine)
  })

  it('aucun contact lisible : `null`', () => {
    expect(pickInterlocutor([])).toBeNull()
    expect(pickInterlocutor([{ name: '  ', role: 'DSI', scope: null }])).toBeNull()
  })

  it('un rôle vide est un rôle absent', () => {
    expect(pickInterlocutor([{ name: 'Claire Martin', role: '  ', scope: null }])?.role).toBeNull()
  })
})

// #4054.1 — « Voici mon CRM, que travailler lundi ? » : contacts connus, import, manques.
describe('derivePortfolioPriorities — base importée (#4054.1)', () => {
  it('un compte importé non analysé est « à vérifier », marqué import, sans relation inventée', () => {
    const result = derivePortfolioPriorities([
      row({
        id: 'imp',
        priorityScore: null,
        imported: true,
        headquarters: 'Lyon',
        knownContacts: [{ name: 'Awa Diop', role: 'DSI', scope: null }],
      }),
    ])
    const item = result.toVerify[0]
    expect(item).toMatchObject({ id: 'imp', fromImport: true, missing: ['analysis'] })
    expect(item?.reason).toMatch(/importé/)
    expect(item?.reason).toMatch(/aucun échange, sponsor ni relation/)
    expect(item?.knownContacts).toEqual([{ name: 'Awa Diop', role: 'DSI', scope: null }])
  })

  it('nomme « contact » manquant seulement si les contacts ont été lus et sont vides', () => {
    const read = derivePortfolioPriorities([row({ id: 'a', headquarters: 'Paris', knownContacts: [] })])
    expect(read.toWatch[0]?.missing).toEqual(['contact'])
    expect(read.toWatch[0]?.knownContacts).toBeUndefined()
    const unread = derivePortfolioPriorities([row({ id: 'b', headquarters: 'Paris' })])
    expect(unread.toWatch[0]?.missing).toBeUndefined()
  })

  it('un siège non renseigné se nomme manquant ; rien ne manque → pas de clé', () => {
    const result = derivePortfolioPriorities([
      row({ id: 'a', headquarters: null, knownContacts: [{ name: 'X Y', role: 'CTO', scope: null }] }),
      row({ id: 'b', headquarters: 'Nantes', knownContacts: [{ name: 'Z W', role: 'CTO', scope: null }] }),
    ])
    expect(result.toWatch.find(i => i.id === 'a')?.missing).toEqual(['headquarters'])
    expect(result.toWatch.find(i => i.id === 'b')).not.toHaveProperty('missing')
  })

  it('un compte analysé n’est jamais marqué import', () => {
    const result = derivePortfolioPriorities([row({ id: 'a', headquarters: 'Paris' })])
    expect(result.toWatch[0]).not.toHaveProperty('fromImport')
  })

  it('la redescente de « maintenant » garde contacts connus et manques', () => {
    const rows = Array.from({ length: FOCUS_MAX_ACCOUNTS + 1 }, (_, i) =>
      row({
        id: `f${i}`,
        sprint: 'focus',
        knownContacts: i === FOCUS_MAX_ACCOUNTS ? [{ name: 'Léa Roy', role: null, scope: null }] : [],
      }),
    )
    const result = derivePortfolioPriorities(rows)
    expect(result.toWatch[0]?.knownContacts).toEqual([{ name: 'Léa Roy', role: null, scope: null }])
  })
})

// #4070.1 — « pourquoi maintenant » lit les faits DÉCOTÉS du compte (lecteur unique), pas les signaux courants.
describe('whyNowOf (#4070.1)', () => {
  const fact = (over: Partial<AccountFact>): AccountFact => ({
    date: '2026-09-01',
    kind: 'signal',
    label: 'Levée de fonds',
    weight: 1,
    ageDays: 44,
    ...over,
  })

  it('garde les deux faits les plus pesants qui disent pourquoi maintenant, avec leur date et leur âge', () => {
    const facts = [
      fact({ label: 'A', kind: 'hiring', ageDays: 5 }),
      fact({ label: 'B', kind: 'deal_lost', ageDays: 400 }),
      fact({ label: 'C', kind: 'signal' }),
      fact({ label: 'D', kind: 'need' }),
    ]
    expect(whyNowOf(facts)).toEqual([
      { date: '2026-09-01', kind: 'hiring', label: 'A', ageDays: 5 },
      { date: '2026-09-01', kind: 'signal', label: 'C', ageDays: 44 },
    ])
  })

  it('sait dire NON : un fait de poids nul (décoté à rien) ne dit rien, et sans fait lisible → vide', () => {
    expect(whyNowOf([fact({ weight: 0 })])).toEqual([])
    expect(whyNowOf([])).toEqual([])
  })
})
