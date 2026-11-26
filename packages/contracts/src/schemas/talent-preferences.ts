import { z } from 'zod'

/**
 * Mobilité et préférences de mission (PDF 3 §8.2 et §8.3).
 *
 * La règle qui gouverne tout ce module tient en une phrase du §8.3 : « ces
 * préférences filtrent le matching **en avertissement, pas en exclusion**. Un
 * profil qui refuse le secteur bancaire reste proposable pour une mission
 * bancaire — avec un drapeau. C'est le recruteur qui parle au consultant, pas
 * l'algorithme. »
 *
 * L'autre règle vient du §8.2 : ces champs sont RAREMENT dans un CV. `null`
 * n'est pas une valeur par défaut à combler, c'est une information — « on n'a
 * pas demandé ». Le confondre avec « a dit non » ferait écarter quelqu'un sur
 * une réponse qu'il n'a jamais donnée.
 */

export const REMOTE_PREFERENCES = ['sur_site', 'hybride', 'full_remote', 'indifferent'] as const
export const remotePreferenceSchema = z.enum(REMOTE_PREFERENCES)
export type RemotePreference = (typeof REMOTE_PREFERENCES)[number]

export const TRAVEL_ACCEPTANCES = ['aucun', 'ponctuel', 'frequent'] as const
export const travelAcceptanceSchema = z.enum(TRAVEL_ACCEPTANCES)
export type TravelAcceptance = (typeof TRAVEL_ACCEPTANCES)[number]

/**
 * #2948 (#2329.19) — fréquence sur site EXACTE. Distincte de
 * `TRAVEL_ACCEPTANCES`, qui porte des déplacements PONCTUELS ailleurs qu'au
 * domicile (chez un autre client, en séminaire) : celle-ci répond à « à quel
 * rythme est-elle attendue chez LE client », une question qu'on pose une fois
 * la mission identifiée, pas avant.
 */
export const SITE_FREQUENCIES = ['jamais', 'ponctuelle', 'reguliere', 'permanente'] as const
export const siteFrequencySchema = z.enum(SITE_FREQUENCIES)
export type SiteFrequency = (typeof SITE_FREQUENCIES)[number]

export const talentMobilitySchema = z
  .object({
    /** Départements ou régions acceptés — FRANÇAIS uniquement (voir
     *  `international` ci-dessous pour le hors-France). `null` = non renseigné. */
    zones: z.array(z.string()).nullable(),
    remote: remotePreferenceSchema.nullable(),
    travel: travelAcceptanceSchema.nullable(),
    /** `false` = a dit non. `null` = on n'a pas demandé. */
    relocation: z.boolean().nullable(),
    /** #2948 (#2329.19) — voir {@link SITE_FREQUENCIES}. `null` = non demandé. */
    siteFrequency: siteFrequencySchema.nullable(),
    /**
     * #2948 (#2329.22) — mobilité INTERNATIONALE, distincte de `zones`
     * ci-dessus (qui ne porte que du national). `false` = a dit non. `null` =
     * on n'a pas demandé.
     */
    international: z.boolean().nullable(),
    /**
     * #2948 (#2329.23) — une restriction NOMMÉE (permis, découché, garde
     * d'enfant…), texte libre : aucune échelle commune ne survit à deux ESN,
     * même patron que `consultantSchema.consent.restrictions`. `null` =
     * aucune restriction connue, jamais une chaîne vide.
     */
    restrictions: z.string().trim().max(500).nullable(),
  })
  .strict()
export type TalentMobility = z.infer<typeof talentMobilitySchema>

/**
 * #2948 (#2329.30-.34) — PROCESSUS : démarches en cours, exclusivité, autres
 * entretiens, deadline de décision, owner.
 *
 * `owner` (#2329.34) N'EST PAS un champ ici : `consultants.owner_user_id`
 * (#2185.10, déjà affiché en entête de fiche, `owner_name`) porte déjà « qui
 * pilote cette fiche ». Un second « owner de processus » ferait deux réglages
 * pour la même question (GA-26).
 */
export const talentProcessSchema = z
  .object({
    /** Démarches (candidatures/entretiens) EN COURS ailleurs. `null` = on n'a
     *  pas demandé. */
    inProgress: z.boolean().nullable(),
    /** Exclusivité accordée sur le processus en cours. `null` = on n'a pas
     *  demandé — jamais un « non exclusif » deviné. */
    exclusive: z.boolean().nullable(),
    /** Les AUTRES entretiens/processus, EN CLAIR. `null` = rien de connu,
     *  jamais une chaîne vide. */
    otherInterviews: z.string().trim().max(500).nullable(),
    /** La date à laquelle la personne doit décider chez un autre acteur.
     *  `null` = aucune deadline connue. */
    decisionDeadline: z.string().nullable(),
  })
  .strict()
export type TalentProcess = z.infer<typeof talentProcessSchema>

