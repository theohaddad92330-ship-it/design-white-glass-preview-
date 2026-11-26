# Registre 27/10/2026 — lot CONTACTS-REPERTOIRE (vague L)

| Point | État | Preuve en recette (geste à l'écran) |
| --- | --- | --- |
| #4644.1 « Suivant » désactivé à la dernière page | déjà là | `/contacts` → page 35/35 : « Prochaine » grisé. Appelant : `ContactContent.tsx` (`contactsPagerOf`, ac3abad2, sur main) |
| #4644.2 plage/numéro bornés par le total | déjà là | idem : jamais « 36 / 35 » ni « 0-875 sur 865 ». Jumeaux contacts : `VerificationStep` borné par `pageBounds` |
| #4613 pastilles « E D T O P » | déjà là | `/contacts` : zéro pastille (commentaire `ContactsNetworkOverview.tsx:123`) ; recette 27/10 = NON REPRODUIT |
| #4600.1-3 e-mail vérifié, partagé ≥ 3, boîte générique, un bloc par cause | déjà là | fiche contact / compte : un bloc « N fiches partagent l'adresse » (`ContactsDuplicateNotice`) |
| #4600.4 compteur / liste | déjà là | bandeau et dialogue lisent le même `useDuplicates()` |
| #4600 (comm.) dialogue sans étiquette de type | livré | `/contacts/imports#hygiene-doublons` → « Relire les doublons » : chaque ligne porte « Compte » ou « Contact » |
| #4597.1-4 puce « Importés », crm ≠ import, import précis, colonne Origine | déjà là | `ContactsQuickChips` / `account-crm-linked.ts` (renversement #4526.4 déjà écrit) |
| #4526 contacts : Filtres › Source › « Mon CRM » rendait 0 | livré | Filtres › Source : « Mon CRM » (ou nom du CRM branché) absent quand 0 contact `crm` ; même libellé que la puce |
| #4526 portefeuille : « Venu de ton CRM » sous Statut = imports | livré (libellé) | Portefeuille › Statut de l'analyse : « Importé, pas encore analysé » (`?status=imported`) ; la puce « Mon CRM » reste `?crm` |
| #4471 balayage 5 000 lignes | déjà là (lecture par curseur, 8646b178) + livré (périmètre dit) | dialogue des doublons : « N comptes et M contacts examinés » même quand des paires restent |
