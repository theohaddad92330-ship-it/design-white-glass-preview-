# #4324 — une place n'est jamais « à pourvoir » quand un titulaire est au dossier (26/10)

**Racine** : trois lectures du même fait. (1) la fiche Couverture (API) ne lisait l'intitulé que pour le siège
technique et seulement si `decision_role` était vide — « À qualifier » (`unknown`) l'empêchait ; (2) l'écran
« Places à pourvoir » (web, `committeeScreenData.ts`) ne lisait QUE le graphe d'organisation, jamais les contacts ;
(3) « meilleure porte d'entrée » lit `best_entry_point` (blob d'analyse) / le classement, pas la liste de l'onglet Contacts.

**Livré**

- `packages/contracts/src/schemas/committee-seat-titles.ts` : UNE lecture `committeeSeatsHeldByContact` (économique, technique,
  achats ; FR+EN ; aucun critère protégé ; rôle posé jamais écrasé ; `unknown` = non posé). `isTechnicalNeighbourTitle` (manager/
  responsable/référent IT) ; `technicalSeatGap` et `derivePeople` lisent « à qualifier ».
- API `coverage.service.ts` : les trois sièges se rapprochent par intitulé. Web : `vacantSeats` exclut les sièges qu'un contact non
  masqué peut tenir, `contactHeldSeats` les NOMME (carte « Tenues par un contact du dossier », fr+en).
- Point 3 : la carte « Meilleure porte d'entrée » NOMME l'écart (nom absent des contacts / contact masqué) — `synthesis-entry-gap`.
- Démo : Élise Varennes (compte SNCF fictif) passée `unknown` = seul titulaire technique ; spec `demo-seat-held-by-title-coverage`.
  Aucune table ni clé `raw_analysis` neuve → rien à classer dans `demo-coverage.ts`.

**Tests rouge → vert** : contracts 147 ; coverage-gaps jest 89 ; comité web 23 (3 rouges avant) ; synthèse 15 (2 rouges avant) ;
architecture+i18n web 274 fichiers verts. Les 4 cas demandés + « sans candidat reste à pourvoir » (contracts, API, web, démo).

**⚠ Effet sur un chiffre affiché** : le 3e axe du taux de couverture (rôles critiques) monte pour tout compte dont un CFO/DAF,
un directeur achats ou un manager IT était « à qualifier » ou sans rôle posé. Dénominateur inchangé (4) ; c'est le numérateur
qui compte désormais ces titulaires. Le plafond 100 % reste levé par le sponsor seul tant qu'aucun rôle posé.

**Non fait / à savoir**

- **Sponsor** : jamais déduit d'un titre (posture, pas intitulé — l'inventer serait une donnée fictive). Reste « à pourvoir » sans rôle posé.
- Test d'un cas `IT Manager` : l'ancien test `it_below_director` utilisait « IT Manager » ; décision 26/10 → il tient désormais le siège, test adapté.
- Point 3 : cause exacte de Caroline Delarue (DHL) non reproduite faute d'accès prod ; l'écart est nommé, pas supprimé.
- Libellés i18n du siège : l'intitulé est lu par motifs (déaccentués), pas par clé i18n — la table existante du dépôt fait pareil.
- `demo-contact-profile.spec` : 1 échec préexistant (`import_job_id`), identique sur main, non touché.
- Aucune PR. `tsc` api : 3 `error TS` (toutes `@bellum/email` introuvable, paquet non construit sur la VM, hors périmètre) ; 0 dans les fichiers touchés.
