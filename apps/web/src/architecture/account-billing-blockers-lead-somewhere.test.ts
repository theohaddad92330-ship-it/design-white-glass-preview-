import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACCOUNT_BILLING_BLOCKERS, ACCOUNT_BILLING_BLOCKER_ACTIONS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * LA LENTILLE FACTURATION MÈNE QUELQUE PART — et elle est MONTÉE (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX RÈGLES QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. « Un indicateur de qualité qui ne mène nulle part ne sert à rien. » Chaque
 *    bloqueur de facturation porte sa route de réparation dans
 *    {@link ACCOUNT_BILLING_BLOCKER_ACTIONS}. Une route écrite à la main dans
 *    une table de constantes est une chaîne de caractères : rien, dans le
 *    typage, n'empêche `/acounts`. Cette garde lit l'ARBRE DE ROUTES RÉEL
 *    (`routeTree.gen.ts`, généré par le plugin de routage) et refuse toute
 *    destination qui n'y figure pas. Elle ne relit pas une liste écrite à côté :
 *    deux copies de la même erreur restent vertes en se comparant.
 *
 * 2. « Du code juste que personne n'appelle » est le défaut n°1 du dépôt. La vue
 *    en CARTES a été écrite pour la maquette 11 ; si `AccountContent` cessait de
 *    la rendre, tous ses tests resteraient verts et l'écran retomberait sur le
 *    tableau sans que rien ne rougisse. La garde vérifie donc que la lentille
 *    la MONTE réellement, et que la table ne porte plus de seconde forme du
 *    même verdict.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PRÉTEND PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit pas si l'écran de destination RÉPARE le motif — ça demanderait de
 * reconnaître un geste métier dans du JSX. Ce qu'elle sait dire est exact : la
 * porte existe, ou elle n'existe pas ; la carte est rendue, ou elle ne l'est
 * pas.
 */

const SRC = join(__dirname, '..')
const ROUTE_TREE = readFileSync(join(SRC, 'routeTree.gen.ts'), 'utf8')
const LIST = join(SRC, 'features', 'accounts', 'view', 'accounts-list')

/** Le code SANS ses commentaires. Une garde qui lit la prose se trompe de
 *  sujet : le docblock d'un fichier explique souvent l'anti-motif qu'il évite. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Les chemins déclarés par l'arbre — extraits des lignes `path: '/…'` qu'il
 *  génère, jamais d'une liste tenue à la main. */
function declaredRoutes(): Set<string> {
  return new Set([...ROUTE_TREE.matchAll(/^\s*path: '([^']+)'/gm)].map(match => match[1] as string))
}

describe('les bloqueurs de facturation d’un compte mènent à un écran qui existe', () => {
  const routes = declaredRoutes()

  it('la garde LIT quelque chose — un arbre vide passerait au vert pour toujours', () => {
    expect(routes.size).toBeGreaterThan(20)
    expect(routes.has('/accounts/')).toBe(true)
    expect(ACCOUNT_BILLING_BLOCKERS.length).toBeGreaterThan(0)
  })

  it('chaque bloqueur pointe vers une route DÉCLARÉE dans l’arbre', () => {
    // `/accounts` est déclaré sous deux formes par le générateur (`/accounts/`
    // pour la page d'index, `/accounts` pour le segment de mise en page) : les
    // deux sont dans l'arbre, et c'est bien ce que la table désigne.
    const dangling = ACCOUNT_BILLING_BLOCKERS.filter(blocker => {
      const { route } = ACCOUNT_BILLING_BLOCKER_ACTIONS[blocker]
      return !routes.has(route) && !routes.has(`${route}/`)
    })
    expect(dangling).toEqual([])
  })

  it('la fiche d’un compte — là où les quatre bloqueurs STRUCTURELS envoient — existe', () => {
    // Le lien de la carte ne renvoie pas sur la LISTE : il complète la route par
    // l'identifiant, pour que le geste se fasse sur CETTE fiche plutôt que de
    // faire recommencer la recherche.
    expect(routes.has('/accounts/$id')).toBe(true)
  })

  it('elle sait dire NON — une destination inventée est refusée', () => {
    expect(routes.has('/acounts')).toBe(false)
    expect(routes.has('/accounts/$id/facturation')).toBe(false)
  })

  it('les liens de réparation sont de vrais LIENS — ce qui se clique se tabule', () => {
    // Un `<div onClick>` n'a ni tabulation, ni Entrée, ni annonce (GA-35).
    //
    // ⚠️ Les COMMENTAIRES sont retirés avant la vérification, et ce n'est pas
    // une précaution théorique : la première version de cette garde a rougi sur
    // le docblock d'`AccountBillingCell`, qui explique justement pourquoi on
    // n'écrit pas `<div onClick>`. Une garde qui lit la prose se trompe de
    // sujet — c'est le défaut « extracteur coupé au commentaire » déjà payé ici.
    const cell = stripComments(readFileSync(join(LIST, 'AccountBillingCell.tsx'), 'utf8'))
    expect(cell).toContain('ACCOUNT_BILLING_BLOCKER_ACTIONS')
    expect(cell).toContain('<Link')
    expect(cell).not.toContain('<div onClick')
  })

  it('elle sait dire NON sur le code, pas seulement sur la prose', () => {
    // La preuve qu'elle mord : un `<div onClick>` écrit dans du CODE est vu,
    // le même mot dans un commentaire ne l'est pas.
    expect(stripComments('const a = <div onClick={x} />')).toContain('<div onClick')
    expect(stripComments('/* jamais de <div onClick> */')).not.toContain('<div onClick')
    expect(stripComments('// jamais de <div onClick>\nconst a = 1')).not.toContain('<div onClick')
  })
})

describe('la vue en cartes est réellement MONTÉE sous la lentille facturation', () => {
  const content = readFileSync(join(SRC, 'features', 'accounts', 'view', 'AccountContent.tsx'), 'utf8')

  it('la garde LIT quelque chose — un fichier vide passerait au vert', () => {
    expect(content.length).toBeGreaterThan(1000)
    expect(content).toContain('deliveryLens')
  })

  it('l’écran rend les CARTES quand la lentille est posée', () => {
    // Sans cette assertion, supprimer la branche ferait retomber l'écran sur le
    // tableau : tous les tests de la carte resteraient verts, et plus personne
    // ne la verrait.
    expect(content).toContain('AccountsBillingCardList')
    expect(content).toMatch(/deliveryLens \? \(\s*<AccountsBillingCardList/)
  })

  it('le TABLEAU ne porte plus de seconde forme du même verdict', () => {
    // Deux chemins pour un même jugement divergent au premier ajout, et celui
    // que personne n'ouvre est celui qui pourrit. Le tableau est désormais
    // l'angle COMMERCIAL, et rien d'autre.
    const table = readFileSync(join(LIST, 'AccountsTable.tsx'), 'utf8')
    const row = readFileSync(join(LIST, 'AccountTableRow.tsx'), 'utf8')
    expect(table).not.toContain('deliveryLens')
    expect(row).not.toContain('AccountBillingCell')
  })

  it('le bandeau à six tuiles est rendu, et il reçoit le compteur SERVEUR', () => {
    // `followed` vient du serveur : dérivé des lignes chargées, il grandirait en
    // faisant défiler — le défaut déjà payé sur les pastilles de `/contacts`.
    expect(content).toContain('AccountsBillingCounters')
    expect(content).toContain('followed={counters?.followed}')
  })
})

describe('le mot « Organisations » n’entre pas dans le portefeuille', () => {
  /**
   * Le produit dit COMPTES. Le vocabulaire des maquettes est celui d'un autre
   * outil, et en introduire un second pour le même objet ferait croire à deux
   * objets.
   *
   * ⚠️ La garde lit les CATALOGUES de traduction, pas le JSX : c'est là que le
   * mot atterrirait, et un composant peut très bien afficher une clé dont le
   * libellé a dérivé sans que le code change d'une ligne.
   */
  const I18N = join(SRC, 'i18n', 'locales')
  const fr = readFileSync(join(I18N, 'fr', 'accounts.json'), 'utf8')
  const en = readFileSync(join(I18N, 'en', 'accounts.json'), 'utf8')

  it('la garde LIT quelque chose — un catalogue vide passerait au vert', () => {
    expect(fr.length).toBeGreaterThan(1000)
    expect(en.length).toBeGreaterThan(1000)
    // La preuve qu'elle regarde le bon fichier : le mot du produit y est.
    expect(fr.toLowerCase()).toContain('compte')
  })

  it('aucun libellé du portefeuille ne dit « organisation »', () => {
    expect(fr.toLowerCase()).not.toContain('organisation')
    expect(en.toLowerCase()).not.toContain('organisation')
  })

  it('les six tuiles ont leur libellé dans LES DEUX langues', () => {
    // Une clé absente rend la CLÉ BRUTE à l'écran — « band.tiles.total » sous
    // un chiffre. C'est arrivé au bouton « Nouveautés », en production.
    for (const key of [
      'total',
      'withBillingEntity',
      'activeMissions',
      'consultantsOnMission',
      'ready',
      'alerts',
    ] as const) {
      expect(JSON.parse(fr).band.tiles[key]).toBeTruthy()
      expect(JSON.parse(en).band.tiles[key]).toBeTruthy()
    }
  })
})
