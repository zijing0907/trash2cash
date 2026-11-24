"""Command line tasks.

    python -m app.cli create-user --email you@example.com --name "Your name" --role admin
    python -m app.cli seed-demo

In Docker:  docker compose exec api python -m app.cli seed-demo
"""

import argparse
import getpass
import json
import sys

from sqlalchemy import select

from .config import load_settings
from .db import make_engine, make_sessionmaker
from .demo import seed_demo
from .models import Role, User
from .points import new_member_code
from .security import hash_password


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    cu = sub.add_parser("create-user", help="Create a user (the first admin is made this way)")
    cu.add_argument("--email", required=True)
    cu.add_argument("--name", required=True)
    cu.add_argument("--role", choices=[r.value for r in Role], default="resident")
    cu.add_argument("--password", help="Asked for if left out")
    sd = sub.add_parser("seed-demo", help="Add sample drop-off points, users and six weeks of deposits")
    sd.add_argument("--days", type=int, default=42)
    args = parser.parse_args(argv)

    s = load_settings()
    with make_sessionmaker(make_engine(s.database_url))() as db:
        if args.cmd == "create-user":
            email = args.email.lower()
            if db.scalar(select(User.id).where(User.email == email)):
                print(f"{email} already exists.", file=sys.stderr)
                return 1
            password = args.password or getpass.getpass("Password (8 characters or more): ")
            if len(password) < 8:
                print("The password must be at least 8 characters.", file=sys.stderr)
                return 1
            db.add(User(email=email, display_name=args.name, password_hash=hash_password(password),
                        role=Role(args.role), member_code=new_member_code(db)))  # fmt: skip
            db.commit()
            print(f"Created {args.role} {email}.")
        else:
            print(json.dumps(seed_demo(db, days=args.days), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
