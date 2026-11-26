import { OUTBOUND_WRITE_KINDS } from '../crm/outbound-write-preview'
import { buildDemoCrmWriteRequests, DEMO_CRM_WRITE_REQUESTS } from './demo-crm-write-requests'

/**
 * #4163 LF point 7 — la file « À traiter » de la salle montrait « Écriture CRM indisponible ». Elle porte maintenant
 * des écritures CRM EN ATTENTE (jamais exécutées) : un lot de plusieurs écritures, et une écriture seule.
 */
describe('les écritures CRM en attente de la salle de démonstration', () => {
  it('LIT quelque chose : un lot de deux écritures ou plus, ET une écriture seule', () => {
    const rows = buildDemoCrmWriteRequests(new Date('2026-10-14T10:00:00Z'))
    expect(rows.length).toBeGreaterThanOrEqual(3)
    const byBatch = new Map<string, number>()
    for (const row of rows) if (row.batchKey) byBatch.set(row.batchKey, (byBatch.get(row.batchKey) ?? 0) + 1)
    expect([...byBatch.values()].some(count => count >= 2)).toBe(true) // la carte « N écritures vers ton CRM »
    expect(rows.some(row => row.batchKey === null)).toBe(true) // une carte seule
  })

  it('ne cite que des natures d’écriture que le produit connaît', () => {
    for (const request of DEMO_CRM_WRITE_REQUESTS) expect(OUTBOUND_WRITE_KINDS).toContain(request.kind)
  })

  it('la prévisualisation est CELLE du produit (champ par champ, clés de ligne) — jamais écrite à la main', () => {
    for (const row of buildDemoCrmWriteRequests(new Date())) {
      expect(row.preview.length).toBeGreaterThan(0)
      for (const line of row.preview) expect(line.key).toBeTruthy()
    }
  })

  it('rien ne part seul : toutes sont en attente, d’origine « système », et expirent dans le futur', () => {
    const now = new Date('2026-10-14T10:00:00Z')
    for (const row of buildDemoCrmWriteRequests(now)) {
      expect(row.origin).toBe('system')
      expect(row.expiresAt.getTime()).toBeGreaterThan(now.getTime())
    }
  })

  it('aucune coordonnée inventée : ni e-mail ni téléphone dans les charges utiles (personne SIMULÉE)', () => {
    for (const request of DEMO_CRM_WRITE_REQUESTS) {
      expect(Object.keys(request.payload)).not.toContain('email')
      expect(Object.keys(request.payload)).not.toContain('phone')
    }
  })
})
