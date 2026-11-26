import { parseSpokenLanguages, type Consultant, type ConsultantUpsert, type SpokenLanguage } from '@bellum/contracts'

/** L'état éditable d'un consultant dans le formulaire. Tout en chaînes : c'est un
 *  formulaire, pas le contrat. La conversion vers `ConsultantUpsert` (types,
 *  nullités, listes) est faite par {@link toUpsert}, une seule fois. */
export type ConsultantFormState = {
  full_name: string
  title: string
  seniority: string
  /** Années d'expérience — SAISIES, jamais déduites (décision du 31/08/2026).
   *  Vide (`''`) = non renseigné ; `'0'` reste une réponse VALIDE (« tout
   *  juste diplômée »), les deux ne se confondent pas. */
  years_experience: string
  availability: string
  available_from: string
  contract_type: string
  /** Ce que la personne EST au regard du droit : candidat ou consultant. */
  kind: string
  /** Comment on mobilise la personne (D16) — distinct de `kind`. */
  engagement_kind: string
  /** Le partenaire qui porte un sous-traitant. Vide partout ailleurs. */
  partner_account_id: string
  /**
   * #2195.12 — le manager HIÉRARCHIQUE de la personne, choisi dans le vivier.
   *
   * Vide (`''`) = NON RENSEIGNÉ, et rien d'autre : jamais le `lead` d'une BU,
   * jamais le propriétaire commercial. Ce sont trois faits différents.
   */
  manager_id: string
  email: string
  phone: string
  public_profile_url: string
  tjm: string
  /** Les deux TJM sous `finance:read`, saisis en EUROS et convertis en
   *  centimes à l'envoi — personne ne tape des centimes dans un formulaire. */
  min_tjm: string
  cost_rate: string
  purchase_tjm: string
  /** Mobilité structurée (§8.2). Vide = NON RENSEIGNÉ, jamais « indifférent » :
   *  l'écran demande plutôt que de deviner. */
  mobility_zones: string
  remote_preference: string
  travel_acceptance: string
  relocation: string
  /** #2948 (#2329.19/.22/.23) — mobilité fine. Même doctrine : vide = NON
   *  RENSEIGNÉ, jamais une valeur devinée. */
  site_frequency: string
  international_mobility: string
  mobility_restrictions: string
  /** #2948 (#2329.30-.34) — processus. Vide = NON DEMANDÉ. */
  process_in_progress: string
  process_exclusive: string
  process_other_interviews: string
  process_decision_deadline: string
  /** Préférences de mission (§8.3) — avertissent, n'excluent jamais. */
  refused_sectors: string
  refused_technologies: string
  /** #3410.10/.11/.13/.14 — retour bêta #3410 : une préférence négative est
   *  aussi importante qu'une compétence positive. */
  preferred_client_types: string
  refused_clients: string
  environments_to_avoid: string
  non_negotiable_conditions: string
  stack: string
  sectors: string
  zones: string
  references: string
  /** Langues parlées, saisies « fr:natif, en:b2 ». Un code sans niveau est
   *  accepté : une langue déclarée sans évaluation reste une question à poser,
   *  pas un niveau à inventer. */
  languages: string
  /** Habilitations détenues, séparées par des virgules. */
  clearances: string
  wants: string
  notes: string
  /** Le CV source collé — matière de la réécriture p22. */
  cv_text: string
  /** H-DECISIONS #4348 — d'où vient la fiche quand elle est pré-remplie depuis un
   *  profil. Absent = rien n'est envoyé (jamais une source devinée, ni réécrite à
   *  l'édition). */
  source?: ConsultantUpsert['source']
  /**
   * LE BLOC 4 DU §3.2 — le consentement, enfin SAISISSABLE.
   *
   * Les trois valeurs voyageaient déjà (`consultantUpsertSchema`) et
   * s'affichaient déjà (onglet « Consentement »). Ce qui manquait était le
   * champ : aucune fiche ne pouvait passer de « jamais recueilli » à
   * « recueilli », quoi qu'on ait demandé à la personne.
   *
   * ⚠️ La valeur porte l'HORODATAGE COMPLET tel qu'il vient du serveur, pas la
   * date affichée. Le champ `<input type="date">` la tronque à l'affichage
   * seulement : tronquer ici déplacerait un accord de 14 h 32 à minuit au
   * premier enregistrement d'un champ voisin — une modification silencieuse sur
   * la donnée la plus sensible de la fiche.
   *
   * ⚠️ Vide = « jamais recueilli », JAMAIS « expiré ». Les deux appellent des
   * gestes opposés : poser la question, ou la reposer.
   */
  consent_given_at: string
  consent_expires_at: string
  /** La base légale en clair. Texte libre : la formulation engage l'ESN. */
  consent_basis: string
  /** #2185.57 — ce que la personne a EXCLU de son accord. Texte libre,
   *  distinct de la base légale : une restriction borne l'USAGE, pas le
   *  fondement. */
  consent_restrictions: string
}

