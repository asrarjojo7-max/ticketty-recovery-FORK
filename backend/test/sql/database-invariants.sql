-- DATABASE INVARIANTS — Phase 2 (TD-016)
-- =========================================================================
-- الغرض: تحويل "المطور يتذكر" إلى "البناء يفشل". هذا الملف يُنفَّذ في:
--   1. CI (على كل push/PR — عبر package.json: test:db:invariants)
--   2. Deploy-time (compose migrate service — يفشل النشر إذا سقطت القيود)
--   3. Dev-time (predev hook — يمنع تراكم drift أصلًا)
--   4. Phase 7 restore-drill (نفس الفحوص على الـ backup المستعاد)
--
-- الفلسفة: الاشتقاق الآلي من pg_catalog حيث أمكن (قوائم يدوية تتقادم
-- وتكذب) + فحوص صريحة مُسمّاة للأمن الحرج (grants/RLS/triggers).
-- فشل أي بند = RAISE EXCEPTION = exit code ≠ 0 = توقف البناء/النشر.
-- =========================================================================

-- ─── 0) الفحص يعمل داخل معاملة قابلة للتراجع ───────────────────────────
-- (لا يكتب شيئاً؛ read-only كلياً ما عدا فحوص DO التي تتراجع ذاتياً)

DO $$ BEGIN

-- ═══════════════════════════════════════════════════════════════════════
-- القسم 1 — عزل المستأجرين (composite tenant FKs + unique composites)
-- المصدر: pg_catalog مباشرة — أي قيد يسقط من migrate dev/db push
-- (السيناريو الذي خلقه TD-016 أصلًا) يُكشف فوراً هنا.
-- ═══════════════════════════════════════════════════════════════════════

-- 1.1 الحد الأدنى: ≥ 25 قيد FK composite يحمل organizationId على الجانبين.
--     (الوضع المستقر الحالي: 30. نخفض الحد لتفادي هشاشة القائمة، لكن
--     أي انخفاض جوهري = قيود tenant سقطت = فشل.)
DECLARE
  composite_fk_count int;
BEGIN
  SELECT count(*) INTO composite_fk_count
  FROM pg_constraint
  WHERE contype = 'f'
    AND pg_get_constraintdef(oid) ~ 'organizationId.*,';
  IF composite_fk_count < 25 THEN
    RAISE EXCEPTION 'INVARIANT FAIL [tenant-fk-count]: expected >= 25 composite org-scoped foreign keys, found %', composite_fk_count;
  END IF;
END;

-- 1.2 التوزيع لكل جدول: كل جدول "مالك" يجب أن يظل محمياً.
--     الجداول الحرجة (كل جدول يحيل لمورد مؤسسي عبر composite) يجب أن
--     يحتفظ بكل قيوده. نتحقق من عتبة لكل جدول على الجداول الجوهرية.
DECLARE
  t record; n int;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'trips','bookings','tickets','payments','refunds','commissions',
      'expenses','expense_adjustments','journal_entries','journal_entry_lines',
      'accounting_policies','manifests','settlements','agents'
    ]) AS tbl
  LOOP
    SELECT count(*) INTO n
    FROM pg_constraint
    WHERE contype='f'
      AND conrelid = ('public.' || t.tbl)::regclass
      AND pg_get_constraintdef(oid) ~ 'organizationId.*,';
    IF n < 1 THEN
      RAISE EXCEPTION 'INVARIANT FAIL [tenant-fk-%]: composite org FK missing on %', t.tbl, t.tbl;
    END IF;
  END LOOP;
END;

-- 1.3 القيود المركبة الفريدة (idempotency + كود داخل org + ...)
DECLARE
  unique_composite_count int;
BEGIN
  SELECT count(*) INTO unique_composite_count
  FROM pg_indexes
  WHERE indexdef LIKE '%UNIQUE%'
    AND indexdef ~ '"organizationId", ';
  IF unique_composite_count < 15 THEN
    RAISE EXCEPTION 'INVARIANT FAIL [unique-composite-count]: expected >= 15 org-scoped unique indexes, found %', unique_composite_count;
  END IF;
END;

-- 1.4 الحرجة بالاسم — idempotency المزدوج (مفتاح البناء المالي):
--     booking + payment idempotency يمنعان البيع المزدوج. لو سقط
--     أحدهما فلا شيء آخر يمسك المبيعات المكررة.
DECLARE
  expected_unique_indexes text[] := ARRAY[
    'bookings_organizationId_idempotencyKey_key',
    'payments_organizationId_idempotencyKey_key',
    'idempotency_records_organizationId_endpoint_key_key',
    'journal_entries_organizationId_entryNumber_key',
    'journal_entries_organizationId_sourceType_sourceId_key',
    'accounting_events_organizationId_eventType_sourceId_key'
  ];
  idx text;
