#!/usr/bin/env python3
"""
Jayakody Maha Vidyalaya - School Database Portal Web Server
Provides REST API endpoints and static file serving.
Supports:
1. aiohttp (when installed in the environment)
2. Python built-in ThreadingHTTPServer (zero-dependency standalone fallback)
Theme & Reference: JMV-Web (Royal Maroon & Imperial Gold)
"""

import os
import sys
import json
import base64
import re
import urllib.parse
import mimetypes
from http import cookies
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

try:
    from aiohttp import web
    HAS_AIOHTTP = True
except ImportError:
    class DummyWeb:
        @staticmethod
        def middleware(f):
            return f
        class Response:
            def __init__(self, *args, **kwargs):
                pass
            def enable_compression(self):
                pass
            def set_cookie(self, *args, **kwargs):
                pass
            def del_cookie(self, *args, **kwargs):
                pass
        class HTTPException(Exception):
            pass
        class Application:
            pass
    web = DummyWeb
    HAS_AIOHTTP = False

import db
import excel_utils

DB_STATE = {"ok": False, "message": "Not checked yet"}

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

def json_response(data, status=200, cookie_token=None, clear_cookie=False):
    resp = web.Response(
        text=json.dumps(data, default=str),
        status=status,
        content_type="application/json",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Access-Control-Allow-Origin": "*"
        }
    )
    resp.enable_compression()
    if cookie_token:
        resp.set_cookie(
            "jmv_session",
            cookie_token,
            max_age=86400 * 7,
            path="/",
            httponly=True,
            samesite="Lax"
        )
    if clear_cookie:
        resp.del_cookie("jmv_session", path="/")
    return resp

def get_current_user(request):
    """Extract and validate session from Authorization header or cookie (cached per request)."""
    if "user" in request:
        return request["user"]
    token = ""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if not token:
        token = request.cookies.get("jmv_session", "")
    if not token:
        request["user"] = None
        return None
    user = db.validate_session(token)
    request["user"] = user
    return user

def require_role(request, allowed_roles):
    """Returns (user, None) if authorized, or (None, error_response) if not."""
    user = get_current_user(request)
    if not user:
        return None, json_response({
            "error": "Authentication required. Please log in.",
            "code": "AUTH_REQUIRED"
        }, status=401)
    if user.get("role") not in allowed_roles:
        return None, json_response({
            "error": f"Access denied. Requires one of roles: {', '.join(allowed_roles)}. Your role is '{user.get('role')}'.",
            "code": "FORBIDDEN",
            "user_role": user.get("role")
        }, status=403)
    return user, None

async def handle_index(request):
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            content = f.read()
        resp = web.Response(
            text=content,
            content_type="text/html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache"
            }
        )
        resp.enable_compression()
        return resp
    return web.Response(text="Index file not found", status=404)

async def handle_stats(request):
    stats = db.get_system_stats()
    return json_response(stats)

async def handle_lookup(request):
    target_id = request.query.get("id", "").strip()
    if not target_id:
        return json_response({"found": False, "error": "ID parameter is required"}, status=400)
    
    user = get_current_user(request)
    result = db.universal_id_search(target_id)
    if result:
        if user and user.get("role") == "teacher" and result.get("entity_type") == "staff":
            return json_response({"found": False, "error": "Access denied. Teachers cannot access faculty records."}, status=403)
        return json_response({"found": True, "type": result.get("entity_type"), "data": result})
    else:
        return json_response({"found": False, "message": f"No student or staff found with ID or search query: '{target_id}'"}, status=404)

async def handle_suggestions(request):
    q = request.query.get("q", "").strip()
    if not q:
        return json_response([])
    user = get_current_user(request)
    include_staff = not (user and user.get("role") == "teacher")
    suggestions = db.quick_suggestions(q, limit=8, include_staff=include_staff)
    return json_response(suggestions)

# --- Authentication Endpoints ---
async def handle_login(request):
    try:
        data = await request.json()
    except Exception:
        return json_response({"error": "Invalid JSON payload"}, status=400)
    
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        return json_response({"error": "Username and password are required"}, status=400)
    
    user = db.authenticate_user(username, password)
    if not user:
        return json_response({"error": "Invalid credentials. Please verify username and password."}, status=401)
    
    token = db.create_session(user["id"], user["role"])
    return json_response({
        "success": True,
        "token": token,
        "user": user
    }, status=200, cookie_token=token)

