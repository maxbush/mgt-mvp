"""Контрольные примеры ТЗ (порт src/lib/tests.ts — 16 проверок) + API-тесты прав.

Запуск: python manage.py test apps.core
"""
from decimal import Decimal

from django.contrib.auth.models import Group as AuthGroup
from django.test import Client, TestCase

from apps.core.calc import (
    act_amounts, int_words, is_chargeable, month_row_k, norm_contract_no, price_on,
    round_half_up, rub_words, similarity_pct, split_even,
)


class _Pol:
    def __init__(self, a=True, s=False, e=False):
        self.charge_absent, self.charge_sick, self.charge_excused = a, s, e


class CalcPortTests(TestCase):
    """Чистая арифметика — порты calc.ts (без БД)."""

    def test_act_amounts(self):
        """Акт: 2 занятия × 46,52 → 93,04; налоги 12,10 и 0,93; к выплате 80,01."""
        r = act_amounts(2, Decimal("46.52"))
        self.assertEqual((r["gross"], r["income_tax"], r["fszn"], r["net"]),
                         (Decimal("93.04"), Decimal("12.10"), Decimal("0.93"), Decimal("80.01")))

    def test_round_half_up(self):
        """3,50 × 13% = 0,455 → 0,46; 3,50 × 1% = 0,035 → 0,04."""
        r = act_amounts(1, Decimal("3.5"))
        self.assertEqual((r["income_tax"], r["fszn"]), (Decimal("0.46"), Decimal("0.04")))
        self.assertEqual(round_half_up(Decimal("45.5")), Decimal("46"))

    def test_price_on(self):
        """Цена по дате занятия: до 01.10 — 30, с 01.10 — 35."""
        pr = [{"from": "2026-09-01", "price": 30}, {"from": "2026-10-01", "price": 35}]
        self.assertEqual([price_on(pr, "2026-09-30"), price_on(pr, "2026-10-01"), price_on(pr, "2026-10-22")], [30, 35, 35])

    def test_chargeable(self):
        """Н списывается по умолчанию, Б и У — нет; пусто — никогда."""
        d = _Pol()
        a = [is_chargeable(x, d) for x in ("present", "absent", "sick", "excused", None)]
        b = [is_chargeable("absent", _Pol(a=False)), is_chargeable("excused", _Pol(e=True))]
        self.assertEqual((a, b), ([True, True, False, False, False], [False, True]))

    def test_month_row(self):
        """Конец = начало + сдано − израсходовано; конец месяца = начало следующего."""
        e = [
            {"date": "2026-08-31", "type": "open", "amount": -3000},
            {"date": "2026-10-02", "type": "pay", "amount": 24000},
            {"date": "2026-10-05", "type": "charge", "amount": -3000},
            {"date": "2026-10-07", "type": "charge", "amount": -3000},
            {"date": "2026-11-03", "type": "adj", "amount": -500},
        ]
        o, n = month_row_k(e, "2026-10"), month_row_k(e, "2026-11")
        self.assertEqual((o["start"], o["paid"], o["spent"], o["end"], n["start"]), (-3000, 24000, 6000, 15000, 15000))

    def test_negative_balance(self):
        """Отрицательный остаток допустим и переносится (−30 → −230)."""
        r = month_row_k([
            {"date": "2026-09-30", "type": "adj", "amount": -3000},
            {"date": "2026-10-05", "type": "charge", "amount": -20000},
        ], "2026-10")
        self.assertEqual((r["start"], r["end"]), (-3000, -23000))

    def test_similarity(self):
        """«Федор» = «Фёдор» (100%); «Лисавский» ≈ «Лисовский» (<100%, ≥85)."""
        a = similarity_pct("Мацкевич Федор", "Мацкевич Фёдор")
        b = similarity_pct("Лисавский Кирилл", "Лисовский Кирилл")
        self.assertEqual(a, 100)
        self.assertTrue(85 <= b < 100, f"b={b}")

    def test_rub_words(self):
        self.assertEqual(rub_words(9304), "Девяносто три белорусских рубля, 04 копейки")
        self.assertEqual(rub_words(8001), "Восемьдесят белорусских рублей, 01 копейка")
        self.assertEqual(int_words(2000), "две тысячи")

    def test_split_even(self):
        """Доли в сумме дают ровно сумму платежа."""
        a = split_even(12001, 2)
        self.assertEqual((sum(a), a), (12001, [6000, 6001]))

    def test_contract_norm(self):
        """03Э = 03э (в рамках года)."""
        self.assertEqual(norm_contract_no("03Э"), norm_contract_no("03э"))


