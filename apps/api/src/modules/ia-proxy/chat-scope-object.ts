import { isInternshipPosting, type ChatScopeObject, type Consultant, type OpenNeedRow } from '@bellum/contracts'
import { signalHistoryKey } from '../signal-history/signal-history.projection'
import type { JobOfferHistoryRow } from '../signal-history/signal-history.projection'

/**
 * #1951.2 / #1951.3 / #1910.5 / #1910.6 / #1910.7 — LA FICHE QUE LAURA LIT
 * QUAND UN FIL EST CADRÉ SUR UN CONSULTANT, UN BESOIN OU UNE MISSION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE RENDU REÇOIT, ET D'OÙ
 * ─────────────────────────────────────────────────────────────────────────────
 * Une fiche RELUE par le contrôleur dans l'espace actif (`findOneScoped`,
 * `OpenNeedsService.list({ id })` — la même lecture que la fiche à l'écran). Le
 * navigateur n'a envoyé qu'une nature et un identifiant ; aucun de ses textes
 * n'arrive ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'ENTRE PAS DANS LE PROMPT, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 *  · les COORDONNÉES (e-mail, téléphone, profil public) : Laura prépare, elle ne
 *    contacte pas, et le cloisonnement des coordonnées (D20) se règle par rôle ;
 *  · la PHOTO et tout critère protégé (`c58_criteres_proteges`) : le fil peut
 *    comparer des profils, et un champ présent dans le prompt pèse sans qu'aucune
 *    ligne ne le « lise » ;
 *  · les MONTANTS (TJM, coût, budget) : ils suivent `finance:read`, que ce rendu
 *    ne connaît pas — les taire est le seul défaut qui ne fuit jamais ;
 *  · les NOTES LIBRES et le CV brut : du texte écrit pour un humain de l'équipe,
 *    pas une donnée structurée — et une injection s'y écrit sans effort.
 *
 * Une valeur ABSENTE n'est pas écrite : ni « 0 », ni « inconnu » de remplissage.
 * Le bloc côté service IA dit que ce qui manque à la fiche n'est pas connu.
 *
 * ⚠️ Ce texte est une DONNÉE. Les consignes de lecture vivent dans
 * `apps/ia/app/prompts/chat_scope_object.py`, pas ici.
 */
/**
 * #1910.6 — LA FORME MINIMALE QU'ON LIT D'UNE MISSION.
 *
 * Déclarée ici, et STRUCTURELLEMENT, parce que `MissionView` est privé à
 * `DeliveryService` : l'importer ferait dépendre le texte d'un prompt de la
 * forme interne d'un autre module, et l'y ajouter un champ financier demain le
 * ferait entrer ici sans que personne ne l'ait décidé. Ce type est la LISTE
 * BLANCHE — ce qui n'y figure pas ne peut pas être rendu, même si l'objet
 * reçu le porte.
 *
 * Ce qui n'y figure pas, et pourquoi : `daily_rate`, `daily_cost`,
 * `marginPercent` — les montants suivent `finance:read`, que cette lecture ne
 * connaît pas (la lecture passe `canReadFinance: false`) ; `photoUrl` d'un
 * affecté — un critère protégé n'entre pas dans un prompt qui peut comparer
 * des profils (`c58_criteres_proteges`).
 */
export type ChatScopeMissionRead = {
  label: string | null
  status: string | null
  role_title: string | null
  contract_kind: string | null
  started_on: string | null
  ends_on: string | null
  accountName: string | null
  /** ⚠️ `[]` = on a lu, personne n'est affecté (une alerte) ; `null` = la
   *  lecture a échoué, on ne sait pas. Les confondre ferait dire à Laura
   *  « personne dessus » sur une mission correctement staffée. */
  assignees: ReadonlyArray<{ fullName: string }> | null
}

