import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * إنشاء Tenant (منظمة + مالكها الأول) — عملية Provisioning مدارة.
 * متاحة فقط لحاملي صلاحية platform.admin (فريق Suda-Technologies).
 */
export class ProvisionTenantDto {
  /** اسم شركة النقل كما سيظهر في النظام. */
  @IsString()
  @IsNotEmpty({ message: 'اسم الشركة مطلوب' })
  @MaxLength(150)
  name: string;

  /**
   * Slug فريد يُستخدم كمعرف تقني (وسيصبح النطاق الفرعي لاحقاً).
   * أحرف لاتينية صغيرة وأرقام وشرطة فقط.
   */
  @IsString()
  @IsNotEmpty({ message: 'المعرف (slug) مطلوب' })
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'المعرف يجب أن يكون أحرفاً لاتينية صغيرة/أرقاماً بشرطة بين الكلمات',
  })
  slug: string;

  /** بريد مالك الشركة — سيصبح حساب OWNER الأول للـ Tenant. */
  @IsEmail({}, { message: 'بريد المالك غير صالح' })
  @MaxLength(254)
  ownerEmail: string;

  /** اسم مالك الشركة. */
  @IsString()
  @IsNotEmpty({ message: 'اسم المالك مطلوب' })
  @MaxLength(150)
  ownerName: string;

  /**
   * كلمة مرور أولية مؤقتة (يجب أن يغيّرها المالك عند أول دخول).
   * نفس معيار الإدارة الحالي: 12 حرفاً على الأقل.
   */
  @IsString()
  @MinLength(12, { message: 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل' })
  @MaxLength(128)
  initialPassword: string;

  /** اسم الفرع الرئيسي (يُنشأ تلقائياً). الافتراضي: "الفرع الرئيسي". */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  primaryBranchName?: string;

  /** مدينة الفرع الرئيسي. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  primaryBranchCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  organizationPhone?: string;
}
