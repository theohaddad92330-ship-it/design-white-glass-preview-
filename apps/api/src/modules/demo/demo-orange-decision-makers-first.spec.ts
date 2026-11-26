import type { OrgGraph } from '@bellum/contracts'
import { rankAccountContacts, type RankableContactRow } from '../contacts/contact-ranking'
import { DEMO_EXTENSION_ACCOUNTS } from './demo-dataset'

/**
 * Recette 12/10/2026 (Louis : « je veux que la démo comme le produit soit carré ») — les décideurs du dossier d'Orange
 * sont en TÊTE du « Chemin d'accès recommandé » et de la liste Contacts. Le rôle change l'ORDRE, jamais le CONTENU :
 * aucun rôle inventé, le levier est celui que l'écran lit déjà (classement `rankAccountContacts`, priorité 1, tag
 * « Décideur »).
 */
/** Le chemin d'accès montre les cinq premiers décideurs (taille du comité d'achat du graphe). */
const COMMITTEE_MAX = 5
const orange = DEMO_EXTENSION_ACCOUNTS.find(account => account.company_name === 'Orange')
const contacts = orange?.contacts ?? []

function rowOf(contact: (typeof contacts)[number], index: number): RankableContactRow {
  return {
    id: `c-${String(index).padStart(4, '0')}`,
    title: contact.title ?? null,
    entity: contact.entity ?? null,
    decision_role: contact.decision_role ?? null,
    email: contact.email ?? null,
    // La ligne du semis (`demoContactRow`) pose toujours `email_verified: false`.
    email_verified: false,
    phone: contact.phone ?? null,
    linkedin_url: contact.linkedin_url ?? null,
    source: null,
    user_status: null,
    email_sent_at: null,
    last_enrichment_at: null,
    priority: contact.priority ?? null,
    demo_seed_first_door: true,
  }
}

describe('Orange — les décideurs du dossier en tête du classement', () => {
  const decisionMakers = contacts.filter(contact => contact.tags?.includes('Décideur'))
  const rows = contacts.map(rowOf)
  const rawAnalysis = (orange?.raw_analysis ?? null) as Record<string, unknown> | null

  it('lit bien les 7 décideurs du dossier', () => {
    expect(decisionMakers).toHaveLength(7)
  })

  it('le chemin recommandé (10 premiers) contient les 7 décideurs, avant tout autre contact', () => {
    const ranking = rankAccountContacts(rows, rawAnalysis, {})
    const topIds = ranking.ranked.slice(0, 7).map(entry => entry.contact_id)
    const decisionIds = new Set(rows.filter((_, index) => contacts[index]?.tags?.includes('Décideur')).map(r => r.id))
    expect(topIds.filter(id => decisionIds.has(id))).toHaveLength(7)
  })

  it('le « Chemin d’accès recommandé » de l’organigramme part des décideurs, dans l’ordre du dossier', () => {
    const graph = (rawAnalysis?.['org'] as { orgGraph?: OrgGraph } | undefined)?.orgGraph
    const path = graph?.recommendedPath ?? []
    expect(path.map(step => step.step)).toEqual(path.map((_, index) => index + 1))
    const names = path.map(step => graph?.people.find(person => person.id === step.personId)?.fullName)
    expect(names).toEqual(decisionMakers.slice(0, COMMITTEE_MAX).map(contact => contact.full_name))
    // Aucun canal ni débouché inventé : le dossier ne les porte pas.
    expect(path.every(step => step.channel === undefined && step.unlocks === undefined)).toBe(true)
    expect(path.every(step => step.objective.trim().length > 0)).toBe(true)
  })

  it('sait dire NON : sans le tag, un contact ordinaire n’est pas devant un décideur', () => {
    const ranking = rankAccountContacts(rows, rawAnalysis, {})
    const firstOrdinary = ranking.ranked.findIndex(
      entry => !contacts[Number(entry.contact_id.slice(2))]?.tags?.includes('Décideur'),
    )
    expect(firstOrdinary === -1 || firstOrdinary >= 7).toBe(true)
  })
})
