"""Alembic environment: migrations run against DATABASE_URL and compare with the models in app/models.py."""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app.db import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://trash2cash:trash2cash@localhost:5432/trash2cash")


def run_migrations_offline() -> None:
    context.configure(url=DATABASE_URL, target_metadata=Base.metadata, literal_binds=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
