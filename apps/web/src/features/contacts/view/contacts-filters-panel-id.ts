/**
 * #3376 — l'identifiant PARTAGÉ entre le déclencheur compact « Filtres »
 * (`ContactsIntro`, à gauche du CTA « Traiter ») et le panneau qu'il pilote
 * (`ContactContent`, `CollapsedSection` en mode `hideTrigger`). Un fichier à
 * lui seul plutôt qu'exporté depuis l'un des deux : les deux l'importent sans
 * qu'aucun ne dépende du module (souvent plus lourd) de l'autre.
 */
export const CONTACTS_FILTERS_PANEL_ID = 'contacts-filters-panel'