/**
 * Ce que l'appelant a le droit d'ÉCRIRE. Aujourd'hui un seul axe : les montants.
 *
 * `finance` non renseigné = « on ne sait pas », et le défaut est alors
 * d'ENVOYER. Un appelant qui ignore le droit ne doit pas effacer trois montants
 * par prudence mal placée ; c'est le serveur qui tranche en dernier ressort.
 */
type ConsultantFormRights = { finance?: boolean }

export const EMPTY_FORM: ConsultantFormState = {
  full_name: '',
  title: '',
  seniority: 'inconnu',
  years_experience: '',
  availability: 'inconnu',
  available_from: '',
  contract_type: 'inconnu',
  kind: 'consultant',
  engagement_kind: 'inconnu',
  partner_account_id: '',
  manager_id: '',
  email: '',
  phone: '',
  public_profile_url: '',
  tjm: '',
  min_tjm: '',
  cost_rate: '',
  purchase_tjm: '',
  mobility_zones: '',
  remote_preference: '',
  travel_acceptance: '',
  relocation: '',
  site_frequency: '',
  international_mobility: '',
  mobility_restrictions: '',
  process_in_progress: '',
  process_exclusive: '',
  process_other_interviews: '',
  process_decision_deadline: '',
  refused_sectors: '',
  refused_technologies: '',
  preferred_client_types: '',
  refused_clients: '',
  environments_to_avoid: '',
  non_negotiable_conditions: '',
  stack: '',
  sectors: '',
  zones: '',
  references: '',
  languages: '',
  clearances: '',
  wants: '',
  notes: '',
  cv_text: '',
  consent_given_at: '',
  consent_expires_at: '',
  consent_basis: '',
  consent_restrictions: '',
}

/** Un consultant existant → l'état de formulaire, pour l'édition. Les listes
 *  reviennent en texte séparé par des virgules — la façon dont on les saisit. */
export function toForm(consultant: Consultant): ConsultantFormState {
  return {
    // Une fiche SANS nom (D366) ouvre le formulaire sur un champ VIDE, à
    // remplir. Ce n'est pas une valeur de remplissage : c'est l'état vide d'une
    // saisie, et le formulaire refuse d'enregistrer sans nom
    // (`consultantUpsertSchema.full_name`, `min(1)`).
    full_name: consultant.full_name ?? '',
    title: consultant.title ?? '',
    seniority: consultant.seniority,
    years_experience: consultant.years_experience != null ? String(consultant.years_experience) : '',
    availability: consultant.availability,
    available_from: consultant.available_from ?? '',
    contract_type: consultant.contract_type,
    kind: consultant.kind,
    engagement_kind: consultant.engagement_kind,
    partner_account_id: consultant.partner_account_id ?? '',
    manager_id: consultant.manager_id ?? '',
    email: consultant.email ?? '',
    phone: consultant.phone ?? '',
    public_profile_url: consultant.public_profile_url ?? '',
    tjm: consultant.tjm != null ? String(consultant.tjm) : '',
    mobility_zones: (consultant.mobility.zones ?? []).join(', '),
    remote_preference: consultant.mobility.remote ?? '',
    travel_acceptance: consultant.mobility.travel ?? '',
    relocation: consultant.mobility.relocation === null ? '' : String(consultant.mobility.relocation),
    site_frequency: consultant.mobility.siteFrequency ?? '',
    international_mobility: consultant.mobility.international === null ? '' : String(consultant.mobility.international),
    mobility_restrictions: consultant.mobility.restrictions ?? '',
    process_in_progress: consultant.process.inProgress === null ? '' : String(consultant.process.inProgress),
    process_exclusive: consultant.process.exclusive === null ? '' : String(consultant.process.exclusive),
    process_other_interviews: consultant.process.otherInterviews ?? '',
    process_decision_deadline: consultant.process.decisionDeadline ?? '',
    refused_sectors: consultant.preferences.refusedSectors.join(', '),
    refused_technologies: consultant.preferences.refusedTechnologies.join(', '),
    preferred_client_types: (consultant.preferences.preferredClientTypes ?? []).join(', '),
    refused_clients: (consultant.preferences.refusedClients ?? []).join(', '),
    environments_to_avoid: (consultant.preferences.environmentsToAvoid ?? []).join(', '),
    non_negotiable_conditions: consultant.preferences.nonNegotiableConditions ?? '',
    min_tjm: centsToEuros(consultant.min_tjm_cents),
    cost_rate: centsToEuros(consultant.cost_rate_cents),
    purchase_tjm: centsToEuros(consultant.purchase_tjm_cents),
    stack: consultant.stack.join(', '),
    sectors: consultant.sectors.join(', '),
    zones: consultant.zones.join(', '),
    references: consultant.references.join(', '),
    languages: consultant.languages.map(item => (item.level ? `${item.code}:${item.level}` : item.code)).join(', '),
    clearances: consultant.clearances.join(', '),
    wants: consultant.wants ?? '',
    notes: consultant.notes ?? '',
    cv_text: consultant.cv_text ?? '',
    // Repris TELS QUELS. `null` reste une chaîne vide — « jamais recueilli » —
    // et surtout pas une date du jour, qui affirmerait un accord.
    consent_given_at: consultant.consent.givenAt ?? '',
    consent_expires_at: consultant.consent.expiresAt ?? '',
    consent_basis: consultant.consent.basis ?? '',
    consent_restrictions: consultant.consent.restrictions ?? '',
  }
}

