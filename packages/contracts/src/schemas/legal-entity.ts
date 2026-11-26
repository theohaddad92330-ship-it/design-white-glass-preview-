import { z } from 'zod'

/**
 * Les entités juridiques d'un même espace de travail (décision D9).
 *
 * Une ESN un peu installée n'est presque jamais une seule société : une SAS de
 * conseil, une SARL de régie, parfois une filiale par région ou par pays. Les
 * commerciaux sont les mêmes, le vivier est le même, le pipe est le même — mais
 * la mission est portée par UNE société, et c'est elle qui facture.
 *
 * Jusqu'ici, la seule réponse était de créer un espace par société : perdre
 * l'équipe partagée, le vivier commun et le cockpit du responsable pour régler
 * une question de facturation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CET OBJET NE FAIT PAS, ET NE FERA PAS ICI
 * ─────────────────────────────────────────────────────────────────────────
 * L'abonnement Bellum reste porté par l'ESPACE : un seul contrat, un seul pool
 * de crédits, un seul décompte de sièges. Découper la facturation de Bellum par
 * entité juridique serait un autre produit, et surtout un autre risque — celui
 * de casser le calcul des quotas de tous les clients existants pour servir un
 * besoin que personne n'a encore exprimé.
 *
 * L'entité juridique répond à une seule question : « quelle société de l'ESN
 * porte cette mission, et facturera ce mois ». C'est là que le multi-entité
 * compte réellement, parce que c'est là que la réponse change un chiffre.
 */

export const legalEntitySchema = z.object({
  id: z.string().guid(),
  workspace_id: z.string().guid(),
  /** La raison sociale, telle qu'elle apparaîtra sur une facture. */
  name: z.string().trim().min(1).max(160),
  /**
   * Identifiant légal (SIREN, numéro d'entreprise, EIN…). Libre et OPTIONNEL :
   * une ESN belge, suisse ou canadienne n'a pas de SIREN, et refuser sa
   * création faute d'un format français serait une erreur de conception, pas
   * une validation.
   */
  registration_number: z.string().trim().max(64).nullable(),
  /** Pays de facturation, ISO-3166 alpha-2. Ce qui décide la TVA, plus tard. */
  country: z.string().trim().length(2).nullable(),
  /** Numéro de TVA intracommunautaire — libre : toutes les juridictions n'en
   *  délivrent pas un du même format. #2422.3. */
  vat_number: z.string().trim().max(32).nullable(),
  /** Adresse de facturation, en texte libre — un seul champ, pas de structure
   *  imposée (rue/CP/ville dans une seule ligne). #2422.3. */
  address: z.string().trim().max(240).nullable(),
  /** Devise de facturation, ISO-4217 (« EUR », « CHF »…). #2422.3. */
  currency: z.string().trim().length(3).nullable(),
  /**
   * Archivée plutôt que supprimée. Une entité juridique a porté des missions
   * réelles et des mois facturés ; l'effacer rendrait illisible l'historique
   * qui la nomme. On la retire des sélecteurs, pas de la mémoire.
   */
  archived: z.boolean(),
  created_at: z.string(),
})
export type LegalEntity = z.infer<typeof legalEntitySchema>

export const createLegalEntitySchema = z.object({
  name: z.string().trim().min(1).max(160),
  registration_number: z.string().trim().max(64).nullish(),
  country: z.string().trim().length(2).nullish(),
  vat_number: z.string().trim().max(32).nullish(),
  address: z.string().trim().max(240).nullish(),
  currency: z.string().trim().length(3).nullish(),
})
export type CreateLegalEntity = z.infer<typeof createLegalEntitySchema>

export const updateLegalEntitySchema = createLegalEntitySchema
  .partial()
  .refine(value => Object.keys(value).length > 0, { message: 'Rien à modifier' })
export type UpdateLegalEntity = z.infer<typeof updateLegalEntitySchema>

/* ─────────────────────────────────────────────────────────────────────────────
 * DETTE SOLDÉE (mesurée le 31/08/2026 : les deux fonctions ci-dessous n'avaient
 *    aucun appelant de production).
 * ─────────────────────────────────────────────────────────────────────────────
 * `selectableEntities` est appelée par le sélecteur de société du panneau de
 * mission (`MissionDetailPanel.tsx`) et par le filtre de Pilotage › Finance.
 * `billingEntityOf` a son appelant depuis l'intégration du 15/10/2026 (#2426.98,
 * repris de la sauvegarde du lot garde-fous mission du 21/09) :
 * `InvoiceConnectorWriteController.assertLegalEntityCanInvoice` refuse un dépôt
 * de facture NEUF sous une société archivée — l'entité archivée mais déjà
 * rattachée reste résolue, jamais effacée du rattachement. Garde :
 * `apps/api/src/architecture/societe-archivee-bloque-facture-neuve.spec.ts`.
 *
 * ⚠️ Quiconque branchera ce sélecteur DOIT passer par ces deux fonctions et non
 * réécrire le filtre à côté : la règle d'archivage qu'elles portent (l'entité
 * ARCHIVÉE mais DÉJÀ rattachée reste proposable) ne se devine pas, et un filtre
 * naïf `!entity.archived` effacerait le rattachement historique au premier
 * enregistrement.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * L'entité qui facture une mission — celle qui lui est rattachée, ou rien.
 *
 * `null` est une réponse LÉGITIME et le cas par défaut : un espace mono-société
 * n'a aucune entité déclarée, et ses missions n'en portent aucune. Inventer une
 * entité « par défaut » au moment du rattachement ferait apparaître une raison
 * sociale sur des documents où personne ne l'a mise.
 */
