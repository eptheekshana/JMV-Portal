"""
Unified Database Layer for Jayakody Maha Vidyalaya (JMV) Portal
Supports:
1. Remote MariaDB (credentials loaded from .env)
2. Automatic seamless fallback to local SQLite if remote MariaDB credentials/access are denied or offline.

Theme & Identity: WP/KE/Jayakody Maha Vidyalaya (JMV-Web)
"""

import os
import json
import sys
import glob
import sqlite3
import hashlib
import binascii
import secrets
import uuid
from datetime import datetime, date, timedelta
from contextlib import contextmanager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load .env
from env_loader import load_env
load_env()

# Try importing pymysql from vendor if not system-installed
try:
    import pymysql
    import pymysql.cursors
except ImportError:
    sys.path[0:0] = glob.glob(os.path.join(BASE_DIR, "vendor", "*.whl"))
    try:
        import pymysql
        import pymysql.cursors
    except ImportError:
        pymysql = None

from seed_data import (
    SAMPLE_STUDENTS, SAMPLE_STAFF, STUDENT_COLUMNS, STAFF_COLUMNS,
    USER_COLUMNS, MARK_COLUMNS, SAMPLE_USERS, SAMPLE_MARKS,
    SUBJECT_COLUMNS, SAMPLE_SUBJECTS
)

SQLITE_PATH = (
    "/tmp/school.db"
    if os.environ.get("VERCEL")
    else os.path.join(BASE_DIR, "school.db")
)
STUDENT_FIELDS = list(STUDENT_COLUMNS)
STAFF_FIELDS = list(STAFF_COLUMNS)
USER_FIELDS = list(USER_COLUMNS)
MARK_FIELDS = list(MARK_COLUMNS)
SUBJECT_FIELDS = list(SUBJECT_COLUMNS)

# Audit trail columns added to students and staff (who created / last updated, and when)
AUDIT_COLUMNS = {
    "created_by": "VARCHAR(150) NOT NULL DEFAULT ''",
    "updated_by": "VARCHAR(150) NOT NULL DEFAULT ''",
    "last_updated_at": "VARCHAR(32) NOT NULL DEFAULT ''",
}

# State tracking
ACTIVE_ENGINE = "unknown"  # "mariadb" or "sqlite"
ENGINE_STATUS_MSG = ""

def _get_mariadb_config():
    raw_pw = os.environ.get("DB_PASSWORD", "")
    if raw_pw:
        # Sanitize Unicode asterisks (e.g. \u2217, \ufe61, \uff0a) introduced by copy-pasting from rich text
        raw_pw = (raw_pw.replace('\u2217', '*')
                        .replace('\ufe61', '*')
                        .replace('\uff0a', '*')
                        .strip())
    cfg = {
        "host": os.environ.get("DB_HOST", "").strip(),
        "port": int(os.environ.get("DB_PORT", "3306")),
        "user": os.environ.get("DB_USER", "").strip(),
        "password": raw_pw,
        "database": os.environ.get("DB_NAME", "").strip(),
        "charset": "utf8mb4",
        "cursorclass": pymysql.cursors.DictCursor if pymysql else None,
        "connect_timeout": 10,
        "autocommit": False,
    }
    return cfg

def test_mariadb():
    if not pymysql:
        return False, "PyMySQL driver not available"
    try:
        cfg = _get_mariadb_config()
        conn = pymysql.connect(**cfg)
        with conn.cursor() as cur:
            cur.execute("SELECT VERSION()")
            ver = cur.fetchone()
        conn.close()
        return True, f"Connected to MariaDB ({cfg['host']})"
    except Exception as e:
        return False, str(e)

def determine_engine():
    global ACTIVE_ENGINE, ENGINE_STATUS_MSG
    ok, msg = test_mariadb()
    if ok:
        ACTIVE_ENGINE = "mariadb"
        ENGINE_STATUS_MSG = msg
        return "mariadb"
    else:
        ACTIVE_ENGINE = "sqlite"
        ENGINE_STATUS_MSG = f"Remote MariaDB unavailable ({msg}). Using local fallback database."
        return "sqlite"

