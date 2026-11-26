# Lots — sujet 4 « Questionnaire onboarding — contenu des étapes »

Périmètre : **#2013→#2060 hors #2014** (classée sujet 1), soit **47 issues, 600 demandes**
(vérifié par somme des `points≈` du digest, recompte ligne à ligne ci-dessous — total exact 600).
Source : `python3 tools/issues/digest.py --screen /onboarding` et `--screen /welcome`
(`--label beta-feedback --limit 300`), copiés dans
`scratchpad/digest-onboarding.md` (74 868 c, 56 issues) et `scratchpad/digest-welcome.md`
(51 119 c, 34 issues). Corps brut jamais relu (`gh issue view` non utilisé).

⚠️ Toutes les 47 issues portent le MÊME locator widget (`OnboardingWizard.tsx:47/40`,
`App.tsx:113/96`) — c'est le wrapper générique capturé par le widget de feedback, PAS le
composant réel touché par la demande. Le tableau ci-dessous cite les fichiers réels,
trouvés par lecture du code (`apps/web/src/features/onboarding/`), pas par ce locator.

Existant vérifié (état au 14/09/2026, `origin/main` = `8c7eac5ca`, aucun retard, `git rev-list --count HEAD..origin/main` = 0 après fetch) :
- Wizard réel : 3 stages / 9 sous-étapes, `apps/web/src/features/onboarding/lib/questions.ts:322-348`
  (`company_info→entreprise,equipe-commerciale` ; `offer_expertise→domaine-offre,domaines,
  positionnement,recrutement` ; `target_market→secteurs,cibles,frein`) — **~10 questions au total**,
  pour 600 demandes qui en ajoutent des dizaines : l'écart de volume EST le sujet.
- `OnboardingStepper` : appelant réel confirmé `OnboardingWizard.tsx:79`
  (`<OnboardingStepper currentStageIndex={sub.stageIndex} />`), mais `done = i < currentStageIndex`
  (`OnboardingStepper.tsx:12`) est un ✅ **positionnel**, pas un état réel — défaut déjà documenté
  (`chantiers-livres.md:957-960`), NE PAS le lire comme une preuve d'étape faite.
- `PrefillBadge` : appelant réel confirmé `SubStepQuestions.tsx:32` (`{meta && <PrefillBadge meta={meta} />}`) —
  montre déjà source + confiance + rationale (tooltip), PAS de date ni de boutons distincts
  confirmer/corriger/ignorer — couverture PARTIELLE de #2028.
- `ProfileComplementCard` (Temps-2 : `decision_maker_personas`, `avg_sales_cycle`, `avg_tjm`,
  `client_references`, `no_go_sectors`) : appelant réel confirmé
  `apps/web/src/features/dashboard/view/DashboardContent.tsx:31` — mécanisme séparé du wizard
  Temps-1, déjà en prod, pas mort.
- `OnboardingCompanyPage.tsx` (écran 1, « Quelle est votre ESN ? ») : appelle déjà
  `POST /esn-profile/prefill` via `useEsnPrefill()` (`OnboardingCompanyPage.tsx:39`), gère déjà
  candidats multiples (`PrefillCandidate`, `ambiguous`) — **PARTIEL** pour #2015 : le mécanisme de
  recherche/désambiguïsation existe, reste à vérifier quels champs de la carte de confirmation
  (SIREN, groupe/filiale, statut actif…) manquent réellement à l'écran.
- `EsnAnswers` (`packages/contracts/src/schemas/onboarding.ts:65-152`) contient déjà `user_role`,
  `role_tenure` (optionnels) — **aucun écrivain trouvé** dans `questions.ts` ni
  `complement-questions.ts` : candidat au motif « champ de schéma que personne n'écrit »,
  symétrique du motif n°1 — à vérifier avant de recoder #2032/#2033 dessus.
