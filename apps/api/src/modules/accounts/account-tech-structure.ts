/**
 * #4742 — LA STRUCTURE TECHNIQUE D'UN COMPTE : CRM, ERP, outils.
 *
 * Retour Bedros × Adel (28/10/2026) : « quel outil, quel ERP, quel CRM ». La pile
 * observée (#1761) est une liste de noms ; ici chaque nom est RANGÉ dans un axe et
 * porte sa PREUVE — l'offre d'emploi qui le nomme (date + lien), ou l'analyse.
 *
 * Règles tenues (doctrine) :
 *  · une technologie n'existe ici que PROUVÉE — le catalogue sert à CLASSER ce
 *    qu'une source a nommé, jamais à deviner une pile depuis le secteur ;
 *  · un axe sans preuve reste NOMMÉ (`not_observed`) et sort du compte des axes
 *    observés — jamais « 0 », jamais une ligne vide dans une liste (GA-18/GA-19) ;
 *  · aucune source n'est nommée par son fournisseur : `kind` est une NATURE ;
 *  · une offre de stage ne prouve pas l'outil du compte (#4044).
 */

const TECH_AXES = ['crm', 'erp', 'data', 'hosting', 'business'] as const
type TechAxis = (typeof TECH_AXES)[number]

type TechProof = {
  kind: 'job_offer' | 'analysis'
  observed_at: string | null
  url: string | null
  label: string | null
}
type TechEntry = { name: string; proofs: TechProof[] }
type TechAxisRead = { axis: TechAxis; status: 'observed' | 'not_observed'; technologies: TechEntry[] }
export type TechStructure = {
  axes: TechAxisRead[]
  observed_axes: TechAxis[]
  not_observed_axes: TechAxis[]
}

type JobSignalLike = {
  title?: string | null
  date?: string | null
  contract_type?: string | null
  url?: string | null
  skills?: readonly string[] | null
}

type TechStructureInput = {
  jobSignals?: readonly JobSignalLike[] | null
  detectedTechStack?: readonly string[] | null
  analysedTechnologies?: readonly { name?: string | null }[] | null
  /** Date de collecte de l'analyse, quand on la connaît. */
  analysedAt?: string | null
}

const MAX_PROOFS_PER_TECH = 3

/** [libellé affiché, motif sur texte normalisé (minuscule, sans accent)] */
const CATALOGUE: Record<TechAxis, readonly (readonly [string, RegExp])[]> = {
  crm: [
    ['Salesforce', /\bsalesforce\b/],
    ['HubSpot', /\bhubspot\b/],
    ['Dynamics 365', /\bdynamics\s*(365|crm)\b/],
    ['Pipedrive', /\bpipedrive\b/],
    ['Zoho', /\bzoho\b/],
    ['SugarCRM', /\bsugar\s?crm\b/],
    ['Sage CRM', /\bsage\s?crm\b/],
  ],
  erp: [
    ['SAP', /\bsap\b/],
    ['Oracle ERP', /\boracle\s*(ebs|e-business|fusion|erp|jd\s?edwards)\b/],
    ['Odoo', /\bodoo\b/],
    ['Sage X3', /\bsage\s*(x3|100|1000)\b/],
    ['NetSuite', /\bnetsuite\b/],
    ['Infor', /\binfor\s*(m3|ln|cloudsuite)\b/],
    ['Cegid', /\bcegid\b/],
    ['PeopleSoft', /\bpeoplesoft\b/],
  ],
  data: [
    ['Snowflake', /\bsnowflake\b/],
    ['Databricks', /\bdatabricks\b/],
    ['Power BI', /\bpower\s?bi\b/],
    ['Tableau', /\btableau\b/],
    ['Qlik', /\bqlik\b/],
    ['BigQuery', /\bbig\s?query\b/],
    ['Talend', /\btalend\b/],
    ['Kafka', /\bkafka\b/],
    ['Airflow', /\bairflow\b/],
    ['dbt', /\bdbt\b/],
  ],
  hosting: [
    ['AWS', /\baws\b|\bamazon web services\b/],
    ['Azure', /\bazure\b/],
    ['Google Cloud', /\bgcp\b|\bgoogle cloud\b/],
    ['OVHcloud', /\bovh(\s?cloud)?\b/],
    ['Outscale', /\boutscale\b/],
    ['OpenShift', /\bopenshift\b/],
    ['Kubernetes', /\bkubernetes\b|\bk8s\b/],
    ['VMware', /\bvmware\b/],
  ],
  business: [
    ['ServiceNow', /\bservicenow\b/],
    ['Jira', /\bjira\b/],
    ['Workday', /\bworkday\b/],
    ['SharePoint', /\bsharepoint\b/],
    ['Microsoft 365', /\bmicrosoft\s?365\b|\boffice\s?365\b/],
    ['Docusign', /\bdocusign\b/],
    ['Zendesk', /\bzendesk\b/],
    ['Coupa', /\bcoupa\b/],
  ],
}

