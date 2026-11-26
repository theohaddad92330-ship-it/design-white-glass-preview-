import { createZodDto } from 'nestjs-zod'
import { declareOrgPeopleRequestSchema } from '@bellum/contracts'
import { z } from 'zod'

/** Déclarer des personnes qu'on connaît et que Bellum n'a pas trouvées (#1103). */
export class DeclareOrgPeopleDto extends createZodDto(declareOrgPeopleRequestSchema) {}

/** Retirer une déclaration. Le nom est la clé — les ids d'un graphe sont
 *  refabriqués à chaque run, un nom se re-rapproche. */
export class UndeclareOrgPersonDto extends createZodDto(z.object({ fullName: z.string().min(1).max(120) })) {}

/** Le texte libre que Laura met en lignes (#1103). Borne haute : au-delà, ce
 *  n'est plus une description d'organigramme mais un document, qui passe par
 *  l'ingestion documentaire. */
export const ORG_TEXT_MAX_CHARS = 20_000

/**
 * Le texte libre que Laura met en lignes (#1103), OU un FICHIER déposé — PDF,
 * classeur Excel (.xlsx), présentation (.pptx) (#3740, reste) : les trois
 * familles déjà lues par `document_text.py` (apps/ia) pour le RAG et
 * l'intake RFP. Une image y est refusée nommément, faute d'OCR — voir
 * `org_declare.py`.
 *
 * `text` : borne haute 20 000 caractères — au-delà, ce n'est plus une
 * description d'organigramme mais un document, qui passe par l'ingestion
 * documentaire. `fileBase64`/`fileName` : mêmes noms que `IaClient.
 * declareOrgFromText`, pour qu'aucune traduction de clé ne s'intercale.
 *
 * Les deux entrées sont EXCLUSIVES : au moins l'une des deux, jamais ni
 * l'une ni l'autre.
 */
export class ProposeOrgPeopleFromTextDto extends createZodDto(
  z
    .object({
      text: z.string().min(1).max(ORG_TEXT_MAX_CHARS).optional(),
      fileBase64: z.string().min(1).optional(),
      fileName: z.string().optional(),
    })
    .refine(body => Boolean(body.text?.trim()) || Boolean(body.fileBase64), {
      message: 'text or fileBase64 is required',
    }),
) {}

/** #2553 / #3740 — un organigramme PDF / image / PPTX, en base64 (≈ 10 Mo de
 *  fichier). Lu par l'extraction documentaire existante, jamais écrit tel quel. */
export class ProposeOrgPeopleFromFileDto extends createZodDto(
  z.object({ fileB64: z.string().min(1).max(12_000_000), filename: z.string().min(1).max(200) }),
) {}