export const talentPreferencesSchema = z
  .object({
    wantedSectors: z.array(z.string()),
    refusedSectors: z.array(z.string()),
    refusedTechnologies: z.array(z.string()),
    /** `regie`, `forfait`… tels que le catalogue des besoins les nomme. */
    wantedContractKinds: z.array(z.string()),
    /**
     * #3410.10 — le TYPE de client visé (« grand compte », « scale-up »,
     * « direct », « via ESN »…), texte libre comme `wantedSectors` : aucune
     * taxonomie fermée ne survivrait à deux ESN. Optionnel pour ne pas casser
     * les lectures existantes de `TalentPreferences` (GA-26 : un champ neuf
     * s'ajoute, il ne redéfinit rien).
     */
    preferredClientTypes: z.array(z.string()).optional(),
    /**
     * #3410.11 — des CLIENTS NOMMÉS que la personne refuse, distinct de
     * `refusedSectors` (un secteur entier) et du `clientHistoryFlag` du
     * matching (qui porte un refus DU client, jamais un refus DE la
     * personne). Texte libre : la personne nomme, l'écran ne résout pas vers
     * un compte.
     */
    refusedClients: z.array(z.string()).optional(),
    /**
     * #3410.13 — un ENVIRONNEMENT à éviter (« astreinte », « management à
     * distance seul »…), distinct de `refusedTechnologies` (un outil) et de
     * `talentMobilitySchema.restrictions` (une contrainte personnelle).
     */
    environmentsToAvoid: z.array(z.string()).optional(),
    /**
     * #3410.14 — une préférence négative est aussi importante qu'une
     * compétence positive (Louis, retour bêta #3410) : la CONDITION qui rend
     * une mission inacceptable, en clair, distincte de `wants` (les
     * aspirations, positives) et de `notes` (tout le reste, non structuré).
     * `null` = aucune condition connue, jamais une chaîne vide.
     */
    nonNegotiableConditions: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
export type TalentPreferences = z.infer<typeof talentPreferencesSchema>

/** Ce que le matching a besoin de savoir de la mission pour lever un drapeau. */
export type MissionContext = {
  sector?: string | null
  /** Le lieu du besoin, tel qu'il est écrit. */
  zone?: string | null
  /** Les technologies demandées. */
  technologies?: readonly string[]
  contractKind?: string | null
  /** `true` quand le besoin est explicitement à distance. */
  remote?: boolean | null
}

export type PreferenceWarning = {
  kind:
    | 'refused_sector'
    | 'refused_technology'
    | 'remote_mismatch'
    | 'zone_mismatch'
    | 'travel_mismatch'
    | 'contract_kind_mismatch'
  /** Ce qui a déclenché le drapeau, en clair. */
  detail: string
}

function normalise(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Les AVERTISSEMENTS qu'un profil déclenche sur une mission.
 *
 * Rend une liste, jamais un verdict : c'est l'appelant qui affiche, et personne
 * n'est retiré du classement. Une liste vide veut dire « aucune préférence
 * connue ne s'y oppose » — pas « la personne accepte », ce que seule la
 * personne peut dire.
 *
 * Un champ `null` ne produit AUCUN drapeau : on ne reproche pas à quelqu'un une
 * réponse qu'on ne lui a jamais demandée.
 */
export function preferenceWarnings(
  mobility: TalentMobility,
  preferences: TalentPreferences,
  mission: MissionContext,
): PreferenceWarning[] {
  const warnings: PreferenceWarning[] = []

  const missionSector = mission.sector ? normalise(mission.sector) : null
  if (missionSector) {
    const refused = preferences.refusedSectors.find(sector => normalise(sector) === missionSector)
    if (refused) warnings.push({ kind: 'refused_sector', detail: refused })
  }

  for (const technology of mission.technologies ?? []) {
    const refused = preferences.refusedTechnologies.find(item => normalise(item) === normalise(technology))
    if (refused) warnings.push({ kind: 'refused_technology', detail: refused })
  }

  // #2336.13 — « types de contrat voulus ». Contrairement aux secteurs, un
  // contrat n'a qu'UN type à la fois (régie, forfait…) : déclarer ceux qu'on
  // VEUT revient à écarter les autres, c'est pourquoi il n'existe pas de
  // `refusedContractKinds` séparé. Ne joue que si la personne a répondu (liste
  // non vide) ET que le besoin porte un type connu — même garde que le reste
  // du fichier : une réponse jamais donnée ne produit aucun drapeau.
  if (mission.contractKind && preferences.wantedContractKinds.length > 0) {
    const wanted = normalise(mission.contractKind)
    const matches = preferences.wantedContractKinds.some(kind => normalise(kind) === wanted)
    if (!matches) warnings.push({ kind: 'contract_kind_mismatch', detail: mission.contractKind })
  }

  // Le distanciel : seuls les cas FRANCHEMENT contradictoires lèvent un
  // drapeau. « Hybride » face à une mission sur site n'est pas une opposition,
  // c'est une conversation.
  if (mobility.remote === 'full_remote' && mission.remote === false) {
    warnings.push({ kind: 'remote_mismatch', detail: 'full_remote' })
  }
  if (mobility.remote === 'sur_site' && mission.remote === true) {
    warnings.push({ kind: 'remote_mismatch', detail: 'sur_site' })
  }

  // La zone ne compte QUE si la personne en a déclaré et que la mission est sur
  // site : une mission à distance n'a pas de lieu qui vaille.
  if (mobility.zones && mobility.zones.length > 0 && mission.zone && mission.remote !== true) {
    const wanted = normalise(mission.zone)
    const covered = mobility.zones.some(zone => wanted.includes(normalise(zone)) || normalise(zone).includes(wanted))
    if (!covered) warnings.push({ kind: 'zone_mismatch', detail: mission.zone })
    // Refuser tout déplacement ET être hors zone est la seule combinaison où
    // le déplacement devient un vrai sujet.
    if (!covered && mobility.travel === 'aucun') {
      warnings.push({ kind: 'travel_mismatch', detail: mission.zone })
    }
  }

  return warnings
}
