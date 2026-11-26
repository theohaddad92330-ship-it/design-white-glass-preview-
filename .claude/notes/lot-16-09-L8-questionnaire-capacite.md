# Lot L8-questionnaire-capacite — questionnaire, lot L19 — capacité et voies d'accès

**36 points** à l'état `retenu`, extraits de `registre-2026-09-15-onboarding-questionnaire.md`.
L'état se change dans le REGISTRE d'origine, par édition de SA ligne.

| Point | La demande, en huit mots | Sujet | Existant (preuve) | État | Preuve en recette |
| ----- | ------------------------ | ----- | ----------------- | ---- | ----------------- |
| 2048.1 | Canal « réseau » | L19 | `go_to_market_channels` [PQ][SCH] — ⚠ MÊME objet que #2044 : deux issues, un champ | retenu | CODE: un seul champ (GA-26) |
| 2048.5 | Canal « plateformes » | L19 | rien | retenu | CODE: valeur au contrat |
| 2048.7 | Canal « appels d'offres » | L19 | `modules/rfp` ; cf. #2056 | retenu | CODE: valeur au contrat |
| 2048.8 | Canal « contenu » | L19 | cf. #2057 | retenu | CODE: valeur au contrat |
| 2048.9 | Canal « inbound » | L19 | rien | retenu | CODE: valeur au contrat |
| 2048.10 | Canal « événements » | L19 | rien | retenu | CODE: valeur au contrat |
| 2048.11 | Canal « consultants capteurs » | L19 | rien | retenu | CODE: valeur au contrat |
| 2048.12 | Par canal : utilisé ou non | L19 | tableau plat aujourd'hui | retenu | CODE: structure par canal |
| 2048.13 | Par canal : période | L19 | rien | retenu | CODE: attribut par canal |
| 2048.14 | Par canal : volume | L19 | `weekly_*` donnent 3 volumes sur 11 | retenu | CODE: attribut par canal |
| 2048.15 | Par canal : réponses | L19 | rien | retenu | CODE: attribut par canal |
| 2048.16 | Par canal : rendez-vous | L19 | rien | retenu | CODE: attribut par canal |
| 2048.17 | Par canal : besoins | L19 | rien | retenu | CODE: attribut par canal |
| 2048.18 | Par canal : démarrages | L19 | rien | retenu | CODE: attribut par canal |
| 2048.19 | Par canal : temps consacré | L19 | rien | retenu | CODE: attribut par canal |
| 2048.20 | Ne jamais confondre visibilité et conversion | L19 | doctrine « aucune probabilité » + « un taux de couverture n'est pas un fait de marché » | retenu | CODE: deux mesures, deux libellés |
| 2048.21 | L'audit repère surutilisé, sous-exploité, non mesuré | L19 | ⚠ « non mesuré » DOIT être un troisième seau, jamais 0 (GA-18/GA-19) | retenu | ÉCRAN: les trois seaux s'additionnent |
| 2054.1 | Cartographier le CRM | L19 | `tooling` [PQ][SCH] ; connecteurs `modules/crm*` | retenu | CODE: une entrée par outil, pas un tableau plat |
| 2054.2 | …l'ATS | L19 | `modules/ats` ; ⚠ l'ATS se saisit par ESPACE (env-reference) | retenu | CODE: entrée par outil |
| 2054.3 | …l'ERP ESN | L19 | `modules/odoo` ; `BOONDMANAGER_*` | retenu | CODE: entrée par outil |
| 2054.4 | …la messagerie | L19 | `modules/mailbox` ; ⚠ le CORPS ne sort jamais vers le modèle (D65) | retenu | Écran/parcours — tranché par Claude sur la doctrine déjà écrite (Louis 15/09 : « prends-les tous, ne me redemande rien »). Se prouve en recette. |
| 2054.5 | …l'agenda | L19 | `modules/agenda` | retenu | CODE: entrée par outil |
| 2054.6 | …le Drive | L19 | `modules/google`, `modules/microsoft` | retenu | CODE: entrée par outil |
| 2054.7 | …les tableurs | L19 | `modules/import` | retenu | CODE: entrée par outil |
| 2054.8 | …les outils d'enrichissement | L19 | ⚠ **NOS fournisseurs ne se nomment JAMAIS** (doctrine tool-naming, GA-44) — on nomme la CAPACITÉ | retenu | Écran/parcours — tranché par Claude sur la doctrine déjà écrite (Louis 15/09 : « prends-les tous, ne me redemande rien »). Se prouve en recette. |
| 2054.9 | …les plateformes | L19 | rien | retenu | CODE: entrée par outil |
| 2054.10 | …la BI | L19 | rien | retenu | CODE: entrée par outil |
| 2054.11 | …les notes personnelles | L19 | `modules/notion` | retenu | CODE: entrée par outil |
| 2054.12 | Par outil : utilisé par qui | L19 | rien | retenu | CODE: attribut par outil |
| 2054.13 | Par outil : donnée contenue | L19 | rien | retenu | CODE: attribut par outil |
| 2054.14 | Par outil : fraîcheur | L19 | `Provenance` (source + date) | retenu | CODE: attribut par outil |
| 2054.15 | Par outil : niveau de confiance | L19 | `prefillConfidenceSchema` existe comme précédent | retenu | CODE: attribut par outil |
| 2054.16 | Par outil : possibilité d'export | L19 | rien | retenu | CODE: attribut par outil |
| 2054.17 | Par outil : doublon | L19 | `modules/duplicates` (balayage) existe | retenu | CODE: attribut par outil |
| 2054.18 | Par outil : douleur | L19 | rien | retenu | CODE: attribut par outil |
| 2054.19 | Une connexion détectée préremplit UNIQUEMENT son outil ; l'audit dit quoi garder | L19 | ⚠ contre-exemple LU : `!ctx.hasConnectedTooling` masque TOUTE la question (`profile-questionnaire.ts:412`) | retenu | CODE: préremplissage par outil, jamais global |
