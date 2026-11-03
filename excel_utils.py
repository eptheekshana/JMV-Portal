"""
Pure-Python Excel (.xlsx) and CSV Template Generator & Parser for JMV Portal.
Uses only Python standard library (zipfile, xml.etree.ElementTree, io, csv, datetime)
so it runs in any environment without external C dependencies.
"""

import io
import csv
import re
import zipfile
from datetime import datetime, date, timedelta
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape as xml_escape


# ---------------------------------------------------------------------------
# Column Definitions & Header Aliases
# ---------------------------------------------------------------------------

STUDENT_TEMPLATE_COLUMNS = [
    ("admission_no", "Admission Number *", 20),
    ("name_with_initials", "Name with Initials *", 24),
    ("full_name", "Full Name (Optional)", 32),
    ("gender", "Gender (Male/Female)", 18),
    ("dob", "Date of Birth (YYYY-MM-DD)", 22),
    ("academic_level", "Education Level *", 34),
    ("grade", "Grade / Class *", 18),
    ("stream", "Stream (A/L Commerce or Art)", 26),
    ("ol_bucket_1", "O/L 1st Bucket Subject", 30),
    ("ol_bucket_2", "O/L 2nd Bucket Subject", 24),
    ("ol_bucket_3", "O/L 3rd Bucket Subject", 36),
    ("subjects", "A/L or General Subjects (Comma Separated)", 42),
    ("medium", "Medium (Sinhala/English)", 22),
    ("house", "House (Auto if blank: Adm % 3)", 26),
    ("enrollment_date", "Enrollment Date (YYYY-MM-DD)", 24),
    ("guardian_name", "Guardian Name", 24),
    ("guardian_contact", "Guardian Contact No", 20),
    ("address", "Permanent Address", 36),
    ("health_issues", "Health Issues / Medical Notes", 32),
    ("extracurricular", "Extracurricular / Clubs / Sports", 32),
    ("status", "Status (Active/Past)", 18),
    ("notes", "Special Notes / Remarks", 32),
    ("photo_url", "Photo URL (Optional)", 28),
]

STAFF_TEMPLATE_COLUMNS = [
    ("id", "Staff ID * (e.g. JMV-STF-020)", 24),
    ("epf_no", "EPF / Service No (Optional)", 24),
    ("name_with_initials", "Name with Initials *", 24),
    ("full_name", "Full Name (Optional)", 32),
    ("gender", "Gender (Male/Female)", 18),
    ("nic", "NIC Number", 20),
    ("role", "Designation / Role *", 28),
    ("department", "Department (Optional)", 28),
    ("appointed_date", "Appointed Date (YYYY-MM-DD)", 24),
    ("status", "Status (Active/On Leave/Retired)", 24),
    ("subjects_taught", "Subjects Taught", 32),
    ("assigned_classes", "Assigned Classes", 24),
    ("qualifications", "Academic & Professional Qualifications", 36),
    ("contact_no", "Contact Mobile No", 20),
    ("email", "Official / Personal Email", 28),
    ("notes", "Service Notes / Commendations", 32),
    ("photo_url", "Photo URL (Optional)", 28),
]

