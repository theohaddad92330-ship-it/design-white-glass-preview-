/**
 * GA-198 — un créneau PROPOSÉ ne se rend pas comme un rendez-vous CONFIRMÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE LOT A TROUVÉ EN NAISSANT
 * ─────────────────────────────────────────────────────────────────────────
 * L'énumération `AGENDA_EVENT_STATUSES` (`@bellum/contracts`) porte quatre
 * valeurs — `confirmed` / `tentative` / `cancelled` / `unknown` — depuis un
 * lot antérieur. Le seul lecteur était `activity-capture.service.ts`, côté
 * serveur : AUCUN écran n'ouvrait `event.status`. Un créneau simplement
 * PROPOSÉ (`tentative`, pas encore accepté) s'affichait donc exactement
 * comme un rendez-vous FIXÉ — et un commercial qui lit « 3 rendez-vous
 * mardi » organise sa journée autour de trois engagements pris, pas de deux
 * et d'une proposition sans réponse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE, ET POURQUOI CHAQUE POINT
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Le corpus n'est pas vide** — une garde qui ne lit rien est verte pour
 *    toujours. Six gardes borgnes en deux jours dans ce dépôt pour cette
 *    seule raison.
 * 2. **Les deux vues RÉELLES de l'agenda lisent `isProposedAgendaEvent`** —
 *    `AgendaGrid.tsx` (la journée, en grille horaire) et `AgendaBoard.tsx`
 *    (la semaine). Un IMPORT, pas une mention : un commentaire qui cite le
 *    nom de la fonction, ou un identifiant homonyme importé d'ailleurs, ne
 *    prouve aucun montage — c'est le défaut « garde borgne » déjà payé six
 *    fois ici (`ScoreWithAxes` en zéro appelant pendant que GA-18 restait
 *    vert).
 * 3. **Sait dire NON** — la fonction `isProposedAgendaEvent`, importée
 *    directement, est nourrie des pièges réels d'une classification
 *    trompeuse : une valeur proche mais fausse (`confirmed`), un fournisseur
 *    qui n'a jamais répondu (`null`), une casse différente (`Tentative`).
 *    Elle ne doit dire « proposé » QUE pour la chaîne exacte `tentative`.
 * 4. **`DayColumn`/`EventCard` — la liste morte — sont hors du corpus.**
 *    `EventCard` porte, lui aussi, un rendu par évènement, mais son seul
 *    appelant (`DayColumn`) n'est monté nulle part dans l'application : zéro
 *    utilisateur ne le voit. Le garder dans le corpus ferait de cette garde
 *    une garde de CODE MORT, pas une garde d'ÉCRAN — le même défaut que
 *    « code juste, calculé, testé, que personne n'appelle », à l'envers.
 *
 * Le comportement RENDU (le DOM diffère vraiment entre un créneau proposé et
 * un rendez-vous confirmé, et un statut absent ne se rend ni comme l'un ni
 * comme l'autre) est vérifié à l'endroit qui peut le vérifier pour de vrai —
 * `AgendaGrid.test.tsx` et `AgendaBoard.test.tsx`, qui montent les composants
 * réels. Cette garde-ci tient la MÉCANIQUE qui ne se voit pas dans un rendu
 * isolé : que les deux écrans importent bien la même fonction (pas une
 * réimplémentation locale qui divergerait), et que cette fonction sait
 * refuser les pièges qui ressemblent à `tentative` sans l'être.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isProposedAgendaEvent } from '@/features/agenda/agenda-view'

const WEB_SRC = join(__dirname, '..')
const AGENDA_VIEW = join(WEB_SRC, 'features/agenda/agenda-view.ts')
const AGENDA_GRID = join(WEB_SRC, 'features/agenda/view/AgendaGrid.tsx')
const AGENDA_BOARD = join(WEB_SRC, 'features/agenda/view/AgendaBoard.tsx')

/** Les deux vues RÉELLES — celles qu'un utilisateur ouvre. `DayColumn` et
 *  `EventCard` (dans `AgendaBoard.tsx`) sont volontairement absents : ils ne
 *  sont montés par aucun appelant, voir le point 4 ci-dessus. */
