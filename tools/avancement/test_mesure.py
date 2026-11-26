"""Garde du recomptage de clôture — elle doit prouver DEUX choses.

Ce dépôt a produit six « gardes borgnes » en deux jours : des tests verts qui ne
lisaient rien, ou qui ne savaient pas dire non. Une garde n'a donc le droit
d'exister ici que si elle démontre les deux :

  1. **Elle LIT vraiment.** Les tests `test_lit_*` lisent le VRAI tracker sur le
     disque et exigent des valeurs précises. Un corpus vide, un §12.5 renommé ou
     un tableau vidé les fait échouer — ils ne peuvent pas passer sur du vide.
  2. **Elle sait dire NON.** Les tests `test_dit_non_*` cassent volontairement
     le tracker (on retire l'ancre, le tableau, une ligne, on fausse un total)
     et exigent que la mesure REFUSE de produire un chiffre. Une garde qui ne
     rougit jamais ne garde rien.

Le troisième groupe, `test_jamais_par_soustraction`, tient la règle du §4 du
prompt de reprise : la couverture ne se déduit JAMAIS de
`relevées − non mentionnées`. Les groupes de passe B comptent aussi des
rapprochements incertains ; la soustraction donnerait un nombre faux qui a l'air
juste.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest

ICI = Path(__file__).resolve().parent
REPO = ICI.parents[1]
TRACKER = REPO / 'agent_docs' / 'dossier-26-aout-2026.md'


def _mesure():
    spec = importlib.util.spec_from_file_location('mesure', ICI / 'mesure.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mesure = _mesure()


@pytest.fixture(scope='module')
def tracker_texte() -> str:
    """Le VRAI tracker. S'il est introuvable, la garde échoue — elle ne se tait pas.

    C'est le point qui distingue une garde d'un décor : lire un fichier absent
    rendrait « 0 item » avec un code de sortie 0, et ce zéro-là est
    indiscernable d'un zéro vrai.
    """
    assert TRACKER.exists(), f'tracker introuvable : {TRACKER}'
    t = TRACKER.read_text(encoding='utf-8')
    assert len(t) > 10_000, 'tracker suspicieusement court — corpus probablement vide'
    return t


# ──────────────────────────────────────────────────────────────────────
# 1. Elle LIT — valeurs exactes, sur le vrai fichier
# ──────────────────────────────────────────────────────────────────────


def test_lit_le_paragraphe_125_du_vrai_tracker(tracker_texte):
    r = mesure.recomptage_cloture(tracker_texte)
    assert r is not None, "le §12.5 n'a pas été lu"
    assert r['coherent'] is True, f"incohérences : {r['ecarts']}"


def test_lit_le_document_mesure(tracker_texte):
    """Le document n'est pas déduit : il est DÉCLARÉ dans le tracker et lu ici."""
    r = mesure.recomptage_cloture(tracker_texte)
    assert r['document'] == 'PDF-02'


def test_lit_les_six_statuts_un_par_un(tracker_texte):
    r = mesure.recomptage_cloture(tracker_texte)
    assert r['statuts'] == {
        'LIVRÉ': 111,
        'PARTIEL': 8,
        'REFUSÉ': 7,
        'PÉRIMÉ': 1,
        'ABSENT': 1,
        'NON PROUVÉ': 0,
    }


def test_lit_le_clos_et_son_denominateur(tracker_texte):
    r = mesure.recomptage_cloture(tracker_texte)
    assert r['clos'] == 119
    assert r['total'] == 128
    assert r['pct'] == pytest.approx(93.0, abs=0.05)


def test_le_clos_est_recalcule_et_non_recopie(tracker_texte):
    """119 est REFAIT depuis les statuts, puis comparé à la phrase du tracker.

    « Un total de tracker est un argument » : on lit les deux et on exige
    l'accord, on ne fait pas confiance à la phrase seule.
    """
    r = mesure.recomptage_cloture(tracker_texte)
    st = r['statuts']
    assert st['LIVRÉ'] + st['REFUSÉ'] + st['PÉRIMÉ'] == r['clos']
    assert sum(st.values()) == r['total']


def test_le_recomptage_est_bien_rattache_au_fichier_pdf02(tracker_texte):
    """Un chiffre juste posé sur le mauvais document reste un chiffre faux."""
    r = mesure.recomptage_cloture(tracker_texte)
    assert r['document'] in mesure.GROUPES['A'], (
        "le document déclaré doit être un document connu de la source"
    )


# ──────────────────────────────────────────────────────────────────────
# 2. Elle sait dire NON — on casse le tracker exprès
# ──────────────────────────────────────────────────────────────────────


