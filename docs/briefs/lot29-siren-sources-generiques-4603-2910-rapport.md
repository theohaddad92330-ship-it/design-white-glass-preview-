# Lot 29 — SIREN des sources CRM génériques (#4603.3)

Périmètre : apps/api/src/modules/crm/crm-sources.ts, apps/api/src/modules/crm/crm-read-sync.service.spec.ts, docs/briefs/lot29-\*

## Ce que le lot livre

`adapterAccountSource` (sources génériques, tous CRM hors HubSpot) laissait tomber le `siren` que
`CrmCompanyPage` porte déjà : l'import CRM créait alors la fiche sans SIREN, donc invisible au
rapprochement #4603. Le SIREN voyage désormais quand l'adaptateur le rend ; absent, la ligne reste
celle d'avant (jamais deviné). Garde #4603 (HubSpot, même discipline).

## Ce que le lot ne fait PAS

- Aucun connecteur n'est modifié pour LIRE le SIREN (Pipedrive, Zoho…) : le champ personnalisé qui
  le porte n'est pas vérifiable (« un contrat d'API non vérifiable ne se devine pas »).
- #4795 (lecteur commun, territoire) et #4742 (structure technique) : non traités — voir QUESTIONS.

## Questions pour Louis

1. #4603.4 : qui déclenche `POST accounts/crm-fusions/sweep` (jamais lancé, aucun appelant web) ?
2. #4603.3 : quel champ personnalisé porte le SIREN chez Pipedrive/Zoho/Attio ?
3. #4795 dépend du lot « lecteur commun » (absent de main) ; #4742 demande un chantier IA
   (extraction des outils depuis offres/pages) — à découper avant d'être livré.
