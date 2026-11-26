import { z } from 'zod'
import { orgClaimSchema, orgSourceKindSchema, type OrgClaim } from './org-graph.js'

/* ------------------------------------------------------------------ */
/*  Le ledger de corrections d'organigramme + le verrou optimiste      */
/*  (OrgGraph FINAL du 27/08/2026, §7 « Corriger sans casser la        */
/*  confiance » ; forme détaillée en v3 §7.2 / §8.3 / §8.4 / §10.5)    */
/* ------------------------------------------------------------------ */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt savait déjà ÉCARTER quelqu'un (`org_rejected_items`), DÉCLARER
 * quelqu'un (`org_declared_people`) et VÉRIFIER un lien (`applyRelationVerdict`).
 * Il ne savait pas CORRIGER un champ — changer un titre, une entité, un niveau,
 * un rôle, un N+1 — et il ne savait pas ce qui arrive quand deux commerciaux
 * corrigent la même personne au même moment : la seconde écriture écrasait la
 * première sans que personne ne le sache (*lost update*).
 *
 * Trois exigences, et chacune tient une phrase de la source :
 *
 * 1. **Versionné et réversible** — « Toute correction crée une entrée dans
 *    `org_graph_corrections` » (v3 §10.5). Une entrée porte la version d'AVANT
 *    et celle d'APRÈS, si bien que l'historique se relit dans les deux sens.
 *    Une annulation pose `revertedAt` : la ligne reste. **On archive, on ne
 *    supprime pas.**
 * 2. **Verrou optimiste** — « Toutes les écritures exigent
 *    `expectedGraphVersion` » (v3 §8.3). Ce n'est pas une option de confort :
 *    c'est le champ SANS lequel le schéma refuse la requête.
 * 3. **Une preuve PAR CLAIM** — « Deux claims différents = deux preuves
 *    différentes » (v3 §5.2). La fiche de correction ne porte pas UNE preuve
 *    pour l'ensemble : chaque affirmation porte la sienne, et le schéma REFUSE
 *    qu'une preuve d'identité serve de preuve de relation. C'est la traduction
 *    en contrat du défaut P0 (« LinkedIn connaît la personne » devenait
 *    « LinkedIn dit à qui elle rapporte »).
 *
 * Ce que ce fichier NE fait PAS, et pourquoi : il ne modifie pas le graphe. La
 * mise en œuvre vit dans `apps/api/src/modules/org-graph/org-graph-correction.ts`
 * (fonction pure, re-validée contre `orgGraphSchema`), au même endroit et pour
 * les mêmes raisons que `applyDeclaredPeople` et `applyOrgGraphCorrection`.
 */

/** Les objets du graphe qu'une correction peut viser (v3 §7.2 : `object_type`). */
export const ORG_CORRECTION_OBJECT_TYPES = ['person', 'entity', 'edge'] as const
export const orgCorrectionObjectTypeSchema = z.enum(ORG_CORRECTION_OBJECT_TYPES)
export type OrgCorrectionObjectType = z.infer<typeof orgCorrectionObjectTypeSchema>

/**
 * Les champs corrigibles, par type d'objet.
 *
 * Les cinq de `person` sont EXACTEMENT ceux du tiroir de correction de la
 * source : « 5 champs : titre, entité, niveau, rôles, N+1 — chacun avec source
 * obligatoire » (v3 §10.4). Les autres suivent la même logique pour les deux
 * autres objets que le ledger sait porter.
 *
 * ⚠️ Un champ appartient à UN SEUL type d'objet — c'est ce qui permet à la
 * colonne `field` du ledger de rester un simple `text` sans ambiguïté, et au
 * schéma de refuser « corriger le `title` d'un lien ».
 *
 * `presence` mérite son mot : c'est le champ qui porte l'AJOUT et le RETRAIT
 * d'un lien (`'present'` / `'absent'`). Un ajout et un retrait sont deux
 * corrections symétriques du même champ, ce qui les rend réversibles par le
 * MÊME chemin que les autres — plutôt que deux opérations spéciales dont
 * l'annulation serait un troisième cas.
 */
