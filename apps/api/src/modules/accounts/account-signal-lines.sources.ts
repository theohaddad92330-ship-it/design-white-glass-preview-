import {
  CRM_DEAL_SIGNAL_KINDS,
  readSignalLayers,
  type ReadSignalLayers,
  type SignalLineCandidate,
  type SignalLineType,
} from '@bellum/contracts'

/**
 * #4755 / #4756 (lot 761) — les lectures PURES de la famille Bellum du tableau « Signaux et besoins » : ce que
 * `raw_analysis` et `accounts.recent_signals` portent, en faits bruts (`SignalLineCandidate`). Aucune requête :
 * `AccountSignalLinesService` les appelle après la lecture du compte, et la salle de démonstration les rejoue
 * sur le jeu fictif (`demo-signal-lines-coverage.spec.ts`).
 */

type Record_ = Record<string, unknown>

function asRecord(value: unknown): Record_ | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record_) : null
}

export function rows(value: unknown): Record_[] {
  return Array.isArray(value) ? value.map(asRecord).filter((row): row is Record_ => row !== null) : []
}

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** Les natures qui disent un PROJET de l'entreprise (une décision, un budget, une opération) — un besoin possible. */
const PROJECT_KINDS = [
  'projet',
  'project',
  'transformation',
  'investissement',
  'budget',
  'levee_fonds',
  'levee',
  'funding',
  'expansion',
  'acquisition',
  'partenariat',
  'demenagement',
]

/**
 * La nature d'un signal (analyse, historique, CRM) → le type de ligne. Lot 767 : inconnue ⇒ « fait » (une
 * description de l'entreprise n'est PAS un besoin) — sauf `commercial` : le signal porte une implication
 * commerciale lue par l'analyse, c'est alors un projet.
 */
export function lineTypeOfKind(kind: unknown, commercial = false): SignalLineType {
  const value = (text(kind) ?? '').toLowerCase()
  if (['recrutement', 'hiring', 'job', 'job_offer', 'emploi'].includes(value)) return 'recrutement'
  if (['marche_public', 'appel_offres', 'tender', 'public_tender'].includes(value)) return 'marche_public'
  if (['legal', 'bodacc', 'annonce_legale', 'juridique'].includes(value)) return 'annonce_legale'
  if (['nomination', 'restructuration', 'equipe', 'leadership'].includes(value)) return 'equipe'
  if ((CRM_DEAL_SIGNAL_KINDS as readonly string[]).includes(value)) return 'affaire'
  if (PROJECT_KINDS.includes(value) || commercial) return 'projet'
  return 'fait'
}

/**
 * #5004.2 (recette prod 01/11 — OVH « Get your SaaS ready for AI ») — une VISION / déclaration stratégique du
 * site n'est jamais un besoin : elle ne fait AUCUNE ligne du tableau (le garde vivait dans les anciennes cartes,
 * code mort). Reconnue sur la nature que l'analyse lui donne, jamais devinée sur le texte.
 */
const VISION_KINDS = new Set([
  'vision',
  'strategie',
  'stratégie',
  'strategy',
  'declaration',
  'déclaration',
  'positionnement',
])

export function isVisionStatement(kind: unknown): boolean {
  return VISION_KINDS.has((text(kind) ?? '').toLowerCase())
}

