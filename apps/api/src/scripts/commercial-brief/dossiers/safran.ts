import type { CommercialBrief } from '@bellum/contracts'

import {
  DossierContext,
  asObject,
  asObjects,
  asPairs,
  asString,
  assertDisplayable,
  cellText,
  column,
  confidenceLabel,
  convertDossierPeople,
  limitsToGuardrails,
  listSection,
  norm,
  parseSemicolonCsv,
  rankPeople,
  sourcesSection,
  type DossierConversion,
  type JsonObject,
} from '../account-dossier'
import { DOSSIER_PROSPECT_ESN } from '../text-rules'

/**
 * Dossier de compte SAFRAN (pack de Théo du 15/10/2026, démo du 22/10 : foisonnement, data / IA, SAP et Infor M3) →
 * `CommercialBrief`, sur le cœur partagé `account-dossier.ts`.
 *
 * Particularités : un groupe de 11 sociétés qui décident chacune de leur informatique (le « foisonnement » — les statuts
 * de l'ESN prospect par société et ses priorités sont SA stratégie, écartés), deux ERP qui cohabitent (SAP S/4HANA sur
 * l'industrie, Infor M3 sur la finance : ne jamais proposer du SAP à une société sur M3), un portail achats unique
 * (digiBuy), et des contacts sans coordonnée (export LinkedIn, employeur non vérifié).
 */

type Input = { account: JsonObject; contactsCsv: string; sourcesCsv: string }

export const SAFRAN_DOMAIN = /@(?:[\w-]+\.)*safrangroup\.com$/i

const KPI_LABELS: readonly { startsWith: string; label: string }[] = [
  { startsWith: 'sociétés dans le groupe', label: 'SOCIÉTÉS DU GROUPE' },
  { startsWith: "chiffre d'affaires 2025", label: 'CHIFFRE D’AFFAIRES 2025' },
  { startsWith: 'ERP en parallèle', label: 'ERP EN PARALLÈLE' },
  { startsWith: 'utilisateurs du programme SAP Industry', label: 'PROGRAMME SAP INDUSTRY' },
  { startsWith: 'consultants observés', label: 'CONSULTANTS OBSERVÉS' },
  { startsWith: 'acheteurs Safran dans digiBuy', label: 'ACHETEURS DIGIBUY' },
]

/**
 * Les sites de chaque société, RECOPIÉS de la colonne « métier et sites » du dossier (vérifiés à la conversion). France
 * seulement : Safran Aero Boosters (Belgique) reste dans la section, sans entité ni site.
 */
const SITES: Readonly<Record<string, readonly string[]>> = {
  'Safran Aircraft Engines': ['Corbeil-Essonnes', 'Villaroche', 'Gennevilliers'],
  'Safran Electronics & Defense': ['Rennes', 'Massy', 'Éragny', 'Fougères'],
  'Safran Landing Systems': ['Vélizy', 'Bidos', 'Molsheim'],
  'Safran Nacelles': ["Gonfreville-l'Orcher", 'Le Havre'],
  'Safran Electrical & Power': ['Blagnac', 'Niort', 'Villemur'],
  'Safran Seats': ['Issoudun', 'Plaisir'],
  'Safran Cabin': ['Issoudun'],
  'Safran Transmission Systems': ['Colombes'],
  'Safran Helicopter Engines': ['Bordes', 'Tarnos'],
  'Safran Aerosystems': ['Bordeaux', 'Plaisir'],
}

const ESN_WEB_EVIDENCE: Record<string, CommercialBrief['esn'][number]['evidence_level']> = {
  fort: 'observed',
  moyen: 'observed',
  fich: 'observed',
  faible: 'hint',
}

const ORIGIN_LABEL: Record<string, string> = {
  linkedin: 'Intitulé LinkedIn : employeur non vérifié',
  base: 'Base interne de l’espace',
}

