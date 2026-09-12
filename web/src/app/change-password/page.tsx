import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { ChangePasswordForm } from "./change-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "تغيير كلمة المرور المؤقتة — Ticketty",
  description: "اختر كلمة مرور دائمة قبل متابعة استخدام Ticketty.",
};

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background p-4"
      dir="rtl"
    >
      <Card className="w-full max-w-lg">
        <CardHeader className="border-b text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <KeyRound aria-hidden="true" className="h-6 w-6" />
          </div>
          <CardTitle className="font-display text-xl">
            غيّر كلمة المرور المؤقتة
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            لحماية حساب {user.name}، يجب اختيار كلمة مرور دائمة قبل الوصول إلى
            مساحة العمل.
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <ChangePasswordForm />
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            لن تتاح عمليات النظام قبل إتمام هذه الخطوة.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
