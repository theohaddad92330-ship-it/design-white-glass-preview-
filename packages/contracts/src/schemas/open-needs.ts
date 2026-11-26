import { z } from 'zod'
import { convergenceStateSchema } from './analysis/convergence.js'
import { clearanceSchema, spokenLanguageSchema } from './language.js'
import { measuredRate } from './measurability.js'
import { deliveryModeSchema, supervisionRoleSchema } from './mission-delivery-mode.js'
import { NEED_THEO_STATUSES } from './need-theo-status.js'
import { needNextActionSchema } from './need-next-action.js'
import { profileTypeAgreementSchema } from './need-presenter-gate.js'
import { paginatedResultSchema } from './pagination.js'
import { staffableVerdictSchema } from './staffable-gate.js'
import { remotePreferenceSchema } from './talent-preferences.js'
import {
  contractKindSchema,
  needProcurementInvolvementSchema,
  needProvenanceSchema,
  needSourceSchema,
  needUrgencySchema,
  projectNeedStatusSchema,
  projectStageSchema,
  requiredSkillSchema,
} from './project.js'

/**
 * #2067.25-.29 — UN FAIT PAR CONSULTANT POSITIONNÉ, JAMAIS UN CLASSEMENT.
 *
 * Voir le docblock de `openNeedRowSchema.positioned_consultant` pour la
 * source de chaque champ. `fitScore` est le score déjà STOCKÉ au moment du
 * push (`submissions.pushable_score`) — cette forme ne recalcule ni ne
 * reclasse rien, elle relit un fait déjà écrit.
 */
export const positionedConsultantFactSchema = z.object({
  submissionId: z.string().guid(),
  consultantId: z.string().guid(),
  /** `null` tant que personne n'a nommé la fiche (D366) — jamais deviné. */
  consultantName: z.string().nullable(),
  /** Quand le CV est réellement PARTI — c'est ce qui fait de ce consultant
   *  le POSITIONNÉ, pas un simple shortlisté. */
  submittedAt: z.string(),
  /** #2067.25 (moitié « adéquation ») — le score poussable au moment du push.
   *  `null` = ce positionnement n'est pas né d'un matching, jamais 0. */
  fitScore: z.number().int().nullable(),
  /** #2067.25 (moitié « disponibilité ») — `consultants.availability`,
   *  déclaratif. `null`/`'inconnu'` = non renseigné. */
  availability: z.string().nullable(),
  /** #2067.26 — le TJM DEMANDÉ sur cette soumission, en centimes. `null` =
   *  non chiffré, jamais 0. */
  proposedRateCents: z.number().int().nullable(),
  /** #2067.27 — vrai dès qu'une zone de mobilité ou une préférence remote
   *  est déclarée sur la fiche du consultant. */
  mobilityKnown: z.boolean(),
  /** #2067.28 — les AUTRES soumissions non closes de ce même consultant,
   *  ailleurs. Un compte réel, `0` compris — pas un jugement sur l'affaire. */
  otherActiveSubmissions: z.number().int().min(0),
  /** #2175.29 (épopée #2880, lot V33) — l'ACCORD RÉEL du positionné : son TJM
   *  ET son CV ont été validés par un GESTE du commercial
   *  (`consultants.tjm_validated_at` / `.cv_validated_at`, #2948), jamais
   *  déduits. Optionnel : une API qui ne le porte pas encore vaut « non
   *  mesuré », jamais « oui ». */
  agreementConfirmed: z.boolean().optional(),
})
export type PositionedConsultantFact = z.infer<typeof positionedConsultantFactSchema>

/**
 * L'écran « Besoins ouverts » (PDF 2 §7.5, ticket BEL-CRM-101).
 *
 * Le problème qu'il ferme : les besoins étaient ENTERRÉS dans le tiroir de
 * chaque projet. Un recruteur devait ouvrir compte par compte pour savoir sur
 * quoi travailler — c'est-à-dire qu'il travaillait sur ce qu'il avait sous les
 * yeux, pas sur ce qui était urgent.
 *
 * Une ligne porte donc TOUT ce qu'il faut pour décider sans ouvrir le dossier :
 * le rôle, ce que le client exige, quand ça démarre, où, chez qui, et combien
 * de profils sont déjà sur la table.
 */
