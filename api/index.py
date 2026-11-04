import os
import sys
import base64
from functools import wraps

from flask import Flask, Response, jsonify, request, send_from_directory

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db
import excel_utils

app = Flask(__name__)
DB_ERROR = None
try:
    db.init_db()
except Exception as error:
    DB_ERROR = f"Database initialization failed: {error}"


def current_user():
    token = request.headers.get("Authorization", "")
    if token.startswith("Bearer "):
        token = token[7:].strip()
    token = token or request.cookies.get("jmv_session", "")
    return db.validate_session(token) if token else None


def requires_roles(*roles):
    def decorator(handler):
        @wraps(handler)
        def wrapped(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify(error="Authentication required. Please log in.",
                               code="AUTH_REQUIRED"), 401
            if user.get("role") not in roles:
                return jsonify(error=f"Access denied. Requires one of roles: {', '.join(roles)}.",
                               code="FORBIDDEN"), 403
            return handler(user, *args, **kwargs)
        return wrapped
    return decorator


@app.before_request
def protect_data_routes():
    global DB_ERROR
    if not request.path.startswith("/api/"):
        return None
    if DB_ERROR:
        try:
            db.init_db()
            DB_ERROR = None
        except Exception as err:
            DB_ERROR = f"Database initialization failed: {err}"
    if DB_ERROR and request.path not in {"/api/health", "/api/stats"}:
        return jsonify(error=DB_ERROR, code="DATABASE_UNAVAILABLE"), 503
    public = {"/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/stats"}
    if request.path in public:
        return None
    user = current_user()
    if not user:
        return jsonify(error="Authentication required. Please log in.",
                       code="AUTH_REQUIRED"), 401
    if user.get("role") not in {"admin", "teacher"}:
        return jsonify(error="Access denied. Only teachers and administrators can view portal data.",
                       code="DATA_ACCESS_RESTRICTED"), 403
    return None


@app.get("/api/health")
def health():
    global DB_ERROR
    ok, message = db.check_connection()
    if ok:
        DB_ERROR = None
    status = db.get_engine_status()
    return jsonify(status="ok" if not DB_ERROR else "error",
                   active_engine=status.get("engine", "sqlite"),
                   mariadb_connected=ok, message=message, details=status)


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()
    if not username or not password:
        return jsonify(error="Username and password are required"), 400
    user = db.authenticate_user(username, password)
    if not user:
        return jsonify(error="Invalid credentials. Please verify username and password."), 401
    token = db.create_session(user["id"], user["role"])
    response = jsonify(success=True, token=token, user=user)
    response.set_cookie("jmv_session", token, max_age=604800, httponly=True,
                        samesite="Lax", secure=bool(os.environ.get("VERCEL")))
    return response


@app.post("/api/auth/logout")
def logout():
    user = current_user()
    token = request.headers.get("Authorization", "")
    token = token[7:].strip() if token.startswith("Bearer ") else request.cookies.get("jmv_session", "")
    if token:
        db.delete_session(token)
    response = jsonify(success=True, message="Logged out successfully")
    response.delete_cookie("jmv_session")
    return response


@app.get("/api/auth/me")
def me():
    user = current_user()
    return jsonify(authenticated=bool(user), user=user)


@app.get("/api/stats")
def stats():
    try:
        return jsonify(db.get_system_stats())
    except Exception as err:
        return jsonify(
            total_students=0,
            total_staff=0,
            non_academic_staff=0,
            school_total_students="1,000+",
            school_total_staff="50+",
            grades=[],
            departments=[],
            houses=[],
            engine=getattr(db, "ACTIVE_ENGINE", "mariadb"),
            error=str(err)
        )


@app.get("/api/lookup")
@requires_roles("admin", "teacher")
def lookup(user):
    target = request.args.get("id", "").strip()
    if not target:
        return jsonify(found=False, error="ID parameter is required"), 400
    result = db.universal_id_search(target)
    if result:
        if user and user.get("role") == "teacher" and result.get("entity_type") == "staff":
            return jsonify(found=False, error="Access denied. Teachers cannot access faculty records."), 403
        return jsonify(found=True, type=result.get("entity_type"), data=result)
    return jsonify(found=False, message="No matching record found"), 404


@app.get("/api/suggestions")
@requires_roles("admin", "teacher")
def suggestions(user):
    include_staff = not (user and user.get("role") == "teacher")
    return jsonify(db.quick_suggestions(request.args.get("q", ""), limit=8, include_staff=include_staff))


@app.get("/api/students")
@requires_roles("admin", "teacher")
def students(_user):
    return jsonify(db.get_all_students(search=request.args.get("search"),
                                       grade=request.args.get("grade"),
                                       house=request.args.get("house")))


@app.route("/api/students/<student_id>", methods=["GET", "PUT", "DELETE"])
@requires_roles("admin", "teacher")
def student(user, student_id):
    if request.method == "GET":
        record = db.get_student_by_id(student_id)
        return jsonify(record) if record else (jsonify(error="Student not found"), 404)
    if user["role"] != "admin":
        return jsonify(error="Only administrators can change student profiles."), 403
    if request.method == "DELETE":
        if not db.get_student_by_id(student_id):
            return jsonify(error="Student not found"), 404
        db.delete_student(student_id, actor=user)
        return jsonify(success=True)
    record = db.update_student(student_id, request.get_json(silent=True) or {}, actor=user)
    return jsonify(record)


@app.get("/api/audit")
@requires_roles("admin")
def audit_log(_user):
    return jsonify(db.get_audit_log(entity_type=request.args.get("entity_type"),
                                    entity_id=request.args.get("entity_id"),
                                    limit=request.args.get("limit", 200)))


@app.get("/api/subjects")
@requires_roles("admin", "teacher")
def get_subjects(_user):
    return jsonify(db.get_all_subjects(category=request.args.get("category")))


@app.get("/api/templates/students.xlsx")
def download_student_template():
    xlsx_bytes = excel_utils.generate_student_template_xlsx()
    return Response(
        xlsx_bytes,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="JMV_Student_Bulk_Upload_Template.xlsx"'},
    )


@app.get("/api/templates/staff.xlsx")
def download_staff_template():
    xlsx_bytes = excel_utils.generate_staff_template_xlsx()
    return Response(
        xlsx_bytes,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="JMV_Teachers_Staff_Bulk_Upload_Template.xlsx"'},
    )


def _extract_flask_spreadsheet():
    mode = request.args.get("mode", "upsert")
    filename = "upload.xlsx"
    file_bytes = b""
    if "file" in request.files:
        f = request.files["file"]
        filename = f.filename or filename
        file_bytes = f.read()
        mode = request.form.get("mode", mode)
    else:
        data = request.get_json(silent=True) or {}
        filename = data.get("filename", filename)
        mode = data.get("mode", mode)
        b64 = data.get("file_base64", "")
        if "," in b64 and b64.startswith("data:"):
            b64 = b64.split(",", 1)[1]
        if b64:
            file_bytes = base64.b64decode(b64)
    return file_bytes, filename, mode


@app.post("/api/students/bulk")
@requires_roles("admin")
def bulk_upload_students(_user):
    try:
        file_bytes, filename, mode = _extract_flask_spreadsheet()
        rows_2d = excel_utils.parse_spreadsheet_bytes(file_bytes, filename)
        mapped = excel_utils.map_rows_to_student_dicts(rows_2d)
        summary = db.bulk_upsert_students(mapped, mode=mode, actor=_user)
        return jsonify(success=True, **summary)
    except ValueError as ve:
        return jsonify(error=str(ve)), 400
    except Exception as exc:
        return jsonify(error=f"Failed to process Excel file: {exc}"), 500


@app.post("/api/staff/bulk")
@requires_roles("admin")
def bulk_upload_staff(_user):
    try:
        file_bytes, filename, mode = _extract_flask_spreadsheet()
        rows_2d = excel_utils.parse_spreadsheet_bytes(file_bytes, filename)
        mapped = excel_utils.map_rows_to_staff_dicts(rows_2d)
        summary = db.bulk_upsert_staff(mapped, mode=mode, actor=_user)
        return jsonify(success=True, **summary)
    except ValueError as ve:
        return jsonify(error=str(ve)), 400
    except Exception as exc:
        return jsonify(error=f"Failed to process Excel file: {exc}"), 500


@app.post("/api/students")
@requires_roles("admin")
def create_student(_user):
    data = request.get_json(silent=True) or {}
    if not data.get("admission_no") or not data.get("name_with_initials"):
        return jsonify(error="Missing required fields (admission_no, name_with_initials)"), 400
    if db.get_student_by_id(data["admission_no"]):
        return jsonify(error="Admission number already exists"), 409
    return jsonify(db.create_student(data, actor=_user)), 201


@app.get("/api/staff")
@requires_roles("admin")
def staff(_user):
    return jsonify(db.get_all_staff(search=request.args.get("search"),
                                    department=request.args.get("department"),
                                    role=request.args.get("role")))

@app.post("/api/staff")
@requires_roles("admin")
def create_staff(_user):
    data = request.get_json(silent=True) or {}
    if not data.get("id") or not data.get("name_with_initials"):
        return jsonify(error="Missing required fields (id, name_with_initials)"), 400
    if db.get_staff_by_id(data["id"]):
        return jsonify(error="Staff ID already exists"), 409
    return jsonify(db.create_staff(data, actor=_user)), 201


@app.route("/api/staff/<staff_id>", methods=["GET", "PUT", "DELETE"])
@requires_roles("admin")
def staff_record(user, staff_id):
    if request.method == "GET":
        record = db.get_staff_by_id(staff_id)
        return jsonify(record) if record else (jsonify(error="Staff member not found"), 404)
    if request.method == "DELETE":
        db.delete_staff(staff_id, actor=user)
        return jsonify(success=True)
    return jsonify(db.update_staff(staff_id, request.get_json(silent=True) or {}, actor=user))


@app.get("/api/marks")
@requires_roles("admin", "teacher")
def marks(_user):
    return jsonify(db.get_all_marks(term=request.args.get("term"),
                                    year=request.args.get("year"),
                                    search=request.args.get("search")))


@app.route("/api/students/<student_id>/marks", methods=["GET", "POST"])
@requires_roles("admin", "teacher")
def student_marks(user, student_id):
    if request.method == "GET":
        return jsonify(db.get_student_marks(student_id, request.args.get("term"),
                                            request.args.get("year")))
    data = request.get_json(silent=True) or {}
    data["student_id"] = student_id
    return jsonify(db.save_student_mark(
        data, updated_by=f"{user['full_name']} ({user['role'].capitalize()})"
    ))


@app.get("/api/timetable")
@requires_roles("admin", "teacher")
def timetable(_user):
    return jsonify(db.get_timetable(class_name=request.args.get("class_name"),
                                    teacher_id=request.args.get("teacher_id")))


@app.post("/api/timetable")
@app.put("/api/timetable/<entry_id>")
@requires_roles("admin")
def save_timetable(user, entry_id=None):
    data = request.get_json(silent=True) or {}
    if entry_id:
        data["id"] = entry_id
    teacher = db.get_staff_by_id(str(data.get("teacher_id", "")).strip())
    if not teacher:
        return jsonify(error="Selected teacher was not found."), 400
    data["teacher_id"] = teacher["id"]
    data["teacher_name"] = teacher.get("name_with_initials") or teacher["full_name"]
    try:
        return jsonify(db.save_timetable_entry(data))
    except (ValueError, TypeError) as error:
        return jsonify(error=str(error)), 400


@app.delete("/api/timetable/<entry_id>")
@requires_roles("admin")
def delete_timetable(_user, entry_id):
    db.delete_timetable_entry(entry_id)
    return jsonify(success=True)

@app.delete("/api/students/<student_id>/marks/<mark_id>")
@requires_roles("admin", "teacher")
def delete_mark(_user, student_id, mark_id):
    db.delete_student_mark(mark_id)
    return jsonify(success=True)

@app.post("/api/reset-demo")
@requires_roles("admin")
def reset_demo(_user):
    db.reset_to_demo_data()
    return jsonify(success=True)


@app.get("/")
def index():
    return send_from_directory(os.path.join(app.root_path, "..", "static"), "index.html")
