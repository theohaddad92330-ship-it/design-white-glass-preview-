p='apps/api/src/modules/demo/demo-coverage.ts'
s=open(p).read()
def rep(a,b):
    global s
    c=s.count(a)
    assert c>=1,(a[:90])
    s=s.replace(a,b)

# 636
rep(""" * moins une priorité — les trois entrées ajoutées ce jour-là (Decathlon +10j,
 * leboncoin +17j, SNCF +24j) existent POUR CETTE RAISON, en plus des trois
 * tâches déjà seedées le 16/09 (Thales +3j, Société Générale sans échéance,
 * BlaBlaCar en retard).""",""" * moins une priorité — les trois entrées ajoutées ce jour-là (Société Générale
 * +10j, Groupe BPCE +17j, SNCF +24j) existent POUR CETTE RAISON, en plus des
 * trois tâches déjà seedées le 16/09 (SNCF +3j, Société Générale sans
 * échéance, Groupe BPCE en retard).""")
rep("""mais SNCF (et leboncoin) portent déjà `priority_gate: 'pending'`,""","""mais SNCF (et Groupe BPCE) portent déjà `priority_gate: 'pending'`,""")
# 1246 discover similarity: handled later (Verdal) -> keep placeholder replaced after dataset change
# 1500-1531
rep(""" * fixtures écrit — signals aussi, sur CINQ des six dossiers (Société
 * Générale, leboncoin, BlaBlaCar, SNCF, Decathlon : `signals_collected_at`""",""" * fixtures écrit — signals aussi, sur DEUX des trois dossiers (Société
 * Générale, Groupe BPCE : `signals_collected_at`""")
rep(""" * MAIS ce lot sème AUSSI, à dessein, le témoin OPPOSÉ : Thales porte""",""" * MAIS ce lot sème AUSSI, à dessein, le témoin OPPOSÉ : SNCF porte""")
rep(""" * antérieure ». Les deux témoins coexistent dans la MÊME salle : un compte
 * sur six DIT que sa collecte est fraîche, cinq DISENT qu'elle est antérieure""",""" * antérieure ». Les deux témoins coexistent dans la MÊME salle : un compte
 * sur trois DIT que sa collecte est fraîche, deux DISENT qu'elle est antérieure""")
rep("""Cinq des six dossiers ne portent aucun signals_collected_at""","""Deux des trois dossiers ne portent aucun signals_collected_at""")
rep("""Thales SEUL porte une date FRAÎCHE""","""SNCF SEUL porte une date FRAÎCHE (re-semée sur SNCF le 01/10/2026, retrait de Thales qui la portait)""")
rep("""`signals` sème un témoin OPPOSÉ (Thales, `signals_collected_at` fraîche)""","""`signals` sème un témoin OPPOSÉ (SNCF, `signals_collected_at` fraîche)""")
rep(""" * Six des huit dossiers (Société Générale, Thales, leboncoin, BlaBlaCar,
 * SNCF, Decathlon) portent PAR AILLEURS""",""" * Deux des trois dossiers (Société Générale, SNCF) portent PAR AILLEURS""")
