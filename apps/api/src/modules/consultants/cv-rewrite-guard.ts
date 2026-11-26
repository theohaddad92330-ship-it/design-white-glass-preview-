import type { Consultant, ConsultantCvRewrite, CvHighlight, ExcludedSkill } from '@bellum/contracts'
import { type MatchTarget, normalize, targetTerms, terms } from './consultant-matching'

/**
 * Garde-fou de la réécriture de CV (annexe méthodo p22 « Réécriture du CV selon
 * la mission »).
 *
 * Réécrire un CV avec un LLM est la fonctionnalité la plus dangereuse du vivier :
 * le modèle a toutes les raisons du monde de « muscler » un profil pour qu'il
 * colle au besoin. C'est très exactement la donnée fictive que la règle produit
 * interdit, sauf qu'ici elle est envoyée à un client, sur une personne réelle,
 * et qu'elle se découvre en soutenance.
 *
 * Ce module ne fait donc pas confiance à la sortie du modèle. Il la CONFRONTE au
 * CV source :
 *
 *   1. chaque expérience réécrite doit citer (`proof`) un fragment RÉELLEMENT
 *      présent dans le CV source. Une citation introuvable = expérience inventée
 *      (ou déformée au point d'être invérifiable) → elle est retirée ;
 *   2. les manques sont recalculés ici, en dur, à partir des termes du besoin
 *      absents de la stack déclarée ET du texte du CV. Le modèle peut « oublier »
 *      d'énoncer un manque ; ce calcul, non ;
 *   3. tout ce qui a été retiré est DIT dans `gaps` — jamais supprimé en silence,
 *      sinon le garde-fou ne ferait que rendre le mensonge invisible.
 *
 * Pur, sans NestJS ni réseau : c'est la partie qui doit se tester sans base.
 */

/** En dessous, une citation ne prouve rien : « Java » se retrouve dans n'importe
 *  quel CV. On exige un fragment assez long pour être discriminant. */
const MIN_PROOF_CHARS = 12

/** Bornes de rendu — un CV réécrit reste un CV, pas un dossier. */
const MAX_HIGHLIGHTS = 8
const MAX_GAPS = 12
const MAX_KEYWORDS = 20

/** Texte comparable : la normalisation du matching, espaces compactés. Sert à
 *  chercher une citation dans le CV sans se faire piéger par la casse, les
 *  accents ou les retours à la ligne d'un copier-coller de PDF. */
function comparable(value: string): string {
  return normalize(value).replace(/\s+/g, ' ').trim()
}

/**
 * La citation `proof` est-elle réellement dans le CV source ?
 *
 * Une citation trop courte est refusée même si elle « matche » : elle ne prouve
 * pas que l'expérience décrite existe, seulement qu'un mot est commun.
 */
export function proofIsGrounded(proof: string, cvText: string): boolean {
  const needle = comparable(proof)
  if (needle.length < MIN_PROOF_CHARS) return false
  return comparable(cvText).includes(needle)
}

/**
 * Les manques calculés — ce que le besoin réclame et qu'on ne trouve NI dans la
 * stack déclarée NI dans le CV.
 *
 * Volontairement basé sur les mêmes termes que le matching (`targetTerms`) : le
 * CV réécrit et le score du profil parlent ainsi du même besoin. Un terme présent
 * dans le CV mais pas dans la stack n'est PAS un manque — le CV fait foi, c'est
 * lui la preuve.
 */
export function deterministicGaps(consultant: Consultant, target: MatchTarget): string[] {
  const wanted = targetTerms(target)
  if (wanted.size === 0) return []

  const proven = new Set<string>()
  for (const skill of consultant.stack) for (const term of terms(skill)) proven.add(term)
  for (const term of terms(consultant.cv_text ?? '')) proven.add(term)

  const missing = [...wanted].filter(term => !proven.has(term))
  return missing
    .slice(0, MAX_GAPS)
    .map(term => `« ${term} » est demandé par le besoin mais n'apparaît ni dans la stack déclarée ni dans le CV.`)
}

/** Déduplication en gardant l'ordre — les manques du modèle d'abord (ils sont
 *  rédigés), les manques calculés ensuite. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = comparable(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(value.trim())
  }
  return out
}

function cleanStrings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return dedupe(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)).slice(
    0,
    max,
  )
}

function readHighlights(value: unknown): CvHighlight[] {
  if (!Array.isArray(value)) return []
  const out: CvHighlight[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const title = typeof row['title'] === 'string' ? row['title'].trim() : ''
    const detail = typeof row['detail'] === 'string' ? row['detail'].trim() : ''
    const proof = typeof row['proof'] === 'string' ? row['proof'].trim() : ''
    if (!title || !detail) continue
    out.push({ title, detail, proof })
  }
  return out
}

/**
 * Transforme la sortie brute du modèle en livrable de confiance.
 *
 * Le contrat de sortie est TOUJOURS valide : un modèle qui répond n'importe quoi
 * produit un CV vide assorti d'un manque explicite, jamais un CV inventé et
 * jamais une exception. C'est ce qui permet à l'écran d'afficher le résultat sans
 * avoir à distinguer « le modèle a bien répondu » de « le modèle a dérapé ».
 */