export const openNeedRowSchema = z.object({
  id: z.string().guid(),
  title: z.string(),
  /** `null` = personne n'a dit l'urgence. Le badge ne s'affiche pas ; il ne
   *  s'affiche pas « normale ». */
  urgency: needUrgencySchema.nullable(),
  skills: z.array(requiredSkillSchema),
  seniority: z.string().nullable(),
  headcount: z.number().int().min(1),
  /** En CENTIMES. `null` = non communiqué — la colonne affiche « – », jamais 0,
   *  qui se lirait « gratuit ». */
  target_tjm_cents: z.number().int().nullable(),
  start_on: z.string().nullable(),
  duration_months: z.number().int().nullable(),
  location: z.string().nullable(),
  /**
   * #2173.29 — LE TÉLÉTRAVAIL, réutilisant `remotePreferenceSchema` (GA-26,
   * voir {@link projectNeedSchema.remote} pour la raison complète). Optionnel
   * comme les champs voisins récemment ajoutés : le web se déploie en une
   * minute, l'API en plusieurs, et un serveur qui ne le sélectionne pas encore
   * ne doit pas casser la fiche.
   *
   * ⚠️ `null` = non renseigné, jamais `'sur_site'` par défaut.
   */
  remote: remotePreferenceSchema.nullable().optional(),
  contract_kind: contractKindSchema,
  /** X66 / #3547 — le forfait encadré, lu sur la fiche du besoin. Optionnels :
   *  web-avant-API. Absent ≡ staffé (comportement historique). */
  delivery_mode: deliveryModeSchema.optional(),
  supervision_role: supervisionRoleSchema.nullish(),
  client_team_size: z.number().int().min(1).nullish(),
  client_team_names: z.array(z.string()).optional(),
  deadline_at: z.string().nullable(),
  status: projectNeedStatusSchema,
  status_reason: z.string().nullable(),
  /** #3389.13 — la reprise prévue d'une veille. `.optional()` : web-avant-API. */
  resume_on: z.string().nullable().optional(),
  /**
   * Quand ce besoin est entré dans son étape courante — la colonne n°12 de la
   * source, « Âge dans l'étape ».
   *
   * `null` = ce besoin n'a jamais franchi de transition (il est là depuis sa
   * création, ou il a été repris par la migration des onze états). La cellule
   * dit alors « non mesuré » et **jamais « 0 j »** : les deux se ressemblent à
   * l'œil et appellent des gestes opposés — « 0 j » dit « ça vient de bouger,
   * laisse-le vivre », l'absence dit « personne ne l'a jamais fait bouger ».
   */
  status_changed_at: z.string().nullable(),
  source: needSourceSchema.nullable(),
  provenance: needProvenanceSchema.nullable(),
  owner_id: z.string().guid().nullable(),
  /** #4158.34 — objet PRIVÉ : visible de son porteur et de qui gère l'équipe. Absent = partagé. */
  is_private: z.boolean().optional(),
  /**
   * #2175.8 (lot W20) — L'INTERLOCUTEUR : le demandeur, la personne qui a
   * exprimé le besoin. `null` = personne n'a été désignée — jamais un nom
   * déduit du compte. Optionnel : le web se déploie avant l'API, une réponse
   * antérieure au champ reste lisible.
   */
  contact_id: z.string().guid().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  /** Le nombre de profils déjà sur la table. `0` est une vraie réponse ici —
   *  c'est même l'alerte du §16 : « besoins ouverts sans shortlist, seuil 0 ». */
  shortlist_count: z.number().int().min(0),
  /** Théo C projects-besoins.A8 — « Périmé — à revérifier » : ouvert depuis plus de `NEED_STALE_AFTER_DAYS` jours, sans shortlist. Absent = non calculé. */
  stale: z.boolean().optional(),
  /** Théo C projects-besoins — la page d'origine de l'offre qui a fait naître le besoin ; `null`/absent = inconnue, jamais devinée. */
  source_url: z.string().nullable().optional(),
  /** La porte G3 (§7.6). `unknown` = la question n'a pas été posée. */
  staffable: staffableVerdictSchema,
  staffable_reason: z.string().nullable(),
  /**
   * #2558.1 — un besoin existe sans projet.
   *
   * Les TROIS champs du projet sont `null` ENSEMBLE, ou renseignés ensemble :
   * un besoin qui n'appartient à aucun projet n'a ni étiquette ni étape, et il
   * ne faut surtout pas lui en fabriquer une vide. `null` ici est un état
   * VALIDE — pas une donnée manquante à compléter : la majorité des missions
   * d'ESN ne produisent aucun signal public, et les attacher à un projet
   * inventé fabriquait de la donnée creuse (retour bêta du 17/09/2026).
   *
   * ⚠️ L'écran dit « sans projet », jamais « – » ni une étape par défaut : une
   * valeur absente ne s'affiche pas comme une valeur (GA-18 / GA-19).
   */
  project_id: z.string().guid().nullable(),
  project_label: z.string().nullable(),
  project_stage: projectStageSchema.nullable(),
  /**
   * #2175.12 — LE « RÉSULTAT ATTENDU » DE LA SYNTHÈSE. Relit `ProjectRow.objective`
   * (project.ts, « ce qu'on cherche à obtenir », écrit à la conversion d'une
   * piste) — jamais un second champ recalculé (GA-26). `undefined` = réponse
   * antérieure à ce lot (deploy-skew), `null` = aucun objectif écrit sur le
   * projet, la phrase = ce qui a été saisi. Même trivalence que `objective`
   * sur `ProjectRow`.
   */
  project_objective: z.string().nullable().optional(),
  /**
   * #2558.1 — le COMPTE, lui, ne peut pas manquer, et c'est l'invariant qui
   * REMPLACE le `project_id NOT NULL` qu'on vient de retirer. Il ne vient plus
   * de la jointure au projet mais de `project_needs.account_id`
   * (migration `1795711263408`, `NOT NULL`) : c'est par lui qu'une ligne du
   * board se rejoint, avec ou sans projet.
   */
  account_id: z.string().guid(),
  account_name: z.string().nullable(),
  /**
   * Le LOGO RÉEL du compte (`accounts.logo_url`), ou `null`.
   *
   * ⚠️ `null` = ce compte n'a pas de logo connu, et la carte affiche alors son
   * INITIALE — jamais une image reconstruite depuis un domaine. Le produit sait
   * fabriquer une seconde piste (le favicon réellement servi par le site) ; la
   * carte d'un kanban ne l'emprunte pas : trente favicons approximatifs côte à
   * côte se lisent comme trente identités visuelles, dont aucune n'a été
   * vérifiée.
   *
   * Optionnel, comme les champs ci-dessus : le web se déploie avant l'API.
   */
  account_logo_url: z.string().nullable().optional(),
  entity_id: z.string().guid().nullable(),
  entity_name: z.string().nullable(),

  /* ────────────────────────────────────────────────────────────────────────
   *  CE QUE LE BESOIN EXIGE, ET CE QU'IL RACONTE
   * ────────────────────────────────────────────────────────────────────────
   * Ces huit champs existaient en base et dans `projectNeedSchema`, et
   * n'entraient PAS ici : ni la liste ni la fiche ne pouvaient les lire. Deux
   * d'entre eux — `languages` et `clearances` — alimentent les axes 6 et 12 du
   * rapprochement, dont le second est BLOQUANT. Ils arrivaient donc toujours
   * vides côté besoin, et un profil sans l'habilitation exigée n'était jamais
   * écarté, alors que le moteur savait le faire.
   *
   * ⚠️ Ils sont OPTIONNELS, et c'est délibéré. Le web se déploie en une minute
   * (Vercel), l'API en plusieurs (Railway) : pendant la fenêtre, un écran neuf
   * lit une réponse ancienne. `undefined` (« le serveur ne l'a pas dit ») et
   * `[]` (« ce poste n'en exige aucune ») produisent la MÊME phrase honnête à
   * l'écran — « personne ne l'a renseigné » — donc l'ambiguïté ne coûte rien
   * ici, alors qu'un champ obligatoire ferait planter la fiche.
   */

  /** Les langues exigées par le poste (axe 6). Vide = le besoin n'en demande pas. */
  languages: z.array(spokenLanguageSchema).optional(),
  /** Les habilitations exigées (axe 12). Une habilitation manquante BLOQUE. */
  clearances: z.array(clearanceSchema).optional(),
  /** Le contexte et les objectifs, en prose. Le « Résumé » du §3.3. */
  context: z.string().nullable().optional(),
  /** Le domaine d'expertise attendu, quand il est plus précis que l'intitulé. */
  expertise: z.string().nullable().optional(),
  /** L'environnement technique. Vide = personne ne l'a listé. */
  stack: z.array(z.string()).optional(),
  /** Les contraintes du poste — astreinte, déplacement, horaires. */
  constraints: z.string().nullable().optional(),
  /** #2323.22 — le processus de présentation/recrutement, texte libre. */
  presentation_process: z.string().nullable().optional(),
  /** Import universel (27/09/2026) — colonnes importées sans champ d'accueil ; `{}` = aucune. Optionnel : réponse antérieure. */
  extra: z.record(z.string(), z.string()).optional(),
  /** #2939 (#2174.32) — comment le CLIENT décide en interne, distinct du
   *  recrutement côté ESN (`presentation_process` juste au-dessus). */
  decision_process: z.string().nullable().optional(),
  /** #2939 (#2174.33) — LE DÉCIDEUR. `null` = personne ne l'a dit. */
  decision_maker_contact_id: z.string().guid().nullable().optional(),
  /** Le nom du décideur — lu par jointure, même patron que `contact_name`
   *  juste au-dessus, jamais un second calcul. */
  decision_maker_name: z.string().nullable().optional(),
  /** #2939 (#2174.34) — voir {@link NEED_PROCUREMENT_INVOLVEMENTS} (`project.ts`). */
  procurement_involvement: needProcurementInvolvementSchema.nullable().optional(),
  /** #2323.18 — la porte PRÉSENTER, accord sur le type de profil.
   *  `unknown` = pas encore demandé au client. */
  profile_type_agreement: profileTypeAgreementSchema.optional(),
  /** #3409.2 — la NATURE du besoin (`besoin_exprime` / `besoin_detecte` /
   *  `projet_plausible` / `projet_confirme`, `convergenceStateSchema`,
   *  `analysis/convergence.ts`). La colonne et la porte d'écriture (`PATCH
   *  .../convergence-state`) existaient depuis le 26/09 sans qu'aucune ligne
   *  de `GET /projects/needs` ne la serve — la fiche ne pouvait ni l'afficher
   *  ni la faire changer. `null`/absent = jamais évalué. */
  convergence_state: convergenceStateSchema.nullable().optional(),
  /**
   * Le budget de l'affaire, en CENTIMES. `null` = non communiqué, jamais 0.
   *
   * ⚠️ Distinct du TJM cible, et jamais dérivé de lui : `budget × jours` est
   * exactement le calcul refusé pour le « CA potentiel » (il varierait selon
   * qu'on compte vingt ou vingt-et-un jours par mois).
   */
  budget_cents: z.number().int().nullable().optional(),
  /** Le PLANCHER acceptable, en centimes — ce en dessous de quoi on ne descend pas. */
  min_tjm_cents: z.number().int().nullable().optional(),
  /** #2323.38-.42 — les quatre champs du moteur de contradictions
   *  (`need-contradictions.ts`). Optionnels comme les champs voisins : le web
   *  se déploie en une minute, l'API en plusieurs. */
  interview_rounds: z.number().int().nullable().optional(),
  onsite_days_per_week: z.number().int().nullable().optional(),
  freelance_excluded: z.boolean().nullable().optional(),
  budget_validated: z.boolean().nullable().optional(),

  /* ────────────────────────────────────────────────────────────────────────
   *  LES MISSIONS NÉES DE CE BESOIN (31/08/2026)
   * ────────────────────────────────────────────────────────────────────────
   * Le quatrième chiffre du bandeau « Staffing » (dossier du 26/08, image 02).
   * Il valait « non mesuré » pour une raison JUSTE : une mission ne portait que
   * `opportunity_id`, l'identité de l'AFFAIRE, et une affaire porte souvent
   * plusieurs rôles. Louis a tranché le 31/08 — on pose le lien manquant
   * (`missions.need_id`, migration `1791001000001`) plutôt que de garder un
   * « non mesuré » définitif.
   *
   * ⚠️ DEUX champs, et le second est ce qui empêche un zéro menteur. Les
   * missions créées AVANT ce lien ne le portent pas, et rien ne peut le deviner
   * pour elles. Sur un besoin dont l'affaire porte de telles missions,
   * `missions_assigned = 0` serait FAUX : la bonne phrase est « des missions
   * existent sur cette affaire, aucune ne dit de quel rôle elle vient ».
   * `deriveNeedStaffingBand` fait le partage ; l'écran rend `UnknownValue` dans
   * ce cas et un vrai `0` quand l'affaire n'a aucune mission du tout.
   *
   * Optionnels comme les huit champs ci-dessus, et pour la même raison : le web
   * se déploie en une minute, l'API en plusieurs.
   */

  /** Les missions qui portent l'identité de CE besoin. `0` est un vrai zéro —
   *  à condition que `project_missions_unlinked` soit nul lui aussi. */
  missions_assigned: z.number().int().min(0).optional(),
  /** Les missions de l'AFFAIRE qui ne disent pas de quel rôle elles viennent.
   *  Strictement positif ⇒ le compte ci-dessus est un MINORANT, jamais un fait. */
  project_missions_unlinked: z.number().int().min(0).optional(),

  /**
   * #2067.21 / #2067.22 — LA DÉCISION ET LA VOIE D'ACHAT, mesurées sur le
   * BTMMP du PROJET (`opportunities.btmmp`, axes `management`/`process`),
   * jamais sur le besoin lui-même — ce bloc se saisit sur `BtmmpPanel.tsx`.
   *
   * `true` dit seulement qu'un texte existe sur l'axe, JAMAIS lequel :
   * `NeedDiscoveryRails` (rail CLIENT) n'a besoin que de nommer une absence,
   * pas de réafficher un contenu déjà rendu ailleurs (loi 4 du tome 7).
   * Optionnels comme les champs voisins : le web se déploie en une minute,
   * l'API en plusieurs.
   */
  decision_known: z.boolean().optional(),
  buying_process_known: z.boolean().optional(),

  /**
   * #2067.25-.29 — DÉCISION Louis 17/09 après-midi : LE RAIL CONSULTANT EST
   * PORTÉ PAR LE CONSULTANT POSITIONNÉ (SOUMIS) SUR LE BESOIN.
   *
   * Avant cette décision, aucun candidat n'était « le » consultant d'un
   * besoin — le moteur de matching (`apps/api/src/modules/consultants`)
   * CLASSE des personnes, et y toucher sans relecture dédiée ouvrait le
   * risque doctrine `c58_criteres_proteges`. La réponse retenue : celui dont
   * le CV est réellement PARTI (`submissions.submitted_at IS NOT NULL`), pas
   * un simple shortlisté sur lequel le client n'a encore rien reçu. Le plus
   * RÉCEMMENT soumis, quand il y en a plusieurs — {@link positionedConsultantFactSchema}
   * voisine `positioned_consultants_count` pour que l'écran puisse dire
   * « et N autres » plutôt que de les cacher.
   *
   * Chaque fait voyage tel qu'il est STOCKÉ, jamais recalculé — ce module ne
   * reclasse personne :
   *  - `fitScore` = `submissions.pushable_score`, figé au moment du push.
   *  - `availability` = `consultants.availability`, le champ DÉCLARATIF.
   *  - `proposedRateCents` = `submissions.proposed_rate_cents` — le TJM
   *    DEMANDÉ sur CETTE soumission, distinct de `consultants.tjm` (le TJM
   *    cible du consultant) et de `target_tjm_cents` (le TJM du CLIENT).
   *  - `mobilityKnown` = `consultants.mobility_zones` ou `.remote_preference`.
   *  - `otherActiveSubmissions` = les AUTRES soumissions non closes de ce
   *    même consultant — un compte, jamais un jugement.
   *
   * « Accord réel + restrictions » (#2067.29) reste HORS de ce contrat :
   * aucune colonne ne la porte encore dans ce dépôt (voir
   * `need-discovery-rails.ts`, qui la nomme `false` pour cette raison).
   *
   * `null` = aucun consultant positionné, une VRAIE réponse. `undefined` =
   * deploy-skew (le serveur ne l'a pas encore dit).
   */
  positioned_consultant: positionedConsultantFactSchema.nullable().optional(),
  /** Le nombre TOTAL de consultants positionnés sur ce besoin — sert à dire
   *  « et N autres » sans les cacher. `0` est un vrai zéro. */
  positioned_consultants_count: z.number().int().min(0).optional(),

  /**
   * #2173.49 — ARCHIVÉ, jamais un statut. Décision Louis 17/09/2026 (QCM) :
   * un rangement NEUTRE — `status` ne bouge pas quand ce champ se pose. `null`
   * = actif ; une date = depuis quand il est rangé. La vue « Archivés »
   * (`?archived=true`) est la SEULE à en montrer, la liste par défaut les
   * exclut quel que soit leur statut.
   */
  archived_at: z.string().nullable().optional(),

  /**
   * #3348 (LAU-FINAL-258, recette prod 30/09) — LA MÊME PROCHAINE ACTION que
   * l'écran calcule (`needNextAction`, `need-next-action.ts`), posée ICI par
   * le SERVEUR pour qu'un appelant qui ne peut pas exécuter du TypeScript
   * dans le navigateur — le pont copilote (`CopilotBridgeController
   * .findNeeds`), donc Laura — lise le MÊME verdict que la page, au lieu
   * d'en reconstruire un second à partir des dates brutes. `null` = le
   * besoin ne circule plus, pas une absence de calcul. Optionnel comme les
   * champs dérivés voisins : un déploiement en deux temps ne fait pas
   * planter un client qui ne le lit pas encore.
   */
  next_action: needNextActionSchema.nullable().optional(),
})
export type OpenNeedRow = z.infer<typeof openNeedRowSchema>

