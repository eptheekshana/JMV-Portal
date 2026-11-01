"""
Unified Database Layer for Jayakody Maha Vidyalaya (JMV) Portal
Supports:
1. Remote MariaDB (credentials loaded from .env)
2. Automatic seamless fallback to local SQLite if remote MariaDB credentials/access are denied or offline.

Theme & Identity: WP/KE/Jayakody Maha Vidyalaya (JMV-Web)
"""

import os
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
    USER_COLUMNS, MARK_COLUMNS, SAMPLE_USERS, SAMPLE_MARKS
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

# State tracking
ACTIVE_ENGINE = "unknown"  # "mariadb" or "sqlite"
ENGINE_STATUS_MSG = ""

def _get_mariadb_config():
    raw_pw = os.environ.get("DB_PASSWORD", "AVNS_oUmLptLL3OmEKN2U4Si")
    if raw_pw:
        # Sanitize Unicode asterisks (e.g. \u2217, \ufe61, \uff0a) introduced by copy-pasting from rich text
        raw_pw = (raw_pw.replace('\u2217', '*')
                        .replace('\ufe61', '*')
                        .replace('\uff0a', '*')
                        .strip())
    cfg = {
        "host": os.environ.get("DB_HOST", "jmvportal-sa-final-project.e.aivencloud.com").strip(),
        "port": int(os.environ.get("DB_PORT", "27928")),
        "user": os.environ.get("DB_USER", "avnadmin").strip(),
        "password": raw_pw,
        "database": os.environ.get("DB_NAME", "defaultdb").strip(),
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
            full_name VARCHAR(255) NOT NULL,
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS staff (
            id VARCHAR(32) PRIMARY KEY,
            epf_no VARCHAR(32) NULL UNIQUE,
            full_name VARCHAR(255) NOT NULL,
            name_with_initials VARCHAR(150) NOT NULL,
            gender VARCHAR(16) NOT NULL,
            role VARCHAR(150) NOT NULL,
            department VARCHAR(150) NOT NULL,
            subjects_taught VARCHAR(255),
            qualifications VARCHAR(500) NOT NULL DEFAULT '',
            appointed_date VARCHAR(32) NULL,
            contact_no VARCHAR(32) NOT NULL DEFAULT '',
            email VARCHAR(150) NOT NULL DEFAULT '',
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
            UNIQUE KEY uq_teacher_slot (teacher_id, day_of_week, period_no)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        _migrate_existing_mariadb_schema(cur)

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
    if "uq_teacher_slot" not in timetable_indexes:
        cur.execute(
            "ALTER TABLE school_timetable ADD UNIQUE KEY "
            "uq_teacher_slot (teacher_id, day_of_week, period_no)"
        )

    try:
        cur.execute("ALTER TABLE staff MODIFY COLUMN `epf_no` VARCHAR(32) NULL DEFAULT NULL")
    except Exception:
        pass

def init_sqlite_schema(conn):
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        admission_no TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS staff (
        id TEXT PRIMARY KEY,
        epf_no TEXT UNIQUE,
        full_name TEXT NOT NULL,
        name_with_initials TEXT NOT NULL,
        gender TEXT NOT NULL,
        role TEXT NOT NULL,
        department TEXT NOT NULL,
        subjects_taught TEXT,
        qualifications TEXT NOT NULL DEFAULT '',
        appointed_date TEXT,
        contact_no TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        nic TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Active',
        assigned_classes TEXT,
        photo_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

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
        UNIQUE (class_name, day_of_week, period_no),
        UNIQUE (teacher_id, day_of_week, period_no)
    );
    """)

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
    host = os.environ.get("DB_HOST", "jmvportal-sa-final-project.e.aivencloud.com")
    db_name = os.environ.get("DB_NAME", "defaultdb")
    if ok:
        return True, f"Connected to MariaDB: {host} (Database: {db_name})"
    else:
        return False, f"Remote MariaDB ({host}): {msg}"

def get_engine_status():
    return {
        "engine": ACTIVE_ENGINE,
        "message": ENGINE_STATUS_MSG,
        "mariadb_host": os.environ.get("DB_HOST", "jmvportal-sa-final-project.e.aivencloud.com"),
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

def quick_suggestions(prefix, limit=6):
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
                    cur.execute("SELECT COUNT(*) as n FROM students")
                    stus = cur.fetchone()
                    cur.execute("SELECT COUNT(*) as n FROM staff")
                    stfs = cur.fetchone()
                    cur.execute("""
                        SELECT COUNT(*) as n FROM staff
                        WHERE LOWER(role) LIKE '%clerk%'
                           OR LOWER(role) LIKE '%attendant%'
                           OR LOWER(role) LIKE '%driver%'
                           OR LOWER(role) LIKE '%security%'
                           OR LOWER(role) LIKE '%librarian%'
                           OR LOWER(role) LIKE '%laboratory assistant%'
                           OR LOWER(role) LIKE '%lab assistant%'
                           OR LOWER(role) LIKE '%non-academic%'
                    """)
                    non_academic = cur.fetchone()
                    cur.execute("SELECT grade, COUNT(*) as count FROM students GROUP BY grade ORDER BY grade")
                    grades = cur.fetchall() or []
                    cur.execute("SELECT department, COUNT(*) as count FROM staff GROUP BY department ORDER BY department")
                    depts = cur.fetchall() or []
                    cur.execute("SELECT house, COUNT(*) as count FROM students GROUP BY house ORDER BY house")
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

            return {
                "total_students": _val(stus, "n"),
                "total_staff": _val(stfs, "n"),
                "non_academic_staff": _val(non_academic, "n"),
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
        cur.execute("SELECT COUNT(*) as n FROM students")
        stus = cur.fetchone()
        cur.execute("SELECT COUNT(*) as n FROM staff")
        stfs = cur.fetchone()
        cur.execute("""
            SELECT COUNT(*) as n FROM staff
            WHERE LOWER(role) LIKE '%clerk%'
               OR LOWER(role) LIKE '%attendant%'
               OR LOWER(role) LIKE '%driver%'
               OR LOWER(role) LIKE '%security%'
               OR LOWER(role) LIKE '%librarian%'
               OR LOWER(role) LIKE '%laboratory assistant%'
               OR LOWER(role) LIKE '%lab assistant%'
               OR LOWER(role) LIKE '%non-academic%'
        """)
        non_academic = cur.fetchone()
        cur.execute("SELECT grade, COUNT(*) as count FROM students GROUP BY grade ORDER BY grade")
        grades = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT department, COUNT(*) as count FROM staff GROUP BY department ORDER BY department")
        depts = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT house, COUNT(*) as count FROM students GROUP BY house ORDER BY house")
        houses = [dict(r) for r in cur.fetchall()]
        conn.close()

        return {
            "total_students": stus["n"] if stus else 0,
            "total_staff": stfs["n"] if stfs else 0,
            "non_academic_staff": non_academic["n"] if non_academic else 0,
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
def create_student(data):
    cols = ", ".join(STUDENT_FIELDS)
    placeholders = ", ".join(["%s"] * len(STUDENT_FIELDS))
    data = {**data, "id": data.get("admission_no", "")}
    vals = [data.get(f, "") for f in STUDENT_FIELDS]
    execute_query(f"INSERT INTO students ({cols}) VALUES ({placeholders})", vals, commit=True)
    return get_student_by_id(data.get("id"))

def update_student(student_id, data):
    current = get_student_by_id(student_id) or {}
    merged = {**current, **{k: v for k, v in data.items() if v is not None}}
    fields = [f for f in STUDENT_FIELDS if f != "id"]
    set_clause = ", ".join([f"{f}=%s" for f in fields])
    vals = [merged.get(f, "") for f in fields] + [student_id]
    execute_query(f"UPDATE students SET {set_clause} WHERE id=%s", vals, commit=True)
    return get_student_by_id(student_id)

def delete_student(student_id):
    execute_query("DELETE FROM students WHERE id=%s", (student_id,), commit=True)
    return True

def create_staff(data):
    cols = ", ".join(STAFF_FIELDS)
    placeholders = ", ".join(["%s"] * len(STAFF_FIELDS))
    sanitized = dict(data)
    epf = sanitized.get("epf_no")
    sanitized["epf_no"] = str(epf).strip() if epf and str(epf).strip() else None
    vals = [sanitized.get(f) if f == "epf_no" else sanitized.get(f, "") for f in STAFF_FIELDS]
    execute_query(f"INSERT INTO staff ({cols}) VALUES ({placeholders})", vals, commit=True)
    return get_staff_by_id(sanitized.get("id"))

def update_staff(staff_id, data):
    current = get_staff_by_id(staff_id) or {}
    sanitized = dict(data)
    if "epf_no" in sanitized:
        epf = sanitized.get("epf_no")
        sanitized["epf_no"] = str(epf).strip() if epf and str(epf).strip() else None
    merged = {**current, **{k: v for k, v in sanitized.items() if v is not None or k == "epf_no"}}
    fields = [f for f in STAFF_FIELDS if f != "id"]
    set_clause = ", ".join([f"{f}=%s" for f in fields])
    vals = [merged.get(f) if f == "epf_no" else merged.get(f, "") for f in fields] + [staff_id]
    execute_query(f"UPDATE staff SET {set_clause} WHERE id=%s", vals, commit=True)
    return get_staff_by_id(staff_id)

def delete_staff(staff_id):
    execute_query("DELETE FROM staff WHERE id=%s", (staff_id,), commit=True)
    return True

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

def get_timetable(class_name=None):
    sql = "SELECT * FROM school_timetable"
    params = []
    if class_name:
        sql += " WHERE class_name = %s"
        params.append(class_name)
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

if __name__ == "__main__":
    init_db()
    print("DB Initialized. Active engine:", ACTIVE_ENGINE)
    print("Status:", ENGINE_STATUS_MSG)
    stats = get_system_stats()
    print(f"Students: {stats['total_students']}, Staff: {stats['total_staff']}")
