# Rapport — lot COMPTES-SAVOIR (2510)

Branche `claude/comptes-savoir-2510` (base origin/main f3b199c1), pas de PR. 3 commits, 2 points déjà livrés sur main.

- **#4323** `presentEsn.ts` : la liste unique existait déjà. Ajout : `probableSameEsn` — « Groupe SII » / « SII » restent 2 lignes, chacune porte « Peut-être la même société que… Non fusionnée » (jamais écrit en base). Tests rouge→vert (presentEsn + PresentEsnList, 16 verts).
- **#4324** `account-strategy-5p.ts` `isTechnicalDeciderTitle` (déjà élargi par #4324.1/.2) : ajout sigles pointés (D.S.I., R.S.S.I), « Dir. SI », DSIT, « Services Informatiques », « sécurité de l'information ». Garde-NON (stagiaire, achats IT, directeur technique, sécurité incendie, data) testée. 117 verts. L'écran dit déjà le siège vide (`technicalSeatGap`).
- **#4327** `entityData.ts` : cause PROUVÉE côté web = `appendSubsidiaries` jetait TOUTES les filiales quand le nom du compte était inconnu (test rouge → vert). Le prompt facts nomme déjà Fortuneo/Suravenir, le vocabulaire du groupe alimente la liste, « non confirmée » étiquetée (#4327.1/.2, déjà sur main). NON prouvé : que Fortuneo sorte bien du modèle en prod (pas de réseau/clé ici) — à confirmer en recette sur Arkéa.
- **#4538** déjà corrigé sur main (07429209, N-SUIVIS : chaque suivi a sa ligne, plafond 3/utilisateur inchangé). FollowedAccountsSection.test vert (29 verts avec #4526).
- **#4526** déjà livré sur main (f62f6151…a611f7e3) : puce « Mon CRM » comptes + contacts, prédicat unique incluant les comptes `origin IS NULL` liés CRM, démo semée. Non re-codé.
  Non fait : recette Chrome (#4526), tsc complet (CI). Arbitrage : fusion ESN proposée par mots d'enveloppe (groupe/group/france/sa/sas…) — le plus simple.
