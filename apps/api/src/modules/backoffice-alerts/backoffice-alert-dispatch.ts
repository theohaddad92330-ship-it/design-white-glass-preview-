/**
 * #1676.1 — le dispatcheur d'alertes du back-office : ce qui est PUR, séparé de
 * ce qui parle à Redis ou au réseau (`backoffice-alert-dispatch.service.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT, ET CE QUE CE FICHIER AJOUTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `CostAlertService`, `ObservabilityAlertsService` et `StatusMonitorService`
 * calculent déjà des seuils et partent en `logger.error` → Sentry. Aucun des
 * trois n'envoie d'e-mail ni de message Slack : Sentry alerte l'exploitant qui
 * regarde Sentry, pas l'équipe qui regarde sa boîte mail à 3 h du matin. Ce
 * fichier — et son service — sont le chemin qui manquait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES HUIT DÉCLENCHEURS DE L'ISSUE #1676, NOMMÉS ICI MÊME QUAND NON CÂBLÉS
 * ─────────────────────────────────────────────────────────────────────────────
 * Un registre incomplet serait pire qu'absent : le jour où quelqu'un câble
 * « nouveau client », la question « quel canal ? » doit avoir une réponse écrite
 * une fois, pas être redevinée. Voir `ALERT_KIND_CHANNEL` plus bas — CE LOT
 * câble réellement `connexion_anormale`, `taux_echec_analyse` et
 * `cout_quotidien` (voir `backoffice-alerts.controller.ts`) ; les cinq autres
 * ont leur nom, leur canal, et zéro appelant — nommés dans le rapport de lot.
 */

import { WORKSPACE_RISK_ALERT_WINDOW_MS } from './workspace-risk-alert'

/**
 * Les huit alertes de l'issue #1676, dans son propre vocabulaire — plus
 * `espace_a_risque` (#1946.22, décision Louis 13/09 batch 12), la SEULE alerte
 * par espace nommé qui lise un signal d'usage (voir `workspace-risk-alert.ts`).
 */
export type AlertKind =
  | 'api_indisponible'
  | 'taux_echec_analyse'
  | 'job_bloque'
  | 'cout_quotidien'
  | 'connexion_anormale'
  | 'nouveau_client'
  | 'churn_client'
  | 'rapport_hebdomadaire'
  | 'espace_a_risque'
  // #2528.3 — décision Louis 17/09 14:32 : une source à court de crédits
  // (402 / 429 quota, moteur IA comme API) devient un e-mail URGENT, pas une
  // ligne de log qu'un opérateur découvre trois jours plus tard.
  | 'provider_credits_exhausted'
  // #2707.1 — Théo (22/09) : « une notification simple par e-mail à mon
  // attention lorsqu'un nouveau prospect accède à la démo ». Un FAIT ponctuel
  // (la CRÉATION d'un `demo_leads`, jamais sa mise à jour) déclenché depuis
  // `DemoController` — voir `demo-lead.service.ts` pour la déduplication par
  // e-mail qui décide « nouveau » une fois pour toutes.
  | 'nouveau_prospect_demo'
  // #3698.6 — « prévenir l'équipe responsable » d'une panne d'enrichissement
  // (clé refusée, quota ou budget Bellum épuisé, fournisseur en erreur). Le
  // commercial, lui, reçoit une phrase sobre sans fournisseur ; l'équipe
  // reçoit CE message, sur le canal des incidents techniques.
  | 'enrichissement_indisponible'
  // #4035.3 — la salle démo ne se re-sème plus / aucune salle fraîche : le 11/10, ~8 h de « Préparation de ta
  // démo… » sans fin, que seul le journal disait.
  | 'salle_demo_indisponible'
  // SIG-C (11/10) — un fournisseur de données EN ERREUR sur N appels consécutifs
  // (compteur côté IA, remis à zéro au premier succès) : une source morte
  // n'est plus invisible. Zéro résultat n'est pas une erreur.
  | 'source_muette'
  // #4694 — l'adresse sortante observée n'est plus dans la liste déclarée à BoondManager : toutes les requêtes Boond de
  // tous les clients sont refusées d'un coup, sans que le journal dise pourquoi.
  | 'ip_sortante_changee'

