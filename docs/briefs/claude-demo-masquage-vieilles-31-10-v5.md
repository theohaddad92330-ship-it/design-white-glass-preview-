# Brief — vieilles issues, vague 5 — démo + masquage + doublons (#4106.4 #4107.4 #4116.5 #4114.4 #4113.4)

Contrat VALIDÉ par Louis le 31/10/2026 — rien à redemander.

## Ce que je fais

Lire d'abord le corps de chaque issue (`gh issue view <n>` si gh est dispo, sinon la ligne du point dans le code/les docs) : #4106, #4107, #4113, #4114, #4116.

1. #4106.4 — Démo : un contact dont le 1er fournisseur d'enrichissement de téléphone/e-mail n'a rien rendu et le 2e a répondu (cascade visible dans la démo comme en prod : la trace de cascade existante, jamais le NOM du fournisseur — doctrine « nos fournisseurs ne se nomment jamais »).
2. #4107.4 — Démo : un contact dont l'e-mail est DEVINÉ puis VÉRIFIÉ (SMTP) ; il s'affiche avec le badge/état « vérifié » existant (`email_verified`). Ne casse pas les gardes demo-contacts-badge-coverage / demo-contact-density.
3. #4116.5 — Démo : au moins un appel d'offres public UE (source européenne, type JOUE/TED) sur un compte de démo, visible là où les AO s'affichent en prod.
4. #4114.4 — Écran qui PROPOSE les doublons de PERSONNES (contacts) sans SIREN : le calcul de proposition existe côté API (#4114.1, chercher `duplicate`/`doublon` dans apps/api/src/modules/contacts) ; il manque l'écran. ATTENDU : là où vivent déjà les propositions de doublons (comptes) ou sur la fiche contact, une liste des paires proposées avec la raison du rapprochement et deux gestes : « ce sont les mêmes » (ouvre la porte de fusion EXISTANTE si elle existe, sinon enregistre la confirmation) et « pas les mêmes ». Seedé en démo (une paire). DOCTRINE : on PROPOSE, on ne fusionne JAMAIS automatiquement.
5. #4113.4 — Masquage PII des traces (apps/ia/app/sentry_init.py, apps/ia/app/services/langfuse_client.py) : tests qui prouvent (a) un masque qui PLANTE (exception dans Presidio/regex) renvoie le texte masqué en entier (« [masqué] » ou équivalent existant), JAMAIS le texte brut ; (b) SIREN, CA, effectifs, codes postaux passent intacts. Corriger le code si un des deux tests échoue.

## Je ne fais PAS

Aucune fusion automatique ; rien d'affiché masqué à l'écran (le masquage ne vise que les traces Langfuse/Sentry) ; aucun nouveau fournisseur ; aucune migration de données existantes ; rien sur /chat.

## Je défais

Rien. Garde #4106, #4107, #4113, #4114, #4116 et la règle « on propose une fusion, on ne fusionne jamais ».

## Droits

La liste des doublons de personnes suit EXACTEMENT les droits de lecture/écriture de la fiche contact existante (même garde, même portée espace/BU) ; un test prouve qu'un utilisateur d'un AUTRE espace ne voit aucune paire.

## Démo (craft rule n°9)

Tout ce qui précède se sème dans apps/api/src/modules/demo/demo-dataset.ts (+ DemoSeedService) et se classe dans demo-coverage.ts (seedé).

Périmètre : apps/api/src/modules/demo/** · apps/api/src/modules/contacts/** · apps/web/src/** · locales FR+EN · packages/contracts/src/** · apps/ia/app/sentry_init.py · apps/ia/app/services/langfuse_client.py · apps/ia/tests/** · CHANGELOG* · changes/** · docs/briefs/**

## Méthode

- Antériorité d'abord : `git log --oneline -S '<symbole>' origin/main | head` ; un point déjà juste = « déjà juste + preuve » au rapport, on ne le recode pas.
- TDD : un test qui ÉCHOUE d'abord par point.
- Règles design (CLAUDE.md) : pas de hex en JSX, échelle typo, dvh, pas de <Navigate>, cibles ≥ 44 px, icône nommée, motion.ts, tutoiement FR. FR + EN. Changelog si user-facing.
- Trace `// #<point> — <raison>`. Commits groupés avec les numéros dans le sujet.
