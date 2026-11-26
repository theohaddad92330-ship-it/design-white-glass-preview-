import type { ActionIntent } from './action-router.js'
import type { WorkflowDefinition } from './action-os.js'

/**
 * Les INTENTIONS concrètes d'un run — ce qui manquait pour que l'Action OS
 * démarre.
 *
 * ## Le défaut que ce module corrige
 *
 * `POST /action-os/runs` n'avait aucun appelant, et le contrôleur passait
 * `intents: {}`. Le planificateur bloque tout pas sans intention : TOUS les pas
 * étaient donc bloqués, `executableNow` vide, et le run enregistré « terminé »
 * sans qu'une seule requête parte. La fausse réussite était produite ici, avant
 * même qu'un appelant existe.
 *
 * ## Ce qu'un pas SANS cible devient
 *
 * Rien. Aucune intention n'est fabriquée quand la cible manque, et le pas reste
 * honnêtement bloqué avec « Aucune cible résolue pour ce pas ». C'est la seule
 * règle du module : **on ne devine pas une cible**. Envoyer un e-mail au premier
 * contact venu parce qu'aucun n'était choisi est exactement l'accident que
 * l'Action OS existe pour empêcher.
 *
 * ## Pourquoi ici et pas dans le service
 *
 * C'est une fonction PURE — même contexte, mêmes intentions — donc elle se teste
 * sans base, sans horloge et sans connecteur. Le service, lui, résout la cible ;
 * la traduction « pas de workflow → intention » n'a pas besoin de lui.
 */

/** Ce que l'appelant a réussi à RÉSOUDRE. Chaque champ absent bloque les pas qui en dépendent. */
export type WorkflowTarget = {
  /** Le compte visé, quand il y en a un. */
  readonly accountId?: string | null
  /** Son nom, pour les libellés — jamais inventé. */
  readonly accountName?: string | null
  /** Le contact visé. Sans lui, tout ce qui écrit à quelqu'un reste bloqué. */
  readonly contactId?: string | null
  /** Le CRM branché, quand il y en a un. */
  readonly crmProvider?: string | null
  /** Le moment de référence — paramètre, pour que la fonction reste pure. */
  readonly now: Date
}

/** Les fournisseurs CRM que `create_crm_task` accepte. */
const CRM_PROVIDERS = new Set(['hubspot', 'salesforce', 'pipedrive', 'attio'])

/** J+3 : le délai de relance des workflows du catalogue. */
const FOLLOW_UP_DAYS = 3

function inDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString()
}

/**
 * Traduit chaque pas d'un workflow en intention concrète.
 *
 * Rend un objet dont les clés sont les `step.key` — exactement la forme que
 * `RunContext.intents` attend. Un pas absent de l'objet est un pas SANS cible,
 * et le planificateur le dira.
 */
export function buildRunIntents(definition: WorkflowDefinition, target: WorkflowTarget): Record<string, ActionIntent> {
  const intents: Record<string, ActionIntent> = {}
  const label = target.accountName?.trim() || null
  const crm = (target.crmProvider ?? '').trim().toLowerCase()

  for (const step of definition.steps) {
    switch (step.intentType) {
      case 'enrich_contact':
        if (target.contactId) intents[step.key] = { type: 'enrich_contact', contactId: target.contactId }
        break

      case 'send_email':
        // Le corps n'est PAS fabriqué ici : le routeur envoie le brouillon relu
        // (`email_message`), jamais un texte inventé. On ne fournit que la cible.
        if (target.contactId) intents[step.key] = { type: 'send_email', contactId: target.contactId }
        break

      case 'create_crm_task':
        // Sans CRM branché, aucune intention : le pas sera bloqué « capacité non
        // connectée », ce qui appelle un geste précis. Fabriquer une intention
        // vers un CRM absent produirait un échec au lieu d'un empêchement.
        if (target.contactId && CRM_PROVIDERS.has(crm)) {
          intents[step.key] = {
            type: 'create_crm_task',
            contactId: target.contactId,
            crmProvider: crm as 'hubspot',
            note: step.intent,
            dueDate: inDays(target.now, FOLLOW_UP_DAYS),
          }
        }
        break

      case 'create_crm_note':
        if (target.contactId && CRM_PROVIDERS.has(crm)) {
          intents[step.key] = { type: 'create_crm_note', contactId: target.contactId, note: step.intent }
        }
        break

      case 'schedule_reminder':
        // Un rappel tient sur un contact OU un compte, jamais les deux : le
        // contrat le refuse, et choisir un contact au hasard sur un compte
        // reviendrait à désigner arbitrairement quelqu'un.
        if (target.contactId) {
          intents[step.key] = {
            type: 'schedule_reminder',
            contactId: target.contactId,
            at: inDays(target.now, FOLLOW_UP_DAYS),
            note: step.intent,
          }
        } else if (target.accountId) {
          intents[step.key] = {
            type: 'schedule_reminder',
            accountId: target.accountId,
            at: inDays(target.now, FOLLOW_UP_DAYS),
            note: step.intent,
          }
        }
        break

      case 'create_calendar_event':
        // Un TITRE est obligatoire, et il doit nommer quelque chose de vrai.
        // Sans nom de compte, on n'invente pas « Point commercial » : le pas
        // reste bloqué et l'utilisateur choisira sa cible.
        if (label) {
          intents[step.key] = {
            type: 'create_calendar_event',
            ...(target.accountId ? { accountId: target.accountId } : {}),
            ...(target.contactId ? { contactId: target.contactId } : {}),
            title: `${label} — ${step.intent}`,
            startsAt: inDays(target.now, FOLLOW_UP_DAYS),
            durationMinutes: 30,
            attendees: [],
          }
        }
        break

      case 'notify_user':
        // La seule intention qui n'a besoin d'aucune cible externe : Bellum se
        // notifie lui-même. Le lien reste interne — le contrat l'impose.
        intents[step.key] = {
          type: 'notify_user',
          title: label ? `${label} — ${definition.name.fr}` : definition.name.fr,
          body: step.intent,
          ...(target.accountId ? { link: `/accounts/${target.accountId}` } : {}),
        }
        break

      case 'snooze':
        // `snooze` reporte une action DÉJÀ journalisée : il n'y a rien à reporter
        // au lancement d'un run. Aucun workflow du catalogue ne l'utilise, et
        // lui fabriquer une cible reviendrait à inventer l'action reportée.
        break
    }
  }

  return intents
}

/*
 * `unresolvedSteps` a été RETIRÉ le 27/08/2026 — il faisait doublon.
 *
 * Il rendait « les pas qu'aucune cible ne permet de lancer », et son docblock
 * disait servir l'écran AVANT le clic. Un audit l'a signalé comme du code sans
 * appelant, à brancher. La vérification a montré l'inverse : son prédicat
 * (`!intents[step.key]`) est déjà celui de
 * `apps/api/src/modules/action-os/workflow-runner.service.ts:105`, qui pousse le
 * pas dans `blocked` AVEC son motif — et `POST /action-os/plan` est justement
 * l'appel d'avant le clic, qui rend ce `blocked` à l'écran.
 *
 * Le brancher aurait fait vivre la même dérivation à DEUX endroits, qui
 * divergent ensuite. Un code sans appelant se supprime aussi bien qu'il se
 * branche : la question n'est pas « comment l'appeler ? » mais « que dit-il que
 * personne d'autre ne dit ? ». Ici : rien.
 */