STUDENT_SAMPLE_ROWS = [
    {
        "admission_no": "10500",
        "name_with_initials": "K.A.D. Perera",
        "full_name": "Kasun Akila Dananjaya Perera",
        "gender": "Male",
        "dob": "2010-03-14",
        "academic_level": "Ordinary Level",
        "grade": "11-A",
        "stream": "Senior Secondary (G.C.E. O/L)",
        "ol_bucket_1": "Business Studies & Accounting",
        "ol_bucket_2": "Art",
        "ol_bucket_3": "Information & Communication Technology",
        "subjects": "",
        "medium": "Sinhala",
        "house": "",  # Auto-calculates: 10500 % 3 = 0 -> Mayura
        "enrollment_date": "2021-01-10",
        "guardian_name": "Rohan Perera",
        "guardian_contact": "077 123 4567",
        "address": "No. 15, Station Road, Ganemulla",
        "health_issues": "None",
        "extracurricular": "Cricket Team, ICT Club",
        "status": "Active",
        "notes": "Consistent academic performer",
        "photo_url": "",
    },
    {
        "admission_no": "10501",
        "name_with_initials": "S.M. Senanayake",
        "full_name": "Sanduni Madhushika Senanayake",
        "gender": "Female",
        "dob": "2008-07-22",
        "academic_level": "Advanced Level",
        "grade": "12-Com",
        "stream": "Commerce",
        "ol_bucket_1": "",
        "ol_bucket_2": "",
        "ol_bucket_3": "",
        "subjects": "Accounting, Economics, Business Studies",
        "medium": "Sinhala",
        "house": "",  # Auto-calculates: 10501 % 3 = 1 -> Thisara
        "enrollment_date": "2019-01-08",
        "guardian_name": "Anura Senanayake",
        "guardian_contact": "071 987 6543",
        "address": "44/2, Kadawatha Road, Ganemulla",
        "health_issues": "Mild dust allergy",
        "extracurricular": "Senior Prefect, Commerce Society",
        "status": "Active",
        "notes": "9 A passes in G.C.E. O/L",
        "photo_url": "",
    },
    {
        "admission_no": "10502",
        "name_with_initials": "D.M. Rajapaksa",
        "full_name": "",  # Optional full name demonstration
        "gender": "Male",
        "dob": "2013-11-05",
        "academic_level": "Grade 6 - 9",
        "grade": "8-B",
        "stream": "Grade 6 - 9",
        "ol_bucket_1": "",
        "ol_bucket_2": "",
        "ol_bucket_3": "",
        "subjects": "Common National Curriculum",
        "medium": "Sinhala",
        "house": "",  # Auto-calculates: 10502 % 3 = 2 -> Paravi
        "enrollment_date": "2024-01-05",
        "guardian_name": "Chaminda Rajapaksa",
        "guardian_contact": "076 555 4321",
        "address": "Temple Road, Kandaliyaddapaluwa",
        "health_issues": "",
        "extracurricular": "Boy Scouts, Junior Athletics",
        "status": "Active",
        "notes": "",
        "photo_url": "",
    },
]

STAFF_SAMPLE_ROWS = [
    {
        "id": "JMV-STF-025",
        "epf_no": "EPF-88412",
        "name_with_initials": "H.M.S. Bandara",
        "full_name": "Herath Mudiyanselage Sunil Bandara",
        "gender": "Male",
        "nic": "198214501234",
        "role": "Senior Teacher (SLTS 1)",
        "department": "Science & Mathematics",
        "appointed_date": "2015-05-12",
        "status": "Active",
        "subjects_taught": "Combined Mathematics, Mathematics",
        "assigned_classes": "10-A, 11-A, 11-B",
        "qualifications": "B.Sc. (Kelaniya), PGDE (Colombo)",
        "contact_no": "077 445 6677",
        "email": "hms.bandara@jmv.sch.lk",
        "notes": "Sectional Head - Grade 11",
        "photo_url": "",
    },
    {
        "id": "JMV-STF-026",
        "epf_no": "",  # Optional EPF demonstration
        "name_with_initials": "W.A.N. Fernando",
        "full_name": "",  # Optional Full Name demonstration
        "gender": "Female",
        "nic": "199065409876",
        "role": "Graduate Teacher (SLTS 2-II)",
        "department": "Commerce & ICT",
        "appointed_date": "2020-02-03",
        "status": "Active",
        "subjects_taught": "Information & Communication Technology, Accounting",
        "assigned_classes": "12-Com, 13-Com",
        "qualifications": "B.Com. Special (Jayewardenepura)",
        "contact_no": "071 223 3445",
        "email": "wan.fernando@jmv.sch.lk",
        "notes": "ICT Lab In-Charge",
        "photo_url": "",
    },
]

