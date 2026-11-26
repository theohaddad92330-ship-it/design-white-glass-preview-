import { describe, expect, it } from 'vitest'
import {
  tuileMrr,
  tuileClients,
  tuileAttrition,
  tuileMarge,
  tuileBurn,
  tuileRunway,
} from '../app/_components/cockpit-business.logic'

/**
 * Le pied d'une tuile KPI est un emplacement de TROIS MOTS, pas un paragraphe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'INCIDENT QUI L'A FAIT ÉCRIRE
 * ─────────────────────────────────────────────────────────────────────────
 * Recette du 09/09/2026, premier écran du back-office. `tuileMarge` versait
 * dans `period` la raison longue de `lectureDeLaMarge` — 405 caractères,
 * écrits pour la page `/couts`, où ils ont la place. MESURÉ dans le navigateur :
 * 169 px de large pour 141 disponibles, **270 px de haut contre ~90 pour ses
 * cinq voisines**, le texte débordant sur la tuile suivante et coupé en plein
 * mot. Toutes les branches non mesurables faisaient pareil, la branche MESURÉE
 * comprise — ce n'était pas un cas limite, c'était la forme normale.
 *
 * Aucun test ne pouvait le voir : chaque fonction rendait la bonne CHAÎNE, et
 * `KpiTile` rendait bien ce qu'on lui donnait. Le défaut n'était ni dans l'une
 * ni dans l'autre — il était dans l'ACCORD entre une donnée et son emplacement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE GARDE, ET CE QU'ELLE NE PEUT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────
 * Elle est une garde de POPULATION : elle appelle les SIX constructeurs de
 * tuile, dans leurs cas dégradés, et refuse tout pied trop long. Une septième
 * tuile ajoutée demain doit être ajoutée ici — c'est la limite connue, et elle
 * est préférable à un balayage de JSX qui ne saurait pas reconnaître une tuile.
 *
 * Ce qu'elle ne voit pas : la mise en page réelle (jsdom ne met rien en page).
 * Elle borne la DONNÉE, ce qui est la cause ; la largeur, elle, se mesure dans
 * un navigateur.
 */

/** ~40 caractères : « aucun mois figé pour comparer » en fait 29, et tient. */
const PIED_MAX = 44

const MARGE_VIDE = { measurable: false, observed: 0, required: 3, missing: 3 }

const CAS_DEGRADES: ReadonlyArray<readonly [string, () => { period: string }]> = [
  ['MRR', () => tuileMrr({ mrrCents: null, customers: null } as never, null)],
  ['Clients', () => tuileClients({ mrrCents: null, customers: null } as never, null)],
  ['Attrition', () => tuileAttrition([])],
  ['Marge — API muette', () => tuileMarge(null, 'timeout')],
  [
    'Marge — devises différentes',
    () =>
      tuileMarge({ blockedReason: 'currency_mismatch', marginRate: null, measurability: MARGE_VIDE } as never, null),
  ],
  [
    'Marge — pas assez de comptes',
    () =>
      tuileMarge(
        {
          blockedReason: null,
          marginRate: null,
          measurability: { measurable: false, observed: 1, required: 3, missing: 2 },
        } as never,
        null,
      ),
  ],
  [
    'Marge — mesurée',
    () =>
      tuileMarge(
        {
          blockedReason: null,
          marginRate: 0.62,
          measurability: { measurable: true, observed: 5, required: 3, missing: 0 },
        } as never,
        null,
      ),
  ],
  ['Burn', () => tuileBurn({ months: [], runway: null } as never)],
  ['Runway', () => tuileRunway({ months: [], runway: null } as never)],
] as const

describe('le pied d’une tuile KPI tient dans sa tuile', () => {
  it('LIT quelque chose — les constructeurs rendent bien un pied non vide', () => {
    // Sans ce test, des constructeurs qui rendraient `period: ''` passeraient
    // la garde en ne disant rien : verte, et aveugle.
    const pieds = CAS_DEGRADES.map(([, f]) => f().period)
    expect(pieds.length).toBe(9)
    expect(pieds.every(p => typeof p === 'string' && p.length > 0)).toBe(true)
  })

  it('aucun pied ne dépasse la place dont il dispose', () => {
    const trop = CAS_DEGRADES.map(([nom, f]) => ({ nom, pied: f().period }))
      .filter(({ pied }) => pied.length > PIED_MAX)
      .map(({ nom, pied }) => `${nom} : ${pied.length} caractères — « ${pied.slice(0, 50)}… »`)
    expect(trop).toEqual([])
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — un pied normal reste permis', () => {
    // Le témoin : la borne ne doit pas être si basse qu'elle interdise les
    // libellés déjà en place. « aucun mois figé pour comparer » = 29.
    expect(tuileMrr({ mrrCents: null, customers: null } as never, null).period.length).toBeLessThanOrEqual(PIED_MAX)
    expect(PIED_MAX).toBeGreaterThanOrEqual(30)
  })
})
