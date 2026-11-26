import type { CommercialBrief } from '@bellum/contracts'

import {
  DossierContext,
  addCitedPeople,
  asObject,
  asObjects,
  asString,
  assertDisplayable,
  cellText,
  confidenceLabel,
  column,
  convertDossierPeople,
  frNumber,
  joinParts,
  limitsToGuardrails,
  listSection,
  norm,
  parseSemicolonCsv,
  rankPeople,
  sourcesSection,
  type DossierConversion,
  type Json,
  type JsonObject,
} from '../account-dossier'
import { DOSSIER_PROSPECT_ESN } from '../text-rules'

/**
 * Dossier de compte CRÉDIT AGRICOLE (pack de Théo du 15/10/2026, démo du 19/10) → `CommercialBrief`.
 *
 * Mapping propre au compte, sur le cœur partagé `account-dossier.ts`. Ce que ce dossier a de particulier : deux maisons
 * IT (CAGIP, CA-TS), des identifiants légaux issus de fiches tierces (confiance faible), des besoins du CRM interne dont
 * le TJM et le statut ne se montrent pas (consigne du pack), trois contacts en liste noire (non semés), et les zones de
 * l'ESN prospect — gardées comme répartition des consultants observés, sans nommer l'ESN.
 */

type Input = { account: JsonObject; contactsCsv: string; sourcesCsv: string }

/** Les domaines du groupe Crédit Agricole : seules adresses PROFESSIONNELLES reprises. */
export const CREDIT_AGRICOLE_DOMAIN =
  /@(?:[\w-]+\.)*(?:credit-agricole(?:-sa)?\.(?:com|fr)|ca-[\w-]+\.(?:com|fr)|lcl\.fr|amundi\.(?:com|fr)|caceis\.com)$/i

const ESN_EVIDENCE: Record<string, CommercialBrief['esn'][number]['evidence_level']> = {
  probable: 'observed',
  'indice faible': 'hint',
}

/** Chaque chiffre de marché : son chemin dans `marche`, son libellé, son unité, sa source (préfixe dans `sources.csv`). */
const MARKET: readonly { path: string; label: string; unit: string; source: string }[] = [
  {
    path: 's1_2026_resultat_net_part_groupe_md_eur',
    label: 'Résultat net part du groupe S1 2026',
    unit: 'Md€',
    source: 'XTB',
  },
  { path: 's1_2026_pnb_groupe_md_eur', label: 'PNB du groupe S1 2026', unit: 'Md€', source: 'XTB' },
  { path: 't2_2026_pnb_casa_md_eur', label: 'PNB de Crédit Agricole S.A. au T2 2026', unit: 'Md€', source: 'XTB' },
  { path: 'rote_s1_2026_pct', label: 'RoTE S1 2026', unit: '%', source: 'XTB' },
  { path: 'cet1_groupe_pct', label: 'Ratio CET1 du groupe', unit: '%', source: 'XTB' },
  { path: 'cet1_casa_pct', label: 'Ratio CET1 de Crédit Agricole S.A.', unit: '%', source: 'XTB' },
  {
    path: 'act_2028.rnpg_2028_md_eur',
    label: 'Plan ACT 2028 — résultat net part du groupe visé',
    unit: 'Md€',
    source: 'Option Finance - ACT 2028',
  },
  { path: 'act_2028.rote_pct', label: 'Plan ACT 2028 — RoTE visé', unit: '%', source: 'Option Finance - ACT 2028' },
  {
    path: 'act_2028.coef_exploitation_pct',
    label: 'Plan ACT 2028 — coefficient d’exploitation visé',
    unit: '%',
    source: 'Option Finance - ACT 2028',
  },
  {
    path: 'act_2028.economies_meur',
    label: 'Plan ACT 2028 — économies (dont rationalisation IT)',
    unit: 'M€',
    source: 'Option Finance - ACT 2028',
  },
  {
    path: 'ia.budget_2026_2028_meur',
    label: 'IA — budget 2026-2028',
    unit: 'M€',
    source: 'Option Finance - déploiement',
  },
  {
    path: 'ia.societe_ia_meur',
    label: 'IA — création de la société interne',
    unit: 'M€',
    source: 'Le Monde Informatique - Crédit Agricole crée',
  },
  {
    path: 'ia.operationnelle',
    label: 'IA — société interne opérationnelle',
    unit: '',
    source: 'Le Monde Informatique - Crédit Agricole crée',
  },
  {
    path: 'ia.effectif_phase1',
    label: 'IA — effectif de la première phase',
    unit: 'personnes',
    source: 'Le Monde Informatique - Crédit Agricole crée',
  },
  {
    path: 'it.budget_2026_md_eur',
    label: 'Budget IT 2026',
    unit: 'Md€',
    source: 'Le Monde Informatique - Entretien Olivier Biton',
  },
  {
    path: 'it.filiere_tech_personnes',
    label: 'Filière technologique',
    unit: 'personnes',
    source: 'Le Monde Informatique - Entretien Olivier Biton',
  },
  {
    path: 'it.legacy_a_demonter_pct',
    label: 'Patrimoine legacy à démonter',
    unit: '%',
    source: 'Le Monde Informatique - Entretien Olivier Biton',
  },
  {
    path: 'it.horizon_ans',
    label: 'Horizon du démantèlement du legacy',
    unit: 'ans',
    source: 'Le Monde Informatique - Entretien Olivier Biton',
  },
  {
    path: 'it.salles_ia_meur',
    label: 'Nouvelles salles IA et calcul intensif',
    unit: 'M€',
    source: 'Le Monde Informatique - Entretien Olivier Biton',
  },
  {
    path: 'caisse_centre_est_2025.pnb_meur',
    label: 'Crédit Agricole Centre-Est — PNB 2025',
    unit: 'M€',
    source: 'Lyon Capitale',
  },
  {
    path: 'caisse_centre_est_2025.salaries',
    label: 'Crédit Agricole Centre-Est — salariés',
    unit: '',
    source: 'Lyon Capitale',
  },
  {
    path: 'caisse_alpes_provence_s1_2026.pnb_meur',
    label: 'Crédit Agricole Alpes Provence — PNB S1 2026',
    unit: 'M€',
    source: 'Boursedirect',
  },
  {
    path: 'caisse_alpes_provence_s1_2026.rn_individuel_meur',
    label: 'Crédit Agricole Alpes Provence — résultat net individuel S1 2026',
    unit: 'M€',
    source: 'Boursedirect',
  },
]

