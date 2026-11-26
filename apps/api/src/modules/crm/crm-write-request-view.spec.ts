import { CRM_WRITE_KINDS, crmWriteRequestViewSchema } from '@bellum/contracts'
import type { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'
import { OUTBOUND_WRITE_KINDS } from './outbound-write-preview'
import { toCrmWriteRequestView } from './crm-write-request-view'

/**
 * GA — la vue d'une écriture CRM n'emporte QUE ce qu'un écran doit voir, et le
 * vocabulaire des deux côtés ne diverge pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES, DEUX ACCIDENTS DÉJÀ VUS DANS CE DÉPÔT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Aucun nom d'éditeur, aucune plomberie.** La route rendait l'entité
 *    brute : `provider` (« hubspot »), `payload`, `idempotency_key`,
 *    `provider_response`, `workspace_id`. Le premier écran qui l'aurait
 *    consommée aurait affiché un nom de fournisseur, ce que la doctrine refuse.
 *    Le test compare les CLÉS rendues à celles du contrat — pas « il n'y a pas
 *    `provider` », qui serait vrai le jour où on ajoute `vendor`.
 * 2. **Deux listes de natures, une seule vérité.** `OUTBOUND_WRITE_KINDS` vit
 *    dans l'API (il ne peut pas descendre dans les contrats : la garde
 *    `outbound-kinds-wired.spec.ts` balaie `apps/api/src/modules` et prendrait
 *    toute réécriture de ces littéraux pour un PRODUCTEUR, ce qui ferait passer
 *    trois natures gelées pour branchées). `CRM_WRITE_KINDS` vit dans les
 *    contrats parce que l'écran doit les nommer. Les deux DOIVENT rester égales,
 *    dans le même ORDRE (GA-08) — sinon une nature s'affiche en clé brute.
 *
 * ⚠️ Ce fichier est un `.spec.ts` À DESSEIN : `outbound-kinds-wired.spec.ts`
 * exclut les specs de son corpus. Écrire ces littéraux dans un fichier de
 * production du module `crm` ferait passer `create_company`, `create_list` et
 * `enroll_sequence` pour produites, et casserait sa liste gelée.
 */

function row(overrides: Partial<OutboundWriteRequestEntity> = {}): OutboundWriteRequestEntity {
  return {
    id: 'req-1',
    workspace_id: 'ws-1',
    requested_by: 'user-1',
    provider: 'hubspot',
    kind: 'create_note',
    payload: { note: 'Appel du 12/08', externalId: '42' },
    preview: [{ field: 'Note', value: 'Appel du 12/08' }],
    origin: 'system',
    state: 'pending',
    idempotency_key: 'telephony:aircall:9',
    decided_by: null,
    decided_at: null,
    expires_at: new Date('2026-09-03T10:00:00.000Z'),
    provider_response: null,
    created_at: new Date('2026-08-31T10:00:00.000Z'),
    assigned_to: null,
    snoozed_until: null,
    ...overrides,
  } as OutboundWriteRequestEntity
}

describe('la vue d’une écriture CRM en attente', () => {
  it('lit bien quelque chose — sans ça la garde resterait verte pour toujours', () => {
    expect(OUTBOUND_WRITE_KINDS.length).toBeGreaterThanOrEqual(7)
    expect(Object.keys(crmWriteRequestViewSchema.shape).length).toBeGreaterThanOrEqual(7)
  })

  it('les deux vocabulaires sont ÉGAUX, dans le même ordre (GA-08)', () => {
    // Si ce test tombe : ajoute la nature EN FIN des DEUX listes. Une nature
    // présente d'un seul côté s'affiche en clé brute, ou fait échouer la
    // validation du contrat — dans les deux cas devant l'utilisateur.
    expect([...CRM_WRITE_KINDS]).toEqual([...OUTBOUND_WRITE_KINDS])
  })

  it('ne rend QUE les clés du contrat — ni éditeur, ni charge utile, ni plomberie', () => {
    const view = toCrmWriteRequestView(row(), 'user-2', { id: 'user-1', name: 'Louis' })
    expect(Object.keys(view).sort()).toEqual(Object.keys(crmWriteRequestViewSchema.shape).sort())
    expect(crmWriteRequestViewSchema.safeParse(view).success).toBe(true)
    // Le NOM du fournisseur ne doit apparaître nulle part, pas même dans une
    // valeur : c'est ce que la garde d'écran (GA-45) vérifie plus loin, et la
    // seule façon de le garantir est qu'il ne sorte pas d'ici.
    expect(JSON.stringify(view)).not.toContain('hubspot')
  })

  it('sait dire NON : une entité brute ne passe pas le contrat', () => {
    // La preuve que le test ci-dessus mesure quelque chose.
    expect(crmWriteRequestViewSchema.safeParse(row()).success).toBe(false)
  })

  it('« demandée par moi » est une réponse, pas une supposition', () => {
    expect(toCrmWriteRequestView(row(), 'user-1', null).requestedByYou).toBe(true)
    expect(toCrmWriteRequestView(row(), 'user-2', null).requestedByYou).toBe(false)
  })

  it('une prévisualisation illisible devient un tableau VIDE, jamais une erreur', () => {
    // Une ligne de base écrite avant la prévisualisation figée, ou un `jsonb`
    // corrompu : l'écran doit pouvoir dire « aucun champ enregistré » plutôt
    // que faire tomber toute la file.
    const view = toCrmWriteRequestView(row({ preview: null as never }), 'user-1', null)
    expect(view.preview).toEqual([])
  })

  // #2200.10 / #2200.11 / #2200.12 / #2200.17 / #2201.21 — l'objet visé.
  describe('l’objet visé (#2200/#2201)', () => {
    it('nomme le propriétaire quand l’appelant le connaît, jamais deviné sinon', () => {
      const withOwner = toCrmWriteRequestView(row(), 'user-2', { id: 'user-1', name: 'Louis' })
      expect(withOwner.target.ownerId).toBe('user-1')
      expect(withOwner.target.ownerName).toBe('Louis')

      const withoutOwner = toCrmWriteRequestView(row(), 'user-2', null)
      expect(withoutOwner.target.ownerId).toBe('user-1')
      expect(withoutOwner.target.ownerName).toBeNull()
    })

    it('lit le compte et le contact depuis la charge utile d’un export, jamais un identifiant interne inventé', () => {
      const view = toCrmWriteRequestView(
        row({
          kind: 'export_contact',
          payload: { email: 'theo@capgemini.example', firstName: 'Théo', lastName: 'Martin', company: 'Capgemini' },
        }),
        'user-1',
        null,
      )
      expect(view.target.accountName).toBe('Capgemini')
      expect(view.target.contactName).toBe('Théo Martin')
      // Jamais d'identifiant interne : la charge utile ne porte que des noms.
      expect(view.target.accountId).toBeNull()
      expect(view.target.contactId).toBeNull()
    })

    it('un compte ou un contact absent de la charge utile reste NOMMÉMENT absent', () => {
      const view = toCrmWriteRequestView(
        row({ kind: 'create_note', payload: { note: 'Appel', externalId: '42' } }),
        'user-1',
        null,
      )
      expect(view.target.accountName).toBeNull()
      expect(view.target.contactName).toBeNull()
    })

    it('une écriture CRM n’a jamais de canal — ce n’est pas un envoi', () => {
      expect(toCrmWriteRequestView(row(), 'user-1', null).target.channel).toBeNull()
    })

    it('le risque est un niveau NOMMÉ, jamais une probabilité', () => {
      expect(toCrmWriteRequestView(row({ kind: 'create_note' }), 'user-1', null).target.risk).toBe('low')
      expect(toCrmWriteRequestView(row({ kind: 'enroll_sequence' }), 'user-1', null).target.risk).toBe('medium')
      expect(toCrmWriteRequestView(row({ kind: 'update_deal_stage' }), 'user-1', null).target.risk).toBe('medium')
    })

    // #2855 — la PROVENANCE : celle posée par la porte d'écriture, jamais
    // recalculée à la lecture.
    it('porte la provenance posée par la porte d’écriture', () => {
      const view = toCrmWriteRequestView(row({ source: { kind: 'call', ref: 'aircall:9' } }), 'user-1', null)
      expect(view.target.source).toEqual({ kind: 'call', ref: 'aircall:9' })
    })

    it('sans provenance posée, reste `null` — jamais devinée à la lecture', () => {
      expect(toCrmWriteRequestView(row({ source: null }), 'user-1', null).target.source).toBeNull()
    })
  })

  // #2864 / #2856 — le circuit : à qui la demande est confiée, jusqu'à quand
  // elle est reportée. Reste du lot précédent, complété par ce lot.
  describe('le circuit — confier et reporter (#2864 / #2856)', () => {
    it('sans délégation ni report, les deux restent `null`', () => {
      const view = toCrmWriteRequestView(row(), 'user-1', null)
      expect(view.assignedTo).toBeNull()
      expect(view.snoozedUntil).toBeNull()
    })

    it('porte le collègue à qui la demande est confiée', () => {
      const view = toCrmWriteRequestView(row({ assigned_to: 'user-collegue' }), 'user-1', null)
      expect(view.assignedTo).toBe('user-collegue')
    })

    it('porte la date de report en ISO, jamais l’objet `Date` brut', () => {
      const view = toCrmWriteRequestView(row({ snoozed_until: new Date('2026-09-02T08:00:00.000Z') }), 'user-1', null)
      expect(view.snoozedUntil).toBe('2026-09-02T08:00:00.000Z')
    })
  })

  // #2854 (#2201.9) — le lot d'actions en masse : jamais un lot d'un seul
  // élément deviné quand la demande n'en porte pas.
  describe('le lot d’actions en masse (#2854 / #2201.9)', () => {
    it('sans lot, `batchId` reste `null`', () => {
      const view = toCrmWriteRequestView(row(), 'user-1', null)
      expect(view.batchId).toBeNull()
    })

    it('porte l’identifiant du lot déposé par `requestBatch()`', () => {
      const view = toCrmWriteRequestView(row({ batch_id: 'lot-a' }), 'user-1', null)
      expect(view.batchId).toBe('lot-a')
    })
  })
})