/**
 * Depuis combien de jours ENTIERS ce besoin est dans son étape.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE FONCTION REND, ET CE QU'ELLE REFUSE DE RENDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `null` sur une date absente ou illisible — jamais `0`, jamais `NaN`. C'est
 * l'invariant du dépôt : « non mesuré n'est pas mesuré à zéro ». La question de
 * GA-19 se pose exactement ici, et sa réponse est non : si la date manque,
 * « 0 j » n'est pas vrai, il est faux ET rassurant, ce qui est la pire
 * combinaison — un besoin immobile depuis huit mois s'afficherait « 0 j ».
 *
 * `0` quand la date est là et que le changement date d'aujourd'hui : ce
 * zéro-là est VRAI, et il ne passe donc pas par `UnknownValue`.
 *
 * Jamais un nombre négatif. Une date au futur existe pour de bon (les jeux
 * publics en portent, une horloge de serveur en avance suffit) et « −3 j en
 * étape » ferait douter de tout le tableau.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ POURQUOI IL N'Y A PAS DE SEUIL D'ALERTE ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * La source demande « **12 j**, rouge **au-delà de la durée type** »
 * (PDF-03 §1.4, colonne 12). Elle donne l'exemple, pas le seuil : « durée
 * type » n'est défini NULLE PART — ni dans ce document, qui l'emploie deux
 * fois sans jamais la chiffrer (§1.4 et §1.5, « immobile au-delà de la durée
 * type »), ni dans le dépôt.
 *
 * On rend donc l'âge NU. Le nombre est vrai tout seul et répond à la question
 * pour laquelle la colonne existe (« où le stock s'accumule ») ; la couleur est
 * la moitié qui dépend d'une décision que personne n'a prise.
 *
 * Les deux seuils voisins du dépôt ont été regardés et écartés, parce que les
 * réutiliser serait inventer un seuil DERRIÈRE une citation — ce qui est pire
 * que l'inventer ouvertement, puisque ça se relit comme une règle établie :
 *
 * - `MISSION_BOARD_STALE_DAYS` (`mission-board.ts`) est indexé par COLONNE du
 *   board Missions. Un état de besoin n'a aucune correspondance vers ces
 *   colonnes — il faudrait en écrire une, et deux des quatorze états
 *   (`qualified`, `to_reactivate`) n'ont pas de vis-à-vis du tout.
 * - `stalledProjects(days = 21)` (`crm-routines.service.ts`) est un défaut de
 *   paramètre pour les ÉTAPES d'un projet, uniforme. Appliqué aux besoins, il
 *   dirait qu'une shortlist prête depuis trois semaines va bien.
 *
 * Le jour où quelqu'un tranche les durées types par état, elles vivront dans ce
 * fichier, à côté de {@link NEED_STARTING_SOON_DAYS} — un seuil vit dans le
 * contrat, jamais recopié dans un écran.
 */
