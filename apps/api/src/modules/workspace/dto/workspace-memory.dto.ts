import { createZodDto } from 'nestjs-zod'
import { recordBridgeContactSchema } from '@bellum/contracts'

/**
 * Corps de `POST /workspaces/memory/bridges/contact` — « j'ai contacté ce
 * collègue à propos de ce croisement ».
 *
 * Le schéma est `.strict()` : une clé de plus est un 400, pas un champ ignoré.
 * C'est ce qui empêche un client zélé d'ajouter un « contexte » textuel au
 * geste — le pont se compte, ce qui a traversé ne se stocke pas.
 */
export class RecordBridgeContactDto extends createZodDto(recordBridgeContactSchema) {}
