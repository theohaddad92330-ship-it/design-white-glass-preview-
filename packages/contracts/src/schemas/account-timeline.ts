import { z } from 'zod'

/**
 * La timeline unifiée d'un compte — ce qui s'est réellement passé, dans l'ordre.
 *
 * Elle FUSIONNE trois tables déjà écrites ailleurs (actions journalisées,
 * mouvements d'opportunité, exécutions de workflow) et n'en crée aucune. C'est
 * la vue qu'on ouvre avant un rendez-vous : « qu'est-ce qu'on a déjà fait sur ce
 * compte, et quand ».
 *
 * ⚠️ Le type vivait dans le service de l'API, en local, et l'écran n'existait
 * pas. Le remonter ici avant de brancher l'écran évite la famille de défauts la
 * plus discrète du dépôt : deux types homonymes de part et d'autre du fil, qui
 * compilent tous les deux et divergent au premier champ ajouté.
 */

/** La nature d'un événement — l'écran en dérive son icône et sa couleur. */
export const TIMELINE_EVENT_KINDS = ['action', 'opportunity', 'workflow'] as const
export const timelineEventKindSchema = z.enum(TIMELINE_EVENT_KINDS)
export type TimelineEventKind = z.infer<typeof timelineEventKindSchema>

export const timelineEventSchema = z.object({
  id: z.string(),
  kind: timelineEventKindSchema,
  /** Horodatage réel. Jamais inventé : sans date, l'événement est écarté. */
  at: z.string(),
  /** Libellé court, prêt à afficher. */
  label: z.string(),
  /**
   * #3416.4b — le libellé ANGLAIS, quand le journal l'a stocké (`metadata.label_en`).
   * Absent sinon : l'écran retombe sur `label`, jamais sur un libellé vide.
   */
  labelEn: z.string().optional(),
  /** Détail optionnel — le contenu, la raison, le résultat. */
  detail: z.string().nullable(),
  /** Sous-type machine (`message_sent`, `signal`, `done`…) que l'écran traduit. */
  type: z.string(),
  contactId: z.string().nullable(),
  /** #3532 — le compteur d'étapes d'une exécution, structuré. Absent sans étape. */
  steps: z.object({ done: z.number().int(), total: z.number().int() }).nullable().optional(),
  /**
   * #2117.24 — la TRANSITION d'un changement de statut commercial, en valeurs
   * machine (`watching` → `archived`) que l'écran traduit. Absente pour tout
   * autre événement ; `from` vaut `null` quand le statut d'avant n'était pas
   * renseigné (ligne antérieure à la colonne).
   */
  transition: z.object({ from: z.string().nullable(), to: z.string() }).nullable().optional(),
})
export type TimelineEvent = z.infer<typeof timelineEventSchema>

export const accountTimelineSchema = z.object({ events: z.array(timelineEventSchema) })
export type AccountTimeline = z.infer<typeof accountTimelineSchema>