- `apps/ia/app/models/profile_context.py` pattern-matche `positioning` en FRANÇAIS littéral
  (ex. ligne 130, 205, 220, 280, 453) — tout lot qui change les VALEURS (pas juste ajoute des
  questions) de `positioning`/`offer_domains`/`target_sectors` doit coordonner avec ce fichier
  IA, sous peine de casser le prompt en silence (commentaire déjà présent `questions.ts:8-13`).

## Contradictions / chevauchements internes au sujet (au-delà de #2013/#2086 déjà signalé au manifeste)

1. **#2023 vs #2030 — vocabulaire de progression incohérent, même objet.** #2023 nomme 7 étapes
   affichées (« Votre organisation…Votre audit ») ; #2030 nomme 8 blocs de récap (« Entreprise,
   BU, Utilisateur, Offre, Marché, Système, Objectifs, Inconnues »), sans BU dans la liste de
   #2023. Pas une contradiction frontale, mais les deux écrivent dans le même fichier
   (`OnboardingStepper.tsx` / futur écran récap) — à harmoniser AVANT codage, sinon un des deux
   noms gagne par accident.
2. **#2040 vs #2044 — même champ, deux extensions indépendantes.** #2040 demande d'ajouter
   « recrutement fixe chez le client » comme mode distinct sur `staffing_model` ; #2044 (chemins
   d'accès) redemande une distinction de mode voisine sans se référencer l'un l'autre. Même
   fichier (`questions.ts`, `Q.staffing_model`) — à fusionner dans UN seul lot de schéma, pas deux
   PR qui se marchent dessus.

## Arrêts obligatoires touchés dans ce sous-ensemble

- **Cloisonnement `workspace_id` / droits de rôle** : #2016 (rejoindre un espace ESN existant —
  admin, invitation, données partagées selon droits), #2017 (modèle BU — hérite du profil
  entreprise sans dupliquer), #2018 (correction envoyée à l'administrateur), #2033 (« alimenter
  RBAC » explicitement écrit dans le corps).
- **Aucune facturation, aucun envoi sortant réel, aucune suppression de masse, aucune migration
  qui rétrécit** trouvés dans ce sous-ensemble précis (le sujet 1 les porte, cf. manifeste §6).

## Points touchant la doctrine (à trancher avec Louis, règle citée)

- **#2027** (« ne pas forcer une fausse précision », états distincts « je ne sais pas encore ») —
  règle *« non mesuré n'est jamais 0 »*, primitives `UnknownValue`/`MeasuredValue`. La demande est
  ALIGNÉE avec la doctrine existante, mais aucune de ces primitives n'est câblée dans
  `validation.ts` aujourd'hui (0 occurrence de « sais pas »/`dontKnow` dans `SubStepQuestions.tsx`) —
  à confirmer avec Louis que l'implémentation prévue réutilise bien `UnknownValue`/`ScoreWithAxes`
  plutôt que d'inventer un mécanisme parallèle.
- **#2052** (« distinguer objectif / repère de travail / ambition / prévision », « aucune promesse
  de résultat automatique ») — règle *aucune PROBABILITÉ affichée* (refusée 6 fois). Alignée, mais
  le champ « prévision » nommé dans le corps est à vérifier : un champ nommé « prévision » peut
  dériver vers un affichage de probabilité si mal cadré à l'implémentation.
- **#2049** (« ne calculer aucun taux lorsqu'un dénominateur fiable manque ») — même registre que
  *« non mesuré n'est jamais 0 »*, alignée avec la doctrine, à garder au moment du codage (pas de
  `COALESCE`/`0` silencieux sur un taux).

## Tableau des lots