def test_dit_non_si_la_section_de_recomptage_disparait(tracker_texte):
    """La section entière retirée : plus de mesure, et on le DIT.

    ⚠️ Ce test a changé de forme le 28/08, et le changement est l'information.
    Il vérifiait avant qu'un §12.5 RENOMMÉ rendait `None` — ce qui ne testait
    pas la disparition de la mesure, mais le fait que l'outil suivait un
    NUMÉRO de section. Suivre un numéro était le défaut : un tracker qui se
    réagence aurait perdu sa mesure en silence, en affichant « non ventilé ».
    C'est l'ANCRE « Document mesuré » qui porte, donc c'est elle qu'on retire.
    """
    i = tracker_texte.find('### 12.5 Le recomptage de clôture')
    j = tracker_texte.find('### 12.6', i)
    assert i > 0 and j > i, 'bornes de la section introuvables'
    ampute = tracker_texte[:i] + tracker_texte[j:]
    docs = {r['document'] for r in mesure.recomptages_cloture(ampute)}
    assert 'PDF-02' not in docs


def test_dit_non_si_lancre_du_document_disparait(tracker_texte):
    """Sans « Document mesuré », la mesure ne DEVINE pas à quel PDF rattacher."""
    ampute = tracker_texte.replace('**Document mesuré : `PDF-02`**', 'Document mesuré : au pif')
    r = mesure.recomptage_cloture(ampute)
    assert r is None or r['coherent'] is False


def test_dit_non_si_la_table_des_statuts_disparait(tracker_texte):
    """C'est le test que le §4 du prompt de reprise exige nommément."""
    ampute = re.sub(
        r'\|\s*\*{0,2}(LIVRÉ|PARTIEL|REFUSÉ|PÉRIMÉ|ABSENT|NON PROUVÉ|Total)\*{0,2}\s*\|[^\n]*\n',
        '',
        tracker_texte,
    )
    r = mesure.recomptage_cloture(ampute)
    assert r is None or r['coherent'] is False


def test_dit_non_si_une_seule_ligne_de_statut_disparait(tracker_texte):
    """Retirer PARTIEL casse la somme : 120 ≠ 128. La garde doit le voir."""
    ampute = tracker_texte.replace('| PARTIEL        |       8 |\n', '')
    r = mesure.recomptage_cloture(ampute)
    assert r is not None
    assert r['coherent'] is False
    assert any('somme' in e.lower() for e in r['ecarts']), r['ecarts']


def test_dit_non_si_le_total_est_fausse(tracker_texte):
    faux = tracker_texte.replace('| **Total**      | **128** |', '| **Total**      | **140** |')
    r = mesure.recomptage_cloture(faux)
    assert r is not None
    assert r['coherent'] is False


def test_dit_non_si_le_clos_declare_contredit_les_statuts(tracker_texte):
    faux = tracker_texte.replace(
        '**Clos = LIVRÉ + REFUSÉ + PÉRIMÉ = 119 / 128 = 93,0 %.**',
        '**Clos = LIVRÉ + REFUSÉ + PÉRIMÉ = 128 / 128 = 100,0 %.**',
    )
    r = mesure.recomptage_cloture(faux)
    assert r is not None
    assert r['coherent'] is False
    assert any('clos' in e.lower() for e in r['ecarts']), r['ecarts']


def test_un_recomptage_incoherent_ne_produit_aucun_pourcentage(tracker_texte):
    """Le point qui compte pour l'écran : incohérent ⇒ rien à afficher.

    Jamais un chiffre « à peu près ». La page dit « non ventilé », ce qui est
    vrai, plutôt qu'un pourcentage que personne n'a mesuré.
    """
    faux = tracker_texte.replace('| **Total**      | **128** |', '| **Total**      | **140** |')
    r = mesure.recomptage_cloture(faux)
    assert r['pct'] is None


# ──────────────────────────────────────────────────────────────────────
# 3. La règle qui ne se casse pas : jamais de couverture par soustraction
# ──────────────────────────────────────────────────────────────────────


def test_jamais_par_soustraction_le_commentaire_tient(tracker_texte):
    """Le refus de déduire est écrit dans le code — on vérifie qu'il y est encore.

    Ce test est volontairement littéral : il garde une DÉCISION, et une décision
    qui ne vit que dans un commentaire disparaît au premier refactor pressé.
    """
    src = (ICI / 'mesure.py').read_text(encoding='utf-8')
    assert 'On ne DÉDUIT pas' in src
    assert 'rapprochements incertains' in src


def test_jamais_par_soustraction_pdf01_et_pdf03_restent_non_ventiles():
    """Le groupe A ne ventile pas : PDF-01 et PDF-03 doivent RESTER `null`.

    C'est la contrepartie du lot : on ajoute une SOURCE pour PDF-02 (le §12.5),
    on ne bricole pas un calcul pour les deux autres. S'ils devenaient chiffrés
    sans que la passe B les ventile, c'est qu'une soustraction serait revenue.
    """
    entetes = mesure.entetes_de_groupe()
    a = entetes.get('A', {})
    if not a.get('lisible'):
        pytest.skip('passe B absente de ce checkout (elle est gitignorée)')
    assert a.get('couvertes_par_doc') in (None, {}), (
        'le groupe A ne ventile pas par document — un chiffre ici est une déduction'
    )


