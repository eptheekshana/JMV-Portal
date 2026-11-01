# 🏫 Jayakody Maha Vidyalaya (JMV) Portal
### School Database Management & Records Portal
**බප / කැල / ජයකොඩි ම.වි - ගණේමුල්ල (WP / KE / Jayakody Maha Vidyalaya • Ganemulla)**

A dedicated school database management and institutional records portal created for **WP/KE/Jayakody Maha Vidyalaya**, directly referencing and following the official **JMV-Web** theme, color specifications, and institutional records.

---

## 🎨 Theme & Institutional Details (Referenced from JMV-Web)

- **School Identification**: WP / KE / Jayakody Maha Vidyalaya (බප / කැල / ජයකොඩි මහා විද්‍යාලය)
- **Census Number**: `11084`
- **Location**: Kandaliyaddapaluwa (Welipillawa), Ganemulla, Gampaha District, Western Province
- **Educational Zone & Division**: Kelaniya Educational Zone • Mahara Educational Division
- **Established**: October 14, 1956 (70+ years of legacy)
- **Official Motto**:
  - **“උගත මනා ශිල්පයමයි මතු රැකෙනා”** *(Knowledge Truly Learned Protects the Future)*
- **Vision (දැක්ම)**:
  - *“අභියෝග ජයගත හැකි ගුණ නැණ සපිරි ශිෂ්‍යයෙක් සමාජයට දායාද කිරීම ජයකොඩි මාතාවගේ දැක්මයි.”*
- **Mission (මෙහෙවර)**:
  - *“අධ්‍යාපනයේ මූලික අරමුණ ඉටුකර ගැනීම සඳහා මූලිකත්වය ලබා දෙමින් ජාතික නිපුණතාවලට අනුකූලව ගුණාත්මක අධ්‍යාපන සංවර්ධනය සඳහා කැපවීම ජයකොඩි මාතාවගේ මෙහෙවරයි.”*
- **School Anthem (*Viduhal Geeya*)**:
  - *“ගුණ නැණ වඩවී ජය දද නගවී - ජයකොඩි මහ විදුහල් සෙවනේ...”*
- **Official Color Palette**:
  - **Royal Maroon**: `#5c0d1b`, `#6b0f1a`, `#38050b` (Primary brand colors)
  - **Imperial Gold**: `#d4af37`, `#fde047`, `#facc15` (Accents, highlights, and borders)
  - **Muted Maroon Tint**: `#fdf2f4` (Table headers, ID badge insets)
- **School Houses (Authentic 3 Houses from JMV-Web)**:
  - **Thisara House (තිසර නිවාසය)** — Gold (`#d4af37`)
  - **Mayura House (මයුර නිවාසය)** — Blue (`#2563eb`)
  - **Paravi House (පරවි නිවාසය)** — Maroon (`#800020`)
- **Executive Administration (from JMV-Web)**:
  - **Principal**: Mr. P. Senevirathne Banda (Bachelor of Arts)
  - **Deputy Principal (Academic)**: Mrs. J.A.U.J.P Jayasooriya (Master of Arts)
  - **Deputy Principal (Administration)**: Mrs. W.W.U.K Wijerathne (Master of Education)
  - **Deputy Principal (Co-Curricular)**: Mrs. A.G.M Hemakumari (B.Com Special)

---

## ✨ Features

1. **🔍 Instant Universal ID Lookup**:
   - Search by **Student ID** (e.g. `JMV-STU-1001`), **Staff ID** (e.g. `JMV-STF-001`), **Admission Number** (e.g. `2020/0412`), **EPF Number** (e.g. `EPF-38410`), or Name.
   - **Typeahead live suggestions**: Displays matching profiles with real photos, ID tags, and grade/role.
   - **Quick test pills**: 1-click test buttons on the homepage for sample student and faculty profiles.

2. **📋 Comprehensive Profile Dossier Presentation**:
   - Full academic profile, personal records, guardian contact, residential address, co-curricular societies, and qualifications.
   - Single-click **Print Profile** (`🖨️ Print Profile`) formatting the official record for institutional filing.

3. **🌐 Bilingual Support (English `EN` / Sinhala `සිං`)**:
   - Instant language switcher in the top utility bar matching the JMV-Web design.

4. **🎓 Students & Staff Databases**:
   - Full directories with sorting, filtering by Grade (1–13), House (Thisara, Mayura, Paravi), and Departments.
   - Modals to enroll new students, add faculty members, edit existing records, and delete with safeguards.

5. **🏛️ Institutional Profile & Heritage**:
   - Displays school history (Venerable Welivitiye Soratha Nayaka Thero, Siridattha Jayakody, Kamalawarna Jayakody, Navodya Project).
   - House distribution bars, Vision & Mission split cards, and the complete School Anthem.

---

## 🚀 Getting Started

### 1. Launch the Server
```bash
./start.sh
```
or run directly with Python 3:
```bash
python3 server.py
```

### 2. Access the Portal
Open your web browser and navigate to:
```
http://localhost:8000
```

### Deploy to Vercel

This repository includes a Vercel serverless adapter in `api/index.py`.

1. Push the repository to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add these project environment variables in Vercel:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
4. Deploy with the default Vercel settings.

Vercel functions are temporary, so the local SQLite database is not suitable for
production persistence. Configure a reachable MariaDB/MySQL database and allow
connections from Vercel before deploying. Do not commit `.env` or database
credentials to the repository.

On the first successful MariaDB startup, the application performs a
non-destructive compatibility migration for the existing schema. It adds the
portal fields missing from the existing `students` table, copies
`admission_no` into the compatibility `id` field, and adds timetable metadata
and uniqueness indexes. Existing records are preserved; take a database backup
before the first production deployment.

---

## 🧪 Sample IDs for Quick Testing

| ID | Name | Role / Grade | House / Department |
|---|---|---|---|
| `JMV-STF-001` | Mr. P. Senevirathne Banda | Principal (BA) | Executive & Head of Institution |
| `JMV-STF-002` | Mrs. J.A.U.J.P Jayasooriya | Deputy Principal (MA) | Academic Administration |
| `JMV-STF-003` | Mrs. W.W.U.K Wijerathne | Deputy Principal (M.Ed) | Sectional Administration |
| `JMV-STF-007` | Mr. P.N. Gunawardena | Head of ICT & Labs | Information Technology |
| `JMV-STU-1001` | K.N. Jayawardena | Grade 13-Com (Head Prefect) | Thisara House |
| `JMV-STU-1002` | N.H. Wickramasinghe | Grade 13-Art (Band Leader) | Mayura House |
| `JMV-STU-1003` | T.D. Senanayake | Grade 12-Com (Scrabble Captain) | Paravi House |
| `JMV-STU-1005` | D.S. Bandara | Grade 11-A (O/L Candidate) | Mayura House |
| `JMV-STU-1010` | T.R. Jayasuriya | Grade 4-A (Primary Section) | Thisara House |

---

## 📁 File Structure

```
JMV-Portal/
├── server.py              # Asynchronous HTTP server and REST API
├── db.py                  # SQLite schema, queries, and JMV-Web pre-seeded dataset
├── start.sh               # Quick launch script
├── README.md              # Documentation and system guide
└── static/
    ├── index.html         # Portal single-page interface & dialogs
    ├── css/
    │   └── style.css      # JMV-Web Royal Maroon & Imperial Gold theme
    ├── js/
    │   └── app.js         # Bilingual search, profile dossier rendering, and CRUD logic
    └── img/
        ├── JMV_Logo.png   # Official school crest
        ├── jmv_icon.png   # School icon
        └── JMV_img1-5     # Official campus & administration imagery
```
