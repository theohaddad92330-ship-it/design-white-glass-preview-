import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Le réglage de marque d'un espace.
 *
 * ⚠️ Chaque champ est `.nullish()` et non `.optional()` : `undefined` veut dire
 * « ne touche pas », `null` veut dire « efface ». Un formulaire qui n'envoie
 * qu'un champ ne doit pas vider les cinq autres, et un client qui retire son
 * logo doit pouvoir le dire — les deux gestes existent, ils ne s'écrivent pas
 * pareil.
 */
export const updateWorkspaceBrandSchema = z
  .object({
    brandName: z.string().trim().max(60).nullish(),
    copilotName: z.string().trim().max(40).nullish(),
    /** Une URL absolue : le logo est servi par le client, pas par nous. */
    brandLogoUrl: z.string().url().max(500).nullish(),
    /**
     * L'accent, hexadécimal à six chiffres.
     *
     * La casse est acceptée en entrée et normalisée plus loin : refuser
     * `#AB12CD` ferait échouer un copier-coller depuis n'importe quel outil de
     * design, pour une différence que la base seule voit.
     */
    brandAccent: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Une couleur hexadécimale à six chiffres est attendue.')
      .nullish(),
    /** Le domaine servi. Normalisé et vérifié unique côté service. */
    customDomain: z.string().trim().max(253).nullish(),
    /** L'expéditeur des e-mails transactionnels de cet espace. */
    brandEmailFrom: z.string().trim().email().max(320).nullish(),
    // Théo D settings-espace.N5 — mêmes bornes que les CHECK SQL (600 / 300).
    documentSignature: z.string().trim().max(600).nullish(),
    documentFooter: z.string().trim().max(300).nullish(),
  })
  .strict()

export class UpdateWorkspaceBrandDto extends createZodDto(updateWorkspaceBrandSchema) {}