function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function classify(text: string | null | undefined): { axis: TechAxis; name: string }[] {
  if (!text?.trim()) return []
  const haystack = normalise(text)
  const hits: { axis: TechAxis; name: string }[] = []
  for (const axis of TECH_AXES) {
    for (const [name, pattern] of CATALOGUE[axis]) {
      if (pattern.test(haystack)) hits.push({ axis, name })
    }
  }
  return hits
}

export function buildTechStructure(input: TechStructureInput): TechStructure {
  const found = new Map<string, { axis: TechAxis; name: string; proofs: TechProof[] }>()
  const add = (hit: { axis: TechAxis; name: string }, proof: TechProof) => {
    const key = `${hit.axis}:${hit.name}`
    const entry = found.get(key) ?? { ...hit, proofs: [] }
    entry.proofs.push(proof)
    found.set(key, entry)
  }

  for (const offer of input.jobSignals ?? []) {
    if (/stage|alternance/i.test(offer.contract_type ?? '')) continue
    const title = offer.title?.trim() || null
    const seenInOffer = new Set<string>()
    for (const text of [...(offer.skills ?? []), offer.title]) {
      for (const hit of classify(text)) {
        const key = `${hit.axis}:${hit.name}`
        if (seenInOffer.has(key)) continue
        seenInOffer.add(key)
        add(hit, { kind: 'job_offer', observed_at: offer.date ?? null, url: offer.url ?? null, label: title })
      }
    }
  }

  const analysed = [...(input.detectedTechStack ?? []), ...(input.analysedTechnologies ?? []).map(t => t.name)]
  for (const text of analysed) {
    for (const hit of classify(text)) {
      add(hit, { kind: 'analysis', observed_at: input.analysedAt ?? null, url: null, label: null })
    }
  }

  const axes: TechAxisRead[] = TECH_AXES.map(axis => {
    const technologies: TechEntry[] = [...found.values()]
      .filter(entry => entry.axis === axis)
      .map(entry => ({
        name: entry.name,
        proofs: dedupe(entry.proofs)
          .sort((a, b) => (b.observed_at ?? '').localeCompare(a.observed_at ?? ''))
          .slice(0, MAX_PROOFS_PER_TECH),
      }))
    return { axis, status: technologies.length > 0 ? 'observed' : 'not_observed', technologies }
  })

  return {
    axes,
    observed_axes: axes.filter(a => a.status === 'observed').map(a => a.axis),
    not_observed_axes: axes.filter(a => a.status === 'not_observed').map(a => a.axis),
  }
}

function dedupe(proofs: readonly TechProof[]): TechProof[] {
  const seen = new Set<string>()
  return proofs.filter(proof => {
    const key = `${proof.kind}|${proof.observed_at}|${proof.url}|${proof.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