const REAL_SCREENS = [
  { name: 'AgendaGrid (la journée)', path: AGENDA_GRID },
  { name: 'AgendaBoard (la semaine)', path: AGENDA_BOARD },
]

/**
 * Un IMPORT nommé de `isProposedAgendaEvent` depuis `agenda-view`, pas une
 * mention du mot.
 *
 * Même défaut que `GA-18 bis` (`display-primitives.test.ts`) : chercher
 * `\bisProposedAgendaEvent\b` dans le fichier passerait au vert sur un
 * commentaire qui cite la fonction sans l'appeler.
 */
function importsProposedCheck(source: string): boolean {
  return /import\s*\{[^}]*\bisProposedAgendaEvent\b[^}]*\}\s*from\s*['"][^'"]*agenda-view['"]/.test(source)
}

describe('GA-198 — un créneau proposé ne se rend pas comme un rendez-vous confirmé', () => {
  it('la garde lit bien des fichiers réels — sinon elle passerait au vert sur du vide', () => {
    expect(existsSync(AGENDA_VIEW), `introuvable : ${AGENDA_VIEW}`).toBe(true)
    for (const screen of REAL_SCREENS) {
      expect(existsSync(screen.path), `introuvable : ${screen.path}`).toBe(true)
    }
  })

  it.each(REAL_SCREENS)('$name importe isProposedAgendaEvent, pas seulement le mentionne', ({ path }) => {
    expect(importsProposedCheck(readFileSync(path, 'utf8'))).toBe(true)
  })

  it('sait dire NON — une mention ou un homonyme ne vaut pas un import', () => {
    const monte = `import { isProposedAgendaEvent, timingOf } from '../agenda-view'`
    const mentionne = `// isProposedAgendaEvent décide si le badge « Proposé » s'affiche\nconst proposedLabel = 'Proposé'`
    const ailleurs = `import { isProposedAgendaEvent } from '../other-module'`

    expect(importsProposedCheck(monte)).toBe(true)
    expect(importsProposedCheck(mentionne)).toBe(false)
    expect(importsProposedCheck(ailleurs)).toBe(false)
  })

  describe('isProposedAgendaEvent — sait dire NON aux pièges qui ressemblent à `tentative`', () => {
    it('la SEULE valeur qui se lit « proposé »', () => {
      expect(isProposedAgendaEvent({ status: 'tentative' })).toBe(true)
    })

    it.each([
      ['confirmé — un rendez-vous FIXÉ, pas une proposition', 'confirmed'],
      ['annulé — un autre état fermé, pas une proposition', 'cancelled'],
      ['une casse différente — le fournisseur ne rend jamais celle-ci', 'Tentative'],
      ['une valeur brute non reconnue d’un fournisseur', 'needsAction'],
      ['une chaîne vide', ''],
    ])('%s (%s) ne se lit PAS « proposé »', (_label, status) => {
      expect(isProposedAgendaEvent({ status })).toBe(false)
    })

    it('un statut ABSENT (`null`, la forme du contrat) ne se lit ni proposé ni confirmé', () => {
      // « non mesuré » n'est jamais « 0 » : l'absence de statut ne se lit pas
      // « en attente », pas plus qu'elle ne se lit « confirmé » ailleurs dans
      // ce lot (aucun rendu ne prétend le contraire — voir AgendaGrid.test.tsx
      // et AgendaBoard.test.tsx, « un statut ABSENT ne se rend ni PROPOSÉ ni
      // confirmé »).
      expect(isProposedAgendaEvent({ status: null })).toBe(false)
    })
  })

  it('DayColumn/EventCard restent hors du corpus — code mort, pas un écran', () => {
    // Si ce test tombe : soit `DayColumn` a trouvé un appelant (il rejoint
    // alors REAL_SCREENS et doit lui aussi importer isProposedAgendaEvent),
    // soit il a été supprimé (auquel cas ce test disparaît avec lui).
    const source = readFileSync(AGENDA_BOARD, 'utf8')
    expect(source.includes('function DayColumn'), 'DayColumn a disparu de AgendaBoard.tsx').toBe(true)
    expect(
      source.includes('export function DayColumn'),
      'DayColumn est maintenant exporté — vérifier ses appelants',
    ).toBe(false)
  })
})
