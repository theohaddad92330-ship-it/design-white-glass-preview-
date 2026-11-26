import { z } from 'zod'
import { TABLE_SCOPES, type TableScope } from './table-scopes.js'

/**
 * LA RÉVERSIBILITÉ AFFICHÉE — PDF 7 §9.2, ticket `BEL-INT-608` PR1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EXIGENCE, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Problème : la réversibilité existe mais reste une clause. Personne ne la
 * voit, donc personne ne la valorise. »
 * « La section "CE QUE VOUS N'EMPORTEZ PAS" est OBLIGATOIRE, avec sa raison en
 * une ligne. »
 * « Et la section "ce que vous n'emportez pas" est honnête : elle dit pourquoi,
 * en une ligne. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EST DÉRIVÉE ET NON RÉDIGÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois puces écrites une fois dans un JSX vieillissent au premier objet
 * ajouté, et personne ne s'en aperçoit : rien ne casse, la page reste jolie, et
 * elle ment. Or c'est précisément une page qu'on montre à un dirigeant pour
 * qu'il confie son CRM.
 *
 * La section se calcule donc à partir de {@link TABLE_SCOPES} — le registre qui
 * classe DÉJÀ chaque table du dépôt, tenu par GA-65 — moins ce que l'export
 * produit réellement. Ajouter une table partagée la fait apparaître ici sans
 * qu'on y touche ; brancher une table dans l'export l'en fait sortir de même.
 */

/**
 * Les formats d'un export d'objet. `csv` pour Excel, `json` pour un import
 * ailleurs — la source demande les DEUX, et pour une bonne raison : un CSV perd
 * les structures imbriquées, un JSON ne s'ouvre pas dans un tableur.
 */
export const PORTABLE_FORMATS = ['csv', 'json'] as const
export type PortableFormat = (typeof PORTABLE_FORMATS)[number]

/**
 * #2439.2 — SIX NIVEAUX NOMMÉS, DE PUBLIC À TECHNIQUE.
 *
 * Le catalogue disait déjà QUI possède un objet ({@link PortableObject.perimeter}) ;
 * il ne disait pas à quel point il faut le manier avec soin. Six niveaux fixes,
 * jamais une échelle continue qu'on affinerait sans fin :
 *
 * - `public` — rien ici aujourd'hui, réservé au jour où un objet le devient.
 * - `interne` — la vie de l'espace (activité, usage), sans valeur commerciale
 *   ni personnelle si elle fuit.
 * - `confidentiel` — la valeur commerciale de l'espace (comptes, documents).
 * - `personnel` — identifie une personne nommée (RGPD, sans catégorie
 *   spéciale) : identité, contacts, talents.
 * - `sensible` — personnel ET à fort impact si mal exposé (facturation,
 *   numéro de téléphone de sécurité).
 * - `technique` — métadonnées d'infrastructure (sessions, appareils), jamais
 *   lues pour ce qu'elles racontent d'une personne.
 *
 * DÉCLARÉ sur chaque objet, jamais dérivé — même défaut que `perimeter` :
 * une valeur juste par accident reste fausse.
 */
export const DATA_CLASSIFICATION_LEVELS = [
  'public',
  'interne',
  'confidentiel',
  'personnel',
  'sensible',
  'technique',
] as const
export type DataClassificationLevel = (typeof DATA_CLASSIFICATION_LEVELS)[number]

/**
 * Un objet que l'utilisateur emporte.
 *
 * `payloadKey` est la clé de la charge utile rendue par `GET /privacy/export` :
 * c'est ce qui relie cette déclaration à du code qui s'exécute plutôt qu'à une
 * intention. La garde GA-245 vérifie que la clé existe VRAIMENT dans ce que le
 * service construit — sans quoi l'écran promettrait un objet vide.
 */
