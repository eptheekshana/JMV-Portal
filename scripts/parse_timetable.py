#!/usr/bin/env python3
"""
Extract WP/KE/Jayakody Maha Vidyalaya 2026 Timetable from PDF.
Outputs:
  - static/data/timetable_2026.json (Classes and Teachers structured data)
  - Seeds school_timetable in db.py (both SQLite and MariaDB)
"""
import os
import sys
import json
import re
import subprocess
import xml.etree.ElementTree as ET

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_PATH = os.path.join(
    os.path.expanduser("~"),
    ".gemini/antigravity/brain/6a2a72eb-964d-4e84-8139-3ed4e4e2b1f6/.user_uploaded/media_1793727621823_6b2d64e3.pdf"
)

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
PERIOD_TIMES = [
    "07:50 - 08:30",
    "08:30 - 09:10",
    "09:10 - 09:50",
    "09:50 - 10:30",
    "10:50 - 11:30",
    "11:30 - 12:10",
    "12:10 - 12:50",
    "12:50 - 13:30",
]

# Coordinate bounds for aSc timetable grid in 1188x918 pages
COL_BOUNDS = [(140, 345), (345, 550), (550, 755), (755, 960), (960, 1165)]
ROW_BOUNDS = [(130 + i * 92, 130 + (i + 1) * 92) for i in range(8)]

TEACHER_CODE_MAP = {
    "3-UDENI": "Mrs. Udeni Wijerathna",
    "4-MANOJA": "Mrs. Manoja Hemakumari",
    "5-SHIROMI": "Mrs. Shiromi Ranasinghe",
    "6-UPUL": "Mr. W.M. Upul Hemantha",
    "67-KRISHNAMALI": "Mrs. U.K. Chandrasena",
    "67- KRISHNAMALI": "Mrs. U.K. Chandrasena",
    "12-ANURA": "Mr. W. Anura",
    "16-SUMATHIPALA": "Mr. N.A. Sumathipala",
    "17-SANJEEWANI": "Mrs. J.A.L. Sanjeewani",
    "EDIRISINHA": "Mrs. N.K. Edirisinghe",
    "19-ASHA": "Mrs. Asha Senewirathna",
    "20-SUDARSHANI": "Mrs. K.D.A.N. Sudarshani",
    "21-CHAMIKA": "Mrs. Chamika Roopasinghe",
    "22-THAMALI": "Mrs. T.D. Chandrasekara",
    "25-SHIRMILA": "Mrs. S.A.S.D. Sooriarachchi",
    "26-UPAMALI": "Mrs. K.U. Indira Ranaweera",
    "28-MAJI": "Mrs. M.G. Dasanayeka",
    "30-MADUSHANKA": "Mr. W.A. Madushanka",
    "31-WASANA": "Mrs. Kawn Kuruppu",
    "32-SHASHI": "Mr. W.A.L.S.P. Weerasinghe",
    "33-SHANIKA": "Mrs. Shanika Dayananda",
    "34-PRASARINI": "Mrs. W.K.S. Prasarini",
    "35-UTHPALA": "Mrs. J.P. Uthpala Jayewardena",
    "36-NELUM": "Mrs. K.L.N. Kumari",
    "37-DANTHA": "Mrs. R. Danthanarayana",
    "40-NIMASHA": "Mrs. R.M.C.N. Samaranayaka",
    "41-NIMASHA": "Mrs. Wandandalan",
    "44-RATHNAYAKE": "Mr. A.P. Rathnayake",
    "48-LAKSHIKA": "Mrs. L.P.C. Lakshika",
    "49-DILSHARA": "Ms. D.T. Jayathilaka",
    "51-BUDDHINI": "Mrs. S.D.V. Buddhini",
    "52-NADEERA": "Mrs. H.H. Nadeera Karunarathna",
    "53-VIMARSHANI": "Mrs. M.V.N. Karunarathne",
    "54-CHAMANTHI": "Mrs. W.M.S.N. Dissanayake",
    "55-SAMANTHI": "Mrs. H.D.S.N. Samanthi",
    "58-GAYATHRI": "Mrs. Gayathri Jayawickrama",
    "59-KIRIWENDALA": "Mrs. Kiriwendala",
    "59 KIRIWENDALA": "Mrs. Kiriwendala",
    "62-GANGA": "Mrs. N.D.G.J. Nanayakkara",
    "63-KITHSIRI": "Mr. Kithsiri",
    "ROSMARI": "Mrs. Rosmari Panangala",
    "MDS": "Mrs. D.B.N. Siriwardhana",
    "LAKSHITHA": "Mr. K.L.S. Jayakody",
    "35-IRESHA": "Miss M.P. Iresha Munasinghe",
    "NALINDA": "Mr. Nalinda",
    "SARARATHNA": "Mrs. K.P.A.K. Sararathna",
    "68-CHINTHA": "Mrs. B.M. Chintha Kumari",
    "68- CHINTHA": "Mrs. B.M. Chintha Kumari",
}