export const ORG_CORRECTION_FIELDS_BY_OBJECT = {
  person: ['title', 'entityId', 'hierarchyLevel', 'decisionRoles', 'reportsTo'],
  entity: ['name', 'parentId'],
  edge: ['type', 'verified', 'presence'],
} as const satisfies Record<OrgCorrectionObjectType, readonly string[]>

/** L'énumération à plat — l'ordre est figé (GA-08), les ajouts vont en FIN. */
export const ORG_CORRECTION_FIELDS = [
  'title',
  'entityId',
  'hierarchyLevel',
  'decisionRoles',
  'reportsTo',
  'name',
  'parentId',
  'type',
  'verified',
  'presence',
] as const
export const orgCorrectionFieldSchema = z.enum(ORG_CORRECTION_FIELDS)
export type OrgCorrectionField = z.infer<typeof orgCorrectionFieldSchema>

/**
 * **La preuve qu'exige chaque champ.** C'est le cœur du « une preuve par claim ».
 *
 * Une page qui prouve un TITRE ne prouve pas un RATTACHEMENT, et un profil qui
 * prouve une IDENTITÉ ne prouve aucune RELATION. La table dit, pour chaque
 * champ, de quoi la preuve doit parler — et le schéma en fait un refus, pas une
 * recommandation.
 */
export const ORG_CORRECTION_CLAIM_BY_FIELD = {
  title: 'title',
  entityId: 'membership',
  hierarchyLevel: 'level',
  decisionRoles: 'roles',
  reportsTo: 'relation',
  name: 'identity',
  parentId: 'membership',
  type: 'relation',
  verified: 'relation',
  presence: 'relation',
} as const satisfies Record<OrgCorrectionField, OrgClaim>

/**
 * Une preuve, telle qu'un humain la pose dans le tiroir de correction.
 *
 * `claim` est OBLIGATOIRE ici — contrairement à `orgSourceSchema`, où il reste
 * facultatif par rétrocompatibilité avec les graphes déjà stockés. Une preuve
 * qu'on saisit AUJOURD'HUI n'a aucune excuse de ne pas dire ce qu'elle prouve.
 */
export const orgCorrectionEvidenceSchema = z.object({
  kind: orgSourceKindSchema,
  /** URL, citation, référence de registre. */
  ref: z.string().min(1).max(500).optional(),
  /** ISO — la date de la PREUVE, pas celle de la saisie. Provenance = source ET date. */
  date: z.string().max(40).optional(),
  claim: orgClaimSchema,
})
export type OrgCorrectionEvidence = z.infer<typeof orgCorrectionEvidenceSchema>

/**
 * La valeur d'un champ corrigé.
 *
 * `null` veut dire « cette information n'est pas connue » — jamais `0`, jamais
 * la chaîne vide. C'est la traduction dans ce contrat de « non mesuré n'est
 * jamais mesuré à zéro » : effacer un titre qu'on sait faux rend la personne
 * SANS titre connu, ce qui est une information vraie.
 */
export const orgCorrectionValueSchema = z.union([
  z.string().max(400),
  z.boolean(),
  z.array(z.string().max(80)).max(8),
  z.null(),
])
export type OrgCorrectionValue = z.infer<typeof orgCorrectionValueSchema>

/**
 * UNE affirmation, avec SA preuve et SA raison.
 *
 * Un tiroir qui corrige le titre ET le N+1 envoie deux claims, chacun avec sa
 * propre preuve. C'est précisément ce que « pas une preuve globale » veut dire.
 */
