import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'
import type { DemoLeadJobTitle } from '../../modules/demo/demo-lead'

/**
 * #2705 — le prospect capté par le formulaire obligatoire du lien de démo
 * public (Théo, 22/09/2026). N'appartient à AUCUN espace de travail : ni
 * `workspace_id` ni `user_id` (voir `table-scopes.ts`, `demo_leads`,
 * catégorie `shared`/`operator`) — un prospect n'a pas de compte, seulement
 * une adresse à recontacter. C'est aussi pourquoi cette table est HORS du
 * périmètre du garde-fou `workspace_id` de la démo
 * (`demo-reset.service.ts` / `demo-coverage.ts`) : rien de ce formulaire
 * n'entre dans la salle qu'un visiteur va ouvrir.
 *
 * `device_id` (cookie `bellum_did`, `device-cookie.ts`) est ce qui permet à
 * un visiteur QUI REVIENT de sauter le formulaire (#2705.6) : la dernière
 * valeur connue, pas un historique — un navigateur partagé peut se
 * réattribuer d'un lead à l'autre, ce que le produit assume (voir
 * `demo-lead.service.ts`).
 */
@Entity({ name: 'demo_leads' })
@Unique('demo_leads_email_unique', ['email'])
export class DemoLeadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('text')
  first_name: string

  @Column('text')
  last_name: string

  /** Normalisée (trim + minuscules) AVANT l'écriture — `demo-lead.ts:normalizeEmail`. */
  @Column('text')
  email: string

  @Column('text')
  job_title: DemoLeadJobTitle

  @Column('text')
  company: string

  /** Facultatif, et il le reste (issue #2705). */
  @Column('text', { nullable: true })
  phone: string | null

  @Index()
  @Column('text', { nullable: true })
  device_id: string | null

  /** Toujours `'demo'` ici — la colonne existe pour que le back-office (#2706)
   *  puisse un jour lire d'autres sources sans migration. */
  @Column('text', { default: 'demo' })
  source: string

  @CreateDateColumn({ type: 'timestamptz' })
  first_access_at: Date

  @Column({ type: 'timestamptz' })
  last_access_at: Date

  @Column('integer', { default: 1 })
  access_count: number

  /** UTM lus dans la query de `/demo`. Absent = `NULL`, jamais deviné ni `''`. */
  @Column('text', { nullable: true })
  utm_source: string | null

  @Column('text', { nullable: true })
  utm_medium: string | null

  @Column('text', { nullable: true })
  utm_campaign: string | null

  @Column('text', { nullable: true })
  utm_term: string | null

  @Column('text', { nullable: true })
  utm_content: string | null
}