export function daysInStatus(statusChangedAt: string | null | undefined, now: Date): number | null {
  if (statusChangedAt === null || statusChangedAt === undefined || statusChangedAt === '') return null
  const entered = new Date(statusChangedAt).getTime()
  if (Number.isNaN(entered)) return null
  return Math.max(0, Math.floor((now.getTime() - entered) / 86_400_000))
}

/**
 * Les cinq compteurs de tête (I-33).
 *
 * ⚠️ Comptés sur l'ENSEMBLE des besoins filtrés, jamais sur la page affichée.
 * Un « 3 urgents » calculé sur la première page de cinq serait faux, et faux
 * d'une façon particulièrement traître : il diminuerait en tournant les pages.
 *
 * Les cinq sont les questions qu'un recruteur se pose le matin. Chacune a une
 * réponse dans un compteur, et chacune mène à un geste — un compteur qui ne
 * mène nulle part est une décoration.
 */
export const openNeedsCountersSchema = z.object({
  /** Tout ce que le filtre courant retient. */
  total: z.number().int().min(0),
  withoutShortlist: z.number().int().min(0),
  deadlinePassed: z.number().int().min(0),
  /** Démarrage sous 30 jours — la fenêtre où il faut avoir présenté. */
  startingSoon: z.number().int().min(0),
  /** Déclarés NON staffables : ce que l'ESN ne sait pas faire, en un chiffre. */
  notStaffable: z.number().int().min(0),
  /**
   * LES ISSUES — ce que les besoins CLOS sont devenus (31/08/2026).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI ELLES SONT ICI, ET PAS DANS LA LISTE
   * ─────────────────────────────────────────────────────────────────────────
   * L'écran « Besoins ouverts » ne charge, par construction, que des besoins
   * OUVERTS — c'est son nom. Le rail de droite affichait donc « taux de
   * conversion non mesuré », ce qui était vrai et définitif : le numérateur
   * (gagnés) et deux tiers du dénominateur (perdus, annulés) n'arrivaient
   * jamais jusqu'à lui.
   *
   * Louis a tranché le 31/08 : on charge aussi les clos, pour que le taux ait
   * un dénominateur. Trois COMPTEURS, et non trois pages de besoins clos : le
   * rail affiche un taux, pas une liste, et rapatrier des centaines de lignes
   * closes pour en faire une division serait payer le réseau pour rien.
   *
   * ⚠️ Ils sont comptés sur le MÊME filtre que la liste, **moins ses conditions
   * de statut** — sinon `?status=matching` produirait trois zéros, et un taux
   * de 0 % qui n'aurait mesuré personne.
   *
   * ⚠️ `won` / `lost` / `cancelled` restent TROIS chiffres et ne se réunissent
   * pas : un besoin annulé chez nous n'est pas un besoin perdu chez le client,
   * et les confondre fausserait le taux de perte (`NEED_CLOSED_STATUSES`).
   * `staffed`, quatrième état clos, est une valeur héritée que la reprise a
   * convertie en `won` — elle n'est plus écrite, donc plus comptée.
   *
   * Optionnel : le web se déploie avant l'API, et un rail qui plante vaut moins
   * qu'un rail qui dit « non mesuré » une minute de plus.
   */
  outcomes: z
    .object({
      won: z.number().int().min(0),
      lost: z.number().int().min(0),
      cancelled: z.number().int().min(0),
    })
    .optional(),
  /**
   * #2173.8 — « Avec entretien » : au moins un positionnement au stade
   * `interview` (`SUBMISSION_STAGES`). REQUIS, comme les quatre voisins
   * ci-dessus et pour la même raison : calculé dans le MÊME `Promise.all`
   * côté serveur, un oubli doit casser la compilation plutôt que de
   * silencieusement rendre « non mesuré ».
   */
  withInterview: z.number().int().min(0),
  /**
   * #2173.9 — « À clôturer » : au moins un positionnement `accepted` sur un
   * besoin qui n'a pas encore été refermé (`won`/`lost`/`cancelled`). C'est le
   * signal réel qu'il manque un geste — un client a dit oui, personne n'a
   * encore transformé le besoin.
   */
  readyToClose: z.number().int().min(0),
})
export type OpenNeedsCounters = z.infer<typeof openNeedsCountersSchema>

