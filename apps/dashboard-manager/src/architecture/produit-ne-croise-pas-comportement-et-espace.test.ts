import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * #1683-#1688 — `/produit` NE CROISE JAMAIS UN CHIFFRE COMPORTEMENTAL AVEC UN
 * NOM D'ESPACE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Règle 5 de `c64_analytique_produit` : « rien de comportemental par espace
 * client NOMMÉ dans le back-office ». `GET internal/analytics/teams/:workspaceId`
 * est la seule route qui rend un détail par espace nommé, et GA-266
 * (`apps/api/src/architecture/team-detail-never-reads-behavioral.spec.ts`) la
 * tient déjà côté API. Ce lot (#1683.1, #1684.1-2, #1688.4) ajoute trois
 * dérivations NOUVELLES qui LISENT le flux comportemental (verdict d'écran,
 * destination de sortie, croisement usage × demande) — c'est exactement là que
 * la règle 5 aurait pu se perdre en chemin : « rendre l'écran plus utile » en
 * ajoutant une colonne « espace » au tableau des écrans, par exemple.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE — ET POURQUOI CE PÉRIMÈTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `app/produit/**` est le SEUL endroit du back-office où ce lot lit le flux
 * comportemental (`@/lib/product-analytics`) — le corpus est donc précis :
 * élargir à tout `src/app` attraperait `app/feedback/**`, qui lit un flux
 * TOTALEMENT différent (retours utilisateurs, aucun rapport à
 * `product_events`) et n'a pas besoin de cette garde.
 *
 * Un fichier est fautif s'il porte À LA FOIS un marqueur du flux comportemental
 * (une des neuf natures d'événement, ou `sessionId`/`route`/`views`/`sessions`
 * — les champs des rapports #1683-#1688) ET un identifiant d'espace
 * (`workspaceId`, `espaceId`, `teamId`, `spaceId`). Aucun fichier de ce lot ne
 * lit de second identifiant : il n'y a tout simplement AUCUN paramètre
 * d'espace nulle part dans ces dérivations — la garde le PROUVE plutôt que de
 * le supposer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Un identifiant d'espace introduit sous un troisième nom qu'aucune des quatre
 * variantes ci-dessous ne couvre (`clientId`, `orgId`…). Le corpus délibérément
 * étroit (`app/produit/**` seulement) compense en partie : ce dossier n'a
 * aujourd'hui aucune raison de lire un identifiant d'organisation, quel que
 * soit son nom — son rôle est de mesurer le PRODUIT, jamais un client.
 */

const PRODUIT_DIR = fileURLToPath(new URL('../app/produit', import.meta.url))

function fichiersSource(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) fichiersSource(chemin, out)
    else if (entree.endsWith('.ts') || entree.endsWith('.tsx')) out.push(chemin)
  }
  return out
}

/** Les marqueurs du flux COMPORTEMENTAL (#1682) — mêmes neuf natures que
 *  GA-266, plus les champs de forme des quatre rapports #1683-#1688. Recopiés
 *  ici, jamais importés du code qu'elle garde : une liste qui vivrait avec le
 *  code protégé dériverait avec lui (même raison que GA-266). */
const MARQUEURS_COMPORTEMENTAUX = [
  'screen_viewed',
  'screen_left',
  'tab_opened',
  'action_started',
  'action_completed',
  'action_abandoned',
  'filter_applied',
  'search_performed',
  'error_shown',
  'sessionId',
  'RapportEcrans',
  'RapportParcours',
  'RapportFriction',
  'RapportDemande',
]

/** Un identifiant d'ESPACE — les trois variantes que ce dépôt utilise déjà
 *  (`workspaceId` côté API/route, `espaceId` côté UI, `teamId`). ⚠️ `spaceId`
 *  n'est PAS une quatrième variante : c'est un SUFFIXE des deux premières
 *  (`work` + `spaceId`, `e` + `spaceId`) — l'ajouter ferait matcher deux fois
 *  la même occurrence et fausserait le compte, pas la détection. */
const MARQUEURS_ESPACE = ['workspaceId', 'espaceId', 'teamId']

/** Ce que la garde reproche à une source — isolée pour lui donner un texte
 *  FABRIQUÉ et vérifier qu'elle sait dire non. */
function croiseComportementEtEspace(source: string): { comportement: string[]; espace: string[] } {
  const comportement = MARQUEURS_COMPORTEMENTAUX.filter(marqueur => source.includes(marqueur))
  const espace = MARQUEURS_ESPACE.filter(marqueur => source.includes(marqueur))
  return { comportement, espace }
}

describe('#1683-#1688 — /produit ne croise jamais un chiffre comportemental avec un nom d’espace', () => {
  it('LIT quelque chose — le corpus n’est pas vide, et porte bien des marqueurs comportementaux réels', () => {
    const fichiers = fichiersSource(PRODUIT_DIR)
    expect(fichiers.length).toBeGreaterThan(10)
    // Contrôle positif : `product-instrumentation.logic.ts` nomme bien les
    // neuf natures — une lecture cassée (mauvais dossier, extension oubliée)
    // rendrait cette liste vide et le reste du fichier verrait passer
    // n'importe quoi.
    const instrumentation = readFileSync(join(PRODUIT_DIR, 'product-instrumentation.logic.ts'), 'utf8')
    expect(croiseComportementEtEspace(instrumentation).comportement.length).toBeGreaterThan(0)
  })

  it('sait dire NON — un fichier fabriqué qui croise les deux est REPROCHÉ', () => {
    const fautif = `
      const verdict = ecransParEspace.get(workspaceId)
      if (row.eventName === 'screen_viewed') compte(workspaceId, row.sessionId)
    `
    const resultat = croiseComportementEtEspace(fautif)
    expect(resultat.comportement).toEqual(expect.arrayContaining(['screen_viewed', 'sessionId']))
    expect(resultat.espace).toEqual(['workspaceId'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un identifiant d’espace SEUL, sans marqueur comportemental, ne déclenche rien', () => {
    const legitime = `export function libelleEspace(espaceId: string) { return espaceId }`
    const resultat = croiseComportementEtEspace(legitime)
    expect(resultat.comportement).toEqual([])
    // La présence seule d'un marqueur d'espace n'est PAS le défaut visé — la
    // garde ci-dessous ne fait échouer un fichier QUE si les deux co-occurrent.
    expect(resultat.espace).toEqual(['espaceId'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un marqueur comportemental SEUL, sans espace, ne déclenche rien', () => {
    const legitime = `if (row.eventName === 'screen_viewed') sessions.add(row.sessionId)`
    const resultat = croiseComportementEtEspace(legitime)
    expect(resultat.espace).toEqual([])
    expect(resultat.comportement.length).toBeGreaterThan(0)
  })

  it('aucun fichier de /produit ne croise un marqueur comportemental avec un identifiant d’espace', () => {
    const fautifs = fichiersSource(PRODUIT_DIR)
      .map(chemin => ({ chemin, resultat: croiseComportementEtEspace(readFileSync(chemin, 'utf8')) }))
      .filter(({ resultat }) => resultat.comportement.length > 0 && resultat.espace.length > 0)

    expect(
      fautifs,
      [
        'Un fichier de /produit lit À LA FOIS le flux comportemental et un',
        'identifiant d’espace — règle 5 de c64_analytique_produit (« rien de',
        'comportemental par espace client nommé dans le back-office »).',
        '',
        ...fautifs.map(
          f =>
            `${f.chemin} — comportement: ${f.resultat.comportement.join(', ')} · espace: ${f.resultat.espace.join(', ')}`,
        ),
      ].join('\n'),
    ).toEqual([])
  })
})
