import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PAGE_CONTRACT_AUDIT,
  PAGE_CONTRACT_FIELDS,
  PAGE_CONTRACT_SURFACES,
  pageContractAuditEntrySchema,
  pageContractAuditSchema,
} from './page-contract.js'

/**
 * #2931 (reprend #2167.1/.3-.14) — le contrat de page tient ses 13 champs sur
 * les 4 surfaces, et son audit ne peut pas mentir : un `present` sans fichier
 * réel, ou un champ silencieusement absent des trois listes (présent, absent,
 * non vérifié), fait échouer ces tests avant d'atteindre la garde CI.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

describe('page-contract — le contrat lit quelque chose', () => {
  it('porte les 13 champs de #2167.1/.3-.14, ni plus ni moins', () => {
    expect(PAGE_CONTRACT_FIELDS.length).toBe(13)
    expect(PAGE_CONTRACT_FIELDS).not.toContain('personalization')
  })

  it('porte les 4 surfaces, « analyze » comprise (tranché sans Louis)', () => {
    expect(PAGE_CONTRACT_SURFACES).toEqual(['contacts', 'mes_cibles', 'analyze', 'discover'])
  })
})

describe('page-contract — l’audit est complet et honnête', () => {
  it('couvre les 4 surfaces, chacune une seule fois', () => {
    const surfaces = PAGE_CONTRACT_AUDIT.map(audit => audit.surface)
    expect(surfaces.sort()).toEqual([...PAGE_CONTRACT_SURFACES].sort())
    expect(new Set(surfaces).size).toBe(surfaces.length)
  })

  it('chaque surface nomme les 13 champs — aucun champ silencieusement oublié', () => {
    const missing: string[] = []
    for (const audit of PAGE_CONTRACT_AUDIT) {
      for (const field of PAGE_CONTRACT_FIELDS) {
        if (!(field in audit.fields)) missing.push(`${audit.surface}.${field}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('chaque entrée respecte le schéma zod (present | absent | unverified)', () => {
    for (const audit of PAGE_CONTRACT_AUDIT) {
      expect(() => pageContractAuditSchema.parse(audit)).not.toThrow()
      for (const entry of Object.values(audit.fields)) {
        expect(() => pageContractAuditEntrySchema.parse(entry)).not.toThrow()
      }
    }
  })

  it('un `present` pointe un fichier qui EXISTE — l’audit ne peut pas inventer une preuve', () => {
    const missing: string[] = []
    for (const audit of PAGE_CONTRACT_AUDIT) {
      for (const [field, entry] of Object.entries(audit.fields)) {
        if (entry.status !== 'present') continue
        const path = entry.evidence.split(':')[0]
        if (!existsSync(join(REPO_ROOT, path))) missing.push(`${audit.surface}.${field} → ${path}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('un `absent` ou un `unverified` porte une raison d’au moins 15 caractères — jamais un mot seul', () => {
    const tooShort: string[] = []
    for (const audit of PAGE_CONTRACT_AUDIT) {
      for (const [field, entry] of Object.entries(audit.fields)) {
        if (entry.status === 'present') continue
        if (entry.reason.trim().length < 15) tooShort.push(`${audit.surface}.${field}`)
      }
    }
    expect(tooShort).toEqual([])
  })

  it('la garde sait dire NON — sur un audit délibérément cassé', () => {
    expect(() => pageContractAuditEntrySchema.parse({ status: 'present', evidence: '' })).toThrow()
    expect(() => pageContractAuditEntrySchema.parse({ status: 'absent', reason: '' })).toThrow()
    expect(() => pageContractAuditEntrySchema.parse({ status: 'gone' })).toThrow()
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/features/ce-fichier-nexiste-pas.tsx'))).toBe(false)
  })
})
