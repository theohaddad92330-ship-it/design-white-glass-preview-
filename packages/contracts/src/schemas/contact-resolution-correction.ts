import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  #2159.35 — LA CORRECTION DE RAPPROCHEMENT DE CONTACT, VERSIONNÉE. */
/*                                                                    */
/*  L'écriture de l'import ne dédoublonne les contacts que par        */
/*  e-mail (`ImportWriterService.existingKeys`) : une ligne dont       */
/*  l'e-mail matche une fiche déjà en base MET À JOUR cette fiche.     */
/*  Un e-mail générique partagé (secrétariat, accueil) peut faire      */
/*  matcher une ligne du fichier sur la MAUVAISE personne réelle — et  */
/*  rien ne permettait à un humain de corriger ce rapprochement une    */
/*  fois pour toutes.                                                 */
/*                                                                    */
/*  Registre séparé de `entity_resolution_corrections` (comptes) :     */
/*  celui-là superpose un verdict CALCULÉ sur des CANDIDATS nommés ;   */
/*  celui-ci répond à une question plus étroite — « cette fiche est-   */
/*  elle la bonne pour CET e-mail, dans l'import ? » — jamais réutilisé */
/*  tel quel (#2159.35, tranché : un registre non vérifié pour ce      */
/*  domaine ne se recopie pas).                                       */
/*                                                                    */
/*  Mêmes trois garanties que le registre des comptes :                */
/*  - une correction humaine gagne toujours, quelle que soit sa date  */
/*    (la plus haute VERSION gagne) ;                                 */
/*  - versionnée : une ligne par geste, jamais mise à jour ni          */
/*    supprimée (on archive) ;                                        */
/*  - scopée à l'espace.                                              */
/* ------------------------------------------------------------------ */

/** Deux décisions, pas quatre : `confirmed` ne fait que reconnaître le
 *  comportement déjà par défaut (une clé qui matche met à jour) —
 *  `rejected` change le comportement : la clé n'appliquera plus à CETTE
 *  fiche pour les imports suivants. */
export const CONTACT_RESOLUTION_CORRECTION_DECISIONS = ['confirmed', 'rejected'] as const
const contactResolutionCorrectionDecisionSchema = z.enum(CONTACT_RESOLUTION_CORRECTION_DECISIONS)

/** Le geste envoyé depuis l'aperçu d'import. L'espace, l'auteur et la fiche
 *  visée viennent du JETON et de l'URL, jamais du corps. La clé de
 *  rapprochement (`email:...`) est dérivée CÔTÉ SERVEUR de l'e-mail actuel de
 *  la fiche au moment du geste — jamais composée côté client, qui n'a pas
 *  accès à la ligne brute du fichier importé. */
export const contactResolutionCorrectionRequestSchema = z.object({
  decision: contactResolutionCorrectionDecisionSchema,
  note: z.string().trim().max(500).nullable().optional(),
})
export type ContactResolutionCorrectionRequest = z.infer<typeof contactResolutionCorrectionRequestSchema>

/** Une version de la correction, telle que l'API la rend. */
export const contactResolutionCorrectionSchema = z.object({
  version: z.number().int().min(1),
  decision: contactResolutionCorrectionDecisionSchema,
  /** La clé de rapprochement visée (`email:<adresse normalisée>`), figée au
   *  moment du geste — comme `target_name`/`target_siren` sur le registre des
   *  comptes, jamais recalculée après coup. */
  dedup_key: z.string().min(1),
  note: z.string().nullable(),
  decided_at: z.string(),
})
export type ContactResolutionCorrection = z.infer<typeof contactResolutionCorrectionSchema>