SUBJECT_NORM_MAP = {
    "BUDDHISUM": "Buddhism",
    "LAIBRARY": "Library",
    "PHYSICAL EDU": "Physical Education",
    "ACOUNTING": "Accounting",
    "BUSSINESS STUDIES": "Business Studies",
    "BUSSINESS": "Business Studies",
    "ECCONOMICS": "Economics",
    "INFORMATION TECH": "Information Technology",
    "SINHALA LIT": "Sinhala Literature",
    "BUDDHIST CIVILIZATION": "Buddhist Civilization",
    "MEDIA EDUCATION": "Media Education",
    "CAREER GUIDANCE": "Career Guidance",
    "GRAPHIC DESIGN": "Graphic Design",
    "GENERAL IT": "General IT (GIT)",
    "HOME SCIENCE": "Home Science",
}

def clean_subject(raw):
    raw = raw.strip()
    return SUBJECT_NORM_MAP.get(raw.upper(), raw.title() if len(raw) > 3 else raw)

def get_teacher_full_name(raw):
    raw = raw.strip()
    for code, full in TEACHER_CODE_MAP.items():
        if code.lower() in raw.lower():
            return full
    return raw

def parse_pdf():
    print(f"Reading PDF from {PDF_PATH}...")
    cmd = ["pdftohtml", "-xml", "-stdout", PDF_PATH]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError("Failed to run pdftohtml.")

    root = ET.fromstring(res.stdout)
    pages = root.findall("page")
    print(f"Total pages extracted: {len(pages)}")

    classes_data = {}
    teachers_data = {}
    all_db_entries = []

    # 1. Parse Class Pages (Pages 5 to 27)
    for p_idx in range(4, 27):
        if p_idx >= len(pages):
            break
        page = pages[p_idx]
        class_name = ""
        form_teacher = ""
        texts = []

        for t in page.findall("text"):
            txt = (t.text or "").strip()
            if not txt:
                continue
            top = int(t.attrib.get("top", 0))
            left = int(t.attrib.get("left", 0))
            texts.append((top, left, txt))

            if top < 120:
                if "Form teacher" in txt:
                    form_teacher = txt.split(":", 1)[-1].strip()
                elif any(c in txt for c in ["6-", "7-", "8-", "9-", "10", "11", "12", "13"]):
                    class_name = txt.replace(" ", "").replace("YEARSGURANTEED", " G")

        # normalize class name
        class_name = class_name.replace("10-A", "10-A").replace("10-B", "10-B").replace("10-C", "10-C")
        class_name = class_name.replace("11-A", "11-A").replace("11-B", "11-B").replace("11-C", "11-C")
        class_name = class_name.replace("12-A", "12-A").replace("12-C", "12-C")
        class_name = class_name.replace("13-A", "13-A").replace("13-C", "13-C").replace("13YEARS", "13 G")
        if not class_name:
            continue

        class_schedule = {day: [] for day in DAYS}

        for d_idx, day_name in enumerate(DAYS):
            c_min, c_max = COL_BOUNDS[d_idx]
            for p_idx in range(8):
                r_min, r_max = ROW_BOUNDS[p_idx]
                cell_items = [
                    x for x in texts
                    if c_min <= x[1] < c_max and r_min <= x[0] < r_max
                ]
                cell_items.sort(key=lambda x: (x[0], x[1]))
                lines = [x[2] for x in cell_items]

                # Heuristic to separate subject & teacher
                subject = "Free Period"
                teacher = ""
                raw_teacher = ""

                if lines:
                    # check if aesthetic bucket
                    if any(a in lines[0].upper() for a in ["ART", "MUS", "DAN", "DRA", "SIN_L"]):
                        subject = "Aesthetic / Elective Bucket (Art / Music / Dancing / Drama / Sinhala Lit)"
                        teacher = "Elective Subject Faculty"
                    elif any(b in lines[0].upper() for b in ["CIV", "BS", "GEO"]):
                        subject = "Elective Bucket (Civics / Business Studies / Geography)"
                        teacher = "Elective Subject Faculty"
                    elif len(lines) >= 2:
                        subject = clean_subject(lines[0])
                        raw_teacher = " ".join(lines[1:])
                        teacher = get_teacher_full_name(raw_teacher)
                    elif len(lines) == 1:
                        if any(c in lines[0] for c in ["TR", "SIR", "M."]):
                            teacher = get_teacher_full_name(lines[0])
                            subject = "Assigned Period"
                        else:
                            subject = clean_subject(lines[0])
                            teacher = "Class Faculty"

                slot_info = {
                    "period": p_idx + 1,
                    "time": PERIOD_TIMES[p_idx],
                    "subject": subject,
                    "teacher": teacher,
                    "raw_lines": lines,
                }
                class_schedule[day_name].append(slot_info)

                if subject != "Free Period":
                    all_db_entries.append({
                        "id": f"TT-{class_name.replace(' ', '')}-{day_name[:3].upper()}-P{p_idx + 1}",
                        "class_name": class_name,
                        "day_of_week": day_name,
                        "period_no": p_idx + 1,
                        "subject": subject,
                        "teacher_id": raw_teacher or teacher or "FACULTY",
                        "teacher_name": teacher or "Faculty Member",
                    })

        classes_data[class_name] = {
            "class_name": class_name,
            "form_teacher": form_teacher,
            "schedule": class_schedule,
        }

    # 2. Parse Teacher Pages (Pages 28 to 73)
    for p_idx in range(27, 73):
        if p_idx >= len(pages):
            break
        page = pages[p_idx]
        teacher_name = ""
        texts = []

        for t in page.findall("text"):
            txt = (t.text or "").strip()
            if not txt:
                continue
            top = int(t.attrib.get("top", 0))
            left = int(t.attrib.get("left", 0))
            texts.append((top, left, txt))

            if top < 100 and ("Teacher" in txt or "TEACHER" in txt):
                teacher_name = txt.replace("TEACHER:", "").replace("Teacher", "").strip()

        if not teacher_name or teacher_name == "x":
            continue

        teacher_schedule = {day: [] for day in DAYS}
        teaching_load = 0

        for d_idx, day_name in enumerate(DAYS):
            c_min, c_max = COL_BOUNDS[d_idx]
            for p_idx in range(8):
                r_min, r_max = ROW_BOUNDS[p_idx]
                cell_items = [
                    x for x in texts
                    if c_min <= x[1] < c_max and r_min <= x[0] < r_max
                ]
                cell_items.sort(key=lambda x: (x[0], x[1]))
                lines = [x[2] for x in cell_items]

                is_free = len(lines) == 0
                subject = ""
                class_assigned = ""

                if not is_free:
                    teaching_load += 1
                    if len(lines) >= 2:
                        subject = clean_subject(lines[0])
                        class_assigned = lines[1]
                    elif len(lines) == 1:
                        if any(c in lines[0] for c in ["-", "13", "12", "11", "10", "9", "8", "7", "6"]):
                            class_assigned = lines[0]
                            subject = "Assigned Subject"
                        else:
                            subject = clean_subject(lines[0])
                            class_assigned = "Multi-Class"

                teacher_schedule[day_name].append({
                    "period": p_idx + 1,
                    "time": PERIOD_TIMES[p_idx],
                    "is_free": is_free,
                    "subject": subject,
                    "class_name": class_assigned,
                    "raw_lines": lines,
                })

        teachers_data[teacher_name] = {
            "teacher_name": teacher_name,
            "teaching_load": teaching_load,
            "schedule": teacher_schedule,
        }

    output_data = {
        "days": DAYS,
        "period_times": PERIOD_TIMES,
        "classes": classes_data,
        "teachers": teachers_data,
        "total_classes": len(classes_data),
        "total_teachers": len(teachers_data),
        "total_slots": len(all_db_entries),
    }

    out_file = os.path.join(BASE_DIR, "static", "data", "timetable_2026.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"Successfully generated {out_file} with {len(classes_data)} classes and {len(teachers_data)} teachers!")

    # 3. Seed into Database
    try:
        sys.path.insert(0, BASE_DIR)
        import db
        print("Seeding timetable into database...")
        db.init_db()

        # Insert or replace all slots
        import sqlite3
        conn = sqlite3.connect(db.SQLITE_PATH)
        cur = conn.cursor()
        cur.execute("DELETE FROM school_timetable")
        for s in all_db_entries:
            cur.execute("""
                INSERT OR REPLACE INTO school_timetable
                (id, class_name, day_of_week, period_no, subject, teacher_id, teacher_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (s["id"], s["class_name"], s["day_of_week"], s["period_no"], s["subject"], s["teacher_id"], s["teacher_name"]))
        conn.commit()
        conn.close()
        print(f"Seeded {len(all_db_entries)} timetable entries into SQLite successfully!")

        # If MariaDB is available, seed there too
        if db.pymysql:
            cfg = db.get_mariadb_config()
            try:
                m_conn = db.pymysql.connect(**cfg)
                with m_conn.cursor() as m_cur:
                    m_cur.execute("DELETE FROM school_timetable")
                    for s in all_db_entries:
                        m_cur.execute("""
                            INSERT INTO school_timetable
                            (id, class_name, day_of_week, period_no, subject, teacher_id, teacher_name)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            ON DUPLICATE KEY UPDATE
                            subject=VALUES(subject), teacher_id=VALUES(teacher_id), teacher_name=VALUES(teacher_name)
                        """, (s["id"], s["class_name"], s["day_of_week"], s["period_no"], s["subject"], s["teacher_id"], s["teacher_name"]))
                    m_conn.commit()
                m_conn.close()
                print("Seeded entries into MariaDB successfully!")
            except Exception as e:
                print(f"Note: Remote MariaDB seed skipped ({e})")

    except Exception as e:
        print(f"Database seed note: {e}")

if __name__ == "__main__":
    parse_pdf()
