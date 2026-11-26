import { backofficeAuditEntrySchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'

/**
 * Ce qu'un appelant a le droit d'écrire au journal d'audit (#1666).
 *
 * ⚠️ Le schéma est celui des CONTRATS, non recopié : `category` et `outcome` y
 * sont des énumérations fermées, elles-mêmes tenues par les contraintes SQL
 * `backoffice_audit_events_category_check` et `..._outcome_check` (GA-12). Un
 * appelant qui inventerait une catégorie est refusé par le schéma AVANT
 * d'atteindre la base — sans quoi sa ligne tomberait dans aucune fenêtre de
 * rétention, et vivrait pour toujours sans que personne l'ait décidé.
 *
 * ⚠️ `created_at` n'est PAS dans le schéma, et c'est délibéré : la date d'un
 * fait d'audit est posée par la BASE. Un appelant qui la fournirait pourrait
 * antidater son propre geste.
 */
export class RecordAuditEntryDto extends createZodDto(backofficeAuditEntrySchema) {}
