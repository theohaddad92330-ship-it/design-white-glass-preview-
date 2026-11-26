import {
  BRIEFING_ACTION_KINDS,
  KNOWN_WORKSPACE_ROLES,
  briefingReadingOf,
  readingOfBusinessRole,
  parseReadAs,
  orderActionsForRole,
  readingKinds,
  type BriefingReading,
} from './briefing-role-order'

/**
 * #1936.11 — la garde de l'ordonnancement par rôle.
 *
 * Elle tient la moitié qui compte : c'est un ORDRE, jamais un filtre. Elle LIT
 * un corpus (les rôles de l'espace, les genres de carte) et refuse qu'il soit
 * vide — une garde qui ne lit rien reste verte pour toujours.
 */

const READINGS: readonly BriefingReading[] = ['sales', 'manager', 'executive', 'recruiter']

const card = (kind: string, id: string) => ({ kind, id }) as { kind: never; id: string }

describe('#1936.11 — le brief varie selon le rôle', () => {
  it('lit un corpus non vide : les rôles de l’espace et les genres de carte', () => {
    expect(KNOWN_WORKSPACE_ROLES.length).toBeGreaterThanOrEqual(7)
    // #2107.3 — `need_stale` a rejoint les sept genres d'origine.
    // #2095.7 — `payment_overdue` a rejoint les huit.
    // #2095.8 — `rfp_due` a rejoint les neuf.
    // LOT g26 (26/09/2026, #2803) — treize genres #2106.*/#2107.*/#2801
    // (`consultant_available` à `invoicing_blocked_missing_data`) avaient
    // rejoint `BRIEFING_ACTION_KINDS` côté contrat SANS jamais rejoindre les
    // lectures ci-dessous : ce fichier exportait sa PROPRE liste de dix genres
    // (`READINGS.sales`), jamais comparée au contrat réel — une garde qui se
    // relit elle-même reste verte pour toujours. `BRIEFING_ACTION_KINDS` vient
    // maintenant du contrat (`@bellum/contracts`), vingt-trois genres, puis
    // vingt-quatre avec `contact_bounced`, puis vingt-cinq avec
    // `meeting_no_followup` (#2095.12, épopée #2993), puis trente avec les cinq
    // familles du lot L1 (31/10 : `invoice_blocked`, `critical_data_missing`,
    // `mission_starting`, `mission_amendment_pending`, `contact_left`).
    expect(BRIEFING_ACTION_KINDS.length).toBe(30)
  })

  it('chaque rôle connu a une lecture — aucun ne tombe dans un trou', () => {
    for (const role of KNOWN_WORKSPACE_ROLES) {
      expect(READINGS).toContain(briefingReadingOf(role))
    }
    // Un rôle non lu (profil incomplet, lecture en échec) garde l'ordre d'avant.
    expect(briefingReadingOf(null)).toBe('sales')
  })

  it('AUCUNE lecture ne filtre : les vingt-trois genres, chacun exactement une fois', () => {
    for (const reading of READINGS) {
      const kinds = readingKinds(reading)
      expect([...kinds].sort()).toEqual([...BRIEFING_ACTION_KINDS].sort())
      expect(new Set(kinds).size).toBe(kinds.length)
    }
  })

  it('un commercial ouvre sur ses relances et ses comptes', () => {
    const actions = [card('conflict', 'c'), card('account', 'a'), card('follow_up', 'f')]
    expect(orderActionsForRole(actions, 'sales').map(action => action.id)).toEqual(['f', 'a', 'c'])
  })

  it('un manager ouvre sur les écarts — conflits et retards', () => {
    const actions = [card('account', 'a'), card('follow_up', 'f'), card('conflict', 'c'), card('task', 't')]
    expect(orderActionsForRole(actions, 'sales_ops').map(action => action.id)).toEqual(['c', 't', 'f', 'a'])
  })

  it('un dirigeant ouvre sur le pipe et la charge', () => {
    const actions = [card('task', 't'), card('mission_end', 'm'), card('account', 'a')]
    expect(orderActionsForRole(actions, 'owner').map(action => action.id)).toEqual(['a', 'm', 't'])
  })

  it('#3414 — un recruteur ouvre sur les disponibilités et les retours, jamais sur ses comptes', () => {
    const actions = [card('account', 'a'), card('consultant_available', 'c'), card('follow_up', 'f')]
    expect(orderActionsForRole(actions, 'recruiter').map(action => action.id)).toEqual(['c', 'f', 'a'])
  })

  it('#3414 — sur les genres que la salle de démo sert, « Lire comme » CHANGE visiblement la tête', () => {
    // Sans carte d'écart, les quatre lectures donnaient la même tête : le
    // sélecteur « ne changeait rien » en recette. Le jeu de la salle : relance,
    // réponse, rendez-vous à préparer, compte.
    const demo = [card('follow_up', 'f'), card('reply', 'r'), card('meeting_prep', 'm'), card('account', 'a')]
    const head = (role: Parameters<typeof orderActionsForRole>[1]) => orderActionsForRole(demo, role)[0]?.id
    expect(head('sales')).toBe('f')
    expect(head('admin')).toBe('m')
    expect(head('owner')).toBe('a')
    expect(new Set([head('sales'), head('admin'), head('owner'), head('recruiter')]).size).toBeGreaterThanOrEqual(3)
    // …et rien n'est filtré : même ensemble.
    expect(orderActionsForRole(demo, 'admin')).toHaveLength(4)
  })

  it('#3414 — `readAs` ne laisse passer que les rôles connus', () => {
    expect(parseReadAs('recruiter')).toBe('recruiter')
    expect(parseReadAs('pirate')).toBeUndefined()
    expect(parseReadAs(undefined)).toBeUndefined()
  })

  it('l’ENSEMBLE ne change jamais : même nombre, mêmes identifiants, pour tous les rôles', () => {
    const actions = BRIEFING_ACTION_KINDS.map((kind, index) => card(kind, `${index}`))
    const expected = [...actions.map(action => action.id)].sort()
    for (const role of KNOWN_WORKSPACE_ROLES) {
      const ordered = orderActionsForRole(actions, role)
      expect(ordered).toHaveLength(actions.length)
      expect(ordered.map(action => action.id).sort()).toEqual(expected)
    }
  })

  it('le tri est STABLE : deux cartes du même genre gardent leur ordre d’urgence', () => {
    const actions = [card('follow_up', 'f1'), card('follow_up', 'f2'), card('follow_up', 'f3')]
    expect(orderActionsForRole(actions, 'owner').map(action => action.id)).toEqual(['f1', 'f2', 'f3'])
  })

  it('sans rôle lu, l’ordre servi est rendu INCHANGÉ — aucun brief ne bouge sans décision', () => {
    const actions = [card('conflict', 'c'), card('account', 'a'), card('follow_up', 'f')]
    const kept = orderActionsForRole(actions, null)
    // La lecture par défaut réordonne comme un commercial ; ce qui ne doit jamais
    // changer, c'est l'ensemble — et le fait qu'aucune carte ne soit perdue.
    expect(kept.map(action => action.id).sort()).toEqual(['a', 'c', 'f'])
  })

  it('un genre inconnu de la lecture passe en FIN, il ne disparaît pas', () => {
    const actions = [card('genre_inconnu', 'x'), card('follow_up', 'f')]
    expect(orderActionsForRole(actions, 'sales').map(action => action.id)).toEqual(['f', 'x'])
  })
})

