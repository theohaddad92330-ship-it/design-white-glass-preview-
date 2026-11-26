import { CRM_PROVIDERS } from '@bellum/contracts'
import type { ConnectorId, ConnectorState } from './connectors'

/**
 * PAR QUOI COMMENCER — #1445.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REPROCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Ne pas demander au nouvel utilisateur de choisir parmi 16 outils sans
 * recommandation. »* L'écran ouvrait sur sept familles équivalentes, triées par
 * ordre de lecture d'un commercial — ce qui suppose déjà de savoir ce qu'on
 * cherche. Quelqu'un qui arrive avec zéro outil branché n'a pas cette question :
 * il a « par où je commence ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTAPES, ET CE QUI LES DÉBLOQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ordre est celui du retour, et il n'est pas arbitraire : il va du plus
 * immédiat au plus optionnel.
 *
 *  1. **messagerie + agenda** — préparer un rendez-vous et traiter des échanges ;
 *  2. **CRM** — l'historique commercial et les mises à jour préparées ;
 *  3. **base documentaire** — les méthodes et documents internes.
 *
 * ⚠️ **« Selon son environnement » ne se devine pas.** Une étape n'est
 * recommandée que si elle a un candidat **que ce serveur offre réellement** — un
 * outil dont l'application OAuth n'est pas déclarée ne remonte jamais ici, comme
 * il ne remonte pas dans le catalogue. Et une étape dont un outil est **déjà
 * branché** disparaît : une section « pour démarrer » qui redemande ce qui est
 * fait est une charge, pas une aide.
 */
const STARTER_STEPS = [
  { key: 'mailbox', candidates: ['google', 'microsoft'] },
  // #4185 — les CRM candidats sont ceux du contrat de l'adaptateur commun.
  { key: 'crm', candidates: CRM_PROVIDERS },
  { key: 'documents', candidates: ['notion', 'admin_docs'] },
] as const satisfies readonly { key: string; candidates: readonly ConnectorId[] }[]

type StarterStepKey = (typeof STARTER_STEPS)[number]['key']

type StarterStep = { key: StarterStepKey; connectorId: ConnectorId }

/** Ce que l'écran connaît d'un connecteur pour décider s'il le recommande. */
type Candidate = { id: ConnectorId; state: ConnectorState }

/**
 * Les étapes à recommander — au plus trois, jamais une de plus.
 *
 * `visible` est la liste que l'écran rend DÉJÀ (`buildConnectorsView`), filtres
 * exclus : c'est elle qui porte la vérité sur ce que ce serveur offre. Recopier
 * ici une liste d'outils « qu'on devrait pouvoir brancher » produirait une
 * recommandation vers un bouton qui répond 400 — le défaut que le catalogue a
 * déjà corrigé une fois.
 */
export function starterSteps(visible: readonly Candidate[]): StarterStep[] {
  const byId = new Map(visible.map(candidate => [candidate.id, candidate.state]))
  const steps: StarterStep[] = []

  for (const step of STARTER_STEPS) {
    const offered = step.candidates.filter(id => byId.has(id))
    // Rien d'offert par ce serveur : l'étape n'existe pas pour cet utilisateur.
    if (offered.length === 0) continue
    // Déjà branché (ou en cours de réparation) : l'étape est franchie. Une
    // réparation est le sujet du bloc « à réparer », pas d'un guide de démarrage.
    if (offered.some(id => byId.get(id) !== 'available')) continue
    // Le premier candidat offert — l'ordre de `candidates` est un ordre de
    // recommandation, pas un hasard : on propose le plus répandu d'abord.
    const first = offered[0]
    if (first) steps.push({ key: step.key, connectorId: first })
  }

  return steps
}
