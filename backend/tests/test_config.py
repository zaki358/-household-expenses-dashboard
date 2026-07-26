"""設定の読み書き・サブスク管理のテスト。"""

import pytest

from src.config import (
    DEFAULT_CONFIG,
    add_goal,
    get_active_goal,
    get_goals,
    remove_goal,
    set_active_goal,
)


@pytest.fixture
def config():
    return dict(DEFAULT_CONFIG)


# ----- 目標 (goals) -----

def test_goals_fallback_from_wedding_fund(config):
    # 旧 wedding_fund を持つ設定 → 「結婚資金」目標として読める（後方互換）
    goals = get_goals(config)
    assert goals == [{"name": "結婚資金", "target_amount": 3000000, "source": "savings"}]


def test_add_goal_migrates_and_drops_wedding_fund(config):
    updated = add_goal(config, "車の買い替え", 1500000)
    names = [g["name"] for g in get_goals(updated)]
    assert "結婚資金" in names and "車の買い替え" in names
    # 旧キーは削除され、goals に正規化される
    assert "wedding_fund" not in updated
    # 元の config は不変
    assert "goals" not in config


def test_add_goal_duplicate_raises(config):
    c = add_goal(config, "旅行", 500000)
    with pytest.raises(ValueError):
        add_goal(c, "旅行", 600000)


def test_add_goal_validations(config):
    with pytest.raises(ValueError):
        add_goal(config, "  ", 100000)
    with pytest.raises(ValueError):
        add_goal(config, "X", 0)
    with pytest.raises(ValueError):
        add_goal(config, "Y", "abc")
    with pytest.raises(ValueError):
        add_goal(config, "Z", 100000, source="不正")


def test_active_goal_defaults_to_first(config):
    assert get_active_goal(config)["name"] == "結婚資金"


def test_set_active_goal(config):
    c = add_goal(config, "車の買い替え", 1500000)
    c = set_active_goal(c, "車の買い替え")
    assert get_active_goal(c)["name"] == "車の買い替え"


def test_set_active_goal_unknown_raises(config):
    with pytest.raises(ValueError):
        set_active_goal(config, "存在しない目標")


def test_remove_goal_resets_active(config):
    c = add_goal(config, "車の買い替え", 1500000)
    c = set_active_goal(c, "車の買い替え")
    c = remove_goal(c, "車の買い替え")
    # 削除後は残った目標が active になる
    assert get_active_goal(c)["name"] == "結婚資金"
    assert all(g["name"] != "車の買い替え" for g in get_goals(c))


def test_remove_last_goal_leaves_empty(config):
    # 全目標を削除したら空のまま（最後の1つも削除できる）
    c = add_goal(config, "旅行", 500000)  # 移行: goals=[結婚資金, 旅行]
    for name in [g["name"] for g in get_goals(c)]:
        c = remove_goal(c, name)
    assert get_goals(c) == []
    assert get_active_goal(c) is None


def test_empty_goals_not_overridden_by_wedding_fund():
    # load_config が DEFAULT の wedding_fund を再注入しても、
    # 明示的な空 goals を尊重する（最後の目標を削除しても結婚資金が復活しない）
    config = {
        "goals": [],
        "wedding_fund": {"target_amount": 3000000, "source": "savings"},
    }
    assert get_goals(config) == []
    assert get_active_goal(config) is None
