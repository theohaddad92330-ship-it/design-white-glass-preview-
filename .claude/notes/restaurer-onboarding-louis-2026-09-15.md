# ⚠️ RESTAURER l'onboarding de Louis — 15/09/2026

Louis a demandé explicitement (15/09, nuit) de basculer son espace en `refresh_required`
pour rendre l'onboarding recettable. **Ceci est la fiche de restauration.**

## L'état AVANT la bascule — mesuré sur `GET /api/onboarding/state`

```json
{
  "id": "9d359267-f7ee-430f-a614-2044a2e77ab5",
  "status": "completed",
  "current_stage_code": "transition_summary",
  "skipped_at": null,
  "inherited_answer_keys": [],
  "answers": "52 clés"
}
```

## Le chemin de retour

Transitions autorisées (`apps/api/src/modules/onboarding/onboarding.service.ts:93-106`) :

```
completed → refresh_required        (POST /api/onboarding/refresh, requestRefresh)
refresh_required → in_progress      (advanceStage)
in_progress → completed             (complete)
```

Donc le retour se fait en **deux appels** : `advanceStage` puis `complete`.

⚠️ **Ce qu'il faut vérifier après restauration** :
1. `status` revient bien à `completed` ;
2. `current_stage_code` revient à `transition_summary` (il peut être repositionné par
   `advanceStage` — le noter s'il diffère) ;
3. les **52 réponses** sont intactes (`Object.keys(answers).length === 52`) ;
4. `skipped_at` reste `null`.

⚠️ **Ce qui n'est PAS garanti** : `complete` peut relancer une génération de profil.
Si c'est le cas, c'est sans perte (les réponses ne bougent pas) mais ça consomme.

## Si la session se termine avant la restauration

**Dire à Louis que son espace est resté en `refresh_required`**, et lui donner les deux
appels ci-dessus. Ne jamais laisser l'information seulement dans le fil.

## ⚠️ AJOUT 15/09 — la recette ÉCRIT des réponses, et elles ne sont pas dans l'état d'avant

L'état d'avant que cette fiche note (status/stage/52 clés) ne dit PAS que **33 des 52
clés étaient VIDES**. La recette du questionnaire les remplit. Remettre `completed` ne
les revide pas.

Clés vides AVANT la recette (33) :
offer_domain · decision_maker_personas · avg_sales_cycle · avg_tjm · client_references ·
no_go_sectors · consultants_on_mission · consultants_in_pipe · team_overlap ·
ramp_up_capacity · avg_deal_size · target_margin · portfolio_size ·
accounts_relationship_status · weekly_calls · weekly_emails · weekly_linkedin ·
proactivity_level · public_sector_practice · regulated_sector_readiness ·
partner_relationship · go_to_market_channels · sales_routine · sales_blockers · tooling ·
shared_data_scope · esn_maturity_situation · active_clients_band · revenue_recurrence ·
client_concentration_risk · company_growth_goal · consultants_managed_by_user_band ·
available_consultants_band

Remplies AVANT (19, à NE PAS toucher) : esn_name · consultant_size · sales_team_size ·
expertise_areas · positioning · target_sectors · target_company_types · staffing_model ·
geo_zones · main_sales_pain · offer_domains · recruits_for_clients · user_role ·
role_tenure · industry_tenure · individual_goal · monthly_target · company_age ·
company_size

**Trois écrans ont reçu un premier jet incohérent** (le sélecteur prenait l'option 1) :
`company_info/sante-activite` (« Aucun client actif », « Essentiellement du contrat
récurrent », « Un client représente plus de… ») et `company_info/effectif-reel`
(« Aucun consultant géré », « Aucune disponibilité ») — sur un espace qui vient de se
déclarer **en croissance**. À reprendre depuis l'écran de revue avant de finir, sinon
l'audit de Louis part sur un profil faux.

**À dire à Louis** : la recette de l'onboarding a nécessairement écrit dans ces 33
champs. C'est le prix de la mesure ; les 19 réponses d'origine sont intactes.