BEGIN
  FOREACH idx IN ARRAY expected_unique_indexes LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = idx
    ) THEN
      RAISE EXCEPTION 'INVARIANT FAIL [idempotency-unique]: critical unique index % is missing', idx;
    END IF;
  END LOOP;
END;

-- ═══════════════════════════════════════════════════════════════════════
-- القسم 2 — RLS: مفعّل + policy حقيقية على كل جدول tenant
-- ═══════════════════════════════════════════════════════════════════════

-- 2.1 كل الجداول الـ 33 المطلوبة relrowsecurity = true
DECLARE
  tenant_tables text[] := ARRAY[
    'organizations','users','roles','branches','seat_templates','seats',
    'buses','drivers','routes','route_stops','trips','trip_seats',
    'customers','agents','bookings','tickets','payments','refunds',
    'commissions','expenses','expense_adjustments','settlements',
    'settlement_lines','manifests','accounts','journals','fiscal_periods',
    'journal_entries','journal_entry_lines','accounting_policies',
    'accounting_events','idempotency_records','audit_logs'
  ];
  tbl text; tbl_oid oid;
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    SELECT c.oid INTO tbl_oid FROM pg_class c
    WHERE c.relname = tbl AND c.relkind = 'r';
    IF tbl_oid IS NULL THEN
      RAISE EXCEPTION 'INVARIANT FAIL [rls-table-missing]: table % does not exist', tbl;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = tbl_oid) THEN
      RAISE EXCEPTION 'INVARIANT FAIL [rls-disabled]: RLS is NOT enabled on %', tbl;
    END IF;
    IF (SELECT count(*) FROM pg_policy WHERE polrelid = tbl_oid) < 1 THEN
      RAISE EXCEPTION 'INVARIANT FAIL [rls-no-policy]: RLS enabled but ZERO policies on %', tbl;
    END IF;
  END LOOP;
END;

-- 2.2 إثبات سلوكي (أقوى من الميتاداتا): بدور تطبيق حقيقي وبدون
--     سياق org، يجب أن يُحجب الجدول الأصلي المضمون غير الفارغ.
--     هذا يفحص "RLS يعمل فعلياً" — تمكين + policy + دالة السياق —
--     وليس فقط أعلاماً في الكتالوج. (organizations يحوي مؤكد
--     operator org + e2e orgs؛ لو انكسر RLS لظهرت صفوف.)
--     ملاحظة: لا نطلب FORCE ROW LEVEL SECURITY — المالك الحالي
--     superuser (يتجاوز RLS بأي حال؛ عقد §11: لا تعديل core بلا
--     عيب مثبت). الفحص السلوكي يغطي سطح الهجوم الفعلي.
--     إلزامي: RESET ROLE بعد الفحص السلوكي — بدونها تُكمل الأقسام
--     التالية العمل بدور ticketty_app و information_schema يحجب عنه
--     رؤية المنح غير الخاصة به، فتصبح فحوص القسم 4 (المنح) ترى 0
--     صفوف وتنجح زوراً (ثغرة كشفها تشغيل 4.2 معزولاً بعد الدمج:
--     grants موجودة فعلاً لكن الفحص الشامل كان يمر — false green).
BEGIN
  SET LOCAL ROLE ticketty_app;
  PERFORM 1; -- دور فعلي، لا تمويه
  IF EXISTS (SELECT 1 FROM public.organizations) THEN
    RAISE EXCEPTION 'INVARIANT FAIL [rls-behavioral]: ticketty_app without org context reads organizations rows — RLS not effectively enforced';
  END IF;
  RESET ROLE; -- العودة لصاحب الامتياز — فحوص المنح تحتاج رؤية الكتالوج كاملة
END;

-- ═══════════════════════════════════════════════════════════════════════
-- القسم 3 — الـ triggers الحرجة موجودة (منع التلاعب المالي المباشر)
-- ═══════════════════════════════════════════════════════════════════════

DECLARE
  expected_triggers text[] := ARRAY[
    'journal_entries_posting_guard',                       -- لا قيد غير متوازن يُرحّل
    'journal_entry_lines_immutability_guard',              -- POSTED لا يُعدَّل
    'refund_integrity_before_insert',                      -- refund ≤ amount تراكمياً
    'audit_logs_immutable_guard',                          -- سجل التدقيق لا يُمس
    'settlements_prevent_final_mutation',                  -- التسوية النهائية ثابتة
    'settlement_lines_prevent_final_mutation'
  ];
  trg text;
BEGIN
  FOREACH trg IN ARRAY expected_triggers LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = trg AND NOT tgisinternal
    ) THEN
      RAISE EXCEPTION 'INVARIANT FAIL [trigger-missing]: critical trigger % not found', trg;
    END IF;
  END LOOP;
END;

-- ═══════════════════════════════════════════════════════════════════════
-- القسم 4 — Grants: مبدأ الحد الأدنى machine-checked
-- ═══════════════════════════════════════════════════════════════════════

