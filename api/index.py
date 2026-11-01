import os
import sys
from functools import wraps

from flask import Flask, jsonify, request, send_from_directory

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db

app = Flask(__name__)
DB_ERROR = None
try:
    db.init_db()
    if os.environ.get("VERCEL"):
        connected, connection_message = db.check_connection()
        if not connected:
            DB_ERROR = (
                "Vercel requires a reachable MariaDB/MySQL database. "
                f"Database connection failed: {connection_message}"
            )
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
    if not request.path.startswith("/api/"):
        return None
    if DB_ERROR and request.path != "/api/health":
        return jsonify(error=DB_ERROR, code="DATABASE_UNAVAILABLE"), 503
    public = {"/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/me"}
    if request.path in public:
        return None
    user = current_user()
    if not user:
        return jsonify(error="Authentication required. Please log in.",
                       code="AUTH_REQUIRED"), 401
    if request.path.startswith("/api/users"):
        if user.get("role") != "developer":
            return jsonify(error="Only developers can access account management.",
                           code="DEVELOPER_ACCESS_REQUIRED"), 403
    elif user.get("role") not in {"admin", "teacher"}:
        return jsonify(error="Access denied. Only teachers and administrators can view portal data.",
                       code="DATA_ACCESS_RESTRICTED"), 403
    return None


@app.get("/api/health")
def health():
    ok, message = db.check_connection()
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
@requires_roles("admin", "teacher")
def stats(_user):
    return jsonify(db.get_system_stats())


@app.get("/api/users")
@requires_roles("developer")
def users(_user):
    return jsonify(db.get_all_users())


@app.post("/api/users")
@requires_roles("developer")
def create_user(_user):
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    role = str(data.get("role", "")).strip()
    full_name = str(data.get("full_name", "")).strip()
    if not username or not password or role not in {"admin", "teacher"} or not full_name:
        return jsonify(error="username, password, full_name, and role (admin or teacher) are required"), 400
    try:
        return jsonify(db.create_user({
            **data,
            "username": username,
            "password": password,
            "role": role,
            "full_name": full_name
        })), 201
    except Exception as error:
        return jsonify(error=str(error)), 409


@app.get("/api/lookup")
@requires_roles("admin", "teacher")
def lookup(_user):
    target = request.args.get("id", "").strip()
    if not target:
        return jsonify(found=False, error="ID parameter is required"), 400
    result = db.universal_id_search(target)
    return (jsonify(found=True, type=result.get("entity_type"), data=result)
            if result else
            (jsonify(found=False, message="No matching record found"), 404))


@app.get("/api/suggestions")
@requires_roles("admin", "teacher")
def suggestions(_user):
    return jsonify(db.quick_suggestions(request.args.get("q", ""), limit=8))


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
        db.delete_student(student_id)
        return jsonify(success=True)
    record = db.update_student(student_id, request.get_json(silent=True) or {})
    return jsonify(record)


@app.post("/api/students")
@requires_roles("admin")
def create_student(_user):
    data = request.get_json(silent=True) or {}
    if not data.get("admission_no") or not data.get("full_name"):
        return jsonify(error="Missing required fields (admission_no, full_name)"), 400
    if db.get_student_by_id(data["admission_no"]):
        return jsonify(error="Admission number already exists"), 409
    return jsonify(db.create_student(data)), 201


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
    if not data.get("id") or not data.get("epf_no") or not data.get("full_name"):
        return jsonify(error="Missing required fields (id, epf_no, full_name)"), 400
    if db.get_staff_by_id(data["id"]):
        return jsonify(error="Staff ID already exists"), 409
    return jsonify(db.create_staff(data)), 201


@app.route("/api/staff/<staff_id>", methods=["GET", "PUT", "DELETE"])
@requires_roles("admin")
def staff_record(_user, staff_id):
    if request.method == "GET":
        record = db.get_staff_by_id(staff_id)
        return jsonify(record) if record else (jsonify(error="Staff member not found"), 404)
    if request.method == "DELETE":
        db.delete_staff(staff_id)
        return jsonify(success=True)
    return jsonify(db.update_staff(staff_id, request.get_json(silent=True) or {}))


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
@requires_roles("admin")
def timetable(_user):
    return jsonify(db.get_timetable(request.args.get("class_name")))


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
