import { createPlanActionSchema } from '@bellum/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { contactPlanAction } from './contactPlanAction'

const ACCOUNT_ID = '22222222-0000-4000-8000-000000000001'

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

/**
 * #2123.46 — la fiche contact et l'ajout en masse écrivent la MÊME action, sur
 * la ligne canonique : même libellé, et le contact VISÉ. Le serveur
 * dédoublonne sur les deux ; deux formes différentes pour le même geste
 * créeraient deux lignes et le « déjà au plan » de l'ajout en masse mentirait.
 */
describe('#2123.46 — contactPlanAction', () => {
  it('nomme le contact dans le libellé et le désigne comme objet visé', () => {
    expect(contactPlanAction({ id: 'c-1', full_name: 'Alice Martin', title: 'DSI' })).toEqual({
      label: 'Prendre contact avec Alice Martin — DSI',
      reason: 'Ouvrir la relation avec Alice Martin — DSI et obtenir un premier échange',
      // #2395.8 — résultat attendu requis à la création.
      expected_outcome: 'Un premier échange avec Alice Martin — DSI est obtenu.',
      target: { kind: 'contact', id: 'c-1', label: 'Alice Martin' },
      method_rule: 'couverture_multi_roles_niveaux_entites',
    })
  })

  it('produit un corps que la porte `POST /plan-items` accepte', () => {
    const body = { account_id: ACCOUNT_ID, ...contactPlanAction({ id: 'c-1', full_name: 'Alice Martin' }) }
    expect(createPlanActionSchema.safeParse(body).success).toBe(true)
  })

  it('témoin — sans intitulé de poste, le libellé ne porte pas de tiret orphelin', () => {
    expect(contactPlanAction({ id: 'c-2', full_name: 'Bob' }).label).toBe('Prendre contact avec Bob')
  })
})
