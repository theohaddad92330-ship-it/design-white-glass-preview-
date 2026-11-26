import { SINCE_LAST_VISIT_LINES } from '@bellum/contracts'
import type {
  ActionHistoryItem,
  ActionHistoryResponse,
  SinceLastSeen,
  SinceLastVisitDigest,
  SinceLastVisitLine,
} from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { SINCE_LAST_VISIT_MAX_ROWS, sinceLastVisitState } from './sinceLastVisit'

/**
 * « Ce qui a bougé depuis ma dernière visite » — la lecture des silences.
 *
 * Le bloc n'a pas deux états mais cinq, et trois d'entre eux sont des silences
 * qui ne veulent PAS dire la même chose :
 *
 *  - « tu es à jour » : on a regardé, il ne s'est rien passé ;
 *  - « je n'ai pas pu lire » : on n'a pas regardé, donc on ne sait rien ;
 *  - « c'est ta première visite » : il n'existe pas de « depuis ».
 *
 * Les rendre du même gris ferait qu'un commercial arrête de faire confiance au
 * bloc — c'est exactement ce que `BlockStateNotice` évite déjà pour l'agenda et
 * la messagerie.
 *
 * S'y ajoute depuis les quatre lignes typées une quatrième distinction, qui est
 * la raison d'être de ce chantier : DEUX lectures alimentent le bloc, elles ne
 * tombent pas ensemble, et une seule qui tombe ne doit pas effacer l'autre.
 */

const query = <T>(over: Partial<{ data: T; isLoading: boolean; isError: boolean }> = {}) => ({
  data: undefined as T | undefined,
  isLoading: false,
  isError: false,
  ...over,
})

const seen = (since: string | null) => query<SinceLastSeen>({ data: { since } })

function item(id: string): ActionHistoryItem {
  return {
    id,
    action_type: 'analysis_completed',
    category: 'analysis',
    action_label: 'Analyse terminée',
    detail: 'Dossier complet',
    channel: null,
    actor: { id: '11111111-1111-1111-1111-111111111111', name: 'Théo', initials: 'T' },
    target: { account_id: null, contact_id: null, label: 'ACME', initials: 'A' },
    created_at: '2026-08-27T07:00:00.000Z',
    rollback: null,
    crmTaskClosable: false,
  }
}

function page(items: ActionHistoryItem[], totalItems = items.length): ActionHistoryResponse {
  return {
    data: items,
    pagination: {
      currentPage: 1,
      size: SINCE_LAST_VISIT_MAX_ROWS,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / SINCE_LAST_VISIT_MAX_ROWS)),
      hasNext: totalItems > items.length,
      hasPrev: false,
    },
  }
}

const SINCE = '2026-08-26T18:04:00.000Z'

/** Les quatre lignes servies, mesurées, et toutes à zéro : « on a regardé ». */
function digestOf(
  ...overrides: (SinceLastVisitLine | { expiredItemsCount: number | null; treatedByColleagueCount: number | null })[]
) {
  const lines = overrides.filter((o): o is SinceLastVisitLine => 'kind' in o)
  const aggregates = overrides.find(
    (o): o is { expiredItemsCount: number | null; treatedByColleagueCount: number | null } => !('kind' in o),
  )
  const byKind = new Map(lines.map(line => [line.kind, line]))
  return query<SinceLastVisitDigest>({
    data: {
      since: SINCE,
      lines: SINCE_LAST_VISIT_LINES.map(
        kind => byKind.get(kind) ?? { kind, state: 'ready' as const, reason: null, count: 0, scope: null },
      ),
      expiredItemsCount: aggregates?.expiredItemsCount ?? null,
      treatedByColleagueCount: aggregates?.treatedByColleagueCount ?? null,
    },
  })
}

/** Les quatre lignes à zéro — le cas « rien n'a bougé, et on le sait ». */
const quiet = () => digestOf()