export const openNeedsResponseSchema = paginatedResultSchema(openNeedRowSchema).extend({
  counters: openNeedsCountersSchema,
})
export type OpenNeedsResponse = z.infer<typeof openNeedsResponseSchema>

/**
 * LE TAUX DE CONVERSION DES BESOINS — gagnés sur l'ensemble des ISSUES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL COMPTE, ET CE QU'IL REFUSE DE COMPTER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dénominateur est ce qui a été TRANCHÉ — gagné, perdu, annulé — et jamais
 * « tous les besoins ». Y verser les besoins encore ouverts ferait baisser le
 * taux à chaque besoin CRÉÉ : une ESN qui prospecte bien verrait son taux de
 * conversion s'effondrer, ce qui est l'inverse de ce que le chiffre raconte.
 *
 * `null` — jamais `0` — quand rien n'a encore été tranché. Un espace créé la
 * semaine dernière n'a pas « 0 % de conversion » : il n'a pas de conversion à
 * mesurer, et les deux phrases appellent des gestes opposés. C'est le même
 * invariant que `measuredRate`, dont cette fonction n'est que le cadrage : la
 * division vit à UN seul endroit (GA-108), ici on nomme seulement ce qu'on
 * divise.
 *
 * ⚠️ Il rend une PART entre 0 et 1, jamais un pourcentage arrondi : arrondir
 * est une décision d'AFFICHAGE, et l'arrondi posé dans la dérivation est
 * exactement ce qui faisait ressortir 0,48 % à « 0 » sur `/pilotage`.
 */