/**
 * #1951.1 — LA FORME MINIMALE QU'ON LIT D'UNE PERSONNE.
 *
 * Déclarée ici, et STRUCTURELLEMENT, pour la même raison que la mission : c'est
 * la LISTE BLANCHE. `ContactEntity` porte une quarantaine de colonnes dont la
 * moitié n'a rien à faire dans un prompt ; typer ce rendu sur l'entité ferait
 * entrer ici la colonne que quelqu'un ajoutera demain, sans que personne ne
 * l'ait décidé. Ce qui n'y figure pas ne PEUT pas être rendu, même si l'objet
 * reçu le porte — et c'est ce que la spec vérifie en passant des champs en trop.
 *
 * Ce qui n'y figure pas, et pourquoi :
 *  · `email`, `phone`, `linkedin_url` — Laura PRÉPARE, elle ne contacte pas
 *    (ses outils n'ont aucun chemin d'envoi). Une coordonnée dans le prompt ne
 *    sert à rien et ne peut que fuir ; le cloisonnement des coordonnées (D20) se
 *    règle par rôle, que cette lecture ne connaît pas ;
 *  · `photo_url` et `location` — critères protégés (`c58_criteres_proteges`). Un
 *    fil cadré sur une personne peut en COMPARER plusieurs, et un champ présent
 *    dans le prompt pèse sans qu'aucune ligne ne le « lise » ; c'est exactement
 *    par ce chemin que `photoUrl` voyageait jusqu'à un prompt qui classe des
 *    gens. L'exception « ville / pays » de la doctrine n'est pas prise : rien
 *    dans une relance ne dépend de la ville, donc la prendre serait un risque
 *    sans contrepartie ;
 *  · `priority` et `contact_score` — un score NU n'entre pas dans un prompt.
 *    Sous trois axes nommés, il n'y a pas de score, et un « 5 » sans ses axes se
 *    lirait comme un jugement sur la personne ;
 *  · `note`, `profile_summary`, `raw_data`, les brouillons de messages — du
 *    texte libre écrit pour un humain, où une injection s'écrit sans effort.
 */
export type ChatScopeContactRead = {
  full_name: string | null
  title: string | null
  /** L'entité / direction, quand elle est renseignée — pas l'adresse. */
  entity: string | null
  decision_role: string | null
  seniority: string | null
  /** Le périmètre de responsabilité, tel qu'il a été qualifié. */
  scope: string | null
  budget_authority: string | null
  why_contact: string | null
  key_points: readonly string[] | null
  user_status: string | null
  /** Le compte de rattachement, relu à part. `null` = on ne l'a pas lu. */
  accountName: string | null
}

/**
 * #1951.4 — LA FORME MINIMALE QU'ON LIT D'UNE OPPORTUNITÉ.
 *
 * Même liste blanche que les précédentes, et deux omissions qui ne sont pas des
 * oublis :
 *  · `source` — elle nomme D'OÙ l'information vient, c'est-à-dire un de NOS
 *    fournisseurs de collecte. Ils ne se nomment jamais, ni à l'écran, ni dans
 *    un prompt ;
 *  · `confidence` — un mot comme « élevée » posé à côté d'une affaire se lit
 *    comme une chance de conclure. Aucune PROBABILITÉ ne s'affiche
 *    (`c26_probabilite`, refusée six fois) ; l'ÉTAPE, elle, est un fait.
 */
export type ChatScopeOpportunityRead = {
  label: string | null
  kind: string | null
  detail: string | null
  offer: string | null
  sector: string | null
  urgency: string | null
  stage: string | null
  /** Depuis quand l'affaire est à cette étape — un fait daté, pas un pronostic. */
  stage_entered_at: string | null
  accountName: string | null
  /** `undefined` = l'API ne l'a pas dit ; on n'écrit alors RIEN. */
  has_mission?: boolean
}

/**
 * Théo L1 — LA LISTE BLANCHE d'une offre d'emploi, comme les précédentes.
 *
 * Ce qui n'y figure pas, et pourquoi :
 *  · le NOM de la source et l'URL — ils nomment d'où l'offre vient, c'est-à-dire
 *    un de NOS fournisseurs de collecte. Ils ne se nomment jamais ; seul le fait
 *    qu'elle soit publiée sur le site du compte LUI-MÊME se dit (`publishedOn`) ;
 *  · le salaire — un montant, et ce fil n'a pas à comparer des rémunérations ;
 *  · le texte de l'offre — du texte libre, où une injection s'écrit sans effort.
 */
type ChatScopeJobOfferRead = {
  title: string
  accountName: string | null
  date: string | null
  location: string | null
  contractType: string | null
  skills: readonly string[]
  /** `null` = on ne sait pas où elle est publiée : rien n'est écrit. */
  publishedOn: 'own_site' | 'job_board' | null
  /** Le jour où elle a disparu de la dernière analyse — `null` tant qu'elle y est. */
  goneSince: string | null
}

type ChatScopeObjectRead =
  | { kind: 'consultant'; status: 'found'; consultant: Consultant }
  | { kind: 'need'; status: 'found'; need: OpenNeedRow }
  | { kind: 'mission'; status: 'found'; mission: ChatScopeMissionRead }
  | { kind: 'contact'; status: 'found'; contact: ChatScopeContactRead }
  | { kind: 'opportunity'; status: 'found'; opportunity: ChatScopeOpportunityRead }
  | { kind: 'job_offer'; status: 'found'; jobOffer: ChatScopeJobOfferRead }
  // Deux variantes et non une seule à `status` union : TypeScript n'exclut une
  // variante d'un test de statut que si son statut est un littéral UNIQUE.
  | { kind: ChatScopeObject['kind']; status: 'not_found' }
  | { kind: ChatScopeObject['kind']; status: 'unavailable' }