export type PortableObject = {
  /** Clé i18n du libellé, côté `exports`. */
  labelKey: string
  payloadKey: string
  /** Les tables que cet objet emporte. Elles doivent être `scoped`. */
  tables: readonly string[]
  /**
   * À QUI cet objet appartient, pour l'écran « Données & exports » (#1520).
   *
   * ⚠️ **DÉCLARÉ, jamais dérivé.** La première version le déduisait de
   * `TABLE_SCOPES` — et ce registre ne contient QUE les trente tables dont
   * l'appartenance ne se lit sur aucune colonne. Aucune des dix tables
   * exportables n'y figure : la « dérivation » retombait donc dix fois sur
   * dix sur son défaut prudent, et l'écran affichait un seul groupe en
   * prétendant l'avoir calculé. Une valeur juste par accident reste fausse.
   *
   * LA RÈGLE, lue sur les entités : une table qui n'a QUE `user_id` appartient
   * à la personne ; dès qu'elle porte un `workspace_id`, c'est l'espace qui la
   * possède et `user_id` n'y désigne que l'auteur. Servir « personnel » sur une
   * table d'espace remettrait à un membre le travail de ses collègues.
   */
  perimeter: 'personal' | 'workspace'
  formats: readonly PortableFormat[]
  /** #2439.2 — voir {@link DATA_CLASSIFICATION_LEVELS}. */
  classification: DataClassificationLevel
  /**
   * #2439.1 / #2439.3 — POURQUOI cet objet existe, clé i18n côté `exports`.
   * DÉCLARÉE, jamais dérivée du nom de la table : deux objets qui partagent une
   * table pourraient servir des finalités différentes.
   */
  purposeKey: string
  /**
   * #2439.1 / #2439.3 — COMBIEN DE TEMPS *cet* objet reste, par opposition à
   * `PrivacyRetentionService.getRetentionPolicy()` qui documente la politique
   * GLOBALE (audio, log, sauvegarde…). Une clé i18n, pas une durée : la durée
   * réelle vit dans la politique globale ou dans une règle propre à l'objet
   * (ex. la facturation suit une obligation comptable, pas un réglage produit).
   */
  retentionKey: string
  /**
   * #2439.1 / #2439.3 — D'OÙ vient la donnée : saisie par la personne, déposée
   * par elle, ou calculée par Bellum à partir d'une action de l'espace. Répond
   * à la question que la classification et le périmètre laissaient ouverte.
   */
  provenanceKey: string
  /**
   * #2439.3 (8e attribut) — CE QUI ARRIVE À CET OBJET si tu supprimes ton
   * compte. Distincte de `retentionKey` (la durée en fonctionnement normal) :
   * la question posée ici est « qu'est-ce que la suppression DE MON COMPTE lui
   * fait », pas « combien de temps vit-elle d'habitude ».
   *
   * ⚠️ DÉCLARÉE depuis les quatre issues réelles de `PrivacyDeletionService`
   * (`anonymized`/`deleted`/`retained`/`sessionsRevoked`), jamais devinée — un
   * objet hors des quatre (ex. `esn_profiles`, qui n'appartient pas à la
   * personne qui supprime son compte) le dit aussi. Un petit vocabulaire
   * PARTAGÉ, comme `provenanceKey` : plusieurs objets passant par le même
   * mécanisme du service partagent légitimement la même clé.
   */
  deletionKey: string
}

/**
 * LES OBJETS EXPORTABLES, dans l'ordre où l'écran les montre.
 *
 * ⚠️ La liste suit ce que `PrivacyExportService.buildExport` produit RÉELLEMENT
 * — jamais ce qu'on aimerait qu'elle produise. La source dessine sept familles,
 * dont « Projets et besoins » et « Missions, relevés, facturation » : elles ne
 * sont pas ici parce que l'export est PERSONNEL (RGPD art. 15 & 20, borné à
 * `user_id`) et que ces objets appartiennent à l'ESPACE. Les servir à un
 * membre lui remettrait le travail de ses collègues. Elles apparaissent donc
 * dans « ce que vous n'emportez pas », avec leur raison — ce qui est
 * exactement le rôle de cette section, et la seule réponse honnête tant que
 * l'export d'espace n'existe pas.
 */
