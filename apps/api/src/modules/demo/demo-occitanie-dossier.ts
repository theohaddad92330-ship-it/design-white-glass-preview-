/**
 * #4556 / #4432.4 (craft rule n°9) — LE DOSSIER DE DÉMONSTRATION CADRÉ SUR UNE ZONE : Airbus (siège à Blagnac, 31),
 * cadré sur l'Occitanie.
 *
 * Le vrai chemin (`scope_filter.py::filter_recommended_path`, apps/ia) lit le LIEU de la fiche : dans la zone → en
 * tête ; lieu connu hors zone → écarté, nommé `hors zone (<zone>)` ; lieu absent → gardé, jamais « hors zone ».
 * Les contacts d'Airbus ont tous le siège pour lieu (Blagnac, donc dans la zone) : la salle ajoute les deux cas
 * qui manquaient — un lieu connu HORS zone et un lieu INCONNU.
 *
 * Ces trois interlocuteurs sont FICTIFS (« (démo) », ni e-mail ni téléphone ni profil) : un lieu de travail est un
 * fait biographique, jamais posé sur une personne réelle des briefs.
 */
export const DEMO_OCCITANIE_COMPANY = 'Airbus'
export const DEMO_OCCITANIE_ZONE_LABEL = 'Occitanie'

type OccitanieSeat = {
  full_name: string
  title: string
  entity: string
  family: string
  decision_role: string
  priority: number
  /** `null` = lieu inconnu (jamais « Blagnac » par défaut) ; absent du type commun, fixé par chaque ligne. */
  location: string | null
  exclusion_reason: string | null
}

const seat = (input: OccitanieSeat) => ({
  ...input,
  photo_url: null,
  email: null,
  phone: null,
  linkedin_url: null,
  profile_summary: `Interlocuteur de démonstration : ${input.title}. Le lieu de travail est celui que la fiche déclare.`,
  why_contact: 'Montre comment un dossier cadré sur une zone range les contacts selon le lieu de leur fiche.',
  email_message: null,
  linkedin_message: null,
  contact_score: 40,
  seniority: 'manager',
  lifecycle_state: 'actionnable',
  key_points: [] as string[],
})

/** Le motif posé sur un contact écarté : la forme exacte du vrai chemin (`scope_filter.py`). */
export const demoOutOfZoneReason = (zone: string): string => `hors zone (${zone})`

export const DEMO_OCCITANIE_CONTACTS = [
  seat({
    full_name: 'Maëlle Castan (démo)',
    title: 'Responsable des systèmes d’information industriels',
    entity: 'Airbus France',
    family: 'IT',
    decision_role: 'technical',
    priority: 1,
    location: 'Toulouse, France',
    exclusion_reason: null,
  }),
  seat({
    full_name: 'Jonas Reimers (démo)',
    title: 'Responsable des achats informatiques',
    entity: 'Airbus Atlantic',
    family: 'Achat',
    decision_role: 'economic',
    priority: 2,
    location: 'Nantes, France',
    exclusion_reason: demoOutOfZoneReason(DEMO_OCCITANIE_ZONE_LABEL),
  }),
  seat({
    full_name: 'Inès Kerdraon (démo)',
    title: 'Responsable data de site',
    entity: 'Airbus Atlantic',
    family: 'Data',
    decision_role: 'technical',
    priority: 3,
    location: 'Saint-Nazaire, France',
    exclusion_reason: demoOutOfZoneReason(DEMO_OCCITANIE_ZONE_LABEL),
  }),
  seat({
    full_name: 'Anaïs Roussel (démo)',
    title: 'Responsable de programme informatique',
    entity: 'Airbus France',
    family: 'PMO',
    decision_role: 'technical',
    priority: 4,
    location: null,
    exclusion_reason: null,
  }),
] as const