/** Centimes → euros affichables. `null`/absent reste une chaîne vide : un « 0 »
 *  se lirait comme un coût nul, ce qui n'est pas « non renseigné ». */
function centsToEuros(cents: number | null | undefined): string {
  return cents == null ? '' : String(Math.round(cents / 100))
}

/** Euros saisis → centimes. Une saisie non numérique vaut `null`, jamais 0 :
 *  un zéro traverserait le calcul de marge sans se faire remarquer. */
function eurosToCents(value: string): number | null {
  const euros = Number.parseInt(value.trim(), 10)
  return Number.isFinite(euros) && euros >= 0 ? euros * 100 : null
}

/**
 * Découpe une saisie « a, b , c » en liste propre, sans vide ni doublon.
 *
 * EXPORTÉE parce que l'écran en a besoin : le champ « Compétences » affiche des
 * PUCES, et deux découpages — un pour l'affichage, un pour l'envoi —
 * divergeraient au premier cas tordu (une virgule finale, une casse
 * différente), si bien qu'on verrait quatre puces et qu'on en enregistrerait
 * trois.
 */
export function toList(value: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of value.split(',')) {
    const item = raw.trim()
    if (item && !seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase())
      out.push(item)
    }
  }
  return out
}

/**
 * État de formulaire → payload d'upsert.
 *
 * Une valeur vide devient `null` (l'utilisateur retire une info), jamais une
 * chaîne vide qui mentirait. Un TJM non numérique est ignoré plutôt qu'envoyé à
 * zéro. On ne devine jamais une valeur non saisie.
 *
 * ⚠️ `rights.finance === false` OMET les trois montants au lieu de les envoyer à
 * `null`. La nuance n'est pas cosmétique : `fromUpsert` n'écrit que les clés
 * DÉFINIES, donc `null` effacerait le coût chargé d'un salarié parce que celui
 * qui a corrigé une faute de frappe n'avait pas le droit de VOIR ce montant.
 */