-- 4.1 audit_logs: ticketty_app لا يمتلك DELETE/UPDATE (immutable فعلياً
--     ليس فقط بالـ trigger — الامتياز نفسه غائب)
IF EXISTS (
  SELECT 1 FROM information_schema.table_privileges
  WHERE table_name = 'audit_logs'
    AND grantee IN ('ticketty_app','ticketty_auth','ticketty_accounting_worker')
    AND privilege_type IN ('DELETE','UPDATE','TRUNCATE')
) THEN
  RAISE EXCEPTION 'INVARIANT FAIL [audit-grant]: application role holds destructive privilege on audit_logs';
END IF;

-- 4.2 subscriptions: لا امتيازات جدول لأي دور تطبيق إطلاقاً (الوصول
--     حصراً عبر دوال SECURITY DEFINER بمنح محددة)
IF EXISTS (
  SELECT 1 FROM information_schema.table_privileges
  WHERE table_name = 'subscriptions'
    AND grantee != 'mojahed'
) THEN
  RAISE EXCEPTION 'INVARIANT FAIL [subscriptions-grant]: application role holds table privilege on subscriptions — must be function-access only';
END IF;

-- 4.3 دوال المنصة: لا منح PUBLIC (ثغرة أصلحناها في 20260910 —
--     منع التكرار هو الغرض). أي دالة security-definer في ticketty_security
--     لا يجب أن تكون قابلة للتنفيذ من العامة.
IF EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a ON true
  WHERE n.nspname = 'ticketty_security'
    AND p.prosecdef
    AND a.grantee = 0 -- PUBLIC
) THEN
  RAISE EXCEPTION 'INVARIANT FAIL [fn-public-grant]: SECURITY DEFINER function in ticketty_security is executable by PUBLIC';
END IF;

-- 4.4 roles لا تنتهك الحد الأدنى: أدوار التطبيق بلا SUPERUSER/CREATEDB
IF EXISTS (
  SELECT 1 FROM pg_roles
  WHERE rolname IN ('ticketty_app','ticketty_auth','ticketty_platform',
                   'ticketty_accounting_worker','ticketty_web_analytics')
    AND (rolsuper OR rolcreatedb OR rolcreaterole)
) THEN
  RAISE EXCEPTION 'INVARIANT FAIL [role-escalation]: application role has superuser/db-create/role-create';
END IF;

-- ═══════════════════════════════════════════════════════════════════════
-- القسم 5 — CHECK constraints المالية
-- ═══════════════════════════════════════════════════════════════════════

-- 5.1 payments.amount > 0
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE contype='c' AND conrelid='public.payments'::regclass
    AND pg_get_constraintdef(oid) ~ 'amount *> *\(0\)|amount *> *0'
) THEN
  RAISE EXCEPTION 'INVARIANT FAIL [payment-amount-check]: payments.amount > 0 CHECK missing';
END IF;

-- 5.2 payments.refundedAmount BETWEEN 0 AND amount (منع الاسترداد الزائد)
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE contype='c' AND conrelid='public.payments'::regclass
    AND pg_get_constraintdef(oid) ~ '"refundedAmount"'
    AND pg_get_constraintdef(oid) ~ 'amount'
) THEN
  RAISE EXCEPTION 'INVARIANT FAIL [payment-refund-check]: refundedAmount [0, amount] CHECK missing';
END IF;

-- 5.3 journal_entry_lines: debit XOR credit (سطر واحد اتجاه واحد)
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE contype='c' AND conrelid='public.journal_entry_lines'::regclass
    AND pg_get_constraintdef(oid) LIKE '%debit%'
    AND pg_get_constraintdef(oid) LIKE '%credit%'
) THEN
  RAISE EXCEPTION 'INVARIANT FAIL [journal-line-check]: debit/credit XOR CHECK missing on journal_entry_lines';
END IF;

-- 5.4 قيد التراكب (trips) — الاكتشاف الذي كشف Phase 1 e2e: قيد
--     exclusion على جدول الرحلات (bus + driver) يجب أن يبقى.
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE contype='x' AND conrelid='public.trips'::regclass
) THEN
  RAISE EXCEPTION 'INVARIANT FAIL [trip-exclusion]: trips scheduling exclusion constraint missing';
END IF;

END $$;

-- نجاح كل ما سبق = القيود حية. النتيجة الإيجابية للاستهلاك الآلي:
SELECT 'ALL DATABASE INVARIANTS OK' AS result,
       (SELECT count(*) FROM pg_constraint WHERE contype='f' AND pg_get_constraintdef(oid) ~ 'organizationId.*,') AS composite_fks,
       (SELECT count(*) FROM pg_class WHERE relrowsecurity AND relkind='r') AS rls_tables,
       (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal) AS triggers;
