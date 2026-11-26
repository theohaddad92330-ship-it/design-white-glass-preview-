# #5010.3 — site de publication d'une offre dans Découvrir

- `FactSourceLink` (CandidateFacts.tsx) : fait `hiring` → « Voir l'annonce · LinkedIn » via `offerOriginLabel` (liste blanche du contrat, #5151) ; hôte inconnu/agrégateur = nature seule ; autres faits inchangés. i18n fr+en `facts.linkAnnouncementOn`.
- Commentaires « jamais le site » mis à jour (décision Louis 02/11).
- Démo : l'offre WTTJ d'Aubrac/Naval pointe sur welcometothejungle.com ; spec demo-discover-card-facts-coverage étendue.
- Tests : CandidateFacts (rouge→vert, 3 nouveaux), source-site, fact-type, no-vendor-names, jest demo (2 specs) verts. tsc non lancé (trop long).
