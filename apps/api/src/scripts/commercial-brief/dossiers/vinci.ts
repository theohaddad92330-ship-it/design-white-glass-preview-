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
 * Dossier de compte VINCI (pack de Théo du 15/10/2026, démo du 20/10, focus Airports / Highways / Autoroutes) →
 * `CommercialBrief`, sur le cœur partagé `account-dossier.ts`.
 *
 * Particularités : un groupe décentralisé (une entité = un circuit d'achat), des marchés publics attribués (TED, registre
 * ASF), des offres d'emploi datées (les stages ne sont jamais un signal, Louis 12/10), une liste LinkedIn collée dont
 * l'employeur n'est pas vérifié (dit tel quel sur chaque fiche), et un plan de compte d'un tiers dont l'analyse de
 * provenance reste interne.
 */

type Input = { account: JsonObject; contactsCsv: string; sourcesCsv: string }

/** Les domaines du groupe VINCI (Airports, Autoroutes, Energies, Construction, Axians, Actemium…). */
export const VINCI_DOMAIN =
  /@(?:[\w-]+\.)*(?:vinci(?:-[\w-]+)?\.(?:com|fr)|axians\.(?:com|fr)|actemium\.(?:com|fr)|omexom\.(?:com|fr)|cofiroute\.fr|escota\.fr|asf\.fr)$/i

/** Les quatre tuiles du dossier : leur libellé court, vérifié contre le début du texte du dossier. */
const KPI_LABELS: readonly { startsWith: string; label: string }[] = [
  { startsWith: 'aéroports VINCI Airports', label: 'VINCI AIRPORTS' },
  { startsWith: 'réseau VINCI Autoroutes', label: 'VINCI AUTOROUTES' },
  { startsWith: 'VINCI Highways', label: 'VINCI HIGHWAYS' },
  { startsWith: 'collaborateurs du groupe VINCI', label: 'GROUPE VINCI' },
]

/**
 * Les sites semés sur la carte : chaque ville est RECOPIÉE d'un texte du dossier (vérifié à la conversion), jamais
 * devinée. France uniquement (les aéroports et autoroutes hors de France restent dans les sections).
 */
const SITES: readonly {
  city: string
  from: 'airports' | 'autoroutes' | 'highways'
  why: string
  reliability: string
}[] = [
  ...['Lyon', 'Nantes', 'Rennes', 'Dinard', 'Toulon', 'Grenoble', 'Chambéry', 'Clermont-Ferrand', 'Annecy'].map(
    city => ({
      city,
      from: 'airports' as const,
      why: 'Aéroport du réseau VINCI Airports en France',
      reliability: 'fort',
    }),
  ),
  ...['Rueil-Malmaison', 'Mandelieu', 'Vedène'].map(city => ({
    city,
    from: 'autoroutes' as const,
    why: 'Adresse opérationnelle historique de VINCI Autoroutes (actualité non vérifiée)',
    reliability: 'faible',
  })),
  { city: 'Marseille', from: 'highways', why: 'Tunnels Prado (VINCI Highways)', reliability: 'fort' },
]

const ESN_WEB_EVIDENCE: Record<string, CommercialBrief['esn'][number]['evidence_level']> = {
  fort: 'observed',
  moyen: 'observed',
  faible: 'hint',
}

const ORIGIN_LABEL: Record<string, string> = {
  'base interne': 'Base interne de l’espace',
  'LinkedIn collé non confirmé':
    'Intitulé LinkedIn collé : employeur non vérifié, à ne pas présenter comme salarié de VINCI',
  'web daté': 'Source publique datée',
}

const DECIDER_ORIGIN: Record<string, string> = { base: 'base interne', web: 'web daté', li: 'LinkedIn' }

/** Un code de taxonomie interne (« SW_ENGINEERING | PRODUCT_UX_ECOM ») n'est pas un libellé : il ne s'affiche pas. */
const INTERNAL_CODE = /^[A-Z_]+(?:\s*\|\s*[A-Z_]+)*$/

