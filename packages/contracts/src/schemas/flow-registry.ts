import { z } from 'zod'

/**
 * Le registre des flux inter-modules (BEL-ARCH-003).
 *
 * Neuf flux traversent le produit — un signal devient un projet, un projet
 * gagné propose une mission, un CRA validé rend un mois facturable. Ils
 * existaient de façon implicite, chacun décrit dans le docblock du service qui
 * l'exécute. Lisible un par un, et impossible à interroger : personne ne
 * pouvait répondre à « qu'est-ce qui se passe quand un projet passe en gagné ? »
 * sans relire six fichiers.
 *
 * Ce registre est du CODE, versionné, et il ne fait qu'une chose : DÉCRIRE.
 * Il n'exécute rien — c'est ce qui lui permet de dire la vérité, y compris
 * quand elle est déplaisante. Un registre qui n'énoncerait que ce qui marche
 * serait une brochure.
 *
 * ⚠️ ET IL A MENTI DANS L'AUTRE SENS (relu le 26/08/2026, BEL-FIX-004).
 *
 * Cinq gardes empêchent ce fichier de devenir une brochure ; AUCUNE
 * n'empêchait qu'il reste faussement rouge. Quatre entrées sur neuf
 * déclaraient `absent` ce qui tournait depuis des semaines : la création de
 * mission à `won`, l'ouverture des relevés attendus, le domaine de
 * capitalisation entier — dont la migration cite ce registre comme motif de sa
 * propre existence. Le coût n'est pas symétrique mais il est réel : on rouvre
 * un chantier déjà fait, et la seule ligne VRAIE de ces entrées — l'absence
 * d'unicité entre un projet et sa mission — se lisait comme le reste, donc
 * comme du bruit.
 *
 * Ce qu'aucun test ne peut tenir, et le fichier de test le dit lui-même : que
 * la DESCRIPTION soit vraie. Seule une relecture le peut. La date de la
 * dernière relecture vaut donc autant que le contenu — celle-ci est du
 * 26/08/2026.
 *
 * Deux règles de lecture :
 *  - `implemented` dit l'état RÉEL, pas l'intention ;
 *  - `idempotencyKey` liste les colonnes qui existent VRAIMENT. Quand la clé
 *    spécifiée diffère de la clé réelle, l'écart est écrit dans `caveat` —
 *    c'est précisément l'endroit où un doublon se fabrique.
 */

export const FLOW_KEYS = [
  'signal_to_project',
  'project_won_to_mission',
  'need_to_matching',
  'submission_to_history',
  'mission_to_timesheet',
  'timesheet_to_invoice_readiness',
  'mission_done_to_rex',
  'rex_to_proof',
  'external_activity_to_timeline',
] as const
export const flowKeySchema = z.enum(FLOW_KEYS)
export type FlowKey = (typeof FLOW_KEYS)[number]

/**
 * L'état réel du flux.
 *
 * `partial` n'est pas une politesse pour « absent » : il désigne un flux qui
 * tourne et produit quelque chose, mais pas ce que la spécification décrit —
 * un déclencheur différent, une clé plus faible, une écriture qui manque.
 * C'est l'état le plus dangereux des trois, parce qu'il a l'air de marcher.
 */
export const FLOW_STATES = ['implemented', 'partial', 'absent'] as const
export const flowStateSchema = z.enum(FLOW_STATES)
export type FlowState = (typeof FLOW_STATES)[number]

/** Qui écrit la donnée produite par le flux. Reprend la hiérarchie de
 *  `provenance.ts` : c'est la même échelle, elle ne doit pas diverger. */
export const FLOW_PROVENANCES = ['human', 'connector', 'pipeline', 'model', 'inferred'] as const
export const flowProvenanceSchema = z.enum(FLOW_PROVENANCES)

export const flowDefinitionSchema = z.object({
  key: flowKeySchema,
  /** Ce que le flux fait, en une phrase lisible par quelqu'un qui n'a pas le code. */
  label: z.string().min(1),
  state: flowStateSchema,
  /** Ce qui déclenche le flux, tel qu'il est RÉELLEMENT déclenché aujourd'hui. */
  trigger: z.string().min(1),
  /** Ce que le flux lit. Vide pour un flux ABSENT — il ne lit rien, et prétendre
   *  le contraire décrirait un code qui n'existe pas. */
  reads: z.array(z.string().min(1)),
  /** Ce que le flux écrit. Vide pour un flux qui PROPOSE sans écrire — c'est
   *  une réponse, pas un trou. */
  writes: z.array(z.string().min(1)),
  /** Les colonnes qui garantissent qu'un rejeu ne crée pas de doublon. Vide
   *  quand rien n'est persisté, ou quand aucune clé n'existe. */
  idempotencyKey: z.array(z.string().min(1)),
  provenance: flowProvenanceSchema,
  /** Ce qui se passe quand le flux échoue. Jamais « rien » : un flux dont
   *  l'échec n'est pas décrit est un flux dont l'échec est invisible. */
  onFailure: z.string().min(1),
  /** La règle que le flux ne franchit jamais. */
  guard: z.string().min(1),
  /** L'écart entre ce que la spécification décrit et ce que le code fait.
   *  `null` quand il n'y en a pas — jamais une phrase de remplissage. */
  caveat: z.string().min(1).nullable(),
})
export type FlowDefinition = z.infer<typeof flowDefinitionSchema>

