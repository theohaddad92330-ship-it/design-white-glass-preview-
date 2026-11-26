import { createZodDto } from 'nestjs-zod'
import { searchPeopleByNameInputSchema } from '@bellum/contracts'

/** #2727 — « je tape un nom, je vois les homonymes, je choisis ». Query params
 *  of `GET /contacts/search-by-name` : le même contrat que `IaClient.searchPeopleByName`,
 *  pas une copie (GA-26). */
export class SearchPeopleByNameDto extends createZodDto(searchPeopleByNameInputSchema) {}
