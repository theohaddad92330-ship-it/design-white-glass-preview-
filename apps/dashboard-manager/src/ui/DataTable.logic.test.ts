import { describe, expect, it } from 'vitest'
import {
  canHideColumn,
  clampColumnWidth,
  columnVisibilityStorageKey,
  columnWidthsStorageKey,
  compareValues,
  computeVirtualWindow,
  filterRowsByQuery,
  matchesQuery,
  nextSortState,
  parseColumnWidths,
  parseHiddenColumns,
  resolvePagination,
  resolveTableState,
  ROW_HEIGHT_PX,
  sortRows,
  VIRTUALIZE_ROW_THRESHOLD,
} from './DataTable.logic'

describe('nextSortState — cycle au clic', () => {
  it('LIT quelque chose — aucun tri initial part sur asc', () => {
    expect(nextSortState(null, 'nom')).toEqual({ key: 'nom', direction: 'asc' })
  })

  it('asc → desc → aucun tri, sur la MÊME colonne', () => {
    let state = nextSortState(null, 'nom')
    state = nextSortState(state, 'nom')
    expect(state).toEqual({ key: 'nom', direction: 'desc' })
    state = nextSortState(state, 'nom')
    expect(state).toBeNull()
  })

  it('cliquer une AUTRE colonne repart à asc, jamais desc', () => {
    const state = nextSortState({ key: 'nom', direction: 'desc' }, 'date')
    expect(state).toEqual({ key: 'date', direction: 'asc' })
  })
})

describe('compareValues — une valeur non mesurée trie TOUJOURS en dernier', () => {
  it('sait dire NON — null/undefined ne sont jamais lus comme la plus grande valeur', () => {
    expect(compareValues(null, 5, 'desc')).toBeGreaterThan(0) // null après 5 en desc
    expect(compareValues(undefined, 5, 'asc')).toBeGreaterThan(0) // null après 5 en asc aussi
    expect(compareValues(5, null, 'desc')).toBeLessThan(0)
    expect(compareValues(null, null, 'asc')).toBe(0)
  })

  it('compare les nombres numériquement', () => {
    expect(compareValues(2, 10, 'asc')).toBeLessThan(0) // pas un tri lexicographique ("10" < "2")
    expect(compareValues(2, 10, 'desc')).toBeGreaterThan(0)
  })

  it('compare les chaînes en français (accents)', () => {
    expect(compareValues('écurie', 'facture', 'asc')).toBeLessThan(0)
  })
})

