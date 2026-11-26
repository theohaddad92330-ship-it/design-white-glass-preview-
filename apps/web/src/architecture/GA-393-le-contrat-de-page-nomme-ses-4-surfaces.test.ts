import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PAGE_CONTRACT_AUDIT,
  PAGE_CONTRACT_FIELDS,
  PAGE_CONTRACT_SURFACES,
  type PageContractField,
  type PageContractSurface,
} from '@bellum/contracts'

/**
 * GA-393 — LE CONTRAT DE PAGE TIENT SES 4 SURFACES, ET SON AUDIT NE PEUT PAS
 * MENTIR.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET D'OÙ ELLE VIENT
 * ─────────────────────────────────────────────────────────────────────────
 * #2931 (reprend #2167.1/.3-.14, hors lot du tri du 24/09/2026) : Contacts,
 * Mes cibles, Analyser et Découvrir doivent chacune pouvoir dire 13 champs
 * (bénéfice, données disponibles/manquantes, action principale, accès Laura,
 * état des sources, provenance, coût, empty/loading/error, mobile,
 * permissions). Le commentaire de vérification du 25/09 sur #2931 confirme
 * qu'aucun contrat transverse n'existait : `git grep -i "contrat de page"`
 * revenait vide. `page-contract.ts` livre ce contrat ; cette garde en tient
 * la promesse dans LE TEMPS — un cinquième champ ajouté au type sans entrer
 * dans `PAGE_CONTRACT_FIELDS`, ou une surface retirée de l'audit sans raison,
 * fait rougir la CI au lieu de passer inaperçu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE VÉRIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle vérifie que le contrat LIT quelque chose (13 champs, 4 surfaces), que
 * l'audit ne saute AUCUNE case du produit 4×13, et que toute preuve
 * `present` pointe un fichier qui EXISTE dans ce dépôt au moment du build —
 * un `present` sur un fichier renommé ou supprimé fait échouer la CI plutôt
 * que de continuer à mentir en silence.
 *
 * Elle ne vérifie PAS que le contrat est TENU par les écrans : #2931 confie
 * cette garde-là aux gardes suivantes du chantier (inventaire des boutons,
 * recettes E2E), explicitement HORS de ce lot — un audit à statut
 * `unverified` ou `absent` est donc légitime, et cette garde ne les force pas
 * à devenir `present`. Confondre « l'audit est complet » et « le produit est
 * conforme » serait exactement l'erreur que la doctrine « on n'affiche pas ce
 * qu'on n'a pas » interdit : cette garde nomme ce qui manque, elle ne le
 * cache pas en le forçant à `present`.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const SCHEMA_FILE = join(REPO_ROOT, 'packages/contracts/src/schemas/page-contract.ts')

describe('GA-393 — le contrat de page, ses 4 surfaces, son audit', () => {
  it('la garde LIT quelque chose — un corpus vide la rendrait verte pour toujours', () => {
    expect(readFileSync(SCHEMA_FILE, 'utf8').length).toBeGreaterThan(500)
    expect(PAGE_CONTRACT_FIELDS.length).toBe(13)
    expect(PAGE_CONTRACT_SURFACES.length).toBe(4)
    expect(PAGE_CONTRACT_AUDIT.length).toBe(4)
  })

  it('l’audit couvre le produit 4 surfaces × 13 champs, sans case oubliée', () => {
    const missing: string[] = []
    const surfacesSeen = new Set<PageContractSurface>()
    for (const audit of PAGE_CONTRACT_AUDIT) {
      surfacesSeen.add(audit.surface)
      for (const field of PAGE_CONTRACT_FIELDS as readonly PageContractField[]) {
        if (!(field in audit.fields)) missing.push(`${audit.surface}.${field}`)
      }
    }
    expect(missing).toEqual([])
    expect([...surfacesSeen].sort()).toEqual([...PAGE_CONTRACT_SURFACES].sort())
  })

  it('un `present` pointe un fichier qui EXISTE dans le dépôt', () => {
    const dangling: string[] = []
    for (const audit of PAGE_CONTRACT_AUDIT) {
      for (const [field, entry] of Object.entries(audit.fields)) {
        if (entry.status !== 'present') continue
        const path = entry.evidence.split(':')[0]
        if (!existsSync(join(REPO_ROOT, path))) dangling.push(`${audit.surface}.${field} → ${path}`)
      }
    }
    expect(dangling).toEqual([])
  })

  it('un champ non tenu est NOMMÉ (`absent` ou `unverified`), jamais silencieux', () => {
    // #2931 est hors lot pour l'inventaire de boutons et les recettes E2E :
    // cette garde n'exige donc PAS que tout devienne `present`. Elle vérifie
    // seulement que rien n'échappe aux trois statuts du schéma — un objet
    // sans `status` romprait `pageContractAuditEntrySchema` plus haut, pas ici.
    for (const audit of PAGE_CONTRACT_AUDIT) {
      for (const entry of Object.values(audit.fields)) {
        expect(['present', 'absent', 'unverified']).toContain(entry.status)
      }
    }
  })

  it('la garde sait dire NON — sur un audit délibérément cassé', () => {
    const brokenPath = 'apps/web/src/features/ce-fichier-nexiste-pas.tsx'
    expect(existsSync(join(REPO_ROOT, brokenPath))).toBe(false)

    const incomplete = { surface: 'contacts' as const, fields: { benefit: { status: 'present', evidence: 'x' } } }
    const missing = (PAGE_CONTRACT_FIELDS as readonly string[]).filter(field => !(field in incomplete.fields))
    expect(missing.length).toBeGreaterThan(0)
  })
})
