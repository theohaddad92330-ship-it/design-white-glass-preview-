import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveProductScreen } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * GA-276 — le traceur produit ne transporte JAMAIS un identifiant de compte.
 *
 * `router.tsx` passait `event.toLocation.pathname` BRUT à `notifyRouteViewed`.
 * Sur `/accounts/3f1c…`, c'est l'identifiant d'un compte CLIENT qui partait en
 * base. Ça coûtait deux fois :
 *  - chaque compte devenait « son » écran ⇒ tous sous le seuil des cinq
 *    sessions ⇒ des tableaux d'analytique vides, sans que rien ne l'explique ;
 *  - un identifiant de compte client atterrissait dans une lecture d'OPÉRATEUR,
 *    ce que la règle 5 de l'analytique produit interdit (« rien de
 *    comportemental par espace client nommé »).
 *
 * Le repli se fait **à l'écriture**, pas à la lecture : *retirer le MOYEN, pas
 * la permission*. Un filtre côté lecture laisse la donnée en base ; le repli à
 * l'émission fait qu'elle n'y entre jamais.
 *
 * Les trois preuves que cette garde doit donner :
 *  - elle **LIT** — le fichier existe, porte l'abonnement, et le catalogue
 *    replie vraiment (vérifié en EXÉCUTANT `resolveProductScreen`, pas en
 *    lisant du texte) ;
 *  - elle **sait dire NON** — repasser un `pathname` brut à `notifyRouteViewed`
 *    la fait rougir ;
 *  - elle **n'attrape pas ce qu'elle ne vise pas** — `document.referrer` est une
 *    URL EXTERNE, pas une de nos routes : il n'a rien à replier, et le
 *    conserver brut est légitime.
 */

const ROUTER = join(__dirname, '..', 'router.tsx')
const source = (): string => readFileSync(ROUTER, 'utf8')

describe('GA-276 — le traceur produit ne transporte aucun identifiant de compte', () => {
  it('LIT quelque chose — le fichier existe et porte bien l’abonnement du traceur', () => {
    const code = source()
    expect(code.length).toBeGreaterThan(0)
    expect(code).toContain('notifyRouteViewed')
    expect(code).toContain("router.subscribe('onResolved'")
  })

  it('le catalogue REPLIE vraiment un identifiant de compte — exécuté, pas lu', () => {
    // Le contrôle positif de la garde : si cette dérivation cessait de replier,
    // tout le reste du fichier resterait vert en gardant du vide.
    expect(resolveProductScreen('/accounts/3f1c9d2e-7a41-4b8c-9e10-2d5f6a8b0c31')?.route).toBe('/accounts/$id')
    expect(resolveProductScreen('/accounts/3f1c9d2e-7a41-4b8c-9e10-2d5f6a8b0c31')?.route).not.toContain('3f1c9d2e')
  })

  /**
   * Le bloc d'ABONNEMENT seul — jamais le fichier entier.
   *
   * ⚠️ Première version de cette garde : elle cherchait « `.pathname` quelque
   * part dans l'argument » et s'attrapait sur son propre correctif
   * (`screenPattern(event.toLocation.pathname)` contient `.pathname`). Elle
   * rougissait sur le code JUSTE. Deuxième défaut de la même version : les
   * DOCBLOCS de ce fichier écrivent `notifyRouteViewed()`, donc un `indexOf`
   * tombait sur un commentaire, cent lignes avant le code.
   * Une garde se lit sur le CODE, délimité, jamais sur un fichier entier.
   */
  const blocDAbonnement = (): string => {
    const code = source()
    const debut = code.indexOf("router.subscribe('onResolved'")
    expect(debut).toBeGreaterThan(-1)
    return code.slice(debut, code.indexOf('})', debut) + 2)
  }

  it('AUCUN chemin réel n’est passé au traceur — c’est le MOTIF qui part', () => {
    // Si ce test tombe : quelqu'un a remis un chemin réel dans l'émission, et
    // un identifiant de compte client repartira en base.
    const bloc = blocDAbonnement()
    expect(bloc).toContain('notifyRouteViewed(screenPattern(')
    // ⚠️ #2112.23-25 a ajouté `rememberReturnToApp(…, event.toLocation.pathname)`
    // dans le MÊME bloc d'abonnement : il a besoin du chemin RÉEL pour pouvoir
    // y revenir (sessionStorage seulement, jamais envoyé à un traceur — voir
    // `return-to-app.ts`). Scanner tout le bloc l'aurait accusé à tort : cette
    // garde vise l'ARGUMENT de `notifyRouteViewed`, pas tout ce qui vit dans le
    // même abonnement (« une garde qui lit tout le bloc accuse le bien »).
    const debutAppel = bloc.indexOf('notifyRouteViewed(')
    expect(debutAppel).toBeGreaterThan(-1)
    const finAppel = bloc.indexOf('\n', debutAppel)
    const appel = bloc.slice(debutAppel, finAppel === -1 ? bloc.length : finAppel)
    // Le nom du chemin fautif est DANS la valeur comparée — sinon l'échec
    // dirait « false n'est pas true » et il faudrait le déboguer.
    const bruts = [...appel.matchAll(/(?<!screenPattern\()\bevent\.\w+\.pathname\b/g)].map(match => match[0])
    expect(bruts).toEqual([])
  })

  it('la provenance interne est repliée elle aussi — la fuite était en DEUX endroits', () => {
    // `event.fromLocation.pathname` porte le même identifiant que la
    // destination. Corriger la destination seule aurait laissé la moitié du
    // défaut en place — c'est « une règle écrite pour un cas et pas pour son
    // jumeau », déjà payée dans ce dépôt.
    expect(blocDAbonnement()).toContain('screenPattern(event.fromLocation.pathname)')
  })

  it('n’attrape PAS `document.referrer` — une URL externe n’est pas une de nos routes', () => {
    // Témoin de cas légitime voisin. Une garde « aucune valeur brute dans ce
    // fichier » aurait exigé de replier un referrer, c'est-à-dire de le faire
    // passer pour une de nos routes — ou de le supprimer, en perdant la seule
    // provenance qu'on ait pour la toute première vue d'un onglet.
    expect(source()).toContain('document.referrer')
  })

  it('une route hors catalogue ne devient PAS l’écran le plus ressemblant', () => {
    // « Non résolu » n'est pas « le voisin le plus proche ». Un chemin inconnu
    // rend `null`, et le fichier le remplace par une constante qui ne porte
    // rien — jamais par un motif approchant, qui inventerait une donnée.
    expect(resolveProductScreen('/ceci-nest-pas-une-route-du-produit')).toBeNull()
    expect(source()).toContain('UNKNOWN_SCREEN')
  })
})
