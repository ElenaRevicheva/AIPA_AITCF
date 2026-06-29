#!/usr/bin/env python3
"""Regression tests for learning preference keyword parsing."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from espaluz_advanced_features import parse_preference_update


def test_kinder_does_not_trigger_correction_style():
    assert parse_preference_update(
        "I need to prepare Alisa to kinder. Which are best kinder bilingual schools in Panama city?"
    ) is None
    assert parse_preference_update("I need to know about kinder") is None
    assert parse_preference_update("kindergarten options in Panama") is None


def test_explicit_preference_phrases_still_work():
    assert parse_preference_update("Be gentle with corrections please") == {
        "correction_style": "gentle"
    }
    assert parse_preference_update("Please be kind with my mistakes") == {
        "correction_style": "gentle"
    }
    assert parse_preference_update("Go slower please") == {"pace": "slow"}
    assert parse_preference_update("Focus on grammar") == {"focus_areas": ["grammar"]}


if __name__ == "__main__":
    test_kinder_does_not_trigger_correction_style()
    test_explicit_preference_phrases_still_work()
    print("✅ preference parsing tests passed")
