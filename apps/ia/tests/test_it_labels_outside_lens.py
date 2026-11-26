"""Les libellés IT écrits en dur DANS des fichiers qui résolvent la lentille.

Le registre de doctrine (C06) demande qu'aucune présélection IT silencieuse ne
subsiste. Deux endroits contredisaient la règle sans que rien ne le voie :

* ``bellum_advisor`` appelait ``resolve_domain_focus`` pour composer le bloc
  profil, puis écrivait « Enjeux IT » en dur quinze lignes plus bas — le
  copilote annonçait donc des « enjeux IT » à une société de conseil en
  ingénierie dont les enjeux ne sont pas informatiques ;
* ``bellum_activity`` n'importait PAS ``domain_focus`` du tout et annonçait
  « DÉFIS IT IDENTIFIÉS » à tout le monde.

Ce que ces tests protègent, dans cet ordre d'importance :

1. **Byte-identité pour une ESN IT.** ``challenge_label`` vaut exactement
   « IT » pour le pack ``esn_it`` : le prompt du client actuel ne bouge pas
   d'un caractère. Un profil ABSENT retombe sur la même lentille.
2. **Généralisation pour un vendeur non-IT**, et seulement pour lui.
"""

from __future__ import annotations

from app.prompts import bellum_activity, bellum_advisor

_IT_ESN = {"companyName": "DataForge", "offers": ["Data & IA", "Cloud AWS", "Cybersécurité"]}
_INDUSTRIAL = {"companyName": "MecaConseil", "offerDomain": "industrial_engineering"}

_ACCOUNT = {
    "company_name": "ACME",
    "sector": "Automobile",
    "it_challenges": ["Obsolescence du MES", "Traçabilité"],
}


def _advisor(profile: dict | None) -> str:
    return bellum_advisor.build_system_prompt(profile or {}, _ACCOUNT, [], {})


def test_advisor_garde_enjeux_it_pour_une_esn_it() -> None:
    assert "- Enjeux IT :" in _advisor(_IT_ESN)


def test_advisor_garde_enjeux_it_sans_profil() -> None:
    # Un profil absent n'est pas un profil non-IT : la lentille historique
    # s'applique, sans quoi tout espace mal renseigné changerait de vocabulaire.
    assert "- Enjeux IT :" in _advisor(None)


def test_advisor_generalise_pour_un_vendeur_industriel() -> None:
    rendered = _advisor(_INDUSTRIAL)
    assert "- Enjeux industriels :" in rendered
    assert "- Enjeux IT :" not in rendered


def test_activity_garde_defis_it_sans_profil() -> None:
    # L'appelant historique ne passait aucun profil ; le mot-clé est optionnel
    # et le prompt doit rester byte-identique pour lui.
    assert "DÉFIS IT IDENTIFIÉS" in bellum_activity.build_user_prompt(raw_analysis={}, company_name="ACME")


def test_activity_garde_defis_it_pour_une_esn_it() -> None:
    rendered = bellum_activity.build_user_prompt(raw_analysis={}, company_name="ACME", profile_data=_IT_ESN)
    assert "DÉFIS IT IDENTIFIÉS" in rendered


def test_activity_generalise_pour_un_vendeur_industriel() -> None:
    rendered = bellum_activity.build_user_prompt(raw_analysis={}, company_name="ACME", profile_data=_INDUSTRIAL)
    assert "DÉFIS INDUSTRIELS IDENTIFIÉS" in rendered
    assert "DÉFIS IT IDENTIFIÉS" not in rendered
