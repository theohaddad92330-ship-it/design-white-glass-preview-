import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Les identifiants d'une instance Odoo.
 *
 * ⚠️ `https` OBLIGATOIRE, et refusé au niveau du schéma plutôt que plus bas.
 * Une clé d'API voyage dans le corps de chaque appel JSON-RPC : en clair sur
 * `http`, elle est lisible par n'importe quel intermédiaire. La garde SSRF
 * refuse elle aussi `http` (`assertSafeOutboundUrl`), mais la refuser ICI donne
 * à l'utilisateur un message de formulaire au lieu d'une erreur de connexion
 * qu'il lirait comme « mes identifiants sont mauvais ».
 */
export const odooConnectSchema = z
  .object({
    baseUrl: z
      .string()
      .trim()
      .url()
      .max(300)
      .refine(value => value.startsWith('https://'), { message: 'Une adresse https est requise.' }),
    /** Le nom de la base — une instance en héberge plusieurs. */
    db: z.string().trim().min(1).max(120),
    login: z.string().trim().min(1).max(200),
    /**
     * La clé d'API. Bornée haut pour éviter qu'un copier-coller de page entière
     * parte chiffré en base, bornée bas parce qu'une clé Odoo est longue —
     * une valeur de dix caractères est presque sûrement un mot de passe collé
     * par erreur, et l'écran doit le dire avant qu'elle ne soit stockée.
     */
    apiKey: z.string().trim().min(20).max(500),
  })
  .strict()

export class OdooConnectDto extends createZodDto(odooConnectSchema) {}

/**
 * Ce qu'on pousse sur un `res.partner`.
 *
 * `name` est REQUIS : Odoo refuse un partenaire sans nom, et composer un
 * repli (« Contact sans nom ») créerait dans le CRM du client une fiche que
 * personne n'a demandée et que personne ne retrouvera.
 */
export const odooExportContactSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().email().max(320).optional(),
    phone: z.string().trim().min(3).max(40).optional(),
    jobTitle: z.string().trim().min(1).max(200).optional(),
    companyName: z.string().trim().min(1).max(200).optional(),
  })
  .strict()

export class OdooExportContactDto extends createZodDto(odooExportContactSchema) {}
