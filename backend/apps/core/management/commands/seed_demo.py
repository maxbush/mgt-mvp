"""seed_demo — наполнение демо-данными, идентичными фронтовому сиду (mock-data.ts).

Детерминированно: mulberry32(20261022), те же ученики/группы/платежи/отметки,
что во фронте. Идемпотентно: --reset чистит доменные таблицы.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group as AuthGroup
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.calc import act_amounts, is_chargeable, price_on
from apps.core.models import RolePermission, User
from apps.core.permissions import ROLE_DEFAULTS
from apps.dictionaries.models import (
    AcademicYear, ActRate, AddendumTemplate, Branch, ChargePolicy, Direction, Signer, StatementSheet, SystemSetting, TaxRate,
)
from apps.finance.models import Adjustment, MonthBalance, MonthClose, Payment
from apps.finance.services import balance_row
from apps.groups.models import Enrollment, Group, GroupPrice, MembershipChange
from apps.journal.models import Attendance, Lesson
from apps.staff.models import Act, Teacher
from apps.students.models import Contract, Student

DEMO_TODAY = date(2026, 10, 22)
DEMO_RATE = Decimal("46.52")


def _mulberry32(seed):
    """Точный порт mulberry32 из mock-data.ts (детерминированные отметки)."""
    a = seed
    while True:
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t))) & 0xFFFFFFFF) ^ t
        t = (t ^ (t >> 14)) & 0xFFFFFFFF
        yield t / 4294967296


def _d(s):
    y, m, dd = s.split("-")
    return date(int(y), int(m), int(dd))


def _add(d, n):
    return d + timedelta(days=n)


RAW = [
    ("s01", "Адамович", "Глеб", 2017, "3", "Адамович Ольга Николаевна", "01э", "2026-09-02", [("g_e1", None, None)]),
    ("s02", "Мацкевич", "Фёдор", 2018, "2", "Мацкевич Андрей Сергеевич", "02э", "2026-09-02", [("g_e1", None, None)]),
    ("s03", "Иванов", "Пётр", 2015, "4", "Иванова Елена Сергеевна", "03э", "2026-09-27", [("g_e1", None, None)]),
    ("s04", "Лисовский", "Кирилл", 2017, "3А(1)", "Лисовская Наталья Викторовна", "04э", "2026-09-04", [("g_e1", None, None)]),
    ("s05", "Савицкая", "Мария", 2020, "6 лет", "Савицкий Павел Игоревич", "05э", "2026-09-15", [("g_e1", "2026-09-15", None)]),
    ("s06", "Кравчук", "Артём", 2014, "5", "Кравчук Татьяна Ивановна", "06э", "2026-09-03", [("g_e1", None, None), ("g_r2", None, None)]),
    ("s07", "Шиманский", "Илья", 2015, "4", "Шиманская Юлия Андреевна", "07э", "2026-09-05", [("g_e2", None, None)]),
    ("s08", "Климович", "Дарья", 2017, "3", "Климович Сергей Олегович", "08э", "2026-09-05", [("g_e2", None, None)]),
    ("s09", "Станкевич", "Егор", 2014, "5", "Станкевич Марина Петровна", "09э", "2026-09-06", [("g_e2", None, None)]),
    ("s10", "Ковалевич", "София", 2018, "2", "Ковалевич Анна Дмитриевна", "10э", "2026-09-06", [("g_e2", None, None)]),
    ("s11", "Дубровский", "Максим", 2016, "3", "Дубровская Ирина Леонидовна", "11э", "2026-09-06", [("g_e2", None, "2026-09-30"), ("g_r1", "2026-10-01", None)]),
    ("s12", "Жук", "Владислав", 2015, "4", "Жук Александр Викторович", "01р", "2026-09-03", [("g_r1", None, None)]),
    ("s13", "Лукашевич", "Ангелина", 2017, "3", "Лукашевич Светлана Игоревна", "02р", "2026-09-03", [("g_r1", None, None)]),
    ("s14", "Гуринович", "Тимофей", 2014, "5", "Гуринович Екатерина Юрьевна", "03р", "2026-09-04", [("g_r1", None, None)]),
    ("s15", "Бородич", "Михаил", 2013, "6", "Бородич Дмитрий Александрович", "04р", "2026-09-04", [("g_r2", None, None)]),
    ("s16", "Сидорович", "Никита", 2015, "4", "Сидорович Оксана Васильевна", "05р", "2026-10-05", [("g_r2", "2026-10-05", None)]),
    ("s17", "Янковская", "Ева", 2017, "3", "Янковский Игорь Павлович", "06р", "2026-09-07", [("g_r2", None, None)]),
    ("s18", "Романович", "Денис", 2017, "3А(1)", "Романович Алла Николаевна", "07р", "2026-09-08", [("g_k1", None, None)]),
    ("s19", "Пашкевич", "Анна", None, "2", "Пашкевич Виктор Иванович", "08р", "2026-09-08", [("g_k1", None, None)]),
    ("s20", "Войтович", "Артур", 2012, "7", "Войтович Людмила Сергеевна", "01it", "2026-09-09", [("g_it1", None, None)]),
    ("s21", "Борисевич", "Полина", 2013, "6", "Борисевич Роман Анатольевич", "02it", "2026-09-09", [("g_it1", None, None)]),
    ("s22", "Хомич", "Лев", 2011, "8", "Хомич Галина Владимировна", "03it", "2026-09-10", [("g_it1", None, None)]),
    ("s23", "Игнатович", "Вера", 2017, "3", "Игнатович Максим Андреевич", "09-191б", "2026-09-10", [("g_g1", None, None)]),
    ("s24", "Хоменко", "Тимур", 2016, "4", "Хоменко Лариса Петровна", "09-192б", "2026-09-10", [("g_g1", None, None)]),
    ("s25", "Ждан", "Руслан", 2015, "4", "Ждан Николай Степанович", "09-193б", "2026-09-11", [("g_g1", None, "2026-09-25")], False),
]

GDEFS = [
    ("g_e1", "э1", "Юный электронщик №1 группа", "electronics", "b_part", "t1", [("2026-09-01", 30)], [1, 3], "16:00"),
    ("g_e2", "э2", "Юный электронщик №2 группа", "electronics", "b_part", "t2", [("2026-09-01", 30)], [2, 4], "16:30"),
    ("g_r1", "р1", "Робототехника №1 группа", "robotics", "b_part", "t2", [("2026-09-01", 30)], [1, 3], "17:30"),
    ("g_r2", "р2", "Робототехника №2 группа", "robotics", "b_part", "t3", [("2026-09-01", 30), ("2026-10-01", 35)], [2, 4], "17:30"),
    ("g_k1", "к1", "Робототехника №3 группа", "robotics", "b_kolod", "t3", [("2026-09-01", 30)], [5], "15:00"),
    ("g_it1", "IT-1", "IT-класс №1 группа", "it", "b_kolod", "t1", [("2026-09-01", 45)], [2, 4], "15:30"),
    ("g_g1", "Г-1", "Юный электронщик №3 группа", "electronics", "b_gym32", "t2", [("2026-09-01", 35)], [5], "15:00"),
]

TARGETS = {
    "s01": (60, 90, 120), "s02": (0, 60, 30), "s03": (0, -30, 30), "s04": (30, 60, 0), "s05": (0, 120, 90),
    "s06": (120, 90, 180), "s07": (0, 30, 60), "s08": (0, 0, 30), "s09": (-60, 0, 60), "s10": (30, 30, 90),
    "s11": (0, 60, 90), "s12": (0, -30, None), "s13": (60, 90, 60), "s14": (0, 30, 0), "s15": (30, 60, 120),
    "s16": (0, 30, 30), "s17": (90, 60, 90), "s18": (0, 30, 60), "s19": (30, 0, None), "s20": (135, 180, 225),
    "s21": (0, 90, 45), "s22": (90, 135, 180), "s23": (0, 70, 105), "s24": (35, 35, 0), "s25": (0, -60, -60),
}

WD_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]


class Command(BaseCommand):
    help = "Демо-данные CRM (порт mock-data.ts)"

    def add_arguments(self, p):
        p.add_argument("--reset", action="store_true")

    @transaction.atomic
    def handle(self, *a, **kw):
        if kw["reset"]:
            self._wipe()
        self._seed()
        self.stdout.write(self.style.SUCCESS("Демо-данные загружены"))

    def _wipe(self):
        for m in (Attendance, Lesson, Payment, Adjustment, MonthBalance, MonthClose, MembershipChange,
                  Enrollment, Act, Contract, Student, GroupPrice, Group, Teacher, StatementSheet,
                  AddendumTemplate, Signer, ActRate, ChargePolicy, TaxRate, AcademicYear, Branch, Direction):
            m.objects.all().delete()

    def _seed(self):
        # --- роли/права ---
        for role, codes in ROLE_DEFAULTS.items():
            g, _ = AuthGroup.objects.get_or_create(name=role)
            for c in codes:
                RolePermission.objects.get_or_create(group=g, codename=c)

        # --- справочники ---
        branches = {}
        for bid, name, addr in [
            ("b_kolod", "Колодищанская СШ №2", "Минский р-н, аг. Колодищи, ул. Школьная, д.2"),
            ("b_part", "Партизанский пр-т, 8", "г. Минск, Партизанский пр-т, д.8"),
            ("b_gym32", "ГУО Гимназия №32 г. Минска", "г. Минск, ул. Нестерова, д.32"),
        ]:
            branches[bid] = Branch.objects.create(name=name, address=addr)

        directions = {}
        for code, name in [("electronics", "Электроника"), ("robotics", "Робототехника"), ("it", "IT"), ("other", "Другое")]:
            directions[code] = Direction.objects.create(code=code, name=name)

        ay_old = AcademicYear.objects.create(name="2025/2026", start_date="2025-09-01", end_date="2026-05-31")
        ay = AcademicYear.objects.create(name="2026/2027", start_date="2026-09-01", end_date="2027-05-31", is_current=True)

        Signer.objects.create(name="Орлова А.В.", position="Специалист отдела инновационного развития",
                              position_gen="специалиста отдела инновационного развития", female=True, is_default=True)
        Signer.objects.create(name="Громов А.Л.", position="Заместитель директора по инновационному развитию",
                              position_gen="заместителя директора по инновационному развитию")
        signer = Signer.objects.get(name="Орлова А.В.")

        # листы ведомости: по филиалам + IT-класс
        for i, b in enumerate(branches.values()):
            StatementSheet.objects.create(kind="branch", name=b.name, address=b.address, branch=b, order=i)
        it_dir = directions["it"]
        StatementSheet.objects.create(kind="direction", name="IT-класс", address="", direction=it_dir, order=99)

        ActRate.objects.create(date_from="2026-09-01", rate=DEMO_RATE)
        ChargePolicy.objects.create(date_from="2026-09-01", charge_absent=True, charge_sick=False, charge_excused=False)
        TaxRate.objects.create(kind="income_tax", date_from="2026-09-01", pct=13)
        TaxRate.objects.create(kind="fszn", date_from="2026-09-01", pct=1)
        SystemSetting.set("opening_date", "2026-08-31")
        SystemSetting.set("demo_today", DEMO_TODAY.isoformat())

        # --- преподаватели ---
        tdefs = [
            ("t1", "Козловский", "Андрей", "Петрович", 1, "active", "BY11ALFA30140000000000000001", "Партизанским РУВД г. Минска"),
            ("t2", "Мартынова", "Ольга", "Сергеевна", 2, "active", "BY12ALFA30140000000000000002", "Московским РУВД г. Минска"),
            ("t3", "Шевцов", "Дмитрий", "Игоревич", 3, "active", "BY13PJCB30140000000000000003", "Заводским РУВД г. Минска"),
            ("t4", "Крупеня", "Игорь", "Валерьевич", 4, "inactive", "BY14ALFA30140000000000000004", "Партизанским РУВД г. Минска"),
        ]
        teachers = {}
        for tid, ln, fn, mn, n, status, iban, issued in tdefs:
            teachers[tid] = Teacher.objects.create(
                last_name=ln, first_name=fn, middle_name=mn,
                phone=f"+37529555020{n}", email=f"t{n}@example.test", status=status,
                passport_series="MP", passport_number=f"000{n}{n}0{n}", passport_issued=issued,
                personal_number=f"000000{n}A00{n}PB{n}", iban=iban,
                bank_name="ЗАО «АЛЬФА-БАНК»" if n != 3 else "ОАО «Приорбанк»",
                bank_bic="ALFABY2X" if n != 3 else "PJCBBY2X",
                address_reg=f"г. Минск, ул. Условная, д.{n * 7}, кв. {n * 11}",
            )

        # --- группы ---
        groups = {}
        for gid, code, name, direc, bid, tid, prices, weekdays, time_ in GDEFS:
            g = Group.objects.create(
                code=code, name=name, direction=direc, branch=branches[bid],
                teacher=teachers[tid], academic_year=ay,
                weekdays=weekdays, lesson_time=time_,
                schedule=f"{', '.join(WD_SHORT[w] for w in weekdays)} · {time_}",
            )
            for f, p in prices:
                GroupPrice.objects.create(group=g, date_from=f, price=p)
            groups[gid] = g

        # --- ученики/договоры/зачисления ---
        students = {}
        for i, r in enumerate(RAW):
            sid, ln, fn, by_, grade, parent, no, cdate, enr = r[:9]
            active = r[9] if len(r) > 9 else True
            first_group = groups[enr[0][0]]
            s = Student.objects.create(
                last_name=ln, first_name=fn, birth_year=by_, grade=grade,
                branch=first_group.branch, status="active" if active else "inactive",
                parent_name=parent, parent_phone=f"+3752955501{i + 1:02d}",
            )
            students[sid] = s
            Contract.objects.create(student=s, academic_year=ay, number=no, date=cdate,
                                    status="active" if active else "terminated")
            if sid == "s07":
                Contract.objects.create(student=s, academic_year=ay_old, number="12э", date="2025-09-20", status="closed")
            for k, (gid, frm, to) in enumerate(enr):
                frm = frm or "2026-09-07"
                Enrollment.objects.create(student=s, group=groups[gid], date_from=frm, date_to=to)
                MembershipChange.objects.create(student=s, kind="enroll", to_group=groups[gid], date=frm)
                if to:
                    MembershipChange.objects.create(student=s, kind="unenroll", from_group=groups[gid], date=to)

        # --- занятия и отметки: 07.09 – 31.10 ---
        rand = _mulberry32(20261022)
        UNMARKED = {("g_r1", "2026-10-21"), ("g_g1", "2026-10-16")}
        enrollments = list(Enrollment.objects.all())
        def enrolled_on(gid, d):
            return [e.student_id for e in enrollments
                    if str(e.group_id) == str(groups[gid].id) and e.date_from <= d and (e.date_to is None or e.date_to >= d)]

        lessons = {}
        for gid, _, _, _, _, _, _, weekdays, time_ in GDEFS:
            d = date(2026, 9, 7)
            while d <= date(2026, 10, 31):
                if d.isoweekday() not in weekdays:
                    d = _add(d, 1)
                    continue
                key = (gid, d.isoformat())
                cancelled = key == ("g_e2", "2026-10-08")
                sub = None
                if key in (("g_e2", "2026-09-15"), ("g_e2", "2026-09-17")):
                    sub = teachers["t4"]
                elif key == ("g_e2", "2026-10-15"):
                    sub = teachers["t1"]
                l = Lesson.objects.create(group=groups[gid], date=d, time=time_,
                                          substitute_teacher=sub, cancelled=cancelled)
                lessons[key] = l
                if not cancelled and d <= DEMO_TODAY and key not in UNMARKED:
                    for sid_pk in enrolled_on(gid, d):
                        x = next(rand)
                        if x < 0.03:
                            continue
                        st = "present" if x < 0.82 else "absent" if x < 0.9 else "sick" if x < 0.95 else "excused"
                        Attendance.objects.create(lesson=l, student_id=sid_pk, status=st)
                d = _add(d, 1)

        # --- платежи по «целевым» остаткам ---
        marks = {(str(m.lesson_id), str(m.student_id)): m.status for m in Attendance.objects.select_related().all()}
        gprice = {gid: [{"from": f, "price": Decimal(p)} for f, p in prices] for gid, _, _, _, _, _, prices, _, _ in GDEFS}
        class _Pol:
            charge_absent, charge_sick, charge_excused = True, False, False
        def spent(sid, month):
            t = Decimal(0)
            for (gid, dstr), l in lessons.items():
                if l.cancelled or not dstr.startswith(month):
                    continue
                st = marks.get((str(l.id), str(students[sid].id)))
                if not st or not is_chargeable(st, _Pol):
                    continue
                t += Decimal(price_on(gprice[gid], dstr))
            return t

        n_pay = 0
        for i, (r) in enumerate(RAW):
            sid = r[0]
            s = students[sid]
            o, e9, e10 = TARGETS[sid]
            s.opening_balance = o
            s.save(update_fields=["opening_balance"])
            def mk(d, amount):
                nonlocal n_pay
                n_pay += 1
                manual = i % 4 == 0
                method = "cash" if manual else "erip" if i % 3 == 0 else "bepaid"
                payer = parent if (manual or i % 5 == 1) else f"{r[1]} {r[2]}"
                return Payment.objects.create(
                    student=s, date=d, amount=amount, method=method, status="confirmed",
                    payer=payer, ext_id="" if manual else f"BP-{100200 + n_pay * 3}",
                )
            parent = r[5]
            a9 = Decimal(e9) - Decimal(o) + spent(sid, "2026-09")
            if a9 > 0:
                mk(date(2026, 9, 2 + i % 6), a9)
            if e10 is not None:
                a10 = Decimal(e10) - Decimal(e9) + spent(sid, "2026-10")
                if a10 > 0:
                    mk(date(2026, 10, 1 + i % 3), a10)

        # дубль ext_id как в сиде фронта
        dup = Payment.objects.filter(method="bepaid", date__startswith="2026-10").first()
        if dup:
            dup.ext_id = "BP-100231"
            dup.save(update_fields=["ext_id"])

        # очередь сопоставления
        Payment.objects.create(student=None, date="2026-10-20", amount=60, method="bepaid",
                               status="pending", payer="Лисавский Кирилл", ext_id="BP-100401")
        Payment.objects.create(student=None, date="2026-10-21", amount=120, method="bepaid",
                               status="pending", payer="Иванова Елена", ext_id="BP-100402")
        Payment.objects.create(student=None, date="2026-10-19", amount=120, method="bepaid",
                               status="pending", payer="Гуринович Тимофей и Бородич Михаил", ext_id="BP-100403")
        Payment.objects.create(student=None, date="2026-10-12", amount=15, method="bepaid",
                               status="rejected", payer="Петровский Игорь", ext_id="BP-100390",
                               note="Плательщик не связан с учениками")

        Adjustment.objects.create(student=students["s13"], date="2026-10-10", amount=15,
                                  comment="Перерасчёт: возврат за пропущенное занятие (сентябрь)")

        # --- акты за сентябрь ---
        n = 1
        for tid, t in teachers.items():
            count = sum(
                1 for (gid, dstr), l in lessons.items()
                if dstr.startswith("2026-09") and not l.cancelled and l.marks.exists()
                and str(l.effective_teacher_id) == str(t.id)
            )
            if not count:
                continue
            am = act_amounts(count, DEMO_RATE)
            Act.objects.create(
                number=f"{n:02d}/09-26", teacher=t, month="2026-09", lessons_count=count,
                rate=DEMO_RATE, gross=am["gross"], income_tax=am["income_tax"],
                fszn=am["fszn"], net=am["net"], signer=signer, status="signed", source="journal",
            )
            n += 1

        # закрытый сентябрь + снимки
        mc = MonthClose.objects.create(month="2026-09")
        for s in Student.objects.all():
            r = balance_row(s.id, "2026-09")
            MonthBalance.objects.create(month_close=mc, student=s, opening=r["opening"],
                                        paid=r["paid"], charged=r["consumed"], closing=r["closing"])

        # --- шаблоны доп. соглашений ---
        for name, body in [
            ("Изменение стоимости занятий", "Стоимость одного учебного занятия составляет {{price}}. Новая стоимость применяется к занятиям, проведённым начиная с {{date}}."),
            ("Перевод в другую группу", "Обучение {{student_name}} осуществляется в группе «{{group}}» по адресу: {{branch}}, начиная с {{date}}."),
            ("Продление срока действия договора", "Срок действия договора № {{contract_number}} от {{contract_date}} продлевается до {{date}} включительно."),
            ("Изменение данных представителя", "Реквизиты Заказчика изложить в следующей редакции: {{parent_name}}, контактный телефон {{parent_phone}}."),
        ]:
            AddendumTemplate.objects.create(name=name, body=body)

        # --- пользователи ---
        gmap = {r: AuthGroup.objects.get(name=r) for r in ("admin", "teacher", "accountant")}
        admin = User.objects.create_user("admin", password="admin123", first_name="Ирина", last_name="Карпович",
                                         email="i.karpovich@mgtp.by", role="admin")
        admin.groups.add(gmap["admin"])
        t_user = User.objects.create_user("teacher", password="teacher123", first_name="Андрей", last_name="Козловский",
                                          email="a.kozlovsky@mgtp.by", role="teacher", teacher=teachers["t1"])
        t_user.groups.add(gmap["teacher"])
        acc = User.objects.create_user("accountant", password="account123", first_name="Наталья", last_name="Петрова",
                                       email="n.petrova@mgtp.by", role="accountant")
        acc.groups.add(gmap["accountant"])
