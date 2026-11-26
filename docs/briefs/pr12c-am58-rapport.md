# Rapport pr12c-am58 (#AM.58 — ajouter un CV depuis le fil de Laura)

- Point 1 : conforme. La carte `open_screen` `/consultants?importCv=true` porte « Ajouter un CV » (`AddCvFromThread.tsx`) : le dépôt `CvDropZone` existant s'ouvre en surimpression, sans navigation ni endpoint neuf.
- Point 2 : conforme. Import terminé : message de la personne dans le fil (nom de la fiche, `followUpRef.talentId`), la consigne `attached_document_role.py` relance `run_matching` sur le même besoin. Annulé : rien n'est envoyé ni lu.
- Point 3 : conforme. Rien n'est écrit avant le fichier choisi dans le dépôt.
- Point 4 : conforme. Tests web (6 + 3), pytest IA, `demo-coverage.ts` (vide à dessein, raison écrite + spec), FR+EN `chat.json`, changelog fr/en.
- Droits : conforme. Bouton absent sans `records:write` (même permission que `POST /talents/intake`), rôle inconnu ou erreur : absent aussi. Test du refus prouvé (garde retirée → rouge).
- Retiré : rien. Le renvoi « Ouvrir l'écran » vers /consultants reste à côté du bouton.
- À trancher par Louis : sans fournisseur de suivi (fil partagé, lecture seule) le dépôt fonctionne mais le fil ne reçoit rien ; sans le droit, la carte garde le seul renvoi vers /consultants.
- Tests : `tsc --noEmit -p apps/web` 0 error TS ; `vitest src/architecture` 241 fichiers verts (après compilation locale des paquets contracts/utils/errors/observable, absents du clone) ; AddCvFromThread, PendingActions.addCv, PendingActions (203 verts) ; changelog contracts 36 verts ; pytest test_am57 6 verts ; jest demo-coverage 91 verts + spec AM.58.
- SHA : voir le dernier commit de claude/pr12c-am58.
