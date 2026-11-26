/**
 * Les règles de CONFORMITÉ de l'enrichissement de contacts (#2297, décisions
 * Louis du 19/09/2026). Un seul fichier, un seul endroit par règle (GA-26) :
 * l'API filtre et archive avec, le web exporte avec.
 *
 * Fichier de faits PURS — aucune dépendance, aucun I/O.
 */

/**
 * #2297.54 — le CATALOGUE NOMMÉ des champs que l'enrichissement n'ÉCRIT
 * JAMAIS, quel que soit le fournisseur (Apollo, Dropcontact, la cascade IA, le
 * semis de démonstration) : ils sont retirés À L'ENTRÉE, avant tout pliage dans
 * la fiche (`contacts.service.ts::enrichContact`).
 *
 * #2297 (décision Louis 19/09/2026, point 2) — le MÊME catalogue filtre la
 * COLLECTE d'une analyse : en sortie de phase 2 côté IA
 * (`phase2_contacts.py::_collected_contacts_payload`) et à l'entrée de
 * `contacts.service.ts::bulkInsert` côté API, qui tient la base. L'IA ne peut
 * pas importer ce fichier : elle en porte un MIROIR
 * (`apps/ia/app/services/enrichment_compliance.py`) que
 * `apps/ia/tests/test_enrichment_compliance.py` compare à celui-ci, clé par
 * clé et dans l'ordre. Ajouter une clé : ICI d'abord, puis le miroir.
 *
 * Point de départ : les critères protégés de la doctrine (c58,
 * `doctrine-registry.ts` — l'âge, le genre, l'origine, la nationalité, la
 * situation familiale, l'adresse d'une personne). Le catalogue est FERMÉ et
 * chaque entrée porte sa raison : une garde ne devine pas, elle nomme. Les
 * graphies sont comparées NORMALISÉES (casse et séparateurs ignorés) — une clé
 * du catalogue vaut pour `birth_date`, `birthDate` et `BirthDate`.
 *
 * ⚠️ La PHOTO n'y est PAS — TRANCHÉ par Louis le 19/09/2026 : rien de plus au
 * catalogue. c58 dit en toutes lettres « une photo s'affiche sur une fiche,
 * elle n'ordonne pas des gens », et le rafraîchissement de la photo au clic
 * « Enrichir » est un retour bêta livré (`contacts.service.spec.ts`,
 * « rafraîchit la photo »).
 *
 * Les pendants existants, qui ne sont PAS des écritures : GA-06
 * (`protected-criteria.spec.ts`, aucun moteur de classement ne LIT ces champs)
 * et `apps/ia/app/services/protected_criteria.py` (aucun prompt de notation ne
 * les REÇOIT).
 */
export const ENRICHMENT_FORBIDDEN_FIELDS = [
  {
    criterion: 'age',
    keys: ['age', 'birth_date', 'date_of_birth', 'birth_year', 'birthday'],
    reason: "Critère protégé (c58) : l'âge d'une personne n'a aucune finalité de prospection B2B.",
  },
  {
    criterion: 'gender',
    keys: ['gender', 'sex', 'civility'],
    reason: 'Critère protégé (c58) : le genre ne sert ni à joindre ni à qualifier un interlocuteur.',
  },
  {
    criterion: 'origin',
    keys: ['ethnicity', 'nationality', 'nationalite', 'race'],
    reason: "Critère protégé (c58) : l'origine et la nationalité sont des données sensibles ou discriminantes.",
  },
  {
    criterion: 'marital_status',
    keys: ['marital_status', 'situation_familiale'],
    reason: 'Critère protégé (c58) : la situation familiale relève de la vie privée.',
  },
  {
    criterion: 'religion',
    keys: ['religion'],
    reason: "Donnée sensible (RGPD art. 9) : les convictions religieuses d'une personne.",
  },
  {
    criterion: 'personal_address',
    keys: ['address', 'home_address', 'personal_address', 'postal_address', 'street_address'],
    reason:
      "Critère protégé (c58) : le domicile d'une personne. La ville et le pays (site de travail, plus grossiers que le code postal) restent permis.",
  },
  {
    // #2297.55 — « Laura ne doit pas chercher ni promettre des numéros
    // personnels obtenus de manière non autorisée. » Le mobile PROFESSIONNEL
    // (#2297.8, `mobile`/`professional_mobile`) reste hors de ce catalogue :
    // c'est justement la coordonnée que l'enrichissement est autorisé à
    // rendre, quand elle est contractuellement disponible.
    criterion: 'personal_phone',
    keys: ['personal_phone', 'personal_mobile', 'home_phone', 'mobile_personnel'],
    reason:
      "#2297.55 : un numéro personnel n'a aucune finalité professionnelle et n'est jamais obtenu sans autorisation — seul le mobile professionnel (#2297.8) est permis.",
  },
] as const

