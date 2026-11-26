import { z } from 'zod'

/**
 * Les portes de décision — les gestes que le produit ne franchit JAMAIS seul.
 *
 * Le socle d'architecture énonce l'interdit sans nommer les portes : « franchir
 * une porte de décision — G1 à G8 sont des gestes humains ». Le dépôt n'en
 * portait aucune trace : ni table, ni type, ni journal. Les huit franchissements
 * les plus structurants du produit se faisaient donc sans laisser dire QUI a
 * décidé, POURQUOI, et surtout **ce qui manquait au moment de décider**.
 *
 * Ce catalogue vit dans le CODE, comme `workflow-catalog` et `routine-catalog`,
 * et pour la même raison : une porte éditable sans revue serait une porte qui
 * ne garde rien. Il n'invente rien non plus — chacune des huit correspond à un
 * geste qui EXISTE déjà dans le produit, avec son endpoint et son écran. Une
 * porte sans geste réel derrière serait une case à cocher, c'est-à-dire la
 * version gouvernance du « livré mais jamais appelé ».
 *
 * Ce que la trace retient, et qui n'existait nulle part : **les manques**. Un
 * franchissement forcé malgré trois informations absentes reste un
 * franchissement légitime — c'est le métier —, mais six mois plus tard, savoir
 * qu'on a décidé sans connaître le budget, sans interlocuteur identifié et sans
 * date, c'est la seule chose qui explique le résultat.
 */

/** Les huit portes, dans l'ordre du cycle commercial. */
export const DECISION_GATES = [
  /** G1 — ce compte entre dans le portefeuille, ou en sort. */
  'account_priority',
  /** G2 — ce contact est retenu comme interlocuteur, ou écarté. */
  'contact_qualification',
  /** G3 — ce besoin est staffable, ou il ne l'est pas. */
  'need_staffable',
  /** G4 — ce profil part chez le client. Le geste qui engage la crédibilité. */
  'submission_send',
  /** G5 — ce playbook est armé : à partir de maintenant, il envoie seul. */
  'playbook_arming',
  /** G6 — cette écriture part dans l'ERP, qui porte la facturation et la paie. */
  'erp_write',
  /** G7 — ce mois est déclaré prêt à facturer. */
  'invoice_readiness',
  /** G8 — ce projet est clos, gagné ou perdu. */
  'project_close',
  /*
   * ─────────────────────────────────────────────────────────────────────────
   * Les portes des CHAÎNES (PDF 6 §6, décision D46)
   * ─────────────────────────────────────────────────────────────────────────
   * Le document attend des portes que le dépôt n'avait pas, sous des numéros
   * DÉJÀ PRIS par d'autres : son G5 est « go entretien » quand le nôtre est
   * l'armement d'un playbook, son G6 « preuves suffisantes » quand le nôtre est
   * l'écriture ERP, son G7 « risque » quand le nôtre est « prêt à facturer ».
   *
   * On ne renomme pas. `decision_gate_crossings` est un journal d'AUDIT : le
   * réécrire pour aligner un vocabulaire ferait perdre exactement ce qu'il sert
   * à garder. Les trois portes manquantes sont donc ajoutées EN FIN
   * d'énumération (garde GA-08), et les chaînes les référencent par leur clé
   * réelle plutôt que par le numéro du document.
   */
  /** Ce candidat va en entretien chez le client, ou il n'y va pas. */
  'interview_go',
  /** Les preuves suffisent pour se présenter en rang 1, ou elles ne suffisent pas. */
  'proof_sufficiency',
  /** Cette mission porte un risque qui demande un plan, ou elle n'en porte pas. */
  'delivery_risk',
] as const
export const decisionGateSchema = z.enum(DECISION_GATES)
export type DecisionGate = (typeof DECISION_GATES)[number]

/**
 * Les portes qui exigent un motif.
 *
 * Toutes ne le méritent pas. Prioriser un compte est un geste qu'on refait
 * chaque semaine : l'assortir d'un formulaire le ferait contourner. Écarter,
 * refuser, clore en perte — là, l'absence de raison coûte cher, parce que c'est
 * précisément ce qu'on voudra relire.
 *
 * La règle est donc portée par la DÉCISION, pas par la porte : `refuse` et
 * `force` demandent un motif partout, `accept` n'en demande que sur les portes
 * irréversibles.
 */
