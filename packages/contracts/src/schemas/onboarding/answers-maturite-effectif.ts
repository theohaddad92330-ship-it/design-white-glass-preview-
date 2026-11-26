import { z } from 'zod'

/**
 * Maturité commerciale, effectif réel — lot L15 (#2034, #2035).
 *
 * Le questionnaire ne posait qu'une bande d'effectif totale (`consultant_size`)
 * et aucune situation de maturité : un Business Manager qui démarre une
 * activité et une ESN de 500 en croissance recevaient le même questionnaire.
 * Sept colonnes ADDITIVES, toutes nullables comme le reste du Temps 1 — une
 * question qui se passe reste `null`, jamais devinée (« non mesuré n'est
 * jamais 0 »).
 *
 * `available_consultants_band` a une colonne `esn_profiles` et un lecteur IA
 * (`sales_context.py::_bench_band`) depuis la migration 1780000000000 — ils
 * existaient déjà, sans question ni entrée de contrat pour les nourrir
 * (#2035.5). Les six autres sont neuves de bout en bout.
 *
 * `.nullable().optional()`, comme le profil progressif (`answers-profil.ts`) :
 * ces sept champs ne font PAS partie de `TEMPS1_REQUIRED_KEYS`, donc une clé
 * ABSENTE doit rester une valeur valide du type (un ancien payload qui les
 * ignore reste assignable à `EsnAnswers`), pas seulement une valeur `null`.
 */
export const MATURITE_EFFECTIF_ANSWER_FIELDS = {
  // #2034.1/.2/.3/.4/.6/.7 — la situation de vie de l'ESN, un score DÉCOMPOSÉ
  // ne se met jamais sur cette seule valeur (moins de 3 axes = pas de score) :
  // elle sert de premier axe déclaratif, jamais affichée seule comme un score.
  esn_maturity_situation: z.string().nullable().optional(),
  // #2034.10 — bandes, jamais un compte exact : « aucun client actif » est un
  // ZÉRO déclaré par l'utilisateur, pas une valeur devinée en son absence.
  active_clients_band: z.string().nullable().optional(),
  // #2034.11
  revenue_recurrence: z.string().nullable().optional(),
  // #2034.12 — porte une option « Je ne sais pas encore » explicite : une
  // réponse honnête de l'utilisateur, jamais une valeur qu'on invente à sa place.
  client_concentration_risk: z.string().nullable().optional(),
  // #2034.13 — objectif de l'ENTREPRISE, distinct d'`individual_goal` (objectif
  // personnel du membre, profil progressif) : les deux répondent à des
  // questions différentes et ne se fusionnent jamais.
  company_growth_goal: z.string().nullable().optional(),
  // #2035.3
  consultants_managed_by_user_band: z.string().nullable().optional(),
  // #2035.5 — colonne et lecteur IA déjà existants, voir le commentaire de tête.
  available_consultants_band: z.string().nullable().optional(),
  // #2035.1 — « 120 consultants » ne dit pas si c'est l'effectif de CETTE
  // activité ou celui du GROUPE qui la porte. Bande distincte de
  // `consultant_size`, jamais fusionnée : un groupe de 500 dont l'activité
  // interrogée n'en compte que 12 reste deux faits, pas un seul.
  consultant_size_group_band: z.string().nullable().optional(),
  // #2035.2 — même geste pour la BU/agence : la BU est un LIBELLÉ DÉCLARATIF
  // (décision Louis 15/09), pas une partition avec ses propres droits — cette
  // bande est optionnelle, propre à CETTE réponse, jamais dérivée du total
  // groupe ni du total entreprise.
  consultant_size_business_unit_band: z.string().nullable().optional(),
}