/**
 * #2297.51 — décision Louis 19/09/2026 : la durée de conservation des
 * coordonnées ENRICHIES d'un contact, en jours — trois ans, la référence de la
 * CNIL pour un prospect, comptés depuis le DERNIER contact ou la dernière
 * activité tracée. Passé ce délai, elles sont ARCHIVÉES (plus affichées, plus
 * exportées ; « on archive, on ne supprime pas » — un fait périmé redevient
 * inconnu). Seule une demande d'effacement RGPD les supprime réellement.
 *
 * UN seul endroit (GA-26) : la politique publiée (`GET /privacy/retention`) et
 * le balayage (`PrivacyRetentionService.sweepStaleEnrichedContacts`) la lisent
 * ici. Non réglable par variable d'environnement : la borne fait partie de la
 * décision, pas de l'exploitation.
 */
export const ENRICHED_CONTACT_RETENTION_DAYS = 1095

/** Casse et séparateurs ignorés : `birth_date` = `birthDate` = `BirthDate`. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(
  ENRICHMENT_FORBIDDEN_FIELDS.flatMap(field => field.keys.map(normalizeKey)),
)

/** #2297.54 — cette clé est-elle au catalogue des champs interdits ? */
export function isEnrichmentForbiddenField(key: string): boolean {
  return FORBIDDEN_KEYS.has(normalizeKey(key))
}

/**
 * #2297.54 — une COPIE de `value` sans aucune clé du catalogue, à toute
 * profondeur (un historique d'emploi recopie du brut fournisseur : un filtre
 * qui ne descend que d'un niveau laisse passer le suivant). L'entrée n'est
 * jamais mutée.
 */
export function withoutForbiddenEnrichmentFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => withoutForbiddenEnrichmentFields(item)) as T
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const kept: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (!isEnrichmentForbiddenField(key)) kept[key] = withoutForbiddenEnrichmentFields(item)
    }
    return kept as T
  }
  return value
}

/**
 * #4178.1 — la NATURE d'un numéro. Le catalogue ci-dessus interdit de COLLECTER
 * un numéro personnel ; il ne dit pas ce qu'est un numéro DÉJÀ collecté. Quatre
 * natures, et « professionnel » ne se déduit JAMAIS du format ni du préfixe :
 *
 * - `professional_verified` — une preuve fournisseur que le numéro est
 *   professionnel. Réservée : aucune source branchée n'en rend une au
 *   14/10/2026, donc aucune fonction ci-dessous ne la produit ;
 * - `professional_declared` — le fournisseur type la ligne « travail »
 *   (direct, standard) : c'est sa déclaration, pas notre vérification ;
 * - `personal` — le fournisseur type la ligne « domicile » ;
 * - `unknown` — pas de métadonnée, ou une métadonnée qui ne dit rien de la
 *   nature (un « mobile » est un type de LIGNE, pas une nature). L'écran dit
 *   « nature non vérifiée ».
 */
export const PHONE_NATURES = ['professional_verified', 'professional_declared', 'personal', 'unknown'] as const
export type PhoneNature = (typeof PHONE_NATURES)[number]

/** Qui a posé la nature : le fournisseur, ou une correction humaine (qui gagne toujours). */
export const PHONE_NATURE_SOURCES = ['provider', 'human'] as const
export type PhoneNatureSource = (typeof PHONE_NATURE_SOURCES)[number]

const PROVIDER_WORK_LINE_TYPES: ReadonlySet<string> = new Set(['work_direct', 'work_hq', 'work', 'direct', 'hq'])
const PROVIDER_HOME_LINE_TYPES: ReadonlySet<string> = new Set(['home', 'personal'])

/** Le type de ligne d'un fournisseur → une nature. Tout ce qui n'est pas explicite est `unknown`. */
export function phoneNatureFromProviderType(type: string | null | undefined): PhoneNature {
  const key = (type ?? '').trim().toLowerCase()
  if (PROVIDER_WORK_LINE_TYPES.has(key)) return 'professional_declared'
  if (PROVIDER_HOME_LINE_TYPES.has(key)) return 'personal'
  return 'unknown'
}

export type ResolvedPhoneNature = {
  nature: PhoneNature
  /** Les natures qui se CONTREDISENT — jamais masquées ; vide hors contradiction. */
  conflicting: PhoneNature[]
}

const isProfessionalNature = (nature: PhoneNature): boolean =>
  nature === 'professional_verified' || nature === 'professional_declared'

/**
 * Plusieurs sources → une nature. Une correction humaine gagne toujours ;
 * `unknown` ne contredit personne ; un professionnel et un personnel qui se
 * contredisent donnent `unknown` ET nomment les deux (`conflicting`).
 */
export function resolvePhoneNature(
  providerNatures: readonly PhoneNature[],
  humanNature?: PhoneNature | null,
): ResolvedPhoneNature {
  if (humanNature) return { nature: humanNature, conflicting: [] }
  const known = providerNatures.filter(nature => nature !== 'unknown')
  const distinct = [...new Set(known)]
  const hasPro = distinct.some(isProfessionalNature)
  const hasPersonal = distinct.includes('personal')
  if (hasPro && hasPersonal) return { nature: 'unknown', conflicting: distinct }
  const best = distinct.find(n => n === 'professional_verified') ?? distinct[0]
  return { nature: best ?? 'unknown', conflicting: [] }
}