async def handle_logout(request):
    token = ""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if not token:
        token = request.cookies.get("jmv_session", "")
    if token:
        db.delete_session(token)
    return json_response({"success": True, "message": "Logged out successfully"}, clear_cookie=True)

async def handle_me(request):
    user = get_current_user(request)
    if not user:
        return json_response({"authenticated": False, "user": None})
    return json_response({"authenticated": True, "user": user})

@web.middleware
async def account_required_middleware(request, handler):
    if request.path.startswith("/api/"):
        public_paths = {
            "/api/health",
            "/api/auth/login",
            "/api/auth/logout",
            "/api/auth/me",
            "/api/stats",
            "/api/templates/students.xlsx",
            "/api/templates/staff.xlsx"
        }
        if request.path not in public_paths:
            user = get_current_user(request)
            if not user:
                return json_response({
                    "error": "Authentication required. Please log in.",
                    "code": "AUTH_REQUIRED"
                }, status=401)
            if user.get("role") not in {"admin", "teacher"}:
                return json_response({
                    "error": "Access denied. Only teachers and administrators can view portal data.",
                    "code": "DATA_ACCESS_RESTRICTED"
                }, status=403)
    return await handler(request)

# --- Student Marks Endpoints (Role: Teachers & Admins) ---
async def handle_get_all_marks(request):
    term = request.query.get("term")
    year = request.query.get("year")
    search = request.query.get("search")
    marks = db.get_all_marks(term=term, year=year, search=search)
    return json_response(marks)

async def handle_get_marks(request):
    student_id = request.match_info.get("id")
    term = request.query.get("term")
    year = request.query.get("year")
    marks = db.get_student_marks(student_id, term=term, year=year)
    return json_response(marks)

async def handle_save_mark(request):
    user, err = require_role(request, ["admin", "teacher"])
    if err:
        return err
    student_id = request.match_info.get("id")
    try:
        data = await request.json()
        data["student_id"] = student_id
        updater = f"{user.get('full_name')} ({user.get('role').capitalize()})"
        saved = db.save_student_mark(data, updated_by=updater)
        return json_response(saved, status=200)
    except Exception as e:
        return json_response({"error": str(e)}, status=500)

async def handle_delete_mark(request):
    user, err = require_role(request, ["admin", "teacher"])
    if err:
        return err
    mark_id = request.match_info.get("mark_id")
    db.delete_student_mark(mark_id)
    return json_response({"success": True, "message": "Mark entry deleted successfully"})

# --- School Timetable Endpoints (Admins manage, Teachers & Admins view) ---
async def handle_get_timetable(request):
    user, err = require_role(request, ["admin", "teacher"])
    if err:
        return err
    teacher_id = request.query.get("teacher_id")
    class_name = request.query.get("class_name")
    return json_response(db.get_timetable(class_name=class_name, teacher_id=teacher_id))

