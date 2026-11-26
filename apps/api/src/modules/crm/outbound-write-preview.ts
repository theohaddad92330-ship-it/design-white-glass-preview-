/**
 * La prévisualisation d'une écriture CRM — pure, testée, et FIGÉE (BEL-INT-603).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES, DEUX ACCIDENTS
 * ─────────────────────────────────────────────────────────────────────────────
 * **Champ par champ, jamais un résumé.** « Exporter Théo Martin vers le CRM » ne
 * dit pas si le téléphone va écraser celui qui s'y trouve. Le PDF l'exige
 * explicitement, et c'est le genre de perte que personne ne remarque avant
 * qu'un commercial appelle un numéro périmé.
 *
 * **Une valeur absente est NOMMÉE comme absente.** « TJM : non renseigné » et
 * une ligne vide ne se lisent pas pareil : la seconde se lit comme un bug
 * d'affichage, et on la survole. C'est déjà la règle de la prévisualisation ERP,
 * et elle vaut ici pour la même raison.
 */

export const MISSING = 'non renseigné'

/** Les écritures CRM que le produit sait faire. Liste FERMÉE : une valeur qui
 *  voyage vers la base doit voir sa contrainte la connaître. */
export const OUTBOUND_WRITE_KINDS = [
  'export_contact',
  'create_note',
  'create_task',
  'log_meeting',
  'create_company',
  'create_list',
  'enroll_sequence',
  // #1934.18 — le stade d'une affaire. Cette nature-là ne s'auto-approuve
  // JAMAIS : voir `CrmService.proposeDealStage`.
  'update_deal_stage',
  // #2777 — une opportunité candidate, proposée comme un Deal. Même raison
  // que le stade : le titre vient d'un MODÈLE (l'extraction du compte rendu),
  // pas d'un champ que la personne a relu — voir `CrmService.proposeCreateDeal`.
  'create_deal',
  // #2319.114 (épopée #2985) — clôturer une tâche déjà créée (`create_task`).
  // Un geste d'utilisateur (le clic « Marquer comme faite » EST la décision),
  // voir `CrmService.closeTask`.
  'close_task',
  // #4186 — un BESOIN déposé dans le CRM sous sa forme idiomatique (affaire,
  // tâche ou note), par l'adaptateur commun. Il passait hors porte, sans trace :
  // voir `CrmWriteService` et `CrmTaskService`. EN FIN de liste (GA-08) ;
  // `kind` est un TEXT sans CHECK (migration 1789910000004).
  'export_need',
  // #4406.3 — une réponse Beeper, envoyée sur le geste de l'utilisateur (origine `user`). La charge
  // utile ne porte JAMAIS le texte (aucun corps conservé, c96) : la conversation et la longueur.
  'send_chat_message',
] as const
export type OutboundWriteKind = (typeof OUTBOUND_WRITE_KINDS)[number]

export type PreviewLine = {
  /** Le LIBELLÉ, celui qui se lit. */
  field: string
  /** La valeur qui partira. */
  value: string
  /**
   * La clé de la charge utile, à côté de son libellé (#1498).
   *
   * ⚠️ Sans elle, une prévisualisation modifiée ne peut pas être renvoyée dans
   * la charge utile : on sait ce qui s'affiche, pas ce que ça écrit. C'est ce
   * qui rendait « Modifier » impossible.
   */
  key: string
  /**
   * La valeur ACTUELLE, figée au même instant que le reste (#1498).
   *
   * ⚠️ `undefined` = on ne sait pas, et ce n'est PAS « vide ». Le demandeur ne
   * connaît pas toujours l'état du champ chez le fournisseur ; écrire
   * « non renseigné → … » affirmerait qu'il était vide.
   */
  previous?: string
}

/** Les libellés français des champs, pour que la prévisualisation se lise. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  email: 'Adresse e-mail',
  firstName: 'Prénom',
  lastName: 'Nom',
  company: 'Société',
  jobTitle: 'Fonction',
  phone: 'Téléphone',
  note: 'Note',
  subject: 'Objet',
  // #2777 — le détail d'une opportunité proposée comme Deal.
  body: 'Détail',
  dueAt: 'Échéance',
  // #4186 — l'échéance RÉELLE d'un besoin déposé (`export_need`).
  dueDate: 'Échéance',
  externalId: 'Identifiant externe',
  name: 'Nom',
  domain: 'Domaine',
  contactIds: 'Contacts',
  sequenceId: 'Séquence',
  listId: 'Liste',
  // #1934.18 — la proposition de stade, dans l'ordre où elle se lit : QUELLE
  // affaire, puis vers QUEL stade, puis POURQUOI. `dealId` n'est pas un champ
  // écrit, c'est la CIBLE — et une prévisualisation qui tait la cible fait
  // approuver un déplacement sans dire ce qui bouge (même raison que
  // `externalId` pour une note).
  dealName: 'Affaire',
  dealId: 'Identifiant de l’affaire',
  pipeline: 'Pipeline',
  stage: 'Stade',
  // Le libellé se lit, l'IDENTIFIANT part : `dealstage` n'accepte que lui.
  // Il est montré pour la même raison que `dealId` — c'est ce qui sera écrit.
  stageId: 'Identifiant du stade',
  rationale: 'Pourquoi',
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === '') return MISSING
  if (Array.isArray(value)) return value.length > 0 ? `${value.length}` : MISSING
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

/**
 * Une ligne par champ ÉCRIT, dans un ordre stable.
 *
 * Stable et pas « celui de l'objet » : deux prévisualisations du même geste
 * doivent se lire pareil, sinon relire la seconde demande de tout recommencer.
 */
export function buildOutboundPreview(
  kind: OutboundWriteKind,
  payload: Readonly<Record<string, unknown>>,
  /**
   * Ce que le champ vaut AUJOURD'HUI chez le fournisseur, quand le demandeur le
   * sait. Absent = inconnu, et l'écran n'affiche alors que la nouvelle valeur.
   */
  previous?: Readonly<Record<string, unknown>>,
): PreviewLine[] {
  const keys = Object.keys(FIELD_LABELS).filter(key => key in payload)
  const extra = Object.keys(payload)
    .filter(key => !(key in FIELD_LABELS))
    .sort()
  return [...keys, ...extra].map(field => ({
    field: FIELD_LABELS[field] ?? field,
    key: field,
    value: render(payload[field]),
    // ⚠️ `in` et non une valeur vérité : un champ présent à `null` chez le
    // fournisseur est une information (« il est vide »), un champ ABSENT du
    // dictionnaire est une absence de connaissance. Les confondre écrirait
    // « non renseigné → … » sur un champ qu'on n'a jamais lu.
    ...(previous && field in previous ? { previous: render(previous[field]) } : {}),
  }))
}

/** Trois jours — voir la migration `1789910000004` pour le pourquoi. */
export const OUTBOUND_WRITE_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000

/** Une demande dont personne n'a décidé à temps. */
export function isOutboundExpired(request: { state: string; expires_at: Date }, now: Date): boolean {
  return request.state === 'pending' && request.expires_at.getTime() <= now.getTime()
}