rep("""(le compte Thales de {@link DEMO_DOSSIERS}) à chaque semis""","""(le compte Société Générale de {@link DEMO_DOSSIERS}) à chaque semis""")
rep(""" *  - `consultant_en_place` — Patrice Caine (Thales), lien VÉRIFIÉ ⇒ badge""",""" *  - `consultant_en_place` — Philippe Marchand (SNCF), lien VÉRIFIÉ ⇒ badge""")
rep(""" *  - `recommandation_directe` — Frédéric Mazzella (BlaBlaCar), lien PAS""",""" *  - `recommandation_directe` — Isabelle Rouault (SNCF), lien PAS""")
rep("""consultant (Patrice Caine, vérifié), recommandation directe (Frédéric Mazzella, non vérifié), ancien collègue (Pierre Palmieri), ancien manager (Lorenzo Bini Smaghi), relation commune (Laurent Trévisani), réseau alumni (Julien Leclercq), événement (Younes Berrada) — sur quatre comptes,""","""consultant (Philippe Marchand, vérifié), recommandation directe (Isabelle Rouault, non vérifié), ancien collègue (Pierre Palmieri), ancien manager (Lorenzo Bini Smaghi), relation commune (Laurent Trévisani), réseau alumni (Karim Belhadj), événement (Céline Lombard) — sur deux comptes (Société Générale, SNCF),""")
rep("""ESN référencée en rang 1 avec placements réels (Thales), client existant (état de relation CRM de leboncoin),""","""ESN référencée en rang 1 avec placements réels (Groupe BPCE), client existant (état de relation CRM de SNCF),""")
rep(""" * déjà classés (`Contact.decision_role`) en quatre trajectoires. Thales
 * (`DEMO_DOSSIERS`) porte déjà un `economic` (Patrice Caine), un `champion`""",""" * déjà classés (`Contact.decision_role`) en quatre trajectoires. SNCF
 * (`DEMO_DOSSIERS`) porte déjà un `economic` (Jean Castex), un `influencer`""")
