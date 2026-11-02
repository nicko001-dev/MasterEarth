"""Tests for Alembic migration configuration."""

import os
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

# Project root: 3 levels up from apps/api/tests
PROJECT_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = PROJECT_ROOT / "alembic.ini"
MIGRATIONS_DIR = PROJECT_ROOT / "database" / "migrations"


def test_alembic_config_exists():
    """Test that alembic.ini exists and is readable."""
    assert ALEMBIC_INI.exists()
    config = Config(str(ALEMBIC_INI))
    assert config is not None
    assert config.get_main_option("script_location") == "database/migrations"


def test_alembic_script_location():
    """Test that script location points to migrations directory."""
    config = Config(str(ALEMBIC_INI))
    script_location = config.get_main_option("script_location")
    assert script_location == "database/migrations"


def test_alembic_script_directory_loads():
    """Test that ScriptDirectory can be loaded from config."""
    config = Config(str(ALEMBIC_INI))
    # Change to project root so relative paths work
    old_cwd = os.getcwd()
    os.chdir(PROJECT_ROOT)
    try:
        script = ScriptDirectory.from_config(config)
        assert script is not None
    finally:
        os.chdir(old_cwd)


def test_initial_migration_exists():
    """Test that the initial migration file exists."""
    config = Config(str(ALEMBIC_INI))
    old_cwd = os.getcwd()
    os.chdir(PROJECT_ROOT)
    try:
        script = ScriptDirectory.from_config(config)
        revisions = list(script.walk_revisions())
        by_id = {r.revision: r for r in revisions}
        assert "20261027_1030_initial" in by_id
        assert "PostGIS" in by_id["20261027_1030_initial"].doc
        assert len(script.get_heads()) == 1  # historique linéaire
        assert all(len(r.revision) <= 32 for r in revisions)  # limite alembic_version
    finally:
        os.chdir(old_cwd)


def test_migration_upgrade_downgrade_functions():
    """Test that migration has upgrade and downgrade functions."""
    config = Config(str(ALEMBIC_INI))
    old_cwd = os.getcwd()
    os.chdir(PROJECT_ROOT)
    try:
        script = ScriptDirectory.from_config(config)
        revision = script.get_revision("20261027_1030_initial")
        assert revision is not None
        # Check that the module has upgrade and downgrade
        module = revision.module
        assert hasattr(module, "upgrade")
        assert hasattr(module, "downgrade")
        assert callable(module.upgrade)
        assert callable(module.downgrade)
    finally:
        os.chdir(old_cwd)


def test_migration_enables_postgis():
    """Test that migration enables PostGIS extension."""
    config = Config(str(ALEMBIC_INI))
    old_cwd = os.getcwd()
    os.chdir(PROJECT_ROOT)
    try:
        script = ScriptDirectory.from_config(config)
        revision = script.get_revision("20261027_1030_initial")
        module = revision.module
        # Check source contains postgis enable
        import inspect

        source = inspect.getsource(module.upgrade)
        assert "postgis" in source.lower()
        assert "CREATE EXTENSION" in source
    finally:
        os.chdir(old_cwd)
