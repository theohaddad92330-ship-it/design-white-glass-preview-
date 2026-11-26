import {
  canTransitionNeedStatus,
  needStatusRequiresReason,
  type NeedStoredStatus,
  type OpenNeedRow,
} from '@bellum/contracts'

/**
 * Les gestes qu'on pose sur un besoin — ou sur une SÉLECTION — et ceux qu'on refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER EST
 * ─────────────────────────────────────────────────────────────────────────────
 * Le catalogue vit ICI et nulle part ailleurs : la barre de sélection et le
 * menu d'une ligne rendent la MÊME liste. Deux listes recopiées divergent en
 * trois semaines, et c'est la ligne 1 du tome 7 — un réglage vit à un seul
 * endroit. Ce dépôt en a fait la démonstration en un après-midi : deux branches
 * ont produit deux catalogues concurrents sur cet écran, l'un avec trois gestes,
 * l'autre avec cinq, et aucun des deux n'avait les six de la source.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL A FALLU OUVRIR TROIS CHEMINS D'ÉCRITURE AVANT DE POSER CES BOUTONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois des gestes existaient à moitié, chacun d'une façon différente :
 *  · `urgency` et `owner_id` : colonnes présentes, LUES par deux services, et
 *    absentes des schémas d'écriture — qui sont `.strict()`, donc les envoyer
 *    partait en 400. Troisième occurrence dans ce dépôt de « colonne lue,
 *    jamais écrite ».
 *  · la mise en veille : la route acceptait `{ status: 'on_hold', reason }` et
 *    le service JETAIT le motif. « Mettre en veille avec motif » écrivait donc
 *    une veille sans motif.
 * Poser les boutons d'abord aurait donné trois gestes qui semblent marcher et
 * n'écrivent rien — exactement le repli honnête qui ressemble à une base vide.
 *
 * Les quatre autres (`match`, `reactivate`, `close_lost`, `close_cancelled`)
 * avaient déjà leur route : `POST /needs/:id/match` pour le rapprochement, la
 * porte d'état `PATCH /projects/needs/:id/status` pour les trois autres.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SORT, ET PAR OÙ — RENVERSEMENT DATÉ DU 11/10/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉCISION LOUIS 11/10/2026 (#4016 L11) — RENVERSE `c43_actions_de_masse`.
 * L'EXPORT DE MASSE existe : la sélection part en FICHIER (CSV ou JSON) par
 * UNE route, `POST /projects/needs/export`, marquée `@DataExit()` — la règle
 * d'espace « qui peut exporter » la tient, côté API comme côté écran
 * (`useDataExit()`). Il n'est PAS dans ce catalogue : un geste du catalogue
 * ÉCRIT besoin par besoin (`runNeedBulk`) ; l'export n'écrit rien, il sort.
 *
 * Ce qui reste refusé, et que `need-actions.test.ts` tient : une POUSSÉE de
 * masse vers un CRM (`export-crm`) depuis cet écran, et toute sortie qui ne
 * passerait pas par la route gouvernée. Ancienne règle, gardée lisible :
 * {@link NEED_BULK_ACTIONS_REFUSED}.
 *
 * LA SUPPRESSION non plus. « On archive, on ne supprime pas » : `close_cancelled`
 * EST le chemin d'archivage d'un besoin qui n'existe plus, et il garde son motif.
 */

/** Ce qu'un geste demande de plus avant de partir. */
export type NeedBulkAction = (typeof NEED_BULK_ACTIONS)[number]

/**
 * #2323.10 / #2323.11 — les motifs de clôture NOMMÉS, pour `close_cancelled`
 * seulement.
 *
 * `status_reason` est du texte libre depuis toujours (`changeNeedStatusSchema`) :
 * ces deux clés ne FERMENT rien, elles PROPOSENT — même principe que
 * `DEFAULT_UNSTAFFABLE_REASONS` (`staffable-gate.ts`) pour la porte G3. Le
 * texte reste éditable après le clic, et rien n'empêche de taper une raison
 * qui n'est ni l'une ni l'autre.
 *
 * Seulement DEUX, et seulement sur `close_cancelled` : « perdu » a son propre
 * champ libre (`closeLost`), sans preset — un client qui dit non a toujours
 * SA raison à lui, qu'aucune liste fermée ne prévoit à l'avance ; alors qu'un
 * besoin qu'on arrête nous-mêmes retombe presque toujours sur l'un de ces deux
 * motifs.
 */
