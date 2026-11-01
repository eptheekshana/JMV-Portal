#!/usr/bin/env python3
"""
Jayakody Maha Vidyalaya - School Database Portal Web Server
Provides REST API endpoints and static file serving using aiohttp.
Theme & Reference: JMV-Web (Royal Maroon & Imperial Gold)
"""

import os
import json
from aiohttp import web
import db

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
    """Extract and validate session from Authorization header or cookie."""
    token = ""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if not token:
        token = request.cookies.get("jmv_session", "")
    if not token:
        return None
    return db.validate_session(token)

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
        return web.Response(
            text=content,
            content_type="text/html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache"
            }
        )
    return web.Response(text="Index file not found", status=404)

async def handle_stats(request):
    stats = db.get_system_stats()
    return json_response(stats)

async def handle_lookup(request):
    target_id = request.query.get("id", "").strip()
    if not target_id:
        return json_response({"found": False, "error": "ID parameter is required"}, status=400)
    
    result = db.universal_id_search(target_id)
    if result:
        return json_response({"found": True, "type": result.get("entity_type"), "data": result})
    else:
        return json_response({"found": False, "message": f"No student or staff found with ID or search query: '{target_id}'"}, status=404)

async def handle_suggestions(request):
    q = request.query.get("q", "").strip()
    if not q:
        return json_response([])
    suggestions = db.quick_suggestions(q, limit=8)
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
            "/api/auth/me"
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

# --- School Timetable Endpoints (Admin only) ---
async def handle_get_timetable(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    return json_response(db.get_timetable(request.query.get("class_name")))

async def handle_save_timetable_entry(request):
    user, err = require_role(request, ["admin"])
    if err:
        return err
    try:
        data = await request.json()
        teacher_id = str(data.get("teacher_id", "")).strip()
        teacher = db.get_staff_by_id(teacher_id)
        if not teacher:
            return json_response({"error": "Selected teacher was not found."}, status=400)
        data["teacher_id"] = teacher["id"]
        data["teacher_name"] = teacher["name_with_initials"] or teacher["full_name"]
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
        if not data.get("admission_no") or not data.get("full_name"):
            return json_response({"error": "Missing required fields (admission_no, full_name)"}, status=400)
        
        existing = db.get_student_by_id(data.get("admission_no"))
        if existing:
            return json_response({"error": f"Student with admission number '{data.get('admission_no')}' already exists"}, status=409)

        created = db.create_student(data)
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
        
        updated = db.update_student(student_id, data)
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
    db.delete_student(student_id)
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
        if not data.get("id") or not data.get("epf_no") or not data.get("full_name"):
            return json_response({"error": "Missing required fields (id, epf_no, full_name)"}, status=400)
        
        existing = db.get_staff_by_id(data.get("id"))
        if existing:
            return json_response({"error": f"Staff with ID '{data.get('id')}' already exists"}, status=409)

        created = db.create_staff(data)
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
        
        updated = db.update_staff(staff_id, data)
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
    db.delete_staff(staff_id)
    return json_response({"success": True, "message": f"Staff member {staff_id} deleted successfully"})

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


def init_app():
    try:
        db.init_db()
    except Exception as e:
        print(f"[DB INIT ERROR] {e}")

    ok, message = db.check_connection()
    DB_STATE.update(ok=ok, message=message)
    print(("[DB] " if ok else "[DB NOTE] ") + message)

    app = web.Application(middlewares=[account_required_middleware, db_error_middleware])

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

    app.router.add_get("/api/students", handle_get_students)
    app.router.add_get("/api/students/{id}", handle_get_student_by_id)
    app.router.add_post("/api/students", handle_create_student)
    app.router.add_put("/api/students/{id}", handle_update_student)
    app.router.add_delete("/api/students/{id}", handle_delete_student)

    app.router.add_get("/api/staff", handle_get_staff)
    app.router.add_get("/api/staff/{id}", handle_get_staff_by_id)
    app.router.add_post("/api/staff", handle_create_staff)
    app.router.add_put("/api/staff/{id}", handle_update_staff)
    app.router.add_delete("/api/staff/{id}", handle_delete_staff)

    app.router.add_post("/api/reset-demo", handle_reset_demo)

    # Static assets
    app.router.add_static("/static/", path=STATIC_DIR, name="static")

    return app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app = init_app()
    print("=" * 60)
    print(" Jayakody Maha Vidyalaya (ජයකොඩි මහා විද්‍යාලය) Portal")
    print(" Theme: JMV-Web Royal Maroon & Imperial Gold")
    print(f" Server running at: http://localhost:{port}")
    print("=" * 60)
    web.run_app(app, host="0.0.0.0", port=port)