rep("""déjà semé en abondance sur Thales (DEMO_DOSSIERS) : `economic` (Patrice Caine), `champion` et plusieurs `technical`.""","""déjà semé en abondance sur SNCF (DEMO_DOSSIERS) : `economic` (Jean Castex), `influencer` et plusieurs `technical`.""")
rep("""l'entité résolue de Thales (« c'est bien celle-ci »)""","""l'entité résolue de SNCF (« c'est bien celle-ci »)""")
rep("""UN contrat-cadre signé sur BlaBlaCar,""","""UN contrat-cadre signé sur Société Générale,""")
rep("""// (leboncoin) : sans elle, l'écran""","""// (NOVA LOGISTIQUE) : sans elle, l'écran""")
rep("""salle (Thales, « Point programme ») aurait""","""salle (SNCF, « Point sur le besoin publié ») aurait""")
rep("""ligne `gate_decision` sur Thales le montre depuis""","""ligne `gate_decision` sur Société Générale le montre depuis""")
rep("""le favori GOLDEN posé sur Thales (#2150.14/.18)""","""le favori GOLDEN posé sur Société Générale (#2150.14/.18)""")
rep("""pour l’un des cinq comptes réels de la salle (Société Générale, Thales, leboncoin, BlaBlaCar, SNCF)""","""pour l’un des trois comptes réels de la salle (Société Générale, Groupe BPCE, SNCF)""")
rep("""(`demo-contact-density.ts`, BlaBlaCar) — UN seul""","""(`demo-contact-density.ts`, SNCF) — UN seul""")
rep(""" * nommés — Société Générale, Thales, BlaBlaCar, SNCF, Decathlon, NOVA""",""" * nommés — Société Générale, Groupe BPCE, SNCF, NOVA""")
rep("""avant que Thales ne matérialise la moindre ligne""","""avant que Groupe BPCE ne matérialise la moindre ligne""")
# sprint board reason 5957
rep("""Les six dossiers réels portent chacun un niveau, sur les SIX valeurs — Société Générale en `no_go` (motif : direction informatique verrouillée), BlaBlaCar en `focus`, Thales en `extension`, leboncoin en `volume`, Decathlon en `watch` (sa condition de réveil transcrit mot pour mot sa propre `priority_justification`, pas inventée), SNCF en `partner_route` (#3257.4, lot restes du 29/09) :""","""Depuis le retrait du 01/10/2026 (Louis), les TROIS dossiers réels portent chacun un niveau — Société Générale en `no_go` (motif : direction informatique verrouillée), Groupe BPCE en `volume` (compte importé, non encore arbitré, sans mouvement), SNCF en `partner_route` (#3257.4, lot restes du 29/09) ; `focus`, `extension` et `watch` sont BLOQUÉS (un compte n'a qu'un niveau, les dossiers qui les portaient ont quitté la salle) jusqu'à l'arrivée d'ENGIE, TotalEnergies et Alstom, et `demo-sprint-board-coverage.spec.ts` se resserre toute seule à six dossiers. Pour SNCF :""")
rep("""faute d’un SEPTIÈME compte réel à fabriquer sans donnée fictive""","""faute d’un QUATRIÈME compte réel à fabriquer sans donnée fictive""")
rep("""Thales (`extension`) porte désormais un second partenaire déclaré « (exemple) » (`DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER`, « Kalvyn Access ») — cohérent avec sa propre justification (« l’accès reste moyen faute de relation établie ») — et sa carte""","""Groupe BPCE (`volume`, re-semé le 01/10/2026) porte désormais un second partenaire déclaré « (exemple) » (`DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER`, « Kalvyn Access ») — compte non encore arbitré, sans route d’entrée établie — et sa carte""")
# 6406/6416
rep("""(Société Générale, Thales, SNCF, Decathlon, BlaBlaCar, leboncoin)""","""(Société Générale, Groupe BPCE, SNCF)""")
rep(""" * Générale, Thales, SNCF, Decathlon, BlaBlaCar, leboncoin) sont de VRAIES""",""" * Générale, Groupe BPCE, SNCF) sont de VRAIES""") if ' * Générale, Thales, SNCF, Decathlon, BlaBlaCar, leboncoin) sont de VRAIES' in s else None
# hero states
rep(""" *  - `watching` (« Voir ce qui a changé ») — BlaBlaCar, via `priority_gate:
 *    'parked'` : son récit dit déjà « pas maintenant » (`gate_reason:
 *    'no_budget'`, motif de sortie de sprint écrit).
 *  - `plan-active` (« Continuer la prochaine action ») — Société Générale,
 *    Thales et SNCF : chacune porte un `immediate_action` non vide dans
 *    `raw_analysis`, et aucune n'est `parked`.
 *  - `no-plan` (« Préparer le plan ») — leboncoin : `commercial_status:""",""" *  - `watching` (« Voir ce qui a changé ») — via `priority_gate: 'parked'`.
 *    ⚠️ BLOQUÉ depuis le retrait du 01/10/2026 : les deux dossiers qui portaient
 *    la porte `parked` ont quitté la salle, et un « pas maintenant » sur
 *    Société Générale, SNCF ou Groupe BPCE contredirait leur propre lecture.
 *    `demo-hero-state-coverage.spec.ts` constate l'attente tant que la salle a
 *    moins de six dossiers, et exige l'état dès qu'elle en a six.
 *  - `plan-active` (« Continuer la prochaine action ») — Société Générale
 *    et SNCF : chacune porte un `immediate_action` non vide dans
 *    `raw_analysis`, et aucune n'est `parked`.
 *  - `no-plan` (« Préparer le plan ») — Groupe BPCE : `commercial_status:""")
rep("""        "BlaBlaCar porte `priority_gate: 'parked'` (`gate_reason: 'no_budget'`) : la porte passe devant le plan, et son récit dit déjà « pas maintenant » — le frein documenté est l’équipe interne, mature. Le hero y affiche « Voir ce qui a changé ».",""","""        "Un dossier `priority_gate: 'parked'` : la porte passe devant le plan, et son récit dit « pas maintenant ». Le hero y affiche « Voir ce qui a changé ». ⚠️ BLOQUÉ depuis le retrait du 01/10/2026 : aucun des trois comptes cibles ne peut honnêtement porter cette porte (Société Générale est prioritisée, SNCF et Groupe BPCE en attente de tri) ; l’état revient avec ENGIE, TotalEnergies ou Alstom, et la garde `demo-hero-state-coverage.spec.ts` le réexige à six dossiers.",""")
rep("""        "Société Générale, Thales et SNCF portent chacune un `immediate_action`""","""        "Société Générale et SNCF portent chacune un `immediate_action`""")
rep("""        "leboncoin porte `commercial_status: 'inbox'`""","""        "Groupe BPCE porte `commercial_status: 'inbox'`""")
# no-go
rep(""" * comment l'outil dit non. Le sixième compte (Decathlon, réel — SIREN
 * 500569405) porte maintenant le cas complet :""",""" * comment l'outil dit non. Le compte no-go (réel) portait le cas complet :""")
