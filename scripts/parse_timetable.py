#!/usr/bin/env python3
"""
Extract WP/KE/Jayakody Maha Vidyalaya 2026 Timetable from PDF and link to Staff Profiles.
Outputs:
  - static/data/timetable_2026.json (Classes, Teachers, and Staff ID -> Timetable/Profile mapping)
  - Seeds school_timetable and enriches staff records in SQLite (and MariaDB when connected)
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

# Teacher Page coordinates (Pages 28 to 73)
TEACHER_COL_BOUNDS = [(130, 330), (330, 535), (535, 740), (740, 945), (945, 1180)]
TEACHER_SINGLE_TOPS = [161, 250, 340, 429, 518, 607, 697, 786]

# Class Page coordinates (Pages 5 to 27)
CLASS_COL_BOUNDS = [(140, 345), (345, 550), (550, 755), (755, 960), (960, 1165)]
CLASS_ROW_BOUNDS = [(130 + i * 92, 130 + (i + 1) * 92) for i in range(8)]

# Complete Official Staff Directory (JMV-STF-001 to JMV-STF-063)
OFFICIAL_STAFF_LIST = [
    ("JMV-STF-001", "P. Senevirathna Banda", "Acting Principal", "Male"),
    ("JMV-STF-002", "J.A.U.J.P. Jayasooriya", "Deputy Principal", "Female"),
    ("JMV-STF-003", "W.W.U.K. Wijerathna", "Deputy Principal", "Female"),
    ("JMV-STF-004", "A.G.M. Hemakumari", "Deputy Principal", "Female"),
    ("JMV-STF-005", "W.M. Upul Hemantha", "Graduate Teacher", "Male"),
    ("JMV-STF-006", "W. Anura", "Graduate Teacher", "Male"),
    ("JMV-STF-007", "W.K.B.A.N. Dias", "Trained Teacher", "Female"),
    ("JMV-STF-008", "J.A.L. Sanjeewani", "Graduate Teacher", "Female"),
    ("JMV-STF-009", "D.B.A.S. Senevirathna", "Graduate Teacher", "Female"),
    ("JMV-STF-010", "K.D.A.N. Sudarshani", "Graduate Teacher", "Female"),
    ("JMV-STF-011", "R.A.C.P. Roopasinghe", "Graduate Teacher", "Female"),
    ("JMV-STF-012", "T.D. Chandrasekara", "Graduate Teacher", "Female"),
    ("JMV-STF-013", "A.R.S.T. Athawuda", "Graduate Teacher", "Female"),
    ("JMV-STF-014", "Y. Thilangani", "Graduate Teacher", "Female"),
    ("JMV-STF-015", "S.A.S.D. Sooriyaarachchi", "Trained Teacher", "Female"),
    ("JMV-STF-016", "K.U. Indira Ranaweera", "Trained Teacher", "Female"),
    ("JMV-STF-017", "W.J.R. Kumari", "Graduate Teacher", "Female"),
    ("JMV-STF-018", "M.G. Dasanayaka", "Graduate Teacher", "Female"),
    ("JMV-STF-019", "W.A.C.S. Wijelath", "Graduate Teacher", "Female"),
    ("JMV-STF-020", "W.A. Madusanka", "Graduate Teacher", "Male"),
    ("JMV-STF-021", "K.A.W.N. Kuruppu", "Graduate Teacher", "Female"),
    ("JMV-STF-022", "W.A.L.S.P. Weerasinghe", "Graduate Teacher", "Male"),
    ("JMV-STF-023", "P.A.S.K. Dayananda", "Trained Teacher", "Female"),
    ("JMV-STF-024", "W.K.S. Prasarini", "Graduate Teacher", "Female"),
    ("JMV-STF-025", "J.P. Uthpala Jayawardhana", "Trained Teacher", "Female"),
    ("JMV-STF-026", "K.L.N. Kumari", "Graduate Teacher", "Female"),
    ("JMV-STF-027", "R.N. Danthanarayana", "Trained Teacher", "Female"),
    ("JMV-STF-028", "P.K. Dissanayake", "Graduate Teacher", "Female"),
    ("JMV-STF-029", "W.R.A.N.D. Ranasinghe", "Graduate Teacher", "Male"),
    ("JMV-STF-030", "R.M.C.N. Samaranayake", "Graduate Teacher", "Female"),
    ("JMV-STF-031", "N.I. Vandendriesen", "Graduate Teacher", "Female"),
    ("JMV-STF-032", "E.A.C.D. Batuwatta", "Trained Teacher", "Female"),
    ("JMV-STF-033", "E.W.A.A.L. Rathnayake", "Graduate Teacher", "Female"),
    ("JMV-STF-034", "A.P. Rathnayake", "Trained Teacher", "Male"),
    ("JMV-STF-035", "S.A.I. Sooriyaarachchi", "Graduate Teacher", "Female"),
    ("JMV-STF-036", "M.P. Iresha Gunasinghe", "Graduate Teacher", "Female"),
    ("JMV-STF-037", "L.P.C. Lakshika", "Graduate Teacher", "Female"),
    ("JMV-STF-038", "J.M.D.T. Jayathilaka", "Graduate Teacher", "Female"),
    ("JMV-STF-039", "G.G.S.N. Kalansooriya", "Graduate Teacher", "Female"),
    ("JMV-STF-040", "S.D.V. Buddhini", "Graduate Teacher", "Female"),
    ("JMV-STF-041", "M.V.N. Karunarathna", "Graduate Teacher", "Female"),
    ("JMV-STF-042", "H.H.N. Karunarathna", "Graduate Teacher", "Female"),
    ("JMV-STF-043", "N.D.S.N. Samanthi", "Graduate Teacher", "Female"),
    ("JMV-STF-044", "R.R.W.M.C.P. Uduwawala", "Trained Teacher", "Female"),
    ("JMV-STF-045", "S. Liyanapathiranage", "Graduate Teacher", "Female"),
    ("JMV-STF-046", "W.N. Kanchana", "Graduate Teacher", "Female"),
    ("JMV-STF-047", "E.A.D.K. Shethri Jayawickrama", "Graduate Teacher", "Female"),
    ("JMV-STF-048", "M.D. Kiriwandala", "Graduate Teacher", "Female"),
    ("JMV-STF-049", "M.G.M. Mahagama", "Graduate Teacher", "Female"),
    ("JMV-STF-050", "J.A.S.C. Ranasinghe", "Assistant Principal", "Female"),
    ("JMV-STF-051", "D.M.S.A.H. Dissanayake", "Graduate Teacher", "Female"),
    ("JMV-STF-052", "B.A.M. Kithsiri", "Graduate Teacher", "Male"),
    ("JMV-STF-053", "K.P.A.K. Sararathna", "Graduate Teacher", "Female"),
    ("JMV-STF-054", "W.K.U.K. Chandrasena", "Trained Teacher", "Female"),
    ("JMV-STF-055", "N.K. Edirisinghe", "Trained Teacher", "Female"),
    ("JMV-STF-056", "H.G.N. Kumari", "Graduate Teacher", "Female"),
    ("JMV-STF-057", "B.B.S. Siriwardhana", "Graduate Teacher", "Female"),
    ("JMV-STF-058", "B.M. Chintha Kumari", "Trained Teacher", "Female"),
    ("JMV-STF-059", "P.G.P.B.R. Pathangala", "Graduate Teacher", "Female"),
    ("JMV-STF-060", "Thilakarathne", "Security", "Male"),
    ("JMV-STF-061", "N.A. Sumathipala", "Graduate Teacher", "Male"),
    ("JMV-STF-062", "N.D.G.J. Nanayakkara", "Graduate Teacher", "Female"),
    ("JMV-STF-063", "K.L.S. Jayakody", "Graduate Teacher", "Male"),
]

STAFF_BY_ID = {sid: {"id": sid, "name": name, "role": role, "gender": gender} for sid, name, role, gender in OFFICIAL_STAFF_LIST}

# Direct mapping from Timetable PDF Teacher Page Header -> Official Staff ID
TIMETABLE_TEACHER_TO_STAFF_ID = {
    "MRS. UDENI WIJERATHNA": "JMV-STF-003",
    "MRS. MANOJA HEMAKUMARI": "JMV-STF-004",
    "MRS SHIROMI RANASINGHE": "JMV-STF-050",
    "MR. WM UPUL HEMANTHA": "JMV-STF-005",
    "MRS. UK CHANDRASENA": "JMV-STF-054",
    "MR. W ANURA": "JMV-STF-006",
    "MR. NA SUMATHIPALA": "JMV-STF-061",
    "MRS. JAL SANJEEWANI": "JMV-STF-008",
    "MRS. NK EDIRISINGHE": "JMV-STF-055",
    "MRS.ASHA SENEWIRATHNA": "JMV-STF-009",
    "MRS. KDAN SUDARSHANI": "JMV-STF-010",
    "MRS. CHAMIKA ROOPASINGHE": "JMV-STF-011",
    "MRS. TD CHANDRASEKARA": "JMV-STF-012",
    "MRS. SASD SOORIARACHCHI": "JMV-STF-015",
    "MRS. KU INDIRA RANAWEERA": "JMV-STF-016",
    "MRS. MG DASANAYEKA": "JMV-STF-018",
    "MR. WA MADUSHANKA": "JMV-STF-020",
    "MRS. KAWN KURUPPU": "JMV-STF-021",
    "WALSP WEERASINGHE": "JMV-STF-022",
    "MRS SHANIKA DAYANANDA": "JMV-STF-023",
    "MRS. WKS PRASARINI": "JMV-STF-024",
    "MRS. JP UTHPALA JAYEWARDENA": "JMV-STF-025",
    "MRS. KLN KUMARI": "JMV-STF-026",
    "MRS. R  DANTHANARAYANA": "JMV-STF-027",
    "MRS. R DANTHANARAYANA": "JMV-STF-027",
    "MRS. RMCN SAMARANAYAKA": "JMV-STF-030",
    "MRS. WANDANDALAN": "JMV-STF-031",
    "MR. AP RATHNAYAKE": "JMV-STF-034",
    "MRS LPC LAKSHIKA": "JMV-STF-037",
    "MS. DT JAYATHILAKA": "JMV-STF-038",
    "MRS. SDV BUDDHINI": "JMV-STF-040",
    "MRS. HH NADEERA KARUNARATHNA": "JMV-STF-042",
    "MRS. MVN KARUNARATHNE": "JMV-STF-041",
    "MRS EP UDUWAWALA": "JMV-STF-044",
    "MRS. HDSN SAMANTHI": "JMV-STF-043",
    "MRS GAYATHRI JAYAWICKRAMA": "JMV-STF-047",
    "MRS. KIRIWENDALA": "JMV-STF-048",
    "MRS. NDGJ NANAYAKKARA": "JMV-STF-062",
    "MR. KITHSIRI": "JMV-STF-052",
    "MRS. ROSMARI PANANGALA": "JMV-STF-059",
    "MRS. DBN SIRIWARDHANA": "JMV-STF-057",
    "MR. KLS JAYAKODY": "JMV-STF-063",
    "MISS. MP IRESHA MUNASINGHE": "JMV-STF-036",
    "MR. NALINDA": "JMV-STF-029",
    "MRS. KPAK SARARATHNA": "JMV-STF-053",
    "MRS. BM CHINTHA KUMARI": "JMV-STF-058",
}

# Mapping from Class Page Short Code -> Official Staff ID
TEACHER_SHORT_CODE_TO_STAFF_ID = {
    "3-UDENI": "JMV-STF-003",
    "4-MANOJA": "JMV-STF-004",
    "5-SHIROMI": "JMV-STF-050",
    "6-UPUL": "JMV-STF-005",
    "67-KRISHNAMALI": "JMV-STF-054",
    "67- KRISHNAMALI": "JMV-STF-054",
    "12-ANURA": "JMV-STF-006",
    "16-SUMATHIPALA": "JMV-STF-061",
    "17-SANJEEWANI": "JMV-STF-008",
    "EDIRISINHA": "JMV-STF-055",
    "19-ASHA": "JMV-STF-009",
    "20-SUDARSHANI": "JMV-STF-010",
    "21-CHAMIKA": "JMV-STF-011",
    "22-THAMALI": "JMV-STF-012",
    "25-SHIRMILA": "JMV-STF-015",
    "26-UPAMALI": "JMV-STF-016",
    "28-MAJI": "JMV-STF-018",
    "30-MADUSHANKA": "JMV-STF-020",
    "31-WASANA": "JMV-STF-021",
    "32-SHASHI": "JMV-STF-022",
    "33-SHANIKA": "JMV-STF-023",
    "34-PRASARINI": "JMV-STF-024",
    "35-UTHPALA": "JMV-STF-025",
    "36-NELUM": "JMV-STF-026",
    "37-DANTHA": "JMV-STF-027",
    "40-NIMASHA": "JMV-STF-030",
    "41-NIMASHA": "JMV-STF-031",
    "44-RATHNAYAKE": "JMV-STF-034",
    "48-LAKSHIKA": "JMV-STF-037",
    "49-DILSHARA": "JMV-STF-038",
    "51-BUDDHINI": "JMV-STF-040",
    "52-NADEERA": "JMV-STF-042",
    "53-VIMARSHANI": "JMV-STF-041",
    "54-CHAMANTHI": "JMV-STF-044",
    "55-SAMANTHI": "JMV-STF-043",
    "58-GAYATHRI": "JMV-STF-047",
    "59-KIRIWENDALA": "JMV-STF-048",
    "59 KIRIWENDALA": "JMV-STF-048",
    "62-GANGA": "JMV-STF-062",
    "63-KITHSIRI": "JMV-STF-052",
    "ROSMARI": "JMV-STF-059",
    "MDS": "JMV-STF-057",
    "LAKSHITHA": "JMV-STF-063",
    "35-IRESHA": "JMV-STF-036",
    "NALINDA": "JMV-STF-029",
    "SARARATHNA": "JMV-STF-053",
    "68-CHINTHA": "JMV-STF-058",
    "68- CHINTHA": "JMV-STF-058",
}

SUBJECT_NORM_MAP = {
    "BUDDHISUM": "Buddhism",
    "BUDDHISM": "Buddhism",
    "BUDDHIST": "Buddhist Civilization",
    "BUDDHIST CIVILIZATION": "Buddhist Civilization",
    "LAIBRARY": "Library",
    "LIB": "Library",
    "LIBRARY": "Library",
    "PHYSICAL EDU": "Physical Education",
    "PT": "Physical Education",
    "ACOUNTING": "Accounting",
    "ACCOUNTING": "Accounting",
    "BUSSINESS STUDIES": "Business Studies",
    "BUSINESS STUDIES": "Business Studies",
    "BUSSINESS": "Business Studies",
    "BS": "Business Studies",
    "ECCONOMICS": "Economics",
    "ECONOMICS": "Economics",
    "INFORMATION TECH": "Information Technology",
    "ICT": "Information Technology",
    "SINHALA LIT": "Sinhala Literature",
    "SIN_L": "Sinhala Literature",
    "SINHALA": "Sinhala",
    "MEDIA EDUCATION": "Media Education",
    "MEDIA": "Media Education",
    "MEDI": "Media Education",
    "CAREER GUIDANCE": "Career Guidance",
    "GRAPHIC DESIGN": "Graphic Design",
    "GENERAL IT": "General IT (GIT)",
    "HOME SCIENCE": "Home Science",
    "HS": "Home Science",
    "AGRI": "Agriculture",
    "AGRICULTURE": "Agriculture",
    "MUS": "Music",
    "MUSIC": "Music",
    "DAN": "Dancing",
    "DANCING": "Dancing",
    "DRA": "Drama",
    "DRAMA": "Drama",
    "ART": "Arts",
    "ARTS": "Arts",
    "CIV": "Civics",
    "CIVICS": "Civics",
    "GEO": "Geography",
    "GEOGRAPHY": "Geography",
    "PTS": "Practical & Technical Skills (PTS)",
    "MATHEMATICS": "Mathematics",
    "SCIENCE": "Science",
    "ENGLISH": "English",
    "HISTORY": "History",
    "TAMIL": "Tamil",
    "TOURISM": "Tourism & Hospitality",
}


def clean_subject(raw):
    raw = " ".join(raw.strip().split())
    up = raw.upper()
    if up in SUBJECT_NORM_MAP:
        return SUBJECT_NORM_MAP[up]
    return raw.title() if len(raw) > 3 else raw


def normalize_class_name(raw):
    c = raw.strip().upper().replace(" ", "")
    c = c.replace("YEARSGURANTEED", " G").replace("13YEARS", "13 G")
    if c in ("13G", "13-G"):
        return "13 G"
    return c


def infer_department(subjects, role):
    if "Principal" in role:
        return "Executive & Academic Administration"
    if "Security" in role:
        return "Non-Academic & Security Services"
    s_join = " ".join(subjects).lower()
    if any(k in s_join for k in ["accounting", "business", "economics", "tourism"]):
        return "Commerce & Management Studies"
    if any(k in s_join for k in ["information technology", "general it"]):
        return "Information & Communication Technology"
    if any(k in s_join for k in ["mathematics", "science", "agriculture", "home science"]):
        return "Mathematics & Sciences"
    if any(k in s_join for k in ["music", "dancing", "drama", "arts", "graphic"]):
        return "Aesthetics & Fine Arts"
    if any(k in s_join for k in ["physical education"]):
        return "Sports & Physical Education"
    if any(k in s_join for k in ["sinhala", "english", "tamil", "library"]):
        return "Languages & Literature"
    if any(k in s_join for k in ["history", "geography", "civics", "buddhism", "buddhist", "media", "career"]):
        return "Humanities & Social Sciences"
    return "General Academic Faculty"


def resolve_staff_from_short_code(raw_teacher):
    raw_up = raw_teacher.strip().upper()
    for code, sid in TEACHER_SHORT_CODE_TO_STAFF_ID.items():
        if code in raw_up:
            stf = STAFF_BY_ID[sid]
            return sid, stf["name"]
    return None, raw_teacher.strip()


def parse_pdf():
    print(f"Reading PDF from {PDF_PATH}...")
    cmd = ["pdftohtml", "-xml", "-stdout", PDF_PATH]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError("Failed to run pdftohtml.")

    root = ET.fromstring(res.stdout)
    pages = root.findall("page")
    print(f"Total pages extracted: {len(pages)}")

    # -------------------------------------------------------------------------
    # STEP 1: Parse Teacher Pages (Pages 28 to 73) with exact Single/Double period geometry
    # -------------------------------------------------------------------------
    teachers_data = {}
    staff_timetables = {}
    # Map (class_name, day_name, period_no) -> list of {staff_id, teacher_name, subject}
    class_slot_from_teachers = {}

    for p_idx in range(27, 73):
        if p_idx >= len(pages):
            break
        page = pages[p_idx]
        raw_teacher_header = ""
        texts = []

        for t in page.findall("text"):
            txt = " ".join("".join(t.itertext()).split())
            if not txt:
                continue
            top = int(t.attrib.get("top", 0))
            left = int(t.attrib.get("left", 0))
            texts.append((top, left, txt))

            if top < 100 and ("Teacher" in txt or "TEACHER" in txt):
                raw_teacher_header = txt.replace("TEACHER:", "").replace("Teacher", "").strip()

        if not raw_teacher_header or raw_teacher_header == "x":
            continue

        norm_header = " ".join(raw_teacher_header.upper().split())
        staff_id = (
            TIMETABLE_TEACHER_TO_STAFF_ID.get(raw_teacher_header.upper())
            or TIMETABLE_TEACHER_TO_STAFF_ID.get(norm_header)
        )
        staff_info = STAFF_BY_ID.get(staff_id, {"id": staff_id or norm_header, "name": raw_teacher_header, "role": "Graduate Teacher"})
        official_name = staff_info["name"]

        # Initialize 5x8 empty schedule
        teacher_schedule = {
            day: [
                {
                    "period": p + 1,
                    "time": PERIOD_TIMES[p],
                    "is_free": True,
                    "subject": "",
                    "class_name": "",
                    "is_double": False,
                }
                for p in range(8)
            ]
            for day in DAYS
        }

        teaching_load = 0
        subjects_set = set()
        classes_set = set()

        for d_idx, day_name in enumerate(DAYS):
            c_min, c_max = TEACHER_COL_BOUNDS[d_idx]
            col_items = [x for x in texts if c_min <= x[1] < c_max and 140 <= x[0] <= 855]
            col_items.sort(key=lambda x: x[0])

            # Merge 2-line wrapped subject names
            merged = []
            for item in col_items:
                if (
                    item[2] in ("CIVILIZATION", "EDUCATION", "STUDIES")
                    and merged
                    and merged[-1][2] in ("BUDDHIST", "MEDIA", "BUSSINESS", "BUSINESS")
                ):
                    merged[-1] = (merged[-1][0], merged[-1][1], merged[-1][2] + " " + item[2])
                else:
                    merged.append(item)

            for i in range(0, len(merged) - 1, 2):
                s_top, _, s_txt = merged[i]
                c_top, _, c_txt = merged[i + 1]
                p = min(range(8), key=lambda idx: abs(s_top - TEACHER_SINGLE_TOPS[idx]))
                is_double = (s_top - TEACHER_SINGLE_TOPS[p]) >= 4
                periods = [p + 1, p + 2] if is_double else [p + 1]

                subject_clean = clean_subject(s_txt)
                norm_classes = [normalize_class_name(c) for c in c_txt.split("/") if c.strip()]
                class_display = " / ".join(norm_classes)

                subjects_set.add(subject_clean)
                for nc in norm_classes:
                    classes_set.add(nc)

                for per in periods:
                    if 1 <= per <= 8:
                        slot_obj = teacher_schedule[day_name][per - 1]
                        slot_obj["is_free"] = False
                        slot_obj["subject"] = subject_clean
                        slot_obj["class_name"] = class_display
                        slot_obj["is_double"] = is_double
                        teaching_load += 1

                        for nc in norm_classes:
                            class_slot_from_teachers.setdefault((nc, day_name, per), []).append({
                                "staff_id": staff_id,
                                "teacher_name": official_name,
                                "timetable_name": raw_teacher_header,
                                "subject": subject_clean,
                            })

        sorted_subjects = sorted(subjects_set)
        sorted_classes = sorted(
            classes_set,
            key=lambda x: (int(re.match(r"^\d+", x).group(0)) if re.match(r"^\d+", x) else 99, x)
        )

        teacher_record = {
            "staff_id": staff_id,
            "official_name": official_name,
            "teacher_name": f"{official_name} ({staff_id})" if staff_id else official_name,
            "timetable_name": raw_teacher_header,
            "role": staff_info.get("role", "Graduate Teacher"),
            "department": infer_department(sorted_subjects, staff_info.get("role", "")),
            "teaching_load": teaching_load,
            "subjects_taught": sorted_subjects,
            "assigned_classes": sorted_classes,
            "form_class": "",
            "schedule": teacher_schedule,
        }

        teachers_data[official_name] = teacher_record
        if staff_id:
            staff_timetables[staff_id] = teacher_record

    # -------------------------------------------------------------------------
    # STEP 2: Parse Class Pages (Pages 5 to 27) & Enrich with Teacher Cross-Reference
    # -------------------------------------------------------------------------
    classes_data = {}
    all_db_entries = []

    for p_idx in range(4, 27):
        if p_idx >= len(pages):
            break
        page = pages[p_idx]
        class_name = ""
        raw_form_teacher = ""
        texts = []

        for t in page.findall("text"):
            txt = " ".join("".join(t.itertext()).split())
            if not txt:
                continue
            top = int(t.attrib.get("top", 0))
            left = int(t.attrib.get("left", 0))
            texts.append((top, left, txt))

            if top < 120:
                if "Form teacher" in txt:
                    raw_form_teacher = txt.split(":", 1)[-1].strip()
                elif any(c in txt for c in ["6-", "7-", "8-", "9-", "10", "11", "12", "13"]):
                    class_name = normalize_class_name(txt)

        if not class_name:
            continue

        ft_norm = " ".join(raw_form_teacher.upper().split())
        ft_staff_id = (
            TIMETABLE_TEACHER_TO_STAFF_ID.get(raw_form_teacher.upper())
            or TIMETABLE_TEACHER_TO_STAFF_ID.get(ft_norm)
        )
        ft_official_name = STAFF_BY_ID[ft_staff_id]["name"] if ft_staff_id in STAFF_BY_ID else raw_form_teacher

        if ft_staff_id and ft_staff_id in staff_timetables:
            staff_timetables[ft_staff_id]["form_class"] = class_name

        class_schedule = {day: [] for day in DAYS}

        for d_idx, day_name in enumerate(DAYS):
            c_min, c_max = CLASS_COL_BOUNDS[d_idx]
            for p_idx in range(8):
                period_no = p_idx + 1
                r_min, r_max = CLASS_ROW_BOUNDS[p_idx]
                cell_items = [
                    x for x in texts
                    if c_min <= x[1] < c_max and r_min <= x[0] < r_max
                ]
                cell_items.sort(key=lambda x: (x[0], x[1]))
                lines = [x[2] for x in cell_items]

                matched_teachers = class_slot_from_teachers.get((class_name, day_name, period_no), [])

                subject = "Free Period"
                teacher_display = ""
                teacher_id_val = ""
                assignments = []

                if len(matched_teachers) == 1:
                    mt = matched_teachers[0]
                    subject = mt["subject"]
                    teacher_display = mt["teacher_name"]
                    teacher_id_val = mt["staff_id"] or mt["teacher_name"]
                    assignments = [mt]
                elif len(matched_teachers) > 1:
                    # Elective / Aesthetic group where multiple teachers teach simultaneously
                    uniq_subjects = []
                    uniq_teachers = []
                    for mt in matched_teachers:
                        if mt["subject"] not in uniq_subjects:
                            uniq_subjects.append(mt["subject"])
                        t_label = f"{mt['teacher_name']} ({mt['subject']})"
                        if t_label not in uniq_teachers:
                            uniq_teachers.append(t_label)
                    subject = " / ".join(uniq_subjects)
                    teacher_display = " • ".join(uniq_teachers)
                    teacher_id_val = matched_teachers[0]["staff_id"] or "ELECTIVE-GROUP"
                    assignments = matched_teachers
                elif lines:
                    # Fallback to class page text if not in individual teacher pages (e.g. 'x' unassigned teacher)
                    if len(lines) >= 2:
                        subject = clean_subject(lines[0])
                        sid, tname = resolve_staff_from_short_code(" ".join(lines[1:]))
                        teacher_display = tname if tname != "x" else "Unassigned Faculty"
                        teacher_id_val = sid or teacher_display
                    elif len(lines) == 1:
                        sid, tname = resolve_staff_from_short_code(lines[0])
                        if sid:
                            teacher_display = tname
                            teacher_id_val = sid
                            subject = "Assigned Period"
                        else:
                            subject = clean_subject(lines[0])
                            teacher_display = "Class Faculty"
                            teacher_id_val = "FACULTY"

                slot_info = {
                    "period": period_no,
                    "time": PERIOD_TIMES[p_idx],
                    "subject": subject,
                    "teacher": teacher_display,
                    "teacher_id": teacher_id_val,
                    "assignments": assignments,
                }
                class_schedule[day_name].append(slot_info)

                if subject != "Free Period":
                    all_db_entries.append({
                        "id": f"TT-{class_name.replace(' ', '')}-{day_name[:3].upper()}-P{period_no}",
                        "class_name": class_name,
                        "day_of_week": day_name,
                        "period_no": period_no,
                        "subject": subject[:100],
                        "teacher_id": (teacher_id_val or "FACULTY")[:32],
                        "teacher_name": (teacher_display or "Faculty Member")[:150],
                    })

        classes_data[class_name] = {
            "class_name": class_name,
            "form_teacher": ft_official_name,
            "form_teacher_id": ft_staff_id or "",
            "raw_form_teacher": raw_form_teacher,
            "schedule": class_schedule,
        }

    output_data = {
        "days": DAYS,
        "period_times": PERIOD_TIMES,
        "classes": classes_data,
        "teachers": teachers_data,
        "staff_timetables": staff_timetables,
        "all_staff_directory": [
            {"id": sid, "name": name, "role": role, "gender": gender}
            for sid, name, role, gender in OFFICIAL_STAFF_LIST
        ],
        "total_classes": len(classes_data),
        "total_teachers": len(teachers_data),
        "total_slots": len(all_db_entries),
    }

    out_file = os.path.join(BASE_DIR, "static", "data", "timetable_2026.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, separators=(',', ':'))

    print(
        f"Generated {out_file}: {len(classes_data)} classes, "
        f"{len(teachers_data)} teachers mapped to Staff IDs, {len(all_db_entries)} class slots."
    )

    # -------------------------------------------------------------------------
    # STEP 3: Seed SQLite database (school_timetable + enrich staff table)
    # -------------------------------------------------------------------------
    sys.path.insert(0, BASE_DIR)
    import db
    import sqlite3

    db.init_db()
    conn = sqlite3.connect(db.SQLITE_PATH)
    cur = conn.cursor()

    # Ensure all 63 staff members exist in SQLite and are enriched with timetable subjects/classes
    for sid, name, role, gender in OFFICIAL_STAFF_LIST:
        tt_prof = staff_timetables.get(sid)
        subjects_str = ", ".join(tt_prof["subjects_taught"]) if tt_prof and tt_prof["subjects_taught"] else ""
        classes_list = list(tt_prof["assigned_classes"]) if tt_prof and tt_prof["assigned_classes"] else []
        if tt_prof and tt_prof.get("form_class"):
            fc = f"Form Teacher ({tt_prof['form_class']})"
            if fc not in classes_list:
                classes_list.insert(0, fc)
        classes_str = ", ".join(classes_list)
        dept_str = tt_prof["department"] if tt_prof else infer_department([], role)
        load_note = (
            f"2026 Timetable: {tt_prof['teaching_load']} periods/week."
            + (f" Form Teacher of Grade {tt_prof['form_class']}." if tt_prof.get("form_class") else "")
            if tt_prof else ""
        )

        cur.execute("SELECT id, subjects_taught, assigned_classes, department, notes FROM staff WHERE id = ?", (sid,))
        row = cur.fetchone()
        if row:
            new_subj = subjects_str or row[1] or ""
            new_cls = classes_str or row[2] or ""
            new_dept = dept_str if (not row[3] or row[3] == "None") else row[3]
            new_notes = load_note or row[4] or ""
            cur.execute(
                """
                UPDATE staff
                SET full_name = ?, name_with_initials = ?, role = ?, gender = ?,
                    department = ?, subjects_taught = ?, assigned_classes = ?, notes = ?, status = 'Active'
                WHERE id = ?
                """,
                (name, name, role, gender, new_dept, new_subj, new_cls, new_notes, sid),
            )
        else:
            cur.execute(
                """
                INSERT INTO staff
                (id, epf_no, full_name, name_with_initials, gender, dob, role, department,
                 subjects_taught, qualifications, appointed_date, contact_no, email, address,
                 nic, status, assigned_classes, photo_url, notes)
                VALUES (?, NULL, ?, ?, ?, '', ?, ?, ?, '', NULL, '', '', '', '', 'Active', ?, '', ?)
                """,
                (sid, name, name, gender, role, dept_str, subjects_str, classes_str, load_note),
            )

    cur.execute("DELETE FROM school_timetable")
    for s in all_db_entries:
        cur.execute(
            """
            INSERT OR REPLACE INTO school_timetable
            (id, class_name, day_of_week, period_no, subject, teacher_id, teacher_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (s["id"], s["class_name"], s["day_of_week"], s["period_no"], s["subject"], s["teacher_id"], s["teacher_name"]),
        )
    conn.commit()
    conn.close()
    print(f"Updated SQLite staff records ({len(OFFICIAL_STAFF_LIST)} staff) and {len(all_db_entries)} timetable slots.")


if __name__ == "__main__":
    parse_pdf()