/**
 * « CANAUX — Email : le rapport hebdomadaire, les alertes de sécurité. Slack :
 * les incidents techniques, si un webhook est configuré. »
 *
 * `email-only` ignore la config Slack — même un webhook présent n'y change
 * rien : une alerte de sécurité reste un e-mail, jamais un message dans un
 * canal d'équipe que d'autres yeux peuvent lire.
 * `slack-preferred` bascule sur Slack SI un webhook est configuré, sinon part
 * par e-mail — « sans webhook, tout part par e-mail. Jamais de perte. »
 */
export const ALERT_KIND_CHANNEL: Record<AlertKind, 'email-only' | 'slack-preferred'> = {
  api_indisponible: 'slack-preferred',
  taux_echec_analyse: 'slack-preferred',
  job_bloque: 'slack-preferred',
  cout_quotidien: 'slack-preferred',
  connexion_anormale: 'email-only',
  nouveau_client: 'slack-preferred',
  churn_client: 'slack-preferred',
  rapport_hebdomadaire: 'email-only',
  // #1946.22 — la même règle qu'un churn client : un fait sur un ESPACE, jamais
  // sur une personne, qui n'a pas la sensibilité d'une alerte de sécurité.
  espace_a_risque: 'slack-preferred',
  // #2528.3 — un canal OPÉRATEUR nommé (jamais Slack, où d'autres yeux
  // pourraient lire un identifiant de fournisseur) : voir le docblock de
  // `provider_credits_exhausted` plus bas.
  provider_credits_exhausted: 'email-only',
  // #2707.1 — Théo l'a demandé explicitement PAR E-MAIL, pas « sur Slack si
  // possible » : `email-only` ignore la config Slack, comme
  // `connexion_anormale`.
  nouveau_prospect_demo: 'email-only',
  // #3698.6 — un incident technique : Slack si un webhook est posé, sinon
  // e-mail (« sans webhook, tout part par e-mail. Jamais de perte. »).
  enrichissement_indisponible: 'slack-preferred',
  // #4035.3 — un incident technique, Slack si un webhook est posé, sinon e-mail.
  salle_demo_indisponible: 'slack-preferred',
  // SIG-C — le fournisseur y est nommé (sa clé d'env) : canal OPÉRATEUR seul,
  // comme `provider_credits_exhausted`, jamais un canal d'équipe.
  source_muette: 'email-only',
  // #4694 — un incident technique d'exploitation (des adresses, pas un secret) : Slack si un webhook est posé, sinon e-mail.
  ip_sortante_changee: 'slack-preferred',
}

export type AlertChannel = 'email' | 'slack'

/** La règle du canal, appliquée. Pure : rien à mocker pour la tester. */
export function resolveChannel(kind: AlertKind, slackConfigured: boolean): AlertChannel {
  if (ALERT_KIND_CHANNEL[kind] === 'email-only') return 'email'
  return slackConfigured ? 'slack' : 'email'
}

/** « Une alerte ne se répète pas avant 1 h sur le même sujet. » */
export const ANTI_REPEAT_MS = 60 * 60 * 1000

/**
 * #1946.22 — les alertes dont la fenêtre anti-répétition n'est PAS l'heure
 * commune. Une seule : « espace à risque » ne harcèle pas, une fois par semaine
 * au plus. La valeur se LIT dans `workspace-risk-alert.ts`, jamais recopiée.
 */
const ALERT_KIND_ANTI_REPEAT_MS: Partial<Record<AlertKind, number>> = {
  espace_a_risque: WORKSPACE_RISK_ALERT_WINDOW_MS,
  // #2528.3 — « une alerte par source et par fenêtre » : 6 h. Plus court que
  // l'heure commune parce qu'une source à court de crédits dégrade TOUT le
  // monde tant qu'elle n'est pas rechargée ; plus long qu'à chaque requête,
  // pour ne jamais spammer sur un flux continu de 402.
  provider_credits_exhausted: 6 * 60 * 60 * 1000,
  // #3698.6 — une panne qui dure ne harcèle pas : une alerte par cause et par 6 h,
  // alors que chaque clic d'un commercial déclenche l'appel qui la constate.
  enrichissement_indisponible: 6 * 60 * 60 * 1000,
  // SIG-C — une source muette le reste souvent des heures : une alerte par 6 h.
  source_muette: 6 * 60 * 60 * 1000,
}