const HEADER: Record<ChatScopeObject['kind'], string> = {
  consultant: 'Un consultant du vivier',
  need: 'Un besoin client',
  // #1910.6 — « mission » dans le libellé : c'est le mot que le « introuvable »
  // et le « illisible » réutilisent tels quels.
  mission: 'Une mission en cours',
  // #1951.1 — « une personne » et non « un contact » : le second mot désigne
  // aussi bien la fiche que le geste de contacter, et Laura ne contacte pas.
  contact: 'Une personne d’un compte suivi',
  // #1951.4 — « affaire » dans le corps, « opportunité » dans le libellé : c'est
  // le mot du produit, et celui que le « introuvable » réutilise tel quel.
  opportunity: 'Une opportunité du pipe',
  // Théo L1 — « offre d’emploi » dans le libellé : le mot que l'« introuvable » réutilise.
  job_offer: 'Une offre d’emploi repérée chez un compte',
}

/** Au-delà, une liste de compétences est un CV, pas une fiche. */
const MAX_LIST_ITEMS = 20

export function renderChatScopeObject(read: ChatScopeObjectRead): string {
  const header = HEADER[read.kind]
  if (read.status === 'not_found') {
    return `${header} : fiche introuvable dans ton espace (supprimée, ou hors de cet espace).`
  }
  if (read.status === 'unavailable') {
    return `${header} : fiche illisible pour ce tour (lecture en échec). Ce n'est pas une fiche introuvable — ne réponds sur personne d'autre à sa place.`
  }
  if (read.kind === 'consultant') return renderConsultant(header, read.consultant)
  if (read.kind === 'mission') return renderMission(header, read.mission)
  if (read.kind === 'contact') return renderContact(header, read.contact)
  if (read.kind === 'opportunity') return renderOpportunity(header, read.opportunity)
  if (read.kind === 'job_offer') return renderJobOffer(header, read.jobOffer)
  return renderNeed(header, read.need)
}

/**
 * #1951.4 — CE QUE LAURA LIT D'UNE OPPORTUNITÉ.
 *
 * L'affaire et son état : de quoi il s'agit, chez qui, à quelle étape et depuis
 * quand. Pas de pronostic — l'étape et sa date sont des faits, une « confiance »
 * n'en est pas un.
 *
 * ⚠️ `has_mission` est TRIVALENT et ce rendu le respecte : `undefined` = l'API ne
 * l'a pas dit, donc on n'écrit rien ; `false` = une vraie mesure (aucune mission
 * ouverte dessus), et c'est ce qui rend « où en est cette affaire ? » utile.
 */
function renderOpportunity(header: string, opportunity: ChatScopeOpportunityRead): string {
  return [
    `${header} : ${text(opportunity.label) ?? '(intitulé non renseigné)'}`,
    line('Compte', text(opportunity.accountName)),
    line('Secteur', text(opportunity.sector)),
    line('Nature', known(opportunity.kind)),
    line('Offre visée', text(opportunity.offer)),
    line('Détail', text(opportunity.detail)),
    line('Étape', known(opportunity.stage)),
    line('À cette étape depuis le', text(opportunity.stage_entered_at)),
    line('Urgence', known(opportunity.urgency)),
    typeof opportunity.has_mission === 'boolean'
      ? opportunity.has_mission
        ? '- Une mission est déjà ouverte sur cette affaire.'
        : '- Aucune mission n’est encore ouverte sur cette affaire.'
      : null,
  ]
    .filter((entry): entry is string => entry !== null)
    .join('\n')
}

// Théo L1 — sélecteur avancé — l'offre relue depuis la ligne d'historique ET le dossier du compte.
/**
 * Théo L1 — DE LA LIGNE RELUE À LA FICHE, champ par champ.
 *
 * Le blob des signaux et les offres collectées se rapprochent de la ligne par
 * la MÊME identité que la matérialisation (`signalHistoryKey`), jamais par une
 * ressemblance : une offre dont on ne retrouve pas la trace garde son intitulé
 * et sa date, sans lieu ni compétences devinés.
 *
 * ⚠️ `null` = une offre de STAGE (décision Louis 12/10 : « pas d'offres de
 * stages dans tous les signaux ») — par son intitulé OU par le contrat que le
 * dossier porte. L'appelant la rend alors introuvable : elle ne s'affiche jamais.
 */