export const orgCorrectionClaimSchema = z
  .object({
    field: orgCorrectionFieldSchema,
    value: orgCorrectionValueSchema,
    /** Écrite par la personne. Une correction sans raison n'est pas une correction. */
    reason: z.string().min(1).max(500),
    evidence: orgCorrectionEvidenceSchema,
  })
  .superRefine((claim, ctx) => {
    const required = ORG_CORRECTION_CLAIM_BY_FIELD[claim.field]
    if (claim.evidence.claim !== required) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidence', 'claim'],
        message:
          `corriger « ${claim.field} » exige une preuve qui porte sur « ${required} », ` +
          `pas sur « ${claim.evidence.claim} » — deux claims différents exigent deux preuves différentes`,
      })
    }
  })
export type OrgCorrectionClaim = z.infer<typeof orgCorrectionClaimSchema>

/**
 * #2126.26-.30 / .36 — le MOTIF d'une correction, catégorisé.
 *
 * « Corriger » ne suffit pas à dire ce qu'un humain sait d'un fait : il peut le
 * CONFIRMER, le déclarer OBSOLÈTE, PAS PERTINENT, dire qu'il NE SAIT PAS, ou
 * AJOUTER UNE SOURCE sans rien changer. Un texte libre ne se relit pas en lot ;
 * un motif fermé, si. Les ajouts vont en FIN (GA-08) et la contrainte SQL
 * `org_graph_corrections_motive_check` est élargie AVANT (GA-11 / GA-12).
 */
export const ORG_CORRECTION_MOTIVES = [
  'corrected',
  'confirmed',
  'obsolete',
  'not_relevant',
  'unknown',
  'source_added',
] as const
export const orgCorrectionMotiveSchema = z.enum(ORG_CORRECTION_MOTIVES)
export type OrgCorrectionMotive = z.infer<typeof orgCorrectionMotiveSchema>

/**
 * #2126.37 / .40-.42 — la PORTÉE d'une correction.
 *
 * ⚠️ « Équipe / BU » (#2126.43) n'y est PAS : aucune source du dépôt ne porte
 * une BU (constat #2118.9). Une portée qu'on ne sait pas résoudre en personnes
 * promettrait une confidentialité qu'aucune requête ne tiendrait — à trancher.
 */
export const ORG_CORRECTION_SCOPES = ['personal', 'workspace', 'account'] as const
export const orgCorrectionScopeSchema = z.enum(ORG_CORRECTION_SCOPES)
export type OrgCorrectionScope = z.infer<typeof orgCorrectionScopeSchema>

/** #2126.39 — qui peut LIRE la correction. Dérivée de la portée, jamais choisie à part. */
export const ORG_CORRECTION_VISIBILITIES = ['private', 'workspace'] as const
export const orgCorrectionVisibilitySchema = z.enum(ORG_CORRECTION_VISIBILITIES)
export type OrgCorrectionVisibility = z.infer<typeof orgCorrectionVisibilitySchema>

export function orgCorrectionVisibilityFor(scope: OrgCorrectionScope): OrgCorrectionVisibility {
  return scope === 'personal' ? 'private' : 'workspace'
}

/**
 * #2126.44 — la correction RÉÉCRIT-elle le graphe partagé ?
 *
 * Seuls « corriger » et « obsolète » changent une valeur ; les autres motifs
 * déposent une ligne au ledger SANS toucher au graphe ni à sa version. Une
 * correction PERSONNELLE ne le réécrit jamais, quel que soit son motif : c'est
 * l'absence de chemin, pas une convention.
 */
export function orgCorrectionChangesSharedGraph(entry: {
  motive: OrgCorrectionMotive
  scope: OrgCorrectionScope
}): boolean {
  return entry.scope !== 'personal' && (entry.motive === 'corrected' || entry.motive === 'obsolete')
}

/**
 * La correction PROTÈGE-t-elle son champ contre le run suivant (« une correction
 * humaine gagne toujours ») ? Oui pour ce qui réécrit, et pour « confirmer » —
 * un fait qu'un humain a confirmé ne se fait pas écraser par une inférence.
 * Jamais pour une correction personnelle.
 */
