import { describe, expect, it } from 'vitest'
import {
  CONTEXT_PACK_EXTENSIONS,
  classifyContextPackFile,
  contextPackAllowedDestinations,
  contextPackClassifyRequestSchema,
  contextPackExtension,
} from './context-pack-import.js'

// import-contexte Je.1 — le classement d'un fichier du pack de contexte : déterministe, aucun appel modèle.
describe('context-pack-import — classement déterministe (Je.1)', () => {
  it('accepte les neuf formats décidés, sans tenir compte de la casse', () => {
    expect([...CONTEXT_PACK_EXTENSIONS].sort()).toEqual(
      ['csv', 'docx', 'json', 'md', 'pdf', 'pptx', 'tsv', 'txt', 'xlsx'].sort(),
    )
    expect(contextPackExtension('Pack.XLSX')).toBe('xlsx')
    expect(contextPackExtension('sans-extension')).toBe('')
  })

  it.each(['docx', 'pptx', 'pdf', 'md', 'txt'])('un .%s part en connaissances, par son extension', ext => {
    const result = classifyContextPackFile({ fileName: `offre.${ext}`, headers: null, sheetCount: null })
    expect(result).toMatchObject({ destination: 'knowledge', rule: 'extension', matchedHeaders: [] })
  })

  it('comptes : entreprise + tier', () => {
    const result = classifyContextPackFile({
      fileName: 'tiering.csv',
      headers: ['Entreprise', 'Tier', 'Secteur'],
      sheetCount: null,
    })
    expect(result).toMatchObject({ destination: 'accounts', rule: 'headers', matchedHeaders: ['Entreprise', 'Tier'] })
  })

  it('comptes : raison sociale + priorité (accents, casse, pluriel)', () => {
    const result = classifyContextPackFile({
      fileName: 'cibles.xlsx',
      headers: ['RAISON SOCIALE', 'Priorités'],
      sheetCount: 1,
    })
    expect(result.destination).toBe('accounts')
  })

  it('postes cibles : intitulé de poste + niveau décideur', () => {
    const result = classifyContextPackFile({
      fileName: 'postes.csv',
      headers: ['Intitulé de poste', 'Niveau décideur'],
      sheetCount: null,
    })
    expect(result).toMatchObject({
      destination: 'target_personas',
      matchedHeaders: ['Intitulé de poste', 'Niveau décideur'],
    })
  })

  it('grille go/no-go : critère + poids + seuil', () => {
    const result = classifyContextPackFile({
      fileName: 'gonogo.xlsx',
      headers: ['Critère', 'Poids', 'Seuil'],
      sheetCount: 1,
    })
    expect(result).toMatchObject({
      destination: 'qualification_grid',
      matchedHeaders: ['Critère', 'Poids', 'Seuil'],
    })
  })

  it('séquences : étape + objet + script', () => {
    const result = classifyContextPackFile({
      fileName: 'campagnes.csv',
      headers: ['Étape', 'Objet', 'Script'],
      sheetCount: null,
    })
    expect(result).toMatchObject({ destination: 'sequences', matchedHeaders: ['Étape', 'Objet', 'Script'] })
  })

  it('aucune règle : le tableau part en connaissances, jamais rejeté', () => {
    const result = classifyContextPackFile({
      fileName: 'notes.csv',
      headers: ['Date', 'Commentaire'],
      sheetCount: null,
    })
    expect(result).toMatchObject({ destination: 'knowledge', rule: 'no_rule', matchedHeaders: [] })
  })

  it('dit NON : un CSV de CONTACTS (fonction + séniorité, mais des personnes) n’est PAS classé « postes cibles »', () => {
    const result = classifyContextPackFile({
      fileName: 'contacts.csv',
      headers: ['Prénom', 'Nom', 'Email', 'Fonction', 'Séniorité', 'Société'],
      sheetCount: null,
    })
    expect(result.destination).not.toBe('target_personas')
  })

  it('dit NON : une seule colonne-clé ne suffit pas (« Entreprise » seule n’est pas un tiering)', () => {
    const result = classifyContextPackFile({ fileName: 'a.csv', headers: ['Entreprise', 'Ville'], sheetCount: null })
    expect(result.destination).toBe('knowledge')
  })

  it('un classeur à plusieurs onglets part entier en connaissances, et le dit', () => {
    const result = classifyContextPackFile({
      fileName: 'pack.xlsx',
      headers: ['Entreprise', 'Tier'],
      sheetCount: 3,
    })
    expect(result).toMatchObject({ destination: 'knowledge', rule: 'multi_sheet', sheetCount: 3 })
  })

  it('un tableau dont les en-têtes n’ont pas pu être lus part en connaissances (« illisible »)', () => {
    const result = classifyContextPackFile({ fileName: 'a.xlsx', headers: null, sheetCount: null })
    expect(result).toMatchObject({ destination: 'knowledge', rule: 'unreadable' })
  })

  it('les destinations proposées au select sont celles que l’importeur sait LIRE', () => {
    expect(contextPackAllowedDestinations('pdf')).toEqual(['knowledge'])
    expect(contextPackAllowedDestinations('tsv')).toEqual(['accounts', 'knowledge'])
    expect(contextPackAllowedDestinations('xlsx')).toEqual([
      'accounts',
      'target_personas',
      'qualification_grid',
      'sequences',
      'knowledge',
    ])
    expect(classifyContextPackFile({ fileName: 'a.md', headers: null, sheetCount: null }).allowedDestinations).toEqual([
      'knowledge',
    ])
  })

  it('la requête refuse un format hors liste', () => {
    expect(contextPackClassifyRequestSchema.safeParse({ fileName: 'a.exe' }).success).toBe(false)
    expect(contextPackClassifyRequestSchema.safeParse({ fileName: 'a.csv', headB64: 'YQ==' }).success).toBe(true)
  })
})