/** La fenêtre anti-répétition d'une alerte — l'heure commune, sauf exception nommée. */
export function antiRepeatMsFor(kind: AlertKind): number {
  return ALERT_KIND_ANTI_REPEAT_MS[kind] ?? ANTI_REPEAT_MS
}

export type AlertPersistedState = {
  state: 'firing' | 'resolved'
  /** ISO — le dernier envoi RÉEL (pas la dernière évaluation). */
  lastSentAt: string
}

type AlertAction =
  | { action: 'send'; reason: 'first_time' | 'still_firing_after_window' }
  | { action: 'resolve'; reason: 'transition_to_resolved' }
  | { action: 'skip'; reason: 'deduped' | 'already_resolved_or_never_fired' }

/**
 * La décision d'envoi — dédupliquée, avec message de résolution.
 *
 * ⚠️ Une RÉSOLUTION n'est JAMAIS dédupliquée par la fenêtre d'1 h : c'est une
 * TRANSITION (l'alerte cesse), pas une répétition du même fait. La retarder
 * d'une heure ferait annoncer « toujours en panne » alors que c'est réparé.
 */
export function decideAlertAction(params: {
  existing: AlertPersistedState | null
  resolved: boolean
  now: Date
  /** La fenêtre de l'alerte — `antiRepeatMsFor(kind)`. Absente = l'heure commune. */
  antiRepeatMs?: number
}): AlertAction {
  const { existing, resolved, now } = params
  const antiRepeatMs = params.antiRepeatMs ?? ANTI_REPEAT_MS

  if (resolved) {
    if (existing?.state === 'firing') return { action: 'resolve', reason: 'transition_to_resolved' }
    return { action: 'skip', reason: 'already_resolved_or_never_fired' }
  }

  if (!existing || existing.state === 'resolved') {
    return { action: 'send', reason: 'first_time' }
  }

  const elapsedMs = now.getTime() - new Date(existing.lastSentAt).getTime()
  if (elapsedMs < antiRepeatMs) {
    return { action: 'skip', reason: 'deduped' }
  }
  return { action: 'send', reason: 'still_firing_after_window' }
}

/** Un titre lisible par famille — ce qu'un humain lit en objet d'e-mail / première ligne Slack. */
export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  api_indisponible: 'API ou worker indisponible',
  taux_echec_analyse: "Taux d'échec d'analyse",
  job_bloque: 'Job bloqué',
  cout_quotidien: 'Coût quotidien anormal',
  connexion_anormale: 'Connexion manager anormale',
  nouveau_client: 'Nouveau client',
  churn_client: "Churn d'un client",
  rapport_hebdomadaire: 'Rapport hebdomadaire',
  espace_a_risque: 'Espace client à risque',
  provider_credits_exhausted: 'Source à court de crédits',
  nouveau_prospect_demo: 'Nouveau prospect démo',
  enrichissement_indisponible: 'Enrichissement indisponible',
  salle_demo_indisponible: 'Salle de démonstration indisponible',
  source_muette: 'Source muette',
  ip_sortante_changee: 'IP sortante changée',
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

type RenderedAlert = { subject: string; text: string; html: string }

/**
 * Le message — même contenu pour l'e-mail et pour Slack (Slack ne lit que
 * `text`), pour qu'un opérateur qui reçoit l'un après avoir vu l'autre
 * reconnaisse la même alerte.
 */
