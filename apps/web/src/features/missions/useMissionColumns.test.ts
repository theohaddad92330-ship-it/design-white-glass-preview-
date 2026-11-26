import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { COMPACT_MISSION_COLUMNS, DEFAULT_MISSION_COLUMNS, MISSION_COLUMN_KEYS, PINNED_MISSION_COLUMN } from './columns'
import { missionColumnsStorageKey, useMissionColumns } from './useMissionColumns'

const USER = 'user-42'

function signIn(id: string | null) {
  useCurrentUserStore.setState({ currentUser: id === null ? null : ({ id } as never) })
}

function viewport(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: /min-width:\s*1440px/.test(query) ? width >= 1440 : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

// Les tests historiques décrivent le bureau LARGE (défauts complets) ; le polyfill `matchMedia`
// du dépôt répond `matches: false`, ce qui se lirait « écran étroit » (D4, défauts compacts).
beforeEach(() => {
  window.localStorage.clear()
  signIn(USER)
  viewport(1440)
})

/**
 * Le choix des colonnes vit à UN SEUL endroit (GA-26).
 *
 * Ce hook est ce seul endroit : la liste des colonnes disponibles, celles qui
 * s'affichent par défaut, la colonne qu'on ne peut pas masquer, et la mémoire
 * du choix. Un écran qui recomposerait l'une de ces quatre choses ferait
 * diverger le tableau de son sélecteur au premier ajout de colonne.
 */
describe('useMissionColumns — le choix des colonnes vit à un seul endroit', () => {
  it('part des colonnes par défaut quand personne n’a rien choisi', () => {
    const { result } = renderHook(() => useMissionColumns())
    expect(result.current.visible).toEqual([...DEFAULT_MISSION_COLUMNS])
  })

  it('se SOUVIENT du choix d’un rendu à l’autre', () => {
    const first = renderHook(() => useMissionColumns())
    act(() => first.result.current.toggle('contractKind', true))
    first.unmount()

    const second = renderHook(() => useMissionColumns())
    expect(second.result.current.visible).toContain('contractKind')
  })

  it('garde l’ORDRE canonique, pas l’ordre des clics', () => {
    // Sans cela, cocher « Début » puis « Rôle » mettrait Début avant Rôle sur un
    // écran et l'inverse sur un autre : deux tableaux qui ne se ressemblent pas.
    const { result } = renderHook(() => useMissionColumns())
    act(() => result.current.toggle('startedOn', true))
    act(() => result.current.toggle('role', true))

    const positions = result.current.visible.map(key => MISSION_COLUMN_KEYS.indexOf(key))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('refuse de masquer la colonne qui NOMME la ligne', () => {
    // Une ligne sans son nom de mission n'est plus une ligne : on ne sait plus
    // de quoi les autres cellules parlent.
    const { result } = renderHook(() => useMissionColumns())
    act(() => result.current.toggle(PINNED_MISSION_COLUMN, false))
    expect(result.current.visible).toContain(PINNED_MISSION_COLUMN)
  })

  it('ignore une clé stockée qui n’existe plus — sans vider le tableau', () => {
    // Une colonne retirée du produit ne doit pas rendre le tableau illisible
    // pour ceux qui l'avaient cochée.
    window.localStorage.setItem(missionColumnsStorageKey(USER), JSON.stringify(['mission', 'colonne_disparue']))
    const { result } = renderHook(() => useMissionColumns())

    expect(result.current.visible).toContain('mission')
    expect(result.current.visible).not.toContain('colonne_disparue')
  })

  it('retombe sur les défauts devant un contenu illisible', () => {
    window.localStorage.setItem(missionColumnsStorageKey(USER), 'pas du json')
    const { result } = renderHook(() => useMissionColumns())
    expect(result.current.visible).toEqual([...DEFAULT_MISSION_COLUMNS])
  })

  /**
   * ⚠️ La clé porte l'identifiant de l'utilisateur — cause racine connue du
   * dépôt : « premier cookie = mauvaise identité ». Deux comptes sur la même
   * machine (le vrai et la démo) partageraient sinon le même tableau.
   */
  it('ne mélange PAS le choix de deux utilisateurs sur la même machine', () => {
    const first = renderHook(() => useMissionColumns())
    act(() => first.result.current.toggle('contractKind', true))
    first.unmount()

    signIn('autre-utilisateur')
    const second = renderHook(() => useMissionColumns())
    expect(second.result.current.visible).not.toContain('contractKind')
  })

  it('reste utilisable déconnecté — sans rien écrire', () => {
    signIn(null)
    const { result } = renderHook(() => useMissionColumns())
    expect(result.current.visible).toEqual([...DEFAULT_MISSION_COLUMNS])
    act(() => result.current.toggle('contractKind', true))
    // Le choix vit le temps de l'écran, mais rien n'est écrit sous une clé
    // anonyme qui serait ensuite servie au premier utilisateur venu.
    expect(result.current.visible).toContain('contractKind')
    expect(window.localStorage.length).toBe(0)
  })

  it('la colonne épinglée fait partie des colonnes connues', () => {
    // Une garde qui protégerait une clé absente de la liste ne garderait rien.
    expect(MISSION_COLUMN_KEYS).toContain(PINNED_MISSION_COLUMN)
    // Les défauts sont un SOUS-ENSEMBLE : proposer par défaut une colonne que le
    // tableau ne sait pas rendre ferait une colonne vide au premier affichage.
    for (const key of DEFAULT_MISSION_COLUMNS) expect(MISSION_COLUMN_KEYS).toContain(key)
  })

  /**
   * Le docblock de `columns.ts` ANNONCE des nombres (« Il y en a ONZE »,
   * « Sept sur onze »). Un compte écrit à la main dérive au premier ajout, et
   * une explication fausse est pire que pas d'explication — cause racine
   * connue : « un total de tracker est un argument ».
   *
   * Onze depuis le 28/08/2026 : la décision D43 a ouvert « Marge », refusée
   * jusque-là faute d'un arbitrage sur la table qui fait foi.
   */
  it('les nombres écrits dans la documentation sont ceux du code', () => {
    // ⚠️ SEIZE depuis le 01/11/2026 (« Satisfaction », #2408.33, L15), quinze
    // depuis le 19/09/2026 (« Manager », #2195.12), quatorze depuis
    // le 17/09 (« Owner », #2195.13), treize depuis le 16/09 (« Reconduction »,
    // #2195.20), douze depuis le 04/09 (« Prochaine action »,
    // #1354/#1355/#1357) — et TOUJOURS huit par défaut. Un total est
    // un ARGUMENT : la prose de `columns.ts` dit « quinze » et « huit sur
    // quinze », et ce test est ce qui l'empêche de vieillir en silence.
    expect(MISSION_COLUMN_KEYS).toHaveLength(16)
    // ⚠️ Le défaut n'a PAS bougé, et c'est une décision mesurée : la somme des
    // largeurs par défaut est bornée à 80 rem par `MissionsTable.test.tsx`,
    // chiffre relevé dans un vrai navigateur que jsdom ne sait pas refaire.
    // « Reconduction » est donc optionnelle, et VERROUILLÉE par l'écran de
    // décision de renouvellement, qui la déclare son sujet.
    expect(DEFAULT_MISSION_COLUMNS).toHaveLength(7)
    expect(DEFAULT_MISSION_COLUMNS).not.toContain('renewalStatus')
    expect(DEFAULT_MISSION_COLUMNS).not.toContain('owner')
    expect(DEFAULT_MISSION_COLUMNS).not.toContain('manager')
    expect(DEFAULT_MISSION_COLUMNS).not.toContain('satisfaction')
  })

  describe('#2195.20 — une colonne VERROUILLÉE par l’écran', () => {
    it('s’affiche même si elle n’est pas dans les défauts', () => {
      const { result } = renderHook(() => useMissionColumns(['renewalStatus']))
      expect(result.current.isVisible('renewalStatus')).toBe(true)
    })

    it('ne se décoche pas — la règle est tenue dans le hook, pas dans la case', () => {
      const { result } = renderHook(() => useMissionColumns(['renewalStatus']))
      act(() => result.current.toggle('renewalStatus', false))
      expect(result.current.isVisible('renewalStatus')).toBe(true)
    })

    it('sait dire NON : sans verrou, la même colonne reste ABSENTE', () => {
      // Le témoin qui prouve que le test précédent mesure le verrou et non un
      // défaut — sans lui, les deux seraient verts pour la mauvaise raison.
      const { result } = renderHook(() => useMissionColumns())
      expect(result.current.isVisible('renewalStatus')).toBe(false)
    })

    it('n’attrape pas ce qu’elle ne vise pas — les autres colonnes se décochent toujours', () => {
      const { result } = renderHook(() => useMissionColumns(['renewalStatus']))
      expect(result.current.isVisible('margin')).toBe(true)
      act(() => result.current.toggle('margin', false))
      expect(result.current.isVisible('margin')).toBe(false)
    })
  })

  /**
   * La colonne de marge est SÉLECTIONNABLE comme ses voisines — elle n'est pas
   * un cas particulier câblé ailleurs. Sans cette garde, la livrer « en dur »
   * dans le tableau la rendrait impossible à décocher pour un siège qui n'a pas
   * `finance:read` et qui ne verrait qu'une colonne « hors périmètre ».
   */
  it('« Marge » se décoche comme les autres', () => {
    const { result } = renderHook(() => useMissionColumns())
    expect(result.current.isVisible('margin')).toBe(true)
    act(() => result.current.toggle('margin', false))
    expect(result.current.isVisible('margin')).toBe(false)
  })
})

describe('useMissionColumns — « En cours »', () => {
  it('« En cours » garde ses huit défauts', () => {
    const { result } = renderHook(() => useMissionColumns())
    expect(result.current.visible).toEqual([...DEFAULT_MISSION_COLUMNS])
  })
})

/**
 * #4191 (recette 15/10, D4) — sous 1440 px, les colonnes SECONDAIRES s'effacent
 * des défauts plutôt que de tronquer les autres. Un choix enregistré par
 * l'utilisateur, lui, gagne toujours (un réglage vit à un seul endroit, GA-26).
 */
describe('useMissionColumns — défauts compacts sous 1440 px (D4)', () => {
  const original = window.matchMedia
  afterEach(() => {
    window.matchMedia = original
  })

  it('à 1280 px : les défauts compacts, sans « Risques » ni « Prochaine action »', () => {
    viewport(1280)
    const { result } = renderHook(() => useMissionColumns())
    expect(result.current.visible).toEqual([...COMPACT_MISSION_COLUMNS])
    expect(result.current.visible).not.toContain('risks')
    expect(result.current.visible).not.toContain('nextAction')
    for (const key of ['mission', 'staffing', 'status', 'endsOn', 'margin'] as const)
      expect(result.current.visible).toContain(key)
  })

  it('à 1440 px et plus : les défauts complets', () => {
    viewport(1440)
    const { result } = renderHook(() => useMissionColumns())
    expect(result.current.visible).toEqual([...DEFAULT_MISSION_COLUMNS])
  })

  it('un choix enregistré gagne sur le compact, même étroit', () => {
    viewport(1280)
    window.localStorage.setItem(missionColumnsStorageKey(USER), JSON.stringify(['mission', 'risks']))
    const { result } = renderHook(() => useMissionColumns())
    expect(result.current.visible).toContain('risks')
  })

  it('cocher une colonne depuis le compact garde le reste du compact', () => {
    viewport(1280)
    const { result } = renderHook(() => useMissionColumns())
    act(() => result.current.toggle('risks', true))
    expect(result.current.visible).toContain('risks')
    expect(result.current.visible).toContain('endsOn')
    expect(result.current.visible).not.toContain('nextAction')
  })

  it('sait dire NON : le compact est un sous-ensemble strict des défauts', () => {
    expect(COMPACT_MISSION_COLUMNS.length).toBeLessThan(DEFAULT_MISSION_COLUMNS.length)
    for (const key of COMPACT_MISSION_COLUMNS) expect(DEFAULT_MISSION_COLUMNS).toContain(key)
  })
})