/** Lot 769 — marques SÛRES d'une offre d'emploi dans un intitulé : H/F, F/H, contrat, stage, alternance. */
const STRONG_OFFER = /\b[hf]\s?\/\s?[fh]\b|\b(cdi|cdd|stage|stagiaire|alternance|alternant|apprentissage)\b/i
/** … et marques plus faibles : « recrute », « offre d'emploi ». « a recruté » (avec accent) n'en est PAS une. */
const WEAK_OFFER = /\brecrute\b|\boffres? d['’]emploi\b/i
/**
 * Lot 772 — les offres REFORMULÉES par l'analyse (« Viveris publie une offre CDI de … », « Une offre de Product Owner
 * a été publiée », « X recrute un ingénieur », « poste de … »). Lues sur l'intitulé SANS accent ni casse. Placées après
 * la nomination : « a recruté Marie comme chef de projet » reste un fait d'équipe.
 */
const REPHRASED_OFFER = new RegExp(
  [
    String.raw`\bpublie(nt)? une? offres? (cdi|cdd|d'emploi|de stage|d'alternance|de freelance|de mission|de poste|d'apprentissage|de [a-z])`,
    String.raw`\boffres? (d'emploi |de poste |de mission )?(de |d')[^.]{0,80}\b(a|ont) ete (publiee?s?|diffusee?s?|mise?s? en ligne)\b`,
    String.raw`\brecrute(nt)? (un|une|des|deux|trois|plusieurs|[0-9]+)\b`,
    String.raw`\b(ouvre|ouvrent|propose|proposent|publie|publient) un poste\b|\bposte (de|d'|a pourvoir)\b`,
  ].join('|'),
)

/** Une nomination ou une arrivée : un fait d'ÉQUIPE, jamais une offre. */
const NOMINATION =
  /(?<![\p{L}])(a|ont|vient de)\s+recrut[ée]s?(?![\p{L}])|(?<![\p{L}])nomm[ée]e?s?(?![\p{L}])|(?<![\p{L}])nominations?(?![\p{L}])|(?<![\p{L}])promu(e|s)?(?![\p{L}])|(?<![\p{L}])a rejoint(?![\p{L}])/iu

/**
 * Lot 771 — l'IDENTITÉ et les CHIFFRES d'une entreprise : forme sociale, capital, siège, effectif, dirigeants,
 * chiffre d'affaires, résultat, comptes annuels, « est active », rapport RSE / annuel publié ou « référencé ».
 * Lu sur l'intitulé sans accent ni casse. UN seul endroit (GA-26) : l'onglet compte et l'Historique global en vivent.
 */
const IDENTITY_FACT = new RegExp(
  [
    String.raw`\b(eurl|sasu|sarl|sas|snc|sci)\b`,
    String.raw`forme (juridique|sociale)|societe anonyme`,
    String.raw`\bcapital (social|de)\b`,
    String.raw`\bsiege( social)?\b`,
    String.raw`\beffectifs?\b`,
    String.raw`\b(gerants?|dirigeants?|representants? legaux?)\b`,
    String.raw`chiffre d'affaires|\bca\b\s*(de |en )?(20)?\d|\bresultat (net|d'exploitation)\b`,
    String.raw`\bcomptes? (annuels?|sociaux|consolides)\b|depot des comptes|\bcomptes?\b[^.]{0,30}\d`,
    String.raw`\bbilan\b|\best (toujours )?active\b|\bimmatricul`,
    String.raw`\brapports? (rse|annuel|financier|de durabilite|integre|developpement durable)\b`,
    String.raw`\best references?\b`,
  ].join('|'),
)
/** … sauf si l'intitulé dit un BESOIN : refonte, migration, appel d'offres, recrutement, programme, déploiement, lancement. */
const NEED_MARKER = new RegExp(
  [
    String.raw`\b(refonte|migration|migrer|migre|deploiement|deployer|deploie|lancement|lance|lancer|programme)\b`,
    String.raw`appels? d'offres?|\brfp\b|consultation|recrut|transformation|moderni|digitalis|externalis|infogerance`,
    String.raw`mise en place|\bchantier\b|\bprojet (de|d'|d’)|\bbudget\b`,
  ].join('|'),
)

function foldTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/’/g, "'")
}

/** Lot 771 — vrai si l'intitulé décrit l'identité ou les chiffres de l'entreprise, sans dire un besoin. */
export function isIdentityFact(title: unknown): boolean {
  const label = text(title)
  if (!label) return false
  const folded = foldTitle(label)
  return IDENTITY_FACT.test(folded) && !NEED_MARKER.test(folded)
}