# ---------------------------------------------------------------------------
# Schema Initialization
# ---------------------------------------------------------------------------
def init_mariadb_schema(conn):
    with conn.cursor() as cur:
        cur.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id VARCHAR(32) PRIMARY KEY,
            admission_no VARCHAR(32) NOT NULL UNIQUE,
            full_name VARCHAR(255) NOT NULL DEFAULT '',
            name_with_initials VARCHAR(150) NOT NULL,
            gender VARCHAR(16) NOT NULL,
            dob VARCHAR(32) NULL,
            grade VARCHAR(32) NOT NULL,
            stream VARCHAR(100) NOT NULL,
            medium VARCHAR(32) NOT NULL DEFAULT 'Sinhala',
            house VARCHAR(32) NOT NULL,
            guardian_name VARCHAR(150) NOT NULL DEFAULT '',
            guardian_contact VARCHAR(32) NOT NULL DEFAULT '',
            address VARCHAR(255) NOT NULL DEFAULT '',
            enrollment_date VARCHAR(32) NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'Active',
            extracurricular TEXT,
            photo_url VARCHAR(500),
            notes TEXT,
            nic VARCHAR(15) NULL UNIQUE,
            primary_mobile VARCHAR(20) NOT NULL DEFAULT '',
            secondary_mobile VARCHAR(20) NULL,
            personal_email VARCHAR(150) NULL,
            edu_email VARCHAR(150) NULL UNIQUE,
            academic_level VARCHAR(50) NOT NULL DEFAULT '',
            health_issues TEXT NULL,
            `class` VARCHAR(30) NOT NULL DEFAULT '',
            guardian_nic VARCHAR(15) NOT NULL DEFAULT '',
            guardian_mobile VARCHAR(20) NOT NULL DEFAULT '',
            relation_to_student VARCHAR(50) NOT NULL DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS staff (
            id VARCHAR(32) PRIMARY KEY,
            epf_no VARCHAR(32) NULL UNIQUE,
            full_name VARCHAR(255) NOT NULL DEFAULT '',
            name_with_initials VARCHAR(150) NOT NULL,
            gender VARCHAR(16) NOT NULL,
            role VARCHAR(150) NOT NULL,
            department VARCHAR(150) NOT NULL DEFAULT '',
            subjects_taught VARCHAR(255),
            qualifications VARCHAR(500) NOT NULL DEFAULT '',
            appointed_date VARCHAR(32) NULL,
            contact_no VARCHAR(32) NOT NULL DEFAULT '',
            email VARCHAR(150) NOT NULL DEFAULT '',
            address VARCHAR(255) NOT NULL DEFAULT '',
            nic VARCHAR(20) NOT NULL DEFAULT '',
            status VARCHAR(20) NOT NULL DEFAULT 'Active',
            assigned_classes VARCHAR(255),
            photo_url VARCHAR(500),
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(32) PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL,
            full_name VARCHAR(150) NOT NULL,
            email VARCHAR(150) DEFAULT '',
            staff_id VARCHAR(32) DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS student_marks (
            id VARCHAR(32) PRIMARY KEY,
            student_id VARCHAR(32) NOT NULL,
            subject VARCHAR(100) NOT NULL,
            term VARCHAR(32) NOT NULL,
            year VARCHAR(10) NOT NULL,
            marks INT NOT NULL,
            grade VARCHAR(5) NOT NULL,
            remarks VARCHAR(255) DEFAULT '',
            updated_by VARCHAR(100) DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_student_term (student_id, term, year)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(32) NOT NULL,
            role VARCHAR(20) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS school_timetable (
            id VARCHAR(32) PRIMARY KEY,
            class_name VARCHAR(64) NOT NULL,
            day_of_week VARCHAR(16) NOT NULL,
            period_no TINYINT NOT NULL,
            subject VARCHAR(100) NOT NULL,
            teacher_id VARCHAR(32) NOT NULL,
            teacher_name VARCHAR(150) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_class_slot (class_name, day_of_week, period_no),
            INDEX idx_teacher_slot (teacher_id, day_of_week, period_no)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS subjects (
            subject_code VARCHAR(15) NOT NULL,
            subject_name VARCHAR(100) NOT NULL,
            category ENUM('Core','Basket 1','Basket 2','Basket 3','Primary','A/L','Vocational','Other') NOT NULL DEFAULT 'Core',
            grade_level VARCHAR(50) NOT NULL DEFAULT '',
            medium ENUM('Sinhala','English','Tamil','All') NOT NULL DEFAULT 'Sinhala',
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            description TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (subject_code, grade_level),
            KEY idx_subject_name (subject_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS teachers (
            `teacher_id` VARCHAR(15) PRIMARY KEY,
            `name_with_initials` VARCHAR(100) NOT NULL,
            `full_name` VARCHAR(150) NOT NULL,
            `email` VARCHAR(150) NULL UNIQUE,
            `primary_phone_no` VARCHAR(20) NULL,
            `secondary_phone_no` VARCHAR(20) NULL,
            `date_of_birth` DATE NULL,
            `age` TINYINT(3) UNSIGNED NULL,
            `address` VARCHAR(255) NOT NULL DEFAULT '',
            `nic` VARCHAR(15) NULL UNIQUE,
            `date_of_arrival` DATE NULL,
            `education_level` VARCHAR(100) NOT NULL DEFAULT '',
            `current_role` VARCHAR(100) NOT NULL DEFAULT '',
            `assigned_subject` VARCHAR(100) NULL,
            `current_subject` VARCHAR(100) NULL,
            `other_subject` VARCHAR(150) NULL,
            `notes` TEXT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id VARCHAR(40) PRIMARY KEY,
            entity_type VARCHAR(16) NOT NULL,
            entity_id VARCHAR(32) NOT NULL,
            entity_name VARCHAR(255) NOT NULL DEFAULT '',
            action VARCHAR(16) NOT NULL,
            changed_by VARCHAR(150) NOT NULL DEFAULT '',
            changed_by_role VARCHAR(20) NOT NULL DEFAULT '',
            changed_at VARCHAR(32) NOT NULL,
            changes TEXT NULL,
            INDEX idx_audit_entity (entity_type, entity_id),
            INDEX idx_audit_time (changed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        _migrate_existing_mariadb_schema(cur)

        for _tbl in ("students", "staff"):
            cur.execute(f"SHOW COLUMNS FROM {_tbl}")
            _have = {(r["Field"] if isinstance(r, dict) else r[0]) for r in cur.fetchall()}
            for _col, _def in AUDIT_COLUMNS.items():
                if _col not in _have:
                    cur.execute(f"ALTER TABLE {_tbl} ADD COLUMN `{_col}` {_def}")

        # Ensure default admin user exists if users table is empty
        cur.execute("SELECT COUNT(*) as cnt FROM users")
        if cur.fetchone()["cnt"] == 0:
            cols = ", ".join(USER_FIELDS)
            placeholders = ", ".join(["%s"] * len(USER_FIELDS))
            cur.execute(
                f"INSERT INTO users ({cols}) VALUES ({placeholders})",
                (
                    "USR-ADM-001",
                    "eptheekshana",
                    "c712c754aadf926e02cbbdaa7c31ebe0$a0580c6a5bb5b96e475a82b3434434c48824a62a0a46140dd5995ee755de0c3e",
                    "admin",
                    "E P Theekshana (Administrator)",
                    "eptheekshana@gmail.com",
                    ""
                )
            )

        # Populate official G.C.E. (O/L) subjects & module codes
        subj_cols = ", ".join([f"`{c}`" for c in SUBJECT_FIELDS])
        subj_placeholders = ", ".join(["%s"] * len(SUBJECT_FIELDS))
        subj_updates = ", ".join([f"`{c}`=VALUES(`{c}`)" for c in SUBJECT_FIELDS if c != "subject_code"])
        for s_row in SAMPLE_SUBJECTS:
            cur.execute(
                f"INSERT INTO subjects ({subj_cols}) VALUES ({subj_placeholders}) "
                f"ON DUPLICATE KEY UPDATE {subj_updates}",
                s_row
            )
    conn.commit()


def _migrate_existing_mariadb_schema(cur):
    """Add the portal's compatibility fields to an existing MariaDB schema."""
    cur.execute("SHOW COLUMNS FROM students")
    raw_student_cols = cur.fetchall()
    student_columns = {
        (row["Field"] if isinstance(row, dict) else row[0])
        for row in raw_student_cols
    }
    additions = {
        "id": "VARCHAR(32) NULL",
        "name_with_initials": "VARCHAR(150) NOT NULL DEFAULT ''",
        "gender": "VARCHAR(16) NOT NULL DEFAULT 'Unknown'",
        "grade": "VARCHAR(32) NOT NULL DEFAULT ''",
        "stream": "VARCHAR(100) NOT NULL DEFAULT ''",
        "medium": "VARCHAR(32) NOT NULL DEFAULT 'Sinhala'",
        "house": "VARCHAR(32) NOT NULL DEFAULT ''",
        "guardian_contact": "VARCHAR(32) NOT NULL DEFAULT ''",
        "status": "VARCHAR(20) NOT NULL DEFAULT 'Active'",
        "extracurricular": "TEXT NULL",
        "photo_url": "VARCHAR(500) NULL",
        "notes": "TEXT NULL",
        "nic": "VARCHAR(15) NULL UNIQUE",
        "primary_mobile": "VARCHAR(20) NOT NULL DEFAULT ''",
        "secondary_mobile": "VARCHAR(20) NULL",
        "personal_email": "VARCHAR(150) NULL",
        "edu_email": "VARCHAR(150) NULL UNIQUE",
        "academic_level": "VARCHAR(50) NOT NULL DEFAULT ''",
        "health_issues": "TEXT NULL",
        "subjects": "TEXT NULL",
        "ol_bucket_1": "VARCHAR(100) NULL",
        "ol_bucket_2": "VARCHAR(100) NULL",
        "ol_bucket_3": "VARCHAR(100) NULL",
        "class": "VARCHAR(30) NOT NULL DEFAULT ''",
        "guardian_nic": "VARCHAR(15) NOT NULL DEFAULT ''",
        "guardian_mobile": "VARCHAR(20) NOT NULL DEFAULT ''",
        "relation_to_student": "VARCHAR(50) NOT NULL DEFAULT ''",
        "updated_at": "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    }
    for column, definition in additions.items():
        if column not in student_columns:
            cur.execute(f"ALTER TABLE students ADD COLUMN `{column}` {definition}")

    cur.execute("""
        UPDATE students
        SET id = admission_no
        WHERE id IS NULL OR id = ''
    """)
    cur.execute("""
        UPDATE students
        SET name_with_initials = LEFT(full_name, 150)
        WHERE name_with_initials IS NULL OR name_with_initials = ''
    """)
    if "academic_level" in student_columns or "class" in student_columns:
        grade_sources = []
        if "academic_level" in student_columns:
            grade_sources.append("NULLIF(academic_level, '')")
        if "class" in student_columns:
            grade_sources.append("NULLIF(`class`, '')")
        grade_expr = f"COALESCE({', '.join(grade_sources)}, '')"
        cur.execute(f"""
            UPDATE students
            SET grade = {grade_expr}
            WHERE grade IS NULL OR grade = ''
        """)
    if "guardian_mobile" in student_columns:
        cur.execute("""
            UPDATE students
            SET guardian_contact = COALESCE(guardian_mobile, '')
            WHERE guardian_contact IS NULL OR guardian_contact = ''
        """)
    cur.execute("SHOW INDEX FROM students")
    raw_student_idx = cur.fetchall()
    student_indexes = {
        (row["Key_name"] if isinstance(row, dict) else row[2])
        for row in raw_student_idx
    }
    if "uq_students_id" not in student_indexes:
        cur.execute("ALTER TABLE students ADD UNIQUE KEY uq_students_id (id)")

    cur.execute("SHOW COLUMNS FROM school_timetable")
    raw_timetable_cols = cur.fetchall()
    timetable_columns = {
        (row["Field"] if isinstance(row, dict) else row[0])
        for row in raw_timetable_cols
    }
    if "updated_at" not in timetable_columns:
        cur.execute(
            "ALTER TABLE school_timetable ADD COLUMN updated_at TIMESTAMP "
            "DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        )
    cur.execute("SHOW INDEX FROM school_timetable")
    raw_timetable_idx = cur.fetchall()
    timetable_indexes = {
        (row["Key_name"] if isinstance(row, dict) else row[2])
        for row in raw_timetable_idx
    }
    if "uq_class_slot" not in timetable_indexes:
        cur.execute(
            "ALTER TABLE school_timetable ADD UNIQUE KEY "
            "uq_class_slot (class_name, day_of_week, period_no)"
        )
    if "uq_teacher_slot" in timetable_indexes:
        try:
            cur.execute("ALTER TABLE school_timetable DROP INDEX uq_teacher_slot")
        except Exception:
            pass

    try:
        cur.execute("SHOW COLUMNS FROM staff")
        raw_staff_cols = cur.fetchall()
        staff_columns = {
            (row["Field"] if isinstance(row, dict) else row[0])
            for row in raw_staff_cols
        }
        if "address" not in staff_columns:
            cur.execute("ALTER TABLE staff ADD COLUMN `address` VARCHAR(255) NOT NULL DEFAULT '' AFTER `email`")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE staff MODIFY COLUMN `epf_no` VARCHAR(32) NULL DEFAULT NULL")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE students MODIFY COLUMN `full_name` VARCHAR(255) NOT NULL DEFAULT ''")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE staff MODIFY COLUMN `full_name` VARCHAR(255) NOT NULL DEFAULT ''")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE staff MODIFY COLUMN `department` VARCHAR(150) NOT NULL DEFAULT ''")
    except Exception:
        pass
    try:
        cur.execute(
            "ALTER TABLE subjects MODIFY COLUMN `category` "
            "ENUM('Core','Basket 1','Basket 2','Basket 3','Primary','A/L','Vocational','Other') NOT NULL DEFAULT 'Core'"
        )
    except Exception:
        pass
    try:
        cur.execute("SHOW INDEX FROM subjects WHERE Key_name = 'PRIMARY'")
        pk_cols = cur.fetchall()
        if len(pk_cols) == 1:
            cur.execute("ALTER TABLE subjects DROP PRIMARY KEY, ADD PRIMARY KEY (subject_code, grade_level)")
    except Exception:
        pass

    # Seed timetable and enrich staff profiles in MariaDB from timetable_2026.json
    try:
        json_path = os.path.join(BASE_DIR, "static", "data", "timetable_2026.json")
        if os.path.exists(json_path):
            import json
            with open(json_path, "r", encoding="utf-8") as f:
                tt_data = json.load(f)

            # Enrich matched staff members with subjects_taught, assigned_classes, department, and form_class
            staff_tt = tt_data.get("staff_timetables", {})
            cur.execute("SELECT COUNT(*) as n FROM staff WHERE subjects_taught IS NOT NULL AND subjects_taught != '' AND subjects_taught != 'None'")
            enriched_row = cur.fetchone()
            enriched_cnt = (enriched_row["n"] if isinstance(enriched_row, dict) else enriched_row[0]) if enriched_row else 0
            if enriched_cnt < 40:
                staff_dir = tt_data.get("all_staff_directory", [])
                if staff_dir:
                    cur.executemany(
                        """
                        INSERT IGNORE INTO staff
                        (id, epf_no, full_name, name_with_initials, gender, dob, role, department,
                         subjects_taught, qualifications, appointed_date, contact_no, email, address,
                         nic, status, assigned_classes, photo_url, notes)
                        VALUES (%s, NULL, %s, %s, %s, '', %s, '', '', '', NULL, '', '', '', '', 'Active', '', '', '')
                        """,
                        [
                            (s_entry["id"], s_entry["name"], s_entry["name"], s_entry.get("gender", "Female"), s_entry.get("role", "Graduate Teacher"))
                            for s_entry in staff_dir
                        ]
                    )
                update_params = []
                for sid, prof in staff_tt.items():
                    subjects_str = ", ".join(prof.get("subjects_taught", []))
                    classes_list = list(prof.get("assigned_classes", []))
                    if prof.get("form_class"):
                        fc = f"Form Teacher ({prof['form_class']})"
                        if fc not in classes_list:
                            classes_list.insert(0, fc)
                    classes_str = ", ".join(classes_list)
                    dept_str = prof.get("department", "")
                    load_note = (
                        f"2026 Timetable: {prof.get('teaching_load', 0)} periods/week."
                        + (f" Form Teacher of Grade {prof['form_class']}." if prof.get("form_class") else "")
                    )
                    update_params.append((subjects_str, classes_str, dept_str, load_note, sid))
                if update_params:
                    cur.executemany(
                        """
                        UPDATE staff
                        SET subjects_taught = CASE WHEN subjects_taught IS NULL OR subjects_taught = '' OR subjects_taught = 'None' THEN %s ELSE subjects_taught END,
                            assigned_classes = CASE WHEN assigned_classes IS NULL OR assigned_classes = '' OR assigned_classes = 'None' THEN %s ELSE assigned_classes END,
                            department = CASE WHEN department IS NULL OR department = '' OR department = 'None' THEN %s ELSE department END,
                            notes = CASE WHEN notes IS NULL OR notes = '' OR notes = 'None' THEN %s ELSE notes END
                        WHERE id = %s
                        """,
                        update_params
                    )

            cur.execute("SELECT COUNT(*) as n FROM school_timetable")
            tt_cnt = cur.fetchone()
            cnt = (tt_cnt["n"] if isinstance(tt_cnt, dict) else tt_cnt[0]) if tt_cnt else 0
            if cnt < 850:
                classes = tt_data.get("classes", {})
                tt_params = []
                for cls_name, cls_obj in classes.items():
                    for day_name, p_slots in cls_obj.get("schedule", {}).items():
                        for slot in p_slots:
                            if slot.get("subject") and slot["subject"] != "Free Period":
                                slot_id = f"TT-{cls_name.replace(' ', '')}-{day_name[:3].upper()}-P{slot['period']}"
                                t_id = (slot.get("teacher_id") or slot.get("teacher") or "FACULTY")[:32]
                                t_name = (slot.get("teacher") or "Faculty Member")[:150]
                                tt_params.append((
                                    slot_id,
                                    cls_name,
                                    day_name,
                                    slot["period"],
                                    slot["subject"][:100],
                                    t_id,
                                    t_name
                                ))
                if tt_params:
                    cur.executemany("""
                        INSERT INTO school_timetable
                        (id, class_name, day_of_week, period_no, subject, teacher_id, teacher_name)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                        subject=VALUES(subject), teacher_id=VALUES(teacher_id), teacher_name=VALUES(teacher_name)
                    """, tt_params)
            conn.commit()
    except Exception as e:
        print(f"[MARIADB TIMETABLE SEED ERROR] {e}")

def init_sqlite_schema(conn):
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        admission_no TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        name_with_initials TEXT NOT NULL,
        gender TEXT NOT NULL,
        dob TEXT,
        grade TEXT NOT NULL,
        stream TEXT NOT NULL,
        medium TEXT NOT NULL DEFAULT 'Sinhala',
        house TEXT NOT NULL,
        guardian_name TEXT NOT NULL DEFAULT '',
        guardian_contact TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        enrollment_date TEXT,
        status TEXT NOT NULL DEFAULT 'Active',
        extracurricular TEXT,
        photo_url TEXT,
        notes TEXT,
        nic TEXT UNIQUE,
        primary_mobile TEXT NOT NULL DEFAULT '',
        secondary_mobile TEXT,
        personal_email TEXT,
        edu_email TEXT UNIQUE,
        academic_level TEXT NOT NULL DEFAULT '',
        health_issues TEXT,
        subjects TEXT,
        ol_bucket_1 TEXT,
        ol_bucket_2 TEXT,
        ol_bucket_3 TEXT,
        class TEXT NOT NULL DEFAULT '',
        guardian_nic TEXT NOT NULL DEFAULT '',
        guardian_mobile TEXT NOT NULL DEFAULT '',
        relation_to_student TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS staff (
        id TEXT PRIMARY KEY,
        epf_no TEXT UNIQUE,
        full_name TEXT NOT NULL DEFAULT '',
        name_with_initials TEXT NOT NULL,
        gender TEXT NOT NULL,
        role TEXT NOT NULL,
        department TEXT NOT NULL DEFAULT '',
        subjects_taught TEXT,
        qualifications TEXT NOT NULL DEFAULT '',
        appointed_date TEXT,
        contact_no TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        nic TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Active',
        assigned_classes TEXT,
        photo_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    cur.execute("PRAGMA table_info(staff)")
    sqlite_staff_cols = {row[1] for row in cur.fetchall()}
    if "address" not in sqlite_staff_cols:
        cur.execute("ALTER TABLE staff ADD COLUMN address TEXT NOT NULL DEFAULT ''")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT DEFAULT '',
        staff_id TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS student_marks (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        term TEXT NOT NULL,
        year TEXT NOT NULL,
        marks INTEGER NOT NULL,
        grade TEXT NOT NULL,
        remarks TEXT DEFAULT '',
        updated_by TEXT DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS school_timetable (
        id TEXT PRIMARY KEY,
        class_name TEXT NOT NULL,
        day_of_week TEXT NOT NULL,
        period_no INTEGER NOT NULL CHECK (period_no BETWEEN 1 AND 8),
        subject TEXT NOT NULL,
        teacher_id TEXT NOT NULL,
        teacher_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (class_name, day_of_week, period_no)
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS subjects (
        subject_code TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Core',
        grade_level TEXT NOT NULL DEFAULT '',
        medium TEXT NOT NULL DEFAULT 'Sinhala',
        is_active INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (subject_code, grade_level)
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS teachers (
        teacher_id TEXT PRIMARY KEY,
        name_with_initials TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE,
        primary_phone_no TEXT,
        secondary_phone_no TEXT,
        date_of_birth TEXT,
        age INTEGER,
        address TEXT NOT NULL DEFAULT '',
        nic TEXT UNIQUE,
        date_of_arrival TEXT,
        education_level TEXT NOT NULL DEFAULT '',
        current_role TEXT NOT NULL DEFAULT '',
        assigned_subject TEXT,
        current_subject TEXT,
        other_subject TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_name TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        changed_by TEXT NOT NULL DEFAULT '',
        changed_by_role TEXT NOT NULL DEFAULT '',
        changed_at TEXT NOT NULL,
        changes TEXT
    );
    """)
    for _tbl in ("students", "staff"):
        cur.execute(f"PRAGMA table_info({_tbl})")
        _have = {row[1] for row in cur.fetchall()}
        for _col, _def in AUDIT_COLUMNS.items():
            if _col not in _have:
                cur.execute(f"ALTER TABLE {_tbl} ADD COLUMN {_col} {_def}")

    # Ensure default admin user exists if users table is empty
    cur.execute("SELECT COUNT(*) FROM users")
    if cur.fetchone()[0] == 0:
        cols = ", ".join(USER_FIELDS)
        placeholders = ", ".join(["?"] * len(USER_FIELDS))
        cur.execute(
            f"INSERT INTO users ({cols}) VALUES ({placeholders})",
            (
                "USR-ADM-001",
                "eptheekshana",
                "c712c754aadf926e02cbbdaa7c31ebe0$a0580c6a5bb5b96e475a82b3434434c48824a62a0a46140dd5995ee755de0c3e",
                "admin",
                "E P Theekshana (Administrator)",
                "eptheekshana@gmail.com",
                ""
            )
        )

    # Populate official G.C.E. (O/L) subjects & module codes
    subj_cols = ", ".join(SUBJECT_FIELDS)
    subj_placeholders = ", ".join(["?"] * len(SUBJECT_FIELDS))
    for s_row in SAMPLE_SUBJECTS:
        cur.execute(
            f"INSERT OR REPLACE INTO subjects ({subj_cols}) VALUES ({subj_placeholders})",
            s_row
        )

    # Seed timetable and enrich staff profiles if needed
    try:
        json_path = os.path.join(BASE_DIR, "static", "data", "timetable_2026.json")
        if os.path.exists(json_path):
            import json
            with open(json_path, "r", encoding="utf-8") as f:
                tt_data = json.load(f)

            staff_tt = tt_data.get("staff_timetables", {})
            cur.execute("SELECT COUNT(*) FROM staff")
            stf_cnt = cur.fetchone()[0]
            if stf_cnt == 0:
                for s_entry in tt_data.get("all_staff_directory", []):
                    cur.execute(
                        """
                        INSERT OR IGNORE INTO staff
                        (id, epf_no, full_name, name_with_initials, gender, dob, role, department,
                         subjects_taught, qualifications, appointed_date, contact_no, email, address,
                         nic, status, assigned_classes, photo_url, notes)
                        VALUES (?, NULL, ?, ?, ?, '', ?, '', '', '', NULL, '', '', '', '', 'Active', '', '', '')
                        """,
                        (s_entry["id"], s_entry["name"], s_entry["name"], s_entry.get("gender", "Female"), s_entry.get("role", "Graduate Teacher"))
                    )
            for sid, prof in staff_tt.items():
                subjects_str = ", ".join(prof.get("subjects_taught", []))
                classes_list = list(prof.get("assigned_classes", []))
                if prof.get("form_class"):
                    fc = f"Form Teacher ({prof['form_class']})"
                    if fc not in classes_list:
                        classes_list.insert(0, fc)
                classes_str = ", ".join(classes_list)
                dept_str = prof.get("department", "")
                load_note = (
                    f"2026 Timetable: {prof.get('teaching_load', 0)} periods/week."
                    + (f" Form Teacher of Grade {prof['form_class']}." if prof.get("form_class") else "")
                )
                cur.execute(
                    """
                    UPDATE staff
                    SET subjects_taught = CASE WHEN subjects_taught IS NULL OR subjects_taught = '' OR subjects_taught = 'None' THEN ? ELSE subjects_taught END,
                        assigned_classes = CASE WHEN assigned_classes IS NULL OR assigned_classes = '' OR assigned_classes = 'None' THEN ? ELSE assigned_classes END,
                        department = CASE WHEN department IS NULL OR department = '' OR department = 'None' THEN ? ELSE department END,
                        notes = CASE WHEN notes IS NULL OR notes = '' OR notes = 'None' THEN ? ELSE notes END
                    WHERE id = ?
                    """,
                    (subjects_str, classes_str, dept_str, load_note, sid)
                )

            cur.execute("SELECT COUNT(*) as n FROM school_timetable")
            tt_cnt = cur.fetchone()
            cnt = tt_cnt[0] if tt_cnt else 0
            if cnt < 850:
                classes = tt_data.get("classes", {})
                for cls_name, cls_obj in classes.items():
                    for day_name, p_slots in cls_obj.get("schedule", {}).items():
                        for slot in p_slots:
                            if slot.get("subject") and slot["subject"] != "Free Period":
                                slot_id = f"TT-{cls_name.replace(' ', '')}-{day_name[:3].upper()}-P{slot['period']}"
                                t_id = (slot.get("teacher_id") or slot.get("teacher") or "FACULTY")[:32]
                                t_name = (slot.get("teacher") or "Faculty Member")[:150]
                                cur.execute("""
                                    INSERT OR REPLACE INTO school_timetable
                                    (id, class_name, day_of_week, period_no, subject, teacher_id, teacher_name)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                """, (
                                    slot_id,
                                    cls_name,
                                    day_name,
                                    slot["period"],
                                    slot["subject"][:100],
                                    t_id,
                                    t_name
                                ))
    except Exception as e:
        print(f"[TIMETABLE SEED ERROR] {e}")

    conn.commit()

def init_db():
    engine = determine_engine()
    if engine == "mariadb":
        try:
            cfg = _get_mariadb_config()
            conn = pymysql.connect(**cfg)
            init_mariadb_schema(conn)
            conn.close()
            return
        except Exception as e:
            if os.environ.get("VERCEL"):
                raise RuntimeError(f"MariaDB schema initialization error: {e}")
            pass
    
    conn = sqlite3.connect(SQLITE_PATH)
    init_sqlite_schema(conn)
    conn.close()

# ---------------------------------------------------------------------------
# Query Execution Helpers
# ---------------------------------------------------------------------------
def _clean_dict(row):
    if not row:
        return None
    out = {}
    for k, v in row.items():
        if isinstance(v, (date, datetime)):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out

def execute_query(sql, params=(), fetchone=False, fetchall=False, commit=False):
    """
    Executes a query against MariaDB if active, otherwise SQLite.
    Converts %s placeholders to ? for SQLite automatically.
    """
    engine = ACTIVE_ENGINE
    if engine == "unknown":
        engine = determine_engine()

    if engine == "mariadb":
        try:
            cfg = _get_mariadb_config()
            conn = pymysql.connect(**cfg)
            with conn.cursor() as cur:
                cur.execute(sql, params)
                if commit:
                    conn.commit()
                if fetchone:
                    res = cur.fetchone()
                    conn.close()
                    return _clean_dict(res)
                if fetchall:
                    res = cur.fetchall()
                    conn.close()
                    return [_clean_dict(r) for r in res]
            conn.close()
            return True
        except Exception as e:
            # If MariaDB failed, try switching to SQLite
            pass

    # SQLite fallback execution
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    sqlite_sql = sql.replace("%s", "?")
    cur = conn.cursor()
    cur.execute(sqlite_sql, params)
    if commit:
        conn.commit()
    if fetchone:
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None
    if fetchall:
        rows = cur.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    conn.close()
    return True

# ---------------------------------------------------------------------------
# Public API Methods
# ---------------------------------------------------------------------------
def check_connection():
    ok, msg = test_mariadb()
    host = os.environ.get("DB_HOST", "")
    db_name = os.environ.get("DB_NAME", "defaultdb")
    if ok:
        return True, f"Connected to MariaDB: {host} (Database: {db_name})"
    else:
        return False, f"Remote MariaDB ({host}): {msg}"

def get_engine_status():
    return {
        "engine": ACTIVE_ENGINE,
        "message": ENGINE_STATUS_MSG,
        "mariadb_host": os.environ.get("DB_HOST", ""),
        "mariadb_db": os.environ.get("DB_NAME", "defaultdb")
    }

def get_all_students(search=None, grade=None, house=None):
    sql = "SELECT * FROM students WHERE 1=1"
    params = []
    if search:
        sql += " AND (id LIKE %s OR admission_no LIKE %s OR full_name LIKE %s OR name_with_initials LIKE %s)"
        params += [f"%{search}%"] * 4
    if grade:
        sql += " AND grade = %s"
        params.append(grade)
    if house:
        sql += " AND house = %s"
        params.append(house)
    sql += " ORDER BY id"
    return execute_query(sql, params, fetchall=True)

def get_student_by_id(student_id):
    sid = (student_id or "").strip()
    return execute_query(
        "SELECT * FROM students WHERE UPPER(id) = UPPER(%s) OR UPPER(admission_no) = UPPER(%s) LIMIT 1",
        (sid, sid),
        fetchone=True
    )

def get_all_staff(search=None, department=None, role=None):
    sql = "SELECT * FROM staff WHERE 1=1"
    params = []
    if search:
        sql += (" AND (id LIKE %s OR epf_no LIKE %s OR full_name LIKE %s"
                " OR name_with_initials LIKE %s OR subjects_taught LIKE %s)")
        params += [f"%{search}%"] * 5
    if department:
        sql += " AND department = %s"
        params.append(department)
    if role:
        sql += " AND role LIKE %s"
        params.append(f"%{role}%")
    sql += " ORDER BY id"
    return execute_query(sql, params, fetchall=True)

def get_staff_by_id(staff_id):
    sid = (staff_id or "").strip()
    return execute_query(
        "SELECT * FROM staff WHERE UPPER(id) = UPPER(%s) OR UPPER(epf_no) = UPPER(%s) LIMIT 1",
        (sid, sid),
        fetchone=True
    )

def universal_id_search(query_str):
    q = (query_str or "").strip()
    if not q:
        return None

    # Exact matches
    row = get_student_by_id(q)
    if row:
        return {**row, "entity_type": "student"}
    row = get_staff_by_id(q)
    if row:
        return {**row, "entity_type": "staff"}

    like = f"%{q}%"
    row = execute_query(
        "SELECT * FROM students WHERE id LIKE %s OR admission_no LIKE %s"
        " OR name_with_initials LIKE %s OR full_name LIKE %s LIMIT 1",
        (like, like, like, like),
        fetchone=True
    )
    if row:
        return {**row, "entity_type": "student"}

    row = execute_query(
        "SELECT * FROM staff WHERE id LIKE %s OR epf_no LIKE %s"
        " OR name_with_initials LIKE %s OR full_name LIKE %s LIMIT 1",
        (like, like, like, like),
        fetchone=True
    )
    if row:
        return {**row, "entity_type": "staff"}

    return None

def quick_suggestions(prefix, limit=6, include_staff=True):
    p = (prefix or "").strip()
    if not p:
        return []
    like = f"%{p}%"
    students = execute_query(
        "SELECT id, admission_no, name_with_initials, grade, photo_url FROM students"
        " WHERE id LIKE %s OR full_name LIKE %s OR name_with_initials LIKE %s OR admission_no LIKE %s LIMIT %s",
        (like, like, like, like, limit),
        fetchall=True
    ) or []
    staff = execute_query(
        "SELECT id, name_with_initials, role, photo_url FROM staff"
        " WHERE id LIKE %s OR full_name LIKE %s OR name_with_initials LIKE %s OR epf_no LIKE %s LIMIT %s",
        (like, like, like, like, limit),
        fetchall=True
    ) or []
    staff = []
    if include_staff:
        staff = execute_query(
            "SELECT id, name_with_initials, role, photo_url FROM staff"
            " WHERE id LIKE %s OR full_name LIKE %s OR name_with_initials LIKE %s OR epf_no LIKE %s LIMIT %s",
            (like, like, like, like, limit),
            fetchall=True
        ) or []

    results = [
        {"id": s["admission_no"], "title": s["name_with_initials"], "subtitle": f"Student • Grade {s['grade']}",
         "type": "student", "photo_url": s["photo_url"]}
        for s in students
    ] + [
        {"id": t["id"], "title": t["name_with_initials"], "subtitle": f"Staff • {t['role']}",
         "type": "staff", "photo_url": t["photo_url"]}
        for t in staff
    ]
    return results[:limit]

def get_system_stats():
    engine = ACTIVE_ENGINE
    if engine == "unknown":
        engine = determine_engine()

    if engine == "mariadb":
        try:
            cfg = _get_mariadb_config()
            conn = pymysql.connect(**cfg)
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) as n FROM students WHERE LOWER(status) = 'active'")
                    stus = cur.fetchone()
                    cur.execute("SELECT COUNT(*) as n FROM staff WHERE LOWER(status) = 'active'")
                    stfs = cur.fetchone()
                    cur.execute("""
                        SELECT COUNT(*) as n FROM staff
                        WHERE LOWER(status) = 'active'
                          AND (LOWER(role) LIKE '%clerk%'
                           OR LOWER(role) LIKE '%attendant%'
                           OR LOWER(role) LIKE '%driver%'
                           OR LOWER(role) LIKE '%security%'
                           OR LOWER(role) LIKE '%librarian%'
                           OR LOWER(role) LIKE '%laboratory assistant%'
                           OR LOWER(role) LIKE '%lab assistant%'
                           OR LOWER(role) LIKE '%non-academic%')
                    """)
                    non_academic = cur.fetchone()
                    cur.execute("SELECT grade, COUNT(*) as count FROM students WHERE LOWER(status) = 'active' GROUP BY grade ORDER BY grade")
                    grades = cur.fetchall() or []
                    cur.execute("SELECT department, COUNT(*) as count FROM staff WHERE LOWER(status) = 'active' GROUP BY department ORDER BY department")
                    depts = cur.fetchall() or []
                    cur.execute("SELECT house, COUNT(*) as count FROM students WHERE LOWER(status) = 'active' GROUP BY house ORDER BY house")
                    houses = cur.fetchall() or []
            finally:
                try:
                    conn.close()
                except Exception:
                    pass

            def _val(row, key):
                if not row:
                    return 0
                if isinstance(row, dict):
                    return row.get(key, 0)
                return row[0] if len(row) > 0 else 0

            total_active_stf = _val(stfs, "n")
            active_non_academic = _val(non_academic, "n")
            active_academic = max(0, total_active_stf - active_non_academic)

            return {
                "total_students": _val(stus, "n"),
                "total_staff": active_academic,
                "non_academic_staff": active_non_academic,
                "active_total_staff": total_active_stf,
                "school_total_students": "1,000+",
                "school_total_staff": "50+",
                "grades": [_clean_dict(g) if isinstance(g, dict) else {"grade": g[0], "count": g[1]} for g in grades],
                "departments": [_clean_dict(d) if isinstance(d, dict) else {"department": d[0], "count": d[1]} for d in depts],
                "houses": [_clean_dict(h) if isinstance(h, dict) else {"house": h[0], "count": h[1]} for h in houses],
                "engine": "mariadb"
            }
        except Exception:
            pass

    # SQLite fallback execution
    try:
        conn = sqlite3.connect(SQLITE_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as n FROM students WHERE LOWER(status) = 'active'")
        stus = cur.fetchone()
        cur.execute("SELECT COUNT(*) as n FROM staff WHERE LOWER(status) = 'active'")
        stfs = cur.fetchone()
        cur.execute("""
            SELECT COUNT(*) as n FROM staff
            WHERE LOWER(status) = 'active'
              AND (LOWER(role) LIKE '%clerk%'
               OR LOWER(role) LIKE '%attendant%'
               OR LOWER(role) LIKE '%driver%'
               OR LOWER(role) LIKE '%security%'
               OR LOWER(role) LIKE '%librarian%'
               OR LOWER(role) LIKE '%laboratory assistant%'
               OR LOWER(role) LIKE '%lab assistant%'
               OR LOWER(role) LIKE '%non-academic%')
        """)
        non_academic = cur.fetchone()
        cur.execute("SELECT grade, COUNT(*) as count FROM students WHERE LOWER(status) = 'active' GROUP BY grade ORDER BY grade")
        grades = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT department, COUNT(*) as count FROM staff WHERE LOWER(status) = 'active' GROUP BY department ORDER BY department")
        depts = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT house, COUNT(*) as count FROM students WHERE LOWER(status) = 'active' GROUP BY house ORDER BY house")
        houses = [dict(r) for r in cur.fetchall()]
        conn.close()

        total_active_stf = stfs["n"] if stfs else 0
        active_non_academic = non_academic["n"] if non_academic else 0
        active_academic = max(0, total_active_stf - active_non_academic)

        return {
            "total_students": stus["n"] if stus else 0,
            "total_staff": active_academic,
            "non_academic_staff": active_non_academic,
            "active_total_staff": total_active_stf,
            "school_total_students": "1,000+",
            "school_total_staff": "50+",
            "grades": grades,
            "departments": depts,
            "houses": houses,
            "engine": "sqlite"
        }
    except Exception:
        return {
            "total_students": 0,
            "total_staff": 0,
            "non_academic_staff": 0,
            "school_total_students": "1,000+",
            "school_total_staff": "50+",
            "grades": [],
            "departments": [],
            "houses": [],
            "engine": ACTIVE_ENGINE
        }

# ---------------------------------------------------------------------------
# Create / Update / Delete
# ---------------------------------------------------------------------------
def calculate_house_from_admission(admission_no):
    """
    Auto-determine student house based on admission number mod 3:
    mod 0 = Mayura
    mod 1 = Thisara
    mod 2 = Paravi
    """
    digits = ''.join(c for c in str(admission_no or "") if c.isdigit())
    if digits:
        mod = int(digits) % 3
        if mod == 0:
            return "Mayura"
        elif mod == 1:
            return "Thisara"
        elif mod == 2:
            return "Paravi"
    return "Thisara"

def _now_iso():
    return datetime.now().isoformat(timespec="microseconds")


def _actor_name(actor):
    """Readable identity of the signed-in user performing a change."""
    if not actor:
        return "System"
    if isinstance(actor, str):
        return actor
    name = actor.get("full_name") or actor.get("username") or "Unknown"
    uname = actor.get("username")
    return f"{name} ({uname})" if uname and uname not in name else name


def _actor_role(actor):
    return actor.get("role", "") if isinstance(actor, dict) else ""


def record_audit(entity_type, entity_id, entity_name, action, actor, changes=None):
    """Append an entry to the audit log (never raises into the caller)."""
    try:
        execute_query(
            "INSERT INTO audit_log (id, entity_type, entity_id, entity_name, action, changed_by,"
            " changed_by_role, changed_at, changes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (uuid.uuid4().hex, entity_type, str(entity_id), entity_name or "", action,
             _actor_name(actor), _actor_role(actor), _now_iso(),
             json.dumps(changes, ensure_ascii=False) if changes else None),
            commit=True,
        )
    except Exception:
        pass


def _diff_records(old, new, fields):
    """Return {field: {"old":..., "new":...}} for fields whose values changed."""
    diff = {}
    for f in fields:
        o = old.get(f)
        n = new.get(f)
        o = "" if o is None else str(o)
        n = "" if n is None else str(n)
        if o != n:
            diff[f] = {"old": o, "new": n}
    return diff


def get_audit_log(entity_type=None, entity_id=None, limit=200):
    sql = "SELECT * FROM audit_log WHERE 1=1"
    params = []
    if entity_type:
        sql += " AND entity_type = %s"
        params.append(entity_type)
    if entity_id:
        sql += " AND UPPER(entity_id) = UPPER(%s)"
        params.append(str(entity_id))
    sql += " ORDER BY changed_at DESC LIMIT %s"
    params.append(int(limit))
    rows = execute_query(sql, params, fetchall=True) or []
    for r in rows:
        try:
            r["changes"] = json.loads(r["changes"]) if r.get("changes") else {}
        except Exception:
            r["changes"] = {}
    return rows


def _stamp(table, key, actor, created=False):
    now = _now_iso()
    who = _actor_name(actor)
    if created:
        execute_query(
            f"UPDATE {table} SET created_by=%s, updated_by=%s, last_updated_at=%s WHERE id=%s",
            (who, who, now, key), commit=True)
    else:
        execute_query(
            f"UPDATE {table} SET updated_by=%s, last_updated_at=%s WHERE id=%s",
            (who, now, key), commit=True)


def create_student(data, actor=None):
    cols = ", ".join([f"`{f}`" for f in STUDENT_FIELDS])
    placeholders = ", ".join(["%s"] * len(STUDENT_FIELDS))
    sanitized = dict(data)
    sanitized["id"] = sanitized.get("admission_no", "")
    if not sanitized.get("house"):
        sanitized["house"] = calculate_house_from_admission(sanitized.get("admission_no"))
    for df in ["dob", "enrollment_date"]:
        val = sanitized.get(df)
        sanitized[df] = str(val).strip() if val and str(val).strip() else None
    vals = [sanitized.get(f) if sanitized.get(f) is not None else "" for f in STUDENT_FIELDS]
    execute_query(f"INSERT INTO students ({cols}) VALUES ({placeholders})", vals, commit=True)
    _stamp("students", sanitized.get("id"), actor, created=True)
    record_audit("student", sanitized.get("id"), sanitized.get("name_with_initials"), "create", actor,
                 {f: {"old": "", "new": str(sanitized.get(f))} for f in STUDENT_FIELDS
                  if f != "id" and sanitized.get(f) not in (None, "")})
    return get_student_by_id(sanitized.get("id"))

def update_student(student_id, data, actor=None):
    current = get_student_by_id(student_id) or {}
    merged = {**current, **{k: v for k, v in data.items() if v is not None}}
    if "admission_no" in merged and not merged.get("house"):
        merged["house"] = calculate_house_from_admission(merged.get("admission_no"))
    for df in ["dob", "enrollment_date"]:
        if df in merged:
            val = merged.get(df)
            merged[df] = str(val).strip() if val and str(val).strip() else None
    fields = [f for f in STUDENT_FIELDS if f != "id"]
    set_clause = ", ".join([f"`{f}`=%s" for f in fields])
    vals = [merged.get(f) if merged.get(f) is not None else "" for f in fields] + [student_id]
    execute_query(f"UPDATE students SET {set_clause} WHERE id=%s", vals, commit=True)
    changes = _diff_records(current, merged, fields)
    if changes:
        _stamp("students", student_id, actor)
        record_audit("student", student_id, merged.get("name_with_initials"), "update", actor, changes)
    return get_student_by_id(student_id)

def delete_student(student_id, actor=None):
    current = get_student_by_id(student_id) or {}
    execute_query("DELETE FROM students WHERE id=%s", (student_id,), commit=True)
    record_audit("student", student_id, current.get("name_with_initials"), "delete", actor)
    return True

def create_staff(data, actor=None):
    cols = ", ".join([f"`{f}`" for f in STAFF_FIELDS])
    placeholders = ", ".join(["%s"] * len(STAFF_FIELDS))
    sanitized = dict(data)
    epf = sanitized.get("epf_no")
    sanitized["epf_no"] = str(epf).strip() if epf and str(epf).strip() else None
    app_date = sanitized.get("appointed_date")
    sanitized["appointed_date"] = str(app_date).strip() if app_date and str(app_date).strip() else None
    vals = [
        sanitized.get(f) if f in ("epf_no", "appointed_date") else (sanitized.get(f) if sanitized.get(f) is not None else "")
        for f in STAFF_FIELDS
    ]
    execute_query(f"INSERT INTO staff ({cols}) VALUES ({placeholders})", vals, commit=True)
    _stamp("staff", sanitized.get("id"), actor, created=True)
    record_audit("staff", sanitized.get("id"), sanitized.get("name_with_initials"), "create", actor,
                 {f: {"old": "", "new": str(sanitized.get(f))} for f in STAFF_FIELDS
                  if f != "id" and sanitized.get(f) not in (None, "")})
    return get_staff_by_id(sanitized.get("id"))

def update_staff(staff_id, data, actor=None):
    current = get_staff_by_id(staff_id) or {}
    sanitized = dict(data)
    if "epf_no" in sanitized:
        epf = sanitized.get("epf_no")
        sanitized["epf_no"] = str(epf).strip() if epf and str(epf).strip() else None
    if "appointed_date" in sanitized:
        app_date = sanitized.get("appointed_date")
        sanitized["appointed_date"] = str(app_date).strip() if app_date and str(app_date).strip() else None
    merged = {**current, **{k: v for k, v in sanitized.items() if v is not None or k in ("epf_no", "appointed_date")}}
    fields = [f for f in STAFF_FIELDS if f != "id"]
    set_clause = ", ".join([f"`{f}`=%s" for f in fields])
    vals = [
        merged.get(f) if f in ("epf_no", "appointed_date") else (merged.get(f) if merged.get(f) is not None else "")
        for f in fields
    ] + [staff_id]
    execute_query(f"UPDATE staff SET {set_clause} WHERE id=%s", vals, commit=True)
    changes = _diff_records(current, merged, fields)
    if changes:
        _stamp("staff", staff_id, actor)
        record_audit("staff", staff_id, merged.get("name_with_initials"), "update", actor, changes)
    return get_staff_by_id(staff_id)

def delete_staff(staff_id, actor=None):
    current = get_staff_by_id(staff_id) or {}
    execute_query("DELETE FROM staff WHERE id=%s", (staff_id,), commit=True)
    record_audit("staff", staff_id, current.get("name_with_initials"), "delete", actor)
    return True


def bulk_upsert_students(mapped_records, mode="upsert", actor=None):
    """
    Bulk create or update students from [(row_number, student_dict), ...].
    mode: 'upsert' (create new + update existing) or 'skip' (create new, skip existing).
    """
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []

    for row_num, rec in mapped_records:
        adm_no = str(rec.get("admission_no") or "").strip()
        initials = str(rec.get("name_with_initials") or "").strip()
        if not adm_no or not initials:
            errors.append({
                "row": row_num,
                "identifier": adm_no or "Missing Admission No",
                "error": "Admission Number and Name with Initials are required."
            })
            continue

        try:
            existing = get_student_by_id(adm_no)
            if existing:
                if mode == "skip":
                    skipped_count += 1
                else:
                    update_student(existing["id"], rec, actor=actor)
                    updated_count += 1
            else:
                create_student(rec, actor=actor)
                created_count += 1
        except Exception as exc:
            errors.append({
                "row": row_num,
                "identifier": adm_no,
                "error": str(exc)
            })

    return {
        "total_rows": len(mapped_records),
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "error_count": len(errors),
        "errors": errors,
    }


def bulk_upsert_staff(mapped_records, mode="upsert", actor=None):
    """
    Bulk create or update teachers/staff from [(row_number, staff_dict), ...].
    mode: 'upsert' (create new + update existing) or 'skip' (create new, skip existing).
    """
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []

    existing_staff = get_all_staff()
    next_seq = len(existing_staff) + 1

    for row_num, rec in mapped_records:
        staff_id = str(rec.get("id") or "").strip()
        initials = str(rec.get("name_with_initials") or "").strip()
        if not initials:
            errors.append({
                "row": row_num,
                "identifier": staff_id or "Missing ID",
                "error": "Name with Initials is required."
            })
            continue

        if not staff_id:
            while get_staff_by_id(f"JMV-STF-{next_seq:03d}"):
                next_seq += 1
            staff_id = f"JMV-STF-{next_seq:03d}"
            rec["id"] = staff_id
            next_seq += 1

        try:
            existing = get_staff_by_id(staff_id)
            if existing:
                if mode == "skip":
                    skipped_count += 1
                else:
                    update_staff(existing["id"], rec, actor=actor)
                    updated_count += 1
            else:
                create_staff(rec, actor=actor)
                created_count += 1
        except Exception as exc:
            errors.append({
                "row": row_num,
                "identifier": staff_id,
                "error": str(exc)
            })

    return {
        "total_rows": len(mapped_records),
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "error_count": len(errors),
        "errors": errors,
    }

def reset_to_demo_data():
    execute_query("DELETE FROM students", commit=True)
    execute_query("DELETE FROM staff", commit=True)
    execute_query("DELETE FROM users", commit=True)
    execute_query("DELETE FROM student_marks", commit=True)
    execute_query("DELETE FROM sessions", commit=True)
    
    cols_stu = ", ".join(STUDENT_FIELDS)
    placeholders_stu = ", ".join(["%s"] * len(STUDENT_FIELDS))
    for r in SAMPLE_STUDENTS:
        execute_query(
            f"INSERT INTO students ({cols_stu}) VALUES ({placeholders_stu})",
            r, commit=True
        )

    cols_stf = ", ".join(STAFF_FIELDS)
    placeholders_stf = ", ".join(["%s"] * len(STAFF_FIELDS))
    for r in SAMPLE_STAFF:
        execute_query(
            f"INSERT INTO staff ({cols_stf}) VALUES ({placeholders_stf})",
            r, commit=True
        )

    cols_usr = ", ".join(USER_FIELDS)
    placeholders_usr = ", ".join(["%s"] * len(USER_FIELDS))
    for r in SAMPLE_USERS:
        execute_query(
            f"INSERT INTO users ({cols_usr}) VALUES ({placeholders_usr})",
            r, commit=True
        )

    cols_mrk = ", ".join(MARK_FIELDS)
    placeholders_mrk = ", ".join(["%s"] * len(MARK_FIELDS))
    for r in SAMPLE_MARKS:
        execute_query(f"INSERT INTO student_marks ({cols_mrk}) VALUES ({placeholders_mrk})", r, commit=True)

# ---------------------------------------------------------------------------
# Authentication & User Management (Role-Based: Admin & Teacher)
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return binascii.hexlify(salt).decode() + '$' + binascii.hexlify(dk).decode()

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, hash_hex = stored_hash.split('$')
        salt = binascii.unhexlify(salt_hex)
        dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
        return binascii.hexlify(dk).decode() == hash_hex
    except Exception:
        return False

def authenticate_user(username, password):
    user = execute_query(
        "SELECT id, username, password_hash, role, full_name, email, staff_id FROM users WHERE username = %s",
        (username.strip(),),
        fetchone=True
    )
    if not user:
        return None
    if verify_password(password, user["password_hash"]):
        user_clean = {k: v for k, v in user.items() if k != "password_hash"}
        return user_clean
    return None

def create_session(user_id, role, hours=24):
    token = secrets.token_hex(32)
    now = datetime.now()
    expires_at = (now + timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
    execute_query(
        "INSERT INTO sessions (token, user_id, role, expires_at) VALUES (%s, %s, %s, %s)",
        (token, user_id, role, expires_at),
        commit=True
    )
    return token

def validate_session(token):
    if not token:
        return None
    session = execute_query(
        """
        SELECT s.token, s.user_id, s.role, s.expires_at,
               u.username, u.full_name, u.email, u.staff_id
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = %s
        """,
        (token,),
        fetchone=True
    )
    if not session:
        return None
    if session.get("expires_at"):
        try:
            exp = datetime.strptime(str(session["expires_at"])[:19], "%Y-%m-%d %H:%M:%S")
            if datetime.now() > exp:
                delete_session(token)
                return None
        except Exception:
            pass
    return session

def delete_session(token):
    execute_query("DELETE FROM sessions WHERE token = %s", (token,), commit=True)
    return True

def get_all_users():
    return execute_query(
        "SELECT id, username, role, full_name, email, staff_id, created_at FROM users ORDER BY role ASC, full_name ASC",
        fetchall=True
    )

def create_user(data):
    user_id = data.get("id") or f"USR-{uuid.uuid4().hex[:6].upper()}"
    pw_hash = hash_password(data.get("password", "teacher123"))
    vals = [
        user_id,
        data.get("username").strip(),
        pw_hash,
        data.get("role", "teacher").strip(),
        data.get("full_name", "").strip(),
        data.get("email", "").strip(),
        data.get("staff_id", "").strip(),
    ]
    cols = ", ".join(USER_FIELDS)
    placeholders = ", ".join(["%s"] * len(USER_FIELDS))
    execute_query(f"INSERT INTO users ({cols}) VALUES ({placeholders})", vals, commit=True)
    return execute_query(
        "SELECT id, username, role, full_name, email, staff_id FROM users WHERE id = %s",
        (user_id,),
        fetchone=True
    )

# ---------------------------------------------------------------------------
# Student Marks Management (Role: Teachers update marks; Admins full edit)
# ---------------------------------------------------------------------------
def calculate_grade(marks):
    try:
        m = float(marks)
    except (ValueError, TypeError):
        return 'F'
    if m >= 75:
        return 'A'
    elif m >= 65:
        return 'B'
    elif m >= 50:
        return 'C'
    elif m >= 35:
        return 'S'
    else:
        return 'F'

def get_student_marks(student_id, term=None, year=None):
    sql = "SELECT * FROM student_marks WHERE student_id = %s"
    params = [student_id]
    if term:
        sql += " AND term = %s"
        params.append(term)
    if year:
        sql += " AND year = %s"
        params.append(year)
    sql += " ORDER BY year DESC, term ASC, subject ASC"
    return execute_query(sql, params, fetchall=True)

def get_all_marks(term=None, year=None, search=None):
    sql = """
    SELECT m.*, s.full_name as student_name, s.name_with_initials, s.grade as student_grade, s.stream
    FROM student_marks m
    LEFT JOIN students s ON m.student_id = s.id
    WHERE 1=1
    """
    params = []
    if term:
        sql += " AND m.term = %s"
        params.append(term)
    if year:
        sql += " AND m.year = %s"
        params.append(year)
    if search:
        sql += " AND (m.student_id LIKE %s OR s.full_name LIKE %s OR m.subject LIKE %s)"
        like_term = f"%{search}%"
        params.extend([like_term, like_term, like_term])
    sql += " ORDER BY m.year DESC, m.term ASC, s.grade ASC, m.subject ASC"
    return execute_query(sql, params, fetchall=True)

def save_student_mark(data, updated_by="Teacher"):
    mark_id = data.get("id")
    student_id = data.get("student_id")
    subject = data.get("subject", "").strip()
    term = data.get("term", "Term 1").strip()
    year = str(data.get("year", "2026")).strip()
    marks = int(data.get("marks", 0))
    grade = data.get("grade") or calculate_grade(marks)
    remarks = data.get("remarks", "").strip()

    # Check existence by ID or composite key
    existing = None
    if mark_id:
        existing = execute_query("SELECT id FROM student_marks WHERE id = %s", (mark_id,), fetchone=True)
    
    if not existing:
        existing = execute_query(
            "SELECT id FROM student_marks WHERE student_id = %s AND subject = %s AND term = %s AND year = %s",
            (student_id, subject, term, year),
            fetchone=True
        )

    if existing:
        target_id = existing["id"]
        execute_query(
            """
            UPDATE student_marks 
            SET marks = %s, grade = %s, remarks = %s, updated_by = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (marks, grade, remarks, updated_by, target_id),
            commit=True
        )
        return execute_query("SELECT * FROM student_marks WHERE id = %s", (target_id,), fetchone=True)
    else:
        new_id = mark_id or f"MRK-{uuid.uuid4().hex[:8].upper()}"
        vals = [new_id, student_id, subject, term, year, marks, grade, remarks, updated_by]
        cols = ", ".join(MARK_FIELDS)
        placeholders = ", ".join(["%s"] * len(MARK_FIELDS))
        execute_query(f"INSERT INTO student_marks ({cols}) VALUES ({placeholders})", vals, commit=True)
        return execute_query("SELECT * FROM student_marks WHERE id = %s", (new_id,), fetchone=True)

def delete_student_mark(mark_id):
    execute_query("DELETE FROM student_marks WHERE id = %s", (mark_id,), commit=True)
    return True

TIMETABLE_DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")

def get_timetable(class_name=None, teacher_id=None):
    sql = "SELECT * FROM school_timetable"
    conditions = []
    params = []
    if class_name:
        conditions.append("class_name = %s")
        params.append(class_name)
    if teacher_id:
        conditions.append("teacher_id = %s")
        params.append(teacher_id)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY CASE day_of_week " + " ".join(
        f"WHEN '{day}' THEN {index}" for index, day in enumerate(TIMETABLE_DAYS, 1)
    ) + " END, period_no"
    return execute_query(sql, params, fetchall=True) or []

def save_timetable_entry(data):
    entry_id = data.get("id") or f"TT-{uuid.uuid4().hex[:10].upper()}"
    class_name = str(data.get("class_name", "")).strip()
    day = str(data.get("day_of_week", "")).strip()
    period = int(data.get("period_no", 0))
    subject = str(data.get("subject", "")).strip()
    teacher_id = str(data.get("teacher_id", "")).strip()
    teacher_name = str(data.get("teacher_name", "")).strip()
    if not class_name or day not in TIMETABLE_DAYS or not 1 <= period <= 8:
        raise ValueError("Class, weekday, and a period from 1 to 8 are required.")
    if not subject or not teacher_id or not teacher_name:
        raise ValueError("Subject and teacher are required.")

    conflict = execute_query(
        """
        SELECT id FROM school_timetable
        WHERE ((class_name = %s AND day_of_week = %s AND period_no = %s)
           OR (teacher_id = %s AND day_of_week = %s AND period_no = %s))
          AND id <> %s LIMIT 1
        """,
        (class_name, day, period, teacher_id, day, period, entry_id),
        fetchone=True
    )
    if conflict:
        raise ValueError("This class or teacher already has a timetable entry in that period.")

    existing = execute_query(
        "SELECT id FROM school_timetable WHERE id = %s", (entry_id,), fetchone=True
    )
    if existing:
        execute_query(
            """
            UPDATE school_timetable
            SET class_name=%s, day_of_week=%s, period_no=%s, subject=%s,
                teacher_id=%s, teacher_name=%s, updated_at=CURRENT_TIMESTAMP
            WHERE id=%s
            """,
            (class_name, day, period, subject, teacher_id, teacher_name, entry_id),
            commit=True
        )
    else:
        execute_query(
            """
            INSERT INTO school_timetable
            (id, class_name, day_of_week, period_no, subject, teacher_id, teacher_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (entry_id, class_name, day, period, subject, teacher_id, teacher_name),
            commit=True
        )
    return execute_query(
        "SELECT * FROM school_timetable WHERE id = %s", (entry_id,), fetchone=True
    )

def delete_timetable_entry(entry_id):
    execute_query("DELETE FROM school_timetable WHERE id = %s", (entry_id,), commit=True)
    return True


def get_all_subjects(category=None):
    sql = "SELECT * FROM subjects WHERE is_active = 1"
    params = []
    if category:
        sql += " AND category = %s"
        params.append(category)
    sql += " ORDER BY CAST(subject_code AS UNSIGNED) ASC, subject_code ASC"
    return execute_query(sql, tuple(params), fetchall=True)


if __name__ == "__main__":
    init_db()
    print("DB Initialized. Active engine:", ACTIVE_ENGINE)
    print("Status:", ENGINE_STATUS_MSG)
    stats = get_system_stats()
    print(f"Students: {stats['total_students']}, Staff: {stats['total_staff']}")
