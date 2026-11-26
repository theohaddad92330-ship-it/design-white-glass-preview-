import { describe, expect, it } from 'vitest'
import {
  mayBeIngested,
  METHOD_RULES_KEPT,
  METHOD_RULES_REFUSED,
  RAG_INGESTION_EXCLUDED,
  RAG_INGESTION_MANIFEST,
} from './method-delta.js'

describe('le manifeste d’ingestion', () => {
  it('porte les six entrées du paquet, chacune typée', () => {
    expect(RAG_INGESTION_MANIFEST).toHaveLength(6)
    for (const entry of RAG_INGESTION_MANIFEST) {
      expect(entry.file.endsWith('.md') || entry.file.endsWith('.json')).toBe(true)
      expect(entry.type.length).toBeGreaterThan(0)
    }
  })

  it('quatre entrées sur six ne relèvent PAS de la base de connaissance', () => {
    // Ce sont des SPÉCIFICATIONS — graine de classifieur, contrat de workflow,
    // jeu d'évaluation. Les ingérer ferait remonter un fichier de configuration
    // comme réponse à une question commerciale.
    expect(RAG_INGESTION_MANIFEST.filter(entry => entry.notRag)).toHaveLength(4)
  })

  it('un fichier ABSENT du manifeste n’est pas ingérable', () => {
    // Le manifeste est une liste d'AUTORISATIONS. Le lire à l'envers ferait
    // entrer tout ce que personne n'a pensé à exclure.
    expect(mayBeIngested('commercial_method_delta.md')).toBe(true)
    expect(mayBeIngested('title_taxonomy_seed.json')).toBe(false)
    expect(mayBeIngested('export_crm_17387_contacts.csv')).toBe(false)
    expect(mayBeIngested('')).toBe(false)
  })

  it('la connaissance ingérable dit contre quoi dédupliquer', () => {
    const knowledge = RAG_INGESTION_MANIFEST.filter(entry => entry.type === 'retrieval_knowledge')
    expect(knowledge).toHaveLength(1)
    expect(knowledge[0]?.dedupeAgainst).toBeTruthy()
  })

  it('l’export CRM brut est nommé en PREMIER dans les exclusions', () => {
    // 17 387 contacts avec leurs coordonnées : dans un magasin vectoriel, ils
    // deviendraient retrouvables par n'importe quelle question, indéfiniment.
    expect(RAG_INGESTION_EXCLUDED[0]).toContain('CRM brut')
    expect(RAG_INGESTION_EXCLUDED).toHaveLength(7)
  })
})

describe('les règles de méthode', () => {
  it('les onze conservées sont écrites, pas paraphrasées', () => {
    expect(METHOD_RULES_KEPT).toHaveLength(11)
    for (const rule of METHOD_RULES_KEPT) {
      expect(rule.trim().length).toBeGreaterThan(30)
      expect(rule.trim().endsWith('.')).toBe(true)
    }
  })

  it('les sept REFUSÉES vivent au même endroit que celles qu’on garde', () => {
    // Un refus rangé ailleurs se perd, puis quelqu'un le réintroduit de bonne
    // foi six mois plus tard en croyant combler un manque.
    expect(METHOD_RULES_REFUSED).toHaveLength(7)
    expect(METHOD_RULES_REFUSED.some(rule => rule.includes('réseau professionnel'))).toBe(true)
    expect(METHOD_RULES_REFUSED.some(rule => rule.includes('mot pour mot'))).toBe(true)
  })

  it('aucune règle conservée ne porte de nombre fixe — c’est le premier refus', () => {
    for (const rule of METHOD_RULES_KEPT) expect(rule).not.toMatch(/\b\d+\s*(contacts?|messages?|appels?|jours?)\b/)
  })
})
