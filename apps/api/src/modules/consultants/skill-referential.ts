import {
  SKILLS,
  SKILL_CANONICAL_BY_ALIAS,
  canonicalSkill,
  distinctSkillMembers,
  normaliseSkillText,
  skillDistance,
} from '@bellum/contracts'

/**
 * Référentiel de compétences normalisées (addendum final p62 — Talent Graph).
 *
 * Le matching comparait des mots. « K8s » et « Kubernetes » désignent la même
 * compétence et ne se rencontraient jamais ; « JS », « JavaScript » et « Node »
 * non plus. Résultat : un besoin Kubernetes ne trouvait pas le consultant qui
 * l'avait écrit « k8s » sur sa fiche — un faux négatif silencieux, le pire des
 * défauts pour un vivier, parce que personne ne peut le voir.
 *
 * Ce module est un DICTIONNAIRE D'ALIAS, pas une ontologie. Il ne dit pas que
 * Kubernetes « est un » orchestrateur, ni que Docker en est proche : il dit
 * seulement que ces sept écritures désignent la même chose. La distinction est
 * volontaire — une ontologie de compétences se périme en dix-huit mois et
 * demande un mainteneur, un dictionnaire d'alias se relit en une minute et se
 * complète sur un cas réel.
 *
 * Deux règles de conception, qui expliquent ce qui n'y est PAS :
 *
 *   - **Aucune inférence.** On ne déduit pas « connaît Terraform » de « connaît
 *     AWS ». Une compétence non écrite reste absente : c'est la règle produit,
 *     et le module de preuve (`skillEvidence`) s'appuie dessus.
 *   - **Aucun terme trop court ni trop générique** (« dev », « data », « cloud »
 *     seuls). Ils matchent tout et n'apprennent rien ; les ajouter ferait
 *     remonter tout le vivier sur n'importe quel besoin.
 */

/**
 * #4434 (épopée #4433, Louis 21/10) — le dictionnaire n'est plus tenu ICI : il vit dans le référentiel
 * PARTAGÉ des critères (`packages/contracts/src/schemas/criteria-referential.ts`), que Découvrir, Laura et
 * l'écran lisent aussi (GA-26). Les alias et les produits distincts d'origine y sont repris tels quels ; ce
 * module garde les fonctions du vivier (découpe, extraction, preuve stricte) et les fait lire là-bas.
 */
const CANONICAL_BY_ALIAS: ReadonlyMap<string, string> = SKILL_CANONICAL_BY_ALIAS

export { canonicalSkill, normaliseSkillText }

/**
 * KEVIN-FIX K.2 (recette prod 20/10) — une saisie « java spring vue » devenait UNE puce, puis « spring » et
 * « vue » s'y ajoutaient en doublon. Découpe une liste de saisies en compétences, sans doublon (casse ignorée,
 * première écriture gardée).
 *
 * Prudence : ce qui n'est pas une liste de compétences CONNUES ne se découpe pas — « Chef de projet »,
 * « Outil maison Zephyr », « CI/CD » restent d'une pièce. Une virgule ou un point-virgule sépare toujours ;
 * l'espace et le slash ne séparent que si CHAQUE morceau est une compétence du référentiel (les composés
 * connus — « Spring Boot », « Vue.js », « Machine Learning » — comptent pour un morceau).
 */
export function splitSkillEntries(entries: readonly string[] | null | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (label: string) => {
    const trimmed = label.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) return
    seen.add(key)
    out.push(trimmed)
  }
  for (const entry of entries ?? []) {
    if (typeof entry !== 'string') continue
    for (const segment of entry.split(/[,;]+/)) {
      const whole = segment.trim()
      if (!whole) continue
      const units = unitsOf(whole)
      if (units) units.forEach(push)
      else push(whole)
    }
  }
  return out
}

/** Les morceaux d'un segment si TOUS sont des compétences connues (≥ 2), sinon `null`. */
function unitsOf(segment: string): string[] | null {
  if (CANONICAL_BY_ALIAS.has(normaliseSkillText(segment))) return null
  const tokens = segment.split(/[\s/|]+/).filter(Boolean)
  if (tokens.length < 2) return null
  const units: string[] = []
  for (let i = 0; i < tokens.length; ) {
    let taken = 0
    // Le composé connu le plus LONG d'abord (jusqu'à trois mots).
    for (let size = Math.min(3, tokens.length - i); size >= 1; size--) {
      if (CANONICAL_BY_ALIAS.has(normaliseSkillText(tokens.slice(i, i + size).join(' ')))) {
        taken = size
        break
      }
    }
    if (taken === 0) return null
    units.push(tokens.slice(i, i + taken).join(' '))
    i += taken
  }
  return units.length >= 2 ? units : null
}