export function renderAlert(input: {
  kind: AlertKind
  title: string
  detail: string
  resolved: boolean
}): RenderedAlert {
  const label = ALERT_KIND_LABEL[input.kind]
  const resolvedPrefix = input.resolved ? '[RÉSOLU] ' : ''
  // #2528.3 — « l'objet commence par URGENT — » : Louis lit sa boîte, pas
  // Sentry, à 3 h du matin sur CETTE alerte précisément (une source à court de
  // crédits dégrade tout le monde tant qu'elle n'est pas rechargée). Jamais sur
  // une résolution : « URGENT — [RÉSOLU] » se contredirait lui-même.
  const urgentPrefix = input.kind === 'provider_credits_exhausted' && !input.resolved ? 'URGENT — ' : ''
  const prefix = `${urgentPrefix}${resolvedPrefix}`
  const subject = `${prefix}BellumAI — ${label} : ${input.title}`
  const text = input.resolved ? `${label} — résolu.\n\n${input.detail}` : `${label}\n\n${input.title}\n${input.detail}`
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;font-size:15px;line-height:1.6;max-width:600px">
    <p style="margin:0 0 8px;font-weight:600">${escapeHtml(prefix)}${escapeHtml(label)}</p>
    <p style="margin:0 0 4px">${escapeHtml(input.title)}</p>
    <p style="margin:0;color:#444">${escapeHtml(input.detail)}</p>
  </div>`
  return { subject, text, html }
}

/**
 * #2528.3 — les porteurs du rôle `owner` lus dans `DM_ALLOWED_EMAILS`, pour les
 * ajouter aux destinataires de `provider_credits_exhausted` SANS dupliquer le
 * format qui vit dans `apps/dashboard-manager/src/lib/roles.ts` (le format,
 * pas le module — cette app-là est un service Next.js séparé, hors d'atteinte
 * d'un import cross-app). Même règles, lues ici sur la MÊME variable
 * d'environnement : une entrée sans suffixe `:role` n'est PAS `owner` (elle
 * vaut `operator` côté back-office), et un rôle illisible n'est pas deviné en
 * `owner` non plus — les deux se traduisent en « ne compte pas comme owner »
 * ici, ce qui est le côté prudent pour une alerte de facturation urgente.
 */
export function ownerEmailsFromDmAllowedEmails(raw: string | undefined): string[] {
  if (!raw) return []
  const owners: string[] = []
  for (const entry of raw.split(',')) {
    const [emailRaw = '', roleRaw = ''] = entry.split(':')
    const email = emailRaw.trim().toLowerCase()
    if (!email.includes('@')) continue
    if (roleRaw.trim().toLowerCase() === 'owner') owners.push(email)
  }
  return owners
}

/** Fusionne deux listes d'adresses en dédupliquant (insensible à la casse),
 *  en gardant l'ordre : `base` d'abord, puis les entrées de `extra` absentes. */
export function mergeEmailRecipients(base: readonly string[], extra: readonly string[]): string[] {
  const seen = new Set(base.map(e => e.trim().toLowerCase()))
  const merged = [...base]
  for (const email of extra) {
    const key = email.trim().toLowerCase()
    if (!key.includes('@') || seen.has(key)) continue
    seen.add(key)
    merged.push(email)
  }
  return merged
}

/**
 * #2528.3 — le titre + le corps de l'alerte « source à court de crédits ».
 * Pure, pour rester testable sans horloge réelle ni service : `sinceIso` est
 * DÉJÀ résolu par l'appelant (le moteur IA / l'API connaît l'instant du
 * premier 402 de la fenêtre, cette fonction ne le devine pas).
 *
 * ``degraded`` dit ce qui manque pour l'UTILISATEUR, en clair, sans jamais
 * nommer le fournisseur à SA place (règle « nos fournisseurs ne se nomment
 * jamais », `tool-naming.ts`) — seul l'OPÉRATEUR, ici, voit `source` (une clé
 * d'env, ``BRAVE_API_KEY``), parce que c'est un canal opérateur où nommer la
 * source est nécessaire pour agir (cf. brief #2528, point 3).
 */
export function providerCreditsExhaustedAlert(
  source: string,
  sinceIso: string,
  degraded: string,
  resolved = false,
): { title: string; detail: string } {
  const since = new Date(sinceIso)
  const sinceLabel = Number.isNaN(since.getTime())
    ? sinceIso
    : since.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
  return {
    title: source,
    detail:
      `${source} n'a plus de crédits depuis ${sinceLabel}. ` +
      `${degraded} ` +
      `Geste à faire : recharger le crédit ou changer la clé (variable d'environnement ${source}).`,
  }
}

/**
 * Le geste suit la cause : 401/403 → la clé, 402 → le crédit, 429 → le quota, le reste
 * (5xx, timeout) → le service.
 *
 * ALERTES-402 (30/10/2026) — le 402 tombait dans le cas par défaut : le mail du 28/10 pour
 * THEIRSTACK_API_KEY disait « vérifier l'état du service » alors que la source était à sec.
 * Un 402 ne se répare pas en attendant.
 */
function silentGesture(lastReason: string): string {
  if (/\b40[13]\b/.test(lastReason)) return 'vérifier la clé'
  if (/\b402\b/.test(lastReason)) return 'recharger le crédit'
  if (/\b429\b/.test(lastReason)) return 'vérifier le quota'
  return "vérifier l'état du service"
}

