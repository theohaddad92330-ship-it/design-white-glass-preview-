import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  createNeedDocumentSchema,
  createNeedStepSchema,
  createProjectDocumentSchema,
  createProjectStepSchema,
  createAccountNeedSchema,
  createProjectNeedSchema,
  createProjectSchema,
  linkProjectContactSchema,
  changeNeedConvergenceStateSchema,
  changeNeedStatusSchema,
  crossStaffableGateSchema,
  crossProfileTypeAgreementGateSchema,
  openNeedsQuerySchema,
  updateNeedDocumentStatusSchema,
  updateNeedStepSchema,
  updateProjectDocumentStatusSchema,
  updateProjectStepSchema,
  updateProjectNeedSchema,
  updateProjectStageSchema,
  updateProjectCaseDimensionsSchema,
  leadConversionSchema,
  updateProjectForecastCategorySchema,
} from '@bellum/contracts'

/**
 * #2195.33 — LE CORPS DE `POST /projects`.
 *
 * Le schéma vient du contrat TEL QUEL (`createProjectSchema`, `.strict()`), et
 * il n'est pas recopié : c'est lui qui refuse une clé de plus — un `kind` glissé
 * dans le corps, par exemple, qui ferait passer une saisie pour une douleur
 * relevée par l'analyse. Le formulaire web lit le MÊME schéma pour savoir quoi
 * demander ; deux listes divergeraient au premier champ ajouté.
 */
export class CreateProjectDto extends createZodDto(createProjectSchema) {}

export class UpdateProjectStageDto extends createZodDto(updateProjectStageSchema) {}
/** #3246 — stratégie / modèle d'achat d'une affaire déjà clôturée. */
export class UpdateProjectCaseDimensionsDto extends createZodDto(updateProjectCaseDimensionsSchema) {}
export class CreateProjectNeedDto extends createZodDto(createProjectNeedSchema) {}
/** #2558.1 — le corps de `POST /projects/needs` : le compte est REQUIS, le
 *  projet est facultatif. Le schéma vient du contrat tel quel, `.strict()`. */
export class CreateAccountNeedDto extends createZodDto(createAccountNeedSchema) {}
export class UpdateProjectNeedDto extends createZodDto(updateProjectNeedSchema) {}
export class ChangeNeedStatusDto extends createZodDto(changeNeedStatusSchema) {}
/** #2952 (#2305.18) — la porte de convergence, séparée du patch générique. */
export class ChangeNeedConvergenceStateDto extends createZodDto(changeNeedConvergenceStateSchema) {}
export class OpenNeedsQueryDto extends createZodDto(openNeedsQuerySchema) {}
export class CrossStaffableGateDto extends createZodDto(crossStaffableGateSchema) {}
/** #2323.18 — la porte PRÉSENTER, accord sur le type de profil. Même patron
 *  que {@link CrossStaffableGateDto}, sans motif. */
export class CrossProfileTypeAgreementGateDto extends createZodDto(crossProfileTypeAgreementGateSchema) {}
export class LinkProjectContactDto extends createZodDto(linkProjectContactSchema) {}

/**
 * #2172.36 -> .40 - LA CONVERSION D'UNE PISTE EN OPPORTUNITE.
 *
 * Le schema vient du contrat TEL QUEL : cinq champs, `.strict()`. C'est lui qui
 * refuse une cle de plus - une ressaisie qui se reintroduit - et c'est lui que
 * le formulaire lit pour savoir quoi demander. Le recopier ici en ferait deux
 * listes qui divergeraient au premier champ ajoute.
 */
export class LeadConversionDto extends createZodDto(leadConversionSchema) {}

/** Attribuer (ou retirer) le porteur. `null` = non attribué, un état légitime :
 *  laisser un projet sans porteur est plus honnête que d'en désigner un au
 *  hasard, et c'est ce que le cockpit manager cherche justement à repérer. */
export class UpdateProjectOwnerDto extends createZodDto(
  z.object({ owner_id: z.string().guid().nullable() }).strict(),
) {}

/** L2 Pipe — la catégorie DÉCLARÉE du commercial ; `null` efface. Le schéma vient du contrat. */
export class UpdateProjectForecastCategoryDto extends createZodDto(updateProjectForecastCategorySchema) {}

/** Clôture ESPÉRÉE, ou `null` pour l'effacer. Jamais déduite d'un cycle moyen. */
export class UpdateProjectCloseDateDto extends createZodDto(
  z.object({ expected_close_on: z.string().date().nullable() }).strict(),
) {}

export class RenameStageDto extends createZodDto(z.object({ label: z.string().trim().max(60).nullable() }).strict()) {}

export class AddLossReasonDto extends createZodDto(z.object({ label: z.string().trim().min(1).max(120) }).strict()) {}

/** Les « prochaines étapes » cochables d'un besoin (fiche besoin, dossier du
 *  26/08) — distinctes de `needNextAction`, une dérivation non persistée. */
export class CreateNeedStepDto extends createZodDto(createNeedStepSchema) {}
export class UpdateNeedStepDto extends createZodDto(updateNeedStepSchema) {}

/** #2171.22 — même objet, porté par l'OPPORTUNITÉ plutôt que le besoin —
 *  distinctes de `ProjectRow.next_action`, une dérivation non persistée. */
export class CreateProjectStepDto extends createZodDto(createProjectStepSchema) {}
export class UpdateProjectStepDto extends createZodDto(updateProjectStepSchema) {}

/**
 * Les DOCUMENTS d'un besoin (31/08/2026) — le dépôt d'un fichier, et le
 * changement de statut. Les deux vivaient jusqu'ici en lecture seule, faute de
 * stockage : la fiche montrait Devis / NDA / Contrat cadre, et rien derrière.
 */
export class CreateNeedDocumentDto extends createZodDto(createNeedDocumentSchema) {}
export class UpdateNeedDocumentStatusDto extends createZodDto(updateNeedDocumentStatusSchema) {}
export class CreateProjectDocumentDto extends createZodDto(createProjectDocumentSchema) {}
export class UpdateProjectDocumentStatusDto extends createZodDto(updateProjectDocumentStatusSchema) {}