async def handle_save_timetable_entry(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    try:
        data = await request.json()
        entry_id = request.match_info.get("entry_id")
        if entry_id:
            data["id"] = entry_id
        teacher_id = str(data.get("teacher_id", "")).strip()
        is_free = (not teacher_id or teacher_id.upper() in ("FREE", "NONE") or str(data.get("subject", "")).lower() in ("free", "free period"))
        if is_free:
            data["subject"] = "Free Period"
            data["teacher_id"] = "FREE"
            data["teacher_name"] = "Free Period"
        else:
            teacher = db.get_staff_by_id(teacher_id)
            if not teacher:
                for s in (db.get_all_staff() or []):
                    if (s.get("name_with_initials") and s["name_with_initials"].strip().lower() == teacher_id.lower()) or \
                       (s.get("full_name") and s["full_name"].strip().lower() == teacher_id.lower()):
                        teacher = s
                        break
            if teacher:
                data["teacher_id"] = teacher["id"]
                data["teacher_name"] = teacher.get("name_with_initials") or teacher["full_name"]
            elif not data.get("teacher_name"):
                return json_response({"error": f"Selected teacher ID '{teacher_id}' was not found."}, status=400)
        return json_response(db.save_timetable_entry(data), status=200)
    except (ValueError, TypeError) as exc:
        return json_response({"error": str(exc)}, status=400)
    except Exception as exc:
        return json_response({"error": str(exc)}, status=500)

async def handle_delete_timetable_entry(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    db.delete_timetable_entry(request.match_info.get("entry_id"))
    return json_response({"success": True, "message": "Timetable entry deleted successfully"})

# --- Students Endpoints ---
async def handle_get_students(request):
    # Both teachers and admins (and public portal lookup) can view student lists
    search = request.query.get("search")
    grade = request.query.get("grade")
    house = request.query.get("house")
    students = db.get_all_students(search=search, grade=grade, house=house)
    return json_response(students)

async def handle_get_student_by_id(request):
    student_id = request.match_info.get("id")
    student = db.get_student_by_id(student_id)
    if student:
        return json_response(student)
    return json_response({"error": "Student not found"}, status=404)

async def handle_create_student(request):
    # Strictly Admin only
    user, err = require_role(request, ["admin"])
    if err:
        return err
    try:
        data = await request.json()
        if not data.get("admission_no") or not data.get("name_with_initials"):
            return json_response({"error": "Missing required fields (admission_no, name_with_initials)"}, status=400)
        
        existing = db.get_student_by_id(data.get("admission_no"))
        if existing:
            return json_response({"error": f"Student with admission number '{data.get('admission_no')}' already exists"}, status=409)

        created = db.create_student(data, actor=user)
        return json_response(created, status=201)
    except Exception as e:
        return json_response({"error": str(e)}, status=500)

async def handle_update_student(request):
    # Strictly Admin only for core profile; teachers use /api/students/{id}/marks
    user, err = require_role(request, ["admin"])
    if err:
        return err
    student_id = request.match_info.get("id")
    try:
        data = await request.json()
        existing = db.get_student_by_id(student_id)
        if not existing:
            return json_response({"error": "Student not found"}, status=404)
        
        updated = db.update_student(student_id, data, actor=user)
        return json_response(updated)
    except Exception as e:
        return json_response({"error": str(e)}, status=500)

async def handle_delete_student(request):
    # Strictly Admin only
    user, err = require_role(request, ["admin"])
    if err:
        return err
    student_id = request.match_info.get("id")
    existing = db.get_student_by_id(student_id)
    if not existing:
        return json_response({"error": "Student not found"}, status=404)
    db.delete_student(student_id, actor=user)
    return json_response({"success": True, "message": f"Student {student_id} deleted successfully"})

# --- Staff Endpoints (Teachers cannot access staff data; Admins have full access) ---
async def handle_get_staff(request):
    user = get_current_user(request)
    if user and user.get("role") == "teacher":
        return json_response({
            "error": "Access restricted: Teacher accounts can only view and manage student academic data.",
            "code": "STAFF_RESTRICTED"
        }, status=403)
    
    search = request.query.get("search")
    department = request.query.get("department")
    role = request.query.get("role")
    staff = db.get_all_staff(search=search, department=department, role=role)
    return json_response(staff)

async def handle_get_staff_by_id(request):
    user = get_current_user(request)
    if user and user.get("role") == "teacher":
        return json_response({
            "error": "Access restricted: Teacher accounts can only view and manage student academic data.",
            "code": "STAFF_RESTRICTED"
        }, status=403)

    staff_id = request.match_info.get("id")
    staff_member = db.get_staff_by_id(staff_id)
    if staff_member:
        return json_response(staff_member)
    return json_response({"error": "Staff member not found"}, status=404)

async def handle_create_staff(request):
    # Strictly Admin only
    user, err = require_role(request, ["admin"])
    if err:
        return err
    try:
        data = await request.json()
        if not data.get("id") or not data.get("name_with_initials"):
            return json_response({"error": "Missing required fields (id, name_with_initials)"}, status=400)
        
        existing = db.get_staff_by_id(data.get("id"))
        if existing:
            return json_response({"error": f"Staff with ID '{data.get('id')}' already exists"}, status=409)

        created = db.create_staff(data, actor=user)
        return json_response(created, status=201)
    except Exception as e:
        return json_response({"error": str(e)}, status=500)

async def handle_update_staff(request):
    # Strictly Admin only
    user, err = require_role(request, ["admin"])
    if err:
        return err
    staff_id = request.match_info.get("id")
    try:
        data = await request.json()
        existing = db.get_staff_by_id(staff_id)
        if not existing:
            return json_response({"error": "Staff member not found"}, status=404)
        
        updated = db.update_staff(staff_id, data, actor=user)
        return json_response(updated)
    except Exception as e:
        return json_response({"error": str(e)}, status=500)

async def handle_delete_staff(request):
    # Strictly Admin only
    user, err = require_role(request, ["admin"])
    if err:
        return err
    staff_id = request.match_info.get("id")
    existing = db.get_staff_by_id(staff_id)
    if not existing:
        return json_response({"error": "Staff member not found"}, status=404)
    db.delete_staff(staff_id, actor=user)
    return json_response({"success": True, "message": f"Staff member {staff_id} deleted successfully"})


# --- Bulk Excel Upload & Template Download Endpoints ---
async def _extract_uploaded_spreadsheet(request):
    """Extract (file_bytes, filename, mode) from either JSON base64 payload or multipart upload."""
    content_type = request.headers.get("Content-Type", "")
    mode = request.query.get("mode", "upsert")
    filename = "upload.xlsx"
    file_bytes = b""

    if "multipart/form-data" in content_type:
        reader = await request.multipart()
        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == "file":
                filename = part.filename or filename
                file_bytes = await part.read(decode=False)
            elif part.name == "mode":
                mode = (await part.text()).strip() or "upsert"
    else:
        data = await request.json()
        filename = data.get("filename", filename)
        mode = data.get("mode", mode)
        b64 = data.get("file_base64", "")
        if "," in b64 and b64.startswith("data:"):
            b64 = b64.split(",", 1)[1]
        if b64:
            file_bytes = base64.b64decode(b64)

    return file_bytes, filename, mode


async def handle_download_student_template(request):
    xlsx_bytes = excel_utils.generate_student_template_xlsx()
    return web.Response(
        body=xlsx_bytes,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="JMV_Student_Bulk_Upload_Template.xlsx"',
            "Cache-Control": "no-cache"
        }
    )


async def handle_download_staff_template(request):
    xlsx_bytes = excel_utils.generate_staff_template_xlsx()
    return web.Response(
        body=xlsx_bytes,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="JMV_Teachers_Staff_Bulk_Upload_Template.xlsx"',
            "Cache-Control": "no-cache"
        }
    )