STUDENT_INSTRUCTIONS = [
    ["Field Name", "Required?", "Description & Allowed Values"],
    ["Admission Number *", "YES", "Unique student admission number (e.g. 10500 or 2024/0912). Used as unique ID."],
    ["Name with Initials *", "YES", "Student name with initials (e.g. K.A.D. Perera)."],
    ["Full Name (Optional)", "NO", "Full legal name of the student. Can be left blank."],
    ["Gender (Male/Female)", "NO", "Male or Female (defaults to Male if left blank)."],
    ["Date of Birth (YYYY-MM-DD)", "NO", "Format: YYYY-MM-DD (e.g. 2010-03-14)."],
    ["Education Level *", "YES", "One of: Primary | Grade 6 - 9 | Ordinary Level | Advanced Level | 13 Years Guaranteed Education Program"],
    ["Grade / Class *", "YES", "Class designation (e.g. 5-A, 8-B, 10-A, 11-B, 12-Com, 13-Art)."],
    ["Stream (A/L Commerce or Art)", "Conditional", "For Advanced Level: Commerce or Art. Auto-filled for other levels if left blank."],
    ["O/L 1st Bucket Subject", "For O/L", "Citizenship Education | Geography | Business Studies & Accounting"],
    ["O/L 2nd Bucket Subject", "For O/L", "Music | Art | Dancing | Drama"],
    ["O/L 3rd Bucket Subject", "For O/L", "Information & Communication Technology | Health | Home Science | Media | Food and Agri Culture"],
    ["A/L or General Subjects", "For A/L", "For A/L: 3 subjects separated by commas (General English is added automatically as compulsory)."],
    ["Medium (Sinhala/English)", "NO", "Sinhala or English (defaults to Sinhala)."],
    ["House (Auto if blank: Adm % 3)", "NO (Auto)", "Leave blank to auto-assign via Admission No mod 3: Mod 0 = Mayura, Mod 1 = Thisara, Mod 2 = Paravi."],
    ["Enrollment Date (YYYY-MM-DD)", "NO", "Date of admission in YYYY-MM-DD format."],
    ["Guardian Name", "NO", "Parent or legal guardian's name."],
    ["Guardian Contact No", "NO", "Parent or guardian's phone number."],
    ["Permanent Address", "NO", "Residential address."],
    ["Health Issues / Medical Notes", "NO", "Allergies, chronic conditions, or medical notes."],
    ["Extracurricular / Clubs / Sports", "NO", "Sports, societies, prefect roles."],
    ["Status (Active/Past)", "NO", "Active, Past, or Transferred (defaults to Active)."],
    ["Special Notes / Remarks", "NO", "Any academic commendations or special remarks."],
    ["Photo URL (Optional)", "NO", "Direct URL to student photo (auto-avatar generated if blank)."],
]

STAFF_INSTRUCTIONS = [
    ["Field Name", "Required?", "Description & Allowed Values"],
    ["Staff ID *", "YES (or Auto)", "Unique Staff ID (e.g. JMV-STF-025). Auto-generated if left blank."],
    ["EPF / Service No (Optional)", "NO", "EPF or Teacher Service Number. Optional — can be left blank."],
    ["Name with Initials *", "YES", "Teacher / staff name with initials (e.g. H.M.S. Bandara)."],
    ["Full Name (Optional)", "NO", "Full name of the staff member. Optional — can be left blank."],
    ["Gender (Male/Female)", "NO", "Male, Female, or Other (defaults to Male)."],
    ["NIC Number", "NO", "National Identity Card number (e.g. 198214501234 or 821450123V)."],
    ["Designation / Role *", "YES", "Role/Grade (e.g. Senior Teacher (SLTS 1), Graduate Teacher, Principal)."],
    ["Department (Optional)", "NO", "Optional: Administration | Science & Mathematics | Commerce & ICT | Arts & Humanities | Languages | Primary Section | Aesthetic & Sports | Non-Academic Support"],
    ["Appointed Date (YYYY-MM-DD)", "NO", "Appointment date at school in YYYY-MM-DD format."],
    ["Status (Active/On Leave/Retired)", "NO", "Active, On Leave, Transferred, or Retired (defaults to Active)."],
    ["Subjects Taught", "NO", "Comma-separated list of subjects taught."],
    ["Assigned Classes", "NO", "Comma-separated list of classes taught."],
    ["Academic & Professional Qualifications", "NO", "Degrees, diplomas, PGDE, training certifications."],
    ["Contact Mobile No", "NO", "Direct mobile/telephone number."],
    ["Official / Personal Email", "NO", "Email address."],
    ["Service Notes / Commendations", "NO", "Special responsibilities, sectional head roles, commendations."],
    ["Photo URL (Optional)", "NO", "Direct URL to staff photo (auto-avatar generated if blank)."],
]


# ---------------------------------------------------------------------------
# Pure-Python Styled .xlsx Writer
# ---------------------------------------------------------------------------

def _col_letter(col_idx_1based):
    """Convert 1-based column index to Excel column letters (1 -> A, 27 -> AA)."""
    result = ""
    n = col_idx_1based
    while n > 0:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result