export const PORTABLE_OBJECTS: readonly PortableObject[] = [
  {
    labelKey: 'objects.identity',
    payloadKey: 'profile',
    tables: ['profiles'],
    perimeter: 'personal',
    classification: 'personnel',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.profile',
    retentionKey: 'retention.profile',
    provenanceKey: 'provenance.declaredByYou',
    deletionKey: 'deletionReason.anonymizedOnErasure',
  },
  {
    labelKey: 'objects.esnProfile',
    payloadKey: 'esnProfiles',
    tables: ['esn_profiles'],
    perimeter: 'workspace',
    classification: 'interne',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.esnProfile',
    retentionKey: 'retention.esnProfile',
    provenanceKey: 'provenance.declaredByYourTeam',
    deletionKey: 'deletionReason.untouchedWorkspaceOwned',
  },
  {
    labelKey: 'objects.accounts',
    payloadKey: 'accounts',
    tables: ['accounts'],
    perimeter: 'workspace',
    classification: 'confidentiel',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.accounts',
    retentionKey: 'retention.accounts',
    provenanceKey: 'provenance.researchedByYourTeam',
    deletionKey: 'deletionReason.retainedNonNominative',
  },
  {
    labelKey: 'objects.contacts',
    payloadKey: 'contacts',
    tables: ['contacts'],
    perimeter: 'workspace',
    classification: 'personnel',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.contacts',
    retentionKey: 'retention.contacts',
    provenanceKey: 'provenance.collectedOrImported',
    deletionKey: 'deletionReason.anonymizedOnErasure',
  },
  {
    labelKey: 'objects.talents',
    payloadKey: 'consultants',
    tables: ['consultants'],
    perimeter: 'workspace',
    classification: 'personnel',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.talents',
    retentionKey: 'retention.talents',
    provenanceKey: 'provenance.declaredByYourTeam',
    deletionKey: 'deletionReason.anonymizedOnErasure',
  },
  {
    labelKey: 'objects.documents',
    payloadKey: 'ragDocuments',
    tables: ['rag_documents'],
    perimeter: 'workspace',
    classification: 'confidentiel',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.documents',
    retentionKey: 'retention.documents',
    provenanceKey: 'provenance.uploadedByYourTeam',
    deletionKey: 'deletionReason.anonymizedOnErasure',
  },
  {
    labelKey: 'objects.actions',
    payloadKey: 'actions',
    tables: ['user_actions'],
    perimeter: 'workspace',
    classification: 'interne',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.actions',
    retentionKey: 'retention.actions',
    provenanceKey: 'provenance.loggedByYourTeam',
    deletionKey: 'deletionReason.retainedPseudonymized',
  },
  {
    labelKey: 'objects.billing',
    payloadKey: 'subscription',
    tables: ['subscriptions'],
    perimeter: 'personal',
    classification: 'sensible',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.billing',
    retentionKey: 'retention.billing',
    provenanceKey: 'provenance.computedByBellum',
    deletionKey: 'deletionReason.retainedForAccounting',
  },
  {
    labelKey: 'objects.credits',
    payloadKey: 'creditLedger',
    tables: ['credit_ledger'],
    perimeter: 'workspace',
    classification: 'interne',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.credits',
    retentionKey: 'retention.credits',
    provenanceKey: 'provenance.computedByBellum',
    deletionKey: 'deletionReason.retainedPseudonymized',
  },
  {
    labelKey: 'objects.devices',
    payloadKey: 'sessions',
    tables: ['user_sessions'],
    perimeter: 'personal',
    classification: 'technique',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.devices',
    retentionKey: 'retention.devices',
    provenanceKey: 'provenance.observedByBellum',
    deletionKey: 'deletionReason.revokedOnErasure',
  },
  // #1938.4 — décision Louis 13/09 batch 13 : le numéro de mobile saisi pour
  // les alertes urgentes par SMS, sa vérification et les types choisis. Une
  // donnée PERSONNELLE (la table n'a que `user_id`) — le code de vérification
  // en attente n'en fait pas partie : c'est un secret, pas une donnée de la
  // personne, et `PrivacyExportService` ne le lit pas.
  {
    labelKey: 'objects.smsChannel',
    payloadKey: 'smsChannel',
    tables: ['notification_sms_channels'],
    perimeter: 'personal',
    classification: 'sensible',
    formats: PORTABLE_FORMATS,
    purposeKey: 'purpose.smsChannel',
    retentionKey: 'retention.smsChannel',
    provenanceKey: 'provenance.declaredByYou',
    deletionKey: 'deletionReason.deletedOnErasure',
  },
]

/** Les tables que l'export produit — dérivées des objets, jamais retapées. */
export function portableTables(): string[] {
  return PORTABLE_OBJECTS.flatMap(object => [...object.tables])
}