export function orgCorrectionHoldsField(entry: { motive: OrgCorrectionMotive; scope: OrgCorrectionScope }): boolean {
  return orgCorrectionChangesSharedGraph(entry) || (entry.scope !== 'personal' && entry.motive === 'confirmed')
}

/**
 * Ce qu'un écran envoie pour corriger l'organigramme.
 *
 * ⚠️ `expectedGraphVersion` n'est pas optionnel, et ce n'est pas un détail de
 * forme : c'est LE champ qui empêche un *lost update*. Une requête qui l'omet
 * est refusée par le schéma, avant d'atteindre la base — il n'existe donc aucun
 * chemin d'écriture sans verrou.
 *
 * `userId` et `createdAt` ne sont PAS dans la requête : ils sont posés par le
 * serveur, exactement comme pour `declareOrgPeopleRequestSchema`. Un auteur
 * choisi par l'appelant n'est pas un auteur.
 */
export const orgCorrectionRequestSchema = z
  .object({
    /** La version que l'écran CROIT être la version courante du graphe. */
    expectedGraphVersion: z.number().int().min(1),
    objectType: orgCorrectionObjectTypeSchema,
    /** Toujours un id — jamais un nom. Deux homonymes ne se corrigent pas ensemble (S5). */
    objectId: z.string().min(1).max(200),
    claims: z.array(orgCorrectionClaimSchema).min(1).max(10),
    /** #2126.36 — absent = « corriger », la seule chose que l'écran savait dire avant. */
    motive: orgCorrectionMotiveSchema.default('corrected'),
    /** #2126.37 — absent = « compte » : le graphe de CE dossier, lu par l'espace. */
    scope: orgCorrectionScopeSchema.default('account'),
  })
  .superRefine((request, ctx) => {
    // #2126.27 — un fait obsolète REDEVIENT INCONNU. Une valeur envoyée sous ce
    // motif serait une correction déguisée, sans le dire.
    if (request.motive === 'obsolete') {
      request.claims.forEach((claim, index) => {
        const empty = claim.value === null || (Array.isArray(claim.value) && claim.value.length === 0)
        if (!empty) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['claims', index, 'value'],
            message: '« obsolète » rend le fait inconnu : la valeur doit être null',
          })
        }
      })
    }
    const allowed: readonly string[] = ORG_CORRECTION_FIELDS_BY_OBJECT[request.objectType]
    request.claims.forEach((claim, index) => {
      if (!allowed.includes(claim.field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['claims', index, 'field'],
          message: `« ${claim.field} » n'est pas un champ de « ${request.objectType} »`,
        })
      }
    })
    // Deux claims sur le MÊME champ dans une seule requête : la seconde
    // écraserait la première dans la même version, et le ledger porterait deux
    // lignes contradictoires. C'est un bug d'écran, pas une intention.
    const fields = request.claims.map(c => c.field)
    if (new Set(fields).size !== fields.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['claims'],
        message: 'deux corrections du même champ dans une seule requête',
      })
    }
  })
export type OrgCorrectionRequest = z.infer<typeof orgCorrectionRequestSchema>

/** Annuler une correction — sous le MÊME verrou que la poser (v3 §8.3). */
export const orgCorrectionRevertRequestSchema = z.object({
  expectedGraphVersion: z.number().int().min(1),
})
export type OrgCorrectionRevertRequest = z.infer<typeof orgCorrectionRevertRequestSchema>

/**
 * Une ligne du ledger. Miroir EXACT de la table `org_graph_corrections`.
 *
 * `revertedAt` est une pierre tombale : la ligne annulée reste, avec sa raison
 * et sa preuve. Une correction erronée doit rester lisible — sinon on ne peut
 * pas expliquer pourquoi le graphe a dit autre chose pendant trois semaines.
 */