export function sanitizeCvRewrite(
  raw: unknown,
  consultant: Consultant,
  target: MatchTarget,
  generatedAt: string,
): ConsultantCvRewrite {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const cvText = consultant.cv_text ?? ''

  const proposed = readHighlights(row['highlights'])
  const grounded = proposed.filter(h => proofIsGrounded(h.proof, cvText))
  const droppedCount = proposed.length - grounded.length

  const modelGaps = cleanStrings(row['gaps'], MAX_GAPS)
  const computedGaps = deterministicGaps(consultant, target)
  const dropNotice =
    droppedCount > 0
      ? [
          `${droppedCount} expérience(s) proposée(s) ont été retirées : leur citation est introuvable dans le CV source. ` +
            'Rien n’est ajouté à un CV qui ne le prouve pas déjà.',
        ]
      : []

  // Les mots-clés annoncés comme couverts sont eux aussi confrontés au CV : un
  // mot-clé « couvert » absent du CV source est une affirmation invérifiable.
  const cvTerms = terms(cvText)
  const stackTerms = new Set<string>()
  for (const skill of consultant.stack) for (const term of terms(skill)) stackTerms.add(term)
  const keywords = cleanStrings(row['keywords'], MAX_KEYWORDS).filter(keyword => {
    const keywordTerms = [...terms(keyword)]
    if (keywordTerms.length === 0) return false
    return keywordTerms.some(term => cvTerms.has(term) || stackTerms.has(term))
  })

  const headline = typeof row['headline'] === 'string' ? row['headline'].trim() : ''
  const summary = typeof row['summary'] === 'string' ? row['summary'].trim() : ''

  return {
    consultantName: consultant.full_name,
    missionLabel: target.label,
    // Le titre d'accroche : celui du modèle, sinon l'intitulé de poste, sinon
    // le nom. Sur une fiche sans nom NI titre (D366) il reste VIDE — `headline`
    // admet déjà la chaîne vide comme « pas d'accroche », et c'est la seule
    // valeur vraie ici. Un nom de fichier en guise de titre de CV est
    // exactement ce que ce lot a retiré à l'autre bout.
    headline: headline || consultant.title || consultant.full_name || '',
    summary,
    highlights: grounded.slice(0, MAX_HIGHLIGHTS),
    keywords,
    gaps: dedupe([...dropNotice, ...modelGaps, ...computedGaps]).slice(0, MAX_GAPS),
    generated_at: generatedAt,
  }
}

/**
 * Les compétences ÉCARTÉES d'un dossier, chacune avec sa raison (§9.2, ticket
 * BEL-ATS-202).
 *
 * Le garde-fou existant RETIRAIT en silence, avec une note globale (« N
 * expériences ont été retirées »). Le §9.2 demande l'inverse, et il a raison :
 * une compétence retirée sans un mot fait croire que le profil ne l'a pas ; une
 * compétence BARRÉE avec « déclarée, aucune preuve » dit exactement ce qu'il
 * faut dire à un client — et prépare la question qu'il posera.
 *
 * Une compétence est retenue quand le CV la mentionne OU qu'une mission la
 * prouve. Le reste est barré, jamais supprimé.
 */
export function excludedSkillsFor(
  consultant: Consultant,
  provenSkills: readonly { skill: string; source: string }[] = [],
): ExcludedSkill[] {
  const cvTerms = terms(consultant.cv_text ?? '')
  const proven = new Map<string, string>()
  for (const entry of provenSkills) {
    for (const term of terms(entry.skill)) proven.set(term, entry.source)
  }

  const excluded: ExcludedSkill[] = []
  for (const skill of consultant.stack) {
    const skillTerms = [...terms(skill)]
    if (skillTerms.length === 0) continue
    if (skillTerms.some(term => proven.get(term) === 'mission' || proven.get(term) === 'interview')) continue
    if (skillTerms.some(term => cvTerms.has(term))) continue
    excluded.push({
      term: skill,
      reason:
        proven.size > 0 && skillTerms.some(term => proven.has(term))
          ? 'déclarée — aucune mission ni entretien ne la prouve'
          : 'déclarée — absente du CV source',
    })
  }
  return excluded
}
