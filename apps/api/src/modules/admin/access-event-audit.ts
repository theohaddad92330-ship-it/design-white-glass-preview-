import type { BackofficeAccessEntry, BackofficeAccessEvent, BackofficeAuditEntry } from '@bellum/contracts'

/**
 * COMMENT UNE ENTRÉE D'ACCÈS DEVIENT UNE LIGNE DU JOURNAL UNIQUE (#1666).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MIROIR EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * #1666 demande « un journal unique, toutes opérations du manager confondues ».
 * Entrer dans la console, s'en voir refuser l'entrée, poser un second facteur :
 * ce sont des OPÉRATIONS du back-office. Un journal « unique » qui ne les
 * contiendrait pas serait un titre, pas un fait — et il faudrait ouvrir deux
 * écrans pour reconstituer une soirée.
 *
 * ⚠️ CE N'EST PAS UNE FUSION DES DEUX JOURNAUX. `backoffice_access_events`
 * reste, et pour deux raisons mesurables : il COMPTE les échecs d'une adresse
 * sur une fenêtre (l'alerte de #1671.3, qui a besoin de son index), et sa
 * rétention est de douze mois — plus courte que les vingt-quatre du journal
 * unique. Fusionner imposerait la plus longue à des données qui n'en ont pas
 * besoin. Le miroir coûte une ligne de plus ; il achète un journal qui ne ment
 * pas sur son adjectif.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS MIROITÉ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * `email_revele` a son PROPRE écrivain, direct, dans
 * `apps/dashboard-manager/src/app/api/admin/email-reveal/route.ts` : il porte
 * l'écran d'où vient le clic et la forme masquée de l'adresse, ce que le journal
 * d'accès ne transporte pas. Le miroiter AUSSI produirait deux lignes pour un
 * seul clic — et deux lignes pour un fait, dans un journal d'audit, c'est
 * exactement ce qui apprend à ne plus le croire.
 */

/** Ce que chaque événement d'accès devient. `null` ⇒ pas de miroir. */
type AuditShape = {
  operation: string
  category: BackofficeAuditEntry['category']
  outcome: BackofficeAuditEntry['outcome']
} | null

/**
 * ⚠️ LA CATÉGORIE DÉCIDE DE LA RÉTENTION, elle ne décore rien.
 *
 * Un REFUS n'est pas un CHANGEMENT de permission : l'issue range en 36 mois
 * « les changements de permission », c'est-à-dire ce qui modifie durablement ce
 * que quelqu'un a le droit de faire. Se voir refuser un geste ne modifie rien —
 * c'est une action ordinaire dont le RÉSULTAT est `refus`, et c'est le champ
 * `outcome` qui le porte. Les ranger en `permission` gonflerait de trois ans la
 * conservation de la ligne la plus banale de la console.
 *
 * `enrolement_confirme` fait exception, et c'est le seul : poser un second
 * facteur change DURABLEMENT qui peut entrer avec ce compte. C'est un
 * changement de permission au sens le plus littéral, et il se garde 36 mois.
 */
const MIRROR: Record<BackofficeAccessEvent, AuditShape> = {
  connexion: { operation: 'backoffice.connexion', category: 'ordinaire', outcome: 'succes' },
  connexion_refusee: { operation: 'backoffice.connexion', category: 'ordinaire', outcome: 'refus' },
  acces_refuse: { operation: 'backoffice.acces', category: 'ordinaire', outcome: 'refus' },
  deconnexion: { operation: 'backoffice.deconnexion', category: 'ordinaire', outcome: 'succes' },
  enrolement_demarre: { operation: 'backoffice.enrolement', category: 'ordinaire', outcome: 'succes' },
  enrolement_confirme: { operation: 'backoffice.enrolement_confirme', category: 'permission', outcome: 'succes' },
  enrolement_refuse: { operation: 'backoffice.enrolement', category: 'ordinaire', outcome: 'refus' },
  capacite_refusee: { operation: 'backoffice.capacite', category: 'ordinaire', outcome: 'refus' },
  // Son propre écrivain, plus riche — voir le docblock de tête.
  email_revele: null,
}

/**
 * L'entrée d'audit correspondante, ou `null` quand l'événement a son propre
 * écrivain.
 *
 * ⚠️ `detail` du journal d'accès porte un DIAGNOSTIC technique (code Supabase,
 * statut) et il voyage tel quel : c'est une note courte écrite par notre code,
 * pas une charge utile de requête. La règle « aucune charge utile brute » est
 * respectée parce que rien, sur ce chemin, ne recopie un corps de requête.
 */
export function auditEntryForAccess(entry: BackofficeAccessEntry): BackofficeAuditEntry | null {
  const shape = MIRROR[entry.event]
  if (!shape) return null
  return {
    operation: shape.operation,
    category: shape.category,
    outcome: shape.outcome,
    actorEmail: entry.actorEmail ?? null,
    actorRole: entry.actorRole ?? null,
    subjectType: 'backoffice',
    // ⚠️ Le sujet d'un refus de capacité est LA CAPACITÉ demandée, que le
    // journal d'accès range dans `target`. Sans elle, la ligne dirait « un geste
    // a été refusé » sans jamais dire lequel.
    subjectId: entry.target ?? null,
    subjectLabel: null,
    statusCode: null,
    // La raison du refus (`hors_liste`, `identifiants_refuses`…) est ce qui rend
    // la ligne lisible ; le diagnostic technique la complète quand il existe.
    detail: [entry.reason, entry.detail].filter(Boolean).join(' · ').slice(0, 500) || null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    country: entry.country ?? null,
  }
}