/**
 * Lot 769 — le type d'une ligne CORRIGÉ par son intitulé : une offre d'emploi (H/F, CDI, stage, « recrute »…) est
 * `recrutement` même si l'analyse l'a étiquetée « projet » ou « fait » ; une nomination (« a recruté X », « nommé »)
 * reste `equipe` ; un « projet » qui décrit l'identité ou les chiffres (lot 771) est un `fait`. Les autres familles (marché public, annonce légale, affaire) ne bougent jamais.
 */
export function refineLineType(type: SignalLineType, title: unknown): SignalLineType {
  if (type === 'affaire' || type === 'marche_public' || type === 'annonce_legale') return type
  const label = text(title)
  if (!label) return type
  if (STRONG_OFFER.test(label)) return 'recrutement'
  if (NOMINATION.test(label)) return type === 'fait' || type === 'projet' ? 'equipe' : type
  if (WEAK_OFFER.test(label) || REPHRASED_OFFER.test(foldTitle(label))) return 'recrutement'
  // Lot 771 — un projet qui décrit l'identité ou les chiffres de l'entreprise est un FAIT.
  return type === 'projet' && isIdentityFact(label) ? 'fait' : type
}

function textList(value: unknown): string[] {
  // #5185 — une compétence s'écrit « Java » ou { term: 'Java' } (comme les besoins Bellum) : les deux se lisent.
  return Array.isArray(value) ? value.map(item => text(item) ?? text(asRecord(item)?.['term'])).filter(isText) : []
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Lot 771 — ce que la ligne d'une couche porte : lien, compétences, TJM. Absent = rien, jamais inventé. */
function layerExtras(need: ReadSignalLayers['historicalSignals'][number]): Partial<SignalLineCandidate> {
  return {
    url: need.url ?? null,
    technologies: need.technologies ?? [],
    tjmEur: need.tjmEur ?? null,
  }
}

/** Un signal de l'analyse (`recent_signals`, colonne ou `raw_analysis`) → un fait brut. */
function recentSignalCandidate(raw: Record_, key: string): SignalLineCandidate {
  const requester = asRecord(raw['requester'])
  const manager = asRecord(requester?.['possibleManager'])
  const attachment = asRecord(raw['offer_attachment'])
  const skills = textList(attachment?.['skills'] ?? raw['skills'] ?? raw['technologies'])
  return {
    key,
    type: refineLineType(lineTypeOfKind(raw['type'], text(raw['sales_implication']) !== null), raw['signal']),
    origin: 'analyse',
    rawDate: text(raw['date']),
    title: text(raw['signal']),
    // #5185 — sans implication commerciale, l'extrait lu dans l'offre est le détail (la recherche le lit).
    detail: text(raw['sales_implication']) ?? text(attachment?.['extract']),
    url: text(raw['url']) ?? text(attachment?.['url']),
    technologies: skills,
    tjmEur: positive(raw['tjm_eur']),
    roles: [text(manager?.['function'])],
    location: text(raw['location']),
    contractType: text(raw['contract_type']),
    team: text(requester?.['team']),
  }
}

/** Une clé stable qui ne NOMME pas l'outil d'où vient la ligne (les sources ne se nomment pas, même dans un id). */
export function opaque(...parts: string[]): string {
  let hash = 0x811c9dc5
  for (const char of parts.join('\u0000')) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

export function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** `raw_analysis` → les faits de la famille Bellum qui y vivent. */
export function analysisCandidates(rawAnalysis: unknown, recentSignalsColumn: unknown): SignalLineCandidate[] {
  const analysis = asRecord(rawAnalysis) ?? {}
  const out: SignalLineCandidate[] = []
  rows(recentSignalsColumn).forEach((row, index) => {
    if (!isVisionStatement(row['type'])) out.push(recentSignalCandidate(row, `signal:${index}`))
  })
  rows(analysis['recent_signals']).forEach((row, index) => {
    if (!isVisionStatement(row['type'])) out.push(recentSignalCandidate(row, `analysis-signal:${index}`))
  })
  rows(analysis['it_job_signals']).forEach((row, index) => {
    const title = text(row['title'])
    // #4044 — une offre de stage n'est jamais un signal.
    if (
      title &&
      /\b(stage|stagiaire|internship|intern|alternance)\b/i.test(`${title} ${text(row['contract_type']) ?? ''}`)
    ) {
      return
    }
    out.push({
      key: `job:${index}`,
      type: 'recrutement',
      origin: 'offre',
      rawDate: text(row['date']),
      title,
      detail: [text(row['contract_type']), text(row['experience'])].filter(isText).join(' · ') || null,
      url: text(row['url']),
      board: text(row['board']),
      technologies: Array.isArray(row['skills']) ? (row['skills'] as unknown[]).filter(isText) : [],
      location: text(row['city']) ?? text(row['location']),
      // #5000.1 — le contrat que l'annonce DÉCLARE ; jamais lu dans le titre.
      contractType: text(row['contract_type']),
    })
  })
  rows(analysis['public_tenders']).forEach((row, index) =>
    out.push({
      key: `tender:${index}`,
      type: 'marche_public',
      origin: 'marche',
      rawDate: text(row['published_date']),
      title: text(row['title']),
      detail: text(row['buyer']),
      url: text(row['url']),
      location: text(row['location']),
    }),
  )
  rows(analysis['awarded_contracts']).forEach((row, index) =>
    out.push({
      key: `awarded:${index}`,
      type: 'marche_public',
      origin: 'marche',
      rawDate: text(row['notified_date']),
      title: text(row['title']),
      detail: text(row['winner']),
      url: text(row['url']),
      location: text(row['location']),
    }),
  )
  rows(analysis['legal_signals']).forEach((row, index) =>
    out.push({
      key: `legal:${index}`,
      type: 'annonce_legale',
      origin: 'annonce',
      rawDate: text(row['date']),
      title: text(row['label']) ?? text(row['precision']) ?? text(row['type']),
      detail: text(row['precision']),
      url: text(row['url']),
    }),
  )
  const layers = readSignalLayers(analysis)
  layers.historicalSignals.forEach((need, index) =>
    out.push({
      key: `layer-signal:${index}`,
      // Lot 771 — la nature posée par la collecte compte (une offre rangée en archive reste une offre).
      type: refineLineType(
        lineTypeOfKind(need.kind ?? 'projet', need.commercial === true || need.kind === undefined),
        need.label,
      ),
      origin: 'analyse',
      rawDate: need.date,
      title: need.label,
      ...layerExtras(need),
    }),
  )
  layers.historicalJobOffers.forEach((need, index) =>
    out.push({
      key: `layer-job:${index}`,
      type: 'recrutement',
      origin: 'offre',
      rawDate: need.date,
      title: need.label,
      ...layerExtras(need),
    }),
  )
  const historical = asRecord(analysis['historical_needs'])
  rows(historical?.['items']).forEach((item, index) =>
    out.push({
      key: `historical:${index}`,
      // Lot 775 — une mission observée sur le marché garde son type : le titre ne la reclasse jamais en projet.
      type:
        item['source'] === 'market_path'
          ? 'mission_observee'
          : refineLineType(item['source'] === 'job_offer' ? 'recrutement' : 'projet', item['label']),
      origin: item['source'] === 'job_offer' ? 'offre' : 'memoire',
      rawDate: text(item['date']),
      title: text(item['label']),
      // Lot 769 — le lieu du besoin mémoire marché, quand il le porte (jamais deviné).
      location: text(item['location']),
      contractType: text(item['contract_type']),
      url: text(item['url']),
      technologies: textList(item['technologies'] ?? item['skills']),
      tjmEur: positive(item['tjm_eur']),
    }),
  )
  return out
}