export function needConversionRate(
  outcomes: { won: number; lost: number; cancelled: number } | null | undefined,
): number | null {
  if (!outcomes) return null
  const { won, lost, cancelled } = outcomes
  if (![won, lost, cancelled].every(value => typeof value === 'number' && Number.isFinite(value))) return null
  return measuredRate(won, won + lost + cancelled)
}

/** La fenêtre de « démarrage imminent ». Trente jours, comme le §7.5. */
export const NEED_STARTING_SOON_DAYS = 30

/**
 * Les filtres de l'écran.
 *
 * `without_shortlist` et `deadline_passed` ne sont pas décoratifs : ce sont les
 * deux questions qu'un recruteur se pose le matin, et les seules dont la
 * réponse tient dans un compteur.
 */
export const openNeedsQuerySchema = z.object({
  /**
   * UN besoin, par son identité — la lecture qui porte sa FICHE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI UN FILTRE, ET PAS UNE ROUTE `GET /projects/needs/:id`
   * ─────────────────────────────────────────────────────────────────────────
   * La fiche d'un besoin montre EXACTEMENT la ligne que la liste montre : même
   * rôle, même TJM cible, même compteur de shortlist, même âge d'étape, même
   * `staffable`. Une seconde route la recomposerait ailleurs — deuxième
   * `SELECT`, deuxième mise en forme, deuxième façon de rendre
   * `shortlist_count` — et « une dérivation vit à un seul endroit » est
   * précisément la loi qu'on paye quand deux chemins la refont : la fiche et la
   * liste finiraient par ne plus dire la même chose du même besoin, et personne
   * ne saurait laquelle croire.
   *
   * ⚠️ Ce filtre IGNORE le repli « seulement ce qui est ouvert ». Une identité
   * demandée se sert quel que soit son état : le défaut de la liste dit ce
   * qu'on montre quand on ne demande RIEN de précis, il ne dit rien de ce qu'on
   * a le droit de lire. Sans cette exception, un lien vers un besoin clos —
   * collé dans un message trois semaines plus tôt — ouvrirait « besoin
   * introuvable » chez quelqu'un qui le voit encore dans son historique.
   */
  id: z.string().guid().optional(),
  q: z.string().trim().max(120).optional(),
  skill: z.string().trim().max(80).optional(),
  seniority: z.string().trim().max(40).optional(),
  location: z.string().trim().max(120).optional(),
  contract_kind: contractKindSchema.optional(),
  account_id: z.string().guid().optional(),
  status: projectNeedStatusSchema.optional(),
  /** Théo C projects-besoins.R3 — l'un des TROIS statuts affichés ; le serveur le traduit en états stockés. */
  theo_status: z.enum(NEED_THEO_STATUSES).optional(),
  urgency: needUrgencySchema.optional(),
  /**
   * D'OÙ VIENT LE BESOIN — les douze sources du §7.2.
   *
   * La colonne était écrite en base, sélectionnée par la requête et rendue sur
   * chaque ligne ; aucun critère ne permettait de s'en servir. C'est la famille
   * « donnée servie que personne ne peut interroger » : « ne me montre que ce
   * qui vient d'un e-mail client » — la question qui dit si un canal
   * d'acquisition vaut la peine — n'avait pas de réponse à l'écran.
   *
   * Un besoin dont personne n'a dit l'origine porte `NULL` : il n'est donc
   * retenu par AUCUNE valeur du filtre, et c'est voulu — le ranger d'office
   * dans « saisi à la main » inventerait une provenance.
   */
  source: needSourceSchema.optional(),
  /** Démarrage dans les N jours. Le §7.5 propose 30 ; la borne reste ouverte. */
  starting_within_days: z.coerce.number().int().min(1).max(365).optional(),
  without_shortlist: z.coerce.boolean().optional(),
  /** Théo C projects-besoins.A8 — seulement les besoins périmés (à revérifier). */
  stale: z.coerce.boolean().optional(),
  deadline_passed: z.coerce.boolean().optional(),
  /**
   * #2173.15 — la vue rapide « Entretiens » : au moins un positionnement au
   * stade `interview`. Composable avec les autres critères, comme
   * `deadline_passed` — ce n'est PAS un statut de besoin, un besoin garde son
   * statut courant pendant qu'un de ses positionnements est en entretien.
   */
  with_interview: z.coerce.boolean().optional(),
  /**
   * #2173.9 — même geste que le compteur « À clôturer » : un positionnement
   * `accepted` sur un besoin encore ouvert.
   */
  ready_to_close: z.coerce.boolean().optional(),
  /**
   * #2173.17 — la vue rapide « Perdus / clôturés ». Regroupe DEUX statuts pour
   * l'AFFICHAGE seulement — `lost` et `cancelled` restent deux compteurs
   * distincts partout où un TAUX se calcule (`needConversionRate`), cette
   * vue ne fait que les montrer côte à côte. Comme `status`, elle contourne le
   * défaut « ouverts seulement » : un besoin perdu n'est par définition plus
   * ouvert.
   */
  closed_lost_or_cancelled: z.coerce.boolean().optional(),
  /**
   * Par défaut, l'écran ne montre QUE les besoins ouverts — c'est son nom. Le
   * drapeau ouvre la vue à tout, pour retrouver ce qui a été clos.
   */
  include_closed: z.coerce.boolean().optional(),
  /**
   * #2173.49 — la vue « Archivés ». Par défaut, la liste EXCLUT tout besoin
   * archivé, quel que soit son statut — un rangement neutre ne doit pas
   * réapparaître dans « Besoins ouverts » sous prétexte qu'il est encore
   * `to_qualify`. Ce drapeau bascule la question : montrer UNIQUEMENT les
   * archivés, et contourner le défaut « ouverts seulement » comme `status`
   * et `include_closed` le font déjà — un besoin archivé peut être clos.
   */
  archived: z.coerce.boolean().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type OpenNeedsQuery = z.infer<typeof openNeedsQuerySchema>

/**
 * #2842 (reste, 26/09) — épopée #2074.13-.19, tranché sans Louis : les deux
 * signaux externes `clientNeeds`/`needDetailing` de `CommercialTensionExternalSignals`
 * (`apps/web/src/features/commercial-audit/lib/tension-detectors.ts`), le
 * PREMIER comptage backend neuf du lot (les cinq autres relisaient un agrégat
 * déjà exposé, GA-26). Comptés sur les MÊMES besoins ouverts et non archivés,
 * jamais une seconde population.
 */
export const openNeedsCommercialAuditSignalsSchema = z.object({
  clientNeeds: z.object({
    total: z.number().int().min(0),
    /** Statut `qualified` du terrain (`NEED_STATUS_ORDER`), jamais un statut en aval deviné. */
    qualified: z.number().int().min(0),
  }),
  needDetailing: z.object({
    total: z.number().int().min(0),
    /** Aucune compétence, aucune séniorité, aucune localisation, aucune date de
     *  démarrage — ni contexte, ni contrainte, ni échéance. */
    withOnlyATitle: z.number().int().min(0),
  }),
})
export type OpenNeedsCommercialAuditSignals = z.infer<typeof openNeedsCommercialAuditSignalsSchema>
