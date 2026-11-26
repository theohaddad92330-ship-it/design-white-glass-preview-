import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_MISSION_CLIENT_MANAGER } from './demo-dataset'
import { DEMO_MISSION_CLIENT_MANAGER_COVERAGE } from './demo-coverage'

/**
 * #2836 — LE MANAGER CLIENT, OBSERVABLE EN DÉMONSTRATION (craft rule n°9).
 *
 * `missions.client_manager_contact_id` (migration `1796001525994`) est une
 * colonne NEUVE sur une table déjà classée SEEDÉE : la garde de tables de
 * `demo-coverage.spec.ts` y est aveugle. Sans semis, le résumé des missions
 * du compte n'afficherait jamais la ligne « Manager client », et le panneau
 * de planification resterait « Non désigné » sur les neuf missions.
 *
 * Cette garde SAIT DIRE NON : elle relit le jeu réellement construit (la
 * mission et le contact doivent exister sur le client d'exemple) ET le semis
 * (l'écriture de la colonne doit y figurer) — retirer l'un ou l'autre la
 * fait rougir.
 */
describe('couverture démo — manager client (#2836)', () => {
  const entries = Object.entries(DEMO_MISSION_CLIENT_MANAGER)

  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThan(0)
    expect(entries.length).toBeGreaterThan(0)
  })

  it('chaque mission désignée existe, et son manager est un contact DU MÊME client', () => {
    const labels = new Set<string>(DEMO_DELIVERY_CLIENT.missions.map(mission => mission.label))
    // Décision Louis 04/10/2026 — le manager est un SIÈGE (sans nom) du dossier
    // du client de livraison : aucune personne n'est créée.
    const carrier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_DELIVERY_CLIENT.account.company_name)
    const contacts = new Set<string>((carrier?.contacts ?? []).map(contact => contact.full_name))
    for (const [label, contact] of entries) {
      expect(labels.has(label)).toBe(true)
      expect(contacts.has(contact)).toBe(true)
    }
  })

  it('toutes les missions ne sont PAS désignées — « non désigné » doit aussi se voir', () => {
    expect(entries.length).toBeLessThan(DEMO_DELIVERY_CLIENT.missions.length)
  })

  it('le semis ÉCRIT la colonne — un jeu déclaré sans écrivain ne se verrait pas', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toMatch(/UPDATE missions SET client_manager_contact_id/)
    expect(seed).toContain('DEMO_MISSION_CLIENT_MANAGER[')
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_MISSION_CLIENT_MANAGER_COVERAGE.state).toBe('seede')
    expect(DEMO_MISSION_CLIENT_MANAGER_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
