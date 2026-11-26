import { createZodDto } from 'nestjs-zod'
import { createContactFromCrmSchema } from '@bellum/contracts'

/** #1995 — la ligne CRM dont on crée la fiche Bellum : nom, poste, e-mail,
 *  référence de la ligne d'origine. Jamais un `contact_id` : la fiche n'existe
 *  pas encore, c'est précisément le problème qu'on corrige. */
export class CreateContactFromCrmDto extends createZodDto(createContactFromCrmSchema) {}