export const NEED_CANCELLED_REASON_PRESETS = ['expired', 'notRelevant'] as const
type NeedCancelledReasonPreset = (typeof NEED_CANCELLED_REASON_PRESETS)[number]

/**
 * Les huit gestes LIVRÉS, dans l'ordre où ils s'affichent.
 *
 * L'ordre n'est pas décoratif : « à qui » d'abord (le geste du matin, celui qui
 * fait sortir un besoin de la pile commune), « ça presse » ensuite, « quoi
 * faire » (#2173.48, préparer un suivi), « on fait avancer » (le
 * rapprochement), puis « on arrête / on reprend », et clore en dernier — un
 * geste qui retire du travail des écrans se pose après ceux qui en attribuent.
 *
 * ⚠️ `close_lost` et `close_cancelled` sont DEUX gestes et le restent. Un besoin
 * annulé chez nous n'est pas un besoin perdu chez le client ; les réunir sous un
 * « fermer » unique fausserait le taux de perte, qui est l'un des rares chiffres
 * qu'une ESN regarde vraiment. C'est la même raison qui tient `cancelled` hors
 * des onze colonnes du kanban côté contrat.
 *
 * ⚠️ #2173.48 — `create_actions` ne PRÉPARE rien tout seul : il pose un
 * libellé, tel quel, comme une « prochaine étape » cochable sur chaque besoin
 * de la sélection (`needStepsApi.create`, la route qui existe déjà sur la
 * fiche d'UN besoin). Rien ne s'envoie, rien ne s'exécute — c'est le
 * commercial qui coche l'étape quand elle est faite.
 *
 * ⚠️ #2173.49 — `archive`/`unarchive` se posent EN DERNIER, et ce n'est pas
 * un hasard d'ordre : c'est le geste le plus passif du catalogue, un
 * RANGEMENT — décision Louis 17/09/2026 (QCM) — jamais un statut. Il ne
 * retire ni n'ajoute de travail, il range ce qui est déjà tranché. Voir
 * {@link needActionAvailable} : la seule action dont l'éligibilité dépend
 * d'un champ qui n'est ni le statut ni les compétences.
 */
export const NEED_BULK_ACTIONS = [
  'assign_owner',
  'set_urgency',
  'create_actions',
  'match',
  'hold',
  'reactivate',
  'close_lost',
  'close_cancelled',
  'archive',
  'unarchive',
] as const

/**
 * Les gestes qui passent par la PORTE D'ÉTAT, et l'état qu'ils visent.
 *
 * La porte (`PATCH /projects/needs/:id/status`) est séparée du patch générique
 * côté serveur, et c'est le point : le statut est le seul champ dont un mauvais
 * réglage déplace du travail sans que personne ne l'ait décidé.
 *
 * La table vit ICI et nulle part ailleurs. Le hook, le panneau de motif et les
 * tests la lisent — trois endroits qui recopieraient « close_lost → lost »
 * finiraient par en écrire un quatrième, différent.
 */
type NeedStatusAction = 'hold' | 'reactivate' | 'close_lost' | 'close_cancelled'

const TARGET_STATUS = {
  hold: 'on_hold',
  reactivate: 'to_reactivate',
  close_lost: 'lost',
  close_cancelled: 'cancelled',
} as const satisfies Record<NeedStatusAction, NeedStoredStatus>

export function needActionTargetStatus(action: NeedStatusAction): NeedStoredStatus {
  return TARGET_STATUS[action]
}

/** Ce geste franchit-il la porte d'état, ou écrit-il un simple champ ? */
function isNeedStatusAction(action: NeedBulkAction): action is NeedStatusAction {
  return action in TARGET_STATUS
}

/**
 * Ce geste demande-t-il un motif AVANT de partir ?
 *
 * ⚠️ La réponse est DÉRIVÉE du contrat (`needStatusRequiresReason`), jamais
 * recopiée. Le serveur rend 400 sans motif sur `lost`, `cancelled` et `on_hold` ;
 * une seconde liste dans l'écran divergerait le jour où le contrat en ajoute un,
 * et l'écran enverrait alors un geste condamné sans avoir posé la question.
 *
 * `reactivate` n'en demande pas, et ce n'est pas un oubli : le serveur EFFACE le
 * motif quand un besoin repart. Une raison d'arrêt affichée à côté d'un besoin
 * en marche se lit comme un blocage encore actif.
 */
