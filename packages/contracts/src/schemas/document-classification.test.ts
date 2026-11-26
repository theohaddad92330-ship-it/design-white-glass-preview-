import { describe, expect, it } from 'vitest'
import { classifyDocumentByName } from './document-classification.js'

/**
 * #2431.10 — chaque fichier déposé reçoit un TYPE MÉTIER PROBABLE. Tranche
 * livrée : une classification par NOM de fichier seul (extension + mots-clés
 * dans son nom), jamais par contenu — c'est pourquoi la confiance renvoyée
 * est TOUJOURS `'to_verify'`, jamais « élevée » (une classification de nom
 * seul ne peut pas se targuer d'avoir lu le document). Reste hors de cette
 * tranche : la classification par CONTENU extrait, la confiance élevée, et
 * le routage vers un objet métier (#2431.2).
 */
describe('#2431.10 — classifyDocumentByName', () => {
  it('reconnaît un CV au nom explicite', () => {
    expect(classifyDocumentByName('Jean_Dupont_CV.pdf')).toEqual({ type: 'cv', confidence: 'to_verify' })
  })

  it('reconnaît un CV nommé « curriculum vitae », sans le sigle', () => {
    expect(classifyDocumentByName('Curriculum Vitae - Emilie.docx')).toEqual({ type: 'cv', confidence: 'to_verify' })
  })

  it('reconnaît un export CRM (comptes/contacts)', () => {
    expect(classifyDocumentByName('export_contacts_boond_sept.csv')).toEqual({
      type: 'crm_export',
      confidence: 'to_verify',
    })
  })

  it('reconnaît un tableau de besoins', () => {
    expect(classifyDocumentByName('Tableau des besoins Q4.xlsx')).toEqual({
      type: 'needs_sheet',
      confidence: 'to_verify',
    })
  })

  it('reconnaît un appel d’offres', () => {
    expect(classifyDocumentByName('AO_Client_Infra_2026.pdf')).toEqual({ type: 'rfp', confidence: 'to_verify' })
  })

  it('reconnaît une facture', () => {
    expect(classifyDocumentByName('Facture_Septembre_2026.pdf')).toEqual({ type: 'invoice', confidence: 'to_verify' })
  })

  it('reconnaît une capture d’écran', () => {
    expect(classifyDocumentByName('Capture d’écran 2026-09-23.png')).toEqual({
      type: 'screenshot',
      confidence: 'to_verify',
    })
  })

  it('ne force jamais un type sur un nom qui ne porte aucun indice', () => {
    expect(classifyDocumentByName('notes-reunion.pdf')).toBeUndefined()
  })

  it('sait dire NON quand le mot-clé est présent mais l’extension ne colle pas', () => {
    // « cv » comme jeton existe, mais une archive .zip n'est pas un CV lisible tel quel.
    expect(classifyDocumentByName('cv.zip')).toBeUndefined()
  })

  it('ne confond pas « recette » avec une facture (pas de sous-chaîne « facture »)', () => {
    expect(classifyDocumentByName('recette-fonctionnelle.pdf')).toBeUndefined()
  })
})