def _build_worksheet_xml(headers_with_width, rows_2d, freeze_top_row=True):
    """Build an OpenXML worksheet with column widths, styled header row, and data rows."""
    lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    ]

    if freeze_top_row:
        lines.append(
            '<sheetViews><sheetView tabSelected="1" workbookViewId="0">'
            '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
            '</sheetView></sheetViews>'
        )

    # Column widths
    lines.append("<cols>")
    for idx, (_, _, width) in enumerate(headers_with_width, start=1):
        lines.append(f'<col min="{idx}" max="{idx}" width="{width}" customWidth="1"/>')
    lines.append("</cols>")

    lines.append("<sheetData>")

    # Row 1: Header row (style s="1" -> Royal Maroon background, bold white text)
    lines.append('<row r="1" ht="26" customHeight="1">')
    for col_idx, (_, header_title, _) in enumerate(headers_with_width, start=1):
        cell_ref = f"{_col_letter(col_idx)}1"
        safe_val = xml_escape(str(header_title))
        lines.append(
            f'<c r="{cell_ref}" s="1" t="inlineStr"><is><t>{safe_val}</t></is></c>'
        )
    lines.append("</row>")

    # Data rows (style s="2" -> normal bordered cell)
    for row_offset, row_values in enumerate(rows_2d, start=2):
        lines.append(f'<row r="{row_offset}" ht="20" customHeight="1">')
        for col_idx, val in enumerate(row_values, start=1):
            cell_ref = f"{_col_letter(col_idx)}{row_offset}"
            safe_val = xml_escape("" if val is None else str(val))
            lines.append(
                f'<c r="{cell_ref}" s="2" t="inlineStr"><is><t>{safe_val}</t></is></c>'
            )
        lines.append("</row>")

    lines.append("</sheetData>")
    lines.append("</worksheet>")
    return "\n".join(lines).encode("utf-8")


def build_xlsx_workbook(sheets):
    """
    Build a complete .xlsx file in memory from a list of sheets:
    sheets = [
        {"name": "SheetName", "columns": [(key, title, width), ...], "rows": [[val1, val2, ...], ...]}
    ]
    Returns bytes of the .xlsx ZIP archive.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # [Content_Types].xml
        sheet_overrides = "\n".join(
            f'<Override PartName="/xl/worksheets/sheet{i}.xml" '
            f'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for i in range(1, len(sheets) + 1)
        )
        content_types = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  {sheet_overrides}
</Types>"""
        zf.writestr("[Content_Types].xml", content_types.encode("utf-8"))

        # _rels/.rels
        root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""
        zf.writestr("_rels/.rels", root_rels.encode("utf-8"))

        # xl/workbook.xml
        sheet_Nodes = "\n".join(
            f'<sheet name="{xml_escape(s["name"])}" sheetId="{i}" r:id="rId{i}"/>'
            for i, s in enumerate(sheets, start=1)
        )
        workbook_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    {sheet_Nodes}
  </sheets>
</workbook>"""
        zf.writestr("xl/workbook.xml", workbook_xml.encode("utf-8"))

        # xl/_rels/workbook.xml.rels
        sheet_rels = "\n".join(
            f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
            for i in range(1, len(sheets) + 1)
        )
        style_rel_id = len(sheets) + 1
        wb_rels = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {sheet_rels}
  <Relationship Id="rId{style_rel_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""
        zf.writestr("xl/_rels/workbook.xml.rels", wb_rels.encode("utf-8"))

        # xl/styles.xml (s=0 default, s=1 JMV Royal Maroon header with white bold text, s=2 data cell)
        styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="10"/><color rgb="FF1E293B"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF800020"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>"""
        zf.writestr("xl/styles.xml", styles_xml.encode("utf-8"))

        # Write each worksheet
        for i, s in enumerate(sheets, start=1):
            ws_bytes = _build_worksheet_xml(s["columns"], s["rows"])
            zf.writestr(f"xl/worksheets/sheet{i}.xml", ws_bytes)

    return buf.getvalue()


def generate_student_template_xlsx():
    """Return bytes of the Student Bulk Upload .xlsx template."""
    data_rows = []
    for sample in STUDENT_SAMPLE_ROWS:
        data_rows.append([sample.get(col_key, "") for col_key, _, _ in STUDENT_TEMPLATE_COLUMNS])

    instr_cols = [
        ("field", "Column / Field Name", 34),
        ("req", "Mandatory?", 16),
        ("desc", "Allowed Values & Formatting Guide", 85),
    ]
    instr_rows = STUDENT_INSTRUCTIONS[1:]

    return build_xlsx_workbook([
        {
            "name": "Students_Upload",
            "columns": STUDENT_TEMPLATE_COLUMNS,
            "rows": data_rows,
        },
        {
            "name": "Instructions_Field_Guide",
            "columns": instr_cols,
            "rows": instr_rows,
        },
    ])