describe('sinceLastVisitState', () => {
  it('sur une PREMIÈRE visite, ne dit jamais « 0 changement »', () => {
    // « 0 » se lirait « il ne se passe rien ici » — le pire message possible sur
    // l'écran d'accueil d'un produit qu'on vient d'ouvrir pour la première fois.
    // Le repère n'existe pas : il n'y a rien à compter, seulement à annoncer.
    expect(sinceLastVisitState({ lastSeen: seen(null), digest: query(), history: query() })).toEqual({
      kind: 'first_visit',
    })
  })

  it('distingue « tu es à jour » de « je n’ai pas pu lire »', () => {
    expect(sinceLastVisitState({ lastSeen: seen(SINCE), digest: quiet(), history: query({ data: page([]) }) })).toEqual(
      {
        kind: 'up_to_date',
        since: SINCE,
      },
    )
    // Les DEUX lectures tombent : là, et seulement là, on ne sait rien.
    expect(
      sinceLastVisitState({
        lastSeen: seen(SINCE),
        digest: query({ isError: true }),
        history: query({ isError: true }),
      }),
    ).toEqual({ kind: 'unreadable' })
  })

  it('un repère illisible est « je n’ai pas pu lire », jamais une première visite', () => {
    // Repli le plus dangereux du bloc : annoncer « je commence à compter » à
    // quelqu'un qui vient tous les jours effacerait sa fenêtre à ses yeux.
    expect(sinceLastVisitState({ lastSeen: query({ isError: true }), digest: query(), history: query() })).toEqual({
      kind: 'unreadable',
    })
  })

  it('attend le repère ET les deux lectures avant de conclure', () => {
    expect(sinceLastVisitState({ lastSeen: query({ isLoading: true }), digest: query(), history: query() })).toEqual({
      kind: 'loading',
    })
    expect(
      sinceLastVisitState({ lastSeen: seen(SINCE), digest: quiet(), history: query({ isLoading: true }) }),
    ).toEqual({ kind: 'loading' })
    expect(
      sinceLastVisitState({
        lastSeen: seen(SINCE),
        digest: query({ isLoading: true }),
        history: query({ data: page([]) }),
      }),
    ).toEqual({ kind: 'loading' })
  })

  it('replie au-delà de quatre lignes de journal et DIT combien il replie', () => {
    // « Aujourd’hui » se lit debout : au-delà de quelques lignes, le bloc cesse
    // d'être lu. Ce qui déborde n'est pas caché, il est compté.
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: quiet(),
      history: query({ data: page([item('a'), item('b'), item('c'), item('d')], 11) }),
    })
    expect(state).toMatchObject({ kind: 'changed', since: SINCE, hidden: 7 })
    expect(state.kind === 'changed' && state.items).toHaveLength(SINCE_LAST_VISIT_MAX_ROWS)
  })

  it('ne replie rien quand tout tient', () => {
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: quiet(),
      history: query({ data: page([item('a'), item('b')]) }),
    })
    expect(state).toMatchObject({ kind: 'changed', hidden: 0 })
  })

  it('coupe à quatre lignes même si le serveur en renvoie plus', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map(item)
    const state = sinceLastVisitState({ lastSeen: seen(SINCE), digest: quiet(), history: query({ data: page(rows) }) })
    expect(state).toMatchObject({ kind: 'changed', hidden: 2 })
    expect(state.kind === 'changed' && state.items.map(row => row.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('un total sans aucune ligne à nommer est un ÉCHEC du journal, pas un « à jour »', () => {
    // On sait que quelque chose a bougé et on ne peut rien en dire : annoncer
    // « et 3 autres » au-dessus du vide, ou « tu es à jour » sous un total de 3,
    // sont deux mensonges.
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: quiet(),
      history: query({ data: page([], 3) }),
    })
    expect(state).toMatchObject({ kind: 'changed', failed: ['journal'], items: [], hidden: 0 })
  })

  /* ------------------------------------------------------------------ */
  /*  Les quatre lignes typées                                          */
  /* ------------------------------------------------------------------ */

  it('n’affiche AUCUNE ligne mesurée à zéro — un zéro décoratif n’apprend rien', () => {
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: quiet(),
      history: query({ data: page([item('a')]) }),
    })
    expect(state).toMatchObject({ kind: 'changed', lines: [] })
  })

  it('affiche une ligne qui a un compte, et elle seule', () => {
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: digestOf({ kind: 'account_signals', state: 'ready', reason: null, count: 3, scope: 2 }),
      history: query({ data: page([]) }),
    })
    expect(state.kind === 'changed' && state.lines).toEqual([
      { kind: 'account_signals', state: 'ready', reason: null, count: 3, scope: 2 },
    ])
  })

  it('affiche une ligne NON mesurée, même à zéro voisin — c’est le moment où le silence mentirait', () => {
    // « 0 réponse reçue » est vrai si on a su regarder ; il est faux si la
    // messagerie n'est pas branchée. Les deux appellent des gestes opposés.
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: digestOf({
        kind: 'replies_received',
        state: 'not_connected',
        reason: 'mailbox_not_connected',
        count: null,
        scope: null,
      }),
      history: query({ data: page([]) }),
    })
    expect(state.kind === 'changed' && state.lines.map(line => line.kind)).toEqual(['replies_received'])
  })

  it('« tu es à jour » exige que les DEUX lectures aient répondu', () => {
    // Le mensonge le plus coûteux de l'écran, parce qu'il est rassurant.
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: query({ isError: true }),
      history: query({ data: page([]) }),
    })
    expect(state).toMatchObject({ kind: 'changed', failed: ['digest'], lines: [] })
  })

  it('un journal muet n’efface pas un changement de poste, et l’inverse non plus', () => {
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: digestOf({ kind: 'job_changes', state: 'ready', reason: null, count: 1, scope: null }),
      history: query({ isError: true }),
    })
    expect(state).toMatchObject({ kind: 'changed', failed: ['journal'] })
    expect(state.kind === 'changed' && state.lines.map(line => line.kind)).toEqual(['job_changes'])
  })

  /* ------------------------------------------------------------------ */
  /*  #2106.29/.32/.33 — le résumé condensé de longue absence            */
  /* ------------------------------------------------------------------ */

  // LONG_ABSENCE_DAYS = 7 (partagé avec `no_connection_7_days`, laura-detector.ts).
  const JUST_BEFORE = new Date('2026-09-01T18:04:00.000Z') // SINCE + 6 j
  const AT_THRESHOLD = new Date('2026-09-02T18:04:00.000Z') // SINCE + 7 j pile

  it('sous le seuil de longue absence, `longAbsence` reste null — rien à condenser', () => {
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: digestOf({ kind: 'account_signals', state: 'ready', reason: null, count: 3, scope: 2 }),
      history: query({ data: page([]) }),
      now: JUST_BEFORE,
    })
    expect(state).toMatchObject({ kind: 'changed', longAbsence: null })
  })

  it('au seuil pile, nomme LA ligne la plus mesurée — jamais un score, le plus haut des comptes RÉELS', () => {
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: digestOf(
        { kind: 'account_signals', state: 'ready', reason: null, count: 3, scope: 2 },
        { kind: 'replies_received', state: 'ready', reason: null, count: 9, scope: null },
        { kind: 'job_changes', state: 'ready', reason: null, count: 1, scope: null },
      ),
      history: query({ data: page([]) }),
      now: AT_THRESHOLD,
    })
    expect(state.kind === 'changed' && state.longAbsence).toEqual({
      topLine: { kind: 'replies_received', state: 'ready', reason: null, count: 9, scope: null },
      openTasksCount: null,
      expiredItemsCount: null,
      treatedByColleagueCount: null,
    })
  })

  it('une ligne NON mesurée ne peut jamais devenir « la plus importante » — rien à fabriquer', () => {
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: digestOf({
        kind: 'replies_received',
        state: 'not_connected',
        reason: 'mailbox_not_connected',
        count: null,
        scope: null,
      }),
      history: query({ data: page([]) }),
      now: AT_THRESHOLD,
    })
    expect(state.kind === 'changed' && state.longAbsence).toEqual({
      topLine: null,
      openTasksCount: null,
      expiredItemsCount: null,
      treatedByColleagueCount: null,
    })
  })

  it('#2106.32 — le compte de tâches restantes voyage jusqu’au résumé condensé', () => {
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: digestOf({ kind: 'missions_moving', state: 'ready', reason: null, count: 2, scope: null }),
      history: query({ data: page([]) }),
      now: AT_THRESHOLD,
      openTasksCount: 5,
    })
    expect(state.kind === 'changed' && state.longAbsence).toEqual({
      topLine: { kind: 'missions_moving', state: 'ready', reason: null, count: 2, scope: null },
      openTasksCount: 5,
      expiredItemsCount: null,
      treatedByColleagueCount: null,
    })
  })

  it('#2106.30/.31 — les deux agrégats serveur voyagent jusqu’au résumé condensé', () => {
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: digestOf(
        { kind: 'missions_moving', state: 'ready', reason: null, count: 2, scope: null },
        { expiredItemsCount: 3, treatedByColleagueCount: 6 },
      ),
      history: query({ data: page([]) }),
      now: AT_THRESHOLD,
    })
    expect(state.kind === 'changed' && state.longAbsence).toMatchObject({
      expiredItemsCount: 3,
      treatedByColleagueCount: 6,
    })
  })

  it('#2106.30/.31 — une lecture du digest qui échoue laisse les deux agrégats à `null`, jamais 0', () => {
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: query({ isError: true }),
      history: query({ data: page([]) }),
      now: AT_THRESHOLD,
    })
    expect(state.kind === 'changed' && state.longAbsence).toMatchObject({
      expiredItemsCount: null,
      treatedByColleagueCount: null,
    })
  })

  it('#2106.33 — le résumé condensé ne porte jamais une LISTE, seulement des agrégats', () => {
    // La contrainte anti-journal-exhaustif : des clés SCALAIRES, jamais un
    // tableau d'items. Un `Object.keys` qui en verrait une de plus ou un
    // tableau caché sous l'une d'elles serait déjà le début d'un journal.
    const state = sinceLastVisitState({
      lastSeen: seen(SINCE),
      digest: digestOf(
        { kind: 'account_signals', state: 'ready', reason: null, count: 4, scope: null },
        { expiredItemsCount: 2, treatedByColleagueCount: 1 },
      ),
      history: query({ data: page([]) }),
      now: AT_THRESHOLD,
      openTasksCount: 5,
    })
    const longAbsence = state.kind === 'changed' ? state.longAbsence : null
    expect(longAbsence).not.toBeNull()
    expect(Object.keys(longAbsence ?? {}).sort()).toEqual([
      'expiredItemsCount',
      'openTasksCount',
      'topLine',
      'treatedByColleagueCount',
    ])
    expect(Array.isArray(longAbsence?.topLine)).toBe(false)
  })
})