export const orgGraphCorrectionSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    accountId: z.string(),
    graphVersionBefore: z.number().int().min(1),
    graphVersionAfter: z.number().int().min(1),
    objectType: orgCorrectionObjectTypeSchema,
    objectId: z.string(),
    field: orgCorrectionFieldSchema,
    /** La valeur d'avant. `null` = elle n'existait pas — pas « on ne l'a pas lue ». */
    oldValue: orgCorrectionValueSchema,
    newValue: orgCorrectionValueSchema,
    reason: z.string(),
    evidence: orgCorrectionEvidenceSchema,
    userId: z.string(),
    createdAt: z.string(),
    revertedAt: z.string().nullable().default(null),
    motive: orgCorrectionMotiveSchema.default('corrected'),
    scope: orgCorrectionScopeSchema.default('account'),
    visibility: orgCorrectionVisibilitySchema.default('workspace'),
  })
  .superRefine((entry, ctx) => {
    // #2126.44 — ce qui réécrit le graphe AVANCE sa version ; ce qui ne fait que
    // déposer une ligne (confirmer, personnel…) la laisse où elle est.
    if (orgCorrectionChangesSharedGraph(entry)) {
      if (entry.graphVersionAfter <= entry.graphVersionBefore) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['graphVersionAfter'],
          message: 'une correction fait AVANCER la version du graphe',
        })
      }
    } else if (entry.graphVersionAfter !== entry.graphVersionBefore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['graphVersionAfter'],
        message: 'une ligne qui ne réécrit pas le graphe ne fait pas avancer sa version',
      })
    }
    if (entry.visibility !== orgCorrectionVisibilityFor(entry.scope)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['visibility'],
        message: 'la visibilité suit la portée : personnel = privé',
      })
    }
  })
export type OrgGraphCorrection = z.infer<typeof orgGraphCorrectionSchema>

/**
 * Ce qui s'est intercalé entre la version qu'on croyait et celle qui est là.
 *
 * `by` est le nom de la personne, ou `null` quand on ne le connaît pas — jamais
 * un « quelqu'un » présenté comme un nom, jamais un identifiant technique
 * affiché à la place d'un humain.
 */
export const orgGraphInterveningCorrectionSchema = z.object({
  objectType: orgCorrectionObjectTypeSchema,
  objectId: z.string(),
  field: orgCorrectionFieldSchema,
  by: z.string().nullable(),
  at: z.string(),
})
export type OrgGraphInterveningCorrection = z.infer<typeof orgGraphInterveningCorrectionSchema>

/**
 * Le 409 (v3 §8.4).
 *
 * « L'UI affiche une modale "modification plus récente disponible", jamais un
 * lost update silencieux. » Le corps porte les deux versions ET le détail de ce
 * qui s'est intercalé — un résumé seul ne permet pas de décider s'il faut
 * réappliquer sa correction ou l'abandonner.
 */
export const orgGraphConflictSchema = z
  .object({
    error: z.literal('graph_version_mismatch'),
    yours: z.number().int().min(1),
    current: z.number().int().min(1),
    diffSummary: z.string(),
    intervening: z.array(orgGraphInterveningCorrectionSchema).default([]),
  })
  .superRefine((conflict, ctx) => {
    if (conflict.current <= conflict.yours) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['current'],
        message: 'un conflit de version suppose que la base est EN AVANCE sur l’appelant',
      })
    }
  })
export type OrgGraphConflict = z.infer<typeof orgGraphConflictSchema>

/** Le compte-rendu d'une correction acceptée. */
export const orgCorrectionResponseSchema = z.object({
  graphVersion: z.number().int().min(1),
  /** Les entrées de ledger produites — une par claim. */
  corrections: z.array(orgGraphCorrectionSchema).default([]),
  /** `false` = le ledger est écrit mais le dossier n'a pas encore de graphe où
   *  appliquer la correction. Elle s'appliquera au premier graphe produit. */
  applied: z.boolean(),
})
export type OrgCorrectionResponse = z.infer<typeof orgCorrectionResponseSchema>