export function needActionNeedsReason(action: NeedBulkAction): action is NeedReasonAction {
  return isNeedStatusAction(action) && needStatusRequiresReason(TARGET_STATUS[action])
}

/**
 * Les gestes qui portent un motif, NOMMÉS.
 *
 * ⚠️ Cette union est écrite à la main alors que {@link needActionNeedsReason} se
 * dérive du contrat — et c'est assumé : un type ne peut pas se déduire d'une
 * fonction qui s'évalue à l'exécution. Ce que la main pourrait rater, un test le
 * tient : `need-actions.test.ts` filtre le catalogue AVEC la fonction et compare
 * le résultat à cette liste. Le jour où le contrat exige un motif de plus, le
 * test tombe — il ne passe pas au vert en silence.
 */
export type NeedReasonAction = 'hold' | 'close_lost' | 'close_cancelled'

/**
 * Ce que la ligne minimale doit porter pour qu'on sache si un geste s'applique.
 *
 * Quatre champs, pas la ligne entière : le menu est monté sur CHAQUE ligne du
 * tableau, et lui demander un `OpenNeedRow` complet obligerait tout appelant à
 * en fabriquer un — le kanban, un test, un futur écran mobile.
 *
 * `archived_at` (#2173.49) est `.optional()` au contrat (déploiement web
 * avant API) : un appelant qui ne le fournit pas encore se lit comme « pas
 * archivé » — le repli le plus sûr, celui qui garde « Archiver » actionnable
 * et « Désarchiver » grisé plutôt que l'inverse.
 */
export type ActionableNeed = Pick<OpenNeedRow, 'id' | 'status' | 'skills' | 'archived_at'>

/**
 * Ce geste peut-il RÉELLEMENT s'appliquer à ce besoin ?
 *
 * Trois familles, trois réponses :
 *  · un CHAMP (propriétaire, urgence) s'écrit sur n'importe quel besoin, même
 *    clos — attribuer une perte à qui doit la raconter reste légitime ;
 *  · le RAPPROCHEMENT demande une compétence typée. C'est la règle QUE LE BOUTON
 *    de la colonne « Matching » affiche déjà : sans compétence, le moteur ne
 *    cherche rien et rend une liste vide qui se lit « aucun profil disponible ».
 *    La reprendre ici évite qu'un même besoin soit refusé dans une colonne et
 *    accepté dans le menu à trente pixels de là ;
 *  · un CHANGEMENT D'ÉTAT passe par `canTransitionNeedStatus`, la MÊME fonction
 *    que le serveur consulte avant d'écrire. La recopier ferait diverger l'écran
 *    de la règle en trois semaines ; l'appeler garantit qu'un geste proposé
 *    aboutit.
 *  · #2173.49 — un RANGEMENT (`archive`/`unarchive`) dépend de `archived_at`,
 *    et de rien d'autre — ni le statut ni les compétences ne décident si un
 *    besoin peut être rangé. `archive` grise un besoin déjà archivé,
 *    `unarchive` grise un besoin déjà actif : le serveur refuserait
 *    l'idempotence (« Ce besoin est déjà archivé »), et un menu qui proposerait
 *    quand même le geste ferait cliquer sur un refus.
 */
export function needActionAvailable(need: ActionableNeed, action: NeedBulkAction): boolean {
  if (action === 'match') return need.skills.length > 0
  if (action === 'archive') return need.archived_at == null
  if (action === 'unarchive') return need.archived_at != null
  if (!isNeedStatusAction(action)) return true
  return canTransitionNeedStatus(need.status, TARGET_STATUS[action]).allowed
}

/**
 * Les lignes de la sélection que ce geste peut toucher.
 *
 * Compter AVANT d'agir est ce qui permet de dire « 7 sur 12 » plutôt que de
 * lancer douze appels dont cinq reviendront en 400 : une action de masse qui
 * échoue à moitié sans l'avoir annoncé se lit comme une panne.
 */
export function needsEligibleFor<T extends ActionableNeed>(needs: readonly T[], action: NeedBulkAction): readonly T[] {
  return needs.filter(need => needActionAvailable(need, action))
}

