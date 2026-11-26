import { createZodDto } from 'nestjs-zod'
import { offerPortfolioSchema, partialWithoutDefaults } from '@bellum/contracts'

/** Écriture PARTIELLE du portefeuille : chaque champ est facultatif, et ce qui
 *  n'est pas envoyé n'est pas touché (le service fusionne sur l'existant). Un
 *  remplacement complet ferait qu'un écran oubliant un champ remettrait en
 *  silence le lexique ou la politique de site aux défauts. */
/** `partialWithoutDefaults` tient la promesse du docblock sous zod 4 : un
 *  `.partial()` nu y GARDE les treize `.default()` du portefeuille, et l'écran
 *  qui édite trois champs renverrait les dix autres à leur défaut. */
export class UpdateOfferPortfolioDto extends createZodDto(partialWithoutDefaults(offerPortfolioSchema)) {}
