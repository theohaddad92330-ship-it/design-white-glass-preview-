import {
  DECISION_GATES,
  GATE_DECISIONS,
  PROJECT_STAGES,
  SUBMISSION_STAGES,
  splitTimelineSystemSubject,
  TIMELINE_SYSTEM_SUBJECT_SEPARATOR,
  TIMESHEET_EXCEPTION_TIMELINE_KEYS,
  type Activity,
} from '@bellum/contracts'

/**
 * #2124.68 — L'OBJET D'UNE LIGNE D'HISTORIQUE SE LIT, IL NE SE DÉCHIFFRE PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ EN PRODUCTION LE 14/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Section « Historique & preuves » du dossier THALES, événement du 14/09 :
 *
 *     account_priority — accept
 *     Interne · Bellum · Louis Schlegel · Rattaché à la main
 *
 * L'auteur, la date et la source étaient justes (#2124.60/.61/.63). L'objet,
 * lui, sortait en `snake_case` brut : un commercial ne lit pas
 * « account_priority ». C'est exactement ce que #2124.68 refuse — l'historique
 * ne devient pas un journal technique.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CORPUS, MESURÉ (pas deviné)
 * ─────────────────────────────────────────────────────────────────────────
 * Il n'existe pas d'union fermée « clé d'événement de timeline » : ce qui
 * arrive jusqu'ici est l'objet écrit par les ÉMETTEURS. Trois d'entre eux, et
 * trois seulement, écrivent une clé de domaine plutôt qu'un texte humain
 * (balayage de `activities.ingest(...)` / `.log(...)` côté API) :
 *
 *  | émetteur                      | nature          | objet écrit                    |
 *  | ----------------------------- | --------------- | ------------------------------ |
 *  | `decision-gates.service`      | `gate_decision` | `<porte> — <décision>`         |
 *  | `projects.service`            | `stage_change`  | `<libellé projet> — <étape>`   |
 *  | `consultants/submissions`     | `task` système  | `<nom du profil> — <étape>`    |
 *
 * Les autres (`activity-capture`, `tasks.service`, `mailbox.controller`,
 * `activities.log`) portent un objet écrit par un humain ou par le fournisseur
 * — on n'y touche PAS : réécrire le texte de quelqu'un serait un défaut de
 * plus. `recordCrmLookup` laisse `subject` à `null` et se nomme par sa nature.
 *
 * Les quatre énumérations qui en sortent sont fermées et importées ici :
 * `DECISION_GATES` (11), `GATE_DECISIONS` (3), `PROJECT_STAGES` (9),
 * `SUBMISSION_STAGES` (6). La garde `i18n/enum-keys.test.ts` refuse qu'une
 * valeur y entre sans son libellé FR **et** EN.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE REPLI NOMME L'INCONNU
 * ─────────────────────────────────────────────────────────────────────────
 * Une clé sans libellé ne fuit jamais à l'écran : elle rend une phrase
 * compréhensible (« Porte de décision — issue non nommée »). C'est le même
 * choix que « non mesuré n'est pas 0 » — on NOMME l'absence, on ne la laisse
 * pas sortir en technique. La CI, elle, casse : le repli est un filet, pas une
 * permission.
 *
 * Le libellé n'est pas écrit côté serveur : un libellé d'affichage posé dans un
 * contrat est français pour toujours (même raison que `recordCrmLookup`).
 */

/** Le `t` d'i18next, réduit à ce dont ce module a besoin. */
type Translate = (key: string, options?: Record<string, unknown>) => string

const GATES = new Set<string>(DECISION_GATES)
const DECISIONS = new Set<string>(GATE_DECISIONS)
const PROJECT = new Set<string>(PROJECT_STAGES)
const SUBMISSION = new Set<string>(SUBMISSION_STAGES)
// #2196.31 — les deux lignes que la pose et l'annulation d'une exception de
// relevé écrivent au journal de la mission. Liste du CONTRAT, jamais recopiée.
const TIMESHEET_EXCEPTION = new Set<string>(TIMESHEET_EXCEPTION_TIMELINE_KEYS)

/**
 * Le titre lisible d'une ligne d'historique.
 *
 * Rendu par `TimelinePanel` à la place de `activity.subject`. Quand la ligne
 * n'est PAS une trace système, l'objet est rendu tel quel : c'est le texte de
 * son auteur, et le retoucher serait mentir.
 */
export function timelineEventTitle(activity: Activity, t: Translate): string {
  const subject = activity.subject?.trim()

  if (activity.kind === 'gate_decision') {
    // La ligne entière est machine : `<porte> — <décision>`. Sans séparateur,
    // on ne devine rien — la nature seule (« Décision tranchée ») reste vraie.
    const parts = subject ? splitTimelineSystemSubject(subject) : null
    if (!parts) return t('kinds.gate_decision')
    const gate = GATES.has(parts.context) ? t(`gates.${parts.context}`) : t('gates.unknown')
    const decision = DECISIONS.has(parts.key) ? t(`gateDecisions.${parts.key}`) : t('gateDecisions.unknown')
    return join(gate, decision)
  }

  if (!subject) return t(`kinds.${activity.kind}`)

  // `stage_change` n'a qu'un émetteur, et il est système. Le contexte est le
  // libellé du projet — humain, gardé tel quel ; seule l'étape est traduite.
  if (activity.kind === 'stage_change' && activity.source === 'system') {
    return translateSuffix(subject, PROJECT, 'projects:stage.states.', t)
  }

  // `task` a DEUX émetteurs : les tâches (`internal`, objet écrit par la
  // personne) et les positionnements (`outbound`, objet `<profil> — <étape>`).
  // Le triplet distingue le second sans toucher au premier — un intitulé de
  // tâche ne se réécrit jamais.
  if (activity.kind === 'task' && activity.source === 'system' && activity.direction === 'outbound') {
    return translateSuffix(subject, SUBMISSION, 'submissions:stages.', t)
  }

  // #2196.31 — `workflow` a d'autres émetteurs : seule une clé de la liste
  // FERMÉE est traduite, tout autre objet repart intact.
  if (activity.kind === 'workflow' && activity.source === 'system') {
    const parts = splitTimelineSystemSubject(subject)
    if (parts && TIMESHEET_EXCEPTION.has(parts.key)) return join(parts.context, t(`timesheetException.${parts.key}`))
  }

  return subject
}

/**
 * `<contexte> — <clé>` → `<contexte> — <libellé>`.
 *
 * Une clé hors de l'énumération fermée ne s'affiche pas : elle se NOMME
 * (« étape non nommée »). Un objet sans séparateur n'est pas une trace système
 * — il repart intact.
 */
function translateSuffix(subject: string, closed: ReadonlySet<string>, prefix: string, t: Translate): string {
  const parts = splitTimelineSystemSubject(subject)
  if (!parts) return subject
  return join(parts.context, closed.has(parts.key) ? t(`${prefix}${parts.key}`) : t('stages.unknown'))
}

function join(left: string, right: string): string {
  return `${left}${TIMELINE_SYSTEM_SUBJECT_SEPARATOR}${right}`
}
