import { describe, expect, it } from 'vitest'
import { importTemplateCsv } from './import-template'

/**
 * #2078.31 — « Par import : modèle, exemples, colonnes nécessaires ».
 *
 * `card.required` et `card.fields` existaient déjà côté serveur — l'étape 1
 * de l'assistant ne les affichait qu'APRÈS avoir choisi la source, jamais
 * AVANT, au moment où ça compte : décider quel fichier déposer. Ce fichier
 * tient le gabarit téléchargeable, une ligne d'exemple par colonne CONNUE,
 * jamais une donnée d'entreprise ou de personne réelle.
 */
describe('#2078.31 — le gabarit CSV téléchargeable', () => {
  it('porte une ligne d’en-tête avec les colonnes reçues', () => {
    const csv = importTemplateCsv(['email', 'name'])
    expect(csv.split('\n')[0]).toBe('email,name')
  })

  it('porte une ligne d’EXEMPLE — jamais vide, jamais une donnée réelle', () => {
    const csv = importTemplateCsv(['email'])
    const [, example] = csv.split('\n')
    expect(example).toBe('jean.dupont@exemple.fr')
  })

  it('un champ inconnu reçoit un exemple générique plutôt qu’une case vide', () => {
    const csv = importTemplateCsv(['champObscur'])
    const [, example] = csv.split('\n')
    expect(example).toBe('exemple')
  })

  it('ne rend jamais un fichier VIDE — un repli existe même sans champ connu', () => {
    const csv = importTemplateCsv([])
    expect(csv.split('\n')[0]).not.toBe('')
  })
})