/**
 * Ce qu'on ne fait PAS sur une sélection de besoins, et pourquoi.
 *
 * ⚠️ Ce n'est pas une liste de choses « pas encore faites ». C'est un refus
 * tranché, et il est ici pour que le prochain qui se pose la question lise la
 * raison avant de recoder l'envie.
 */
export const NEED_BULK_ACTIONS_REFUSED: Readonly<Record<string, string>> = {
  /**
   * ⚠️ RENVERSÉ LE 11/10/2026 (décision Louis, #4016 L11) — l'export en FICHIER
   * existe désormais, gouverné par `@DataExit()`. Ce qui reste refusé est la
   * POUSSÉE de masse vers un outil tiers. Texte d'avant, conservé : « Aucune
   * action de masse ne sort de l’entreprise. La seule route d’export qui existe
   * côté besoins (`POST /projects/:id/export-crm`) POUSSE la donnée vers un CRM
   * tiers : ce n’est pas un fichier qu’on télécharge, c’est une sortie. »
   */
  crm_push:
    'Aucune POUSSÉE de masse vers un CRM depuis cette sélection : le versement au CRM reste un geste unitaire ' +
    '(`POST /projects/:id/export-crm`). La sélection sort en FICHIER, par la seule route gouvernée par la ' +
    'règle d’espace (`POST /projects/needs/export`, `@DataExit()`) — renversement daté de c43, 11/10/2026.',
}

/** Ce qu'un besoin est devenu au bout du lot. */
export type NeedBulkOutcome =
  | { needId: string; status: 'done' }
  /** Le serveur a refusé CE besoin — avec SA raison, jamais « une erreur est
   *  survenue » : « ce besoin est déjà dans cet état » se corrige, pas l'autre. */
  | { needId: string; status: 'failed'; reason: string }

/**
 * Quatre à la fois.
 *
 * Ni un, qui ferait durer une sélection de cinquante besoins une minute, ni
 * cinquante, qui ouvriraient cinquante connexions pour un geste que l'écran
 * doit pouvoir absorber. La borne est ici, en un seul endroit, parce qu'une
 * borne recopiée dans trois appelants n'est plus une borne.
 */
export const NEED_BULK_CONCURRENCY = 4

/**
 * Déroule N appels UNITAIRES, bornés et TOLÉRANTS.
 *
 * ⚠️ Trois règles, chacune pour un accident déjà payé par ce dépôt :
 *
 * 1. **Ce sont les appels unitaires qui existent déjà**, rejoués. Aucune route
 *    de masse : les vérifications (transition permise, motif obligatoire,
 *    membre de l'espace) restent celles du geste à l'unité, et ne peuvent donc
 *    pas diverger de lui.
 * 2. **Un échec n'emporte pas le lot.** `Promise.all` s'effondre au premier
 *    rejet : un besoin déjà en veille ferait échouer les quarante-neuf autres,
 *    et l'écran dirait « ça n'a pas marché » alors que rien n'a été tenté.
 * 3. **Les issues sortent DANS L'ORDRE de la sélection**, pas dans l'ordre
 *    d'achèvement — un rapport qui suit l'ordre d'arrivée se relit.
 */
export async function runNeedBulk(
  needIds: readonly string[],
  apply: (needId: string) => Promise<unknown>,
  options: { concurrency?: number } = {},
): Promise<NeedBulkOutcome[]> {
  const outcomes: (NeedBulkOutcome | undefined)[] = new Array(needIds.length).fill(undefined)
  let next = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      const needId = needIds[index]
      if (needId === undefined) return
      try {
        await apply(needId)
        outcomes[index] = { needId, status: 'done' }
      } catch (error) {
        outcomes[index] = {
          needId,
          status: 'failed',
          reason: error instanceof Error && error.message ? error.message : '',
        }
      }
    }
  }

  const lanes = Math.max(1, Math.min(options.concurrency ?? NEED_BULK_CONCURRENCY, needIds.length))
  await Promise.all(Array.from({ length: lanes }, () => worker()))
  return outcomes.filter((outcome): outcome is NeedBulkOutcome => outcome !== undefined)
}

/** Combien ont abouti, combien ont été refusés. */
export function summariseNeedBulk(outcomes: readonly NeedBulkOutcome[]): { done: number; failed: number } {
  return {
    done: outcomes.filter(outcome => outcome.status === 'done').length,
    failed: outcomes.filter(outcome => outcome.status === 'failed').length,
  }
}
