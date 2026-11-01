#!/usr/bin/env python3
"""Create the first developer account using the configured database."""

import getpass

import db


def main():
    db.init_db()
    username = input("Developer username: ").strip()
    full_name = input("Developer full name: ").strip()
    password = getpass.getpass("Developer password: ")
    if not username or not full_name or not password:
        raise SystemExit("Username, full name, and password are required.")
    try:
        user = db.create_user({
            "username": username,
            "password": password,
            "role": "developer",
            "full_name": full_name,
            "email": input("Developer email (optional): ").strip()
        })
    except Exception as error:
        raise SystemExit(f"Could not create developer account: {error}") from error
    print(f"Developer account created: {user['username']}")


if __name__ == "__main__":
    main()