| Lot | Issues | Demandes | Fichiers à toucher | Déjà là ? (appelant) | Arrêt/doctrine | Taille |
|---|---|---|---|---|---|---|
| L1 — Page 0 : bienvenue | #2013 (+ cross-ref #2086, sujet 7, hors 600) | 12 | `apps/web/src/features/onboarding/components/OnboardingIntroCard.tsx` (existe, minimal : titre+description i18n seulement, pas d'avatar Laura ni CTA dédiés) | Carte minimale seulement — pas la « page 0 » pleine demandée. **À TRANCHER EN PREMIER** : #2013 et #2086 spécifient la même page avec 2 maquettes différentes, contradiction déjà signalée au manifeste §3 | naming-no-version-suffixes violé par le titre « V3 » de #2086 (signalé, non corrigé) | petit |
| L2 — Rejoindre un espace ESN existant | #2016 (cross-ref #2014, sujet 1, hors 600) | 10 | `apps/web/src/features/onboarding/view/OnboardingCompanyPage.tsx`, `apps/api/src/modules/onboarding/onboarding.service.ts`, module workspace (`apps/api/src/modules/workspace/workspace-team.service.ts`) | Rien trouvé pour la détection « domaine correspond à un workspace existant » ; recherche entreprise seule existe (voir L3) | **ARRÊT** cloisonnement `workspace_id` — admins, invitation, droits | gros |
| L3 — Confirmation entreprise enrichie + BU/périmètre | #2015, #2017 (cross-ref #2005, sujet 1) | 31 | `apps/web/src/features/onboarding/view/OnboardingCompanyPage.tsx:39` (`useEsnPrefill`), `apps/web/src/features/onboarding/lib/questions.ts:328` (sous-étape `entreprise`), contrat `PrefillCompany`/`PrefillCandidate` | **PARTIEL** : `POST /esn-profile/prefill` + désambiguïsation (`ambiguous`, `candidates`) déjà appelés par `OnboardingCompanyPage.tsx:39` ; champs de confirmation (SIREN, groupe/filiale, statut actif) et sous-étape BU à vérifier/ajouter | **ARRÊT** BU = `workspace_id`/droits ; **chevauchement direct avec #2005** (sujet 1, même concept BU) — fusionner avant de coder | gros |
| L4 — Ne pas refaire remplir un profil déjà configuré + confidentialité | #2018, #2019 | 17 | `apps/web/src/features/onboarding/hooks/useOnboarding.ts`, `apps/web/src/features/onboarding/lib/guard-state.ts`, `apps/web/src/features/onboarding/lib/pending-steps.ts` (correction envoyée à l'admin = nouvelle route API) | `pending-steps.ts`/`guard-state.ts` gèrent déjà la reprise par membre (cf. manifeste §5, `firstPendingSubStep`) — mécanisme de correction→admin non trouvé | léger RBAC (demande de correction transmise à l'administrateur) | moyen |
| L5 — Laura guide contextuelle + préférences d'interaction | #2020, #2058 | 26 | `apps/web/src/features/onboarding/components/OnboardingHelpCard.tsx` (existe, test associé) | Composant existe et a un test (`OnboardingHelpCard.test.tsx`) — comportement demandé (résumer l'étape, détecter contradiction, une seule intervention/écran) non vérifié champ par champ | — | moyen |
| L6 — Repaint UX premium + charge cognitive + conséquence visible | #2021, #2024, #2025 | 34 | `apps/web/src/features/onboarding/view/OnboardingWizard.tsx`, `components/SubStepQuestions.tsx`, `components/QuestionField.tsx` | Structure existe (1-2 questions/écran déjà le pattern des `SubStep`) ; typographie/largeur/contrastes à auditer contre les gardes design (GA-31 typo, GA-33 AA, D81 largeur 70 ch) | Gardes design (`apps/web/src/architecture/`) — **DOIT PASSER EN PREMIER** : L8/L10/L11/L12/L14-19 touchent les mêmes fichiers `SubStepQuestions.tsx`/`QuestionField.tsx` | gros |
| L7 — Reconfiguration guidée des espaces existants | #2022 (cross-ref #2004/#2084, sujet 1) | 8 | `apps/web/src/features/onboarding/lib/guard-state.ts`, `lib/onboarding-gate.ts`, `lib/pending-steps.ts`, migration additive sur `esn_profiles`/`user_onboarding_state` | Machine d'état existe (sujet 1) avec le défaut positionnel déjà nommé (`OnboardingStepper.tsx:12`) — cette demande redemande la même machine d'état, pas un nouveau chantier | naming « V3 » (le titre lui-même vient du batch #2086-2091) ; migration additive seulement (GA-08) | gros |
| L8 — Progression par résultat + récap avant génération | #2023, #2030 | 25 | `apps/web/src/features/onboarding/components/OnboardingStepper.tsx:12` (fixe le `done` positionnel), `view/OnboardingWizard.tsx` (barre %), nouvel écran récap (`view/OnboardingPlanPage.tsx` à étendre ou nouveau composant) | `OnboardingStepper` appelé réellement (`OnboardingWizard.tsx:79`) mais `done` positionnel — PAS un état réel, exactement ce que #2023/#2030 redemandent implicitement (afficher un vrai état par bloc) | contradiction interne #2023 vs #2030 (vocabulaire des étapes, voir plus haut) | moyen-gros |
| L9 — Autosave visible | #2026 | 7 | `apps/web/src/features/onboarding/hooks/useOnboarding.ts`, `api.ts` | `hydrate(state.answers)` existe déjà (`OnboardingWizard.tsx:23`) donc un socle d'autosauvegarde tourne — horodatage affiché (« Enregistré à 14 h 32 ») non trouvé | — | petit-moyen |
| L10 — États d'incertitude (« je ne sais pas encore ») | #2027 | 5 | `apps/web/src/features/onboarding/lib/validation.ts`, `components/QuestionField.tsx`, `packages/contracts/src/schemas/onboarding.ts` (nouvel état par champ) | **RIEN trouvé** : 0 occurrence de « sais pas »/`dontKnow`/`applicable` dans `SubStepQuestions.tsx` — capacité réellement absente, pas un doublon | **DOCTRINE** « non mesuré n'est jamais 0 » — alignée, à câbler avec `UnknownValue` existant plutôt qu'un mécanisme parallèle (à trancher) | gros (touche tout champ du questionnaire) |
| L11 — Provenance complète du prérempli | #2028 | 8 | `apps/web/src/features/onboarding/components/PrefillBadge.tsx`, `hooks/useEsnPrefill.ts` | **PARTIEL** : `PrefillBadge` appelé réellement (`SubStepQuestions.tsx:32`), montre source+confiance+rationale ; manque date + boutons confirmer/corriger/ignorer explicites | — | moyen |
| L12 — Challenge intelligent des contradictions | #2029 | 11 | nouveau module de détection (`apps/web/src/features/onboarding/lib/`), `components/SubStepQuestions.tsx` ou nouveau composant dédié | Rien trouvé côté web ; à vérifier côté IA si un mécanisme de détection de contradiction existe déjà pour l'audit (sujet 3, #2064 « contradictions commerciales ») — chevauchement possible à vérifier avant de coder deux fois | — | gros |
| L13 — Déduction/import avant question | #2031 (cross-ref sujet Import #2079/#2080) | 10 | `apps/web/src/features/onboarding/hooks/useEsnPrefill.ts`, connecteurs CRM (`apps/api/src/modules/crm/`), `apps/api/src/modules/onboarding/onboarding.service.ts` | Prefill « champ par champ » existe pour l'entreprise (L3) ; rien trouvé pour CRM/agenda/messagerie/fichiers dans le wizard | — | gros |
| L14 — Orientation professionnelle & pouvoir de décision | #2032, #2033 | 26 | `apps/web/src/features/onboarding/lib/questions.ts` (nouvelle sous-étape), `packages/contracts/src/schemas/onboarding.ts:151-152` (`user_role`, `role_tenure` déjà déclarés), `apps/api/src/modules/workspace/workspace-permission.guard.ts`, `workspace-team.service.ts` | **Champ de schéma sans écrivain** : `user_role`/`role_tenure` existent dans `EsnAnswers` (ligne 151-152) mais **0 occurrence** dans `questions.ts` ni `complement-questions.ts` — à vérifier avant d'ajouter un doublon de champ | **ARRÊT** — #2033 écrit explicitement « alimenter RBAC » | gros |
| L15 — Maturité, effectif réel, territoire, qui-fait-quoi | #2034, #2035, #2036, #2037 | 52 | `apps/web/src/features/onboarding/lib/questions.ts:333-340` (stage `offer_expertise`, sous-étape `domaine-offre`), contrat `onboarding.ts` (nouveaux champs), migration additive `esn_profiles` | Sous-étape `domaine-offre` existe avec 1 seule question (`Q.offer_domains`) — les 4 issues en redemandent 15+ | — | moyen |
| L16 — Offre prouvée/disponible/ambition, preuve crédibilité, staffing, secteurs 3 niveaux | #2038, #2039, #2040, #2041 | 50 | `questions.ts:338` (sous-étape `positionnement`), `apps/ia/app/models/profile_context.py` (valeurs `positioning`/`staffing_model` déjà pattern-matchées) | Sous-étape existe (`Q.positioning`, `Q.staffing_model`) ; **#2041 mal classé** : contenu 100% « secteurs » déposé sous la route `positionnement` — vérifier le screen réel avant de router le lot | coordination front+IA obligatoire (casse silencieuse du prompt sinon) ; **chevauchement #2040/#2044** (même champ `staffing_model`, voir plus haut) | moyen-gros |
| L17 — Client idéal, interlocuteurs, chemins d'accès, réseau existant | #2042, #2043, #2044, #2045 | 60 | `questions.ts:339` (sous-étape `recrutement` du stage `offer_expertise`) | Sous-étape existe (`Q.recruits_for_clients`, 1 question) — 4 issues en redemandent ~10 | chevauchement #2044/#2040 (voir plus haut) | moyen-gros |
| L18 — Vivier recrutement actionnable & capitalisation missions | #2046, #2047 | 32 | `questions.ts:343-346` (stage `target_market`, sous-étape `secteurs`) | Sous-étape `secteurs` existe (`Q.target_sectors`) — **les deux issues sont mal classées** : leur contenu (vivier de recrutement, missions passées/clients) n'a rien à voir avec « secteurs cibles » — vérifier le screen réel avant de router | — | moyen |
| L19 — Bloc entreprise étendu (13 sous-thèmes) | #2048, #2049, #2050, #2051, #2052, #2053, #2054, #2055, #2056, #2057, #2059, #2060 | 176 | `questions.ts:328` (sous-étape `entreprise`, très probablement une NOUVELLE sous-étape/stage tant le volume est grand), contrat `onboarding.ts` (12 groupes de champs neufs), migration additive `esn_profiles`, `apps/ia/app/models/profile_context.py` (consommation des nouveaux champs) | Sous-étape `entreprise` existe avec 2 questions (`Q.esn_name`, `Q.consultant_size`) — 12 issues en redemandent des dizaines : **le plus gros écart volume demandé / existant du sujet** | **DOCTRINE** #2049 (aucun taux sans dénominateur fiable → « non mesuré n'est jamais 0 »), #2052 (aucune promesse de résultat automatique → aucune probabilité affichée) — alignées, à garder au codage | GROS — front + API + IA |

## Total de vérification

12+10+31+17+26+34+8+25+7+5+8+11+10+26+52+50+60+32+176 = **600** (47 issues, somme exacte).

## Fichier

`/private/tmp/claude-501/-Users-louisschlegel-Desktop-belllum-monorepo/4d9e3be3-7b95-4d53-8ff0-377ace3c6905/scratchpad/lots-onboarding-questionnaire.md`
