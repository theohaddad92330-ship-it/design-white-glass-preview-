import type { CommercialBrief } from '@bellum/contracts'

import {
  DossierContext,
  asObject,
  asObjects,
  asString,
  assertDisplayable,
  cellText,
  column,
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
 * Dossier de compte ENEDIS (pack de Théo du 15/10/2026, démo du 20/10, DSI / achats / référencement en Île-de-France) →
 * `CommercialBrief`, sur le cœur partagé `account-dossier.ts`.
 *
 * Particularités : un compte fermé par des MARCHÉS (entité adjudicatrice, marché d'intermédiation de 1,28 Md€, panel du
 * groupe EDF), une DSI découpée en pôles et en lots, 1 599 contacts tirés de trombinoscopes (fonction à revalider), et
 * un historique de prospection qui est NOTRE activité commerciale (écarté). Le nom de l'ancien DSI ne se cite jamais
 * comme DSI actuel (consigne du dossier).
 */

type Input = { account: JsonObject; contactsCsv: string; sourcesCsv: string }

export const ENEDIS_DOMAIN = /@(?:[\w-]+\.)*enedis\.fr$/i

/** Les sept tuiles du dossier : leur libellé court (vérifié contre le début du texte) ; `null` = écartée, avec sa raison. */
const KPI_LABELS: readonly { startsWith: string; label: string | null }[] = [
  { startsWith: 'le marché de référencement', label: 'MARCHÉ D’INTERMÉDIATION IT' },
  { startsWith: 'directions régionales', label: 'DIRECTIONS RÉGIONALES' },
  { startsWith: 'salariés en 2025', label: 'SALARIÉS' },
  { startsWith: "plan d'investissement", label: 'PLAN D’INVESTISSEMENT' },
  // Notre propre historique de prospection : notre activité, jamais un fait sur le compte.
  { startsWith: 'actions commerciales déjà menées', label: null },
  { startsWith: 'le second marché', label: 'MARCHÉ SOURCING INFRASTRUCTURE' },
  { startsWith: 'ESN prouvée référencée en direct', label: 'RÉFÉRENCEMENT ESN DIRECT' },
]

/** « À retenir » propres à la démo de l'ESN prospect ou à notre activité : écartés, avec leur raison. */
const A_RETENIR_DROPPED: Readonly<Record<string, string>> = {
  'La question qui décide de tout': 'question posée à l’ESN prospect sur sa propre candidature : sa stratégie, écartée',
  'Un historique de compte déjà constitué':
    'historique de NOTRE prospection sur le compte : notre activité commerciale',
}

const ORIGIN_LABEL: Record<string, string> = {
  trombi: 'trombinoscope (document de compte)',
  crm: 'export CRM (document de compte)',
  base: 'base interne de l’espace',
  linkedin: 'LinkedIn',
}

/** Consigne du dossier : le nom du DSI actuel n'est pas public ; l'ancien titulaire ne se cite jamais comme DSI actuel. */
const FORMER_DSI = 'jean claude laroche'
/** Les lignes du fichier de contacts qui ne sont pas des personnes (nom normalisé). */
const NOT_A_PERSON: ReadonlySet<string> = new Set(['petraet formation pnt'])

export function convertEnedisDossier(input: Input): DossierConversion {
  const { account } = input
  const ctx = new DossierContext({ prospect: DOSSIER_PROSPECT_ESN['enedis'] as RegExp })
  const sourceRows = parseSemicolonCsv(input.sourcesCsv)

  /* ---- meta ---- */
  const meta = asObject(ctx.take(account, 'meta'), 'meta')
  const accountName = asString(meta['account'], 'meta.account')
  const asOf = asString(meta['as_of'], 'meta.as_of')
  ctx.skip('meta (titre, identifiant de base, rendez-vous de démo de l’ESN prospect) : non affiché')

  /* ---- personnes ---- */
  // 15/10/2026 — une ligne du fichier qui n'est PAS une personne (intitulé de formation, « PETRAet Formation PNT ») ne se
  // sème jamais comme contact : écartée et comptée, comme les lignes non personnes d'ENGIE.
  const contactRows = parseSemicolonCsv(input.contactsCsv).filter(row => {
    if (!NOT_A_PERSON.has(norm(row['nom'] ?? ''))) return true
    ctx.skip('ligne du fichier de contacts qui n’est pas une personne (intitulé de formation) : non semée')
    return false
  })
  const isFormerDsi = (row: Record<string, string>): boolean => norm(row['nom'] ?? '') === FORMER_DSI
  const converted = convertDossierPeople(ctx, contactRows, {
    sheet: 'contacts_enedis.csv',
    name: 'nom',
    function: 'fonction',
    entity: 'entite',
    groupEmails: 'email',
    mobile: 'mobile',
    phone: 'telephone',
    groupDomain: ENEDIS_DOMAIN,
    role: row => {
      if (isFormerDsi(row)) return 'alumni'
      if (row['niveau'] === 'Direction') return 'decision_maker'
      if (row['niveau'] === 'Chef de pôle ou de département') return 'manager'
      return 'contact'
    },
    hook: row => [
      isFormerDsi(row)
        ? 'Ancien titulaire selon une source périmée : ne jamais le citer comme DSI actuel (le nom du DSI actuel n’est pas public)'
        : undefined,
      cellText(row['origine']) &&
        `Origine : ${(row['origine'] ?? '')
          .split('|')
          .map(part => ORIGIN_LABEL[part.trim()] ?? part.trim())
          .join(' + ')}`,
      cellText(row['famille']) && `Famille : ${row['famille']}`,
      cellText(row['niveau']) && `Niveau : ${row['niveau']}`,
      row['fonction_a_revalider'] === 'Oui' ? 'Fonction à revalider avant appel' : undefined,
    ],
    dropped: {
      rang: 'rang interne (l’ordre du fichier est conservé)',
      nb_actions_crm: 'nombre de NOS actions commerciales : notre activité, pas le compte',
      derniere_action: 'date de NOTRE dernière action commerciale : notre activité',
      sujets_crm: 'sujets de NOS rendez-vous commerciaux : notre activité',
      source: 'noms de documents internes',
      score: 'score interne d’exploitabilité',
      a_valider_RGPD: 'note interne de l’équipe (RGPD) : pas un fait sur la personne',
    },
    read: ['famille', 'niveau', 'origine', 'fonction_a_revalider'],
    reliability: 'documents de compte',
  })
  const people = converted.people
  const contactsJson = ctx.take(account, 'contacts')
  if (!Array.isArray(contactsJson) || contactsJson.length !== parseSemicolonCsv(input.contactsCsv).length)
    ctx.anomalies.push('contacts du JSON et du CSV : nombres différents (le CSV est lu)')
  ctx.skip('clé « contacts » : même liste que contacts_enedis.csv, lu à sa place')

  /* ---- bandeau ---- */
  const kpiRows = asObjects(ctx.take(account, 'kpis'), 'kpis')
  if (kpiRows.length !== KPI_LABELS.length)
    throw new Error(`kpis : ${kpiRows.length} tuiles, ${KPI_LABELS.length} attendues`)
  const kpis: CommercialBrief['kpis'] = kpiRows.flatMap((row, index) => {
    const label = KPI_LABELS[index] as (typeof KPI_LABELS)[number]
    const caption = asString(row['libelle'], `kpis[${index}].libelle`)
    if (!caption.startsWith(label.startsWith)) throw new Error(`kpis[${index}] : forme inconnue « ${caption} »`)
    if (label.label === null) {
      ctx.skip('kpi « actions commerciales déjà menées » : NOTRE activité commerciale, pas le compte')
      return []
    }
    const value = asString(row['valeur'], `kpis[${index}].valeur`)
    // « 0 ESN prouvée référencée » : un fait mesuré, dit en toutes lettres (jamais un « 0 » nu).
    if (label.label === 'RÉFÉRENCEMENT ESN DIRECT') {
      if (value !== '0') throw new Error('kpis : une ESN est désormais prouvée référencée, le libellé est à revoir')
      return [{ label: label.label, value: 'Aucune prouvée', caption: ctx.text(caption) }]
    }
    return [{ label: label.label, value, caption: ctx.text(caption) }]
  })
  ctx.cover('kpis', 'kpis', kpis.length, 'tuiles du dossier ; « actions commerciales déjà menées » écartée')

  /* ---- ce que je sais ---- */
  const takeaways = asObjects(ctx.take(account, 'a_retenir'), 'a_retenir')
  const whatIKnow: CommercialBrief['what_i_know'] = []
  for (const item of takeaways) {
    const title = asString(item['titre'], 'a_retenir.titre')
    const dropped = A_RETENIR_DROPPED[title]
    if (dropped) {
      ctx.skip(`a_retenir : ${dropped}`)
      continue
    }
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

  /* ---- fiche, marché ---- */
  const fiche = listSection(ctx, {
    key: 'fiche-compte',
    title: 'FICHE COMPTE',
    sheet: 'legal',
    items: asObjects(ctx.take(account, 'legal'), 'legal'),
    columns: [
      { from: 'rubrique', key: 'champ', label: 'CHAMP' },
      { from: 'texte', key: 'valeur', label: 'VALEUR' },
    ],
  })
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

  /* ---- signaux → projets (Veille) ---- */
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
        label: 'CE QUI EST PUBLIC',
        as: (value, item) => ctx.text(`${String(value)} Confiance : ${String(item['confiance'])}.`),
      },
      { from: 'source', key: 'url', label: 'LIEN' },
    ],
    dropped: { confiance: 'recopiée dans « ce qui est public »' },
  })

  /* ---- achats ---- */
  const purchasing = asObject(ctx.take(account, 'achats'), 'achats')
  const tools = listSection(ctx, {
    key: 'achats-avant-d-appeler',
    title: 'ACHATS',
    sheet: 'achats.elements',
    items: asObjects(purchasing['elements'], 'achats.elements'),
    columns: [
      { from: 'element', key: 'nom', label: 'ÉLÉMENT' },
      { from: 'description', key: 'ce_que_c_est', label: 'CE QUE C’EST' },
      { from: 'implication', key: 'ce_que_tu_dois_avoir_en_tete', label: 'CE QUE TU DOIS AVOIR EN TÊTE' },
      { from: 'source', key: 'source', label: 'SOURCE' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ' },
    ],
  })
  const intro = ctx.text(asString(purchasing['intro'], 'achats.intro'))
  if (intro) {
    tools.rows.unshift({
      nom: 'Régime d’achat',
      ce_que_c_est: intro,
      ce_que_tu_dois_avoir_en_tete: null,
      source: null,
      fiabilite: 'fort',
    })
  }
  const referencing = asObject(purchasing['marche_referencement'], 'achats.marche_referencement')
  const referencingSection = listSection(ctx, {
    key: 'marche-referencement',
    title: 'MARCHÉ DE RÉFÉRENCEMENT D’INTERMÉDIATION INFORMATIQUE',
    sheet: 'achats.marche_referencement',
    items: asObjects(referencing['chiffres'], 'achats.marche_referencement.chiffres'),
    columns: [
      { from: 'valeur', key: 'valeur', label: 'VALEUR' },
      { from: 'libelle', key: 'ce_que_c_est', label: 'CE QUE C’EST' },
    ],
  })
  const referencingNote = ctx.text(asString(referencing['note'], 'achats.marche_referencement.note'))
  if (referencingNote) referencingSection.rows.push({ valeur: 'Objet', ce_que_c_est: referencingNote })
  const panels = listSection(ctx, {
    key: 'panels-groupe-edf',
    title: 'PANEL IT DU GROUPE EDF (SECONDE PORTE D’ACHAT)',
    sheet: 'achats.panels',
    items: asObjects(purchasing['panels'], 'achats.panels'),
    columns: [
      { from: 'nom', key: 'nom', label: 'LOT' },
      { from: 'repere', key: 'repere', label: 'REPÈRE' },
      { from: 'detail', key: 'detail', label: 'CE QUE C’EST' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ' },
    ],
  })
  const unknownPurchasing = Object.keys(purchasing).filter(
    key => !['intro', 'elements', 'marche_referencement', 'panels'].includes(key),
  )
  if (unknownPurchasing.length > 0) throw new Error(`achats : ${unknownPurchasing.join(', ')} sans case`)

  /* ---- organisation → entités ---- */
  const organisation = asObject(ctx.take(account, 'organisation'), 'organisation')
  const orgColumns = [
    { from: 'entite', key: 'entite', label: 'PÔLE OU DIRECTION' },
    { from: 'repere', key: 'repere', label: 'REPÈRE' },
    { from: 'detail', key: 'detail', label: 'CE QUI EST CONNU' },
    { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ' },
  ]
  const dsiItems = asObjects(organisation['dsi'], 'organisation.dsi')
  const territoryItems = asObjects(organisation['territoires'], 'organisation.territoires')
  const dsiSection = listSection(ctx, {
    key: 'organisation-dsi',
    title: 'ORGANISATION DE LA DSI',
    sheet: 'organisation.dsi',
    items: dsiItems,
    columns: orgColumns,
  })
  const territorySection = listSection(ctx, {
    key: 'territoires',
    title: 'TERRITOIRES ET SITES',
    sheet: 'organisation.territoires',
    items: territoryItems,
    columns: orgColumns,
  })
  const entities: CommercialBrief['entities'] = [...dsiItems, ...territoryItems].map(item => {
    const note = ctx.text(asString(item['detail'], 'detail'))
    return {
      name: asString(item['entite'], 'entite'),
      nature: asString(item['repere'], 'repere'),
      status: 'active',
      country: 'FR',
      ...(note ? { note } : {}),
      reliability: asString(item['confiance'], 'confiance'),
    }
  })
  // Les entités nommées par le fichier de contacts (DSI, DR Île-de-France Ouest…) : sans elles, une personne n'a pas de
  // rattachement dans l'organigramme. Recopiées du fichier, jamais devinées.
  const entityNames = new Set(entities.map(entity => norm(entity.name)))
  for (const name of [
    ...new Set(people.map(person => person.entity).filter((value): value is string => Boolean(value))),
  ]) {
    if (entityNames.has(norm(name))) continue
    entityNames.add(norm(name))
    entities.push({
      name,
      nature: 'Entité citée par le fichier de contacts',
      status: 'active',
      country: 'FR',
      reliability: 'documents de compte',
    })
  }
  ctx.cover(
    'organisation + contacts',
    'entities',
    entities.length,
    'pôles et territoires du dossier, puis entités du fichier de contacts',
  )
  const unknownOrg = Object.keys(organisation).filter(key => !['dsi', 'territoires', 'note'].includes(key))
  if (unknownOrg.length > 0) throw new Error(`organisation : ${unknownOrg.join(', ')} sans case`)

  /* ---- sites ---- */
  const legalText = JSON.stringify(account['legal'])
  const territoryText = JSON.stringify(territoryItems)
  const hqAddress = 'Tour Enedis, 4 place de la Pyramide, 92800 Puteaux'
  if (!legalText.includes(hqAddress)) throw new Error('legal : adresse du siège introuvable')
  const sites: CommercialBrief['sites'] = [
    {
      name: 'Tour Enedis — siège',
      city: 'Puteaux',
      country: 'FR',
      kind: 'headquarters',
      why: hqAddress,
      reliability: 'fort',
    },
  ]
  for (const [city, why, reliability] of [
    ['Courbevoie', 'Site IT francilien (cybersécurité, SDSI PRISME, cloud)', 'fort'],
    ['Paris 17e', 'Agence de conduite régionale de Paris (SCADA)', 'fort'],
    ['Nanterre', 'Établissement francilien (registre)', 'moyen'],
    ['Paris 18e', 'Établissement francilien (registre)', 'moyen'],
    ['Évry-Courcouronnes', 'Établissement francilien (registre)', 'moyen'],
    ['Montigny-le-Bretonneux', 'Établissement francilien (registre)', 'moyen'],
    ['Savigny-le-Temple', 'Établissement francilien (registre)', 'moyen'],
  ] as const) {
    if (!territoryText.includes(city)) throw new Error(`sites : « ${city} » n’est pas dans le texte du dossier`)
    sites.push({ name: `Enedis — ${city}`, city, country: 'FR', kind: 'secondary', why, reliability })
  }
  ctx.cover('legal + organisation.territoires', 'sites', sites.length, 'villes recopiées du dossier (vérifiées)')

  /* ---- lots, applications, présence ---- */
  const lots = listSection(ctx, {
    key: 'lots-achats',
    title: 'LOTS D’ACHAT DE PRESTATIONS (DOCUMENTS DE COMPTE)',
    sheet: 'lots_achats',
    items: asObjects(ctx.take(account, 'lots_achats'), 'lots_achats'),
    columns: [
      { from: 'lot', key: 'lot', label: 'LOT' },
      { from: 'nature', key: 'nature', label: 'NATURE' },
      { from: 'pole', key: 'pole', label: 'PÔLE' },
      { from: 'projet', key: 'projet', label: 'PROJET' },
    ],
    note: 'cités dans les documents de compte, pas une source publique',
  })
  const applications = listSection(ctx, {
    key: 'applications',
    title: 'APPLICATIONS ET PROGRAMMES (DOCUMENTS DE COMPTE)',
    sheet: 'applications',
    items: asObjects(ctx.take(account, 'applications'), 'applications'),
    columns: [
      { from: 'nom', key: 'application', label: 'APPLICATION' },
      { from: 'description', key: 'ce_que_c_est', label: 'CE QUE C’EST' },
      { from: 'rattachement', key: 'rattachement', label: 'RATTACHEMENT' },
    ],
  })
  const presenceLines = ctx
    .text(asString(ctx.take(account, 'presence_sur_site'), 'presence_sur_site'))
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.endsWith(':'))
  const presence = {
    key: 'presence-sur-site',
    title: 'PRÉSENCE SUR SITE',
    columns: [column('constat', 'CE QU’UN CONSULTANT DEVRA TENIR')],
    rows: presenceLines.map(line => ({ constat: line })),
  }
  ctx.cover(
    'presence_sur_site',
    'sections[presence-sur-site]',
    presence.rows.length,
    'une ligne par constat, confiance en fin de ligne',
  )

  /* ---- ESN ---- */
  const esnBlock = asObject(ctx.take(account, 'esn'), 'esn')
  const esn: CommercialBrief['esn'] = []
  for (const entry of asObjects(esnBlock['base'], 'esn.base')) {
    const name = asString(entry['esn'], 'esn')
    if (norm(name) === 'esn') {
      ctx.skip('ESN de la base sans nom (« ESN ») : non reprise')
      continue
    }
    const n = Number(entry['profils'])
    const scopes = Array.isArray(entry['comptes']) ? entry['comptes'].map(String) : []
    esn.push({
      name,
      evidence_level: 'hint',
      proof: `${n} profil${n > 1 ? 's' : ''} vu${n > 1 ? 's' : ''} dans des parcours de consultants. Indice de présence : aucun référencement prouvé.`,
      ...(scopes.length > 0 ? { perimeter: scopes.join(', ') } : {}),
      reliability: 'faible',
    })
  }
  ctx.cover('esn.base', 'esn', esn.length, 'indice faible de présence, jamais un référencement')
  const providers = listSection(ctx, {
    key: 'prestataires-publics',
    title: 'ESN ET PANELS CITÉS PUBLIQUEMENT',
    sheet: 'esn.web',
    items: asObjects(esnBlock['web'], 'esn.web'),
    columns: [
      { from: 'nom', key: 'nom', label: 'NOM' },
      { from: 'nature', key: 'nature', label: 'NATURE' },
      { from: 'detail', key: 'detail', label: 'CE QUI EST PUBLIC' },
      { from: 'confiance', key: 'fiabilite', label: 'FIABILITÉ' },
    ],
  })
  const unknownEsn = Object.keys(esnBlock).filter(key => !['base', 'web', 'note'].includes(key))
  if (unknownEsn.length > 0) throw new Error(`esn : ${unknownEsn.join(', ')} sans case`)

  /* ---- écartés ---- */
  ctx.drop(
    account,
    'historique',
    'historique de NOTRE prospection (rendez-vous, actions par thème et par année) : notre activité commerciale, documents non publics',
  )
  ctx.drop(account, 'strategie_experis', 'stratégie de vente de l’ESN prospect : écartée (décision Louis 15/10)')
  ctx.drop(
    account,
    'lecture_par_voie',
    'notation des voies d’entrée du point de vue de l’ESN prospect : sa stratégie, écartée',
  )

  /* ---- garde-fous ---- */
  const guardrails = limitsToGuardrails(ctx, (ctx.take(account, 'limites') as string[]).map(String))
  const orgNote = ctx.text(asString(organisation['note'], 'organisation.note'))
  const esnNote = ctx.text(asString(esnBlock['note'], 'esn.note'))
  if (orgNote) guardrails.push({ point: 'Organisation de la DSI', detail: orgNote })
  if (esnNote) guardrails.push({ point: 'ESN observées', detail: esnNote })
  guardrails.push({
    point: 'Coordonnées',
    detail:
      'Seules les adresses du domaine enedis.fr sont reprises, et seulement quand elles portent le nom de la personne. Toute fonction est à revalider avant l’appel. Aucune coordonnée n’est devinée.',
  })

  const charts: CommercialBrief['charts'] = [
    {
      title: 'ESN VUES DANS LES PARCOURS (PROFILS)',
      items: esn.map(entry => ({ label: entry.name, value: Number(/^(\d+)/.exec(entry.proof)?.[1] ?? 0) })),
    },
    {
      title: 'CONTACTS PAR ENTITÉ',
      items: [
        ...people.reduce(
          (acc, person) =>
            acc.set(person.entity ?? 'Entité non précisée', (acc.get(person.entity ?? 'Entité non précisée') ?? 0) + 1),
          new Map<string, number>(),
        ),
      ].map(([label, value]) => ({ label, value })),
    },
  ]

  const brief: CommercialBrief = {
    account_name: accountName,
    generated_at: `${asOf}T00:00:00.000Z`,
    scope: 'france',
    headquarters: { label: 'Tour Enedis', city: 'Puteaux', address: hqAddress },
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
      signals,
      tools,
      referencingSection,
      panels,
      dsiSection,
      territorySection,
      lots,
      applications,
      presence,
      providers,
      sourcesSection(ctx, sourceRows),
    ],
    guardrails,
  }
  ctx.assertAllConsumed(account)
  assertDisplayable(brief, ctx.rules)
  return { brief, coverage: ctx.coverage, skipped: ctx.skipped, anomalies: ctx.anomalies }
}