/** Les feuilles de `marche` qui ne sont pas un chiffre : leur sort est écrit. */
const MARKET_META: Readonly<Record<string, string>> = {
  'act_2028.date': 'daté dans le libellé de la source (Option Finance du 18/11/2025)',
  sources: 'codes de source internes : remplacés par la source nommée de chaque ligne',
  confiance: 'recopiée dans la colonne FIABILITÉ de chaque ligne',
}

const leaves = (value: JsonObject, prefix = ''): [string, Json][] =>
  Object.entries(value).flatMap(([key, child]): [string, Json][] =>
    typeof child === 'object' && child !== null && !Array.isArray(child)
      ? leaves(child, `${prefix}${key}.`)
      : [[`${prefix}${key}`, child]],
  )

const formatValue = (value: Json, unit: string): string => {
  const text = typeof value === 'number' ? frNumber(value) : String(value)
  if (!unit) return text
  return unit === '%' ? `${text} %` : `${text} ${unit}`
}

const LEGAL_FIELDS: Readonly<Record<string, string>> = {
  denomination: 'Dénomination',
  siren: 'SIREN',
  forme: 'Forme juridique',
  naf: 'Code NAF',
  siege: 'Siège',
  creation: 'Création',
  effectif: 'Effectif',
}

export function convertCreditAgricoleDossier(input: Input): DossierConversion {
  const { account } = input
  const ctx = new DossierContext({ prospect: DOSSIER_PROSPECT_ESN['credit-agricole'] as RegExp })
  const sourceRows = parseSemicolonCsv(input.sourcesCsv)
  const sourceOf = (prefix: string): Record<string, string> => {
    const found = sourceRows.find(row => (row['source'] ?? '').startsWith(prefix))
    if (!found) throw new Error(`sources.csv : aucune source « ${prefix} »`)
    return found
  }

  /* ---- meta ---- */
  const meta = asObject(ctx.take(account, 'meta'), 'meta')
  const accountName = asString(meta['account'], 'meta.account')
  const asOf = asString(meta['as_of'], 'meta.as_of')
  ctx.skip('meta (titre, identifiant de base, rendez-vous de démo de l’ESN prospect) : non affiché')

  /* ---- personnes ---- */
  const contactRows = parseSemicolonCsv(input.contactsCsv)
  const converted = convertDossierPeople(ctx, contactRows, {
    sheet: 'contacts_credit_agricole.csv',
    name: 'nom',
    function: 'fonction',
    entity: 'entite',
    city: 'ville',
    groupEmails: 'emails_domaine_groupe_CA',
    otherEmails: 'autres_emails',
    mobile: 'mobile',
    linkedin: 'linkedin',
    groupDomain: CREDIT_AGRICOLE_DOMAIN,
    blacklist: 'blacklist_CRM',
    role: row =>
      row['decideur_ou_prescripteur'] === 'Oui'
        ? 'decision_maker'
        : row['en_poste_export_2024'] === 'Oui'
          ? cellText(row['esn_actuelle'])
            ? 'external'
            : 'contact'
          : 'alumni',
    hook: row => [
      cellText(row['origine']),
      cellText(row['famille_fonction']) && `Famille : ${row['famille_fonction']}`,
      row['en_poste_export_2024'] === 'Oui'
        ? 'En poste dans l’export 2024 (à revalider)'
        : 'Non listé en poste dans l’export 2024',
      cellText(row['esn_actuelle']) && `ESN actuelle : ${row['esn_actuelle']}`,
    ],
    dropped: {
      rang_exploitabilite: 'rang interne (l’ordre du fichier est conservé)',
      metropole: 'regroupement de la ville, déjà portée par la fiche',
      zone_soluxan: 'zone commerciale de l’ESN prospect : non affichée',
      statut_CRM: 'statut de NOTRE relation commerciale (contactabilité) : notre activité, pas le compte',
      score: 'score interne d’exploitabilité',
    },
    read: ['decideur_ou_prescripteur', 'en_poste_export_2024', 'esn_actuelle', 'origine', 'famille_fonction'],
  })
  const people = converted.people

  /* ---- marché ---- */
  const market = asObject(ctx.take(account, 'marche'), 'marche')
  const confidence = asString(market['confiance'], 'marche.confiance')
  const known = new Set([...MARKET.map(m => m.path), ...Object.keys(MARKET_META)])
  const unknownLeaves = leaves(market).filter(([path]) => !known.has(path))
  if (unknownLeaves.length > 0)
    throw new Error(`marche : chiffre(s) sans case : ${unknownLeaves.map(([p]) => p).join(', ')}`)
  const leafValue = new Map(leaves(market))
  for (const reason of Object.values(MARKET_META)) ctx.skip(`marche : ${reason}`)
  const marketSection = {
    key: 'marche',
    title: 'MARCHÉ — CHIFFRES PUBLICS',
    columns: [
      column('indicateur', 'INDICATEUR'),
      column('valeur', 'VALEUR'),
      column('source', 'SOURCE'),
      column('url', 'LIEN'),
      column('consulte_le', 'CONSULTÉ LE'),
      column('fiabilite', 'FIABILITÉ'),
    ],
    rows: MARKET.map(entry => {
      const value = leafValue.get(entry.path)
      if (value === undefined || value === null) throw new Error(`marche : « ${entry.path} » absent`)
      const source = sourceOf(entry.source)
      return {
        indicateur: entry.label,
        valeur: formatValue(value, entry.unit),
        source: source['source'] ?? '',
        url: source['url'] ?? '',
        consulte_le: source['date_consultation'] ?? '',
        fiabilite: confidence,
      }
    }),
  }
  ctx.cover(
    'marche',
    'sections[marche]',
    marketSection.rows.length,
    'chaque chiffre porte sa source, son lien et sa date',
  )

  /* ---- fiche légale ---- */
  const legal = asObject(ctx.take(account, 'legal'), 'legal')
  const ficheRows: Record<string, string>[] = []
  for (const [entityKey, label] of [
    ['credit_agricole_sa', 'Crédit Agricole S.A.'],
    ['ca_ts', 'CA-TS'],
  ] as const) {
    const block = asObject(legal[entityKey], `legal.${entityKey}`)
    const reliability = asString(block['confiance'], `legal.${entityKey}.confiance`)
    for (const [key, value] of Object.entries(block)) {
      if (key === 'confiance') continue
      const field = LEGAL_FIELDS[key]
      if (!field) throw new Error(`legal.${entityKey} : champ « ${key} » sans case`)
      ficheRows.push({ champ: `${label} — ${field}`, valeur: ctx.text(asString(value, key)), fiabilite: reliability })
    }
  }
  const kbis = asString(legal['kbis_capital_bilans'], 'legal.kbis_capital_bilans')
  ficheRows.push({ champ: 'Kbis, capital, bilans', valeur: kbis, fiabilite: 'non trouvé' })
  const unknownLegal = Object.keys(legal).filter(
    key => !['credit_agricole_sa', 'ca_ts', 'kbis_capital_bilans'].includes(key),
  )
  if (unknownLegal.length > 0) throw new Error(`legal : ${unknownLegal.join(', ')} sans case`)
  ctx.cover('legal', 'sections[fiche-compte]', ficheRows.length, 'identifiants de fiches tierces : confiance recopiée')
  const casa = asObject(legal['credit_agricole_sa'], 'legal.credit_agricole_sa')
  const cats = asObject(legal['ca_ts'], 'legal.ca_ts')

  /* ---- structure → entités et sites ---- */
  const structure = asObjects(ctx.take(account, 'structure'), 'structure')
  const entities: CommercialBrief['entities'] = []
  const sites: CommercialBrief['sites'] = []
  for (const [index, entry] of structure.entries()) {
    const unknown = Object.keys(entry).filter(
      key => !['entite', 'role', 'statut', 'sites', 'confiance', 'presentes_perimetre'].includes(key),
    )
    if (unknown.length > 0) throw new Error(`structure[${index}] : ${unknown.join(', ')} sans case`)
    const name = asString(entry['entite'], `structure[${index}].entite`)
    const role = cellText(entry['role'] as string | undefined)
    const statut = cellText(entry['statut'] as string | undefined)
    const reliability = cellText(entry['confiance'] as string | undefined)
    const siteList = Array.isArray(entry['sites']) ? entry['sites'].map(String) : []
    const perimeter = Array.isArray(entry['presentes_perimetre']) ? entry['presentes_perimetre'].map(String) : []
    const note = joinParts(
      [
        role && statut && `Statut : ${statut}.`,
        siteList.length > 0 && `Sites : ${siteList.join(', ')}.`,
        perimeter.length > 0 && `Caisses du périmètre : ${perimeter.join(', ')}.`,
      ],
      ' ',
    )
    entities.push({
      name,
      ...(role || statut ? { nature: (role ?? statut) as string } : {}),
      status: 'active',
      country: 'FR',
      ...(note ? { note } : {}),
      ...(reliability ? { reliability } : {}),
    })
    for (const city of siteList) {
      sites.push({
        name: `${name} — ${city}`,
        city,
        country: 'FR',
        kind: 'secondary',
        why: role ?? name,
        ...(reliability ? { reliability } : {}),
      })
    }
  }
  ctx.cover('structure', 'entities', entities.length, 'confiance recopiée quand le dossier en donne une ; sinon aucune')
  ctx.cover('structure[].sites', 'sites', sites.length, 'sites de CAGIP et CA-TS cités au dossier ; aucun site siège')

  const sitesBlock = asObject(ctx.take(account, 'sites'), 'sites')
  const cities = asObjects(sitesBlock['villes_consultants'], 'sites.villes_consultants')
  const citiesNote = asString(sitesBlock['note'], 'sites.note')
  const citiesSection = listSection(ctx, {
    key: 'villes-consultants',
    title: 'VILLES DES CONSULTANTS (PAS DES SITES DU CLIENT CONFIRMÉS)',
    sheet: 'sites.villes_consultants',
    items: cities,
    columns: [
      { from: 'metropole', key: 'metropole', label: 'MÉTROPOLE' },
      { from: 'consultants', key: 'consultants', label: 'CONSULTANTS' },
      { from: 'en_poste_2024', key: 'en_poste_2024', label: 'EN POSTE (EXPORT 2024)' },
      { from: 'avec_email', key: 'avec_email', label: 'AVEC E-MAIL (TOUTES ADRESSES CONNUES)' },
    ],
    note: citiesNote,
  })
  const officialSites = listSection(ctx, {
    key: 'sites-officiels',
    title: 'SITES OFFICIELS',
    sheet: 'sites.sites_officiels',
    items: asObjects(sitesBlock['sites_officiels'], 'sites.sites_officiels'),
    columns: [
      { from: 'entite', key: 'entite', label: 'ENTITÉ' },
      { from: 'sites', key: 'sites', label: 'SITES' },
      { from: 'date_source', key: 'date_source', label: 'DATE DE LA SOURCE' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ' },
    ],
  })

  /* ---- zones (de l'ESN prospect) → répartition des consultants observés ---- */
  const zones = asObject(ctx.take(account, 'zones_soluxan'), 'zones_soluxan')
  const zoneItems = Object.entries(zones).map(([zone, value]) => {
    const block = asObject(value, `zones.${zone}`)
    const families = Array.isArray(block['familles'])
      ? block['familles']
          .map(pair => (Array.isArray(pair) ? `${String(pair[0])} ${String(pair[1])}` : String(pair)))
          .join(' · ')
      : ''
    return {
      zone,
      consultants_observes: block['consultants_observes'] ?? null,
      en_poste_2024: block['en_poste_2024'] ?? null,
      familles: families,
    }
  })
  const zonesSection = listSection(ctx, {
    key: 'consultants-par-zone',
    title: 'CONSULTANTS OBSERVÉS PAR ZONE (VILLE DU CONSULTANT)',
    sheet: 'zones',
    items: zoneItems as JsonObject[],
    columns: [
      { from: 'zone', key: 'zone', label: 'ZONE' },
      { from: 'consultants_observes', key: 'consultants_observes', label: 'CONSULTANTS OBSERVÉS' },
      { from: 'en_poste_2024', key: 'en_poste_2024', label: 'EN POSTE (EXPORT 2024)' },
      { from: 'familles', key: 'familles', label: 'FAMILLES DE MÉTIER' },
    ],
    note: 'zones de la démo, gardées comme répartition des consultants ; l’ESN prospect n’est pas nommée',
  })

  /* ---- ESN ---- */
  const esnRows = asObjects(ctx.take(account, 'esn_sur_place'), 'esn_sur_place')
  const esn: CommercialBrief['esn'] = esnRows.map((entry, index) => {
    const name = asString(entry['esn'], `esn_sur_place[${index}].esn`)
    const level = asString(entry['confiance'], `esn_sur_place[${index}].confiance`)
    const evidence = ESN_EVIDENCE[level]
    if (!evidence) throw new Error(`ESN « ${name} » : confiance inconnue « ${level} »`)
    const n = Number(entry['consultants'])
    return {
      name,
      evidence_level: evidence,
      proof: `${n} consultant${n > 1 ? 's' : ''} observé${n > 1 ? 's' : ''} en poste chez ${accountName} (export 2024, à revalider). Présence observée : aucun référencement confirmé.`,
      reliability: level,
    }
  })
  ctx.cover('esn_sur_place', 'esn', esn.length, 'jamais « confirmé » : aucun panel ESN public trouvé')

  const partners = listSection(ctx, {
    key: 'partenaires',
    title: 'INTÉGRATEURS ET PARTENAIRES',
    sheet: 'intermediaires_et_partenaires',
    items: asObjects(ctx.take(account, 'intermediaires_et_partenaires'), 'intermediaires_et_partenaires'),
    columns: [
      { from: 'nom', key: 'nom', label: 'NOM' },
      { from: 'role', key: 'role', label: 'RÔLE' },
      { from: 'source', key: 'source', label: 'SOURCE' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ' },
    ],
    keep: {
      test: item => !/CRM/i.test(String(item['source'] ?? '')),
      reason: 'intermédiaire tiré de NOTRE CRM (notre activité commerciale) : non affiché',
    },
  })

  /* ---- achats ---- */
  const purchasing = asObject(ctx.take(account, 'achats'), 'achats')
  const tools = listSection(ctx, {
    key: 'achats-avant-d-appeler',
    title: 'ACHATS',
    sheet: 'achats.outils',
    items: asObjects(purchasing['outils'], 'achats.outils'),
    columns: [
      { from: 'outil', key: 'nom', label: 'ÉLÉMENT' },
      { from: 'detail', key: 'ce_que_c_est', label: 'CE QUE C’EST' },
      { from: 'preuve', key: 'preuve', label: 'PREUVE' },
      { from: 'source', key: 'source', label: 'SOURCE' },
      {
        from: 'confiance',
        key: 'fiabilite',
        label: 'FIABILITÉ',
        as: confidenceLabel,
      },
    ],
  })
  tools.rows.push(
    {
      nom: 'Accessibilité de la base',
      ce_que_c_est: ctx.text(asString(purchasing['accessibilite_base'], 'achats.accessibilite_base')),
      preuve: null,
      source: null,
      fiabilite: 'issu des fichiers',
    },
    {
      nom: 'Non trouvé',
      ce_que_c_est: (purchasing['non_trouve'] as string[]).join(' · '),
      preuve: 'Ne rien affirmer : à qualifier directement auprès de l’acheteur.',
      source: null,
      fiabilite: 'non trouvé',
    },
  )
  const unknownPurchasing = Object.keys(purchasing).filter(
    k => !['outils', 'accessibilite_base', 'non_trouve'].includes(k),
  )
  if (unknownPurchasing.length > 0) throw new Error(`achats : ${unknownPurchasing.join(', ')} sans case`)

  /* ---- besoins ---- */
  const needs = listSection(ctx, {
    key: 'besoins-en-base',
    title: 'BESOINS EN BASE',
    sheet: 'besoins',
    items: asObjects(ctx.take(account, 'besoins'), 'besoins'),
    columns: [
      { from: 'title', key: 'besoin', label: 'BESOIN' },
      { from: 'date', key: 'date', label: 'DATE', as: value => cellText(value as string) ?? 'non trouvé' },
      { from: 'client', key: 'entite', label: 'ENTITÉ', as: value => cellText(value as string) ?? 'non trouvé' },
      { from: 'site', key: 'lieu', label: 'LIEU' },
      { from: 'ao', key: 'appel_d_offres', label: 'APPEL D’OFFRES' },
      { from: 'onsite', key: 'sur_site', label: 'SUR SITE' },
      {
        from: 'contact',
        key: 'contact',
        label: 'CONTACT',
        as: value => {
          const text = cellText(value as string)
          return text && text !== '-' ? ctx.text(text) : 'non trouvé'
        },
      },
    ],
    dropped: {
      year: 'redondant avec la date',
      tjm: 'TJM de vente et d’achat du CRM interne : la consigne du dossier interdit de le montrer',
      status: 'statut de NOTRE réponse au besoin (perdu, abandonné) : la consigne du dossier interdit de le montrer',
      channel: 'canal par lequel NOUS avons reçu le besoin : notre activité commerciale',
      origin: 'nom d’un fichier interne',
    },
    note: 'date, entité ou contact absents = « non trouvé »',
  })

  const presence = asObject(ctx.take(account, 'presence_sur_site'), 'presence_sur_site')
  const presenceRows = [
    ...asObjects(presence['valeurs_en_base'], 'presence_sur_site.valeurs_en_base').map(item => ({
      perimetre: asString(item['besoin'], 'besoin'),
      valeur: `${String(item['jours_sur_site'])} j sur site / ${String(item['jours_par_semaine'])} j`,
      annee: String(item['annee']),
    })),
    { perimetre: 'CAGIP et CA-TS', valeur: asString(presence['cagip_ca_ts'], 'cagip_ca_ts'), annee: null },
    {
      perimetre: 'Lieux cités dans les besoins',
      valeur: (presence['lieux_cites'] as string[]).join(' · '),
      annee: null,
    },
  ]
  ctx.skip('presence_sur_site.valeurs_en_base.statut : statut de NOTRE réponse au besoin : non affiché')
  ctx.cover(
    'presence_sur_site',
    'sections[presence-sur-site]',
    presenceRows.length,
    'une seule valeur en base ; CAGIP et CA-TS : non trouvé',
  )

  /* ---- projets ---- */
  const projects = asObjects(ctx.take(account, 'projets'), 'projets')
  const projectsSection = listSection(ctx, {
    key: 'projets-2026-2027',
    title: 'PROJETS 2026-2027',
    sheet: 'projets',
    items: projects,
    columns: [
      { from: 'projet', key: 'projet_tendance', label: 'PROJET / TENDANCE' },
      { from: 'date', key: 'horizon', label: 'HORIZON' },
      {
        from: 'detail',
        key: 'ce_qui_est_public',
        label: 'CE QUI EST PUBLIC',
        as: (value, item) => ctx.text(`${String(value)} Confiance : ${String(item['confiance'])}.`),
      },
      { from: 'source', key: 'url', label: 'LIEN' },
    ],
    dropped: { confiance: 'recopiée dans « ce qui est public »' },
    note: 'horizon et confiance recopiés ; aucune « offre à monter » inventée',
  })

  /* ---- dirigeants et décideurs ---- */
  const leaders = asObjects(ctx.take(account, 'dirigeants_publics'), 'dirigeants_publics')
  const leadersSection = listSection(ctx, {
    key: 'dirigeants-publics',
    title: 'DIRIGEANTS PUBLICS',
    sheet: 'dirigeants_publics',
    items: leaders,
    columns: [
      { from: 'nom', key: 'nom', label: 'NOM' },
      { from: 'fonction', key: 'fonction', label: 'FONCTION' },
      { from: 'source', key: 'source', label: 'SOURCE' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ' },
    ],
  })
  addCitedPeople(
    ctx,
    people,
    leaders.map(leader => ({
      name: asString(leader['nom'], 'nom'),
      function: asString(leader['fonction'], 'fonction'),
      entity: accountName,
      hook: `Dirigeant cité publiquement (${asString(leader['source'], 'source')}) ; aucune coordonnée au dossier`,
      reliability: asString(leader['confiance'], 'confiance'),
    })),
    'dirigeants_publics',
  )

  const deciders = asObjects(ctx.take(account, 'decideurs_base'), 'decideurs_base')
  const peopleByName = new Map(people.map(person => [norm(person.name), person]))
  const decidersSection = listSection(ctx, {
    key: 'decideurs',
    title: 'DÉCIDEURS ET PRESCRIPTEURS',
    sheet: 'decideurs_base',
    items: deciders,
    columns: [
      { from: 'nom', key: 'nom', label: 'NOM' },
      { from: 'fonction', key: 'fonction', label: 'FONCTION' },
      { from: 'entite', key: 'entite', label: 'ENTITÉ' },
      { from: 'ville', key: 'ville', label: 'VILLE' },
      {
        from: 'emails',
        key: 'email',
        label: 'E-MAIL',
        as: value => {
          const kept = (Array.isArray(value) ? value.map(String) : []).filter(email =>
            CREDIT_AGRICOLE_DOMAIN.test(email),
          )
          return kept.length > 0 ? kept.join(' | ') : null
        },
      },
      { from: 'mobile', key: 'mobile', label: 'MOBILE' },
    ],
    note: 'adresses hors domaine du groupe non reprises',
  })
  for (const decider of deciders) {
    const found = peopleByName.get(norm(asString(decider['nom'], 'nom')))
    if (!found) ctx.anomalies.push(`« ${String(decider['nom'])} » : décideur du dossier absent du CSV de contacts`)
    else found.role = 'decision_maker'
  }

  /* ---- écartés ---- */
  ctx.drop(account, 'strategie_soluxan', 'stratégie de vente de l’ESN prospect : écartée (décision Louis 15/10)')
  ctx.drop(account, 'a_verifier_terrain', 'préparation interne de la démo (questions à l’ESN prospect) : écartée')

  /* ---- limites ---- */
  const guardrails = limitsToGuardrails(ctx, (ctx.take(account, 'limites') as string[]).map(String))
  guardrails.push(
    { point: 'Villes des consultants', detail: `${citiesNote} : les villes ne sont pas des sites du client.` },
    {
      point: 'Coordonnées',
      detail:
        'Seules les adresses du groupe Crédit Agricole sont reprises ; les autres (employeur tiers, boîte personnelle) ne le sont pas. Les contacts marqués « ne pas contacter » au CRM ne sont pas repris. Aucune coordonnée n’est devinée.',
    },
    {
      point: 'Référencement',
      detail: 'Une présence observée n’est pas un référencement : aucun panel ESN public n’a été trouvé.',
    },
  )

  /* ---- bandeau ---- */
  // Recette prod 16/10 : la tuile disait 396 (le fichier) quand l'onglet Personnes en compte 403 (+ 7 dirigeants cités),
  // « 11 décideurs » quand l'écran en compte 18. Un chiffre qui décrit les personnes semées = ce que l'écran compte.
  const rankedPeople = rankPeople(ctx, people)
  const totalPeople = rankedPeople.length
  const withEmail = rankedPeople.filter(person => person.email).length
  const withMobile = rankedPeople.filter(person => person.mobile).length
  const decisionMakers = rankedPeople.filter(person => person.role === 'decision_maker').length
  const k = asObject(ctx.take(account, 'kpis'), 'kpis')
  if (k['esn_referencement_confirme'] !== 0)
    throw new Error('esn_referencement_confirme n’est plus 0 : le libellé « Aucun confirmé » est à revoir')
  const lmi = sourceOf('Le Monde Informatique - Entretien Olivier Biton')
  const kpis: CommercialBrief['kpis'] = [
    {
      label: 'CONSULTANTS OBSERVÉS',
      value: Number(k['consultants_observes']),
      caption: `${String(k['comptes_rattaches'])} comptes rattachés au groupe`,
    },
    {
      label: 'EN POSTE (EXPORT 2024)',
      value: Number(k['consultants_en_poste_export_2024']),
      caption: 'À revalider avant tout usage commercial',
    },
    {
      label: 'ESN VUES EN POSTE',
      value: Number(k['esn_vues_en_poste']),
      caption: `${String(k['esn_anciennes'])} anciennes · ${String(k['esn_rang2_ouvert'])} en rang 2 ouvert`,
    },
    { label: 'RÉFÉRENCEMENT ESN', value: 'Aucun confirmé', caption: 'Aucun panel ESN public trouvé' },
    {
      label: 'CONTACTS',
      value: totalPeople,
      caption: `${withEmail} avec e-mail du groupe · ${withMobile} avec mobile`,
    },
    {
      label: 'BUDGET IT 2026',
      value: `${frNumber(Number(k['budget_it_2026_md_eur']))} Md€`,
      caption: `${lmi['source'] ?? ''}`,
    },
  ]
  const usedKpis = [
    'comptes_rattaches',
    'consultants_observes',
    'consultants_en_poste_export_2024',
    'esn_vues_en_poste',
    'esn_anciennes',
    'esn_rang2_ouvert',
    'esn_referencement_confirme',
    'budget_it_2026_md_eur',
  ]
  const ownKpis = ['besoins_en_base', 'besoins_2025_2026', 'besoins_gagnes_2025_2026']
  const recountedKpis = ['contacts_liste', 'contacts_email_groupe_CA', 'contacts_avec_mobile']
  const unknownKpis = Object.keys(k).filter(key => ![...usedKpis, ...ownKpis, ...recountedKpis].includes(key))
  if (unknownKpis.length > 0) throw new Error(`kpis : ${unknownKpis.join(', ')} sans case`)
  ctx.skip('kpis des besoins (en base, gagnés) : NOTRE activité commerciale, pas le compte', ownKpis.length)
  ctx.skip('kpis des contacts du dossier : recomptés sur le fichier après la liste noire', recountedKpis.length)
  ctx.cover('kpis', 'kpis', kpis.length, 'six tuiles tirées des indicateurs du dossier')

  const charts: CommercialBrief['charts'] = [
    {
      title: 'CONSULTANTS OBSERVÉS PAR ZONE (VILLE DU CONSULTANT)',
      items: zoneItems.map(zone => ({ label: zone.zone, value: Number(zone.consultants_observes) })),
    },
    {
      title: 'ESN VUES EN POSTE (CONSULTANTS, EXPORT 2024)',
      items: esnRows.map(entry => ({ label: String(entry['esn']), value: Number(entry['consultants']) })),
    },
  ]
  ctx.cover('zones + esn_sur_place', 'charts', charts.length, '')

  /* ---- ce que je sais ---- */
  const need = (path: string): string => {
    const value = leafValue.get(path)
    if (value === undefined || value === null) throw new Error(`marche : « ${path} » absent`)
    return typeof value === 'number' ? frNumber(value) : String(value)
  }
  const cagip = structure.find(entry => entry['entite'] === 'CAGIP')
  const catsEntry = structure.find(entry => entry['entite'] === 'CA-TS')
  const toolNames = asObjects(purchasing['outils'], 'achats.outils').map(tool => String(tool['outil']))
  if (!toolNames.includes('EASY') || !toolNames.includes('Ivalua')) throw new Error('achats : EASY ou Ivalua absent')
  const whatIKnow: CommercialBrief['what_i_know'] = [
    {
      rubric: 'IDENTITÉ',
      known: `Crédit Agricole S.A. (SIREN ${String(casa['siren'])}, ${String(casa['forme'])}) et ${String(cats['denomination'])} (SIREN ${String(cats['siren'])}, ${String(cats['forme'])}). Identifiants issus de fiches tierces ; Kbis, capital et bilans : ${kbis}.`,
      meaning:
        'Les identifiants ne sont pas confirmés au registre : ne rien citer de légal à un client sans l’avoir vérifié.',
    },
    {
      rubric: 'MARCHÉ',
      known: `S1 2026 : résultat net part du groupe de ${need('s1_2026_resultat_net_part_groupe_md_eur')} Md€, PNB du groupe de ${need('s1_2026_pnb_groupe_md_eur')} Md€, RoTE de ${need('rote_s1_2026_pct')} %. Plan ACT 2028 : ${need('act_2028.economies_meur')} M€ d’économies, dont rationalisation IT. Résultats lus dans une analyse de courtier.`,
      meaning:
        'Un groupe rentable qui cherche des économies, y compris sur l’IT : à recouper avec le communiqué officiel avant de citer un chiffre.',
    },
    {
      rubric: 'IT ET IA',
      known: `Budget IT 2026 de ${need('it.budget_2026_md_eur')} Md€, ${need('it.filiere_tech_personnes')} personnes dans la filière technologique, environ ${need('it.legacy_a_demonter_pct')} % du legacy à démonter sur ${need('it.horizon_ans')} ans ; société interne IA dotée de ${need('ia.budget_2026_2028_meur')} M€ sur 2026-2028, opérationnelle à partir de ${need('ia.operationnelle')}.`,
      meaning:
        'Le move to cloud, le démantèlement du legacy et l’IA sont les chantiers financés : c’est là que se cherchent les renforts.',
    },
    {
      rubric: 'STRUCTURE',
      known: `${entities.length} entités au dossier, dont CAGIP (${String(cagip?.['role'] ?? 'non trouvé')}) et CA-TS (${String(catsEntry?.['role'] ?? 'non trouvé')}), confirmées. Aucun organigramme officiel : l’arbre est reconstitué à partir des profils.`,
      meaning:
        'Deux maisons IT distinctes, chacune avec ses sites : on cible l’une ou l’autre, pas « Crédit Agricole » en bloc.',
    },
    {
      rubric: 'ESN SUR PLACE',
      known: `${String(k['esn_vues_en_poste'])} ESN vues en poste dans l’export 2024, ${String(k['esn_anciennes'])} anciennes, ${String(k['esn_rang2_ouvert'])} en rang 2 ouvert. Référencement confirmé : aucun.`,
      meaning:
        'Une présence observée n’est pas un référencement : ne jamais dire à un acheteur qu’une ESN est référencée.',
    },
    {
      rubric: 'ACHATS',
      known: `Système d’information achats EASY (site officiel), direction des achats groupe, Ivalua cité par un document d’éditeur ; lien entre EASY et Ivalua non établi. Non trouvés : ${(purchasing['non_trouve'] as string[]).join(', ')}.`,
      meaning:
        'Le circuit passe par le référencement fournisseurs du groupe ; le reste se qualifie auprès de l’acheteur.',
    },
    {
      rubric: 'CONTACTS',
      known: `${totalPeople} contacts, dirigeants cités publiquement compris (les contacts « ne pas contacter » du CRM ne sont pas repris) : ${withEmail} avec e-mail du groupe, ${withMobile} avec mobile, ${decisionMakers} décideurs, prescripteurs ou dirigeants. « En poste » vient de l’export 2024.`,
      meaning:
        'Un contact « en poste » est à revalider avant tout usage commercial ; les décideurs passent en premier.',
    },
  ]

  const sources = sourcesSection(ctx, sourceRows)
  const brief: CommercialBrief = {
    account_name: accountName,
    generated_at: `${asOf}T00:00:00.000Z`,
    scope: 'france',
    headquarters: {
      label: 'Siège de Crédit Agricole S.A. (fiche tierce, à confirmer)',
      city: 'Montrouge',
      address: asString(casa['siege'], 'siege'),
    },
    kpis,
    what_i_know: whatIKnow,
    charts,
    entities,
    sites,
    prices: [],
    esn,
    people: rankedPeople,
    sections: [
      {
        key: 'fiche-compte',
        title: 'FICHE COMPTE',
        columns: [column('champ', 'CHAMP'), column('valeur', 'VALEUR'), column('fiabilite', 'FIABILITÉ')],
        rows: ficheRows,
      },
      marketSection,
      projectsSection,
      tools,
      needs,
      {
        key: 'presence-sur-site',
        title: 'PRÉSENCE SUR SITE',
        columns: [column('perimetre', 'PÉRIMÈTRE'), column('valeur', 'VALEUR'), column('annee', 'ANNÉE')],
        rows: presenceRows,
      },
      leadersSection,
      decidersSection,
      partners,
      zonesSection,
      citiesSection,
      officialSites,
      sources,
    ],
    guardrails,
  }
  if (!brief.headquarters.address?.includes(brief.headquarters.city))
    throw new Error('siège : la ville n’est pas dans l’adresse')
  ctx.assertAllConsumed(account)
  assertDisplayable(brief, ctx.rules)
  return { brief, coverage: ctx.coverage, skipped: ctx.skipped, anomalies: ctx.anomalies }
}
