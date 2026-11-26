import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-266 — le détail PAR ESPACE NOMMÉ ne lit jamais le flux COMPORTEMENTAL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Règle 5 de `c64_analytique_produit` : « aucune métrique comportementale par
 * espace client NOMMÉ dans le back-office opérateur ». « L'écran X est abandonné
 * à 62 % » se lit ; « chez [ce client], l'écran X est abandonné » ne se lit pas —
 * parce que c'est exactement là que ça dérape : ça se transforme en argument
 * commercial, puis en reproche.
 *
 * `GET internal/analytics/teams/:workspaceId` est la SEULE route du back-office
 * qui rende un détail par espace nommé. Le registre de doctrine constatait au
 * 07/09/2026 que la règle n'était « NON VIOLÉE aujourd'hui, non gardée non
 * plus » : ce que cette route compte sont des actions VALIDÉES (analyses,
 * enrichissements, messages, crédits), pas des comportements. C'est vrai, et
 * rien ne l'empêchait de cesser de l'être — la ligne à ne pas franchir passe à
 * l'INTÉRIEUR d'une route qui existe déjà, et le lot #1683-#1688 vient de poser
 * juste à côté un service qui, lui, lit ce flux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE — ET POURQUOI PAS « NE TOUCHE PAS product_events »
 * ─────────────────────────────────────────────────────────────────────────────
 * `TeamKpisService` LIT `product_events` et doit continuer : c'est là que vivent
 * `onboarding_completed`, `analysis_started`, `contact_enriched`. Les DEUX flux
 * cohabitent dans cette table depuis #1681.4, et ce qui les sépare n'est pas la
 * table, ce sont les NOMS d'événement et la colonne `session_id` (une ligne
 * d'audit porte `user_id` et pas de session ; une ligne comportementale
 * l'inverse).
 *
 * La garde porte donc sur ces deux marqueurs. Une garde qui aurait interdit
 * `product_events` aurait été rouge dès son écriture, et le seul geste qui
 * l'aurait calmée aurait été de la réécrire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Une lecture comportementale qui arriverait par un service TIERS injecté dans
 * le contrôleur (il en injecte neuf). Le corpus est délibérément les deux
 * fichiers qui PORTENT la route et son calcul : élargir aux neuf services
 * attraperait `ProductAnalyticsReadService` le jour où quelqu'un l'y injecterait
 * pour une raison légitime, et une garde trop gourmande finit désarmée.
 */

const ANALYTICS = join(__dirname, '..', 'modules', 'analytics')

/** Les vingt et une natures du flux comportemental (#1682, élargi par #1946
 *  puis #2085).
 *  Recopiées ici depuis le contrat de l'issue — jamais importées du fichier
 *  gardé ni de son voisin : une liste qui vivrait avec le code qu'elle garde
 *  dériverait avec lui.
 *
 *  ⚠️ L'élargissement du 14/09/2026 est précisément le moment où cette garde
 *  serait devenue borgne : elle serait restée VERTE pendant que le détail par
 *  espace nommé aurait pu lire `prepared_action_stage` ou `draft_reused` — dix
 *  natures qu'elle n'aurait pas connues. */