export const IRREVERSIBLE_GATES: readonly DecisionGate[] = ['erp_write', 'invoice_readiness', 'project_close']

/** Ce qu'un humain a répondu à la porte. */
export const GATE_DECISIONS = [
  /** Franchie : le geste part. */
  'accept',
  /** Refusée : le geste ne part pas, et on dit pourquoi. */
  'refuse',
  /**
   * Franchie MALGRÉ des manques connus. Ce n'est ni un `accept` ni une faute :
   * décider sans tout savoir est le quotidien du commerce. Le distinguer permet
   * seulement de relire plus tard les décisions prises à l'aveugle, et de voir
   * si elles ont mieux ou moins bien tourné.
   */
  'force',
] as const
export const gateDecisionValueSchema = z.enum(GATE_DECISIONS)
export type GateDecisionValue = (typeof GATE_DECISIONS)[number]

/** Sur quoi porte la décision. */
/**
 * Ce sur quoi porte la décision.
 *
 * `consultant` est arrivé avec la porte G4 : positionner, c'est décider d'une
 * PERSONNE sur un besoin, pas d'un besoin. Ranger la décision sous le besoin
 * aurait rendu indiscernables les cinq profils qu'on y examine — et c'est
 * précisément ce qu'on voudra relire.
 */
export const GATE_SUBJECTS = [
  'account',
  'contact',
  'project',
  'need',
  'submission',
  'mission',
  'playbook',
  'consultant',
] as const
export const gateSubjectSchema = z.enum(GATE_SUBJECTS)
export type GateSubject = (typeof GATE_SUBJECTS)[number]

export const gateCrossingSchema = z.object({
  gate: decisionGateSchema,
  decision: gateDecisionValueSchema,
  subject: gateSubjectSchema,
  /**
   * L'identifiant de l'objet décidé. Une chaîne, pas un `uuid` : sept des huit
   * portes visent bien une ligne en base, mais l'armement d'un playbook vise sa
   * CLÉ — son catalogue vit dans le code, pas dans une table.
   */
  subjectId: z.string().trim().min(1).max(64),
  /** Obligatoire dès que {@link reasonRequired} le dit. */
  reason: z.string().trim().max(500).nullish(),
  /**
   * Ce qui manquait au moment de décider. Libre, court, et JAMAIS deviné : une
   * liste vide veut dire « rien ne manquait », pas « on n'a pas regardé ».
   */
  missing: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
})
export type GateCrossing = z.infer<typeof gateCrossingSchema>

/**
 * Un motif est-il exigé pour ce franchissement ?
 *
 * Pure et testable sans base : c'est la règle que l'API applique et que
 * l'écran doit appliquer AVANT d'envoyer — un 400 laisse l'écran inchangé et se
 * lit comme une panne, un champ obligatoire se lit comme une question.
 */
export function reasonRequired(gate: DecisionGate, decision: GateDecisionValue): boolean {
  if (decision === 'refuse' || decision === 'force') return true
  return IRREVERSIBLE_GATES.includes(gate)
}

/**
 * Ce qui empêche d'enregistrer ce franchissement — vide si tout va bien.
 *
 * Rend des messages, pas des codes : ils sont destinés à être lus par la
 * personne qui vient de cliquer.
 */
export function gateCrossingProblems(crossing: GateCrossing): string[] {
  const problems: string[] = []
  if (reasonRequired(crossing.gate, crossing.decision) && !(crossing.reason ?? '').trim()) {
    problems.push('Cette décision demande son motif.')
  }
  if (crossing.decision === 'force' && crossing.missing.length === 0) {
    // Forcer veut dire « je décide malgré ce qui manque ». Sans manque nommé,
    // c'est un `accept` — et les confondre rendrait la relecture inutile.
    problems.push('Forcer une porte demande de nommer ce qui manquait.')
  }
  return problems
}
