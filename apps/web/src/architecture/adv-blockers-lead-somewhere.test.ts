import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ADV_BLOCKERS, ADV_BLOCKER_ACTIONS, ADV_RESERVED_BLOCKERS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * UN MOTIF DE BLOCAGE ADV MÈNE À UN ÉCRAN QUI EXISTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un indicateur de qualité qui ne mène nulle part ne sert à rien. » Chaque
 * motif d'{@link ADV_BLOCKERS} porte sa route de réparation, exactement comme
 * les bloqueurs de facturation portent la leur (`missing_timesheet →
 * /missions/cra`). Une route écrite à la main dans une table de constantes est
 * une chaîne de caractères : rien, dans le typage, n'empêche `/missions/adf`.
 *
 * Cette garde lit l'ARBRE DE ROUTES RÉEL (`routeTree.gen.ts`, généré par le
 * plugin de routage) et refuse toute destination qui n'y figure pas. Elle ne
 * relit pas une liste écrite à côté : une liste recopiée diverge, et une garde
 * qui compare deux copies de la même erreur reste verte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PRÉTEND PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit pas si l'écran de destination RÉPARE effectivement le motif — ça
 * demanderait de reconnaître un geste métier dans du JSX. Ce qu'elle sait dire
 * est exact : la porte existe, ou elle n'existe pas.
 */

const SRC = join(__dirname, '..')
const ROUTE_TREE = readFileSync(join(SRC, 'routeTree.gen.ts'), 'utf8')

/**
 * Les chemins déclarés par l'arbre — extraits des lignes `path: '/…'` qu'il
 * génère, jamais d'une liste tenue à la main.
 */
function declaredRoutes(): Set<string> {
  return new Set([...ROUTE_TREE.matchAll(/^\s*path: '([^']+)'/gm)].map(match => match[1] as string))
}

describe('les motifs ADV mènent à un écran qui existe', () => {
  const routes = declaredRoutes()

  it('la garde LIT quelque chose — un arbre vide passerait au vert pour toujours', () => {
    // Sans ce contrôle, un `routeTree.gen.ts` tronqué ou un motif d'extraction
    // cassé rendrait tous les tests ci-dessous verts en ne vérifiant plus rien.
    expect(routes.size).toBeGreaterThan(20)
    expect(routes.has('/missions/adv')).toBe(true)
    expect(ADV_BLOCKERS.length).toBeGreaterThan(0)
  })

  it('chaque motif pointe vers une route DÉCLARÉE dans l’arbre', () => {
    const dangling = ADV_BLOCKERS.filter(blocker => !routes.has(ADV_BLOCKER_ACTIONS[blocker].route))
    // Si ce test tombe : la route a été renommée ou n'a jamais existé. Un motif
    // qui envoie sur « Page introuvable » est pire qu'un motif sans lien — le
    // premier fait douter du produit entier.
    expect(dangling).toEqual([])
  })

  it('elle sait dire NON — une destination inventée est refusée', () => {
    // La preuve qu'elle mord : la même vérification, sur une route qui n'existe
    // pas. Sans cette assertion, on ne saurait pas distinguer « toutes les
    // routes sont bonnes » de « l'ensemble est vide ».
    expect(routes.has('/missions/adf')).toBe(false)
  })

  it('l’écran ADV répare bien les motifs qui lui sont adressés', () => {
    // Les motifs dont la route est `/missions/adv` doivent trouver là-bas un
    // vrai geste d'écriture. Sans lui, la boucle serait fermée sur elle-même :
    // la pastille mène à l'écran qui l'affiche, et rien ne change.
    const screen = readFileSync(join(SRC, 'features', 'adv', 'view', 'AdvPage.tsx'), 'utf8')
    const selfRepaired = ADV_BLOCKERS.filter(blocker => ADV_BLOCKER_ACTIONS[blocker].route === '/missions/adv')
    expect(selfRepaired.length).toBeGreaterThan(0)
    expect(screen).toContain('useUpdateAdvDossier')
    expect(screen).toContain('RepairPanel')
  })

  it('un motif RÉSERVÉ n’est jamais compté comme mesuré', () => {
    // `kyc_not_validated` a sa place dans la taxonomie et n'est produit par
    // aucun calcul : sa pastille doit dire « non mesuré », pas « 0 ».
    expect(ADV_RESERVED_BLOCKERS).toContain('kyc_not_validated')
    const screen = readFileSync(join(SRC, 'features', 'adv', 'view', 'AdvPage.tsx'), 'utf8')
    expect(screen).toContain('kyc_not_measured')
  })
})
