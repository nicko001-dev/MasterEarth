import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import Engine

# Add the project root to sys.path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import the application's Base and models for autogenerate support
# This is done here to avoid circular imports and to allow the application
# to load its configuration (which reads .env files) before we access the DB URL.
from app.infrastructure.db import models  # noqa: E402, F401
from app.infrastructure.db.base import Base  # noqa: E402

models.register_domain_models()

# Import all models so they are registered with Base.metadata
# Example: from app.domain.flood import FloodEvent
# The actual model imports will be added as M1+ models are created.
target_metadata = Base.metadata


def get_database_url() -> str:
    """Get database URL from application settings."""
    try:
        from app.config import settings

        return settings.database_url
    except Exception:
        # Fallback to ini file if settings cannot be loaded
        return config.get_main_option("sqlalchemy.url")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    url = get_database_url()
    connectable = config.attributes.get("connection", None)

    if connectable is None:
        configuration = config.get_section(config.config_ini_section, {})
        if configuration is None:
            configuration = {}
        else:
            configuration = dict(configuration)
        configuration["sqlalchemy.url"] = url
        connectable = engine_from_config(
            configuration,
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )

    if isinstance(connectable, Engine):
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                url=url,
                target_metadata=target_metadata,
                compare_type=True,
                compare_server_default=True,
            )

            with context.begin_transaction():
                context.run_migrations()
    else:
        context.configure(
            connection=connectable,
            url=url,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