# ──────────────────────────────────────────────────────────────────────
# 4. Plusieurs documents recomptés — la mesure ne suit pas un NUMÉRO
# ──────────────────────────────────────────────────────────────────────
#
# La première version cherchait littéralement « ### 12.5 ». Un numéro de
# section se renumérote, et une mesure qui suit un numéro meurt au premier
# réagencement du tracker — sans rien dire, en rendant « non ventilé ».
# C'est l'ANCRE « Document mesuré » qui désigne un recomptage.


#: Les documents dont le recomptage DOIT être lisible. Un ajout est libre ; un
#: RETRAIT fait rougir — c'est ce qui distingue une garde d'un décor.
#:
#: ⚠️ Cette liste était un `==` sur trois documents, et elle a rougi le 29/08
#: quand six recomptages sont arrivés. C'était le bon réflexe pour un retrait et
#: le mauvais pour un ajout : une garde qui interdit d'AVANCER se fait
#: désactiver, et une garde désactivée ne garde plus rien. D'où l'inclusion.
DOCUMENTS_RECOMPTES = {
    'PDF-01', 'PDF-02', 'PDF-03', 'PDF-04', 'PDF-05', 'PDF-06', 'PDF-07', 'PDF-08', 'PDF-13',
}


def test_lit_tous_les_documents_recomptes(tracker_texte):
    docs = {r['document'] for r in mesure.recomptages_cloture(tracker_texte)}
    manquants = DOCUMENTS_RECOMPTES - docs
    assert not manquants, f'recomptages devenus illisibles : {sorted(manquants)}'


def test_chaque_document_n_est_recompte_qu_une_fois(tracker_texte):
    """Deux sections pour un même document, c'est une divergence, pas une moyenne."""
    from collections import Counter
    compte = Counter(r['document'] for r in mesure.recomptages_cloture(tracker_texte))
    doublons = {d: n for d, n in compte.items() if n > 1}
    assert not doublons, f'document recompté deux fois : {doublons}'


def test_chaque_recomptage_est_coherent(tracker_texte):
    for r in mesure.recomptages_cloture(tracker_texte):
        assert r['coherent'] is True, f"{r['document']} : {r['ecarts']}"


def test_les_trois_taux_sont_ceux_du_tracker(tracker_texte):
    docs = {r['document']: r for r in mesure.recomptages_cloture(tracker_texte)}
    assert (docs['PDF-02']['clos'], docs['PDF-02']['total']) == (119, 128)
    assert (docs['PDF-04']['clos'], docs['PDF-04']['total']) == (65, 151)
    assert (docs['PDF-05']['clos'], docs['PDF-05']['total']) == (40, 107)
    assert docs['PDF-04']['pct'] == pytest.approx(43.0, abs=0.05)
    assert docs['PDF-05']['pct'] == pytest.approx(37.4, abs=0.05)


def test_aucun_recomptage_n_est_a_100_pourcent(tracker_texte):
    """Aucun des trois n'est clos — la page ne doit jamais pouvoir l'afficher.

    Garde d'intention : le jour où un document atteint vraiment 100 %, ce test
    tombe et OBLIGE à décider comment on l'affiche. Mieux vaut ça qu'une coche
    apparue toute seule un mardi.
    """
    for r in mesure.recomptages_cloture(tracker_texte):
        assert r['pct'] < 100, f"{r['document']} affiche {r['pct']} %"
        assert r['restant'], f"{r['document']} n'a plus rien de dû, à traiter à la main"


def test_dit_non_si_le_numero_de_section_change(tracker_texte):
    """Renuméroter 12.5 en 12.9 ne doit RIEN casser : l'ancre porte, pas le numéro."""
    renumerote = tracker_texte.replace('### 12.5 Le recomptage', '### 12.9 Le recomptage')
    docs = {r['document'] for r in mesure.recomptages_cloture(renumerote)}
    assert 'PDF-02' in docs


def test_dit_non_si_deux_sections_declarent_le_meme_document(tracker_texte):
    """Deux mesures du même document, c'est une divergence, pas une moyenne.

    On veut les DEUX dans la liste : c'est `main()` qui tranche (la dernière
    gagne), mais la mesure ne doit pas en cacher une silencieusement.
    """
    doublon = tracker_texte + tracker_texte[tracker_texte.find('### 12.7'):]
    docs = [r['document'] for r in mesure.recomptages_cloture(doublon)]
    assert docs.count('PDF-04') == 2