describe('sortRows — bout en bout', () => {
  type Row = { nom: string; score: number | null }
  const rows: Row[] = [
    { nom: 'B', score: 5 },
    { nom: 'A', score: null },
    { nom: 'C', score: 10 },
  ]

  it('les lignes non mesurées restent en QUEUE, dans les deux sens', () => {
    const asc = sortRows(rows, r => r.score, 'asc').map(r => r.nom)
    expect(asc).toEqual(['B', 'C', 'A'])
    const desc = sortRows(rows, r => r.score, 'desc').map(r => r.nom)
    expect(desc).toEqual(['C', 'B', 'A'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — ne mute pas le tableau d’origine', () => {
    sortRows(rows, r => r.score, 'asc')
    expect(rows.map(r => r.nom)).toEqual(['B', 'A', 'C'])
  })
})

/**
 * #1672.6 — « les cinq états du tableau, distincts » : chargement (squelette),
 * vide (jamais rien), vide À CAUSE du filtre, erreur, partiel. Un seul point
 * d'entrée, une PRIORITÉ écrite : `loading` et `error` court-circuitent tout
 * le reste (aucune donnée à filtrer pendant un chargement ou une panne), et
 * une absence TOTALE (`totalRows === 0`) prime sur « vide à cause du filtre »
 * — sinon un tableau réellement vide se lirait « ta recherche ne donne rien »,
 * ce qui inviterait à effacer une recherche qui n'existe pas.
 */
describe('resolveTableState — cinq états distincts (#1672.6)', () => {
  it('chargement — prime sur tout le reste', () => {
    expect(resolveTableState({ status: 'loading', totalRows: 0, visibleRows: 0, hasActiveQuery: false })).toEqual({
      kind: 'loading',
    })
    expect(resolveTableState({ status: 'loading', totalRows: 40, visibleRows: 40, hasActiveQuery: true })).toEqual({
      kind: 'loading',
    })
  })

  it('erreur — prime sur vide et partiel', () => {
    expect(resolveTableState({ status: 'error', totalRows: 0, visibleRows: 0, hasActiveQuery: false })).toEqual({
      kind: 'error',
    })
  })

  it('vide, jamais rien — totalRows à 0, sans recherche active', () => {
    expect(resolveTableState({ status: 'ready', totalRows: 0, visibleRows: 0, hasActiveQuery: false })).toEqual({
      kind: 'empty',
    })
  })

  it('vide, jamais rien PRIME sur « vide à cause du filtre » — un tableau sans aucune ligne n’invite pas à effacer une recherche', () => {
    expect(resolveTableState({ status: 'ready', totalRows: 0, visibleRows: 0, hasActiveQuery: true })).toEqual({
      kind: 'empty',
    })
  })

  it('vide À CAUSE du filtre — des lignes existent, la recherche n’en retient aucune', () => {
    expect(resolveTableState({ status: 'ready', totalRows: 340, visibleRows: 0, hasActiveQuery: true })).toEqual({
      kind: 'empty-filtered',
    })
  })

  it('une recherche active à 0 résultat sans lignes TOTALES ≠ une recherche inactive à 0 lignes visibles', () => {
    // Sans recherche active, 0 ligne visible sur des lignes existantes ne
    // devrait jamais arriver (rien ne filtre), mais si un appelant l’atteint
    // quand même, ce n’est pas « vide à cause du filtre » — rien ne le dit.
    expect(resolveTableState({ status: 'ready', totalRows: 340, visibleRows: 0, hasActiveQuery: false })).toEqual({
      kind: 'rows',
      partial: false,
    })
  })

  it('lignes normales — ni chargement, ni erreur, ni vide', () => {
    expect(resolveTableState({ status: 'ready', totalRows: 340, visibleRows: 12, hasActiveQuery: true })).toEqual({
      kind: 'rows',
      partial: false,
    })
  })

  it('partiel — porte un DRAPEAU sur « rows », il ne remplace pas l’affichage des lignes', () => {
    expect(resolveTableState({ status: 'partial', totalRows: 340, visibleRows: 340, hasActiveQuery: false })).toEqual({
      kind: 'rows',
      partial: true,
    })
  })
})

/**
 * #1672.4 — « recherche en tête de tableau + compteur ». La décision de
 * correspondance vit ici, pure : c'est elle qui garantit que le compteur
 * affiché est TOUJOURS celui des lignes réellement filtrées, jamais un total
 * qui ment (doctrine : un compteur juste peut promettre un filtre faux).
 */
describe('matchesQuery / filterRowsByQuery — #1672.4', () => {
  it('une requête vide ou faite d’espaces ne filtre RIEN', () => {
    expect(matchesQuery('Alice Dupont', '')).toBe(true)
    expect(matchesQuery('Alice Dupont', '   ')).toBe(true)
  })

  it('insensible à la casse', () => {
    expect(matchesQuery('Alice DUPONT', 'dupont')).toBe(true)
    expect(matchesQuery('alice dupont', 'DUPONT')).toBe(true)
  })

  it('sous-chaîne, pas un préfixe strict', () => {
    expect(matchesQuery('alice.dupont@example.com', 'example')).toBe(true)
    expect(matchesQuery('alice.dupont@example.com', 'zzz')).toBe(false)
  })

  it('filterRowsByQuery — le compteur des lignes rendues est celui qui sort d’ici', () => {
    const rows = [{ n: 'Alice' }, { n: 'Bob' }, { n: 'Alicia' }]
    const filtre = filterRowsByQuery(rows, 'ali', r => r.n)
    expect(filtre.map(r => r.n)).toEqual(['Alice', 'Alicia'])
  })

  it('filterRowsByQuery — requête vide rend TOUTES les lignes, une copie', () => {
    const rows = [{ n: 'Alice' }, { n: 'Bob' }]
    const filtre = filterRowsByQuery(rows, '', r => r.n)
    expect(filtre).toEqual(rows)
    expect(filtre).not.toBe(rows)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une requête qui ne matche personne rend un tableau vide, pas une erreur', () => {
    expect(filterRowsByQuery([{ n: 'Alice' }], 'zzz', r => r.n)).toEqual([])
  })
})

/**
 * #1672.1 — « sélecteur de colonnes + largeur de colonne redimensionnable,
 * persistée (localStorage, clé PAR TABLEAU) ». Ce qui est testable ici sans
 * DOM : la clé de stockage (jamais la même pour deux tableaux), le clamp de
 * largeur, et le parsing défensif d’un JSON qui peut être n’importe quoi —
 * `localStorage` peut rendre une valeur corrompue, tronquée, ou écrite par une
 * version antérieure du composant.
 */
describe('largeur et visibilité des colonnes — #1672.1', () => {
  it('clampColumnWidth — borne aux deux extrémités', () => {
    expect(clampColumnWidth(10)).toBe(60)
    expect(clampColumnWidth(9999)).toBe(640)
    expect(clampColumnWidth(200)).toBe(200)
  })

  it('clampColumnWidth — une valeur non finie ne casse rien, elle retombe au minimum', () => {
    expect(clampColumnWidth(Number.NaN)).toBe(60)
    expect(clampColumnWidth(Number.POSITIVE_INFINITY)).toBe(60)
  })

  it('clampColumnWidth — arrondit', () => {
    expect(clampColumnWidth(100.6)).toBe(101)
  })

  it('les clés de stockage sont DISTINCTES par tableau — la clé « par tableau » de la demande', () => {
    expect(columnVisibilityStorageKey('users')).not.toBe(columnVisibilityStorageKey('jobs'))
    expect(columnWidthsStorageKey('users')).not.toBe(columnWidthsStorageKey('jobs'))
    // Et les deux registres (visibilité / largeurs) d'un MÊME tableau ne se
    // marchent pas dessus non plus.
    expect(columnVisibilityStorageKey('users')).not.toBe(columnWidthsStorageKey('users'))
  })

  it('parseHiddenColumns — sait dire NON à un JSON corrompu ou de la mauvaise forme', () => {
    expect(parseHiddenColumns(null, ['nom', 'email'])).toEqual(new Set())
    expect(parseHiddenColumns('{ceci ne parse pas', ['nom', 'email'])).toEqual(new Set())
    expect(parseHiddenColumns('{"nom":true}', ['nom', 'email'])).toEqual(new Set()) // objet, pas un tableau
  })

  it('parseHiddenColumns — filtre les clés qui ne désignent plus une colonne connue', () => {
    // Une colonne retirée depuis l'écriture ne doit pas rester « masquée pour
    // toujours » dans le stockage sans qu'on puisse la voir nulle part.
    expect(parseHiddenColumns('["email","disparue"]', ['nom', 'email'])).toEqual(new Set(['email']))
  })

  it('parseColumnWidths — sait dire NON à un JSON corrompu, une valeur non numérique, une clé inconnue', () => {
    expect(parseColumnWidths(null, ['nom'])).toEqual({})
    expect(parseColumnWidths('pas du json', ['nom'])).toEqual({})
    expect(parseColumnWidths('["nom"]', ['nom'])).toEqual({}) // tableau, pas un objet
    expect(parseColumnWidths('{"nom":"200"}', ['nom'])).toEqual({}) // chaîne, pas un nombre
    expect(parseColumnWidths('{"disparue":200}', ['nom'])).toEqual({})
  })

  it('parseColumnWidths — clampe chaque largeur relue', () => {
    expect(parseColumnWidths('{"nom":9999}', ['nom'])).toEqual({ nom: 640 })
  })

  it('canHideColumn — refuse de masquer la DERNIÈRE colonne visible', () => {
    expect(canHideColumn(['nom', 'email'], new Set(), 'nom')).toBe(true)
    expect(canHideColumn(['nom', 'email'], new Set(['email']), 'nom')).toBe(false)
  })

  it('canHideColumn — (dé)masquer une colonne déjà masquée est toujours permis', () => {
    expect(canHideColumn(['nom', 'email'], new Set(['email']), 'email')).toBe(true)
  })
})

/**
 * #1672.4 — pagination SERVEUR, opt-in. `DataTable` ne pagine JAMAIS
 * lui-même : il reçoit la page déjà chargée par l'appelant (`rows`), le
 * compte total côté serveur, et se contente d'afficher où on en est —
 * `resolvePagination` est la seule dérivation de « combien de pages », « y
 * a-t-il un précédent/suivant » et « quelle plage de lignes ».
 */
describe('resolvePagination — pagination serveur, opt-in (#1672.4)', () => {
  it('LIT quelque chose — une page pleine au milieu d’une série', () => {
    expect(resolvePagination({ page: 2, pageSize: 50, total: 340 })).toEqual({
      pageCount: 7,
      hasPrevious: true,
      hasNext: true,
      rangeStart: 51,
      rangeEnd: 100,
    })
  })

  it('première page — pas de précédent', () => {
    expect(resolvePagination({ page: 1, pageSize: 50, total: 340 })).toEqual({
      pageCount: 7,
      hasPrevious: false,
      hasNext: true,
      rangeStart: 1,
      rangeEnd: 50,
    })
  })

  it('dernière page PARTIELLE — la plage s’arrête au total, pas à un pageSize plein', () => {
    expect(resolvePagination({ page: 7, pageSize: 50, total: 340 })).toEqual({
      pageCount: 7,
      hasPrevious: true,
      hasNext: false,
      rangeStart: 301,
      rangeEnd: 340,
    })
  })

  it('division exacte — la dernière page n’a pas de reste', () => {
    expect(resolvePagination({ page: 6, pageSize: 50, total: 300 })).toEqual({
      pageCount: 6,
      hasPrevious: true,
      hasNext: false,
      rangeStart: 251,
      rangeEnd: 300,
    })
  })

  it('sait dire NON — total à zéro : aucune page, rien à afficher', () => {
    expect(resolvePagination({ page: 1, pageSize: 50, total: 0 })).toEqual({
      pageCount: 0,
      hasPrevious: false,
      hasNext: false,
      rangeStart: 0,
      rangeEnd: 0,
    })
  })

  it('sait dire NON — une page hors bornes se ramène à la plus proche', () => {
    expect(resolvePagination({ page: 99, pageSize: 50, total: 340 })).toEqual(
      resolvePagination({ page: 7, pageSize: 50, total: 340 }),
    )
    expect(resolvePagination({ page: 0, pageSize: 50, total: 340 })).toEqual(
      resolvePagination({ page: 1, pageSize: 50, total: 340 }),
    )
    expect(resolvePagination({ page: -3, pageSize: 50, total: 340 })).toEqual(
      resolvePagination({ page: 1, pageSize: 50, total: 340 }),
    )
  })

  it('sait dire NON — un pageSize invalide ne divise jamais par zéro', () => {
    expect(resolvePagination({ page: 1, pageSize: 0, total: 340 })).toEqual({
      pageCount: 0,
      hasPrevious: false,
      hasNext: false,
      rangeStart: 0,
      rangeEnd: 0,
    })
  })
})

/**
 * #1672.5 — virtualisation : au-delà de `VIRTUALIZE_ROW_THRESHOLD` lignes
 * affichées, `DataTable` ne monte plus TOUTES les `<tr>` dans le DOM — une
 * fenêtre, calculée ici, dit quelle tranche rendre et quel « vide » (padding)
 * garder en haut/bas pour que la hauteur totale — et donc la barre de
 * défilement — ne bouge pas.
 */
describe('computeVirtualWindow — fenêtre de lignes rendues (#1672.5)', () => {
  it('LIT quelque chose — un tableau scrollé au milieu ne rend qu’une tranche', () => {
    const fenetre = computeVirtualWindow({
      rowCount: 1000,
      rowHeightPx: 32,
      scrollTop: 3200, // ligne 100
      viewportHeightPx: 320, // 10 lignes visibles
      overscan: 5,
    })
    expect(fenetre.startIndex).toBe(95) // 100 - overscan
    expect(fenetre.endIndex).toBe(115) // 100 + 10 + overscan
    expect(fenetre.topPaddingPx).toBe(95 * 32)
    expect(fenetre.bottomPaddingPx).toBe((1000 - 115) * 32)
  })

  it('en haut de la liste — le padding du haut ne devient jamais négatif', () => {
    const fenetre = computeVirtualWindow({
      rowCount: 1000,
      rowHeightPx: 32,
      scrollTop: 0,
      viewportHeightPx: 320,
      overscan: 5,
    })
    expect(fenetre.startIndex).toBe(0)
    expect(fenetre.topPaddingPx).toBe(0)
  })

  it('en bas de la liste — la fenêtre s’arrête au DERNIER index, jamais au-delà', () => {
    const fenetre = computeVirtualWindow({
      rowCount: 1000,
      rowHeightPx: 32,
      scrollTop: 1000 * 32, // au-delà de la fin
      viewportHeightPx: 320,
      overscan: 5,
    })
    expect(fenetre.endIndex).toBe(1000)
    expect(fenetre.bottomPaddingPx).toBe(0)
  })

  it('sait dire NON — pas encore mesuré (`viewportHeightPx` à 0) : tout rendre plutôt que tout cacher', () => {
    const fenetre = computeVirtualWindow({ rowCount: 500, rowHeightPx: 32, scrollTop: 0, viewportHeightPx: 0 })
    expect(fenetre.startIndex).toBe(0)
    expect(fenetre.endIndex).toBe(500)
  })

  it('aucune ligne — fenêtre vide, aucun padding', () => {
    expect(computeVirtualWindow({ rowCount: 0, rowHeightPx: 32, scrollTop: 0, viewportHeightPx: 320 })).toEqual({
      startIndex: 0,
      endIndex: 0,
      topPaddingPx: 0,
      bottomPaddingPx: 0,
    })
  })

  it('n’attrape pas ce qu’elle ne vise pas — l’INVARIANT de hauteur : haut + tranche + bas = tout', () => {
    const rowCount = 733
    const rowHeightPx = 32
    for (const scrollTop of [0, 500, 4096, 23000, 999999]) {
      const fenetre = computeVirtualWindow({ rowCount, rowHeightPx, scrollTop, viewportHeightPx: 280, overscan: 4 })
      const rendues = fenetre.endIndex - fenetre.startIndex
      const total = fenetre.topPaddingPx / rowHeightPx + rendues + fenetre.bottomPaddingPx / rowHeightPx
      expect(total).toBe(rowCount)
    }
  })

  it('la constante de seuil et la hauteur de ligne existent et sont cohérentes avec #1672.8', () => {
    expect(VIRTUALIZE_ROW_THRESHOLD).toBe(200)
    expect(ROW_HEIGHT_PX).toBe(32)
  })
})

// #1672.6 — export CSV : TENTÉ (bouton, `Blob`, `csvEscape`/`buildCsv`
// testés ici même), puis RETIRÉ entièrement. Voir le docblock de
// `DataTable.logic.ts` juste avant cette ligne pour la raison — une garde
// d'architecture hors périmètre bloque tout mécanisme de fichier
// téléchargeable, et la cellule envisagée aurait exporté des adresses non
// masquées. Aucun test n'en reste : rien ne doit laisser croire que la
// fonctionnalité existe.