class SeedDataTests(TestCase):
    """Проверки на демо-данных (порт «Данные:» тестов из tests.ts)."""

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command
        call_command("seed_demo", verbosity=0)

    def test_contract_conflict(self):
        """Номер 03э занят в 2026/27 (Иванов Пётр), свободен в 2025/26."""
        from apps.dictionaries.models import AcademicYear
        from apps.students.views import contract_conflict

        y26 = AcademicYear.objects.get(name="2026/2027")
        y25 = AcademicYear.objects.get(name="2025/2026")
        c = contract_conflict("03э", str(y26.id))
        self.assertIsNotNone(c)
        self.assertIn("Иванов", c["message"])
        self.assertIn("27.09.2026", c["message"])
        self.assertIsNone(contract_conflict("03э", str(y25.id)))

    def test_ledger_vs_statement(self):
        """«Конец месяца» ведомости = остаток по проводкам для каждого ученика и месяца."""
        from apps.finance.services import balance_row, ledger_entries
        from apps.students.models import Student

        bad = []
        for st in Student.objects.all():
            for m in ("2026-09", "2026-10"):
                r = balance_row(st.id, m)
                led = sum(e["amount"] for e in ledger_entries(st.id) if e["date"] <= f"{m}-31") / 100
                if abs(r["closing"] - led) > 0.001 or abs(r["opening"] + r["paid"] - r["consumed"] - r["closing"]) > 0.001:
                    bad.append(f"{st.last_name} {m}")
        self.assertEqual(bad, [], f"Расхождения: {bad[:3]}")

    def test_statement_totals(self):
        """Итоги листа ведомости = сумме строк, формула итога сходится."""
        from apps.dictionaries.models import StatementSheet
        from apps.finance.services import statement_rows, statement_totals

        sheet = StatementSheet.objects.order_by("order")[1]
        rows = statement_rows(sheet, "2026-10")
        tt = statement_totals(rows)
        self.assertAlmostEqual(tt["opening"] + tt["paid"] - tt["consumed"] - tt["closing"], 0, places=2)

    def test_act_krupenya(self):
        """У Крупени — 2 проведённых занятия в сентябре, к выплате 80,01."""
        from apps.staff.models import Act, Teacher

        act = Act.objects.get(teacher__last_name="Крупеня", month="2026-09")
        self.assertEqual((act.lessons_count, str(act.gross), str(act.net)), (2, "93.04", "80.01"))

    def test_two_groups_one_balance(self):
        """Ученик в двух группах (э1 + р2) имеет один остаток."""
        from apps.finance.services import current_balance
        from apps.students.models import Student

        s = Student.objects.get(last_name="Кравчук")
        self.assertIsNotNone(float(current_balance(s.id)))