const BEHAVIORAL_EVENT_NAMES = [
  'screen_viewed',
  'screen_left',
  'tab_opened',
  'action_started',
  'action_completed',
  'action_abandoned',
  'filter_applied',
  'search_performed',
  'error_shown',
  // #1946 — « mesurer la VALEUR, pas le volume de messages ».
  'assistant_first_question_sent',
  'suggestion_clicked',
  'assistant_first_useful_result',
  'assistant_answer_judged',
  'assistant_redirect_followed',
  'prepared_action_stage',
  'draft_reused',
  'intervention_outcome',
  'memory_added',
  // #2085 (15/09/2026) — même avertissement que ci-dessus : sans ces deux
  // lignes, la garde resterait VERTE si le détail par espace nommé lisait un
  // jour `onboarding_prefill_reviewed` ou `onboarding_step_back`.
  'onboarding_prefill_reviewed',
  'onboarding_step_back',
  // #2985 (26/09/2026) — même avertissement : le Meeting OS, neuf formes de
  // plus (#2767).
  'brief_generated',
  'brief_opened',
  'question_used',
  'notes_added',
  'summary_generated',
  'summary_approved',
  'actions_created',
  'followup_created',
  'false_association_corrected',
  // #2319.123 (29/09/2026) — même avertissement, un trou du même jour trouvé
  // en câblant #2108.49-.53 juste en dessous.
  'meeting_completed',
  // #2108.49-.53 (29/09/2026) — même avertissement : les cinq mesures du
  // geste accepter/reporter/rejeter/corriger sur une carte de priorité.
  'priority_viewed',
  'priority_accepted',
  'priority_snoozed',
  'priority_rejected',
  'priority_corrected',
  // #2108.54 (30/09/2026) — même avertissement : une tâche cochée.
  'task_completed',
  // #2319.129/.130 (30/09/2026) — même avertissement : l'écriture CRM confirmée.
  'crm_writeback_confirmed',
]

/** La colonne qui n'existe QUE sur une ligne comportementale. */
const BEHAVIORAL_COLUMN = 'session_id'

/**
 * #1681.5 — LE MARQUEUR CHANGE DE CASSE EN TRAVERSANT LA FRONTIÈRE SQL.
 *
 * Les dix marqueurs ci-dessus sont écrits comme la BASE les porte. Un champ de
 * RÉPONSE TypeScript, lui, s'écrit `sessionId` — et `SELECT session_id AS
 * "sessionId"` n'aurait été attrapé que par sa moitié gauche. La garde était
 * donc verte pour la bonne raison aujourd'hui, et l'aurait été pour la mauvaise
 * le jour où quelqu'un aurait projeté la colonne sous son nom d'objet.
 *
 * La variante se DÉRIVE, elle ne se recopie pas : deux listes à tenir à jour
 * divergent à la première, et c'est le même défaut que la garde combat.
 */
const camelCased = (snake: string): string => snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

/** Ce que la garde reproche à une source. Isolée pour qu'on puisse lui donner
 *  un texte FABRIQUÉ et vérifier qu'elle sait dire non. */
function behavioralMarkersIn(source: string): string[] {
  const found: string[] = []
  for (const name of [...BEHAVIORAL_EVENT_NAMES, BEHAVIORAL_COLUMN]) {
    // `includes`, pas `RegExp.test` : le drapeau `g` d'une expression régulière
    // réutilisée est STATEFUL, et ce piège a déjà rendu une garde de ce dépôt
    // aveugle une ligne sur deux.
    if (source.includes(name)) found.push(name)
    else if (source.includes(camelCased(name))) found.push(camelCased(name))
  }
  return found
}

