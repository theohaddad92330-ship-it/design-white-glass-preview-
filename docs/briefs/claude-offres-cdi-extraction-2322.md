# Brief — #2322.70 — extraction des offres CDI (rôle, équipe, compétences, tension)

Contrat VALIDÉ par Louis le 31/10/2026. Branche : `claude/offres-cdi-extraction-2322`.

COMPRIS : #2322.70 — une offre d'emploi CDI collectée sur un compte doit donner RÔLE, ÉQUIPE, COMPÉTENCES et TENSION (signal de difficulté à recruter). Mesuré en prod : les 27 offres d'EXTIA n'affichent que titre, lieu, date (dossier compte › Offres d'emploi IT) ; aucune compétence, aucune équipe, 0 « en tension ».

JE FAIS :

1. Trouver d'abord ce qui existe (`git grep -n 'tension\|skills\|competen' apps/ia/app` ; extraction déjà codée mais sans appelant = brancher, pas recoder).
2. À la collecte des offres, extraire rôle / équipe / compétences / tension depuis le texte de l'offre, par règles déterministes d'abord, modèle Haiku seulement si le texte l'exige (sortie JSON validée, max_tokens borné, cache par empreinte d'offre). Tension = UNIQUEMENT si le texte le prouve (republication, « urgent », durée de publication mesurée…), avec sa raison ; sinon aucun champ (jamais « 0 », jamais deviné).
3. Afficher ces champs sur la carte d'offre du dossier compte ; un champ absent ne fait AUCUNE ligne.
4. RATTRAPAGE (doctrine CLAUDE.md « Un correctif de collecte RATTRAPE l'existant ») : inscrire la capacité dans SEGMENT_CAPABILITY_HISTORY (packages/contracts/src/schemas/segment-catchup.ts) sur le segment des offres/signaux, pour que les comptes déjà collectés affichent « collecte antérieure » et soient rejouables CIBLÉS par l'opérateur. Le rejeu ne part JAMAIS seul au déploiement. Test qui échoue sans l'entrée.
5. Démo : semer des offres avec ces champs (demo-dataset.ts + demo-coverage.ts).

JE NE FAIS PAS : aucune nouvelle source ni fournisseur, aucune source nommée à l'écran, aucun rejeu automatique, rien sur /chat ni sur Découvrir, aucune borne d'âge ajoutée (décision Louis 31/10 : zéro borne d'âge sur signaux/besoins). Une session Signaux travaille sur le tableau Actuel/Historique : NE PAS toucher à la structure de ce tableau, seulement à la carte d'offre et à l'extraction.

JE DÉFAIS : rien. Garde #2322, #4754, #4837, c79 (collecte large mais propre).

DROITS : inchangés. Sans clé modèle = no-op strict (règles seules).

Périmètre : apps/ia/app/** · apps/ia/tests/** · apps/api/src/modules/accounts/** · apps/api/src/modules/signals/** · apps/api/src/modules/demo/** · apps/web/src/features/accounts/** · locales FR+EN · packages/contracts/src/** · CHANGELOG* · docs/briefs/**

MÉTHODE : antériorité (`git log -S`) sur chaque fichier touché, #NNN cités au commit ; TDD (test qui échoue d'abord) ; chaque endpoint FastAPI a son pytest ; FR+EN, tutoiement ; trace `// #2322.70 — …` ; commits avec le numéro au sujet.

RÈGLES : aucun sous-agent, rien en fond, tests CIBLÉS, jamais la suite complète ni build ; jamais .github/workflows ni .claude/ ; rien sur main ; plafond 300 tours (à 240 : commit, push, stop) ; `git push --no-verify` après chaque point vert ; PAS de PR. Rapport ≤ 15 lignes dans docs/briefs/claude-offres-cdi-extraction-2322-rapport.md, puis STOP.
