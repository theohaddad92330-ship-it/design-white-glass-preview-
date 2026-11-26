import type { ActionRisk, CrmWriteRequestView } from '@bellum/contracts'
import type { OutboundWriteKind } from './outbound-write-preview'
import type { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'

/**
 * Le niveau de risque d'une écriture CRM, NOMMÉ — jamais une probabilité
 * (#2201.21). Une décision de produit, comme `workflowStepSchema.risk` l'est
 * déjà pour un pas de workflow (`action-os.ts:327`) : ajouter ou modifier un
 * contact se défait d'un clic (`low`) ; inscrire dans une séquence, déplacer
 * une affaire ou en CRÉER une touche plusieurs envois futurs ou change ce que
 * toute l'équipe voit du pipeline (`medium`).
 */
function crmWriteRiskOf(kind: OutboundWriteKind): ActionRisk {
  return kind === 'enroll_sequence' || kind === 'update_deal_stage' || kind === 'create_deal' ? 'medium' : 'low'
}

/**
 * Le compte et le contact visés, lus dans la charge utile — jamais un
 * identifiant interne inventé (#2200.10/.11). Seul `export_contact` porte
 * aujourd'hui un nom de société et une identité ; les autres natures restent
 * NOMMÉMENT absentes plutôt que de deviner.
 */
function targetNamesFromPayload(payload: Record<string, unknown>): {
  accountName: string | null
  contactName: string | null
} {
  const company = typeof payload.company === 'string' ? payload.company : null
  const firstName = typeof payload.firstName === 'string' ? payload.firstName : null
  const lastName = typeof payload.lastName === 'string' ? payload.lastName : null
  const fullName = [firstName, lastName].filter((part): part is string => Boolean(part)).join(' ')
  return { accountName: company, contactName: fullName.length > 0 ? fullName : null }
}

/**
 * L'entité en attente, telle que l'ÉCRAN la reçoit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE VUE RETIRE, ET POURQUOI CHAQUE RETRAIT COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /crm/write-requests` rendait l'entité BRUTE. Elle porte :
 *
 *  - `provider` — le NOM de l'éditeur. Il ne traverse jamais vers l'app : on
 *    nomme la capacité (« ton CRM »). C'est la doctrine, et c'est aussi ce que
 *    la garde GA-45 vérifie sur les écrans.
 *  - `payload` — la charge utile complète, dont la prévisualisation est déjà
 *    la lecture humaine. La rendre en plus exposerait des champs qu'aucun écran
 *    ne montre, et ferait exister deux sources pour « ce qui va être écrit ».
 *  - `idempotency_key` et `provider_response` — de la plomberie. Un client qui
 *    les voit finit par s'en servir.
 *  - `workspace_id`, `requested_by`, `decided_by` — des identifiants d'espace et
 *    de personnes qui ne servent à aucun rendu. `requested_by` est réduit à la
 *    seule question qu'un écran pose : « est-ce MOI qui l'ai demandée ? ».
 *
 * `kind` et `preview` traversent tels quels : ce sont exactement les deux
 * choses qu'on fait relire.
 */
export function toCrmWriteRequestView(
  row: OutboundWriteRequestEntity,
  viewerUserId: string,
  /**
   * Le propriétaire, résolu par l'appelant (une jointure sur les profils) —
   * cette fonction reste pure, elle ne lit aucun dépôt. `null` = l'appelant ne
   * l'a pas encore résolu, jamais « inconnu » : `row.requested_by` reste
   * toujours porté comme identifiant.
   */
  owner: { id: string; name: string | null } | null,
  /**
   * #4186.2 — le nom de l'espace CRM visé (`accountLabel` de sa connexion),
   * résolu par l'appelant. Jamais l'éditeur. `null` = non branché ou sans nom.
   */
  destination: string | null = null,
): CrmWriteRequestView {
  const names = targetNamesFromPayload(row.payload ?? {})
  return {
    id: row.id,
    kind: row.kind,
    // FIGÉE : jamais recalculée ici. Un tableau vide reste un tableau vide —
    // l'écran dira « aucun champ n'a été enregistré », ce qui est une
    // information, plutôt que de rendre une carte muette.
    // ⚠️ Le mapping est EXPLICITE champ par champ, et il le reste : recopier la
    // ligne entière (`...line`) laisserait passer vers l'app tout ce que la
    // charge utile gagnerait un jour. `key` et `previous` sont ajoutés
    // NOMMÉMENT (#1498), et une ligne d'avant ce champ n'en a pas — elle se
    // relit très bien, elle ne se révise simplement pas.
    preview: Array.isArray(row.preview)
      ? row.preview.map(line => ({
          field: line.field,
          value: line.value,
          ...(line.key ? { key: line.key } : {}),
          ...(line.previous !== undefined ? { previous: line.previous } : {}),
        }))
      : [],
    origin: row.origin,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    requestedByYou: row.requested_by === viewerUserId,
    // #1943.8 — l'issue d'une validation : écrite, échouée, ou partie sans réponse.
    state: row.state,
    // #2200.10/.11/.12/.17, #2201.21 — l'objet visé, commun aux quatre files.
    target: {
      accountId: null,
      accountName: names.accountName,
      contactId: null,
      contactName: names.contactName,
      ownerId: owner?.id ?? row.requested_by,
      ownerName: owner?.name ?? null,
      // Une écriture CRM n'est pas un envoi : aucun canal ne s'y applique.
      channel: null,
      risk: crmWriteRiskOf(row.kind),
      // #2855 — posée par la porte d'écriture (`OutboundWriteService.request`),
      // jamais recalculée ici : `null` = geste direct, ou provenance non tracée.
      source: row.source ?? null,
    },
    // #2864 — le collègue à qui la demande est confiée (`null` = circuit d'origine).
    assignedTo: row.assigned_to ?? null,
    // #2856 — reportée jusqu'à cette date (`null` = dans la file active).
    snoozedUntil: row.snoozed_until ? row.snoozed_until.toISOString() : null,
    // #2854 (#2201.9) — le lot d'actions en masse, posé par `requestBatch()`.
    // `null` = demande seule, jamais un lot d'un seul élément deviné.
    batchId: row.batch_id ?? null,
    // #4186.2 — vers quel CRM, nommé par l'espace de l'utilisateur.
    destination,
  }
}
