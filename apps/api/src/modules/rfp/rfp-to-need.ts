import { createProjectNeedSchema, type CreateProjectNeed, type Rfp, type RfpNeedPreview } from '@bellum/contracts'

/**
 * L'appel d'offres devient un besoin ouvert (#1097).
 *
 * « Est-ce que ça sert à Bellum de charger les AO reçus d'un compte ? » — oui,
 * et voici pourquoi : Bellum lit déjà les appels d'offres PUBLICS (BOAMP) et les
 * marchés attribués (DECP), mais un AO reçu en direct n'existe nulle part.
 * Le transformer en besoin le rend visible dans la vue transverse et ouvre le
 * moteur de matching sur le vivier — celui-là même qui est déterministe et
 * gratuit.
 *
 * ⚠️ **Les compétences ne sont PAS dérivées du document.** Les exigences d'un
 * appel d'offres sont de la PROSE (« le titulaire devra justifier d'une
 * expérience significative en environnement bancaire ») : en tirer une liste de
 * technologies serait une invention, et le matching classerait alors des
 * profils sur des mots qu'on aurait fabriqués. Elles restent vides, le
 * recruteur les saisit, et l'axe compétences sort du dénominateur en attendant —
 * « un axe non évaluable n'est jamais un zéro ».
 *
 * Ce qui voyage est ce que le document DIT : son titre, et sa date limite.
 */
export function needFromRfp(rfp: Pick<Rfp, 'title' | 'due_at'>): CreateProjectNeed {
  const title = rfp.title.trim().slice(0, 200)
  return createProjectNeedSchema.parse({
    title,
    // `tender` existait dans l'énumération des sources depuis le chantier CRM et
    // n'avait aucun producteur : c'est exactement ce cas-là.
    source: 'tender',
    // Un humain a déposé ce document et cliqué : la provenance n'est ni un
    // connecteur, ni le pipeline, ni un modèle.
    provenance: 'human',
    // La date limite de REMISE est la seule échéance que le document porte.
    // Elle n'est pas une date de démarrage — les confondre ferait chercher des
    // profils disponibles au mauvais moment.
    ...(rfp.due_at ? { deadline_at: rfp.due_at } : {}),
  })
}

/**
 * #2571.1/#2571.2 — la prévisualisation du besoin, AVANT toute écriture.
 *
 * Fonction PURE, comme `needFromRfp` qu'elle appelle : elle ne fait qu'un tri
 * entre ce que le document DIT (un critère) et ce qu'il ne dit PAS (une
 * inconnue). Rien n'est deviné ni rempli par défaut — une exigence jugée
 * `ambiguous` par l'extraction n'est pas retenue comme critère, elle EST
 * l'inconnue, avec son texte source.
 */
export function previewNeedFromRfp(
  rfp: Pick<Rfp, 'title' | 'due_at' | 'issuer' | 'lots' | 'requirements'> & { account_id?: string | null },
): RfpNeedPreview {
  const need = needFromRfp(rfp)

  const criteria: RfpNeedPreview['criteria'] = []
  if (rfp.issuer) criteria.push({ kind: 'issuer', value: rfp.issuer })
  if (rfp.due_at) criteria.push({ kind: 'deadline', value: rfp.due_at })
  for (const lot of rfp.lots) criteria.push({ kind: 'lot', value: lot })
  for (const requirement of rfp.requirements.filter(item => item.weight !== 'ambiguous')) {
    criteria.push({ kind: 'requirement', value: requirement.text })
  }

  const unknowns: RfpNeedPreview['unknowns'] = []
  if (!rfp.issuer) unknowns.push({ kind: 'issuer', value: null })
  if (!rfp.due_at) unknowns.push({ kind: 'deadline', value: null })
  // Les compétences ne sont JAMAIS dérivées d'une prose (voir `needFromRfp`) :
  // c'est une inconnue à chaque prévisualisation, pas seulement quand elle est
  // vide par accident.
  unknowns.push({ kind: 'skills', value: null })
  for (const requirement of rfp.requirements.filter(item => item.weight === 'ambiguous')) {
    unknowns.push({ kind: 'ambiguous_requirement', value: requirement.text })
  }

  return { need, account_id: rfp.account_id ?? null, criteria, unknowns }
}
