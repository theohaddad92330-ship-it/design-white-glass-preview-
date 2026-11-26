import { describe, expect, it } from 'vitest'
import { NEED_NEXT_ACTIONS } from './need-next-action.js'
import { BLOCKER_ACTIONS, INVOICE_BLOCKERS } from './invoice-readiness.js'
import {
  ACCOUNT_SPRINT_NEXT_ACTIONS,
  ACTIVE_MISSION_NEXT_ACTIONS,
  NEXT_ACTION_LABEL_NAMESPACES,
  nextActionLink,
  nextActionRoutes,
} from './next-action.js'

/**
 * LA DÉRIVATION UNIQUE — « prochaine action » → libellé + destination.
 *
 * Ce qui se teste ici :
 *  1. la COUVERTURE : tout identifiant du vocabulaire d'origine passe, aucun ne
 *     tombe dans un trou (comparaison d'ENSEMBLES d'identifiants, jamais de
 *     chaînes libres) ;
 *  2. le REFUS de fabriquer un lien : « rien à engager » n'a pas de destination,
 *     et un écran qui est DÉJÀ la destination n'en propose pas une vers
 *     lui-même ;
 *  3. la STABILITÉ des clés de libellé : elles existent déjà dans le produit,
 *     cette dérivation ne les réinvente pas.
 */

const NEED_ID = '11111111-1111-4111-8111-111111111111'
const MISSION_ID = '22222222-2222-4222-8222-222222222222'

describe('la dérivation couvre tout le vocabulaire, et rien d’autre', () => {
  it('rend une destination pour chacune des six actions d’un besoin', () => {
    const covered = NEED_NEXT_ACTIONS.map(action => nextActionLink({ domain: 'need', action, needId: NEED_ID }))
    expect(covered.map(link => link.action)).toEqual([...NEED_NEXT_ACTIONS])
    // Aucune n'est muette : le besoin se répare TOUJOURS sur sa fiche.
    expect(covered.filter(link => link.route === null)).toEqual([])
  })

  it('rend une destination pour chaque action d’une mission active', () => {
    const covered = ACTIVE_MISSION_NEXT_ACTIONS.map(action =>
      nextActionLink({ domain: 'active_mission', action, missionId: MISSION_ID }),
    )
    expect(covered.map(link => link.action)).toEqual([...ACTIVE_MISSION_NEXT_ACTIONS])
  })

  it('rend une destination pour chaque bloqueur de facturation', () => {
    const covered = INVOICE_BLOCKERS.map(action => nextActionLink({ domain: 'invoice_blocker', action }))
    expect(covered.map(link => link.action)).toEqual([...INVOICE_BLOCKERS])
    expect(covered.filter(link => link.route === null)).toEqual([])
  })

  it('ne recopie PAS la table des bloqueurs — elle la lit', () => {
    // Deux tables de correspondance pour la même chose divergent au premier
    // renommage de route (GA-26). Celle des bloqueurs existe déjà : la
    // dérivation la LIT, elle ne la double pas.
    for (const blocker of INVOICE_BLOCKERS) {
      expect(nextActionLink({ domain: 'invoice_blocker', action: blocker }).route).toBe(BLOCKER_ACTIONS[blocker].route)
    }
  })

  it('le vocabulaire des missions actives vient du SCHÉMA, pas d’une liste recopiée', () => {
    // Si quelqu'un ajoute une septième action au schéma, elle entre ici sans
    // que personne n'ait à y penser — et la garde de couverture la réclame.
    expect(ACTIVE_MISSION_NEXT_ACTIONS).toContain('renew_now')
    expect(ACTIVE_MISSION_NEXT_ACTIONS).toContain('none')
    expect(ACTIVE_MISSION_NEXT_ACTIONS.length).toBeGreaterThanOrEqual(5)
  })
})

describe('« aucune » n’est pas une action', () => {
  it('« rien à engager maintenant » n’a AUCUNE destination', () => {
    // Un lien y promettrait un geste qui n'existe pas. L'écran écrit la phrase,
    // il ne fabrique pas de porte.
    const link = nextActionLink({ domain: 'active_mission', action: 'none', missionId: MISSION_ID })
    expect(link.route).toBe(null)
    expect(link.params).toEqual({})
    // Le libellé reste : « rien à faire » se DIT, il ne se tait pas.
    expect(link.labelKey).toBe('accountMissions:active.nextAction.none')
  })
})

