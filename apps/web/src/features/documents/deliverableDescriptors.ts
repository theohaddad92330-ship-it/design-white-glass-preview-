/**
 * #2125.12-21 — CE QU'UN LIVRABLE DIT DE LUI-MÊME.
 *
 * Huit champs (contenu inclus, version, périmètre, source, fraîcheur, données
 * exclues, permissions, coût) décrivent le MÊME objet — un livrable — donc une
 * SEULE table de descripteurs (GA-26 : un réglage vit à un seul endroit), pas
 * huit rendus copiés par format. `état` (2125.21) s'y ajoute : la neuvième
 * ligne, tirée de la MÊME source que le badge de statut du dossier
 * (`accounts:status.*`), jamais un mot nouveau pour la même idée.
 *
 * Pur — aucun accès réseau, aucun hook : ce qui rend la fonction testable sans
 * monter d'écran, et ce qui garantit qu'un même compte produit toujours les
 * mêmes descripteurs.
 *
 * ⚠️ JAMAIS de donnée inventée : chaque valeur est soit une CONSTANTE
 * structurelle du format (le contenu qu'il produit, sa version, son
 * périmètre, ce qu'il exclut — vrai quel que soit le compte), soit dérivée
 * d'un champ RÉEL du compte (marque, statut). La fraîcheur, elle, n'est pas
 * une chaîne ici : `DeliverableDescriptorList` la rend via `AccountFreshness`,
 * le même composant que le reste du dossier — pas une deuxième horloge.
 */
export type DeliverableFormatKey = 'docx' | 'pdf' | 'pptx' | 'xlsx'

type DeliverableDescriptorKey =
  | 'content'
  | 'version'
  | 'scope'
  | 'source'
  | 'excluded'
  | 'permissions'
  | 'cost'
  | 'state'

/** Une ligne de la table : la clé i18n (namespace `accounts`) porte le texte, jamais codé ici en dur. */
export type DeliverableDescriptorEntry = {
  key: DeliverableDescriptorKey
  i18nKey: string
  params?: Record<string, string>
}

type DeliverableDescriptorContext = {
  companyName: string
  brandName: string
  /** `account.status` — la même valeur que `PlanFreshnessBadge`/le badge de statut du dossier. */
  status: string
  /** Format masqué par la règle d'espace tant que ce booléen est faux (voir `useDataExit`) — ici il ne sert
   *  qu'à choisir le LIBELLÉ de permission d'un format déjà visible. */
  gated: boolean
  /**
   * #2125.15 — le compte est-il rattaché à un GROUPE (fusionné dans un autre,
   * ou porteur de filiales fusionnées en lui — `GET /accounts/:id/links`, le
   * même appel que « Détacher ce dossier », #1111) ? Le contenu du livrable
   * ne bouge JAMAIS avec cette réponse — `documents.service.ts` ne lit qu'UN
   * compte, jamais son groupe — mais le PÉRIMÈTRE COUVERT doit le DIRE :
   * sans ça, un livrable généré depuis un compte-groupe laisse croire qu'il
   * couvre les filiales, alors qu'aucune n'y figure.
   */
  hasGroupLinks: boolean
}

const DOSSIER_FORMATS: readonly DeliverableFormatKey[] = ['docx', 'pdf', 'pptx']

/**
 * Version du MODÈLE de contenu, pas du fichier généré. Elle ne bouge que si la
 * structure change (une section ajoutée/retirée) — voir `document-builders.ts`
 * / `documents.service.ts` côté API, dont c'est ici le miroir déclaratif côté
 * écran. Un livrable téléchargé la semaine dernière et un autre généré à
 * l'instant portent la MÊME version tant que la structure n'a pas changé —
 * c'est tout ce que ce nombre promet.
 */
const DOSSIER_CONTENT_VERSION = '1'
const CONTACTS_CONTENT_VERSION = '1'

function isDossierFormat(format: DeliverableFormatKey): boolean {
  return (DOSSIER_FORMATS as readonly string[]).includes(format)
}

export function buildDeliverableDescriptors(
  format: DeliverableFormatKey,
  ctx: DeliverableDescriptorContext,
): DeliverableDescriptorEntry[] {
  const dossier = isDossierFormat(format)

  const content: DeliverableDescriptorEntry = dossier
    ? { key: 'content', i18nKey: 'deliverables.descriptors.content.dossier', params: { brand: ctx.brandName } }
    : { key: 'content', i18nKey: 'deliverables.descriptors.content.contacts' }

  const version: DeliverableDescriptorEntry = {
    key: 'version',
    i18nKey: 'deliverables.descriptors.version.value',
    params: { n: dossier ? DOSSIER_CONTENT_VERSION : CONTACTS_CONTENT_VERSION },
  }

  const scope: DeliverableDescriptorEntry = dossier
    ? {
        key: 'scope',
        i18nKey: ctx.hasGroupLinks
          ? 'deliverables.descriptors.scope.dossierGrouped'
          : 'deliverables.descriptors.scope.dossier',
        params: { company: ctx.companyName },
      }
    : {
        key: 'scope',
        i18nKey: ctx.hasGroupLinks
          ? 'deliverables.descriptors.scope.contactsGrouped'
          : 'deliverables.descriptors.scope.contacts',
        params: { company: ctx.companyName },
      }

  const source: DeliverableDescriptorEntry = dossier
    ? { key: 'source', i18nKey: 'deliverables.descriptors.source.dossier', params: { brand: ctx.brandName } }
    : { key: 'source', i18nKey: 'deliverables.descriptors.source.contacts' }

  const excluded: DeliverableDescriptorEntry = dossier
    ? { key: 'excluded', i18nKey: 'deliverables.descriptors.excluded.dossier' }
    : { key: 'excluded', i18nKey: 'deliverables.descriptors.excluded.contacts' }

  const permissions: DeliverableDescriptorEntry = ctx.gated
    ? { key: 'permissions', i18nKey: 'deliverables.descriptors.permissions.exportRestricted' }
    : { key: 'permissions', i18nKey: 'deliverables.descriptors.permissions.team' }

  const cost: DeliverableDescriptorEntry = { key: 'cost', i18nKey: 'deliverables.descriptors.cost.included' }

  // #2125.21 — la MÊME clé que le badge de statut du dossier (`accounts:status.*`) :
  // jamais un second mot pour le même fait. `canceled` complète l'énum ici (il
  // manquait au catalogue existant) plutôt que de laisser une clé i18n manquante
  // s'afficher en toutes lettres à l'écran.
  const state: DeliverableDescriptorEntry = { key: 'state', i18nKey: `status.${ctx.status}` }

  return [content, version, scope, source, excluded, permissions, cost, state]
}
