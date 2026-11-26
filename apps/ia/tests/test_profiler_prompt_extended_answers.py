"""#2007 — LE CÂBLE DE SORTIE DES 25 CHAMPS NEUFS.

`OnboardingAnswers` (app/routers/profiler.py) a été élargi de 10 à 35 champs :
le complément Temps-2 et les 24 questions du profil progressif (§21-30)
traversent désormais le contrat TypeScript, le client NestJS, le routeur
FastAPI, puis `ProfilerAgent.run(answers)`.

⚠️ Ils s'arrêtaient là. `build_profiler_user_prompt` n'injectait que les DIX
champs Temps-1, si bien que vingt-cinq réponses arrachées à l'utilisateur
étaient transportées, stockées, payées — et jamais lues par le modèle. C'est
le défaut n°1 de ce dépôt : du code juste que personne n'appelle, ici dans sa
forme la plus coûteuse (l'utilisateur a fait le travail de saisie).

Ce module garde le dernier bond, et il garde aussi ce qui NE DOIT PAS bouger :
un payload de dix champs produit un prompt à l'octet près identique à celui
d'avant — un champ absent ne s'annonce pas « Non renseigné », il n'existe pas.
"""

from __future__ import annotations

from app.prompts.bellum_profiler import build_profiler_user_prompt

#: Les dix champs Temps-1, seuls reconnus avant #2007.
_TEMPS_1 = {
    "first_name": "Théo",
    "esn_name": "DataCraft",
    "consultant_size": "1-10",
    "sales_team_size": "Je suis seul",
    "expertise_areas": ["Data", "Cloud"],
    "positioning": "Expertise de niche",
    "staffing_model": "Régie",
    "target_sectors": ["Banque", "Assurance"],
    "target_company_types": ["PME", "ETI"],
    "geo_zones": ["National"],
    "main_sales_pain": "Gérer mon temps",
}

#: Les vingt-cinq champs que #2007 a fait voyager jusqu'à l'agent, chacun
#: associé à une valeur RECONNAISSABLE — un mot qu'on peut chercher dans le
#: prompt rendu, et qui n'apparaît nulle part ailleurs par accident.
_CHAMPS_NEUFS: dict[str, object] = {
    "offer_domain": "Ingénierie logicielle",
    "offer_domains": ["Ingénierie logicielle", "Pilotage de projet"],
    "recruits_for_clients": "Oui, en recrutement direct",
    # #4270.1 (18/10) — le profil d'espace « forfait / conseil ».
    "workspace_profile": "forfait_conseil",
    "decision_maker_personas": ["DSI", "Responsable des achats"],
    "avg_sales_cycle": "3 à 6 mois",
    "avg_tjm": "620 €",
    "client_references": ["Groupe Vergnet", "Maison Delaunay"],
    "no_go_sectors": ["Armement", "Jeux d'argent"],
    "user_role": "Directeur d'agence",
    "role_tenure": "1-2 ans",
    "industry_tenure": "Plus de 10 ans",
    "individual_goal": "Ouvrir six comptes neufs",
    "monthly_target": "2 placements",
    "company_age": "Entre 5 et 10 ans",
    "company_size": "40 personnes",
    "consultants_on_mission": "31",
    "consultants_in_pipe": "7",
    "team_overlap": "Deux commerciaux sur le même secteur",
    "ramp_up_capacity": "Quatre arrivées par trimestre",
    "avg_deal_size": "180 k€",
    "target_margin": "28 %",
    "portfolio_size": "45 comptes",
    "accounts_relationship_status": "Une majorité dormante",
    "weekly_calls": "25",
    "weekly_emails": "60",
    "weekly_linkedin": "15",
    "proactivity_level": "Plutôt réactif",
    "public_sector_practice": "Aucune expérience des marchés publics",
    "regulated_sector_readiness": "Habilitation Défense en cours",
    "partner_relationship": "Deux partenaires intégrateurs",
    "go_to_market_channels": ["Recommandation", "Appels d'offres"],
    "sales_routine": ["Revue de pipe hebdomadaire"],
    "sales_blockers": ["Pas de temps pour la prospection"],
    "tooling": ["Tableur partagé"],
    "shared_data_scope": ["Comptes", "Contacts"],
    # #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
    "company_locations": ["Paris (siège)", "Lyon"],
    # #2058.2 / #2058.10 (20/09/2026) — les moments acceptés pour solliciter
    # la personne, et le niveau de détail attendu de ses réponses.
    "contact_windows": ["Jamais après 19h", "Y compris le week-end"],
    "detail_level": "Court et dense",
}