describe('un écran ne se lie pas à lui-même', () => {
  it('sur la fiche d’un besoin, l’action reste du TEXTE', () => {
    const link = nextActionLink({
      domain: 'need',
      action: 'type_skills',
      needId: NEED_ID,
      origin: '/projects/needs/$needId',
    })
    // Un lien vers l'écran où l'on est déjà ne mène nulle part : il promet un
    // déplacement qui n'a pas lieu, et fait douter du reste des liens.
    expect(link.route).toBe(null)
    expect(link.labelKey).toBe('projects:openNeeds.nextAction.type_skills')
  })

  it('depuis la LISTE, la même action mène bien à la fiche', () => {
    const link = nextActionLink({
      domain: 'need',
      action: 'type_skills',
      needId: NEED_ID,
      origin: '/projects/needs',
    })
    expect(link.route).toBe('/projects/needs/$needId')
    expect(link.params).toEqual({ needId: NEED_ID })
  })
})

describe('les paramètres sont RÉSOLUS, jamais devinés', () => {
  it('une route paramétrée porte la valeur de son paramètre', () => {
    expect(nextActionLink({ domain: 'active_mission', action: 'renew_now', missionId: MISSION_ID })).toMatchObject({
      route: '/missions/$id',
      params: { id: MISSION_ID },
    })
  })

  it('une route littérale ne porte aucun paramètre', () => {
    expect(nextActionLink({ domain: 'invoice_blocker', action: 'missing_timesheet' })).toMatchObject({
      route: '/missions/cra',
      params: {},
    })
  })
})

describe('les libellés vivent dans les namespaces déjà livrés', () => {
  it('chaque domaine nomme le namespace de ses libellés', () => {
    expect(NEXT_ACTION_LABEL_NAMESPACES).toEqual({
      need: 'projects',
      active_mission: 'accountMissions',
      invoice_blocker: 'missions',
      account_sprint: 'sprints',
    })
  })

  it('la clé porte SON namespace — un écran ne le recompose jamais', () => {
    expect(nextActionLink({ domain: 'need', action: 'run_matching', needId: NEED_ID }).labelKey).toBe(
      'projects:openNeeds.nextAction.run_matching',
    )
    expect(nextActionLink({ domain: 'invoice_blocker', action: 'missing_po' }).labelKey).toBe(
      'missions:readiness.actions.ask_po',
    )
  })
})

describe('l’inventaire des destinations est lisible d’un bloc', () => {
  it('rend toutes les routes de toutes les actions, sans doublon', () => {
    const routes = nextActionRoutes()
    // La garde d'architecture s'en sert pour confronter l'ARBRE DE ROUTES réel.
    // Un inventaire vide la rendrait verte pour toujours.
    expect(routes.length).toBeGreaterThan(0)
    expect(new Set(routes).size).toBe(routes.length)
    expect(routes).toContain('/projects/needs/$needId')
    expect(routes).toContain('/missions/$id')
    expect(routes).toContain('/missions/cra')
  })
})

describe('#3257.7b — le domaine `account_sprint` du board d’effort', () => {
  const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'

  it('couvre chaque action, chacune menant au dossier du compte', () => {
    expect(ACCOUNT_SPRINT_NEXT_ACTIONS.length).toBeGreaterThanOrEqual(2)
    for (const action of ACCOUNT_SPRINT_NEXT_ACTIONS) {
      const link = nextActionLink({
        domain: 'account_sprint',
        action,
        accountId: ACCOUNT_ID,
        origin: '/accounts', // #4359 — le board d'effort est une lentille de /accounts
      })
      expect(link.route).toBe('/accounts/$id')
      expect(link.params).toEqual({ id: ACCOUNT_ID })
      expect(link.labelKey.startsWith(`${NEXT_ACTION_LABEL_NAMESPACES.account_sprint}:`)).toBe(true)
    }
  })

  it('ne devine pas un lien sans identifiant de compte', () => {
    const link = nextActionLink({ domain: 'account_sprint', action: 'do_next_task', accountId: '' })
    expect(link.route).toBeNull()
  })

  it('sa destination entre dans nextActionRoutes (la garde la confronte à l’arbre)', () => {
    expect(nextActionRoutes()).toContain('/accounts/$id')
  })
})