/**
 * SIG-C (11/10) — le titre + le corps de l'alerte « source muette ». Pure :
 * `sinceIso` (début de la série d'erreurs) et le compteur viennent de l'IA.
 * Même règle que `providerCreditsExhaustedAlert` : seul l'OPÉRATEUR lit
 * `source` (une clé d'env) ; `degraded` dit ce qui manque, sans fournisseur.
 */
export function providerSilentAlert(
  source: string,
  sinceIso: string,
  consecutiveErrors: number,
  lastReason: string,
  degraded: string,
  resolved = false,
): { title: string; detail: string } {
  const since = new Date(sinceIso)
  const sinceLabel = Number.isNaN(since.getTime())
    ? sinceIso
    : since.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
  if (resolved) {
    return {
      title: source,
      detail:
        `${source} répond de nouveau. La panne avait commencé le ${sinceLabel} : ` +
        `${consecutiveErrors} appels échoués consécutifs avant le retour à la normale.`,
    }
  }
  return {
    title: source,
    detail:
      `${source} est en erreur sur ${consecutiveErrors} appels consécutifs depuis ${sinceLabel} ` +
      `(dernière cause : ${lastReason}). ${degraded} ` +
      `Geste à faire : ${silentGesture(lastReason)} (variable d'environnement ${source}).`,
  }
}

/**
 * ALERTES-402 (30/10/2026) — « source CONFIGURÉE mais jamais appelée depuis N jours ».
 *
 * L'alerte « muette » compte des erreurs consécutives : elle ne voit RIEN d'une source que le cache
 * rend inutile. TheirStack est resté à sec (402) du 28 au 30/10 et Découvrir a continué à servir du
 * cache 30 j et du stock : aucune erreur, aucun trou visible, personne pour recharger. Le silence est
 * donc une alerte à part entière — même canal opérateur (une clé d'environnement), autre question.
 *
 * `resolved` n'existe pas ici : le retour d'une source se dit par le premier appel (« muette »
 * résolue) ou se lit au journal `COMPETENCE-TROUVE … payé=oui`, jamais par une absence d'absence.
 */
export function providerUnusedAlert(
  source: string,
  lastCallIso: string,
  days: number,
  degraded: string,
): { title: string; detail: string } {
  const last = new Date(lastCallIso)
  const lastLabel = Number.isNaN(last.getTime())
    ? lastCallIso
    : last.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
  return {
    title: source,
    detail:
      `${source} est configurée mais n’a plus été APPELÉE depuis ${days} jour(s) ` +
      `(dernier appel le ${lastLabel}). ${degraded} ` +
      `Geste à faire : vérifier que la source sert encore — un cache peut la remplacer sans erreur ` +
      `(variable d'environnement ${source}).`,
  }
}

/** Ce que l'équipe lit, par cause — le geste à faire, pas la phrase du commercial. */
const ENRICHMENT_OUTAGE_GESTURE: Record<string, string> = {
  missing_api_key: "Aucune clé d'enrichissement n'est posée sur l'API : vérifier les variables d'environnement.",
  unauthorized: "La clé d'enrichissement est refusée : la remplacer ou la réactiver.",
  quota_exceeded: "Le quota ou le budget d'enrichissement de Bellum est épuisé : recharger ou relever le plafond.",
  upstream_error: "Le service d'enrichissement répond en erreur : surveiller, relancer plus tard.",
  network_error: "Le service d'enrichissement est injoignable depuis l'API : vérifier le réseau et l'état du service.",
}

/**
 * #3698.6 — le titre et le corps de l'alerte « enrichissement indisponible ».
 * Canal OPÉRATEUR : la cause est dite en clair pour qu'on puisse agir. Le
 * commercial, lui, n'en voit jamais rien (`enrichErrorDescription`, côté web)
 * et son crédit n'a pas été débité — c'est écrit ici pour que l'équipe ne
 * cherche pas un défaut de paiement du client.
 */
export function enrichmentOutageAlert(reason: string): { title: string; detail: string } {
  const gesture = ENRICHMENT_OUTAGE_GESTURE[reason] ?? 'Cause non classée : consulter les journaux de l’API.'
  return {
    title: reason,
    detail:
      `Un enrichissement de contact a échoué côté service (cause : ${reason}). ` +
      `${gesture} ` +
      "Aucun crédit n'a été débité au client : ce n'est pas un défaut de paiement de sa part.",
  }
}
