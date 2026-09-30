import { useState } from "react";
import { Link } from "wouter";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-field";
import { PackageEditor } from "@/components/operations/package-ledger";
import { usePackageCatalog } from "@/lib/packages-api";
import { useI18n, useErrorMessage } from "@/lib/i18n";
export default function PackagesPage() {
  const { lang } = useI18n(),
    ar = lang === "ar",
    errorMessage = useErrorMessage(),
    q = usePackageCatalog(),
    [adding, setAdding] = useState(false);
  return (
    <div className="space-y-5">
      <Link href="/business/services" className="text-sm">
        {ar ? "رجوع للخدمات" : "Back to services"}
      </Link>
      <div className="flex flex-wrap justify-between gap-3">
        <PageHeader title={ar ? "باقات وعروض" : "Packages and offers"} />
        {q.data?.canManage && (
          <Button onClick={() => setAdding(true)} data-testid="new-package">
            {ar ? "+ إنشاء باقة / عرض" : "+ Create package / offer"}
          </Button>
        )}
      </div>
      {q.isPending ? (
        <p role="status">{ar ? "تحميل…" : "Loading…"}</p>
      ) : q.isError ? (
        <FormError message={errorMessage(q.error)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {q.data?.items.map((p) => (
            <article
              className="space-y-3 rounded-2xl border bg-card p-5"
              key={p.id}
              data-testid={`package-template-${p.id}`}
            >
              <h2 className="font-bold">{p.name}</h2>
              {p.items.map((item) => (
                <p className="text-sm" key={item.serviceId}>
                  {item.name} × {item.quantity}
                </p>
              ))}
              <p className="font-semibold">
                <bdi>
                  {(Number(p.originalPrice) - Number(p.discount)).toFixed(3)} JD
                </bdi>
              </p>
              <p className="text-xs text-muted-foreground">
                {ar ? "السعر الأصلي" : "Original price"} {p.originalPrice} ·{" "}
                {ar ? "الخصم" : "Discount"} {p.discount}
              </p>
              <p className="text-xs">
                {ar ? "اقتراح جلسة كل" : "Suggested session every"}{" "}
                {p.intervalDays}{" "}
                {ar
                  ? "أيام، قابل للتعديل عند الحجز"
                  : "days, editable at booking"}
              </p>
            </article>
          ))}
        </div>
      )}
      {!q.isPending && !q.isError && !q.data?.items.length && (
        <p className="rounded-xl border border-dashed p-6 text-sm">
          {ar
            ? "أنشئ باقة من خدمة أو أكثر وحدد عدد الجلسات والسعر."
            : "Create a package with one or more services, quantities and a total price."}
        </p>
      )}
      {adding && (
        <PackageEditor onClose={() => setAdding(false)} onSaved={() => {}} />
      )}
    </div>
  );
}