class ApiAuthTests(TestCase):
    """Права по ролям (эндпоинт × роль)."""

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command
        call_command("seed_demo", verbosity=0)

    def _login(self, name, pwd):
        from apps.core.models import User
        c = Client()
        c.force_login(User.objects.get(username=name))
        return c

    def test_health_open(self):
        self.assertEqual(Client().get("/api/v1/health").status_code, 200)

    def test_me_requires_auth(self):
        self.assertEqual(Client().get("/api/v1/auth/me").status_code, 403)

    def test_admin_me(self):
        c = self._login("admin", "admin123")
        r = c.get("/api/v1/auth/me")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["role"], "admin")
        self.assertIn("2026-09", r.json()["closed_months"])

    def test_teacher_cannot_edit_others_lesson(self):
        """Преподаватель t1 не может править отметки в чужой группе (g_e2 → t2)."""
        from apps.journal.models import Lesson
        c = self._login("teacher", "teacher123")
        l = Lesson.objects.get(group__code="э2", date="2026-10-01")
        r = c.put(f"/api/v1/lessons/{l.id}/attendance/", data={"marks": {}}, content_type="application/json")
        self.assertIn(r.status_code, (403, 423))

    def test_teacher_cannot_edit_closed_month(self):
        from apps.journal.models import Lesson
        c = self._login("teacher", "teacher123")
        l = Lesson.objects.filter(group__code="э1", date__startswith="2026-09").first()
        r = c.put(f"/api/v1/lessons/{l.id}/attendance/", data={"marks": {}}, content_type="application/json")
        self.assertEqual(r.status_code, 423)
        self.assertEqual(r.json()["error"]["code"], "month_closed")

    def test_accountant_readonly_journal(self):
        from apps.journal.models import Lesson
        c = self._login("accountant", "account123")
        from apps.groups.models import Group
        g = Group.objects.get(code="э2")
        self.assertEqual(c.get(f"/api/v1/journal?group={g.id}&month=2026-10").status_code, 200)
        l = Lesson.objects.filter(date__startswith="2026-10").first()
        r = c.put(f"/api/v1/lessons/{l.id}/attendance/", data={"marks": {}}, content_type="application/json")
        self.assertIn(r.status_code, (403, 423))

    def test_teacher_scope_only_own_groups(self):
        c = self._login("teacher", "teacher123")
        r = c.get("/api/v1/groups/")
        self.assertEqual(r.status_code, 200)
        codes = {g["code"] for g in r.json()["results"]}
        # t1 ведёт э1 и IT-1 + замены в э2
        self.assertTrue(codes <= {"э1", "IT-1", "э2"}, codes)

    def test_contract_duplicate_409(self):
        c = self._login("admin", "admin123")
        from apps.students.models import Student
        from apps.dictionaries.models import AcademicYear
        st = Student.objects.get(last_name="Адамович")
        y = AcademicYear.objects.get(name="2026/2027")
        r = c.post(f"/api/v1/students/{st.id}/contracts/", data={
            "academic_year": str(y.id), "number": "03э", "date": "2026-10-01", "status": "active",
        }, content_type="application/json")
        self.assertEqual(r.status_code, 409)
        self.assertIn("Иванов", r.json()["error"]["message"])

    def test_payment_pending_queue(self):
        c = self._login("admin", "admin123")
        r = c.get("/api/v1/payments/pending/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 3)

    def test_audit_written_on_student_create(self):
        from apps.core.models import AuditLog
        c = self._login("admin", "admin123")
        before = AuditLog.objects.count()
        r = c.post("/api/v1/students/", data={
            "last_name": "Тестов", "first_name": "Тест", "status": "active",
        }, content_type="application/json")
        self.assertEqual(r.status_code, 201)
        self.assertGreater(AuditLog.objects.count(), before)

    def test_month_close_idempotent(self):
        c = self._login("admin", "admin123")
        r1 = c.post("/api/v1/months/2026-10/close", content_type="application/json")
        self.assertEqual(r1.status_code, 200)
        r2 = c.post("/api/v1/months/2026-10/close", content_type="application/json")
        self.assertEqual(r2.status_code, 409)

    def test_month_reopen_requires_reason(self):
        c = self._login("admin", "account123" if False else "admin123")
        c.post("/api/v1/months/2026-10/close", content_type="application/json")
        r = c.post("/api/v1/months/2026-10/reopen", data={}, content_type="application/json")
        self.assertEqual(r.status_code, 409)
        r2 = c.post("/api/v1/months/2026-10/reopen", data={"reason": "тест"}, content_type="application/json")
        self.assertEqual(r2.status_code, 200)

    def test_contract_duplicate_flat_409(self):
        """Плоский POST /contracts/ тоже даёт 409 на дубле номера (а не 500)."""
        c = self._login("admin", "admin123")
        from apps.students.models import Student
        from apps.dictionaries.models import AcademicYear
        st = Student.objects.get(last_name="Лисовский")
        y = AcademicYear.objects.get(name="2026/2027")
        r = c.post("/api/v1/contracts/", data={
            "student": str(st.id), "academic_year": str(y.id), "number": "04Э", "date": "2026-10-01", "status": "active",
        }, content_type="application/json")
        self.assertEqual(r.status_code, 409, r.content)
        self.assertIn("занят", r.json()["error"]["message"])

    def test_teacher_students_scoped(self):
        """Реестр учеников для teacher ограничен его группами (как журнал)."""
        c = self._login("teacher", "teacher123")
        r = c.get("/api/v1/students/")
        self.assertEqual(r.status_code, 200)
        got = {s["id"] for s in r.json()["results"]}
        self.assertLess(len(got), 25)
        from apps.groups.models import Enrollment, Group
        own = set(Group.objects.filter(code__in={"э1", "IT-1", "э2"}).values_list("id", flat=True))
        expected = set(Enrollment.objects.filter(group_id__in=own, date_to__isnull=True).values_list("student_id", flat=True))
        self.assertEqual(got, {str(x) for x in expected})

    def test_validation_error_keeps_details(self):
        c = self._login("admin", "admin123")
        r = c.post("/api/v1/students/", data={"first_name": "Тест"}, content_type="application/json")
        self.assertEqual(r.status_code, 400)
        err = r.json()["error"]
        self.assertTrue(err["details"], err)

    def test_teacher_contracts_scoped(self):
        c = self._login("teacher", "teacher123")
        r = c.get("/api/v1/contracts/")
        self.assertEqual(r.status_code, 200)
        from apps.students.models import Student
        own = {str(s.id) for s in Student.objects.filter(enrollments__group__code__in={"э1", "IT-1", "э2"}, enrollments__date_to__isnull=True)}
        self.assertTrue(all(x["student"] in own for x in r.json()["results"]))

    def test_teacher_print_endpoints(self):
        """print/export: реестр — по scope, ведомости/чужой акт — 403."""
        c = self._login("teacher", "teacher123")
        r = c.get("/api/v1/print-data/registry")
        self.assertEqual(r.status_code, 200)
        self.assertLess(len(r.json()["students"]), 25)
        from apps.dictionaries.models import StatementSheet
        sh = StatementSheet.objects.first()
        self.assertEqual(c.get(f"/api/v1/print-data/statement?sheet={sh.id}&month=2026-10").status_code, 403)
        self.assertEqual(c.get(f"/api/v1/statements?sheet={sh.id}&month=2026-10").status_code, 403)
        from apps.staff.models import Act
        from apps.core.models import User
        t1 = User.objects.get(username="teacher").teacher_id
        act = Act.objects.exclude(teacher_id=t1).first()
        self.assertEqual(c.get(f"/api/v1/print-data/act/{act.id}").status_code, 403)
        from apps.groups.models import Group
        other = Group.objects.exclude(code__in={"э1", "IT-1", "э2"}).first()
        self.assertEqual(c.get(f"/api/v1/print-data/journal?group={other.id}&month=2026-10").status_code, 403)

    def test_contract_student_reparent_denied(self):
        c = self._login("admin", "admin123")
        from apps.students.models import Contract, Student
        con = Contract.objects.first()
        other = Student.objects.exclude(id=con.student_id).first()
        r = c.patch(f"/api/v1/contracts/{con.id}/", data={"student": str(other.id)}, content_type="application/json")
        self.assertEqual(r.status_code, 409)

    def test_accountant_can_manage_payments(self):
        """finance.edit у accountant: confirm/reject платежей работает (parity с фронтом)."""
        c = self._login("accountant", "account123")
        from apps.finance.models import Payment
        from apps.students.models import Student
        p = Payment.objects.filter(status="pending").first()
        st = Student.objects.first()
        r = c.post(f"/api/v1/payments/{p.id}/confirm/", data={"student_id": str(st.id)}, content_type="application/json")
        self.assertEqual(r.status_code, 200, r.content)

    def test_accountant_acts_edit_not_sign(self):
        c = self._login("accountant", "account123")
        from apps.staff.models import Act
        act = Act.objects.first()
        r = c.post(f"/api/v1/acts/{act.id}/sign/", content_type="application/json")
        self.assertEqual(r.status_code, 403, r.content)

    def test_teacher_cannot_create_lesson_other_group(self):
        c = self._login("teacher", "teacher123")
        from apps.groups.models import Group
        g = Group.objects.exclude(code__in={"э1", "IT-1", "э2"}).first()
        r = c.post("/api/v1/lessons/", data={"group": str(g.id), "date": "2026-10-15", "time": "18:00"},
                   content_type="application/json")
        self.assertEqual(r.status_code, 403, r.content)

    def test_attendance_rejects_unknown_students(self):
        c = self._login("admin", "admin123")
        from apps.journal.models import Lesson
        from apps.students.models import Student
        l = Lesson.objects.filter(date__startswith="2026-10").first()
        stranger = Student.objects.exclude(enrollments__group_id=l.group_id).first()
        r = c.put(f"/api/v1/lessons/{l.id}/attendance/", data={"marks": {str(stranger.id): "present"}},
                  content_type="application/json")
        self.assertEqual(r.status_code, 409, r.content)

    def test_payment_status_guards(self):
        c = self._login("accountant", "account123")
        from apps.finance.models import Payment
        from apps.students.models import Student
        p = Payment.objects.filter(status="confirmed").first()
        st = Student.objects.first()
        bodies = {
            "confirm": {"student_id": str(st.id)},
            "reject": {},
            "split": {"parts": [{"student_id": str(st.id), "amount": "1"}, {"student_id": str(st.id), "amount": "1"}]},
        }
        for action, data in bodies.items():
            r = c.post(f"/api/v1/payments/{p.id}/{action}/", data=data, content_type="application/json")
            self.assertEqual(r.status_code, 409, (action, r.content))

    def test_split_validates_parts(self):
        c = self._login("accountant", "account123")
        from apps.finance.models import Payment
        from apps.students.models import Student
        p = Payment.objects.filter(status="pending").first()
        st = Student.objects.first()
        r = c.post(f"/api/v1/payments/{p.id}/split/", data={"parts": [{"amount": "1"}, {"student_id": str(st.id), "amount": "1"}]}, content_type="application/json")
        self.assertEqual(r.status_code, 400, r.content)
        r = c.post(f"/api/v1/payments/{p.id}/split/", data={"parts": [{"student_id": str(st.id), "amount": "-5"}, {"student_id": str(st.id), "amount": "9999"}]}, content_type="application/json")
        self.assertEqual(r.status_code, 409, r.content)

    def test_payment_negative_amount_400(self):
        c = self._login("accountant", "account123")
        from apps.students.models import Student
        st = Student.objects.first()
        r = c.post("/api/v1/payments/", data={"student": str(st.id), "date": "2026-10-22", "amount": "-10", "method": "cash", "status": "confirmed"}, content_type="application/json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_settings_requires_auth(self):
        c = Client()
        r = c.get("/api/v1/settings/")
        self.assertIn(r.status_code, (401, 403), r.status_code)

    def test_delete_protected_teacher_409(self):
        c = self._login("admin", "admin123")
        from apps.staff.models import Act
        teacher_id = Act.objects.first().teacher_id
        r = c.delete(f"/api/v1/teachers/{teacher_id}/")
        self.assertEqual(r.status_code, 409, r.content)

    def test_journal_payload_shape(self):
        c = self._login("admin", "admin123")
        from apps.groups.models import Group
        g = Group.objects.get(code="э1")
        r = c.get(f"/api/v1/journal?group={g.id}&month=2026-10")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertIn("students", d)
        self.assertIn("lessons", d)
        self.assertIn("marks", d)
