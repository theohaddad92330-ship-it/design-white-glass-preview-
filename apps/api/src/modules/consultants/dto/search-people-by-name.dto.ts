import { createZodDto } from 'nestjs-zod'
import { searchPeopleByNameInputSchema } from '@bellum/contracts'

/** #3831.1 — Query params de `GET /consultants/search-by-name` : le même
 *  contrat que `IaClient.searchPeopleByName`, pas une copie (GA-26). */
export class SearchTalentByNameDto extends createZodDto(searchPeopleByNameInputSchema) {}