/**
 * Les quatre familles de ce qu'on n'emporte pas. Chacune a UNE raison, et cette
 * raison tient en une ligne — c'est l'exigence de la source.
 */
export const WITHHELD_KINDS = ['shared_market', 'shared_operator', 'workspace_owned', 'unclassified'] as const
export type WithheldKind = (typeof WITHHELD_KINDS)[number]

/** La raison de chaque famille, par clé i18n. Un seul endroit (GA-26). */
const WITHHELD_REASON_KEYS: Readonly<Record<WithheldKind, string>> = {
  shared_market: 'withheld.sharedMarket',
  shared_operator: 'withheld.sharedOperator',
  workspace_owned: 'withheld.workspaceOwned',
  unclassified: 'withheld.unclassified',
}

export const withheldGroupSchema = z.object({
  kind: z.enum(WITHHELD_KINDS),
  reasonKey: z.string().min(1),
  /** Les tables concernées, triées. L'écran en montre le NOMBRE, pas la liste :
   *  un nom de table n'apprend rien à un dirigeant, un compte si. */
  tables: z.array(z.string()).min(1),
})
export type WithheldGroup = z.infer<typeof withheldGroupSchema>

/**
 * CE QUE VOUS N'EMPORTEZ PAS — calculé, jamais rédigé.
 *
 * `scopes` par défaut est le registre du dépôt ; `exported` par défaut ce que
 * {@link PORTABLE_OBJECTS} emporte. Les deux sont injectables pour que la garde
 * puisse casser volontairement la dérivation et vérifier qu'elle sait dire non.
 *
 * ⚠️ Un groupe VIDE n'est pas rendu. Une section qui annonce « 0 table » de
 * quelque chose ne dit rien à personne, et ferait clignoter une page dont tout
 * l'intérêt est d'être calme et lisible.
 */
export function withheldFromExport(
  scopes: Record<string, TableScope> = TABLE_SCOPES,
  exported: ReadonlySet<string> = new Set(portableTables()),
): WithheldGroup[] {
  const buckets: Record<WithheldKind, string[]> = {
    shared_market: [],
    shared_operator: [],
    workspace_owned: [],
    unclassified: [],
  }

  for (const [table, scope] of Object.entries(scopes)) {
    if (exported.has(table)) continue
    if (scope.category === 'shared') {
      buckets[scope.audience === 'market' ? 'shared_market' : 'shared_operator'].push(table)
      continue
    }
    if (scope.category === 'to-classify') {
      buckets.unclassified.push(table)
      continue
    }
    // `scoped` et non exportée : c'est la donnée de l'ESPACE, ou d'un objet que
    // l'export personnel ne porte pas encore. Dans les deux cas la réponse est
    // la même — elle ne part pas dans une copie personnelle.
    buckets.workspace_owned.push(table)
  }

  return WITHHELD_KINDS.filter(kind => buckets[kind].length > 0).map(kind => ({
    kind,
    reasonKey: WITHHELD_REASON_KEYS[kind],
    tables: buckets[kind].sort(),
  }))
}

/** Ce que `GET /privacy/portability` rend à l'écran. */
export const portabilityManifestSchema = z.object({
  objects: z.array(
    z.object({
      labelKey: z.string().min(1),
      payloadKey: z.string().min(1),
      formats: z.array(z.enum(PORTABLE_FORMATS)).min(1),
      /**
       * Le nombre de lignes que CET utilisateur emporte.
       *
       * `null` = non compté (la lecture a échoué), JAMAIS 0 : un « 0 contact »
       * sur un carnet de 3 890 lignes ferait croire qu'il n'y a rien à emporter,
       * et c'est exactement le message qu'une page de réversibilité ne peut pas
       * se permettre de rendre faux.
       */
      rows: z.number().int().nonnegative().nullable(),
    }),
  ),
  withheld: z.array(withheldGroupSchema),
  /** Dernier export réussi, RFC 3339. `null` = jamais — et c'est une réponse. */
  lastExportedAt: z.string().nullable(),
  /** Le délai de suppression complète, en jours. Réglage à un seul endroit. */
  deletionDelayDays: z.number().int().positive(),
})
export type PortabilityManifest = z.infer<typeof portabilityManifestSchema>