export function convertSafranDossier(input: Input): DossierConversion {
  const { account } = input
  const ctx = new DossierContext({ prospect: DOSSIER_PROSPECT_ESN['safran'] as RegExp })
  const sourceRows = parseSemicolonCsv(input.sourcesCsv)

  /* ---- meta ---- */
  const meta = asObject(ctx.take(account, 'meta'), 'meta')
  const accountName = asString(meta['account'], 'meta.account')
  const asOf = asString(meta['as_of'], 'meta.as_of')
  ctx.skip('meta (titre, identifiants de base, rendez-vous de démo de l’ESN prospect) : non affiché')
  ctx.skip('meta.statut_jems : statuts de l’ESN prospect par société (sa relation, pas le compte) : écartés')

  /* ---- personnes ---- */
  const contactRows = parseSemicolonCsv(input.contactsCsv)
  const converted = convertDossierPeople(ctx, contactRows, {
    sheet: 'contacts_safran.csv',
    name: 'nom',
    function: 'fonction',
    entity: 'societe',
    groupDomain: SAFRAN_DOMAIN,
    role: row => {
      if (cellText(row['prestataire_probable'])) return 'external'
      if (row['niveau'] === 'Direction') return 'decision_maker'
      if (row['niveau'] === 'Responsable') return 'manager'
      return 'contact'
    },
    hook: row => [
      (row['origine'] ?? '')
        .split('|')
        .map(part => ORIGIN_LABEL[part.trim()] ?? part.trim())
        .filter(Boolean)
        .join(' + '),
      cellText(row['famille']) && `Famille : ${row['famille']}`,
      cellText(row['niveau']) && `Niveau : ${row['niveau']}`,
      cellText(row['prestataire_probable']) ? 'Prestataire probable : pas un salarié de Safran' : undefined,
      row['fonction_a_revalider'] === 'Oui' ? 'Fonction à revalider avant appel' : undefined,
    ],
    dropped: {
      rang: 'rang interne (l’ordre du fichier est conservé)',
      source: 'noms de fichiers internes',
      score: 'score interne d’exploitabilité',
      a_valider_RGPD: 'note interne de l’équipe (RGPD) : pas un fait sur la personne',
    },
    read: ['famille', 'niveau', 'origine', 'prestataire_probable', 'fonction_a_revalider'],
    reliability: 'issu des fichiers',
  })
  const people = converted.people
  const contactsJson = ctx.take(account, 'contacts')
  if (!Array.isArray(contactsJson) || contactsJson.length !== contactRows.length)
    ctx.anomalies.push('contacts du JSON et du CSV : nombres différents (le CSV est lu)')
  ctx.skip('clé « contacts » : même liste que contacts_safran.csv, lu à sa place')

  /* ---- bandeau ---- */
  const kpiRows = asObjects(ctx.take(account, 'kpis'), 'kpis')
  if (kpiRows.length !== KPI_LABELS.length)
    throw new Error(`kpis : ${kpiRows.length} tuiles, ${KPI_LABELS.length} attendues`)
  const kpis: CommercialBrief['kpis'] = kpiRows.map((row, index) => {
    const label = KPI_LABELS[index] as (typeof KPI_LABELS)[number]
    const text = asString(row['libelle'], `kpis[${index}].libelle`)
    if (!text.startsWith(label.startsWith)) throw new Error(`kpis[${index}] : forme inconnue « ${text} »`)
    const caption = ctx.text(text)
    return {
      label: label.label,
      value: asString(row['valeur'], `kpis[${index}].valeur`),
      ...(caption ? { caption } : {}),
    }
  })
  ctx.cover('kpis', 'kpis', kpis.length, 'tuiles du dossier ; une phrase qui nomme l’ESN prospect n’est pas affichée')

  /* ---- ce que je sais ---- */
  const whatIKnow: CommercialBrief['what_i_know'] = []
  for (const item of asObjects(ctx.take(account, 'a_retenir'), 'a_retenir')) {
    const title = asString(item['titre'], 'a_retenir.titre')
    if (ctx.rules.prospect.test(title)) {
      ctx.skip('a_retenir : titre qui nomme l’ESN prospect (sa stratégie) : écarté')
      continue
    }
    const known = ctx.text(asString(item['texte'], 'a_retenir.texte'))
    if (!known) continue
    whatIKnow.push({ rubric: `À RETENIR ${whatIKnow.length + 1}`, known, meaning: title })
  }
  ctx.cover(
    'a_retenir',
    'what_i_know',
    whatIKnow.length,
    'le titre du dossier est « ce que ça veut dire », le texte « ce qu’on sait »',
  )

  /* ---- sociétés du groupe → entités et sites ---- */
  const companies = asObjects(ctx.take(account, 'foisonnement'), 'foisonnement')
  const companiesSection = listSection(ctx, {
    key: 'societes-du-groupe',
    title: 'LES SOCIÉTÉS DU GROUPE',
    sheet: 'foisonnement',
    items: companies,
    columns: [
      { from: 'societe', key: 'societe', label: 'SOCIÉTÉ' },
      { from: 'metier_sites', key: 'metier_sites', label: 'MÉTIER ET SITES' },
      { from: 'si', key: 'si', label: 'SYSTÈME D’INFORMATION' },
    ],
    dropped: {
      statut_jems: 'statut de l’ESN prospect dans la société (sa relation commerciale) : écarté',
      priorite: 'priorité commerciale de l’ESN prospect : sa stratégie, écartée',
    },
  })
  const entities: CommercialBrief['entities'] = [
    { name: accountName, nature: 'Groupe (Safran SA)', status: 'active', country: 'FR' },
  ]
  const sites: CommercialBrief['sites'] = [
    { name: 'Safran SA — siège', city: 'Paris', country: 'FR', kind: 'headquarters', why: 'Siège du groupe' },
  ]
  for (const company of companies) {
    const name = asString(company['societe'], 'societe')
    const metierSites = asString(company['metier_sites'], 'metier_sites')
    if (/Belgique/.test(metierSites)) {
      ctx.skip('société hors de France (Belgique) : ni entité ni site du périmètre France, gardée dans la section')
      continue
    }
    const note = ctx.text(asString(company['si'], 'si'))
    entities.push({
      name,
      nature: ctx.text(metierSites.split('. ')[0] ?? metierSites) || metierSites,
      status: 'active',
      country: 'FR',
      ...(note ? { note } : {}),
    })
    for (const city of SITES[name] ?? []) {
      if (!metierSites.includes(city)) throw new Error(`sites : « ${city} » n’est pas dans « ${metierSites} »`)
      sites.push({ name: `${name} — ${city}`, city, country: 'FR', kind: 'industrial', why: name })
    }
  }
  const legalRows = asObjects(ctx.take(account, 'legal'), 'legal')
  if (!JSON.stringify(legalRows).includes('siège à Paris')) throw new Error('legal : siège à Paris introuvable')
  ctx.cover('foisonnement', 'entities', entities.length, 'les sociétés en France ; métier et SI recopiés')
  ctx.cover('foisonnement', 'sites', sites.length, 'villes recopiées de la colonne « métier et sites » (vérifiées)')

  /* ---- SI, double ERP, signaux ---- */
  const itLandscape = listSection(ctx, {
    key: 'it-si-data',
    title: 'PAYSAGE SI',
    sheet: 'paysage_si',
    items: asObjects(ctx.take(account, 'paysage_si'), 'paysage_si'),
    columns: [
      { from: 'element', key: 'element', label: 'ÉLÉMENT' },
      { from: 'repere', key: 'horizon', label: 'REPÈRE' },
      { from: 'detail', key: 'ce_que_je_sais', label: 'CE QUE JE SAIS' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ', as: confidenceLabel },
    ],
  })
  const doubleErp = ctx
    .text(asString(ctx.take(account, 'double_erp'), 'double_erp'))
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.endsWith(':'))
  const doubleErpSection = {
    key: 'double-erp',
    title: 'DEUX ERP QUI COHABITENT',
    columns: [column('constat', 'CE QU’IL FAUT SAVOIR')],
    rows: doubleErp.map(line => ({ constat: line })),
  }
  ctx.cover('double_erp', 'sections[double-erp]', doubleErpSection.rows.length, 'une ligne par constat')
  const signals = listSection(ctx, {
    key: 'projets-2026-2027',
    title: 'SIGNAUX ET PROJETS',
    sheet: 'signaux',
    items: asObjects(ctx.take(account, 'signaux'), 'signaux'),
    columns: [
      { from: 'signal', key: 'projet_tendance', label: 'SIGNAL / PROJET' },
      { from: 'date', key: 'horizon', label: 'DATE' },
      {
        from: 'detail',
        key: 'ce_qui_est_public',
        label: 'CE QUI EST CONNU',
        as: (value, item) =>
          ctx.text(`${String(value)} Confiance : ${String(confidenceLabel(item['confiance']))}.`) || null,
      },
      { from: 'source', key: 'url', label: 'LIEN' },
    ],
    dropped: { confiance: 'recopiée dans « ce qui est connu »' },
  })

  /* ---- achats ---- */
  const tools = listSection(ctx, {
    key: 'achats-avant-d-appeler',
    title: 'ACHATS',
    sheet: 'achats',
    items: asObjects(ctx.take(account, 'achats'), 'achats'),
    columns: [
      { from: 'element', key: 'nom', label: 'ÉLÉMENT' },
      { from: 'description', key: 'ce_que_c_est', label: 'CE QUE C’EST' },
      { from: 'implication', key: 'ce_que_tu_dois_avoir_en_tete', label: 'CE QUE TU DOIS AVOIR EN TÊTE' },
      { from: 'source', key: 'source', label: 'SOURCE' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ', as: confidenceLabel },
    ],
    keep: {
      test: item => !ctx.rules.prospect.test(String(item['element'] ?? '')),
      reason:
        'élément d’achat formulé pour l’ESN prospect : écarté (les familles d’achats restent dans les autres lignes)',
    },
  })

  /* ---- marché, fiche ---- */
  const market = asObject(ctx.take(account, 'marche'), 'marche')
  const marketSection = listSection(ctx, {
    key: 'marche',
    title: 'MARCHÉ — CHIFFRES PUBLICS',
    sheet: 'marche.chiffres',
    items: asObjects(market['chiffres'], 'marche.chiffres'),
    columns: [
      { from: 'libelle', key: 'indicateur', label: 'INDICATEUR' },
      { from: 'valeur', key: 'valeur', label: 'VALEUR' },
    ],
    note: 'sources et dates : section SOURCES',
  })
  const marketDetails = listSection(ctx, {
    key: 'marche-lecture',
    title: 'MARCHÉ — LECTURE',
    sheet: 'marche.details',
    items: asObjects(market['details'], 'marche.details'),
    columns: [
      { from: 'rubrique', key: 'rubrique', label: 'RUBRIQUE' },
      { from: 'texte', key: 'ce_qui_est_public', label: 'CE QUI EST PUBLIC' },
    ],
  })
  const fiche = listSection(ctx, {
    key: 'fiche-compte',
    title: 'FICHE COMPTE',
    sheet: 'legal',
    items: legalRows,
    columns: [
      { from: 'rubrique', key: 'champ', label: 'CHAMP' },
      { from: 'texte', key: 'valeur', label: 'VALEUR' },
    ],
  })

  /* ---- ESN ---- */
  const esnBlock = asObject(ctx.take(account, 'esn'), 'esn')
  const webEsn = asObjects(esnBlock['web'], 'esn.web')
  const esn: CommercialBrief['esn'] = []
  const seen = new Set<string>()
  for (const entry of webEsn) {
    const level = asString(entry['confiance'], 'confiance')
    const evidence = ESN_WEB_EVIDENCE[level]
    if (!evidence) throw new Error(`ESN « ${String(entry['nom'])} » : confiance inconnue « ${level} »`)
    const name = asString(entry['nom'], 'nom')
    seen.add(norm(name))
    esn.push({
      name,
      evidence_level: evidence,
      proof: `${ctx.text(asString(entry['nature'], 'nature'))}. ${ctx.text(asString(entry['detail'], 'detail'))} Aucun référencement prouvé.`,
      reliability: String(confidenceLabel(level)),
    })
  }
  for (const entry of asObjects(esnBlock['base'], 'esn.base')) {
    const name = asString(entry['esn'], 'esn')
    if (seen.has(norm(name))) continue
    seen.add(norm(name))
    const n = Number(entry['profils'])
    esn.push({
      name,
      evidence_level: 'hint',
      proof: `${n} profil${n > 1 ? 's' : ''} vu${n > 1 ? 's' : ''} dans des parcours de consultants. Indice de présence : aucun référencement prouvé.`,
      reliability: 'faible',
    })
  }
  ctx.cover(
    'esn',
    'esn',
    esn.length,
    'prestataires cités (observés) puis parcours de consultants (indice) ; jamais « confirmé »',
  )
  const providers = listSection(ctx, {
    key: 'prestataires-publics',
    title: 'ESN ET INTÉGRATEURS CITÉS',
    sheet: 'esn.web',
    items: webEsn,
    columns: [
      { from: 'nom', key: 'nom', label: 'NOM' },
      { from: 'nature', key: 'nature', label: 'NATURE' },
      { from: 'detail', key: 'detail', label: 'CE QUI EST CONNU' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ', as: confidenceLabel },
    ],
  })
  const unknownEsn = Object.keys(esnBlock).filter(key => !['base', 'web', 'note'].includes(key))
  if (unknownEsn.length > 0) throw new Error(`esn : ${unknownEsn.join(', ')} sans case`)

  /* ---- consultants observés → graphiques ---- */
  const consultants = asObject(ctx.take(account, 'consultants'), 'consultants')
  const bySociety = asPairs(consultants['par_societe'], 'consultants.par_societe')
  const byFamily = asPairs(consultants['par_famille'], 'consultants.par_famille')
  const charts: CommercialBrief['charts'] = [
    { title: 'CONSULTANTS OBSERVÉS PAR SOCIÉTÉ', items: bySociety },
    { title: 'CONSULTANTS OBSERVÉS PAR FAMILLE DE MÉTIER', items: byFamily },
    {
      title: 'ESN VUES DANS LES PARCOURS (PROFILS)',
      items: asObjects(esnBlock['base'], 'esn.base').map(entry => ({
        label: String(entry['esn']),
        value: Number(entry['profils']),
      })),
    },
  ]
  ctx.cover('consultants + esn.base', 'charts', charts.length, '')

  /* ---- écartés ---- */
  ctx.drop(account, 'strategie_jems', 'stratégie de vente de l’ESN prospect : écartée (décision Louis 15/10)')
  ctx.drop(account, 'lecture_par_voie', 'notation des angles du point de vue de l’ESN prospect : sa stratégie, écartée')

  /* ---- garde-fous ---- */
  const guardrails = limitsToGuardrails(ctx, (ctx.take(account, 'limites') as string[]).map(String))
  const esnNote = ctx.text(asString(esnBlock['note'], 'esn.note'))
  if (esnNote) guardrails.push({ point: 'ESN observées', detail: esnNote })
  guardrails.push({
    point: 'Coordonnées',
    detail:
      'Le fichier de contacts ne porte ni e-mail ni téléphone : aucune coordonnée n’est semée, aucune n’est devinée. L’employeur des profils LinkedIn n’est pas vérifié.',
  })

  const brief: CommercialBrief = {
    account_name: accountName,
    generated_at: `${asOf}T00:00:00.000Z`,
    scope: 'france',
    headquarters: { label: 'Safran SA', city: 'Paris' },
    kpis,
    what_i_know: whatIKnow,
    charts,
    entities,
    sites,
    prices: [],
    esn,
    people: rankPeople(ctx, people),
    sections: [
      fiche,
      marketSection,
      marketDetails,
      companiesSection,
      itLandscape,
      doubleErpSection,
      signals,
      tools,
      providers,
      sourcesSection(ctx, sourceRows),
    ],
    guardrails,
  }
  ctx.assertAllConsumed(account)
  assertDisplayable(brief, ctx.rules)
  return { brief, coverage: ctx.coverage, skipped: ctx.skipped, anomalies: ctx.anomalies }
}