export function jobOfferReadFrom(row: JobOfferHistoryRow): ChatScopeJobOfferRead | null {
  const key = row.signal_key || signalHistoryKey(row.label)
  const signal = records(row.recent_signals).find(entry => {
    const label = text(entry['signal']) ?? text(entry['label'])
    return label !== null && signalHistoryKey(label) === key
  })
  const offer = records(row.job_signals).find(entry => {
    const title = text(entry['title'])
    return title !== null && key.includes(signalHistoryKey(title))
  })
  const contractType = text(offer?.['contract_type']) ?? text(offer?.['contractType'])
  if (isInternshipPosting(row.label, contractType)) return null
  const skills = Array.isArray(offer?.['skills']) ? (offer['skills'] as unknown[]) : []
  return {
    title: row.label,
    accountName: text(row.company_name),
    date: text(row.signal_date) ?? text(signal?.['date']) ?? text(offer?.['date']),
    location: text(signal?.['location']) ?? text(offer?.['location']) ?? text(offer?.['city']),
    contractType,
    skills: skills.map(text).filter((skill): skill is string => skill !== null),
    publishedOn: publishedOn(text(signal?.['url']) ?? text(offer?.['url']), row.website, signal ?? offer),
    goneSince: row.status === 'resolved' ? isoDay(row.resolved_at) : null,
  }
}

/** Le site du compte LUI-MÊME se dit ; tout autre site d'emploi reste anonyme. */
function publishedOn(
  url: string | null,
  website: string | null,
  trace: Record<string, unknown> | undefined,
): ChatScopeJobOfferRead['publishedOn'] {
  const offerHost = host(url)
  const ownHost = host(website)
  if (offerHost && ownHost && (offerHost === ownHost || offerHost.endsWith(`.${ownHost}`))) return 'own_site'
  return trace ? 'job_board' : null
}

