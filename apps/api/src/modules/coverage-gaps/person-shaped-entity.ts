/**
 * « Prénom Nom — Fonction » : une PERSONNE écrite là où on attendait une
 * organisation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ALORS QUE LE CORRECTIF EST EN AMONT
 * ─────────────────────────────────────────────────────────────────────────────
 * Recette live du 29/08/2026, compte ROCHE, onglet « Couverture du compte » :
 *
 *     « Entités couvertes 26/27 · À ouvrir : Wafaa Mamilli — Chief Digital
 *       Technology Officer »
 *
 * La cause racine est dans le service d'analyse : `entity_type.classify_
 * entity_type` répond à « quelle SORTE d'objet est-ce ? » et sa taxonomie du
 * §24 avait un cas pour la SCI, un pour la coentreprise, un pour l'entité
 * cédée — aucun pour l'être humain. C'est corrigé là-bas, et c'est là que ça
 * devait l'être.
 *
 * Mais un correctif amont ne vaut que pour les analyses FUTURES. Le dossier de
 * ROCHE porte déjà la chaîne dans son `raw_analysis`, et il continuerait
 * d'afficher « 26/27 » jusqu'à sa prochaine analyse — c'est-à-dire jusqu'à ce
 * que quelqu'un paie un run pour corriger un affichage. D'où cette lecture
 * défensive.
 *
 * ⚠️ ELLE NE SUPPRIME RIEN. L'entrée reste dans `raw_analysis`, et le service
 * de couverture la NOMME dans `entities_excluded_names` : « on archive, on ne
 * supprime pas », et un produit qui perd une entité sans le dire est pire
 * qu'un produit qui en montre une de trop.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE JUMEAU PYTHON — ET CE QUI LES TIENT ENSEMBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * La source de vérité est `apps/ia/app/services/official_directory.py`
 * (`person_and_title`, `_looks_like_person_name`, `_looks_like_title`) : c'est
 * elle qui décide, à l'écriture. Celle-ci relit, et doit donc être au moins
 * aussi CONSERVATRICE — jamais plus large. Les deux partagent le corpus de cas
 * de `test_entity_type.py` / `coverage.service.spec.ts`.
 *
 * Le sens de l'erreur qui compte : un faux positif fait disparaître une cible
 * commerciale réelle, un faux négatif laisse une ligne de trop qu'un humain
 * peut corriger. On exige donc un patronyme ET une fonction, ADJACENTS. Un
 * patronyme NU ne suffit jamais — « Michel Bras » est une raison sociale
 * autant qu'un nom.
 */

/** Le type que le §24 pose sur une personne ingérée comme entité. */
export const PERSON_ENTITY_TYPE = 'person_not_an_entity'

/**
 * Séparateurs « nom <sep> fonction ».
 *
 * ⚠️ Le tiret simple exige des espaces autour, sinon « Jean-Pierre Martin » se
 * couperait en deux et deviendrait une paire. Copié tel quel du jumeau Python,
 * pour la même raison.
 */
const SEPARATOR = /\s*[—–|·•]\s*|\s+[-–]\s+|\s*:\s*|,\s+/

/** Ce qui ouvre un libellé de FONCTION dirigeante, FR et EN. */
const TITLE_START =
  /^(?:direct(?:eur|rice)s?|pr[ée]sident(?:e)?|vice[-\s]?pr[ée]sident(?:e)?|p-?dg|dg[ad]?|dsi|rssi|daf|drh|dpo|cto|cio|ceo|cfo|coo|cmo|cdo|ciso|vp|chief\b|head\s+of\b|responsable|chef\s+de\b|secr[ée]taire\s+g[ée]n[ée]ral(?:e)?|g[ée]rant(?:e)?|administrat(?:eur|rice)|membre\s+d[ue]\b|co[-\s]?fondat(?:eur|rice)|fondat(?:eur|rice)|founder|co[-\s]?founder|managing\s+director|general\s+manager|manager\b|partner\b|associ[ée]\b)/i

/** Mots qui trahissent une raison sociale ou un service — jamais un patronyme. */
const ORG_STOPWORDS = new Set([
  'groupe',
  'group',
  'holding',
  'sa',
  'sas',
  'sasu',
  'sarl',
  'sci',
  'gie',
  'spa',
  'inc',
  'ltd',
  'llc',
  'gmbh',
  'corp',
  'corporation',
  'company',
  'cie',
  'industries',
  'industrie',
  'technologies',
  'technologie',
  'solutions',
  'systems',
  'services',
  'service',
  'conseil',
  'consulting',
  'partners',
  'associates',
  'société',
  'societe',
  'association',
  'fondation',
  'fédération',
  'federation',
  'comité',
  'comite',
  'direction',
  'département',
  'departement',
  'agence',
  'banque',
  'assurance',
  'france',
  'international',
  'europe',
  'global',
  'digital',
  'innovation',
  'immobilier',
  'capital',
  'invest',
  'investissement',
])

/** Particules autorisées en minuscules à l'intérieur d'un nom. */
const NAME_PARTICLES = new Set([
  'de',
  'du',
  'des',
  'le',
  'la',
  'les',
  'van',
  'von',
  'der',
  'den',
  'di',
  'da',
  'do',
  'dos',
  'el',
  'al',
  'bin',
  'ben',
  'mac',
  'mc',
  'saint',
  'sainte',
])

const NAME_TOKEN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*$/
const HAS_DIGIT = /\d/

function looksLikeTitle(text: string): boolean {
  const label = text.trim().replace(/[.;]+$/, '')
  if (!label || label.length > 120 || HAS_DIGIT.test(label)) return false
  if (label.split(/\s+/).length > 10) return false
  return TITLE_START.test(label)
}

function looksLikePersonName(text: string): boolean {
  const name = text.trim().replace(/^[,;:]+|[,;:]+$/g, '')
  if (!name || name.length > 60 || HAS_DIGIT.test(name)) return false
  if (TITLE_START.test(name)) return false // une fonction n'est pas un nom
  const tokens = name.split(/\s+/)
  if (tokens.length < 2 || tokens.length > 4) return false
  let capitalised = 0
  for (const token of tokens) {
    if (!NAME_TOKEN.test(token)) return false
    const lowered = token.toLowerCase().replace(/^['’.-]+|['’.-]+$/g, '')
    if (ORG_STOPWORDS.has(lowered)) return false
    if (token[0] !== undefined && token[0] === token[0].toUpperCase() && token[0] !== token[0].toLowerCase()) {
      capitalised += 1
    } else if (!NAME_PARTICLES.has(lowered)) {
      return false
    }
  }
  return capitalised >= 2
}

/**
 * Ce libellé décrit-il une PERSONNE plutôt qu'une organisation ?
 *
 * Seuls les segments ADJACENTS sont appariés : c'est ce qui évite d'accepter
 * n'importe quelle paire distante de la même ligne.
 */
export function isPersonShapedEntityName(raw: string | null | undefined): boolean {
  const line = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!line) return false
  const segments = line
    .split(SEPARATOR)
    .map(s => s.trim())
    .filter(Boolean)
  for (let i = 0; i + 1 < segments.length; i += 1) {
    const left = segments[i] as string
    const right = segments[i + 1] as string
    if (looksLikePersonName(left) && looksLikeTitle(right)) return true
    if (looksLikeTitle(left) && looksLikePersonName(right)) return true
  }
  return false
}
