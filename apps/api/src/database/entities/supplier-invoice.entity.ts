import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une facture ENTRANTE d'un sous-traitant (30/08/2026) — distincte de
 * `InvoiceReadinessEntity`, qui porte la facturation CLIENT.
 *
 * Table à part, comme `mission_commercial_terms` et `mission_expenses` :
 * réservée à `finance:read` / `finance:write`, une donnée dont l'accès
 * diffère du reste de la fiche se protège mal quand elle vit dans la même
 * ligne.
 */
@Entity({ name: 'supplier_invoices' })
@Index(['mission_id', 'invoice_date'])
export class SupplierInvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  mission_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** La référence PORTÉE PAR la facture du sous-traitant. */
  @Column('text')
  reference: string

  /** Centimes, toujours strictement positif — la contrainte SQL le garantit. */
  @Column('bigint')
  amount_cents: string | number

  @Column('date')
  invoice_date: string

  /** `pending` | `validated` | `paid` | `disputed` — son PROPRE cycle de vie,
   *  distinct de celui de `invoice_readiness`. */
  @Column('text', { default: 'pending' })
  status: string

  /** Qui l'a SAISIE — immuable, posé à la création. */
  @Column('uuid')
  entered_by: string

  /** `human` | `connector` | `pipeline` | `model` — le vocabulaire de
   *  `FIELD_SOURCES` (@bellum/contracts), pas un second axe inventé. */
  @Column('text', { default: 'human' })
  source: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
