import { SAVED_VIEW_ALERT_CHANNELS, type SavedViewAlertChannel, type SavedViewAlertFrequency } from './governance.js'

/**
 * L'ENVOI des alertes de Découvrir — les trois questions qui décident, chacune
 * à UN seul endroit (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une recherche enregistrée de Découvrir porte depuis le 15/09/2026 une CADENCE
 * (`alert_frequency`) et un CANAL (`alert_channel`). Personne ne les lisait :
 * `last_run_at` n'avait aucun écrivain de production — du code juste que
 * personne n'appelle, le défaut n°1 du dépôt. Brancher l'émetteur demande de
 * répondre à trois questions, et chacune s'était déjà fait rater ailleurs :
 *
 *  1. **Ce canal SORT-il de l'application ?** `in_app` n'envoie rien : il
 *     dépose une notification dans l'application, que l'utilisateur va
 *     chercher. `email` et `sms` atteignent quelqu'un là où il est. Confondre
 *     les deux revient à faire relever d'un arrêt de dépôt un geste qui n'en
 *     relève pas — et, dans l'autre sens, à laisser partir un envoi réel sous
 *     couvert d'« affichage ».
 *
 *  2. **Le consentement est-il DÉMONTRABLE ?** Voir {@link isQualifiedOutboundConsent}.
 *
 *  3. **Le périmètre est-il DÛ ?** Voir {@link isDiscoverAlertDue}.
 *
 * Ces trois prédicats vivent ici, en contrat partagé, et non dans le service
 * qui envoie : le lot qui balaiera les préférences héritées (`weekly_digest`)
 * pose la MÊME question n°2. Deux réponses à la même question divergent.
 */

/**
 * Les canaux d'alerte qui QUITTENT l'application.
 *
 * ⚠️ Dérivé de `SAVED_VIEW_ALERT_CHANNELS` par SOUSTRACTION de `in_app`, et non
 * recopié : un canal ajouté demain à la colonne se retrouve ici par défaut,
 * c'est-à-dire du côté PRUDENT. Une liste recopiée aurait laissé le nouveau
 * canal hors de toute garde, en silence.
 */
export const DISCOVER_ALERT_OUTBOUND_CHANNELS = SAVED_VIEW_ALERT_CHANNELS.filter(
  channel => channel !== 'in_app',
) as ReadonlyArray<Exclude<SavedViewAlertChannel, 'in_app'>>

export type DiscoverAlertOutboundChannel = (typeof DISCOVER_ALERT_OUTBOUND_CHANNELS)[number]

/** Ce canal atteint-il quelqu'un hors de l'application ? */
export function isOutboundAlertChannel(channel: string | null | undefined): channel is DiscoverAlertOutboundChannel {
  if (!channel) return false
  return (DISCOVER_ALERT_OUTBOUND_CHANNELS as ReadonlyArray<string>).includes(channel)
}

/**
 * LE CRITÈRE DE CONSENTEMENT — et il porte sur une DATE, jamais sur une case.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE FAIT QUI FONDE CETTE RÈGLE (mesuré le 15/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Il existe en base des lignes portant `weekly_digest = true` que personne n'a
 * jamais cochées : `changelog-newsletter.service.ts` insérait deux colonnes, et
 * Postgres remplissait le reste avec un `DEFAULT true`. La migration
 * `1792800260000-NotificationOutboundDefaultsOff` a corrigé le défaut pour les
 * lignes FUTURES et, à dessein, n'a réécrit aucune ligne existante.
 *
 * Conséquence : **`true` ne prouve rien.** Le dépôt sait dire qu'une case vaut
 * `true` ; il ne sait dire ni QUAND ni COMMENT elle y est passée. Un émetteur
 * qui lit la case envoie donc à des gens dont le consentement est SUPPOSÉ.
 *
 * D'où la forme : un consentement est qualifié quand il porte une **date
 * lisible et passée**. Une date ne s'écrit que sur le chemin d'un geste — un
 * `DEFAULT` de colonne n'en pose pas — et elle rend le consentement datable,
 * donc opposable. Le précédent existe déjà dans le dépôt : `consent_at` sur
 * `notification_sms_channels`, écrit au moment où quelqu'un coche lui-même.
 *
 * Une date À VENIR ne qualifie pas : personne n'a encore consenti, et une
 * horloge qui dérive ne doit pas ouvrir un envoi.
 */
export function isQualifiedOutboundConsent(
  consentAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (consentAt === null || consentAt === undefined) return false
  const parsed = consentAt instanceof Date ? consentAt : new Date(consentAt.trim())
  const time = parsed.getTime()
  if (Number.isNaN(time)) return false
  return time <= now.getTime()
}

/**
 * Depuis combien de temps une cadence doit avoir tourné pour être DUE.
 *
 * Les deux fenêtres reprennent, sans les redécider, celles déjà posées par les
 * digests de veille (`weekly-digest.service.ts`, `notifications.scheduler.ts`) :
 * six jours pour l'hebdomadaire, vingt heures pour le quotidien. Elles sont plus
 * courtes que la cadence nominale, parce qu'un tick de cron n'arrive jamais à la
 * seconde près — et plus longues que la moitié, pour qu'un tick en retard ne
 * produise jamais deux envois dans la même journée.
 */
export const DISCOVER_ALERT_DUE_AFTER_MS: Readonly<Record<Exclude<SavedViewAlertFrequency, 'manual'>, number>> = {
  daily: 20 * 60 * 60 * 1000,
  weekly: 6 * 24 * 60 * 60 * 1000,
}

/**
 * Ce périmètre doit-il se rejouer maintenant ?
 *
 * `manual` n'est JAMAIS dû — c'est le défaut, et une alerte ne s'allume pas
 * parce qu'on a enregistré un filtre. `null` (jamais rejoué) est dû.
 *
 * ⚠️ Une dernière exécution ILLISIBLE n'est pas « jamais rejoué » : retomber
 * sur « dû » enverrait une alerte sur une donnée qu'on n'a pas su lire. C'est
 * « non mesuré rendu 0 », appliqué à un envoi — la version qui coûte cher.
 */
export function isDiscoverAlertDue(
  frequency: SavedViewAlertFrequency,
  lastRunAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (frequency === 'manual') return false
  const window = DISCOVER_ALERT_DUE_AFTER_MS[frequency]
  if (lastRunAt === null || lastRunAt === undefined) return true
  const parsed = lastRunAt instanceof Date ? lastRunAt : new Date(lastRunAt)
  const time = parsed.getTime()
  if (Number.isNaN(time)) return false
  return now.getTime() - time >= window
}
