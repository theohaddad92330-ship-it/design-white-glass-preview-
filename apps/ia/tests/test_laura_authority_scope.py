"""#2033.9 / #2033.10 — le périmètre d'autorité DÉCLARÉ cadre ce que Laura
PROPOSE, jamais ce que l'API autorise (D3, décision Louis 18/09/2026,
``.claude/notes/decisions-louis-18-09-apresmidi.md``).

Les deux tests-pièges du brief, portés ici pour le côté PROMPT (le côté
contrat pur est ``packages/contracts/src/schemas/authority-scope.test.ts``) :
 - le guard ignore la déclaration — ``build_authority_scope_block`` ne lit ni
   n'écrit aucune permission, aucun rôle d'espace ; elle ne fait QUE composer
   du texte de prompt à partir de quatre chaînes d'échelle ;
 - l'absence de réponse ne restreint rien — un profil vide, ou qui ne
   déclare que « Je décide seul », rend un bloc VIDE : Laura propose tout.
"""

from __future__ import annotations

from app.prompts.laura_authority_scope import build_authority_scope_block


def test_profil_vide_ne_restreint_rien() -> None:
    """PIÈGE 2 — non renseigné n'est jamais un refus (GA-18/GA-19)."""
    assert build_authority_scope_block({}) == ''


def test_tout_decider_seul_ne_donne_aucun_droit_de_plus() -> None:
    """PIÈGE 1 — déclarer « je décide seul » partout ne produit ni permission
    ni élévation : le bloc reste vide, exactement comme un profil qui n'a
    rien déclaré."""
    profile = {
        'recruitmentAccountsAuthority': 'Je décide seul',
        'staffingAuthority': 'Je décide seul',
        'marginBillingAuthority': 'Je décide seul',
        'inviteAuthority': 'Je décide seul',
    }
    assert build_authority_scope_block(profile) == ''


def test_valeur_hors_catalogue_nest_jamais_devinee_comme_un_refus() -> None:
    """#2033.10 — « directeur » (ou toute valeur que le questionnaire n'a pas
    persistée) ne se lit JAMAIS comme un accès ni comme un refus : ignorée."""
    assert build_authority_scope_block({'marginBillingAuthority': 'Directeur'}) == ''


def test_pas_cette_responsabilite_fait_sortir_la_categorie_et_le_dit() -> None:
    """#2033.9 — Laura ne propose pas, ET LE DIT."""
    block = build_authority_scope_block({'staffingAuthority': "Je n'ai pas cette responsabilité"})
    assert 'décider un staffing' in block
    assert 'NE PROPOSE JAMAIS' in block


def test_doit_faire_valider_reste_propose_avec_une_reserve() -> None:
    block = build_authority_scope_block({'recruitmentAccountsAuthority': 'Je dois faire valider'})
    assert 'recruter un nouveau compte' in block
    assert 'FAIRE VALIDER' in block or 'valider' in block.lower()


def test_ne_touche_a_aucune_permission_ni_role() -> None:
    """Le guard reste seul (GA-26) : cette fonction ne connaît ni permission ni rôle d'espace."""
    import inspect

    source = inspect.getsource(build_authority_scope_block)
    for forbidden in ('permission', 'WorkspaceRole', 'can(', 'guard'):
        assert forbidden not in source