describe('GA-266 — teams/:workspaceId ne lit jamais le flux comportemental', () => {
  const service = readFileSync(join(ANALYTICS, 'team-kpis.service.ts'), 'utf8')
  const controller = readFileSync(join(ANALYTICS, 'internal-team-kpis.controller.ts'), 'utf8')

  it('LIT quelque chose — et lit bien les fichiers qui portent la route', () => {
    // Sans ces lignes, un fichier renommé rendrait la garde verte en lisant
    // deux chaînes vides. Le témoin le plus parlant : le service DOIT contenir
    // `product_events`, sinon ce n'est pas lui qu'on garde.
    expect(service.length).toBeGreaterThan(1_000)
    expect(service).toContain('product_events')
    expect(controller).toContain("@Get('teams/:workspaceId')")
  })

  it('le calcul par espace ne nomme aucun événement comportemental, ni `session_id`', () => {
    expect(`marqueurs dans team-kpis.service.ts → ${behavioralMarkersIn(service).join(', ')}`).toBe(
      'marqueurs dans team-kpis.service.ts → ',
    )
  })

  it('le contrôleur non plus', () => {
    expect(`marqueurs dans internal-team-kpis.controller.ts → ${behavioralMarkersIn(controller).join(', ')}`).toBe(
      'marqueurs dans internal-team-kpis.controller.ts → ',
    )
  })

  it('sait dire NON — une lecture comportementale ajoutée est REPROCHÉE', () => {
    const fautif = `
      SELECT COUNT(*) FROM product_events
      WHERE event_name = 'screen_viewed' AND workspace_id = $1
    `
    expect(behavioralMarkersIn(fautif)).toEqual(['screen_viewed'])
  })

  it('#1946 — sait dire NON sur une nature AJOUTÉE, pas seulement sur les neuf d’origine', () => {
    // Le pire cas de la règle 5 après l'élargissement : « chez ce client, les
    // brouillons de Laura sont réécrits à 80 % » — un argument commercial, puis
    // un reproche. C'est la phrase que cette ligne rend impossible à écrire
    // dans le détail par espace nommé.
    const fautif = `
      SELECT COUNT(*) FROM product_events
      WHERE event_name = 'draft_reused' AND workspace_id = $1
    `
    expect(behavioralMarkersIn(fautif)).toEqual(['draft_reused'])
    expect(behavioralMarkersIn("rows.filter(r => r.eventName === 'preparedActionStage')")).toEqual([
      'preparedActionStage',
    ])
  })

  it('sait dire NON — un regroupement par `session_id` est REPROCHÉ', () => {
    expect(behavioralMarkersIn('GROUP BY session_id, workspace_id')).toEqual(['session_id'])
  })

  it('sait dire NON — le même marqueur PROJETÉ en camelCase est REPROCHÉ (#1681.5)', () => {
    // Le trou réel : la colonne franchit la frontière SQL sous un autre nom, et
    // la moitié gauche de la garde ne la voyait plus.
    expect(behavioralMarkersIn('SELECT session_id AS "sessionId" FROM product_events')).toEqual(['session_id'])
    expect(behavioralMarkersIn('rows.map(r => r.sessionId)')).toEqual(['sessionId'])
    expect(behavioralMarkersIn("if (event.name === 'screenViewed') return")).toEqual(['screenViewed'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — les événements d’AUDIT restent permis', () => {
    // Le témoin du cas légitime voisin : c'est exactement ce que la route lit
    // aujourd'hui, et elle doit continuer.
    const legitime = `
      SELECT user_id FROM product_events
      WHERE event_name = ANY(ARRAY['onboarding_completed','analysis_started','contact_enriched'])
    `
    expect(behavioralMarkersIn(legitime)).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas — le service de LECTURE comportementale est hors corpus', () => {
    // `product-analytics-read.service.ts` nomme les neuf événements : c'est son
    // travail. S'il tombait dans le corpus, la garde serait rouge en refusant
    // le code qu'elle est censée rendre possible.
    const lecteur = readFileSync(join(ANALYTICS, 'product-analytics-read.service.ts'), 'utf8')
    expect(behavioralMarkersIn(lecteur).length).toBeGreaterThan(0)
  })
})

/**
 * GA-266 (suite) — #1946.22 : L'EXCEPTION NOMMÉE ET UNIQUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LOUIS A LEVÉ, ET CE QUI TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision Louis 13/09 batch 12, prise CONTRE la recommandation : la règle 5 de
 * `c64_analytique_produit` (« rien de comportemental par espace client NOMMÉ »)
 * et le refus du 10/09 (« aucune alerte sur signal d'usage ») sont levés pour
 * UNE alerte OPÉRATEUR — `espace_a_risque`, portée par
 * `BackofficeAlertsService#checkWorkspacesAtRisk`. Relecture juridique RGPD
 * toujours due.
 *
 * Une exception qui n'est pas gardée devient une permission générale au
 * deuxième usage. Cette section tient donc TROIS choses dans le module
 * d'alertes :
 *  1. une seule méthode qui ALERTE (`dispatch.dispatch`) en lisant un signal
 *     d'usage d'espace (santé, ses axes, ou le flux comportemental) — la
 *     nommée, avec le `kind` nommé ;
 *  2. le jeton de lecture de santé n'est consommé QUE par elle ;
 *  3. elle — et le fichier pur qui écrit sa phrase — ne portent aucune donnée
 *     de PERSONNE (adresse, identifiant d'utilisateur).
 *
 * ⚠️ CE QU'ELLE NE VOIT PAS : un signal d'usage lu hors de `backoffice-alerts/`
 * et envoyé par un autre canal. Le corpus est le module d'alertes parce que
 * c'est lui qui PARLE à des humains sur un espace nommé ; les écrans du
 * back-office restent tenus par la section ci-dessus et par
 * `produit-ne-croise-pas-comportement-et-espace.test.ts`.
 */
const ALERTS = join(__dirname, '..', 'modules', 'backoffice-alerts')

/** L'exception, recopiée depuis la décision — jamais importée du code gardé. */
const USAGE_ALERT_EXCEPTION = [{ kind: 'espace_a_risque', method: 'checkWorkspacesAtRisk' }]

/** Ce qui désigne un SIGNAL D'USAGE d'un espace : la santé (#1652), ses axes
 *  d'usage, et le flux comportemental (neuf natures + session, deux casses). */
const USAGE_SIGNAL_MARKERS = [
  'ClientHealth',
  'churnRisk',
  'lastActivityAt',
  'activeMembers',
  'featuresUsed',
  'workspaceRiskAlert',
  ...BEHAVIORAL_EVENT_NAMES,
  BEHAVIORAL_COLUMN,
  camelCased(BEHAVIORAL_COLUMN),
]

/** Ce qui désigne une PERSONNE dans une alerte. */
const PERSONAL_MARKERS = ['ownerEmail', 'ownerUserId', 'actorEmail', 'email']

/** Retire les commentaires : un docblock qui RACONTE l'exception n'est pas du code. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}

/** Les membres d'une classe (indentation de deux espaces), avec leur corps. */
function classMethods(source: string): { name: string; body: string }[] {
  const code = withoutComments(source)
  const headers = [...code.matchAll(/\n {2}(?:private |public |protected )?(?:async )?([A-Za-z_][A-Za-z0-9_]*)\(/g)]
  return headers.map((header, index) => ({
    name: header[1] as string,
    body: code.slice(header.index, headers[index + 1]?.index ?? code.length),
  }))
}

/** Les alertes d'une source qui lisent un signal d'usage : (kind, méthode). */
function usageAlertsIn(source: string): { kind: string; method: string }[] {
  const found: { kind: string; method: string }[] = []
  for (const { name, body } of classMethods(source)) {
    if (!USAGE_SIGNAL_MARKERS.some(marker => body.includes(marker))) continue
    for (const match of body.matchAll(/dispatch\.dispatch\(\{\s*kind:\s*'([a-z_]+)'/g)) {
      found.push({ kind: match[1] as string, method: name })
    }
  }
  return found
}

function personalMarkersIn(source: string): string[] {
  const code = withoutComments(source)
  return PERSONAL_MARKERS.filter(marker => code.includes(marker))
}

describe('GA-266 (suite) — #1946.22 : une seule alerte par espace nommé lit un signal d’usage, et elle est nommée', () => {
  const corpus = readdirSync(ALERTS)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .map(file => ({ file, source: readFileSync(join(ALERTS, file), 'utf8') }))
  const service = corpus.find(entry => entry.file === 'backoffice-alerts.service.ts')?.source ?? ''
  const riskPhrase = corpus.find(entry => entry.file === 'workspace-risk-alert.ts')?.source ?? ''

  it('LIT quelque chose — le module, son passage, et l’exception elle-même', () => {
    expect(corpus.length).toBeGreaterThan(5)
    expect(service.length).toBeGreaterThan(5_000)
    expect(classMethods(service).map(m => m.name)).toEqual(
      expect.arrayContaining(['checkWorkspacesAtRisk', 'checkStripeChurn', 'checkManualEngagementChurn']),
    )
    expect(riskPhrase).toContain('export function workspaceRiskAlert')
  })

  it('l’UNIQUE alerte du module qui lit un signal d’usage est l’exception nommée', () => {
    const found = corpus.flatMap(entry => usageAlertsIn(entry.source))
    expect(found).toEqual(USAGE_ALERT_EXCEPTION)
  })

  it('la lecture de santé des espaces n’est consommée QUE par l’exception', () => {
    const readers = classMethods(service)
      .filter(method => method.name !== 'constructor' && method.body.includes('this.readClientHealth'))
      .map(method => method.name)
    expect(readers).toEqual(['checkWorkspacesAtRisk'])
  })

  it('l’exception ne porte AUCUNE donnée de personne — ni sa méthode, ni sa phrase', () => {
    const method = classMethods(service).find(m => m.name === 'checkWorkspacesAtRisk')
    expect(method).toBeDefined()
    expect(personalMarkersIn(method?.body ?? '')).toEqual([])
    expect(personalMarkersIn(riskPhrase)).toEqual([])
  })

  it('sait dire NON — une DEUXIÈME alerte d’espace nommé sur la santé est reprochée', () => {
    const fautif = `export class X {
  private async checkWorkspacesAtRisk(): Promise<void> {
    const report = await this.readClientHealth(new Date())
    await this.dispatch.dispatch({ kind: 'espace_a_risque', subject: 'w', title: 'n', detail: '', resolved: false })
  }

  private async checkDecrochage(): Promise<void> {
    const report = await this.readClientHealth(new Date())
    for (const row of report.rows) if (row.health.churnRisk) await this.dispatch.dispatch({ kind: 'decrochage_client', subject: row.workspaceId, title: row.name, detail: '', resolved: false })
  }
}`
    expect(usageAlertsIn(fautif)).toEqual([
      { kind: 'espace_a_risque', method: 'checkWorkspacesAtRisk' },
      { kind: 'decrochage_client', method: 'checkDecrochage' },
    ])
  })

  it('sait dire NON — une alerte qui lirait le FLUX COMPORTEMENTAL d’un espace est reprochée', () => {
    const fautif = `export class X {
  private async checkAbandon(): Promise<void> {
    const rows = await this.dataSource.query("SELECT COUNT(*) FROM product_events WHERE event_name = 'screen_left' AND workspace_id = $1", [id])
    await this.dispatch.dispatch({ kind: 'abandon_ecran', subject: id, title: 'x', detail: '', resolved: false })
  }
}`
    expect(usageAlertsIn(fautif)).toEqual([{ kind: 'abandon_ecran', method: 'checkAbandon' }])
  })

  it('sait dire NON — une adresse glissée dans l’exception est reprochée', () => {
    expect(personalMarkersIn('title: `${row.name} — ${row.ownerEmail}`')).toEqual(['ownerEmail'])
    expect(personalMarkersIn('detail: `contact : ${member.email}`')).toEqual(['email'])
    expect(personalMarkersIn('subject: row.ownerUserId')).toEqual(['ownerUserId'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — le churn CONTRACTUEL (Stripe, facture) reste permis', () => {
    // Le témoin du cas légitime voisin : `billingHealth` n'est pas une santé
    // d'usage, et « churn » n'est pas `churnRisk`.
    const legitime = `export class X {
  private async checkManualEngagementChurn(): Promise<void> {
    const health = billingHealth(terms, invoices, today)
    if (health.alerts.some(a => a.kind === 'commitment_ended_unrenewed')) await this.dispatch.dispatch({ kind: 'churn_client', subject: id, title: 'x', detail: '', resolved: false })
  }
}`
    expect(usageAlertsIn(legitime)).toEqual([])
    const reel = usageAlertsIn(service).map(entry => entry.method)
    expect(reel).not.toContain('checkStripeChurn')
    expect(reel).not.toContain('checkManualEngagementChurn')
  })

  it('n’attrape pas ce qu’elle ne vise pas — un docblock qui RACONTE la santé n’est pas une lecture', () => {
    const commente = `export class X {
  /** Ne lit JAMAIS ClientHealth ni churnRisk ici. */
  private async checkJobBloque(): Promise<void> {
    await this.dispatch.dispatch({ kind: 'job_bloque', subject: 'analysis_worker', title: 'x', detail: '', resolved: false })
  }
}`
    expect(usageAlertsIn(commente)).toEqual([])
  })
})
