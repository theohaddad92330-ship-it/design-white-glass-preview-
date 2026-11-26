# Rapport — correctifs-recette-0211

- Branche `claude/correctifs-recette-0211`. Aucun point « DÉJÀ LÀ » (git grep fait par point).
- 1. « Avec e-mail » : `recordedEmailSql` (placeholder-email.ts) = e-mail non vide ET non gabarit ; MÊME prédicat pour le compteur (`channelTally`) et le filtre `channel=with_email` (contacts.service.ts). Test rouge→vert : contacts.service.channel-tally.spec.ts.
- 2. Autocomplétion /search : `CompanySearchBox` — si « Dans ton portefeuille » arrive APRÈS le registre, il s'insère SOUS lui (`useLateGroup`) ; ordre inchangé quand tout arrive ensemble. Test RTL en deux temps (CompanySearchBox.test.tsx).
- 3. Listes par persona (web, `contactGrouping.ts`) : `groupContacts` reçoit les paires de doublon PROBABLE du serveur (même requête que le bandeau) ; une seule apparition = fiche la plus complète, à égalité persona la plus haute. Jamais fusionné ; mode entité et bandeau intacts. Tests : contactGrouping.test.ts (+3).
- 4a. Cause : `QualificationLeadsQueue` (porteur de « Préparer l'approche ») n'est plus monté nulle part depuis le tableau unifié #4755 — la spec de couverture ne lit que les données. Le geste revient sur « Projet possible » (`AccountSignalTable.tsx`, onglet Signaux `?tab=veille`) : seulement si `leadPrimaryAction` = draft_message ET un contact porte le rôle ; ouvre le composer. Test : AccountOpportunityScreen.prepareApproach.test.tsx (3).
- 4b. `withoutProbableDuplicates` (commercial-brief-seed.ts), appliqué au seul compte SG (demo-dataset.ts) : 13 paires du dossier → 0. Garde : demo-sg-no-false-duplicates.spec.ts. Les autres comptes gardent leurs paires (demo-duplicate-proposals-coverage inchangé).
- Tests lancés (ciblés, verts) : api channel-tally + placeholder-email ; demo (5 specs voisines) ; web CompanySearchBox, contactGrouping, TabContacts×3, AccountOpportunityScreen×2.
- Non fait / limites : `tsc -p apps/web` impossible (dist de @bellum/contracts non construit, hors périmètre) ; l'empreinte de semis (demo-seed-fingerprint) n'a pas été revérifiée — la CI le dira ; le rejeu de la salle SG déjà semée n'est pas lancé.
- Garde doc↔code : ÉCHAPPÉE tracée (`Doc-inchangée` au commit SG).