async def handle_bulk_upload_students(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    try:
        file_bytes, filename, mode = await _extract_uploaded_spreadsheet(request)
        rows_2d = excel_utils.parse_spreadsheet_bytes(file_bytes, filename)
        mapped = excel_utils.map_rows_to_student_dicts(rows_2d)
        summary = db.bulk_upsert_students(mapped, mode=mode, actor=user)
        return json_response({"success": True, **summary})
    except ValueError as ve:
        return json_response({"error": str(ve)}, status=400)
    except Exception as exc:
        return json_response({"error": f"Failed to process Excel file: {exc}"}, status=500)


async def handle_bulk_upload_staff(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    try:
        file_bytes, filename, mode = await _extract_uploaded_spreadsheet(request)
        rows_2d = excel_utils.parse_spreadsheet_bytes(file_bytes, filename)
        mapped = excel_utils.map_rows_to_staff_dicts(rows_2d)
        summary = db.bulk_upsert_staff(mapped, mode=mode, actor=user)
        return json_response({"success": True, **summary})
    except ValueError as ve:
        return json_response({"error": str(ve)}, status=400)
    except Exception as exc:
        return json_response({"error": f"Failed to process Excel file: {exc}"}, status=500)


async def handle_get_audit_log(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    rows = db.get_audit_log(
        entity_type=request.query.get("entity_type"),
        entity_id=request.query.get("entity_id"),
        limit=request.query.get("limit", 200),
    )
    return json_response(rows)


async def handle_get_subjects(request):
    category = request.query.get("category")
    return json_response(db.get_all_subjects(category=category))


async def handle_get_payments(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    search = request.query.get("search")
    status = request.query.get("status")
    grade = request.query.get("grade")
    rows = db.get_all_payments(search=search, status=status, grade=grade)
    return json_response(rows)


async def handle_get_payment_stats(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    stats = db.get_payment_stats()
    return json_response(stats)


async def handle_create_payment(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    try:
        data = await request.json()
        if not data.get("student_name") or not data.get("amount"):
            return json_response({"error": "Student Name and Amount are required."}, status=400)
        res = db.create_payment(data, actor=user)
        return json_response(res, status=201)
    except Exception as e:
        return json_response({"error": str(e)}, status=500)


async def handle_delete_payment(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    pay_id = request.match_info.get("id")
    ok = db.delete_payment(pay_id, actor=user)
    if not ok:
        return json_response({"error": "Payment record not found"}, status=404)
    return json_response({"success": True})


async def handle_reset_demo(request):
    db.reset_to_demo_data()
    return json_response({"success": True, "message": "Database reset to official JMV-Web sample records."})

async def handle_health(request):
    ok, message = db.check_connection()
    status_info = db.get_engine_status()
    DB_STATE.update(ok=ok, message=message)
    return json_response({
        "status": "ok",
        "active_engine": status_info.get("engine", "sqlite"),
        "mariadb_connected": ok,
        "message": message,
        "details": status_info
    }, status=200)


@web.middleware
async def db_error_middleware(request, handler):
    """Turn database failures into clear JSON errors instead of crashing requests."""
    try:
        return await handler(request)
    except web.HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        if request.path.startswith("/api/"):
            return json_response({"error": "Database unavailable", "detail": str(e)}, status=503)
        raise


@web.middleware
async def static_cache_and_compression_middleware(request, handler):
    resp = await handler(request)
    if hasattr(resp, "enable_compression"):
        resp.enable_compression()
    if request.path.startswith("/static/"):
        resp.headers["Cache-Control"] = "public, max-age=86400"
        resp.headers["Vary"] = "Accept-Encoding"
    return resp

def init_app():
    try:
        db.init_db()
    except Exception as e:
        print(f"[DB INIT ERROR] {e}")

    ok, message = db.check_connection()
    DB_STATE.update(ok=ok, message=message)
    print(("[DB] " if ok else "[DB NOTE] ") + message)

    app = web.Application(middlewares=[
        static_cache_and_compression_middleware,
        account_required_middleware,
        db_error_middleware
    ])

    # API Routes
    app.router.add_get("/", handle_index)
    app.router.add_get("/api/health", handle_health)
    app.router.add_get("/api/stats", handle_stats)
    app.router.add_get("/api/lookup", handle_lookup)
    app.router.add_get("/api/suggestions", handle_suggestions)

    # Auth Routes
    app.router.add_post("/api/auth/login", handle_login)
    app.router.add_post("/api/auth/logout", handle_logout)
    app.router.add_get("/api/auth/me", handle_me)

    # Student Marks Routes (Teachers & Admins)
    app.router.add_get("/api/marks", handle_get_all_marks)
    app.router.add_get("/api/students/{id}/marks", handle_get_marks)
    app.router.add_post("/api/students/{id}/marks", handle_save_mark)
    app.router.add_delete("/api/students/{id}/marks/{mark_id}", handle_delete_mark)

    app.router.add_get("/api/timetable", handle_get_timetable)
    app.router.add_post("/api/timetable", handle_save_timetable_entry)
    app.router.add_put("/api/timetable/{entry_id}", handle_save_timetable_entry)
    app.router.add_delete("/api/timetable/{entry_id}", handle_delete_timetable_entry)

    app.router.add_get("/api/subjects", handle_get_subjects)
    app.router.add_get("/api/templates/students.xlsx", handle_download_student_template)
    app.router.add_get("/api/templates/staff.xlsx", handle_download_staff_template)
    app.router.add_post("/api/students/bulk", handle_bulk_upload_students)
    app.router.add_post("/api/staff/bulk", handle_bulk_upload_staff)

    app.router.add_get("/api/students", handle_get_students)
    app.router.add_get("/api/students/{id}", handle_get_student_by_id)
    app.router.add_get("/api/audit", handle_get_audit_log)
    app.router.add_post("/api/students", handle_create_student)
    app.router.add_put("/api/students/{id}", handle_update_student)
    app.router.add_delete("/api/students/{id}", handle_delete_student)

    app.router.add_get("/api/staff", handle_get_staff)
    app.router.add_get("/api/staff/{id}", handle_get_staff_by_id)
    app.router.add_post("/api/staff", handle_create_staff)
    app.router.add_put("/api/staff/{id}", handle_update_staff)
    app.router.add_delete("/api/staff/{id}", handle_delete_staff)

    # Payments Routes (Admin only)
    app.router.add_get("/api/payments", handle_get_payments)
    app.router.add_get("/api/payments/stats", handle_get_payment_stats)
    app.router.add_post("/api/payments", handle_create_payment)
    app.router.add_delete("/api/payments/{id}", handle_delete_payment)

    app.router.add_post("/api/reset-demo", handle_reset_demo)

    # Static assets
    app.router.add_static("/static/", path=STATIC_DIR, name="static")

    return app

# --- Builtin HTTP Server Implementation (Fallback when aiohttp is unavailable) ---
class PortalBuiltinHTTPHandler(BaseHTTPRequestHandler):
    server_version = "JMVPortalServer/1.0"

    def log_message(self, format, *args):
        # Compact access log
        sys.stderr.write(f"[{self.log_date_time_string()}] {self.command} {self.path} {args[1] if len(args) > 1 else ''}\n")

    def send_json(self, data, status=200, cookie_token=None, clear_cookie=False):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        if cookie_token:
            self.send_header("Set-Cookie", f"jmv_session={cookie_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800")
        if clear_cookie:
            self.send_header("Set-Cookie", "jmv_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, file_path, content_type=None, as_attachment=None):
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            self.send_error(404, "File not found")
            return
        if not content_type:
            content_type, _ = mimetypes.guess_type(file_path)
            content_type = content_type or "application/octet-stream"

        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            if as_attachment:
                self.send_header("Content-Disposition", f'attachment; filename="{as_attachment}"')
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0:
                return {}
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def get_user(self):
        token = ""
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:].strip()
        if not token:
            cookie_header = self.headers.get("Cookie", "")
            if cookie_header:
                c = cookies.SimpleCookie()
                try:
                    c.load(cookie_header)
                    if "jmv_session" in c:
                        token = c["jmv_session"].value
                except Exception:
                    pass
        if not token:
            return None
        return db.validate_session(token)

    def require_role(self, allowed_roles):
        user = self.get_user()
        if not user:
            self.send_json({"error": "Authentication required. Please log in.", "code": "AUTH_REQUIRED"}, 401)
            return None
        if user.get("role") not in allowed_roles:
            self.send_json({
                "error": f"Access denied. Requires one of roles: {', '.join(allowed_roles)}. Your role is '{user.get('role')}'.",
                "code": "FORBIDDEN",
                "user_role": user.get("role")
            }, 403)
            return None
        return user

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)
        def q(name, default=""):
            return qs.get(name, [default])[0]

        # Root and static files
        if path == "/" or path == "/index.html":
            self.send_file(os.path.join(STATIC_DIR, "index.html"), "text/html; charset=utf-8")
            return
        if path.startswith("/static/"):
            rel = path[len("/static/"):].lstrip("/")
            file_path = os.path.join(STATIC_DIR, rel)
            self.send_file(file_path)
            return

        # Public endpoints
        if path == "/api/health":
            ok, message = db.check_connection()
            status_info = db.get_engine_status()
            self.send_json({
                "status": "ok",
                "active_engine": status_info.get("engine", "sqlite"),
                "mariadb_connected": ok,
                "message": message,
                "details": status_info
            })
            return
        if path == "/api/stats":
            self.send_json(db.get_system_stats())
            return
        if path == "/api/auth/me":
            user = self.get_user()
            self.send_json({"authenticated": bool(user), "user": user})
            return
        if path == "/api/templates/students.xlsx":
            try:
                buf = excel_utils.generate_student_template_xlsx()
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                self.send_header("Content-Length", str(len(buf)))
                self.send_header("Content-Disposition", 'attachment; filename="JMV_Student_Bulk_Upload_Template.xlsx"')
                self.end_headers()
                self.wfile.write(buf)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return
        if path == "/api/templates/staff.xlsx":
            try:
                buf = excel_utils.generate_staff_template_xlsx()
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                self.send_header("Content-Length", str(len(buf)))
                self.send_header("Content-Disposition", 'attachment; filename="JMV_Teachers_Staff_Bulk_Upload_Template.xlsx"')
                self.end_headers()
                self.wfile.write(buf)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return

        # Auth-gated endpoints
        user = self.get_user()
        if not user:
            self.send_json({"error": "Authentication required. Please log in.", "code": "AUTH_REQUIRED"}, 401)
            return
        if user.get("role") not in ("admin", "teacher"):
            self.send_json({"error": "Access denied.", "code": "FORBIDDEN"}, 403)
            return

        if path == "/api/lookup":
            target_id = q("id").strip()
            if not target_id:
                self.send_json({"found": False, "error": "ID parameter is required"}, 400)
                return
            result = db.universal_id_search(target_id)
            if result:
                if user.get("role") == "teacher" and result.get("entity_type") == "staff":
                    self.send_json({"found": False, "error": "Access denied. Teachers cannot access faculty records."}, 403)
                    return
                self.send_json({"found": True, "type": result.get("entity_type"), "data": result})
            else:
                self.send_json({"found": False, "message": f"No student or staff found with ID: '{target_id}'"}, 404)
            return

        if path == "/api/suggestions":
            query_str = q("q").strip()
            include_staff = (user.get("role") != "teacher")
            self.send_json(db.quick_suggestions(query_str, limit=8, include_staff=include_staff))
            return

        if path == "/api/marks":
            self.send_json(db.get_all_marks(term=q("term") or None, year=q("year") or None, search=q("search") or None))
            return

        m = re.match(r"^/api/students/([^/]+)/marks$", path)
        if m:
            self.send_json(db.get_student_marks(m.group(1), term=q("term") or None, year=q("year") or None))
            return

        if path == "/api/timetable":
            self.send_json(db.get_timetable(class_name=q("class_name") or None, teacher_id=q("teacher_id") or None))
            return

        if path == "/api/subjects":
            self.send_json(db.get_all_subjects(category=q("category") or None))
            return

        if path == "/api/students":
            self.send_json(db.get_all_students(search=q("search") or None, grade=q("grade") or None, house=q("house") or None))
            return

        m = re.match(r"^/api/students/([^/]+)$", path)
        if m:
            st = db.get_student_by_id(m.group(1))
            if st:
                self.send_json(st)
            else:
                self.send_json({"error": "Student not found"}, 404)
            return

        if path == "/api/staff":
            if user.get("role") == "teacher":
                self.send_json({"error": "Access restricted: Teachers cannot view staff records.", "code": "STAFF_RESTRICTED"}, 403)
                return
            self.send_json(db.get_all_staff(search=q("search") or None, department=q("department") or None, role=q("role") or None))
            return

        m = re.match(r"^/api/staff/([^/]+)$", path)
        if m:
            if user.get("role") == "teacher":
                self.send_json({"error": "Access restricted", "code": "STAFF_RESTRICTED"}, 403)
                return
            stf = db.get_staff_by_id(m.group(1))
            if stf:
                self.send_json(stf)
            else:
                self.send_json({"error": "Staff member not found"}, 404)
            return

        if path == "/api/payments":
            if user.get("role") != "admin":
                self.send_json({"error": "Access restricted: Admins only", "code": "FORBIDDEN"}, 403)
                return
            self.send_json(db.get_all_payments(search=q("search") or None, status=q("status") or None, grade=q("grade") or None))
            return

        if path == "/api/payments/stats":
            if user.get("role") != "admin":
                self.send_json({"error": "Access restricted: Admins only", "code": "FORBIDDEN"}, 403)
                return
            self.send_json(db.get_payment_stats())
            return

        if path == "/api/audit":
            if user.get("role") != "admin":
                self.send_json({"error": "Access restricted: Admins only", "code": "FORBIDDEN"}, 403)
                return
            self.send_json(db.get_audit_log(entity_type=q("entity_type") or None, entity_id=q("entity_id") or None, limit=int(q("limit", 200))))
            return

        self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()

        if path == "/api/auth/login":
            u = str(body.get("username", "")).strip()
            p = str(body.get("password", "")).strip()
            if not u or not p:
                self.send_json({"error": "Username and password required"}, 400)
                return
            user = db.authenticate_user(u, p)
            if not user:
                self.send_json({"error": "Invalid credentials. Please verify username and password."}, 401)
                return
            tok = db.create_session(user["id"], user["role"])
            self.send_json({"success": True, "token": tok, "user": user}, 200, cookie_token=tok)
            return

        if path == "/api/auth/logout":
            token = ""
            auth = self.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:].strip()
            if not token:
                cookie_header = self.headers.get("Cookie", "")
                if cookie_header:
                    c = cookies.SimpleCookie()
                    try:
                        c.load(cookie_header)
                        if "jmv_session" in c:
                            token = c["jmv_session"].value
                    except Exception:
                        pass
            if token:
                db.delete_session(token)
            self.send_json({"success": True}, 200, clear_cookie=True)
            return

        if path == "/api/reset-demo":
            db.reset_to_demo_data()
            self.send_json({"success": True, "message": "Database reset to official JMV-Web sample records."})
            return

        # Gated routes
        user = self.get_user()
        if not user:
            self.send_json({"error": "Authentication required.", "code": "AUTH_REQUIRED"}, 401)
            return

        m = re.match(r"^/api/students/([^/]+)/marks$", path)
        if m:
            body["student_id"] = m.group(1)
            updater = f"{user.get('full_name')} ({user.get('role').capitalize()})"
            saved = db.save_student_mark(body, updated_by=updater)
            self.send_json(saved, 200)
            return

        # Admin only POST routes
        if user.get("role") != "admin":
            self.send_json({"error": "Access denied. Admin required.", "code": "FORBIDDEN"}, 403)
            return

        if path == "/api/timetable":
            self.send_json(db.save_timetable_entry(body), 200)
            return

        if path == "/api/students":
            if not body.get("admission_no") or not body.get("name_with_initials"):
                self.send_json({"error": "Missing required fields (admission_no, name_with_initials)"}, 400)
                return
            if db.get_student_by_id(body.get("admission_no")):
                self.send_json({"error": "Admission number already exists"}, 409)
                return
            created = db.create_student(body, actor=user)
            self.send_json(created, 201)
            return

        if path == "/api/staff":
            if not body.get("id") or not body.get("name_with_initials"):
                self.send_json({"error": "Missing required fields (id, name_with_initials)"}, 400)
                return
            if db.get_staff_by_id(body.get("id")):
                self.send_json({"error": "Staff with ID already exists"}, 409)
                return
            created = db.create_staff(body, actor=user)
            self.send_json(created, 201)
            return

        if path == "/api/payments":
            if not body.get("student_name") or not body.get("amount"):
                self.send_json({"error": "Student Name and Amount are required."}, 400)
                return
            p = db.create_payment(body, actor=user)
            self.send_json(p, 201)
            return

        self.send_error(404, "Not Found")

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()
        user = self.require_role(["admin"])
        if not user:
            return

        m = re.match(r"^/api/timetable/([^/]+)$", path)
        if m:
            body["id"] = m.group(1)
            self.send_json(db.save_timetable_entry(body), 200)
            return

        m = re.match(r"^/api/students/([^/]+)$", path)
        if m:
            st_id = m.group(1)
            if not db.get_student_by_id(st_id):
                self.send_json({"error": "Student not found"}, 404)
                return
            updated = db.update_student(st_id, body, actor=user)
            self.send_json(updated, 200)
            return

        m = re.match(r"^/api/staff/([^/]+)$", path)
        if m:
            stf_id = m.group(1)
            if not db.get_staff_by_id(stf_id):
                self.send_json({"error": "Staff not found"}, 404)
                return
            updated = db.update_staff(stf_id, body, actor=user)
            self.send_json(updated, 200)
            return

        self.send_error(404, "Not Found")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        m = re.match(r"^/api/students/[^/]+/marks/([^/]+)$", path)
        if m:
            user = self.require_role(["admin", "teacher"])
            if not user:
                return
            db.delete_student_mark(m.group(1))
            self.send_json({"success": True})
            return

        user = self.require_role(["admin"])
        if not user:
            return

        m = re.match(r"^/api/timetable/([^/]+)$", path)
        if m:
            db.delete_timetable_entry(m.group(1))
            self.send_json({"success": True})
            return

        m = re.match(r"^/api/students/([^/]+)$", path)
        if m:
            db.delete_student(m.group(1), actor=user)
            self.send_json({"success": True})
            return

        m = re.match(r"^/api/staff/([^/]+)$", path)
        if m:
            db.delete_staff(m.group(1), actor=user)
            self.send_json({"success": True})
            return

        m = re.match(r"^/api/payments/([^/]+)$", path)
        if m:
            ok = db.delete_payment(m.group(1), actor=user)
            if not ok:
                self.send_json({"error": "Payment not found"}, 404)
                return
            self.send_json({"success": True})
            return

        self.send_error(404, "Not Found")


def run_builtin_server(host="0.0.0.0", port=8000):
    try:
        db.init_db()
    except Exception as e:
        print(f"[DB INIT ERROR] {e}")

    ok, message = db.check_connection()
    DB_STATE.update(ok=ok, message=message)
    print(("[DB] " if ok else "[DB NOTE] ") + message)

    server = ThreadingHTTPServer((host, port), PortalBuiltinHTTPHandler)
    print("=" * 65)
    print(" Jayakody Maha Vidyalaya (ජයකොඩි මහා විද්‍යාලය) Portal")
    print(" Theme: JMV-Web Royal Maroon & Imperial Gold")
    print(f" Engine: Built-in Multithreaded HTTP Server")
    print(f" Portal hosted locally at: http://localhost:{port}")
    print("=" * 65)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down portal server...")
        server.server_close()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    if HAS_AIOHTTP:
        app = init_app()
        print("=" * 60)
        print(" Jayakody Maha Vidyalaya (ජයකොඩි මහා විද්‍යාලය) Portal")
        print(" Theme: JMV-Web Royal Maroon & Imperial Gold")
        print(f" Server running at: http://localhost:{port}")
        print("=" * 60)
        web.run_app(app, host="0.0.0.0", port=port)
    else:
        run_builtin_server(host="0.0.0.0", port=port)