export function toUpsert(form: ConsultantFormState, rights: ConsultantFormRights = {}): ConsultantUpsert {
  const tjm = Number.parseInt(form.tjm.trim(), 10)
  const yearsExperience = Number.parseInt(form.years_experience.trim(), 10)
  const finance: Partial<ConsultantUpsert> =
    rights.finance === false
      ? {}
      : {
          min_tjm_cents: eurosToCents(form.min_tjm),
          cost_rate_cents: eurosToCents(form.cost_rate),
          purchase_tjm_cents: eurosToCents(form.purchase_tjm),
        }
  return {
    ...finance,
    full_name: form.full_name.trim(),
    ...(form.source ? { source: form.source } : {}),
    title: form.title.trim() || null,
    seniority: form.seniority as ConsultantUpsert['seniority'],
    // Une saisie NON NUMÉRIQUE (champ vide compris) devient `null`. `0`, lui,
    // TRAVERSE : contrairement au TJM, « zéro année d'expérience » est une
    // réponse réelle (« tout juste diplômée »), pas un signe de champ vide.
    years_experience: Number.isFinite(yearsExperience) && yearsExperience >= 0 ? yearsExperience : null,
    availability: form.availability as ConsultantUpsert['availability'],
    available_from: form.available_from.trim() || null,
    contract_type: form.contract_type as ConsultantUpsert['contract_type'],
    kind: form.kind as ConsultantUpsert['kind'],
    engagement_kind: form.engagement_kind as ConsultantUpsert['engagement_kind'],
    // Le partenaire n'est envoyé que pour une sous-traitance : le garder sur un
    // salarié afficherait un responsable qui n'en est pas un.
    partner_account_id: form.engagement_kind === 'sous_traitance' ? form.partner_account_id.trim() || null : null,
    // #2195.12 — saisi à la main, jamais dérivé. Vide = `null`, c'est-à-dire
    // « non renseigné » : le champ se VIDE volontairement, et ce geste-là est
    // une correction humaine, qui gagne toujours.
    manager_id: form.manager_id.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    public_profile_url: form.public_profile_url.trim() || null,
    tjm: Number.isFinite(tjm) && tjm > 0 ? tjm : null,
    // Une liste VIDE devient `null` et non `[]` : « aucune zone déclarée » et
    // « on n'a pas demandé » sont la même chose ici, et `[]` se lirait comme
    // « n'accepte aucune zone ».
    mobility_zones: toList(form.mobility_zones).length > 0 ? toList(form.mobility_zones) : null,
    remote_preference: (form.remote_preference || null) as ConsultantUpsert['remote_preference'],
    travel_acceptance: (form.travel_acceptance || null) as ConsultantUpsert['travel_acceptance'],
    relocation: form.relocation === '' ? null : form.relocation === 'true',
    site_frequency: (form.site_frequency || null) as ConsultantUpsert['site_frequency'],
    international_mobility: form.international_mobility === '' ? null : form.international_mobility === 'true',
    mobility_restrictions: form.mobility_restrictions.trim() || null,
    process_in_progress: form.process_in_progress === '' ? null : form.process_in_progress === 'true',
    process_exclusive: form.process_exclusive === '' ? null : form.process_exclusive === 'true',
    process_other_interviews: form.process_other_interviews.trim() || null,
    process_decision_deadline: form.process_decision_deadline.trim() || null,
    refused_sectors: toList(form.refused_sectors),
    refused_technologies: toList(form.refused_technologies),
    preferred_client_types: toList(form.preferred_client_types),
    refused_clients: toList(form.refused_clients),
    environments_to_avoid: toList(form.environments_to_avoid),
    non_negotiable_conditions: form.non_negotiable_conditions.trim() || null,
    stack: toList(form.stack),
    sectors: toList(form.sectors),
    zones: toList(form.zones),
    references: toList(form.references),
    languages: parseLanguages(form.languages),
    clearances: toList(form.clearances),
    wants: form.wants.trim() || null,
    notes: form.notes.trim() || null,
    cv_text: form.cv_text.trim() || null,
    // Vide = `null` = « jamais recueilli ». Une chaîne vide écrirait une base
    // légale VIDE, qui se relit « on a une base » sur l'onglet Consentement.
    consent_given_at: form.consent_given_at.trim() || null,
    consent_expires_at: form.consent_expires_at.trim() || null,
    consent_basis: form.consent_basis.trim() || null,
    consent_restrictions: form.consent_restrictions.trim() || null,
  }
}

/**
 * « fr:natif, en:b2, de » → la liste structurée.
 *
 * ⚠️ L'analyseur lui-même vit dans le CONTRAT, à côté de l'échelle
 * (`parseSpokenLanguages`), et cette fonction n'en est plus que le nom local.
 * Depuis le 29/08/2026, la fiche d'un BESOIN saisit les mêmes langues avec la
 * même grammaire ; deux analyseurs recopiés diraient un jour deux choses du même
 * « en:b2 », et l'écart ne se verrait nulle part — le moteur classerait « niveau
 * non précisé » un niveau que ce formulaire vient d'accepter.
 *
 * La règle, elle, n'a pas bougé : un niveau non reconnu est IGNORÉ plutôt que
 * rapproché du plus proche. « en:courant » ne devient pas « en:c1 », qui serait
 * une évaluation que personne n'a faite.
 */
export function parseLanguages(raw: string): SpokenLanguage[] {
  return parseSpokenLanguages(raw)
}

/** Le jour (AAAA-MM-JJ) d'un horodatage, pour la valeur d'un champ date : un accord de 14 h 32 ne glisse pas à minuit. */
export function isoDay(value: string): string {
  return value.slice(0, 10)
}
