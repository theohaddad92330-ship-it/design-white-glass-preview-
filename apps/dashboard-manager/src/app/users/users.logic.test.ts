import { describe, expect, it } from 'vitest'
import type { AdminUser, AdminUsersAuthStates } from '@/lib/admin'
import { compareValues } from '@/ui/DataTable.logic'
import {
  compterEtatsNonLus,
  compterParFiltre,
  correspond,
  filtrer,
  joindreEtatsDauth,
  libelleActivite,
  libelleDossiers,
  libelleConnexion,
  libelleEtat,
  libelleRoles,
  libellePortee,
  fonctionsFermees,
  triConnexion,
  triEspaces,
  triEtat,
  type LigneUtilisateur,
} from './users.logic'

const utilisateur = (over: Partial<AdminUser> = {}): AdminUser => ({
  userId: 'u1',
  email: 'ada@b.co',
  fullName: 'Ada Lovelace',
  plan: 'growth',
  accountsUsed: 3,
  accountsLimit: 250,
  workspaces: [{ id: 'w1', name: 'Skaizen', role: 'owner' }],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const etats = (states: AdminUsersAuthStates['states'], complete = true): AdminUsersAuthStates => ({ complete, states })

const etat = (over: Partial<AdminUsersAuthStates['states'][number]> = {}): AdminUsersAuthStates['states'][number] => ({
  userId: 'u1',
  confirmed: true,
  banned: false,
  bannedUntil: null,
  lastSignInAt: '2026-09-01T10:00:00.000Z',
  ...over,
})

const ligne = (over: Partial<LigneUtilisateur> = {}): LigneUtilisateur => ({
  userId: 'u1',
  email: 'ada@b.co',
  fullName: 'Ada Lovelace',
  plan: 'growth',
  planScope: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  espaces: [{ id: 'w1', name: 'Skaizen', role: 'owner' }],
  connexion: { etat: 'connecte', date: '2026-09-01T10:00:00.000Z' },
  compte: { etat: 'actif' },
  ...over,
})

describe('joindreEtatsDauth — « jamais connecté » n’est pas « on ne sait pas » (#1664)', () => {
  it('lit une date de connexion mesurée', () => {
    const [row] = joindreEtatsDauth([utilisateur()], etats([etat()]))
    expect(row?.connexion).toEqual({ etat: 'connecte', date: '2026-09-01T10:00:00.000Z' })
    expect(row?.compte).toEqual({ etat: 'actif' })
  })

  it('« jamais connecté » quand le magasin a répondu `null`', () => {
    const [row] = joindreEtatsDauth([utilisateur()], etats([etat({ lastSignInAt: null })]))
    expect(row?.connexion).toEqual({ etat: 'jamais_connecte' })
  })

  it('« inconnu » — PAS « jamais » — quand le compte n’a pas pu être lu', () => {
    // ⚠️ Le défaut que ce test empêche : une panne du magasin
    // d'authentification ferait apparaître TOUT LE MONDE dans la pilule
    // « jamais connectés », et une campagne de réactivation partirait sur des
    // clients actifs.
    const [row] = joindreEtatsDauth([utilisateur()], etats([], false))
    expect(row?.connexion).toEqual({ etat: 'inconnu' })
    expect(row?.compte).toEqual({ etat: 'inconnu' })
  })

  it('« inconnu » même quand la lecture est COMPLÈTE — un profil sans compte d’auth est une anomalie, pas une personne jamais venue', () => {
    const [row] = joindreEtatsDauth([utilisateur()], etats([etat({ userId: 'quelquun-dautre' })], true))
    expect(row?.connexion).toEqual({ etat: 'inconnu' })
  })

  it('un compte suspendu porte sa date de fin de bannissement', () => {
    const [row] = joindreEtatsDauth(
      [utilisateur()],
      etats([etat({ banned: true, bannedUntil: '2126-01-01T00:00:00.000Z' })]),
    )
    expect(row?.compte).toEqual({ etat: 'suspendu', jusquau: '2126-01-01T00:00:00.000Z' })
  })

  it('joint par IDENTIFIANT, jamais par position', () => {
    // Les deux listes viennent de deux sources : ni le même ordre, ni la même
    // longueur. Une jointure positionnelle donnerait la suspension d'Ada à Bob.
    const users = [utilisateur({ userId: 'ada' }), utilisateur({ userId: 'bob' })]
    const lignes = joindreEtatsDauth(
      users,
      etats([etat({ userId: 'bob', banned: true }), etat({ userId: 'ada', lastSignInAt: null })]),
    )
    expect(lignes[0]?.userId).toBe('ada')
    expect(lignes[0]?.compte.etat).toBe('actif')
    expect(lignes[0]?.connexion.etat).toBe('jamais_connecte')
    expect(lignes[1]?.userId).toBe('bob')
    expect(lignes[1]?.compte.etat).toBe('suspendu')
  })
})

describe('les cinq pilules de filtre', () => {
  const lignes: LigneUtilisateur[] = [
    ligne({ userId: 'actif' }),
    ligne({ userId: 'suspendu', compte: { etat: 'suspendu', jusquau: null } }),
    ligne({ userId: 'jamais', connexion: { etat: 'jamais_connecte' } }),
    ligne({ userId: 'sans-espace', espaces: [] }),
    ligne({ userId: 'illisible', compte: { etat: 'inconnu' }, connexion: { etat: 'inconnu' } }),
  ]

  it('« actifs » ne compte QUE l’état mesuré actif', () => {
    // Un état inconnu n'est pas « actif par défaut » : sinon la pilule
    // afficherait tout le monde un jour de panne.
    expect(filtrer(lignes, 'actifs').map(l => l.userId)).toEqual(['actif', 'jamais', 'sans-espace'])
    expect(correspond(ligne({ compte: { etat: 'inconnu' } }), 'actifs')).toBe(false)
  })

  it('« jamais connectés » ne ramasse PAS les états inconnus', () => {
    expect(filtrer(lignes, 'jamais_connectes').map(l => l.userId)).toEqual(['jamais'])
  })

  it('« suspendus » et « sans espace » disent ce qu’ils disent', () => {
    expect(filtrer(lignes, 'suspendus').map(l => l.userId)).toEqual(['suspendu'])
    expect(filtrer(lignes, 'sans_espace').map(l => l.userId)).toEqual(['sans-espace'])
  })

  it('« tous » ne filtre rien', () => {
    expect(filtrer(lignes, 'tous')).toHaveLength(5)
  })

  it('les comptes des pilules sont ceux des listes qu’elles ouvrent', () => {
    const comptes = compterParFiltre(lignes)
    expect(comptes).toEqual({ tous: 5, actifs: 3, suspendus: 1, jamais_connectes: 1, sans_espace: 1 })
    for (const [filtre, compte] of Object.entries(comptes)) {
      expect(filtrer(lignes, filtre as keyof typeof comptes)).toHaveLength(compte)
    }
  })

  it('les états non lus se COMPTENT — sinon « actifs + suspendus = tous » est une promesse invérifiable', () => {
    expect(compterEtatsNonLus(lignes)).toBe(1)
    const comptes = compterParFiltre(lignes)
    expect(comptes.actifs + comptes.suspendus + compterEtatsNonLus(lignes)).toBe(comptes.tous)
  })
})

describe('ce que les colonnes affichent', () => {
  it('« jamais connecté » est écrit en toutes lettres, et « non lu » aussi — les deux ne se confondent pas', () => {
    const formater = (iso: string): string => `formaté:${iso}`
    expect(libelleConnexion({ etat: 'jamais_connecte' }, formater)).toEqual({ texte: 'jamais connecté', ton: 'mesure' })
    expect(libelleConnexion({ etat: 'inconnu' }, formater)).toEqual({ texte: 'non lu', ton: 'absent' })
    expect(libelleConnexion({ etat: 'connecte', date: 'X' }, formater)).toEqual({
      texte: 'formaté:X',
      ton: 'mesure',
    })
  })

  it('l’état non lu ne se déguise pas en « actif »', () => {
    expect(libelleEtat({ etat: 'actif' }).texte).toBe('actif')
    expect(libelleEtat({ etat: 'suspendu', jusquau: null }).texte).toBe('suspendu')
    expect(libelleEtat({ etat: 'inconnu' }).texte).toBe('non lu')
  })

  it('les rôles sont DISTINCTS, et l’absence d’espace ne rend pas une chaîne vide', () => {
    expect(libelleRoles([])).toBe('—')
    expect(
      libelleRoles([
        { id: 'a', name: 'A', role: 'owner' },
        { id: 'b', name: 'B', role: 'member' },
        { id: 'c', name: 'C', role: 'member' },
      ]),
    ).toBe('owner · member')
  })
})

describe('le tri traite les deux absences de façon OPPOSÉE, et c’est voulu', () => {
  it('« jamais connecté » se range AVANT toutes les dates — c’est sa vraie place', () => {
    expect(
      compareValues(triConnexion({ etat: 'jamais_connecte' }), triConnexion({ etat: 'connecte', date: 'z' }), 'asc'),
    ).toBeLessThan(0)
  })

  it('« non lu » sort en dernier DANS LES DEUX SENS — il n’est ni le plus grand ni le plus petit', () => {
    const inconnu = triConnexion({ etat: 'inconnu' })
    const mesure = triConnexion({ etat: 'connecte', date: '2026-01-01' })
    expect(compareValues(inconnu, mesure, 'asc')).toBeGreaterThan(0)
    expect(compareValues(inconnu, mesure, 'desc')).toBeGreaterThan(0)
    // Et « jamais connecté » n'est PAS traité comme non mesuré.
    expect(triConnexion({ etat: 'jamais_connecte' })).not.toBeNull()
  })

  it('un état non lu ne se range pas entre « actif » et « suspendu »', () => {
    expect(triEtat({ etat: 'inconnu' })).toBeNull()
    expect(triEtat({ etat: 'actif' })).toBe('actif')
    expect(
      compareValues(triEtat({ etat: 'inconnu' }), triEtat({ etat: 'suspendu', jusquau: null }), 'desc'),
    ).toBeGreaterThan(0)
  })

  it('zéro espace est une MESURE : elle se trie, elle ne sort pas en dernier', () => {
    expect(triEspaces([])).toBe('')
    expect(triEspaces([{ id: 'a', name: 'Skaizen', role: 'owner' }])).toBe('Skaizen')
    expect(
      compareValues(triEspaces([]), triEspaces([{ id: 'a', name: 'Skaizen', role: 'owner' }]), 'asc'),
    ).toBeLessThan(0)
  })
})

// PLAN-GATE #4381 — le plan du back-office doit dire DE QUI il est, et ce qu'il n'ouvre pas.
describe('PLAN-GATE #4381 — portée du plan', () => {
  it('un membre : le plan est celui de l’ESPACE, porté par son propriétaire', () => {
    expect(
      libellePortee({
        workspaceId: 'w1',
        workspaceName: 'EXTEAM',
        ownerUserId: 'o',
        ownerEmail: 'c@exteam.fr',
        isOwner: false,
      }),
    ).toBe('Plan de l’espace EXTEAM — porté par c@exteam.fr')
  })

  it('SAIT DIRE NON : le propriétaire et le compte solo n’ont pas d’étiquette de portée', () => {
    expect(
      libellePortee({
        workspaceId: 'w1',
        workspaceName: 'EXTEAM',
        ownerUserId: 'o',
        ownerEmail: 'h@exteam.fr',
        isOwner: true,
      }),
    ).toBeNull()
    expect(libellePortee(null)).toBeNull()
    expect(libellePortee(undefined)).toBeNull()
  })

  it('nomme ce que le palier N’ouvre PAS (Entreprise sans Vivier ne se découvre pas en réunion)', () => {
    const catalogue = [
      { key: 'team', features: ['exports', 'chat_ai'] },
      { key: 'growth', features: ['exports', 'chat_ai', 'talent_pool'] },
    ]
    expect(fonctionsFermees('team', catalogue)).toContain('Vivier')
    expect(fonctionsFermees('growth', catalogue)).not.toContain('Vivier')
  })

  it('catalogue absent ou palier inconnu : on ne devine pas, liste vide', () => {
    expect(fonctionsFermees('team', [])).toEqual([])
    expect(fonctionsFermees('team', [{ key: 'team' }])).toEqual([])
  })
})

describe('libelleActivite (#4423.1)', () => {
  const fmt = (iso: string) => iso.slice(0, 10)

  it('sign-in au 01/10 + activité au 20/10 → 20/10, la connexion reste dessous', () => {
    const l = libelleActivite({ at: '2026-10-20T08:00:00.000Z', source: 'action' }, '2026-10-01T10:02:00.000Z', fmt)
    expect(l.activite).toBe('2026-10-20')
    expect(l.source).toBe('action dans l’espace')
    expect(l.connexion).toBe('2026-10-01')
  })

  it('aucune activité : le dit, ne met pas de date', () => {
    const l = libelleActivite(null, null, fmt)
    expect(l.activite).toBe('aucune activité enregistrée')
    expect(l.connexion).toBe('jamais connecté')
  })

  it('connexion non lue (auth indisponible) ≠ jamais connecté', () => {
    expect(libelleActivite(null, undefined, fmt).connexion).toBe('non lue')
  })
})

describe('libelleDossiers (#4423.2)', () => {
  it('chaque chiffre dit ce qu’il compte, l’écart est nommé', () => {
    const l = libelleDossiers({
      total: 6,
      completed: 5,
      active: 6,
      followed: 5,
      notCompletedNames: ['Dachser France'],
      notFollowedNames: ['Dachser France'],
    })
    expect(l).toEqual([
      '6 analyses lancées',
      '5 terminées (celles que Laura compte comme « comptes analysés »)',
      '6 actifs (non archivés — le « Comptes actifs » de la vue ESN, qui n’est pas « lancées »)',
      '5 suivies (ce que l’app appelle « Comptes suivis »)',
      'non terminée : Dachser France',
      'non suivi : Dachser France',
    ])
  })

  it('nomme le statut des non terminées et la raison des échecs', () => {
    const l = libelleDossiers({
      total: 281,
      completed: 5,
      followed: 5,
      notCompletedNames: [],
      notFollowedNames: [],
      notCompletedByStatus: { imported: 275, error: 1 },
      failedReasons: [{ name: 'Dachser', reason: null }],
    })
    expect(l).toContain('non terminées par statut : 275 importée (à compléter), 1 en échec')
    expect(l).toContain('échec Dachser : aucune raison consignée')
  })

  it('aucun écart : pas de ligne d’écart', () => {
    const l = libelleDossiers({
      total: 2,
      completed: 2,
      active: 2,
      followed: 2,
      notCompletedNames: [],
      notFollowedNames: [],
    })
    expect(l).toHaveLength(4)
  })

  it('ventilation illisible : le dit, ne fabrique pas de zéros', () => {
    expect(libelleDossiers(null)).toEqual(['ventilation indisponible'])
  })
})
