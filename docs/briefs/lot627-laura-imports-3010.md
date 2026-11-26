# Lot 627 — Laura + imports (#4893, #4813, #4876)

Périmètre : apps/web/src/features/universal-import/**, apps/web/src/features/accounts/view/account-detail/tabs/TabCommittee\*, apps/web/src/features/chat/view/ShareConversation\*, apps/web/src/features/chat/view/ExportConversation\*, apps/web/src/i18n/locales/\*/importWizard.json, `apps/api/src/modules/esn-profile/esn-target-personas-import*`, packages/contracts/src/schemas/esn-target-personas.ts, docs/briefs/**

Décisions touchées : garde #4391 (Exporter garde son min-h-11 tactile, seul le libellé se replie) ; revient sur #4463 (le lien de la grille pointait sur l'onglet par défaut, il pointe désormais sur Qualité).

## Fait

- #4893 : le lien « Voir la grille » ouvre `?onglet=qualite`, une ligne de niveau illisible nomme la valeur lue et « un chiffre de 1 à 4 attendu » (champ `value` optionnel au contrat, garde l'additif).
- #4813 : les badges-phrases du comité s'enroulent chez l'appelant, `Badge` (nowrap, #1608/#1631.7) est inchangé.
- #4876 : « Partager » et « Exporter » se réduisent à l'icône sous 768 px (libellé `sr-only`, nom accessible gardé, cibles 44 px tactiles).

## Ne fait pas

- #4737 : voie d'envoi LinkedIn non tranchée (« à trancher avant la première ligne de code »).
- #4689 : dépend de #4688. #4868 : chantier de montée de version, la pin n'est pas sur main. #4480 : rien à coder, jeton Railway à régénérer.