/**
 * Les compétences canoniques d'un texte libre — une fiche, un CV, un besoin.
 *
 * On cherche les alias PAR LONGUEUR DÉCROISSANTE : sans cela, « bi » (Business
 * Intelligence) matcherait dans « ambition » et « ml » dans « html ». La borne
 * de mot (`\b`) ne suffit pas pour les alias de deux lettres, d'où la recherche
 * sur des mots entiers du texte segmenté.
 */
export function extractSkills(text: string): string[] {
  const normalised = normaliseSkillText(text)
  if (!normalised) return []
  const words = new Set(normalised.split(' '))
  const found = new Set<string>()

  for (const [alias, canonical] of CANONICAL_BY_ALIAS) {
    if (alias.includes(' ')) {
      // Alias multi-mots : recherche de sous-chaîne, sans ambiguïté possible.
      if (normalised.includes(alias)) found.add(canonical)
      continue
    }
    if (words.has(alias)) found.add(canonical)
  }
  return [...found].sort()
}

/**
 * Deux écritures désignent-elles la même compétence ?
 *
 * C'est la question que posait le matching, et à laquelle il répondait « non »
 * chaque fois que l'orthographe différait. Deux termes inconnus du référentiel
 * sont comparés littéralement — on ne prétend pas trancher ce qu'on ne connaît
 * pas, mais on ne perd pas non plus une égalité évidente.
 */
export function sameSkill(a: string, b: string): boolean {
  const left = canonicalSkill(a)
  const right = canonicalSkill(b)
  if (left && right) return left === right
  return normaliseSkillText(a) === normaliseSkillText(b)
}

/**
 * Les entrées qui ne sont PAS des synonymes — des produits distincts rangés sous
 * une même famille.
 *
 * Le référentiel confondait les deux. « Databricks » était déclaré alias de
 * « Spark », si bien qu'un besoin Databricks se trouvait couvert par quelqu'un
 * qui n'avait fait que du Spark — et l'écran l'affichait « prouvé ». C'est
 * exactement l'exemple que le PDF 4 donne de ce qu'il ne faut pas faire : sur sa
 * maquette, « ✓ Spark » et « ✗ Databricks — non prouvé » cohabitent sur la même
 * carte.
 *
 * Le regroupement reste UTILE pour CHERCHER (« montre-moi les profils SQL »
 * doit sortir les gens qui ont écrit PostgreSQL) : `sameSkill` ne bouge pas, et
 * l'écran Vivier se comporte comme avant. Ce qui change, c'est ce que le
 * MATCHING ose appeler une preuve — sur un dossier envoyé à un client, « a fait
 * Oracle » ne prouve pas « connaît PostgreSQL ». Ces couples deviennent des
 * compétences ADJACENTES, signalées et jamais comptées.
 *
 * #4434 — la liste vit dans le référentiel partagé (`SkillEntry.distinct`).
 */
function isDistinctMember(canonical: string, normalised: string): boolean {
  return distinctSkillMembers(canonical).includes(normalised)
}

/**
 * Deux écritures désignent-elles la même compétence, au sens STRICT ?
 *
 * C'est la question que pose le matching, et elle est plus exigeante que celle
 * de la recherche : deux produits distincts d'une même famille répondent `false`
 * ici et `true` à {@link sameSkill}. Un faux positif de recherche fait remonter
 * un profil de trop ; un faux positif de matching écrit au client qu'une
 * compétence est prouvée alors qu'elle ne l'est pas.
 */
export function strictSameSkill(a: string, b: string): boolean {
  const left = normaliseSkillText(a)
  const right = normaliseSkillText(b)
  if (!left || !right) return false
  if (left === right) return true
  const canonicalLeft = canonicalSkill(a)
  const canonicalRight = canonicalSkill(b)
  if (!canonicalLeft || !canonicalRight || canonicalLeft !== canonicalRight) return false
  return !isDistinctMember(canonicalLeft, left) && !isDistinctMember(canonicalLeft, right)
}

/** Deux compétences de la même famille, sans être la même — l'adjacence du §3.1. */
export function relatedSkill(a: string, b: string): boolean {
  if (strictSameSkill(a, b)) return false
  const left = canonicalSkill(a)
  const right = canonicalSkill(b)
  return Boolean(left && right && left === right)
}

/** Le référentiel, pour un écran d'administration ou un test de couverture. */
export function skillReferential(): { canonical: string; aliases: readonly string[] }[] {
  return Object.entries(SKILLS).map(([canonical, entry]) => ({ canonical, aliases: entry.aliases }))
}

/**
 * #4434 — deux compétences DISTINCTES de la même FAMILLE du référentiel partagé (React ↔ Angular, React ↔
 * JavaScript) : le palier 1 de l'élargissement. Le matching les dit ADJACENTES — signalées, jamais comptées :
 * « a fait Angular » ne prouve pas « connaît React ». Le palier 2 (domaine) est trop large pour une preuve et
 * n'est pas lu ici.
 */
export function familySkill(a: string, b: string): boolean {
  return skillDistance(a, b) === 1
}
