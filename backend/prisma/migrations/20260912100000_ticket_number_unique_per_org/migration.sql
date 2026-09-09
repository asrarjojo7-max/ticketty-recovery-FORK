-- أرقام التذاكر تُخصَّص لكل منظمة على حدة (تسلسل TK-YYYY-NNNNNN
-- يبدأ من 000001 في كل منظمة). كل مسارات البحث بالرقم مقيدة
-- بنطاق المنظمة أصلاً (بوابة الصعود/التحقق)، لذا الفريدية الصحيحة
-- هي (organizationId, number) — الفريدية العالمية كانت تمنع أي
-- منظمة جديدة من إصدار أول تذكرة لها (اصطدام بـ 000001 الموجودة
-- لمنظمة أخرى = P2002 «تعذّر إتمام البيع»).
DROP INDEX IF EXISTS "tickets_number_key";
CREATE UNIQUE INDEX "tickets_organizationId_number_key"
  ON "tickets"("organizationId", "number");