def generate_staff_template_xlsx():
    """Return bytes of the Teachers & Staff Bulk Upload .xlsx template."""
    data_rows = []
    for sample in STAFF_SAMPLE_ROWS:
        data_rows.append([sample.get(col_key, "") for col_key, _, _ in STAFF_TEMPLATE_COLUMNS])

    instr_cols = [
        ("field", "Column / Field Name", 36),
        ("req", "Mandatory?", 16),
        ("desc", "Allowed Values & Formatting Guide", 85),
    ]
    instr_rows = STAFF_INSTRUCTIONS[1:]

    return build_xlsx_workbook([
        {
            "name": "Teachers_Staff_Upload",
            "columns": STAFF_TEMPLATE_COLUMNS,
            "rows": data_rows,
        },
        {
            "name": "Instructions_Field_Guide",
            "columns": instr_cols,
            "rows": instr_rows,
        },
    ])


# ---------------------------------------------------------------------------
# Pure-Python .xlsx and .csv Reader
# ---------------------------------------------------------------------------

def _col_ref_to_index(cell_ref):
    """Convert cell reference like 'AB12' -> 0-based column index (27)."""
    letters = ""
    for ch in cell_ref:
        if ch.isalpha():
            letters += ch.upper()
        else:
            break
    if not letters:
        return 0
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def parse_xlsx_bytes(file_bytes):
    """
    Parse the first worksheet of an .xlsx file into a list of 2D rows: [[cell1, cell2, ...], ...].
    Supports sharedStrings, inlineStr, string formulas, numbers, and empty cells.
    """
    with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as zf:
        namelist = zf.namelist()

        # 1. Read sharedStrings.xml if present
        shared_strings = []
        if "xl/sharedStrings.xml" in namelist:
            ss_xml = zf.read("xl/sharedStrings.xml")
            ss_root = ET.fromstring(ss_xml)
            for si in ss_root.iter():
                if si.tag.endswith("}si") or si.tag == "si":
                    parts = []
                    for t_node in si.iter():
                        if t_node.tag.endswith("}t") or t_node.tag == "t":
                            if t_node.text:
                                parts.append(t_node.text)
                    shared_strings.append("".join(parts))

        # 2. Locate first worksheet (usually xl/worksheets/sheet1.xml)
        sheet_path = "xl/worksheets/sheet1.xml"
        if sheet_path not in namelist:
            worksheet_files = sorted(
                [n for n in namelist if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
            )
            if not worksheet_files:
                raise ValueError("No worksheet found inside the uploaded .xlsx file.")
            sheet_path = worksheet_files[0]

        ws_xml = zf.read(sheet_path)
        ws_root = ET.fromstring(ws_xml)

        rows_2d = []
        for elem in ws_root.iter():
            if elem.tag.endswith("}row") or elem.tag == "row":
                row_cells = {}
                max_col = -1
                for c in elem:
                    if not (c.tag.endswith("}c") or c.tag == "c"):
                        continue
                    cell_ref = c.attrib.get("r", "")
                    col_idx = _col_ref_to_index(cell_ref) if cell_ref else (max_col + 1)
                    if col_idx > max_col:
                        max_col = col_idx

                    cell_type = c.attrib.get("t", "")
                    val_text = ""

                    if cell_type == "inlineStr":
                        parts = []
                        for sub in c.iter():
                            if sub.tag.endswith("}t") or sub.tag == "t":
                                if sub.text:
                                    parts.append(sub.text)
                        val_text = "".join(parts)
                    else:
                        v_node = None
                        for sub in c:
                            if sub.tag.endswith("}v") or sub.tag == "v":
                                v_node = sub
                                break
                        raw_v = v_node.text if (v_node is not None and v_node.text is not None) else ""
                        if cell_type == "s":
                            try:
                                ss_idx = int(raw_v)
                                val_text = shared_strings[ss_idx] if 0 <= ss_idx < len(shared_strings) else raw_v
                            except ValueError:
                                val_text = raw_v
                        elif cell_type == "b":
                            val_text = "TRUE" if raw_v == "1" else "FALSE"
                        else:
                            # Numeric or formula string
                            if raw_v.endswith(".0") and raw_v[:-2].lstrip("-").isdigit():
                                val_text = raw_v[:-2]
                            else:
                                val_text = raw_v

                    row_cells[col_idx] = val_text.strip()

                if max_col >= 0:
                    row_list = [row_cells.get(i, "") for i in range(max_col + 1)]
                    # Skip completely blank rows
                    if any(cell != "" for cell in row_list):
                        rows_2d.append(row_list)

        return rows_2d


def parse_csv_bytes(file_bytes):
    """Parse CSV bytes (UTF-8 / UTF-8-SIG / Latin-1) into 2D rows."""
    text = None
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = file_bytes.decode("utf-8", errors="replace")

    reader = csv.reader(io.StringIO(text))
    rows_2d = []
    for row in reader:
        cleaned = [str(c).strip() for c in row]
        if any(c != "" for c in cleaned):
            rows_2d.append(cleaned)
    return rows_2d


def parse_spreadsheet_bytes(file_bytes, filename=""):
    """Auto-detect .xlsx vs .csv from filename or ZIP magic header and return 2D rows."""
    if not file_bytes:
        raise ValueError("Uploaded file is empty.")
    is_zip = file_bytes[:4] == b"PK\x03\x04"
    lower_name = (filename or "").lower()
    if is_zip or lower_name.endswith(".xlsx"):
        return parse_xlsx_bytes(file_bytes)
    return parse_csv_bytes(file_bytes)


# ---------------------------------------------------------------------------
# Header Normalization & Row Mapping
# ---------------------------------------------------------------------------

def _norm_header(h):
    """Normalize a column header string to match aliases."""
    s = str(h or "").lower().strip()
    # Remove parenthetical hints and asterisks, e.g. "Full Name (Optional)" -> "full name"
    s = re.sub(r"\(.*?\)", "", s)
    s = s.replace("*", "").strip()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s


STUDENT_HEADER_ALIASES = {
    "admission_no": {"admission_no", "admission_number", "admission", "adm_no", "adm_number", "index_no", "student_id", "id"},
    "name_with_initials": {"name_with_initials", "name_initials", "initials", "short_name", "student_name", "name"},
    "full_name": {"full_name", "fullname", "complete_name", "legal_name"},
    "gender": {"gender", "sex"},
    "dob": {"dob", "date_of_birth", "birth_date", "birthdate"},
    "academic_level": {"academic_level", "education_level", "level", "edu_level", "section"},
    "grade": {"grade", "grade_class", "class", "class_name", "grade_and_class"},
    "stream": {"stream", "subject_stream", "al_stream", "a_l_stream", "academic_stream"},
    "ol_bucket_1": {"ol_bucket_1", "o_l_1st_bucket_subject", "1st_bucket_subject", "bucket_1", "ol_bucket1", "first_bucket"},
    "ol_bucket_2": {"ol_bucket_2", "o_l_2nd_bucket_subject", "2nd_bucket_subject", "bucket_2", "ol_bucket2", "second_bucket"},
    "ol_bucket_3": {"ol_bucket_3", "o_l_3rd_bucket_subject", "3rd_bucket_subject", "bucket_3", "ol_bucket3", "third_bucket"},
    "subjects": {"subjects", "a_l_or_general_subjects", "al_subjects", "subject_list", "enrolled_subjects"},
    "medium": {"medium", "medium_of_study", "language_medium"},
    "house": {"house", "school_house", "student_house"},
    "enrollment_date": {"enrollment_date", "enrolment_date", "admission_date", "date_of_admission", "joined_date"},
    "guardian_name": {"guardian_name", "parent_name", "guardian", "parent_guardian_name", "father_mother_name"},
    "guardian_contact": {"guardian_contact", "guardian_contact_no", "guardian_mobile", "parent_contact", "parent_mobile", "contact_no", "phone", "mobile"},
    "address": {"address", "permanent_address", "home_address", "residential_address"},
    "health_issues": {"health_issues", "health_issues_medical_notes", "medical_notes", "medical_conditions", "health", "allergies"},
    "extracurricular": {"extracurricular", "extracurricular_clubs_sports", "clubs_and_sports", "sports", "clubs", "extra_curricular"},
    "status": {"status", "student_status", "enrollment_status"},
    "notes": {"notes", "special_notes_remarks", "special_notes", "remarks", "comments"},
    "photo_url": {"photo_url", "photo", "image_url", "avatar_url"},
}

STAFF_HEADER_ALIASES = {
    "id": {"id", "staff_id", "teacher_id", "faculty_id", "employee_id"},
    "epf_no": {"epf_no", "epf_service_no", "epf", "epf_number", "service_no", "paysheet_no"},
    "name_with_initials": {"name_with_initials", "name_initials", "initials", "teacher_name", "staff_name", "name"},
    "full_name": {"full_name", "fullname", "complete_name", "legal_name"},
    "gender": {"gender", "sex"},
    "nic": {"nic", "nic_number", "national_id", "national_identity_card"},
    "role": {"role", "designation_role", "designation", "position", "job_title", "current_role", "grade"},
    "department": {"department", "faculty", "section", "division"},
    "appointed_date": {"appointed_date", "appointment_date", "date_of_appointment", "joined_date"},
    "status": {"status", "employment_status", "staff_status"},
    "subjects_taught": {"subjects_taught", "subjects", "teaching_subjects", "main_subject"},
    "assigned_classes": {"assigned_classes", "classes", "classes_taught"},
    "qualifications": {"qualifications", "academic_professional_qualifications", "academic_qualifications", "degrees"},
    "contact_no": {"contact_no", "contact_mobile_no", "mobile", "phone", "mobile_no", "telephone"},
    "email": {"email", "official_personal_email", "email_address", "school_email"},
    "notes": {"notes", "service_notes_commendations", "service_notes", "remarks", "comments"},
    "photo_url": {"photo_url", "photo", "image_url", "avatar_url"},
}


def _normalize_date_str(val):
    """Convert common date formats or Excel serial numbers into YYYY-MM-DD."""
    s = str(val or "").strip()
    if not s:
        return ""
    # Check if Excel serial date (e.g. 40251 -> 2010-03-14)
    if s.isdigit() and 15000 <= int(s) <= 60000:
        base = date(1899, 12, 30)
        d = base + timedelta(days=int(s))
        return d.isoformat()
    # Try common string date formats
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return s


def map_rows_to_student_dicts(rows_2d):
    """
    Map 2D spreadsheet rows (row 0 = headers, row 1+ = records) into normalized student dicts.
    Returns (list_of_row_tuples: [(row_number, student_dict), ...], header_warnings).
    """
    if not rows_2d or len(rows_2d) < 2:
        raise ValueError("The uploaded sheet has no data rows beneath the header row.")

    raw_headers = rows_2d[0]
    col_map = {}
    for col_idx, raw_h in enumerate(raw_headers):
        norm = _norm_header(raw_h)
        if not norm:
            continue
        for field_key, aliases in STUDENT_HEADER_ALIASES.items():
            if norm in aliases or norm == field_key:
                if field_key not in col_map:
                    col_map[field_key] = col_idx
                break

    if "admission_no" not in col_map:
        raise ValueError(
            "Could not find 'Admission Number' column in the header row. "
            "Please use the official Student Bulk Upload Excel Template."
        )

    mapped_records = []
    for row_idx, row in enumerate(rows_2d[1:], start=2):
        def get_val(key):
            c_idx = col_map.get(key)
            if c_idx is None or c_idx >= len(row):
                return ""
            return str(row[c_idx]).strip()

        adm_no = get_val("admission_no")
        initials = get_val("name_with_initials")
        full_name = get_val("full_name")

        # Skip completely empty trailing rows
        if not adm_no and not initials and not full_name:
            continue

        # Fallback initials from full_name if initials column was omitted
        if not initials and full_name:
            initials = full_name

        level = get_val("academic_level")
        grade = get_val("grade") or "General"
        stream = get_val("stream")
        ol_b1 = get_val("ol_bucket_1")
        ol_b2 = get_val("ol_bucket_2")
        ol_b3 = get_val("ol_bucket_3")
        subjects = get_val("subjects")

        # Infer Education Level if left blank
        if not level:
            if ol_b1 or ol_b2 or ol_b3 or grade.startswith(("10", "11")):
                level = "Ordinary Level"
            elif grade.startswith(("12", "13")) or "commerce" in stream.lower() or "art" in stream.lower():
                level = "Advanced Level"
            elif grade.startswith(("1", "2", "3", "4", "5")) and not grade.startswith(("10", "11", "12", "13")):
                level = "Primary"
            elif grade.startswith(("6", "7", "8", "9")):
                level = "Grade 6 - 9"
            else:
                level = "Grade 6 - 9"

        # Normalize stream & subjects based on Education Level
        if level == "Ordinary Level":
            if not stream:
                stream = "Senior Secondary (G.C.E. O/L)"
            if not subjects:
                buckets = [b for b in (ol_b1, ol_b2, ol_b3) if b]
                subjects = f"O/L Core + Electives: {', '.join(buckets)}" if buckets else "O/L Core Curriculum"
        elif level == "Advanced Level":
            if "art" in stream.lower():
                stream = "Art Stream (A/L)"
            elif "com" in stream.lower():
                stream = "Commerce Stream (A/L)"
            elif not stream:
                stream = "Advanced Level (A/L)"
            if subjects and "english" not in subjects.lower():
                subjects = f"English (Mandatory), {subjects}"
            elif not subjects:
                subjects = "English (Mandatory)"
        else:
            if not stream:
                stream = level
            if not subjects:
                subjects = f"{level} Standard Curriculum"

        house_val = get_val("house")
        if house_val.lower() in ("auto", "auto-calculate", "adm % 3", ""):
            house_val = ""  # db.py will auto-calculate via calculate_house_from_admission

        gender_val = get_val("gender") or "Male"
        if gender_val.lower().startswith("f"):
            gender_val = "Female"
        elif gender_val.lower().startswith("m"):
            gender_val = "Male"

        medium_val = get_val("medium") or "Sinhala"
        status_val = get_val("status") or "Active"
        photo = get_val("photo_url")
        if not photo and initials:
            from urllib.parse import quote
            photo = f"https://ui-avatars.com/api/?name={quote(initials)}&background=5c0d1b&color=fff"

        record = {
            "admission_no": adm_no,
            "name_with_initials": initials,
            "full_name": full_name,
            "gender": gender_val,
            "dob": _normalize_date_str(get_val("dob")) or None,
            "academic_level": level,
            "grade": grade,
            "stream": stream,
            "ol_bucket_1": ol_b1,
            "ol_bucket_2": ol_b2,
            "ol_bucket_3": ol_b3,
            "subjects": subjects,
            "medium": medium_val,
            "house": house_val,
            "enrollment_date": _normalize_date_str(get_val("enrollment_date")) or None,
            "guardian_name": get_val("guardian_name"),
            "guardian_contact": get_val("guardian_contact"),
            "address": get_val("address"),
            "health_issues": get_val("health_issues"),
            "extracurricular": get_val("extracurricular"),
            "status": status_val,
            "notes": get_val("notes"),
            "photo_url": photo,
        }
        mapped_records.append((row_idx, record))

    return mapped_records


def map_rows_to_staff_dicts(rows_2d):
    """
    Map 2D spreadsheet rows (row 0 = headers, row 1+ = records) into normalized staff dicts.
    Returns list_of_row_tuples: [(row_number, staff_dict), ...].
    """
    if not rows_2d or len(rows_2d) < 2:
        raise ValueError("The uploaded sheet has no data rows beneath the header row.")

    raw_headers = rows_2d[0]
    col_map = {}
    for col_idx, raw_h in enumerate(raw_headers):
        norm = _norm_header(raw_h)
        if not norm:
            continue
        for field_key, aliases in STAFF_HEADER_ALIASES.items():
            if norm in aliases or norm == field_key:
                if field_key not in col_map:
                    col_map[field_key] = col_idx
                break

    if "name_with_initials" not in col_map and "full_name" not in col_map:
        raise ValueError(
            "Could not find 'Name with Initials' column in the header row. "
            "Please use the official Teachers & Staff Bulk Upload Excel Template."
        )

    mapped_records = []
    for row_idx, row in enumerate(rows_2d[1:], start=2):
        def get_val(key):
            c_idx = col_map.get(key)
            if c_idx is None or c_idx >= len(row):
                return ""
            return str(row[c_idx]).strip()

        staff_id = get_val("id")
        initials = get_val("name_with_initials")
        full_name = get_val("full_name")

        if not staff_id and not initials and not full_name:
            continue

        if not initials and full_name:
            initials = full_name

        gender_val = get_val("gender") or "Male"
        if gender_val.lower().startswith("f"):
            gender_val = "Female"
        elif gender_val.lower().startswith("m"):
            gender_val = "Male"

        photo = get_val("photo_url")
        if not photo and initials:
            from urllib.parse import quote
            photo = f"https://ui-avatars.com/api/?name={quote(initials)}&background=5c0d1b&color=fff"

        epf_raw = get_val("epf_no")
        app_date_raw = _normalize_date_str(get_val("appointed_date"))

        record = {
            "id": staff_id,  # If empty, bulk importer will auto-assign JMV-STF-XXX
            "epf_no": epf_raw if epf_raw else None,
            "name_with_initials": initials,
            "full_name": full_name,
            "gender": gender_val,
            "nic": get_val("nic"),
            "role": get_val("role") or "Teacher",
            "department": get_val("department"),
            "appointed_date": app_date_raw if app_date_raw else None,
            "status": get_val("status") or "Active",
            "subjects_taught": get_val("subjects_taught"),
            "assigned_classes": get_val("assigned_classes"),
            "qualifications": get_val("qualifications"),
            "contact_no": get_val("contact_no"),
            "email": get_val("email"),
            "notes": get_val("notes"),
            "photo_url": photo,
        }
        mapped_records.append((row_idx, record))

    return mapped_records

