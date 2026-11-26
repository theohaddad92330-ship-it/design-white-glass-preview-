/**
 * #1926.28-.31, #1925 — la forme de « pourquoi ce message », rendue par
 * `POST /message/generate` (`apps/ia/app/routers/message.py`) et partagée par
 * TOUS les écrans qui affichent un brouillon issu de cet appel : le composer de
 * fiche contact (`EngagementMessage`) et la carte Action OS (`PendingActions`).
 *
 * Chaque champ est FACULTATIF : un brouillon émis pendant le déploiement, par
 * une version plus ancienne de l'API, ne les porte pas — l'écran doit alors
 * rester silencieux sur ce bloc, jamais deviner une valeur (mémoire
 * `champ-serveur-neuf-lu-sans-garde`).
 *
 * Rien ici n'est persisté : ces champs ne vivent JAMAIS dans `raw_analysis` ni
 * une table (contrairement au brouillon initial de la fiche contact, préécrit
 * à l'analyse) — ce sont des champs éphémères d'un appel à la demande. C'est
 * pour ça qu'aucune entrée `demo-dataset.ts` / `demo-coverage.ts` n'est due :
 * la garde de démo ne connaît que les tables et les clés de `raw_analysis`
 * (`accountAnalysisSchema.shape`), et le bouton qui déclenche cet appel tourne
 * déjà en RÉEL en démo (aucun garde `isDemoWorkspace` sur
 * `POST /message/generate` côté API).
 */

/** Le cadrage dérivé AVANT rédaction — `app.services.message_brief.derive_message_brief`. */
export type MessageBrief = {
  objective: string | null
  objectiveSource: string
  relationship: string | null
  persona: string | null
  /** #3418.4 (retour bêta 30/09) — le rôle dans la décision (technical / economic /
   *  procurement / user / champion), calculé comme la colonne `contacts.decision_role`. */
  decisionRole?: string | null
  formality: string
  formalitySource: string
  cta: string
  ctaSource: string
  /** #2887.5 — ce qui est à éviter pour CETTE relation (texte libre, comme
   *  `rationale` : contenu généré/dérivé côté serveur, jamais une clé i18n).
   *  `null` = aucune interdiction PROPRE au stade (froid, ou stade non mesuré
   *  — les deux jamais confondus, voir `forbiddenSource`). */
  forbidden?: string | null
  forbiddenSource?: string
  /** #2371.5 — la longueur visée pour le canal (texte de la source unique
   *  `channel_length`, côté serveur). `null` = canal inconnu, jamais deviné. */
  length?: string | null
  lengthSource?: string
  /** Ce que le cadrage n'a pas pu déterminer — `objective`, `persona` et/ou
   *  `decisionRole` (voir `derive_message_brief`). */
  missing: string[]
}

export type MessageSpecificity = {
  // ⚠️ `status`, PAS `verdict` : le nom exact rendu par `assess_specificity`
  // (apps/ia/app/services/recommendation_specificity.py). `verdict` n'existe
  // nulle part dans la réponse — le lire ferait échouer silencieusement sur
  // `undefined`.
  status: 'specifique' | 'generique' | 'non_evaluable' | string
  count: number
  minimum: number
  // Pas de type nommé séparé : consommé uniquement à travers ce champ.
  elements: { kind: string; value: string }[]
  unavailable: string[]
}

export type MessageToneOption = { id: string; instruction: string }

/** #3752 — un document de l'espace réellement injecté dans le prompt du brouillon. */
type MessageKnowledgeSource = { docId: string; title: string }

/** Le sous-ensemble de la réponse `/message/generate` que ce module lit —
 *  `subject`/`body`/`channel` restent au type de chaque appelant. */
export type MessageInsight = {
  rationale?: string | null
  alternativeAngle?: string | null
  brief?: MessageBrief | null
  specificity?: MessageSpecificity | null
  toneOptions?: MessageToneOption[] | null
  /** #3752 — les documents de l'ESN dont le brouillon s'est servi (absent = aucun). */
  knowledgeSources?: MessageKnowledgeSource[] | null
  /** #3752 — mots interdits survivant à la régénération : nommés, jamais réécrits en silence. */
  lexiconWarning?: { terms: string[] } | null
}

/**
 * #1925.2-.12 — les onze familles, dans le MÊME ordre que `SPECIFICITY_ELEMENTS`
 * côté IA (`apps/ia/app/services/recommendation_specificity.py`). Un ordre qui
 * diverge ne casse rien ICI (on ne fait qu'exclure deux ensembles d'une liste),
 * mais un code absent de cette liste ferait disparaître silencieusement une
 * famille de l'avertissement « éléments disponibles pour enrichir ».
 */
export const SPECIFICITY_ELEMENT_KINDS = [
  'esn_expertise',
  'territory',
  'capacity',
  'client_reference',
  'dated_signal',
  'precise_entity',
  'precise_contact',
  'available_consultant',
  'access_path',
  'known_constraint',
  'user_objective',
] as const

/**
 * #1926.30 (décision « message générique ») — les familles que le dossier
 * ALIMENTE mais que ce brouillon n'a PAS citées : la matière concrète pour
 * enrichir un message jugé générique. Ni les éléments déjà cités (`elements`)
 * ni ceux que le dossier n'alimente pas du tout (`unavailable`) n'y entrent.
 */
export function availableUnusedElements(specificity: MessageSpecificity): string[] {
  const cited = new Set(specificity.elements.map(element => element.kind))
  const unavailable = new Set(specificity.unavailable)
  return SPECIFICITY_ELEMENT_KINDS.filter(kind => !cited.has(kind) && !unavailable.has(kind))
}

/**
 * #1926.31 — « changer le ton » AJOUTE l'instruction à l'angle du tour
 * précédent, il ne le remplace pas (`message_brief.py::tone_options` docstring) :
 * `derive_message_brief` relit l'angle envoyé pour en tirer tu/vous, donc perdre
 * l'angle d'origine referait tomber le cadrage sur ses valeurs par défaut.
 */
export function combineAngleWithTone(previousAngle: string, tone: MessageToneOption): string {
  const previous = previousAngle.trim()
  return previous ? `${previous} ${tone.instruction}` : tone.instruction
}