rep(""" * Passe donc de « vide à dessein » à SEEDÉ.
 */""",""" * Passe donc de « vide à dessein » à SEEDÉ.
 *
 * ⚠️ BLOQUÉ depuis le retrait du 01/10/2026 (Louis) : le seul compte no-go a
 * quitté la salle, et le refus ne se re-sème PAS sur Société Générale, SNCF ou
 * Groupe BPCE (un `STOP` y contredirait leur lecture PRUDENT). Il revient avec
 * le prochain dossier no-go (ENGIE, TotalEnergies, Alstom — autre lot) ;
 * `demo-dossier-read.spec.ts` constate l'attente jusque-là, puis le réexige.
 */""")
rep("""    "Decathlon (sixième dossier réel) porte `evaluation.dossier_read.no_go` complet :""","""    "Le dossier no-go (BLOQUÉ depuis le retrait du 01/10/2026 : aucun des trois comptes cibles n'en porte, voir ci-dessus) porte `evaluation.dossier_read.no_go` complet :""")
rep(""" * Aucun semis dédié : le compte Decathlon ci-dessus porte DÉJÀ `accessibilite:
 * unknown` (pour le no-go), donc `cappedBy` contient `accessibilite` par
 * construction — la même donnée sert les deux capacités, sans contradiction.""",""" * Aucun semis dédié : un compte porte DÉJÀ un axe `unknown` parmi
 * `accessibilite`/`capacite_achat_externe` (Société Générale :
 * `capacite_achat_externe`), donc `cappedBy` n'est pas vide par construction —
 * la même donnée sert la capacité, sans contradiction.""")
rep("""    'Le compte Decathlon (`evaluation.dossier_read`) porte `accessibilite: unknown` (voir `DEMO_DOSSIER_NO_GO_COVERAGE`) : `computeDossierScore` en dérive `cappedBy: ["accessibilite"]`,""","""    'Société Générale (`evaluation.dossier_read`) porte `capacite_achat_externe: unknown` : `computeDossierScore` en dérive `cappedBy: ["capacite_achat_externe"]`,""")
# linkedin-only
rep(""" * Mesuré en production le 22/09/2026 sur Decathlon (`?tab=contacts`, vue""",""" * Mesuré en production le 22/09/2026 sur un compte réel (`?tab=contacts`, vue""")
rep(""" * `demo-dataset.ts` sème un contact SIMULÉ chez Decathlon (Younes Berrada,
 * `decathlonDossier.contacts`) avec""",""" * `demo-dataset.ts` sème un contact SIMULÉ chez SNCF (Younes Berrada,
 * `sncfDossier.contacts`, re-semé le 01/10/2026) avec""")
rep("""Mesuré en production le 22/09/2026 sur Decathlon : les six contacts""","""Mesuré en production le 22/09/2026 sur un compte réel : les six contacts""")
rep("""un contact SIMULÉ chez Decathlon (Younes Berrada)""","""un contact SIMULÉ chez SNCF (Younes Berrada)""")
rep("""un contact SIMULÉ chez BlaBlaCar
 * (Farah Guillet, `DENSITY.BlaBlaCar`)""","""un contact SIMULÉ chez SNCF
 * (Farah Guillet, `DENSITY.SNCF`)""")
