import type { PendingChatAction } from '@bellum/contracts'

/**
 * #1930.11 — CE QU'UN HUMAIN A LE DROIT DE RÉÉCRIRE AVANT DE VALIDER.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 * Le geste `modify` est dans le contrat depuis #1931 L2 : `cardAllowedGestures`
 * le rend sur `prepared`/`snoozed`, `POST /action-os/cards/:runId/modify`
 * fusionne le patch et REVALIDE la proposition entière
 * (`pendingChatActionSchema`), refuse un changement de `action` et recalcule la
 * prévisualisation et le coût. Rien de tout cela n'était atteignable : le
 * renderer du fil EXCLUAIT `modify` de ses gestes, et le client HTTP n'avait
 * pas la fonction — les deux avec la même raison écrite, « il exige un `patch`,
 * donc une surface d'édition qui n'existe pas encore ».
 *
 * Ce module EST cette surface, réduite à la seule question qu'elle pose :
 * quels champs de cette proposition sont du TEXTE ÉCRIT PAR QUELQU'UN, par
 * opposition à une cible résolue par le serveur ?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS MODIFIABLE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * - Les IDENTIFIANTS (`contact_id`, `account_id`) et les CIBLES résolues
 *   (`provider`, `route`, `plan_token`) : le serveur les a résolus contre
 *   l'espace, et il les revérifie au dispatch. Les rendre éditables inviterait
 *   à désigner un objet qu'on n'a pas le droit de toucher — le serveur
 *   refuserait, mais l'écran l'aurait proposé.
 * - `cost_credits` : un prix vient de la grille (`credit-weights.ts`), jamais
 *   d'une saisie. Le serveur ne le lit déjà pas.
 * - Les BOOLÉENS et les NOMBRES d'un réglage (`enabled`, `new_value`, `hour`) :
 *   la carte EST la décision sur ces formes-là ; un champ de texte y ferait
 *   une seconde façon de dire la même chose.
 * - Les formes qui ne deviennent JAMAIS une carte Action OS (navigation,
 *   analyse, création depuis le CRM) : sans run persisté, il n'y a pas de
 *   `modify` à appeler. Liste vide, donc pas de bouton — un geste qu'on ne
 *   sait pas faire ne s'annonce pas.
 *
 * La table est un `Record` EXHAUSTIF : une quinzième forme de proposition ne
 * peut pas naître sans dire ce qu'elle laisse réécrire.
 */

type CardEditableField = {
  /** La clé du champ DANS la proposition — c'est elle qui part en patch. */
  key: string
  /** La clé i18n de son libellé. */
  labelKey: string
  /** Une zone de texte plutôt qu'une ligne. */
  multiline: boolean
}

function field(key: string, multiline = false): CardEditableField {
  return { key, labelKey: `cards.edit.field.${key}`, multiline }
}

