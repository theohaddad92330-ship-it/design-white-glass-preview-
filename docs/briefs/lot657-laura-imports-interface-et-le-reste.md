# Lot 657 — Laura, imports, interface et le reste (#4398 #4480 #4608 #4688 #4689 #4690 #4691 #4693 #4694 #4695 #4696 #4700 #4737 #4748 #4800 #4804 #4813 #4817 #4818 #4830 #4833 #4837 #4845 #4868 #4869 #4873 #4875 #4876 #4886 #4893)

Périmètre : `apps/web/src/features/accounts/model/accountsSearch.ts`, `apps/web/src/features/consultants/view/detail/TalentFieldGroup.tsx`, `apps/web/src/lib/api-error.ts`, `apps/web/src/i18n/locales/**`, `docs/briefs/*`

Antériorité (vérifiée sur origin/main) : #4480, #4608, #4688–#4694, #4700, #4817, #4837 déjà livrés (commentés avec preuve). #4893, #4813, #4876 (lot 627, #4910) et #4818 (#4912) ont été livrés sur main PENDANT ce lot : leurs versions sont reprises telles quelles, rien n'est recodé. #4695 : en-têtes d'auth prouvés par #4909.

Ce que le lot fait : #4886 `canceled` entre dans le schéma de recherche de /accounts ; #4833 (moitié) un refus de validation nomme champ + règle et dit quand il vient d'un autre champ ; #4845 le test synchrone de AccountStrategy5PCard attend le routeur ; et le test AccountDetailTabContent bouche le panneau d'offres (rouge sur main depuis #4914 : « useSession must be used within a SessionProvider »).
Ce que le lot NE fait pas : aucun workflow (#4830, #4869, #4873), pas la montée de routeur (#4868), aucune surface d'accès, pas la barrière équipe des séquences (#4804, dépend de #4803), ni LinkedIn (#4737), ni la base commune (#4800), ni la cause du refus de « Nom complet » (#4833 reste ouverte).
Ce que le lot défait : rien.

Décisions relevées par `git blame` sur les lignes modifiées : garde #4463 (tests d'absence de crédit : seul l'import de `act` change dans le fichier de test), garde #4507 (équipe du compte lisible : on ajoute `canceled` à l'enum de statut, rien d'autre).