describe('#3386 — le rôle MÉTIER déclaré réordonne le brief, sans rien retirer (c76)', () => {
  const cards = [
    card('account', 'a'),
    card('follow_up', 'b'),
    card('consultant_available', 'c'),
    card('conflict', 'd'),
    card('payment_overdue', 'e'),
  ]
  const ids = (list: readonly { id: string }[]) => list.map(c => c.id)

  it('Directeur d’agence et Business Manager ouvrent sur un ordre différent', () => {
    const asDirector = orderActionsForRole(cards, 'member', "Directeur d'agence")
    const asManager = orderActionsForRole(cards, 'member', 'Business Manager')
    expect(ids(asDirector)).not.toEqual(ids(asManager))
  })

  it('même ensemble, même nombre — jamais un filtre', () => {
    for (const businessRole of [
      "Directeur d'agence",
      'Business Manager',
      'Business Developer',
      'Responsable staffing',
    ]) {
      expect(ids(orderActionsForRole(cards, 'member', businessRole)).sort()).toEqual(ids(cards).sort())
    }
  })

  it('un rôle métier inconnu ou absent laisse le rôle d’espace décider (ordre d’avant)', () => {
    expect(readingOfBusinessRole('Poste inventé')).toBeNull()
    expect(readingOfBusinessRole(null)).toBeNull()
    expect(ids(orderActionsForRole(cards, 'recruiter', 'Poste inventé'))).toEqual(
      ids(orderActionsForRole(cards, 'recruiter')),
    )
  })
})

describe('#3386 (recette 03/10) — Business Developer → Fondateur / CEO : l’ORDRE change, jamais le contenu', () => {
  const cards = BRIEFING_ACTION_KINDS.map(kind => card(kind, kind))

  it('deux rôles métier, deux ordres, le même ensemble de cartes', () => {
    const asDeveloper = orderActionsForRole(cards, 'member', 'Business Developer').map(a => a.id)
    const asFounder = orderActionsForRole(cards, 'member', 'Fondateur / CEO').map(a => a.id)
    expect(asDeveloper).not.toEqual(asFounder)
    expect([...asDeveloper].sort()).toEqual([...asFounder].sort())
    expect(asFounder).toHaveLength(cards.length)
  })
})