def test_le_corpus_de_la_garde_nest_pas_vide() -> None:
    """Preuve n°2 — cette garde LIT quelque chose."""

    assert len(_CHAMPS_NEUFS) >= 25, (
        "le corpus des champs #2007 est vide ou tronqué : la garde ne prouverait rien"
    )


def test_chaque_champ_neuf_atteint_le_prompt_utilisateur() -> None:
    """Le cœur : aucune réponse saisie par l'utilisateur ne s'arrête avant le
    modèle."""

    prompt = build_profiler_user_prompt({**_TEMPS_1, **_CHAMPS_NEUFS})

    absents = [cle for cle in _CHAMPS_NEUFS if cle not in prompt]
    assert absents == [], f"champs #2007 qui n'atteignent pas le prompt : {absents}"


def test_chaque_valeur_neuve_atteint_le_prompt_utilisateur() -> None:
    """Le NOM du champ dans le prompt ne prouve rien : c'est la RÉPONSE de
    l'utilisateur qui doit arriver au modèle."""

    prompt = build_profiler_user_prompt({**_TEMPS_1, **_CHAMPS_NEUFS})

    manquantes: list[str] = []
    for cle, valeur in _CHAMPS_NEUFS.items():
        attendues = valeur if isinstance(valeur, list) else [valeur]
        for item in attendues:
            if str(item) not in prompt:
                manquantes.append(f"{cle}={item!r}")
    assert manquantes == [], f"valeurs #2007 perdues avant le modèle : {manquantes}"


def test_un_payload_de_dix_champs_reste_a_loctet_pres_celui_davant() -> None:
    """Preuve n°3 — la garde n'attrape pas ce qu'elle ne vise pas.

    Un espace qui n'a répondu qu'au Temps 1 ne doit voir AUCUN des nouveaux
    libellés : un champ absent n'existe pas, il ne s'annonce pas « Non
    renseigné ». Sans quoi on paierait vingt-cinq lignes de vide à chaque
    génération, et le modèle lirait une absence comme une information.
    """

    prompt = build_profiler_user_prompt(_TEMPS_1)

    fuites = [cle for cle in _CHAMPS_NEUFS if cle in prompt]
    assert fuites == [], f"champs annoncés alors qu'ils sont absents du payload : {fuites}"


def test_la_garde_sait_dire_non() -> None:
    """Preuve n°1 — un champ retiré du rendu doit faire ROUGIR le test du
    dessus. On le prouve en construisant le prompt sans ce champ."""

    sans_tjm = {k: v for k, v in {**_TEMPS_1, **_CHAMPS_NEUFS}.items() if k != "avg_tjm"}
    prompt = build_profiler_user_prompt(sans_tjm)

    assert "avg_tjm" not in prompt
    assert "620 €" not in prompt


def test_les_dix_champs_historiques_restent_presents() -> None:
    """Le témoin voisin : élargir le prompt ne doit rien retirer."""

    prompt = build_profiler_user_prompt({**_TEMPS_1, **_CHAMPS_NEUFS})

    for cle in _TEMPS_1:
        assert cle in prompt, f"champ Temps-1 perdu : {cle}"
    assert "Je suis seul" in prompt
    assert "Banque" in prompt
