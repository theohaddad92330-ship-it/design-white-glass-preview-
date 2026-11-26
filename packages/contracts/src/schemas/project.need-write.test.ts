import { describe, expect, it } from 'vitest'
import { NEED_URGENCIES, createProjectNeedSchema, updateProjectNeedSchema } from './project.js'

/**
 * Les deux colonnes fantômes d'un besoin : `urgency` et `owner_id`.
 *
 * Toutes deux existaient en base depuis le chantier CRM, toutes deux étaient
 * LUES (`open-needs.service.ts`, `project-pipeline.service.ts`) — et aucune
 * n'était dans un schéma d'ÉCRITURE. Comme les deux schémas sont `.strict()`,
 * les envoyer était refusé en 400 : la colonne restait vide pour toujours, et
 * un vide honnête ressemble à une base vide plutôt qu'à un trou. C'est la
 * troisième occurrence du défaut « colonne lue, jamais écrite » dans ce dépôt.
 */
describe('createProjectNeedSchema — l’urgence et le propriétaire s’écrivent', () => {
  const base = { title: 'Tech lead Java' }

  it('accepte l’urgence', () => {
    expect(createProjectNeedSchema.parse({ ...base, urgency: 'haute' }).urgency).toBe('haute')
  })

  it('accepte les quatre urgences de la contrainte SQL, et refuse le reste', () => {
    for (const urgency of NEED_URGENCIES) {
      expect(createProjectNeedSchema.safeParse({ ...base, urgency }).success).toBe(true)
    }
    // Une valeur hors contrainte serait rejetée par PostgreSQL en fin de course,
    // là où l'erreur ne se lit plus : elle s'arrête ici.
    expect(createProjectNeedSchema.safeParse({ ...base, urgency: 'urgente' }).success).toBe(false)
  })

  it('accepte un propriétaire, et son retrait explicite', () => {
    const owner = '3f1a6b6a-6f1e-4b0e-9f8f-2f0d1a2b3c4d'
    expect(createProjectNeedSchema.parse({ ...base, owner_id: owner }).owner_id).toBe(owner)
    expect(createProjectNeedSchema.parse({ ...base, owner_id: null }).owner_id).toBeNull()
    expect(createProjectNeedSchema.safeParse({ ...base, owner_id: 'moi' }).success).toBe(false)
  })

  it('reste STRICT — un champ inconnu est toujours refusé', () => {
    expect(createProjectNeedSchema.safeParse({ ...base, urgencyy: 'haute' }).success).toBe(false)
  })

  it('ne pose AUCUN défaut d’urgence : absente veut dire que personne ne l’a dite', () => {
    expect(createProjectNeedSchema.parse(base)).not.toHaveProperty('urgency')
  })
})

describe('updateProjectNeedSchema — la même ouverture, côté modification', () => {
  it('accepte un patch qui ne porte que l’urgence', () => {
    expect(updateProjectNeedSchema.safeParse({ urgency: 'critique' }).success).toBe(true)
  })

  it('accepte un patch qui ne porte que le propriétaire, y compris pour le libérer', () => {
    expect(updateProjectNeedSchema.safeParse({ owner_id: null }).success).toBe(true)
  })

  it('refuse toujours un patch vide', () => {
    expect(updateProjectNeedSchema.safeParse({}).success).toBe(false)
  })
})