function host(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function isoDay(value: Date | string | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    : []
}

/**
 * Théo L1 — CE QUE LAURA LIT D'UNE OFFRE D'EMPLOI.
 *
 * Le poste, chez qui, où, depuis quand, avec quelles compétences : de quoi
 * préparer une approche. La source ne se nomme pas — seul le site du compte
 * lui-même se dit.
 */
function renderJobOffer(header: string, offer: ChatScopeJobOfferRead): string {
  return [
    `${header} : ${offer.title}`,
    line('Compte', offer.accountName),
    line('Publiée le', offer.date),
    line('Lieu', offer.location),
    offer.location ? '- Pour parler de cette offre, cite le poste et la ville.' : null,
    line('Contrat', offer.contractType),
    line('Compétences demandées', list(offer.skills)),
    offer.publishedOn === 'own_site'
      ? '- Publiée sur le site du compte lui-même.'
      : offer.publishedOn === 'job_board'
        ? '- Publiée sur un site d’emploi (source non nommée).'
        : null,
    offer.goneSince ? `- L’offre n’est plus visible depuis le ${offer.goneSince} (dernière analyse).` : null,
  ]
    .filter((entry): entry is string => entry !== null)
    .join('\n')
}

/**
 * #1951.1 — CE QUE LAURA LIT D'UNE PERSONNE.
 *
 * Qui elle est dans l'organisation, et ce qui motive l'approche — pas ses
 * coordonnées, pas son visage, pas sa note. C'est exactement ce que le retour
 * demandait : « prépare une relance pour Sophie » doit lire la fiche de Sophie,
 * et non le dossier entier de son compte.
 *
 * ⚠️ Le compte est NOMMÉ ici alors qu'il est relu séparément : sans lui, Laura
 * saurait tout d'une personne sans savoir chez qui elle travaille, et une
 * relance écrite sans l'employeur ne se tient pas. `null` quand la lecture du
 * compte n'a pas eu lieu — on ne le devine pas depuis la fiche.
 */
function renderContact(header: string, contact: ChatScopeContactRead): string {
  return [
    `${header} : ${text(contact.full_name) ?? '(nom non renseigné)'}`,
    line('Compte', text(contact.accountName)),
    line('Poste', text(contact.title)),
    line('Direction / entité', text(contact.entity)),
    line('Rôle dans la décision', known(contact.decision_role)),
    line('Séniorité', known(contact.seniority)),
    line('Périmètre de responsabilité', text(contact.scope)),
    line('Pouvoir de décision budgétaire', text(contact.budget_authority)),
    line('Pourquoi l’approcher', text(contact.why_contact)),
    line('À retenir', list(contact.key_points)),
    line('Où en est l’échange', known(contact.user_status)),
  ]
    .filter((entry): entry is string => entry !== null)
    .join('\n')
}

function renderConsultant(header: string, consultant: Consultant): string {
  const availability = known(consultant.availability)
  const availableFrom = text(consultant.available_from)
  return [
    `${header} : ${text(consultant.full_name) ?? '(nom non renseigné)'}`,
    line('Poste', text(consultant.title)),
    line('Séniorité', known(consultant.seniority)),
    line(
      'Disponibilité',
      availability || availableFrom
        ? [availability, availableFrom ? `à partir du ${availableFrom}` : null].filter(Boolean).join(', ')
        : null,
    ),
    line('Mode de mobilisation', known(consultant.engagement_kind)),
    line('Compétences', list(consultant.stack)),
    line('Secteurs', list(consultant.sectors)),
    line('Zones', list(consultant.zones)),
  ]
    .filter((entry): entry is string => entry !== null)
    .join('\n')
}

function renderNeed(header: string, need: OpenNeedRow): string {
  const skills = Array.isArray(need.skills) ? need.skills : []
  const startOn = text(need.start_on)
  const duration = typeof need.duration_months === 'number' ? `${need.duration_months} mois` : null
  return [
    `${header} : ${text(need.title) ?? '(intitulé non renseigné)'}`,
    line('Compte', text(need.account_name)),
    line('Projet', text(need.project_label)),
    line('Statut', text(need.status)),
    line('Urgence', text(need.urgency)),
    line('Séniorité', text(need.seniority)),
    line('Postes à pourvoir', typeof need.headcount === 'number' ? String(need.headcount) : null),
    line('Démarrage', startOn ? [startOn, duration ? `durée ${duration}` : null].filter(Boolean).join(', ') : null),
    startOn ? null : line('Durée', duration),
    line('Lieu', text(need.location)),
    line('Contrat', text(need.contract_kind)),
    line('Compétences requises', list(skills.filter(skill => skill.required !== false).map(skill => skill.term))),
    line('Compétences souhaitées', list(skills.filter(skill => skill.required === false).map(skill => skill.term))),
    // Un compteur à zéro est une VRAIE mesure : aucune shortlist n'est ouverte.
    line('Profils déjà en shortlist', typeof need.shortlist_count === 'number' ? String(need.shortlist_count) : null),
  ]
    .filter((entry): entry is string => entry !== null)
    .join('\n')
}

/**
 * #1910.6 — CE QUE LAURA LIT D'UNE MISSION.
 *
 * Le calendrier et l'affectation, pas l'économie : « où en est-on sur cette
 * mission » se répond avec un statut, des dates et des noms. Les trois
 * montants qu'une mission porte restent hors du prompt (voir
 * {@link ChatScopeMissionRead}).
 */
function renderMission(header: string, mission: ChatScopeMissionRead): string {
  return [
    `${header} : ${text(mission.label) ?? '(intitulé non renseigné)'}`,
    line('Compte', text(mission.accountName)),
    line('Rôle', text(mission.role_title)),
    line('Statut', known(mission.status)),
    line('Contrat', known(mission.contract_kind)),
    line('Démarrage', text(mission.started_on)),
    line('Fin prévue', text(mission.ends_on)),
    staffing(mission.assignees),
  ]
    .filter((entry): entry is string => entry !== null)
    .join('\n')
}

/**
 * QUI est dessus — et la distinction que `[]` et `null` portent.
 *
 * `null` n'écrit RIEN : on ne sait pas, et « non mesuré n'est pas zéro ». `[]`
 * écrit la phrase, parce que « personne n'est affecté » est une VRAIE mesure —
 * c'est même l'alerte que le board nomme `unstaffed`.
 */
function staffing(assignees: ChatScopeMissionRead['assignees']): string | null {
  if (assignees === null) return null
  if (assignees.length === 0) return '- Personne n’est affecté sur cette mission aujourd’hui.'
  return line('Affectés aujourd’hui', list(assignees.map(assignee => assignee.fullName)))
}

function line(label: string, value: string | null): string | null {
  return value ? `- ${label} : ${value}` : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Un énuméré dont la valeur « inconnu » dit qu'on ne sait pas — donc rien à écrire. */
function known(value: unknown): string | null {
  const raw = text(value)
  return raw && !raw.startsWith('inconnu') ? raw : null
}

function list(values: readonly unknown[] | null | undefined): string | null {
  const items = (values ?? []).map(text).filter((item): item is string => item !== null)
  return items.length > 0 ? items.slice(0, MAX_LIST_ITEMS).join(', ') : null
}
