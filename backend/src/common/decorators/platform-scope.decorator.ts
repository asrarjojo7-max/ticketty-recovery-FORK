import { SetMetadata } from '@nestjs/common';

/**
 * وسم مسارات نطاق المنصة (Platform Scope).
 * المسارات الموسومة تعمل خارج سياق RLS لأي منظمة واحدة — لأنها
 * إما بيانات منصة عابرة للمنظمات (قائمة Tenants) أو إنشاء منظمات
 * جديدة لا يمكن أن يحدث داخل سياق منظمة قائمة (RLS يمنعه).
 *
 * الاعتماد الآمن: يجب دائماً دمجها مع @Permissions('platform.admin')
 * وفحص الانتماء لمنظمة المشغّل داخل الخدمة نفسها (دفاع في العمق).
 * لا تستخدمها لأي مسار عادي أبداً.
 */
export const PLATFORM_SCOPE_KEY = 'platformScope';
export const PlatformScope = () => SetMetadata(PLATFORM_SCOPE_KEY, true);
