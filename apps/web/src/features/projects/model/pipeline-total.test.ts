import { describe, expect, it } from 'vitest'
import { columnAmountCents, pipelineTotal } from './pipeline-total'

/**
 * La dérivation qui empêche deux écrans de se contredire.
 *
 * Le défaut trouvé en recette le 28/08 : sur un espace portant UN projet au pipe
 * sans montant, `/briefing` écrivait « 0 € » en gros et `/projects` écrivait
 * « non mesuré — aucun montant saisi sur 1 projet au pipe ». Deux écrans du même
 * produit, la même donnée, deux verdicts opposés. Chacun tranchait chez lui.
 *
 * Les cas sont ceux que la SOURCE distingue déjà, et il y en a trois :
 *  · rien au pipe — zéro euro est alors VRAI, il n'y a rien à mesurer ;
 *  · des affaires, aucune chiffrée — le total n'est pas nul, il est inconnu ;
 *  · au moins une chiffrée — le total est un montant (un PLANCHER si d'autres
 *    n'ont pas de montant, et c'est le compteur d'à côté qui le dit).
 */
describe('pipelineTotal — un seul verdict pour tous les écrans', () => {
  it('rien au pipe : zéro euro est VRAI, ce n’est pas une mesure absente', () => {
    expect(pipelineTotal({ total_count: 0, total_amount_cents: 0, total_without_amount: 0 })).toEqual({
      kind: 'empty',
    })
  })

  it('des affaires, AUCUNE chiffrée : non mesuré, avec ce qui manque', () => {
    // Le cas exact de la production le 28/08 : un projet, pas de montant.
    expect(pipelineTotal({ total_count: 1, total_amount_cents: 0, total_without_amount: 1 })).toEqual({
      kind: 'unmeasured',
      count: 1,
    })
    expect(pipelineTotal({ total_count: 9, total_amount_cents: 0, total_without_amount: 9 })).toEqual({
      kind: 'unmeasured',
      count: 9,
    })
  })

  it('au moins une affaire chiffrée : un montant, et le compte de ce qui manque', () => {
    expect(pipelineTotal({ total_count: 11, total_amount_cents: 5_000_000, total_without_amount: 7 })).toEqual({
      kind: 'measured',
      count: 11,
      amountCents: 5_000_000,
      withoutAmount: 7,
    })
  })

  it('tout est chiffré : un montant EXACT, rien ne manque', () => {
    expect(pipelineTotal({ total_count: 3, total_amount_cents: 4_500_000, total_without_amount: 0 })).toEqual({
      kind: 'measured',
      count: 3,
      amountCents: 4_500_000,
      withoutAmount: 0,
    })
  })

  it('un pipe chiffré à 0 € RESTE un montant : la somme a été faite', () => {
    // Trois affaires saisies à 0 € : c'est une mesure, pas une absence. La
    // dérivation ne devine pas — elle lit `total_without_amount`.
    expect(pipelineTotal({ total_count: 3, total_amount_cents: 0, total_without_amount: 0 })).toEqual({
      kind: 'measured',
      count: 3,
      amountCents: 0,
      withoutAmount: 0,
    })
  })

  it('une réponse qui ne porte pas les champs n’AFFIRME rien — ni un total, ni un compte', () => {
    // `usePipeline` ne valide pas la réponse par un schéma : le champ peut
    // manquer. « 0 € » serait un mensonge, et « aucun montant saisi sur 0
    // projet » en serait un second. On dit « non mesuré », sans raison.
    expect(pipelineTotal(undefined)).toEqual({ kind: 'unmeasured', count: null })
    expect(pipelineTotal({})).toEqual({ kind: 'unmeasured', count: null })
    expect(pipelineTotal({ total_count: 2, total_without_amount: 1 })).toEqual({ kind: 'unmeasured', count: null })
    expect(pipelineTotal({ total_count: Number.NaN, total_amount_cents: 0, total_without_amount: 0 })).toEqual({
      kind: 'unmeasured',
      count: null,
    })
  })

  it('un `without_amount` incohérent ne fabrique pas un montant', () => {
    // Plus de non chiffrés que de projets : la source est fausse, mais la
    // lecture reste sûre — on n'invente pas un total.
    expect(pipelineTotal({ total_count: 2, total_amount_cents: 0, total_without_amount: 5 })).toEqual({
      kind: 'unmeasured',
      count: 2,
    })
  })
})

/*
 * Déménagé de `features/briefing/cockpit.test.ts` le 04/09/2026 (#1394) : le
 * brief ne rend plus le pipe par étape, et son fichier réexportait cette
 * fonction pour l'occasion. Le test suit la FONCTION, pas l'écran qui
 * l'affichait — sinon il partait à la poubelle avec le bloc.
 */
describe('columnAmountCents — les trois situations, une seule où zéro est VRAI', () => {
  it('une colonne VIDE vaut bien 0 €', () => {
    expect(columnAmountCents({ count: 0, amount_cents: 0, without_amount: 0 })).toBe(0)
  })

  it('des affaires, aucune chiffrée : null — « Négociation · 0 € » se lirait « on négocie pour rien »', () => {
    expect(columnAmountCents({ count: 6, amount_cents: 0, without_amount: 6 })).toBeNull()
  })

  it('au moins une chiffrée : le montant, qui est un plancher', () => {
    expect(columnAmountCents({ count: 6, amount_cents: 4_200_000, without_amount: 5 })).toBe(4_200_000)
  })
})
