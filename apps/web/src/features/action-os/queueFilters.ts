import type { ActionRisk, AtsWriteRequestView, CrmWriteRequestView, PlaybookApproval } from '@bellum/contracts'
import type { ApprovalRequestView } from './api'

/**
 * #2200.39 / #2200.42 / #2200.43 — LES FILTRES RISQUE / AGENT / SOURCE DE LA
 * FILE « À VALIDER » (épopée #2867).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI QUATRE EXTRACTEURS, ET PAS UN CHAMP COMMUN
 * ─────────────────────────────────────────────────────────────────────────────
 * La file réunit quatre familles de cartes qui ne portent pas la même donnée à
 * la même maille (`ActionCenter.tsx` : `ApprovalList`/`CrmWriteList`/
 * `ErpWriteList`/`PlaybookSendList`). Les fondre en un type commun aurait
 * obligé à INVENTER une valeur pour les familles qui n'en ont pas — exactement
 * ce que la doctrine interdit (« on n'affiche pas ce qu'on n'a pas »). Chaque
 * extracteur reste donc honnête : `null` veut dire « pas mesuré », jamais
 * « aucun ».
 */

/**
 * #2200.42 — un déclenchement humain nommé, ou une automatisation. Jamais un
 * troisième état : soit on sait, soit le champ vaut `null` plus haut.
 *
 * ⚠️ Non exporté : seul ce fichier le nomme (`QueueFacts`/`QueueFilterValues`
 * le portent déjà vers l'extérieur). Un type exporté sans appelant hors de son
 * fichier est ce que `pnpm lint:exports:types` (knip) refuse.
 */
type QueueAgent = 'human' | 'automation'

export type QueueFilterValues = {
  risk?: ActionRisk
  agent?: QueueAgent
  source?: string
}

/** ⚠️ Non exporté, même raison que {@link QueueAgent} : seuls les extracteurs
 *  et `matchesQueueFilters` de CE fichier le manipulent. */
type QueueFacts = {
  risk: ActionRisk | null
  agent: QueueAgent | null
  source: string | null
}

/**
 * L'approbation générique de l'Action OS.
 *
 * `trace`/`risk` sont calculés côté serveur (`action-os.controller.ts`,
 * `listApprovals`) depuis le RUN pointé par l'approbation — jamais recalculés
 * ici. Un nom absent (`triggeredByName === null`) est le signal EXACT, déjà
 * établi par #2200.13, d'un déclenchement automatique (routine, signal…).
 *
 * ⚠️ `trace`/`risk` restent optionnels au type (`api.ts`) : un onglet ouvert
 * pendant un déploiement lit une API qui ne les envoie pas encore. `?? null`
 * les ramène à « pas mesuré », jamais à une valeur devinée.
 */
export function approvalFacts(approval: ApprovalRequestView): QueueFacts {
  return {
    risk: approval.risk ?? null,
    agent: approval.trace?.triggeredByName != null ? 'human' : 'automation',
    source: approval.trace?.trigger ?? null,
  }
}

/**
 * Une écriture CRM. `origin` distingue déjà un geste utilisateur d'un geste
 * système (`crm-write-request-view.ts`) ; `target.risk` est calculé PAR
 * NATURE d'écriture (`crmWriteRiskOf`), jamais une probabilité. Aucune source
 * nommée n'existe à cette maille — une écriture CRM n'a pas de déclencheur
 * comparable à `workflowTriggerSchema`, et personne ne le prétend.
 *
 * ⚠️ `target` est requis au contrat mais lu en optionnel ici (règle du dépôt :
 * chaînage optionnel obligatoire sur une donnée qui peut venir d'avant ce
 * champ) — une ligne plus ancienne ne fait pas planter le filtre, elle rend
 * simplement `null`.
 */
export function crmWriteFacts(request: CrmWriteRequestView): QueueFacts {
  return {
    risk: request.target?.risk ?? null,
    agent: request.origin === 'system' ? 'automation' : 'human',
    source: null,
  }
}

/**
 * Une écriture ERP. `target` existe au contrat mais son remplissage
 * (owner + risque) suit dans un lot séparé (`ats-write.service.ts`) : à ce
 * jour AUCUNE des trois dimensions n'est mesurée. La carte reste visible sans
 * filtre actif ; elle ne correspond simplement à aucune valeur choisie.
 */
export function erpWriteFacts(_request: AtsWriteRequestView): QueueFacts {
  return { risk: null, agent: null, source: null }
}

/**
 * Une relance automatique de playbook. Sa nature — depuis la p21 de
 * l'addendum — est d'être composée SANS geste humain avant la demande de
 * validation (`PlaybookSendList`, `ActionCenter.tsx`) : l'agent est donc
 * TOUJOURS une automatisation, un fait de la capacité et non une mesure par
 * carte, au même titre que `channel` vaut toujours `'email'` pour cette même
 * famille. Risque et source, eux, ne sont pas encore mesurés.
 */
export function playbookSendFacts(_approval: PlaybookApproval): QueueFacts {
  return { risk: null, agent: 'automation', source: null }
}

/** ET logique sur les trois dimensions. Une dimension sans filtre actif ne
 *  contraint rien ; une carte dont le fait vaut `null` ne matche JAMAIS un
 *  filtre actif sur cette dimension — ce n'est pas un refus, c'est l'absence
 *  de mesure qui reste absente. */
export function matchesQueueFilters(facts: QueueFacts, filters: QueueFilterValues): boolean {
  if (filters.risk && facts.risk !== filters.risk) return false
  if (filters.agent && facts.agent !== filters.agent) return false
  if (filters.source && facts.source !== filters.source) return false
  return true
}

/**
 * Les options d'un filtre ne portent QUE ce qui existe réellement dans la
 * file actuelle — jamais l'énumération complète du contrat. Une valeur
 * absente ne crée pas d'option de filtre vide (doctrine, brief épopée #2867).
 */
export function availableValues<T extends string>(values: readonly (T | null)[]): T[] {
  return [...new Set(values.filter((value): value is T => value !== null))]
}