rep("""un contact SIMULÉ chez BlaBlaCar (Farah Guillet)""","""un contact SIMULÉ chez SNCF (Farah Guillet)""")
rep("""un contact SIMULÉ chez BlaBlaCar
 * (Hugo Delannoy, `DENSITY.BlaBlaCar`,""","""un contact SIMULÉ chez SNCF
 * (Hugo Delannoy, `DENSITY.SNCF`,""")
rep("""un contact SIMULÉ chez BlaBlaCar (Hugo Delannoy,""","""un contact SIMULÉ chez SNCF (Hugo Delannoy,""")
# entity resolution
rep("""Générale `resolved` / `parent_company` (SIREN, quatre filiales =
 * `subsidiaries`, confiance 86 = la désambiguïsation semée à côté) ; leboncoin
 * `unresolved`""","""Générale `resolved` / `parent_company` (SIREN, quatre filiales =
 * `subsidiaries`, confiance 86 = la désambiguïsation semée à côté) ; SNCF
 * `resolved` / `parent_company` (SIREN, cinq filiales, confirmée par l'espace) ;
 * Groupe BPCE `unresolved`""")
rep("""(Thales, Société Générale…), aucune ne se classe hors périmètre""","""(SNCF, Société Générale…), aucune ne se classe hors périmètre""")
rep("""réels n'est dans ce cas — leboncoin (`unresolved`) porte déjà `domain:
 * 'leboncoin.fr'` via `official_domain`.""","""réels n'est dans ce cas — Groupe BPCE (`unresolved`) porte déjà `domain:
 * 'groupebpce.com'` via `official_domain`.""")
rep("""Société Générale (resolved, maison mère), Thales (resolved puis confirmée par l’espace, #2284.67 — table entity_resolution_corrections) et leboncoin (unresolved)""","""Société Générale (resolved, maison mère), SNCF (resolved puis confirmée par l’espace, #2284.67 — table entity_resolution_corrections) et Groupe BPCE (unresolved)""")
# briefing last outcome
rep("""Générale en tête, Thales ensuite, puis leboncoin). Sans une ligne FAITE""","""Générale en tête, Groupe BPCE ensuite, puis SNCF). Sans une ligne FAITE""")
rep(""" * FAITE de plus sur Thales (« Confirmer le besoin de renfort lié aux 3 300
 * recrutements 2026 », `outcome: 'qualified'`) — le libellé reprend un fait
 * déjà semé (`thalesSignals`), jamais inventé""",""" * FAITE de plus sur SNCF (« Confirmer le besoin de renfort sur la refonte
 * applicative », `outcome: 'qualified'`) — le libellé reprend un fait
 * déjà semé (`sncfChallenges`), jamais inventé""")
rep("""(ordre d'insertion de DEMO_DOSSIERS : Société Générale, Thales, leboncoin) ; DEMO_PLAN_TASKS porte désormais une action FAITE avec issue sur Thales (outcome: 'qualified', libellé repris d'un fait déjà semé, thalesSignals)""","""(ordre d'insertion de DEMO_DOSSIERS : Société Générale, Groupe BPCE, SNCF) ; DEMO_PLAN_TASKS porte désormais une action FAITE avec issue sur SNCF (outcome: 'qualified', libellé repris d'un fait déjà semé, sncfChallenges)""")
rep("""à AUCUNE des six sociétés RÉELLES de `DEMO_DOSSIERS` :""","""à AUCUNE des trois sociétés RÉELLES de `DEMO_DOSSIERS` :""")
rep("""six sociétés RÉELLES ») interdit""","""trois sociétés RÉELLES ») interdit""")
rep("""poser CE besoin sur Decathlon ou l'un des cinq dossiers aurait""","""poser CE besoin sur l'un des trois dossiers aurait""")
rep("""({@link DEMO_COPILOT_DONE_JOB}, Thales, `done`)""","""({@link DEMO_COPILOT_DONE_JOB}, SNCF, `done`)""")
rep("""(done, sur Thales)""","""(done, sur SNCF)""")
open(p,'w').write(s)
print('ok')