export const FLOW_REGISTRY: readonly FlowDefinition[] = [
  {
    key: 'signal_to_project',
    label: 'Un signal détecté devient un projet à regarder',
    state: 'partial',
    trigger: "fin d'une analyse de compte (`AnalysisPersistence` → `ProjectsService.materialize`)",
    reads: ['accounts.recent_signals', 'accounts'],
    writes: ['opportunities'],
    idempotencyKey: ['account_id', 'kind', 'md5(label)'],
    provenance: 'pipeline',
    onFailure: 'aucun projet créé, le signal reste dans le dossier, le run continue',
    guard:
      "un signal ne devient JAMAIS un projet `qualified` tout seul — l'insertion ne renseigne pas `stage`, qui retombe sur `detected`, et le seul chemin vers `qualified` demande la permission `records:write`",
    caveat:
      "La spécification déclenche sur `signal_history` avec un seuil de confiance et un compte prioritaire ; le code déclenche sur la fin d'analyse et ne filtre ni sur la confiance ni sur la priorité. La clé réelle est le libellé haché : deux formulations du même signal créent deux projets, et deux sources rapportant le même libellé fusionnent.",
  },
  {
    key: 'project_won_to_mission',
    label: 'Un projet gagné propose la création de sa mission',
    state: 'implemented',
    trigger:
      "passage à `won` — l'effet `create_mission`, exécuté par le serveur, annoncé, plus coché (#4195) : une mission par positionnement retenu",
    reads: ['opportunities', 'project_needs', 'missions'],
    writes: ['missions'],
    idempotencyKey: ['workspace_id', 'opportunity_id'],
    provenance: 'human',
    onFailure: "la mission n'est pas créée et le projet reste `won` — le geste se rejoue sans doublon",
    guard: "jamais de création silencieuse — une mission engage un chiffre d'affaires et une facturation",
    caveat:
      "Le pré-cochage vient du catalogue (`create_mission` est `N1`, `performedBy: 'server'`), et il n'est JAMAIS un envoi externe. L'unicité `(espace, projet)` est tenue des deux côtés depuis le 26/08 : `DeliveryService.create` rend la mission existante au lieu d'en créer une seconde, et l'index partiel `missions_opportunity_uniq` la refuse en base. Le garde-fou d'écran, lui, ne couvre que la SORTIE de `won` — c'est pour cela qu'il ne suffisait pas.",
  },
  {
    key: 'need_to_matching',
    label: 'Un besoin ouvert propose des consultants',
    state: 'implemented',
    trigger: 'geste humain (`POST /needs/:id/match`)',
    reads: ['project_needs', 'consultants', 'consultant_skills', 'mission_assignments', 'submissions'],
    writes: ['match_runs', 'match_run_entries'],
    idempotencyKey: ['run_id'],
    provenance: 'pipeline',
    onFailure: 'le classement reste juste, la trace manque et l’échec est journalisé bruyamment',
    guard: 'aucun positionnement n’est créé par ce flux — envoyer un profil reste un geste humain',
    caveat: null,
  },
  {
    key: 'submission_to_history',
    label: "Un positionnement alimente l'historique du compte",
    state: 'partial',
    trigger: 'création ou changement d’étape d’un positionnement',
    reads: ['submissions', 'opportunities'],
    writes: ['activities'],
    idempotencyKey: ['workspace_id', 'source', 'external_id (submission:{id}:{stage})'],
    provenance: 'human',
    onFailure: 'la trace est perdue et journalisée ; le positionnement passe quand même',
    guard: 'un refus motivé alimente le drapeau « déjà refusé chez ce client »',
    caveat:
      "L'historique du TALENT est impossible en l'état : `ACTIVITY_SCOPES` ne connaît que compte, contact et projet — il n'existe pas de portée consultant. Et un aller-retour d'étape (soumis → retiré → soumis) est avalé comme un doublon, la clé ne portant pas l'instant.",
  },
  {
    key: 'mission_to_timesheet',
    label: 'Une mission en régie attend son CRA chaque mois',
    state: 'implemented',
    trigger: 'ouverture du mois (`TimesheetsService.openExpected`) — une ligne `expected` par mission × consultant',
    reads: ['missions', 'mission_assignments'],
    writes: ['mission_timesheets'],
    idempotencyKey: ['mission_id', 'consultant_id', 'period_month'],
    provenance: 'pipeline',
    onFailure: 'le mois ne s’ouvre pas ; aucun relevé fantôme n’est créé, et la reprise est sans effet de bord',
    guard: 'une mission au forfait ne demande pas de CRA',
    caveat:
      "La garde s'applique par `missions.contract_kind` : l'ouverture filtre `regie`, et un forfait reçoit `not_required` plutôt qu'une alerte qui ne se résoudrait jamais. Sept statuts existent, dont `expected` — « attendu » n'est pas « manquant », et relancer quelqu'un pour un mois qu'il n'a pas fini de vivre est la meilleure façon de faire ignorer les relances suivantes. La clé porte bien le CONSULTANT depuis `1789691847302` : deux personnes sur une même mission déposaient deux relevés, et le second effaçait le premier en silence.",
  },
  {
    key: 'timesheet_to_invoice_readiness',
    label: 'Un CRA validé rend le mois facturable',
    state: 'implemented',
    trigger: 'lecture de l’écran « Prêt à facturer » — l’état est recalculé à chaque fois',
    reads: ['mission_timesheets', 'mission_commercial_terms', 'missions'],
    writes: ['invoice_readiness'],
    idempotencyKey: ['mission_id', 'period_month'],
    provenance: 'pipeline',
    onFailure: 'le mois reste bloqué et ses bloqueurs sont nommés',
    guard: "un écart non nul empêche `ready`, et AUCUNE facture n'est jamais émise",
    caveat: null,
  },
  {
    key: 'mission_done_to_rex',
    label: 'Une mission terminée déclenche la collecte du retour d’expérience',
    state: 'partial',
    trigger: 'geste humain (`POST /capitalisation/rex`) ; la LISTE des missions terminées sans retour est calculée',
    reads: ['missions', 'rex_entries'],
    writes: ['rex_entries'],
    idempotencyKey: ['mission_id'],
    provenance: 'human',
    onFailure: 'la mission reste dans « retours à collecter » — rien n’est perdu, la demande se rejoue',
    guard: 'un verbatim n’est jamais réécrit',
    caveat:
      "Le domaine existe depuis `1789551204833` : `rex_entries` (unique par mission), `proofs` et `testimonials`. Ce qui reste ABSENT est le déclenchement : `pendingRexForWorkspace` sait dire quelles missions terminées n'ont pas de retour, mais aucune routine ne le demande — la collecte attend qu'un humain ouvre l'écran.",
  },
  {
    key: 'rex_to_proof',
    label: 'Un retour d’expérience validé devient une preuve réutilisable',
    state: 'absent',
    trigger: 'aucun — écrire une preuve est un geste humain distinct (`POST /capitalisation/proofs`)',
    reads: [],
    writes: [],
    idempotencyKey: [],
    provenance: 'human',
    onFailure: 'sans objet — le flux ne tourne pas',
    guard: "une preuve interne n'est jamais utilisable en contexte client ; un retour négatif ne produit aucune preuve",
    caveat:
      "⚠️ La réserve précédente — « le domaine entier est absent : aucune notion de preuve, de force de preuve ni de consentement » — était FAUSSE. Le domaine existe depuis `1789551204833` : `proofs` porte sa FORCE (`measured` / `attested` / `declared`) et sa PORTÉE (`internal` / `client_safe`), `testimonials` porte son consentement. Ce qui est réellement ABSENT est la PROMOTION — rien ne fait passer un retour validé en preuve. Et le flux n'écrit rien tant qu'elle n'existe pas : `writes` reste vide plutôt que de désigner l'écriture d'un AUTRE geste, celui d'un humain qui crée une preuve à la main. Le laisser vide est aussi ce qui garde honnête la garde d'idempotence : un flux qui déclarerait écrire sans clé de rejeu fabriquerait un doublon au premier rejeu.",
  },
  {
    key: 'external_activity_to_timeline',
    label: 'Un e-mail, un rendez-vous ou un appel alimente la timeline',
    state: 'implemented',
    trigger: 'synchronisation des trois sources connectées (messagerie, agenda, téléphonie)',
    reads: ['connecteurs', 'contacts', 'accounts'],
    writes: ['activities', 'activity_participants'],
    idempotencyKey: ['workspace_id', 'source', 'external_id'],
    provenance: 'connector',
    onFailure:
      'la source en échec rend une liste vide, les deux autres continuent — une analyse ne tombe jamais parce qu’un agenda était indisponible',
    guard: 'le corps des messages est stocké mais JAMAIS restitué par le copilote',
    caveat:
      "Les clés réelles sont l'identifiant natif de chaque source (message, évènement, appel) et non le fil de discussion : deux messages d'un même fil sont deux lignes, ce qui est voulu. Le rattachement par domaine ne relie JAMAIS à une personne, seulement au compte.",
  },
]

/** Les flux qui écrivent réellement quelque chose — ceux dont un rejeu peut
 *  créer un doublon, et qui doivent donc porter une clé d'idempotence. */
export function writingFlows(): FlowDefinition[] {
  return FLOW_REGISTRY.filter(flow => flow.writes.length > 0)
}

/** Ce que le registre ne promet pas : les flux absents ou incomplets, avec leur
 *  écart. Sert la relecture honnête autant que la garde. */
export function flowGaps(): { key: FlowKey; state: FlowState; caveat: string }[] {
  return FLOW_REGISTRY.filter(flow => flow.state !== 'implemented' && flow.caveat).map(flow => ({
    key: flow.key,
    state: flow.state,
    caveat: flow.caveat as string,
  }))
}