/** Ce que chaque forme de proposition laisse réécrire. Vide = pas de « Modifier ». */
export const CARD_EDITABLE_FIELDS: Readonly<Record<PendingChatAction['action'], readonly CardEditableField[]>> = {
  // L'angle est la seule phrase que Laura a ÉCRITE ici ; le reste désigne la
  // personne et le canal, que le serveur a résolus.
  prepare_message: [field('angle', true)],
  // La date et la note : les deux choses qu'on ajuste avant de poser un rappel.
  schedule_reminder: [field('at'), field('note', true)],
  // Rien à réécrire : le contact et son organisation sont résolus, et ce que la
  // cascade ira chercher ne se négocie pas depuis un champ de saisie.
  enrich_contact: [],
  // Les quatre champs que l'export va réellement ÉCRIRE dans le CRM — donc ceux
  // qu'on corrige avant d'écrire. (Le DIFF avant/après de #1930.14 est un autre
  // point : il demande de LIRE la fiche côté CRM, ce que rien ne fait ici.)
  export_contact_to_crm: [field('contact_name'), field('contact_email'), field('contact_title'), field('company')],
  // Un brouillon se relit et se corrige — c'est même tout l'intérêt qu'il soit
  // un brouillon. Rien ne part sans le geste du commercial.
  prepare_mail_draft: [field('to'), field('subject'), field('body', true)],
  // G.1 — le titre, l'heure et la note se corrigent avant de valider ; la durée et les invités restent ceux de la proposition.
  prepare_calendar_event: [field('title'), field('starts_at'), field('note', true)],
  // Le fait épinglé est une phrase, et une phrase se corrige.
  pin_memory_fact: [field('fact', true)],
  // Un réglage de routine est fait de booléens, d'heures et de jours : la carte
  // EST la décision, un champ de texte en ferait une seconde.
  toggle_routine: [],
  update_setting: [],
  // Formes de NAVIGATION : `buildCard` rend `null`, aucun run n'est persisté,
  // donc aucune route `modify` à appeler.
  find_accounts: [],
  open_screen: [],
  prepare_consultant_record: [],
  push_profile: [],
  prepare_campaign: [],
  // #3894.3 — dépliée en cartes « prepare_message » avant le rendu : l'angle s'édite sur chacune.
  prepare_message_audience: [],
  // #2322 — un besoin compilé ne s'édite pas sur la carte : ses champs
  // portent chacun une CITATION, et corriger la valeur sans corriger la
  // citation ferait mentir la provenance. La correction se fait dans le
  // créateur de besoin, qui n'affirme rien sur l'origine.
  compile_need: [],
  // #2392 — la clôture se décide sur SA carte, tâche par tâche : rien à modifier ici.
  day_closure: [],
  // Formes qui empruntent la route de l'ÉCRAN (analyse, création depuis le CRM) :
  // même raison, et leur `plan_token` est une preuve, pas une saisie.
  start_account_analysis: [],
  create_contact_from_crm: [],
  // Épopée #2853 (#2157.1) — même raison : le clic emprunte les routes de
  // l'écran « Mes cibles » (`POST /target-lists` puis `.../items`), aucune
  // carte Action OS n'est persistée pour cette forme.
  create_target_list_from_account: [],
  // Épopée #2781 (#2150.30, LOT j1 26/09) — même raison : le clic emprunte la
  // route déjà là (`POST /accounts/portfolio`, #2150.32/#2150.42), aucune
  // carte Action OS n'est persistée pour cette forme.
  add_account_to_portfolio: [],
  // #2423.9 — même raison : le clic emprunte la route du dossier de la mission
  // (`POST delivery/missions/:id/amendments`), aucune carte Action OS n'est
  // persistée pour cette forme.
  propose_mission_amendment: [],
  // #2391 — le plan de journée se lit sur SA carte (`FocusPlanCard`), jamais
  // par cette surface d'édition : aucune carte Action OS n'est persistée.
  propose_focus_plan: [],
  // #2770.55-.62 — même raison : le plan de semaine se lit sur SA carte.
  propose_weekly_plan: [],
  // #2324.39 — même raison : le clic emprunte les routes de l'opportunité.
  propose_opportunity_update: [],
  // #2376 — le brief d'appel se lit et se décide dans SA carte (branches, mode
  // live) : rien n'est persisté comme run Action OS, donc rien à modifier ici.
  prepare_cold_call: [],
  // #2320.26/.27 (épopée #2967) — même raison : le clic emprunte la porte
  // d'état du besoin déjà là (`PATCH /projects/needs/:id/status`), aucune
  // carte Action OS n'est persistée pour cette forme.
  propose_need_transition: [],
  // #2987.56 — même raison : le clic emprunte la route déjà là de l'écran
  // (`POST /expenses/reports/:id/validate|reject`), aucune carte Action OS
  // n'est persistée pour cette forme.
  decide_expense_report: [],
  // #3345.2 — le clic emprunte la route de l'écran Opportunités, aucune carte Action OS.
  decide_qualification_lead: [],
  // Épopée #2955 (#2394.6/.19/.43) — la note est un texte RÉDIGÉ par Laura :
  // la seule chose à corriger avant de l'écrire sur la fiche CRM.
  propose_crm_note: [field('note', true)],
  // #1952.3 / #1952.7 (épopée #2844) — même raison que `propose_need_transition` : le
  // clic emprunte les routes déjà là de l'écran, aucune carte Action OS persistée.
  propose_long_job: [],
  // #2434.56 (épopée #3579) — le clic emprunte la route unitaire d'enrichissement, aucune carte Action OS ; rien à corriger.
  propose_bulk_enrichment: [],
  // #3871.1 (lot V11) — le clic emprunte la route de la fiche contact
  // (`POST /contacts/:id/departed`), aucune carte Action OS ; rien à corriger.
  propose_contact_departure: [],
  // #3950.1 (décision Louis 09/10/2026) — `mode` est un vocabulaire FERMÉ (ATS
  // ou en lot) : la carte EST la décision, un champ de texte en ferait une
  // seconde. Le clic emprunte la route de l'écran, aucune carte Action OS
  // persistée — rien à corriger.
  launch_vivier_export: [],
  // #3869.a — les rôles se reformulent en le redemandant à Laura, jamais sur la carte.
  propose_people_search: [],
  // #2433.7 (lot M10, 09/10) — le clic emprunte la porte du formulaire
  // (`POST /feedback`), aucune carte Action OS persistée — rien à corriger ici ;
  // un constat à reprendre se redemande à Laura, comme les autres cartes d'écran.
  prepare_bug_report: [],
}

/**
 * Les champs modifiables de CETTE proposition, avec leur valeur courante.
 *
 * Une valeur absente devient une chaîne VIDE : un champ de saisie ne montre
 * jamais « null » ni « undefined », et vide veut dire « rien d'écrit », ce qui
 * est vrai. Une valeur qui n'est pas du texte est ignorée plutôt que rendue en
 * `String(…)` — la table ne devrait pas la déclarer, et si elle le faisait, un
 * nombre affiché dans un champ de texte repartirait en chaîne.
 */
export function editableFieldsOf(
  action: PendingChatAction | null | undefined,
): readonly (CardEditableField & { value: string })[] {
  if (!action) return []
  const specs = CARD_EDITABLE_FIELDS[action.action] ?? []
  const payload = action as unknown as Record<string, unknown>
  return specs.map(spec => {
    const raw = payload[spec.key]
    return { ...spec, value: typeof raw === 'string' ? raw : '' }
  })
}
