import { OPEN_PIPELINE_STAGES, type ProjectStage } from '@bellum/contracts'

/**
 * MANQUE B du 30/08 — « RELANCER LA PRISE DE BRIEF ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONDITION, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le signal typique d'un compte qui PARLE sans avancer : au moins deux
 * opportunités ouvertes, et aucune mission signée. Ni une, ni « au moins une
 * mission ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « OUVERTE » REPREND `OPEN_PIPELINE_STAGES` — LE VOCABULAIRE DÉJÀ LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * `detected` / `potential` sont des PREUVES, pas encore regardées par un
 * humain (`project.ts`) : les compter ferait sonner ce geste sur un simple
 * signal détecté par l'analyse. `won` est une opportunité déjà convertie — la
 * question n'est plus « ce compte parle-t-il sans avancer ? ». `lost` et
 * `dormant` sont des sorties. Ce qui reste, `OPEN_PIPELINE_STAGES`, EST déjà
 * exporté par `@bellum/contracts` : le reprendre ici évite d'écrire une
 * seconde liste de stades qui diverge de la première (GA-57 refuse d'ailleurs
 * toute liste de stades hors des fichiers qui les portent).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « AUCUNE MISSION SIGNÉE » — LA MÊME SOURCE QUE LE BADGE DE FACTURATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `hasSignedMission` vient du digest de propagation (`accountPropagationById`,
 * `missions: number` — « tous statuts », c'est-à-dire toute mission qui existe
 * déjà, puisqu'une mission de ce dépôt naît SIGNÉE, un projet gagné, jamais en
 * brouillon). C'est la même dérivation que celle qui décide, pour le badge A,
 * si un compte a « rien à facturer » — un seul endroit qui répond à « ce
 * compte a-t-il une mission ? », pas deux qui pourraient un jour diverger.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CALCULÉ CÔTÉ ÉCRAN — CE QUE ÇA COÛTE, ET POURQUOI ICI QUAND MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 * Le motif « le serveur désigne, l'écran ne recalcule jamais » (GA-53,
 * `account-hygiene.sql.ts` + `accountHygiene.ts`) est le bon pour un contrôle
 * qui doit rester identique sur plusieurs écrans. Ce geste-ci n'existe encore
 * NULLE PART ailleurs dans le produit — il n'y a donc rien avec quoi diverger
 * aujourd'hui — et `account-hygiene.sql.ts` est hors du périmètre strict de ce
 * lot (web seul, `accounts-list/` seul). La dette est nommée : si ce geste
 * doit un jour apparaître sur un second écran (le cockpit manager, par
 * exemple), il devra migrer vers un prédicat serveur pour que les deux ne
 * divergent jamais — comme `nextActionVerdict` le fait déjà pour son domaine.
 */

const OPEN_STAGES = new Set<string>(OPEN_PIPELINE_STAGES)

/** Combien d'opportunités OUVERTES ce compte porte-t-il ? */
export function countOpenOpportunities(
  accountId: string,
  projects: readonly { account_id: string; stage: ProjectStage | string }[],
): number {
  return projects.filter(project => project.account_id === accountId && OPEN_STAGES.has(project.stage)).length
}

/** Seuil sous lequel « ça parle » ne suffit pas encore. Nommé, pas répété deux
 *  fois : un futur ajustement (trois plutôt que deux) ne se corrige qu'ici. */
const MIN_OPEN_OPPORTUNITIES = 2

/** Ce compte porte-t-il le geste « relancer la prise de brief » ? */
export function shouldRelaunchBrief(input: { hasSignedMission: boolean; openOpportunities: number }): boolean {
  if (input.hasSignedMission) return false
  return input.openOpportunities >= MIN_OPEN_OPPORTUNITIES
}