export function convertVinciDossier(input: Input): DossierConversion {
  const { account } = input
  const ctx = new DossierContext({ prospect: DOSSIER_PROSPECT_ESN['vinci'] as RegExp })
  const sourceRows = parseSemicolonCsv(input.sourcesCsv)

  /* ---- meta ---- */
  const meta = asObject(ctx.take(account, 'meta'), 'meta')
  const accountName = asString(meta['account'], 'meta.account')
  const asOf = asString(meta['as_of'], 'meta.as_of')
  ctx.skip('meta (titre, identifiants de base, rendez-vous de démo de l’ESN prospect) : non affiché')

  /* ---- personnes ---- */
  const converted = convertDossierPeople(ctx, parseSemicolonCsv(input.contactsCsv), {
    sheet: 'contacts_vinci.csv',
    name: 'nom',
    function: 'fonction',
    entity: 'entite',
    city: 'ville',
    groupEmails: 'emails_domaine_groupe_VINCI',
    otherEmails: 'autres_emails',
    mobile: 'mobile',
    linkedin: 'linkedin',
    groupDomain: VINCI_DOMAIN,
    role: row => {
      if (row['decideur_ou_prescripteur'] === 'Oui') return 'decision_maker'
      if (row['origine_donnee'] !== 'base interne') return 'contact'
      if (row['en_poste_export_2024'] === 'Oui') return cellText(row['esn_actuelle']) ? 'external' : 'contact'
      return 'alumni'
    },
    hook: row => [
      ORIGIN_LABEL[row['origine_donnee'] ?? ''] ?? cellText(row['origine_donnee']),
      cellText(row['famille_fonction']) && `Famille : ${row['famille_fonction']}`,
      row['origine_donnee'] === 'base interne'
        ? row['en_poste_export_2024'] === 'Oui'
          ? 'En poste dans l’export 2024 (à revalider)'
          : 'Non listé en poste dans l’export 2024'
        : undefined,
      cellText(row['esn_actuelle']) && `ESN actuelle : ${row['esn_actuelle']}`,
    ],
    dropped: {
      rang_exploitabilite: 'rang interne (l’ordre du fichier est conservé)',
      metropole: 'regroupement de la ville, déjà portée par la fiche',
      a_valider_RGPD: 'note interne de l’équipe (RGPD) : pas un fait sur la personne',
      statut_CRM: 'statut de NOTRE relation commerciale (contactabilité) : notre activité, pas le compte',
      source: 'noms de fichiers internes',
      score: 'score interne d’exploitabilité',
    },
    read: ['decideur_ou_prescripteur', 'en_poste_export_2024', 'esn_actuelle', 'origine_donnee', 'famille_fonction'],
  })
  const people = converted.people
  const pasted = converted.people.filter(person => person.hook?.startsWith('Intitulé LinkedIn collé')).length

  /* ---- bandeau ---- */
  const kpiRows = asObjects(ctx.take(account, 'kpis'), 'kpis')
  if (kpiRows.length !== KPI_LABELS.length)
    throw new Error(`kpis : ${kpiRows.length} tuiles, ${KPI_LABELS.length} attendues`)
  const kpis: CommercialBrief['kpis'] = kpiRows.map((row, index) => {
    const label = KPI_LABELS[index] as (typeof KPI_LABELS)[number]
    const caption = asString(row['libelle'], `kpis[${index}].libelle`)
    if (!caption.startsWith(label.startsWith)) throw new Error(`kpis[${index}] : forme inconnue « ${caption} »`)
    return { label: label.label, value: asString(row['valeur'], `kpis[${index}].valeur`), caption: ctx.text(caption) }
  })

  /* ---- marché ---- */
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
  const details = asObjects(market['details'], 'marche.details')
  const detailOf = (rubric: string): string => {
    const found = details.find(row => row['rubrique'] === rubric)
    if (!found) throw new Error(`marche.details : « ${rubric} » absent`)
    return ctx.text(asString(found['texte'], rubric))
  }
  const marketReading = listSection(ctx, {
    key: 'marche-par-metier',
    title: 'MARCHÉ — PAR MÉTIER',
    sheet: 'marche.details',
    items: details,
    columns: [
      { from: 'rubrique', key: 'rubrique', label: 'MÉTIER' },
      { from: 'texte', key: 'ce_qui_est_public', label: 'CE QUI EST PUBLIC' },
    ],
  })

  /* ---- fiche légale ---- */
  const legalRows = asObjects(ctx.take(account, 'legal'), 'legal')
  const fiche = listSection(ctx, {
    key: 'fiche-compte',
    title: 'FICHE COMPTE',
    sheet: 'legal',
    items: legalRows,
    columns: [
      { from: 'rubrique', key: 'champ', label: 'CHAMP' },
      { from: 'texte', key: 'valeur', label: 'VALEUR (AVEC SA FIABILITÉ)' },
    ],
    note: 'confiance recopiée dans le texte du dossier ; « non trouvé » gardé tel quel',
  })
  const commonAddress = legalRows.find(row => row['rubrique'] === 'Adresse commune')
  const hqAddress = '1973 boulevard de la Défense, 92000 Nanterre'
  if (!String(commonAddress?.['texte'] ?? '').includes(hqAddress))
    throw new Error('legal : adresse du siège introuvable')

  /* ---- structure → entités ---- */
  const structure = asObjects(ctx.take(account, 'structure'), 'structure')
  const entities: CommercialBrief['entities'] = structure.map((entry, index) => {
    const unknown = Object.keys(entry).filter(key => !['entite', 'confiance', 'repere', 'description'].includes(key))
    if (unknown.length > 0) throw new Error(`structure[${index}] : ${unknown.join(', ')} sans case`)
    const note = ctx.text(asString(entry['description'], 'description'))
    return {
      name: asString(entry['entite'], 'entite'),
      nature: asString(entry['repere'], 'repere'),
      status: 'active',
      country: 'FR',
      ...(note ? { note } : {}),
      reliability: asString(entry['confiance'], 'confiance'),
    }
  })
  ctx.cover('structure', 'entities', entities.length, 'repère, description et confiance recopiés')

  /* ---- sites ---- */
  const sitesBlock = asObject(ctx.take(account, 'sites'), 'sites')
  const officialSites = asObjects(sitesBlock['sites_officiels'], 'sites.sites_officiels')
  const sourceText: Record<(typeof SITES)[number]['from'], string> = {
    airports: String(structure.find(entry => entry['entite'] === 'VINCI Airports')?.['description'] ?? ''),
    autoroutes: String(officialSites.find(entry => entry['entite'] === 'VINCI Autoroutes')?.['sites'] ?? ''),
    highways: String(structure.find(entry => entry['entite'] === 'VINCI Highways')?.['description'] ?? ''),
  }
  const sites: CommercialBrief['sites'] = [
    {
      name: 'VINCI SA — siège',
      city: 'Nanterre',
      country: 'FR',
      kind: 'headquarters',
      why: hqAddress,
      reliability: 'fort',
    },
  ]
  for (const site of SITES) {
    if (!sourceText[site.from].includes(site.city))
      throw new Error(`sites : « ${site.city} » n’est pas dans le texte du dossier (${site.from})`)
    sites.push({
      name: `${site.why.split(' (')[0]} — ${site.city}`,
      city: site.city,
      country: 'FR',
      kind: 'secondary',
      why: site.why,
      reliability: site.reliability,
    })
  }
  ctx.cover(
    'structure + sites_officiels',
    'sites',
    sites.length,
    'villes recopiées du dossier (vérifiées), France seulement',
  )
  const citiesNote = asString(sitesBlock['note'], 'sites.note')
  const citiesSection = listSection(ctx, {
    key: 'villes-consultants',
    title: 'VILLES DES CONSULTANTS (PAS DES SITES DU CLIENT CONFIRMÉS)',
    sheet: 'sites.villes_consultants',
    items: asObjects(sitesBlock['villes_consultants'], 'sites.villes_consultants'),
    columns: [
      { from: 'metropole', key: 'metropole', label: 'MÉTROPOLE' },
      { from: 'consultants', key: 'consultants', label: 'CONSULTANTS' },
      { from: 'en_poste_2024', key: 'en_poste_2024', label: 'EN POSTE (EXPORT 2024)' },
    ],
    note: citiesNote,
  })
  const byEntity = asObject(sitesBlock['par_entite'], 'sites.par_entite')
  const byEntityItems = Object.entries(byEntity).map(([entity, value]) => {
    const block = asObject(value, `par_entite.${entity}`)
    const families = Array.isArray(block['familles'])
      ? block['familles']
          .map(pair => (Array.isArray(pair) ? `${String(pair[0])} ${String(pair[1])}` : String(pair)))
          .join(' · ')
      : ''
    return {
      entite: entity,
      consultants: block['consultants'] ?? null,
      en_poste_2024: block['en_poste_2024'] ?? null,
      familles: families,
    }
  })
  const byEntitySection = listSection(ctx, {
    key: 'consultants-par-entite',
    title: 'CONSULTANTS OBSERVÉS PAR ENTITÉ',
    sheet: 'sites.par_entite',
    items: byEntityItems as JsonObject[],
    columns: [
      { from: 'entite', key: 'entite', label: 'ENTITÉ' },
      { from: 'consultants', key: 'consultants', label: 'CONSULTANTS' },
      { from: 'en_poste_2024', key: 'en_poste_2024', label: 'EN POSTE (EXPORT 2024)' },
      { from: 'familles', key: 'familles', label: 'FAMILLES DE MÉTIER' },
    ],
  })
  const officialSection = listSection(ctx, {
    key: 'sites-officiels',
    title: 'SITES OFFICIELS',
    sheet: 'sites.sites_officiels',
    items: officialSites,
    columns: [
      { from: 'entite', key: 'entite', label: 'ENTITÉ' },
      { from: 'sites', key: 'sites', label: 'SITES' },
      { from: 'source', key: 'url', label: 'LIEN' },
      { from: 'date_source', key: 'date_source', label: 'DATE DE LA SOURCE' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ' },
    ],
  })
  for (const row of officialSection.rows) {
    if (typeof row['url'] === 'string' && /pappers\.fr|societe\.com/i.test(row['url'])) {
      row['url'] = null
      ctx.skip('lien de source vers un fournisseur de données : retiré (la source reste nommée)')
    }
  }

  /* ---- ESN ---- */
  const esnBlock = asObject(ctx.take(account, 'esn_sur_place'), 'esn_sur_place')
  const webEsn = asObjects(esnBlock['web'], 'esn_sur_place.web')
  const baseEsn = asObjects(esnBlock['base'], 'esn_sur_place.base')
  const esn: CommercialBrief['esn'] = []
  const seenEsn = new Set<string>()
  for (const entry of webEsn) {
    const level = asString(entry['confiance'], 'confiance')
    const evidence = ESN_WEB_EVIDENCE[level]
    if (level === 'nt') continue
    if (!evidence) throw new Error(`ESN « ${String(entry['nom'])} » : confiance inconnue « ${level} »`)
    const name = asString(entry['nom'], 'nom')
    seenEsn.add(norm(name))
    esn.push({
      name,
      evidence_level: evidence,
      proof: `${ctx.text(asString(entry['nature'], 'nature'))}. ${ctx.text(asString(entry['detail'], 'detail'))} Aucun référencement confirmé.`,
      reliability: level,
    })
  }
  for (const entry of baseEsn) {
    const name = asString(entry['esn'], 'esn')
    if (/erasmus student network/i.test(name)) {
      ctx.skip('ESN de la base qui n’en est pas une (association étudiante) : non reprise')
      continue
    }
    if (seenEsn.has(norm(name))) continue
    seenEsn.add(norm(name))
    const scopes = Array.isArray(entry['entites']) ? entry['entites'].map(String) : []
    esn.push({
      name,
      evidence_level: 'hint',
      proof: `${String(entry['en_poste'])} en poste, ${String(entry['anciens'])} ancien(s), ${String(entry['rang2_ouvert'])} en rang 2 ouvert dans les parcours de consultants (export 2024, à revalider). Présence observée : aucun référencement confirmé.`,
      ...(scopes.length > 0 ? { perimeter: scopes.join(', ') } : {}),
      reliability: Array.isArray(entry['confiance']) ? entry['confiance'].map(String).join(' / ') : 'indice faible',
    })
  }
  ctx.cover(
    'esn_sur_place',
    'esn',
    esn.length,
    'prestataires publics (observés) puis parcours de consultants (indice) ; jamais « confirmé »',
  )
  const providers = listSection(ctx, {
    key: 'prestataires-publics',
    title: 'PRESTATAIRES CITÉS PUBLIQUEMENT',
    sheet: 'esn_sur_place.web',
    items: webEsn,
    columns: [
      { from: 'nom', key: 'nom', label: 'NOM' },
      { from: 'nature', key: 'nature', label: 'NATURE' },
      { from: 'detail', key: 'detail', label: 'CE QUI EST PUBLIC' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ', as: confidenceLabel },
    ],
    note: 'un cas client ou une conférence n’est jamais un référencement',
  })
  const unknownEsn = Object.keys(esnBlock).filter(key => !['base', 'web'].includes(key))
  if (unknownEsn.length > 0) throw new Error(`esn_sur_place : ${unknownEsn.join(', ')} sans case`)

  /* ---- achats ---- */
  const purchasing = asObject(ctx.take(account, 'achats'), 'achats')
  const purchasingTools = asObjects(purchasing['outils'], 'achats.outils')
  const tools = listSection(ctx, {
    key: 'achats-avant-d-appeler',
    title: 'ACHATS',
    sheet: 'achats.outils',
    items: purchasingTools,
    columns: [
      { from: 'outil', key: 'nom', label: 'ÉLÉMENT' },
      { from: 'detail', key: 'ce_que_c_est', label: 'CE QUE C’EST' },
      { from: 'preuve', key: 'ce_que_tu_dois_avoir_en_tete', label: 'CE QUE TU DOIS AVOIR EN TÊTE' },
      { from: 'source', key: 'source', label: 'SOURCE' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ', as: confidenceLabel },
    ],
  })
  if (Object.keys(purchasing).some(key => key !== 'outils')) throw new Error('achats : clé sans case')

  /* ---- besoins ---- */
  const needs = listSection(ctx, {
    key: 'besoins-en-base',
    title: 'BESOINS EN BASE',
    sheet: 'besoins',
    items: asObjects(ctx.take(account, 'besoins'), 'besoins'),
    columns: [
      { from: 'title', key: 'besoin', label: 'BESOIN' },
      { from: 'date_ref', key: 'date', label: 'DATE', as: value => cellText(value as string) ?? 'non trouvé' },
      { from: 'account_name', key: 'entite', label: 'ENTITÉ' },
      {
        from: 'technologies',
        key: 'technologies',
        label: 'TECHNOLOGIES',
        as: value => {
          const text = cellText(value as string)
          if (!text) return null
          if (INTERNAL_CODE.test(text)) {
            ctx.skip('besoins.technologies : code de taxonomie interne, pas un libellé')
            return null
          }
          return text
        },
      },
      { from: 'location_raw', key: 'lieu', label: 'LIEU' },
      {
        from: 'onsite_days',
        key: 'sur_site',
        label: 'SUR SITE',
        as: (value, item) =>
          typeof value === 'number' && typeof item['days_per_week'] === 'number'
            ? `${value} j sur site / ${item['days_per_week']} j`
            : null,
      },
    ],
    dropped: {
      need_uid: 'identifiant interne',
      family: 'famille de la taxonomie interne',
      amount_eur: 'montant ou TJM du CRM interne : la consigne du dossier interdit de le montrer',
      days_per_week: 'lu avec les jours sur site',
      city_norm: 'ville normalisée, redondante avec le lieu',
      year: 'redondant avec la date',
      status_raw: 'statut de NOTRE réponse au besoin : la consigne du dossier interdit de le montrer',
      channel: 'canal par lequel NOUS avons reçu le besoin : notre activité commerciale',
      platform_raw: 'lot d’import interne',
      source: 'nom d’un fichier interne',
      comment_raw: 'note de saisie interne',
      other_raw: 'champs bruts du CRM interne (montants, identifiants)',
      consultant_count: 'nombre de NOS consultants présentés : notre activité',
      crm_stage: 'étape de NOTRE pipeline commercial',
    },
    note: 'date absente = « non trouvé » ; montants et statuts du CRM interne jamais affichés',
  })

  /* ---- projets et postes ouverts ---- */
  const projects = listSection(ctx, {
    key: 'projets-2026-2027',
    title: 'PROJETS 2026-2027',
    sheet: 'projets',
    items: asObjects(ctx.take(account, 'projets'), 'projets'),
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
  })
  const jobs = listSection(ctx, {
    key: 'postes-ouverts',
    title: 'POSTES OUVERTS',
    sheet: 'emploi',
    items: asObjects(ctx.take(account, 'emploi'), 'emploi'),
    columns: [
      { from: 'poste', key: 'poste_ouvert', label: 'POSTE OUVERT' },
      { from: 'entite', key: 'entite', label: 'ENTITÉ' },
      { from: 'lieu', key: 'ville', label: 'VILLE' },
      { from: 'contrat', key: 'contrat', label: 'CONTRAT' },
      { from: 'technologies', key: 'detail', label: 'TECHNOLOGIES CITÉES' },
      { from: 'date', key: 'date', label: 'DATE' },
      { from: 'source', key: 'url', label: 'LIEN' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ' },
    ],
    keep: {
      test: item => !/stage/i.test(String(item['contrat'] ?? '')),
      reason: 'offre de STAGE : jamais un signal (Louis 12/10/2026)',
    },
  })

  /* ---- personnes citées ---- */
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

  const byName = new Map(people.map(person => [norm(person.name), person]))
  const pastedList = asObjects(ctx.take(account, 'personnes_linkedin_collees'), 'personnes_linkedin_collees')
  for (const entry of pastedList) {
    if (!byName.has(norm(asString(entry['nom'], 'nom'))))
      ctx.anomalies.push(`« ${String(entry['nom'])} » : personne LinkedIn collée absente du CSV de contacts`)
  }
  ctx.cover(
    'personnes_linkedin_collees',
    'people',
    pastedList.length,
    'déjà au CSV (origine « LinkedIn collé non confirmé »)',
  )

  const deciders = asObjects(ctx.take(account, 'decideurs_base'), 'decideurs_base')
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
          const kept = (Array.isArray(value) ? value.map(String) : []).filter(email => VINCI_DOMAIN.test(email))
          return kept.length > 0 ? kept.join(' | ') : null
        },
      },
      {
        from: 'origine',
        key: 'origine',
        label: 'ORIGINE',
        as: value =>
          String(value ?? '')
            .split('+')
            .map(part => DECIDER_ORIGIN[part] ?? part)
            .join(' + ') || null,
      },
    ],
    note: 'adresses hors domaine du groupe non reprises',
  })
  for (const decider of deciders) {
    const found = byName.get(norm(asString(decider['nom'], 'nom')))
    if (!found) ctx.anomalies.push(`« ${String(decider['nom'])} » : décideur du dossier absent du CSV de contacts`)
    else found.role = 'decision_maker'
  }

  /* ---- écartés ---- */
  ctx.drop(
    account,
    'meta_analyse',
    'analyse de provenance des documents internes et d’un plan de compte tiers : note interne',
  )
  ctx.drop(account, 'strategie_mk4', 'stratégie de vente de l’ESN prospect : écartée (décision Louis 15/10)')
  ctx.drop(
    account,
    'lecture_par_entite',
    'notation des entités du point de vue de l’ESN prospect : sa stratégie, écartée',
  )
  ctx.drop(account, 'comptes_comparables_base', 'autres comptes de la base interne : pas ce compte')
  ctx.drop(account, 'a_verifier_terrain', 'préparation interne de la démo (questions à l’ESN prospect) : écartée')

  /* ---- garde-fous ---- */
  const guardrails = limitsToGuardrails(ctx, (ctx.take(account, 'limites') as string[]).map(String))
  guardrails.push(
    { point: 'Villes des consultants', detail: `${citiesNote} : les villes ne sont pas des sites du client.` },
    {
      point: 'Coordonnées',
      detail:
        'Seules les adresses du groupe VINCI sont reprises ; les autres (employeur tiers, boîte personnelle) ne le sont pas. Aucune coordonnée n’est devinée.',
    },
    {
      point: 'LinkedIn collé',
      detail: `${pasted} personnes viennent d’une liste LinkedIn collée dont l’employeur n’est pas vérifié : leur fiche le dit.`,
    },
  )

  const referencingNotFound = webEsn.find(entry => entry['nom'] === 'Aucun référencement ESN')
  if (!referencingNotFound) throw new Error('esn_sur_place.web : la ligne « Aucun référencement ESN » a disparu')
  // Recette prod 16/10 : la tuile disait 250 (le CSV) quand l'onglet Personnes en compte 255 (+ dirigeants cités, doublons
  // écartés). Un chiffre qui décrit les personnes semées = ce que l'écran compte.
  const rankedPeople = rankPeople(ctx, people)
  const totalPeople = rankedPeople.length
  const withEmail = rankedPeople.filter(person => person.email).length
  const withMobile = rankedPeople.filter(person => person.mobile).length
  const decisionMakers = rankedPeople.filter(person => person.role === 'decision_maker').length
  kpis.push(
    { label: 'RÉFÉRENCEMENT ESN', value: 'Aucun confirmé', caption: 'Aucun panel IT ni référencement ESN trouvé' },
    {
      label: 'CONTACTS',
      value: totalPeople,
      caption: `${withEmail} avec e-mail du groupe · ${withMobile} avec mobile`,
    },
  )
  ctx.cover('kpis', 'kpis', kpis.length, 'quatre tuiles du dossier + référencement + contacts')

  const charts: CommercialBrief['charts'] = [
    {
      title: 'CONSULTANTS OBSERVÉS PAR ENTITÉ',
      items: byEntityItems.map(item => ({ label: item.entite, value: Number(item.consultants) })),
    },
    {
      title: 'ESN VUES EN POSTE (CONSULTANTS, EXPORT 2024)',
      items: baseEsn
        .filter(entry => Number(entry['en_poste']) > 0 && !/erasmus/i.test(String(entry['esn'])))
        .map(entry => ({ label: String(entry['esn']), value: Number(entry['en_poste']) })),
    },
  ]

  const structureNote = String(structure.find(entry => entry['entite'] === 'VINCI SA (groupe)')?.['description'] ?? '')
  if (!structureNote.includes('Organisation décentralisée'))
    throw new Error('structure : « Organisation décentralisée » a disparu')
  const highwaysNoEsn = String(
    webEsn.find(entry => entry['nom'] === 'Aucune ESN chez VINCI Highways')?.['detail'] ?? '',
  )
  if (!highwaysNoEsn.includes('ViaPlus')) throw new Error('esn_sur_place.web : la ligne Highways a changé')
  const notFoundTools = purchasingTools.filter(tool => tool['confiance'] === 'nt').length
  const whatIKnow: CommercialBrief['what_i_know'] = [
    {
      rubric: 'GROUPE',
      known: detailOf('Groupe VINCI'),
      meaning:
        'Organisation décentralisée : chaque métier décide de son informatique et de ses achats ; on cible une entité, jamais « VINCI » en bloc.',
    },
    {
      rubric: 'VINCI AIRPORTS',
      known: detailOf('Airports'),
      meaning:
        'Le Smart Data Hub et la Data Factory sont les chantiers data documentés du périmètre (voir les projets).',
    },
    { rubric: 'VINCI AUTOROUTES', known: detailOf('Autoroutes'), meaning: detailOf('Lecture') },
    {
      rubric: 'VINCI HIGHWAYS',
      known: detailOf('Highways'),
      meaning:
        'Le péage et le free-flow sont portés par des filiales à 100 % (ViaPlus, TollPlus) : aucun prestataire extérieur nommé.',
    },
    {
      rubric: 'ESN SUR PLACE',
      known: `${esn.filter(entry => entry.evidence_level === 'observed').length} prestataires cités publiquement, ${esn.filter(entry => entry.evidence_level === 'hint').length} ESN vues dans les parcours de consultants. Référencement confirmé : aucun.`,
      meaning:
        'Un cas client ou une présence observée n’est pas un référencement : ne jamais dire à un acheteur qu’une ESN est référencée.',
    },
    {
      rubric: 'ACHATS',
      known: `${purchasingTools.length} éléments d’achat relevés (profils acheteurs, portails, marchés attribués), dont ${notFoundTools} non trouvés : ni page « devenir fournisseur » du groupe, ni panel IT.`,
      meaning:
        'Le référencement se négocie entité par entité : on passe par les consultations publiées et l’acheteur de l’entité visée.',
    },
    {
      rubric: 'CONTACTS',
      known: `${totalPeople} contacts, dirigeants cités publiquement compris : ${withEmail} avec e-mail du groupe, ${decisionMakers} décideurs, prescripteurs ou dirigeants, ${pasted} issus d’une liste LinkedIn collée (employeur non vérifié), ${leaders.length} dirigeants cités publiquement.`,
      meaning:
        'Une fonction se revalide avant l’appel ; une personne de la liste LinkedIn ne se présente pas comme salariée de VINCI sans le dire.',
    },
  ]

  const brief: CommercialBrief = {
    account_name: accountName,
    generated_at: `${asOf}T00:00:00.000Z`,
    scope: 'france',
    headquarters: { label: 'VINCI SA', city: 'Nanterre', address: hqAddress },
    kpis,
    what_i_know: whatIKnow,
    charts,
    entities,
    sites,
    prices: [],
    esn,
    people: rankedPeople,
    sections: [
      fiche,
      marketSection,
      marketReading,
      projects,
      jobs,
      tools,
      needs,
      leadersSection,
      decidersSection,
      providers,
      byEntitySection,
      citiesSection,
      officialSection,
      { ...sourcesSection(ctx, sourceRows) },
    ],
    guardrails,
  }
  ctx.assertAllConsumed(account)
  assertDisplayable(brief, ctx.rules)
  return { brief, coverage: ctx.coverage, skipped: ctx.skipped, anomalies: ctx.anomalies }
}
