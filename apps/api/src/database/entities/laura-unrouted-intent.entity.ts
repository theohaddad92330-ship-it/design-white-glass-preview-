import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #1949.23 — décision Louis 13/09 batch 12 : UNE demande que Laura n'a pas su
 * router, gardée ANONYMEMENT (règle 2 de `c64_analytique_produit` levée pour ce
 * seul usage, relecture juridique RGPD toujours due).
 *
 * ⚠️ AUCUNE colonne d'identité — ni utilisateur, ni espace — et aucune heure :
 * c'est ce qui rend l'effacement de compte (art. 17) et l'export (art. 15/20)
 * sans objet ici. `workspace_day_hash` n'est pas un identifiant : un hash
 * d'(espace, jour) tourné à 24 h, qui ne sert qu'à compter des occurrences
 * DISTINCTES pour le plancher de lecture.
 *
 * Migration `1792800190000-LauraUnroutedIntents`. Écrite par
 * `LauraUnroutedIntentsService.record`, purgée à 90 jours par
 * `PrivacyRetentionService.sweepLauraUnroutedIntents`.
 */
@Entity({ name: 'laura_unrouted_intents' })
@Index('laura_unrouted_intents_occurred_on_idx', ['occurred_on'])
@Index('laura_unrouted_intents_text_normalized_idx', ['text_normalized'])
export class LauraUnroutedIntentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** Le JOUR (UTC) de la demande, `AAAA-MM-JJ`. Jamais une heure. */
  @Column('date')
  occurred_on: string

  /** La NATURE de l'écran (`LAURA_CONTEXT_KINDS`) ou `chat` — jamais son titre. */
  @Column('text')
  surface: string

  /** `fr` | `en`, `null` quand le navigateur ne l'a pas déclarée. */
  @Column('text', { nullable: true })
  language: 'fr' | 'en' | null

  /** `hors_perimetre` | `capacite_absente` | `intention_incomprise`. */
  @Column('text')
  category: string

  /** Le texte de la demande, MASQUÉ par le moteur IA, 300 caractères au plus. */
  @Column('text')
  text_masked: string

  /** La clé de regroupement (`normalizeUnroutedText`). */
  @Column('text')
  text_normalized: string

  /** Hash d'(espace, jour) tourné à 24 h — jamais un identifiant d'espace. */
  @Column('text')
  workspace_day_hash: string
}