export function billingEntityOf(
  mission: { legal_entity_id?: string | null },
  entities: readonly LegalEntity[],
): LegalEntity | null {
  if (!mission.legal_entity_id) return null
  return entities.find(entity => entity.id === mission.legal_entity_id) ?? null
}

/**
 * Les entités proposables dans un sélecteur.
 *
 * Les archivées en sortent — mais celle qui est DÉJÀ rattachée y reste, même
 * archivée. Sans cette exception, ouvrir la fiche d'une mission portée par une
 * société dissoute afficherait un sélecteur vide, et le premier enregistrement
 * effacerait silencieusement le rattachement historique.
 */
export function selectableEntities(entities: readonly LegalEntity[], currentId: string | null): LegalEntity[] {
  return entities.filter(entity => !entity.archived || entity.id === currentId)
}

/**
 * LA PORTÉE PAR SOCIÉTÉ, EN SQL — écrite une fois, lue par neuf requêtes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE N'EXISTAIT PAS, ET POURQUOI ELLE EXISTE MAINTENANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tableau de bord Finance a été livré le 31/08/2026 avec son sélecteur de
 * société **désactivé**, et la raison écrite dans `FinanceEntityFilter` :
 * « aucune des six lectures financières ne prend de société en paramètre ;
 * `missions.legal_entity_id` existe et n'est lu par aucune d'elles ». Le refus
 * était juste — un contrôle qui change le libellé et pas les chiffres est pire
 * que pas de contrôle. Ce qui manquait était CETTE clause.
 *
 * Elle est jumelle de `financeScopeClause`, et pour la même raison : recopiée
 * dans neuf requêtes, une seule l'aurait oubliée, et l'oubli serait INVISIBLE —
 * une portée trop large rend simplement un chiffre plus gros, qui a l'air juste.
 *
 * ⚠️ **Aucun `OR legal_entity_id IS NULL`.** Une mission que personne n'a
 * rattachée n'appartient à AUCUNE société : la faire entrer dans le total de
 * celle qu'on a choisie donnerait un filtre qui a l'air de marcher et un chiffre
 * faux — le pire des deux mondes, celui que le refus du 31/08 voulait éviter.
 * Elle reste dans « toutes les sociétés », qui est le défaut.
 *
 * `missionAlias` est l'alias de la table portant `legal_entity_id` dans la
 * requête appelante — `missions`, toujours : c'est la SEULE table du dépôt qui
 * porte la colonne. `nextParam` est l'index du prochain paramètre libre (le SQL
 * du dépôt est en paramètres positionnels).
 */
export function legalEntityClause(
  legalEntityId: string | null | undefined,
  missionAlias: string,
  nextParam: number,
): { sql: string; params: string[] } {
  if (!legalEntityId) return { sql: '', params: [] }
  return { sql: ` AND ${missionAlias}.legal_entity_id = $${nextParam}::uuid`, params: [legalEntityId] }
}

/**
 * CE QUE LE FILTRE PAR SOCIÉTÉ NE GOUVERNE PAS — et pourquoi, lecture par
 * lecture.
 *
 * C'est la moitié la plus utile du filtre. Un tableau de bord dont trois blocs
 * ne bougent pas quand on choisit une société se lit comme une panne ; dit à
 * voix haute, il se lit comme une frontière. C'est exactement le geste de la
 * phrase « ce que la période ne gouverne pas », livrée avec le sélecteur de mois
 * le 27/08 — et sans elle, un écran filtré en haut promet qu'il l'est partout.
 *
 * `key` sert à retrouver la phrase i18n de l'écran ; `reason` est la raison
 * technique, pour la personne qui se demandera si c'est un oubli.
 */
export const FINANCE_ENTITY_BLIND_READS: readonly {
  key: 'capacity' | 'dso' | 'forecastHoped' | 'forecastHorizons'
  reason: string
}[] = [
  {
    key: 'forecastHorizons',
    reason:
      '#2425 — le prévisionnel par horizon est une vue d’ÉQUIPE : son bloc capacité compte des consultants ' +
      '(sans société), son pipe part d’opportunités (sans société), et sa vue manager arbitre entre toutes les ' +
      'sociétés à la fois. Le filtrer à moitié rendrait des scénarios qui mélangent deux portées sans le dire.',
  },
  {
    key: 'capacity',
    reason:
      'La capacité décrit l’ÉQUIPE : elle compte des consultants, et un consultant n’est rattaché à aucune ' +
      'société de l’ESN — `consultants` ne porte pas `legal_entity_id`. Lui en inventer une pour les besoins ' +
      'du filtre produirait une capacité fausse, exactement comme le refus de `?scope=own` posé le 26/08.',
  },
  {
    key: 'dso',
    reason:
      'Le délai de paiement est une MÉDIANE à plancher d’observations (`MEASURABILITY_THRESHOLDS.dso`). ' +
      'Le découper par société ferait passer presque toutes les sociétés sous le plancher, et rendrait ' +
      '« non mesurable » un chiffre qui l’est parfaitement à l’échelle de l’espace — le même raisonnement, ' +
      'et les mêmes mots, que le refus de `?scope=own` sur cette route.',
  },
  {
    key: 'forecastHoped',
    reason:
      'La ligne « espéré » du prévisionnel part des OPPORTUNITÉS, et une opportunité ne porte pas de société : ' +
      'la mission qui la portera n’existe pas encore. Les deux autres lignes (acquis, probable) partent de ' +
      '`missions` et SONT filtrées — d’où une ligne sur trois qui garde la portée de l’espace, et le dit.',
  },
]
