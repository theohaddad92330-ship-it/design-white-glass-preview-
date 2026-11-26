import { createZodDto } from 'nestjs-zod'
import { requestOtpSchema } from '@bellum/contracts'

/**
 * Ce DTO redéclarait son propre `z.object({ email: z.string().email() })`, sous
 * le même nom que celui du contrat — assez pour qu'on le lise sans le voir.
 *
 * Conséquence : la normalisation d'e-mail posée au contrat le 14/08/2026
 * (`authEmail()` : `.trim().toLowerCase()`, la cause du « me connecter
 * fonctionne rarement ») n'a jamais atteint cette porte-ci. Le service
 * normalisait bien de son côté, mais la validation passe AVANT lui : une
 * adresse remplie automatiquement avec un espace était refusée en 400 sur
 * l'écran « recevoir un code par e-mail », c'est-à-dire sur le repli que
 * l'utilisateur essaie justement quand sa connexion échoue.
 */
export class RequestOtpDto extends createZodDto(requestOtpSchema) {}
