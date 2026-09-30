import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FormField, FormError } from "@/components/form-field";
import { SelectField, CheckField } from "@/components/setup/controls";
import { useI18n, useErrorMessage } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/setup-api";
import {
  usePackageCatalog,
  useCustomerBilling,
  useBillingCommand,
  emptyPlan,
  paymentMethods,
  methodNames,
  statusNames,
  type Plan,
  type PackageTemplate,
  type PackageItem,
  type PatientPackage,
  type Invoice,
} from "@/lib/packages-api";

function Money({ value }: { value: string }) {
  return <bdi dir="ltr">{value} JD</bdi>;
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { dir } = useI18n();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        dir={dir}
        className="max-h-[90dvh] overflow-y-auto max-w-xl"
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{title}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function PlanFields({
  value,
  onChange,
}: {
  value: Plan;
  onChange: (v: Plan) => void;
}) {
  const { lang } = useI18n(),
    ar = lang === "ar";
  return (
    <details className="rounded-xl border p-3">
      <summary className="cursor-pointer font-medium">
        {ar ? "الأقساط وسياسة الدفع" : "Payment plan and policy"}
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SelectField
          label={ar ? "سياسة الدفع" : "Payment policy"}
          value={value.policy}
          onChange={(policy) =>
            onChange({ ...value, policy: policy as Plan["policy"] })
          }
          testId="package-policy"
        >
          <option value="warning">{ar ? "تنبيه فقط" : "Warning only"}</option>
          <option value="minimum">
            {ar ? "يشترط الحد الأدنى" : "Require minimum payment"}
          </option>
          <option value="full">
            {ar ? "يشترط الدفع الكامل" : "Require full payment"}
          </option>
        </SelectField>
        {(
          ["initialPayment", "installmentAmount", "minimumPerSession"] as const
        ).map((key, index) => (
          <FormField
            key={key}
            label={
              (ar
                ? [
                    "عند التسجيل (JD)",
                    "دفعة كل عدد جلسات (JD)",
                    "الحد الأدنى لكل جلسة (JD)",
                  ]
                : [
                    "At registration (JD)",
                    "Installment amount (JD)",
                    "Minimum per session (JD)",
                  ])[index]!
            }
            type="number"
            min="0"
            step="0.001"
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            testId={`package-${key}`}
          />
        ))}
        <FormField
          label={
            ar ? "دفعة كل كم جلسة؟" : "Installment every how many sessions?"
          }
          type="number"
          min="1"
          max="1000"
          value={value.everySessions}
          onChange={(e) =>
            onChange({ ...value, everySessions: Number(e.target.value) })
          }
          testId="package-everySessions"
        />
        <CheckField
          label={
            ar
              ? "يسمح للمدير بالتجاوز مع ذكر السبب"
              : "Manager may override with a reason"
          }
          checked={value.allowManagerOverride}
          onChange={(allowManagerOverride) =>
            onChange({ ...value, allowManagerOverride })
          }
          testId="package-allowOverride"
        />
      </div>
    </details>
  );
}
export function PackageEditor({
  template,
  onClose,
  onSaved,
  customerId,
}: {
  template?: PackageTemplate;
  customerId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useI18n(),
    ar = lang === "ar",
    errorMessage = useErrorMessage(),
    catalog = usePackageCatalog();
  const [name, setName] = useState(template?.name ?? ""),
    [items, setItems] = useState<PackageItem[]>(template?.items ?? []),
    [price, setPrice] = useState(template?.originalPrice ?? "0"),
    [discount, setDiscount] = useState(template?.discount ?? "0"),
    [interval, setInterval] = useState(template?.intervalDays ?? 7),
    [expiry, setExpiry] = useState(template?.expiryDays?.toString() ?? ""),
    [plan, setPlan] = useState<Plan>(template?.plan ?? { ...emptyPlan }),
    [depositPolicy, setDepositPolicy] = useState("refundable");
  const command = useBillingCommand(() => {
    onSaved();
    onClose();
  });
  return (
    <Modal
      title={
        customerId
          ? ar
            ? "إضافة باقة للمريض"
            : "Assign patient package"
          : ar
            ? "باقة أو عرض جديد"
            : "New package or offer"
      }
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const body = customerId
            ? {
                templateId: template!.id,
                items: items.map(({ serviceId, quantity }) => ({
                  serviceId,
                  quantity,
                })),
                originalPrice: price,
                discount,
                intervalDays: interval,
                plan,
                depositPolicy,
              }
            : {
                name,
                items: items.map(({ serviceId, quantity }) => ({
                  serviceId,
                  quantity,
                })),
                originalPrice: price,
                discount,
                intervalDays: interval,
                expiryDays: expiry ? Number(expiry) : null,
                plan,
              };
          command.mutate({
            path: customerId
              ? `/clinic/billing/customers/${customerId}/packages`
              : "/clinic/billing/packages",
            body,
          });
        }}
      >
        <fieldset disabled={command.isPending} className="space-y-4">
          {!customerId && (
            <FormField
              label={ar ? "اسم الباقة / العرض" : "Package / offer name"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={160}
              testId="package-name"
            />
          )}
          <div className="space-y-3">
            <p className="font-medium">
              {ar ? "الخدمات وعدد جلساتها" : "Services and sessions"}
            </p>
            {items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_85px_auto] items-end gap-2"
              >
                <SelectField
                  label={ar ? "الخدمة" : "Service"}
                  value={item.serviceId || ""}
                  onChange={(v) =>
                    setItems(
                      items.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              serviceId: Number(v),
                              name:
                                catalog.data?.services.find(
                                  (s) => s.id === Number(v),
                                )?.name ?? "",
                            }
                          : row,
                      ),
                    )
                  }
                  testId={`package-service-${index}`}
                >
                  <option value="">{ar ? "اختر" : "Select"}</option>
                  {catalog.data?.services.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      disabled={items.some(
                        (r, i) => i !== index && r.serviceId === s.id,
                      )}
                    >
                      {s.name}
                    </option>
                  ))}
                </SelectField>
                <FormField
                  label={ar ? "الجلسات" : "Sessions"}
                  type="number"
                  min="1"
                  max="1000"
                  value={item.quantity}
                  onChange={(e) =>
                    setItems(
                      items.map((row, i) =>
                        i === index
                          ? { ...row, quantity: Number(e.target.value) }
                          : row,
                      ),
                    )
                  }
                  required
                  testId={`package-quantity-${index}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  aria-label={ar ? "حذف الخدمة" : "Remove service"}
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setItems([...items, { serviceId: 0, name: "", quantity: 1 }])
              }
              data-testid="package-add-service"
            >
              {ar ? "+ إضافة خدمة" : "+ Add service"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label={ar ? "السعر الأصلي (JD)" : "Original price (JD)"}
              type="number"
              min="0"
              step="0.001"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              testId="package-price"
            />
            <FormField
              label={ar ? "الخصم (JD)" : "Discount (JD)"}
              type="number"
              min="0"
              step="0.001"
              required
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              testId="package-discount"
            />
            <FormField
              label={ar ? "بين الجلسات (أيام)" : "Days between sessions"}
              type="number"
              min="1"
              max="365"
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              testId="package-interval"
            />
            {!customerId && (
              <FormField
                label={
                  ar ? "صلاحية بالأيام (اختياري)" : "Valid days (optional)"
                }
                type="number"
                min="1"
                max="3650"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                testId="package-expiry"
              />
            )}
          </div>
          <p className="rounded-lg bg-muted p-3 text-sm">
            {ar ? "الإجمالي" : "Total"}:{" "}
            <Money
              value={Math.max(0, Number(price) - Number(discount)).toFixed(3)}
            />{" "}
            · {items.reduce((n, i) => n + i.quantity, 0)}{" "}
            {ar ? "جلسة" : "sessions"}
          </p>
          <PlanFields value={plan} onChange={setPlan} />
          {customerId && (
            <SelectField
              label={
                ar ? "سياسة العربون عند الإلغاء" : "Deposit cancellation policy"
              }
              value={depositPolicy}
              onChange={setDepositPolicy}
              testId="package-deposit-policy"
            >
              <option value="refundable">
                {ar ? "قابل للاسترداد" : "Refundable"}
              </option>
              <option value="non_refundable">
                {ar ? "غير قابل للاسترداد" : "Non refundable"}
              </option>
              <option value="wallet">
                {ar ? "يتحوّل لرصيد محفظة" : "Wallet credit"}
              </option>
            </SelectField>
          )}
          <FormError
            message={
              command.error
                ? errorMessage(command.error)
                : catalog.error
                  ? errorMessage(catalog.error)
                  : undefined
            }
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={
                !items.length ||
                items.some((i) => !i.serviceId) ||
                !price ||
                !discount
              }
              data-testid="package-save"
            >
              {ar ? "حفظ الباقة" : "Save package"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              {ar ? "رجوع" : "Back"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function InvoiceCard({
  invoice,
  manage,
  canOverride,
  wallet,
}: {
  invoice: Invoice;
  manage: boolean;
  canOverride: boolean;
  wallet: string;
}) {
  const { lang } = useI18n(),
    ar = lang === "ar",
    errorMessage = useErrorMessage(),
    f = invoice.financial;
  const [mode, setMode] = useState<"payment" | "refund" | null>(null),
    [kind, setKind] = useState("payment"),
    [lines, setLines] = useState([
      { method: "cash", amount: "", reference: "" },
    ]),
    [note, setNote] = useState(""),
    [refund, setRefund] = useState({
      amount: "",
      source: "payment",
      destination: "cash",
    });
  const command = useBillingCommand(() => {
    setMode(null);
    setNote("");
    setLines([{ method: "cash", amount: "", reference: "" }]);
  });
  return (
    <div className="space-y-3" data-testid={`invoice-${invoice.id}`}>
      <div className="grid gap-2 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-3">
        <p>
          {ar ? "الإجمالي" : "Total"}{" "}
          <strong className="block">
            <Money value={f.total} />
          </strong>
        </p>
        <p>
          {ar ? "المدفوع" : "Paid"}{" "}
          <strong className="block">
            <Money value={f.paid} />
          </strong>
        </p>
        <p>
          {ar ? "المتبقي" : "Remaining"}{" "}
          <strong
            className="block text-primary"
            data-testid={`invoice-balance-${invoice.id}`}
          >
            <Money value={f.balance} />
          </strong>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {(statusNames[f.status] ?? [f.status, f.status])[ar ? 0 : 1]} ·{" "}
        {ar ? "السعر الأصلي" : "Original"} <Money value={f.originalPrice} /> ·{" "}
        {ar ? "خصم" : "Discount"} <Money value={f.discount} />
        {Number(f.deposit) > 0 && (
          <>
            {" "}
            · {ar ? "العربون" : "Deposit"} <Money value={f.deposit} />
          </>
        )}
      </p>
      {manage && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={Number(f.balance) <= 0}
            onClick={() => {
              setKind("payment");
              setMode("payment");
            }}
            data-testid={`invoice-record-payment-${invoice.id}`}
          >
            {ar ? "+ تسجيل دفعة" : "+ Record payment"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={Number(f.balance) <= 0}
            onClick={() => {
              setKind("deposit");
              setMode("payment");
            }}
          >
            {ar ? "تسجيل عربون" : "Record deposit"}
          </Button>
          {canOverride && (
            <Button
              size="sm"
              variant="outline"
              disabled={Number(f.paid) <= 0}
              onClick={() => setMode("refund")}
            >
              {ar ? "استرداد / تحويل للمحفظة" : "Refund / wallet credit"}
            </Button>
          )}
        </div>
      )}
      {invoice.appointmentId !== null && invoice.payments.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            {ar ? "سجل الدفعات" : "Payment history"}
          </summary>
          {invoice.payments.map((e) => (
            <p key={e.id} className="mt-2 text-xs">
              {new Intl.DateTimeFormat(ar ? "ar-JO" : "en-GB", {
                timeZone: "Asia/Amman",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(e.createdAt))}{" "}
              ·{" "}
              {e.kind.includes("refund") || e.kind === "deposit_wallet"
                ? ar
                  ? "استرداد"
                  : "Refund"
                : e.kind === "deposit"
                  ? ar
                    ? "عربون"
                    : "Deposit"
                  : ar
                    ? "دفعة"
                    : "Payment"}{" "}
              · {methodNames[e.method]?.[ar ? 0 : 1]} ·{" "}
              <Money value={e.amount} /> · {e.actor} {e.reference} {e.note}
            </p>
          ))}
        </details>
      )}
      {mode && (
        <Modal
          title={
            mode === "refund"
              ? ar
                ? "استرداد دفعة"
                : "Refund payment"
              : kind === "deposit"
                ? ar
                  ? "تسجيل عربون"
                  : "Record deposit"
                : ar
                  ? "تسجيل دفعة"
                  : "Record payment"
          }
          onClose={() => setMode(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              command.mutate({
                path: `/clinic/billing/invoices/${invoice.id}/${mode === "refund" ? "refunds" : "payments"}`,
                body:
                  mode === "refund"
                    ? { ...refund, note }
                    : { kind, lines, note },
              });
            }}
          >
            <fieldset disabled={command.isPending} className="space-y-4">
              {mode === "payment" ? (
                <>
                  <p className="text-sm">
                    {ar ? "المتبقي" : "Balance"}: <Money value={f.balance} /> ·{" "}
                    {ar ? "المحفظة" : "Wallet"}: <Money value={wallet} />
                  </p>
                  {lines.map((line, index) => (
                    <div
                      key={index}
                      className="space-y-2 rounded-xl border p-3"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          label={ar ? "المبلغ (JD)" : "Amount (JD)"}
                          value={line.amount}
                          type="number"
                          min="0.001"
                          step="0.001"
                          required
                          onChange={(e) =>
                            setLines(
                              lines.map((row, i) =>
                                i === index
                                  ? { ...row, amount: e.target.value }
                                  : row,
                              ),
                            )
                          }
                          testId={`payment-amount-${index}`}
                        />
                        <SelectField
                          label={ar ? "طريقة الدفع" : "Method"}
                          value={line.method}
                          onChange={(method) =>
                            setLines(
                              lines.map((row, i) =>
                                i === index ? { ...row, method } : row,
                              ),
                            )
                          }
                          testId={`payment-method-${index}`}
                        >
                          {paymentMethods
                            .filter((m) => kind !== "deposit" || m !== "wallet")
                            .map((m) => (
                              <option key={m} value={m}>
                                {methodNames[m]![ar ? 0 : 1]}
                              </option>
                            ))}
                        </SelectField>
                      </div>
                      <FormField
                        label={ar ? "المرجع (اختياري)" : "Reference (optional)"}
                        value={line.reference}
                        maxLength={200}
                        onChange={(e) =>
                          setLines(
                            lines.map((row, i) =>
                              i === index
                                ? { ...row, reference: e.target.value }
                                : row,
                            ),
                          )
                        }
                        testId={`payment-reference-${index}`}
                      />
                      {lines.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setLines(lines.filter((_, i) => i !== index))
                          }
                        >
                          {ar ? "حذف" : "Remove"}
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={lines.length >= 10}
                    onClick={() =>
                      setLines([
                        ...lines,
                        { method: "visa", amount: "", reference: "" },
                      ])
                    }
                    data-testid="payment-add-split"
                  >
                    {ar ? "+ تقسيم الدفع لطريقة أخرى" : "+ Split payment"}
                  </Button>
                </>
              ) : (
                <>
                  <FormField
                    label={ar ? "المبلغ (JD)" : "Amount (JD)"}
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={refund.amount}
                    onChange={(e) =>
                      setRefund({ ...refund, amount: e.target.value })
                    }
                    testId="refund-amount"
                  />
                  <SelectField
                    label={ar ? "مصدر المبلغ" : "Source"}
                    value={refund.source}
                    onChange={(source) => setRefund({ ...refund, source })}
                    testId="refund-source"
                  >
                    <option value="payment">{ar ? "دفعة" : "Payment"}</option>
                    <option value="deposit">{ar ? "عربون" : "Deposit"}</option>
                  </SelectField>
                  <SelectField
                    label={ar ? "الوجهة" : "Destination"}
                    value={refund.destination}
                    onChange={(destination) =>
                      setRefund({ ...refund, destination })
                    }
                    testId="refund-destination"
                  >
                    {paymentMethods.map((m) => (
                      <option key={m} value={m}>
                        {methodNames[m]![ar ? 0 : 1]}
                      </option>
                    ))}
                  </SelectField>
                  <p className="text-xs">
                    {ar ? "سياسة العربون" : "Deposit policy"}:{" "}
                    {invoice.depositPolicy === "wallet"
                      ? ar
                        ? "رصيد محفظة"
                        : "Wallet"
                      : invoice.depositPolicy === "non_refundable"
                        ? ar
                          ? "غير قابل للاسترداد"
                          : "Non refundable"
                        : ar
                          ? "قابل للاسترداد"
                          : "Refundable"}
                  </p>
                </>
              )}
              <FormField
                label={ar ? "ملاحظة" : "Note"}
                value={note}
                maxLength={1000}
                required={mode === "refund"}
                onChange={(e) => setNote(e.target.value)}
                testId="payment-note"
              />
              <FormError
                message={
                  command.error ? errorMessage(command.error) : undefined
                }
              />
              <Button type="submit" data-testid="payment-save">
                {ar ? "حفظ" : "Save"}
              </Button>
            </fieldset>
          </form>
        </Modal>
      )}
    </div>
  );
}
function PackageCard({
  p,
  manage,
  canOverride,
  wallet,
}: {
  p: PatientPackage;
  manage: boolean;
  canOverride: boolean;
  wallet: string;
}) {
  const { lang } = useI18n(),
    ar = lang === "ar",
    errorMessage = useErrorMessage(),
    [useOpen, setUseOpen] = useState(false),
    [serviceId, setServiceId] = useState(p.items[0]?.serviceId ?? 0),
    [note, setNote] = useState(""),
    [reason, setReason] = useState(""),
    [status, setStatus] = useState("");
  const command = useBillingCommand(() => {
    setUseOpen(false);
    setStatus("");
  });
  const timeline = [
    {
      id: "created",
      at: p.createdAt,
      label: ar ? "إنشاء الباقة" : "Package created",
      amount: p.invoice.financial.total,
      actor: p.creator,
    },
    ...p.invoice.payments.map((e) => ({
      id: "p" + e.id,
      at: e.createdAt,
      label:
        (e.kind.includes("refund") || e.kind === "deposit_wallet"
          ? ar
            ? "استرداد"
            : "Refund"
          : e.kind === "deposit"
            ? ar
              ? "عربون"
              : "Deposit"
            : ar
              ? "دفعة"
              : "Payment") +
        " · " +
        (methodNames[e.method]?.[ar ? 0 : 1] ?? e.method),
      amount: e.amount,
      actor: e.actor,
      note: e.note,
      reference: e.reference,
    })),
    ...p.sessions.map((e, index) => ({
      id: "s" + e.id,
      at: e.createdAt,
      label: `${ar ? "جلسة" : "Session"} #${index + 1} · ${p.items.find((i) => i.serviceId === e.serviceId)?.name ?? ""}`,
      amount: "",
      actor: e.actor,
      note: e.note,
      appointmentId: e.appointmentId,
    })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <article
      className="space-y-4 rounded-xl border bg-card p-4"
      data-testid={`patient-package-${p.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{p.name}</h3>
        <span className="rounded-full bg-muted px-3 py-1 text-xs">
          {statusNames[p.status]?.[ar ? 0 : 1] ?? p.status}
        </span>
      </div>
      <div className="rounded-xl border p-3">
        <p className="font-semibold" data-testid={`package-sessions-${p.id}`}>
          {p.used} / {p.totalSessions} {ar ? "جلسات مستخدمة" : "sessions used"}
        </p>
        <p className="text-sm">
          {p.remaining} {ar ? "جلسات متبقية" : "sessions remaining"}
        </p>
        <progress
          className="mt-2 h-2 w-full"
          value={p.used}
          max={p.totalSessions}
        />
        {p.items.map((item) => (
          <p key={item.serviceId} className="text-xs text-muted-foreground">
            {item.name}: {item.used ?? 0} / {item.quantity}
          </p>
        ))}
      </div>
      <InvoiceCard
        invoice={p.invoice}
        manage={manage}
        canOverride={canOverride}
        wallet={wallet}
      />
      <details className="text-xs">
        <summary className="cursor-pointer">
          {ar ? "خطة الدفع والصلاحية" : "Payment plan and validity"}
        </summary>
        <div className="mt-2 space-y-1">
          <p>
            {ar ? "السياسة" : "Policy"}:{" "}
            {p.plan.policy === "full"
              ? ar
                ? "الدفع الكامل"
                : "Full payment"
              : p.plan.policy === "minimum"
                ? ar
                  ? "يشترط الحد الأدنى"
                  : "Minimum required"
                : ar
                  ? "تنبيه فقط"
                  : "Warning only"}
          </p>
          <p>
            {ar ? "عند التسجيل" : "At registration"}:{" "}
            <Money value={p.plan.initialPayment} />
          </p>
          <p>
            <Money value={p.plan.installmentAmount} /> {ar ? "كل" : "every"}{" "}
            {p.plan.everySessions} {ar ? "جلسات" : "sessions"}
          </p>
          <p>
            {ar ? "الحد الأدنى لكل جلسة" : "Minimum per session"}:{" "}
            <Money value={p.plan.minimumPerSession} />
          </p>
          {p.expiresAt && (
            <p>
              {ar ? "تنتهي" : "Expires"}:{" "}
              {new Intl.DateTimeFormat(ar ? "ar-JO" : "en-GB", {
                timeZone: "Asia/Amman",
                dateStyle: "medium",
              }).format(new Date(p.expiresAt))}
            </p>
          )}
        </div>
      </details>
      {manage && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={p.status !== "active" || p.remaining <= 0}
            onClick={() => setUseOpen(true)}
            data-testid={`package-use-session-${p.id}`}
          >
            {ar ? "استخدام جلسة" : "Use session"}
          </Button>
          <Link
            className="rounded-lg border px-3 py-2 text-xs"
            href={`/appointments/new?customerId=${p.customerId}&packageId=${p.id}`}
          >
            {ar ? "حجز جلسات" : "Book sessions"}
          </Link>
          {canOverride && ["active", "frozen"].includes(p.status) && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setStatus(p.status === "active" ? "frozen" : "active")
                }
              >
                {p.status === "active"
                  ? ar
                    ? "تجميد"
                    : "Freeze"
                  : ar
                    ? "تفعيل"
                    : "Activate"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus("cancelled")}
              >
                {ar ? "إلغاء الباقة" : "Cancel package"}
              </Button>
            </>
          )}
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {ar ? "سجل الدفعات والجلسات" : "Payment and session timeline"}
        </summary>
        <ol className="mt-3 space-y-3">
          {timeline.map((e) => (
            <li key={e.id} className="border-s-2 ps-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{e.label}</strong>
                {e.amount && <Money value={e.amount} />}
              </div>
              <p>
                {new Intl.DateTimeFormat(ar ? "ar-JO" : "en-GB", {
                  timeZone: "Asia/Amman",
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(e.at))}{" "}
                · {e.actor}
              </p>
              {"note" in e && e.note && <p>{e.note}</p>}
              {"reference" in e && e.reference && <p>{e.reference}</p>}
            </li>
          ))}
        </ol>
      </details>
      {useOpen && (
        <Modal
          title={ar ? "استخدام جلسة" : "Use session"}
          onClose={() => setUseOpen(false)}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              command.mutate({
                path: `/clinic/billing/patient-packages/${p.id}/sessions`,
                body: { serviceId, note, overrideReason: reason },
              });
            }}
          >
            <SelectField
              label={ar ? "الخدمة" : "Service"}
              value={serviceId}
              onChange={(v) => setServiceId(Number(v))}
              testId="use-session-service"
            >
              {p.items.map((item) => (
                <option
                  key={item.serviceId}
                  value={item.serviceId}
                  disabled={(item.used ?? 0) >= item.quantity}
                >
                  {item.name}
                </option>
              ))}
            </SelectField>
            <p className="text-xs">
              {ar
                ? "الجلسة تُسجّل بعد تنفيذها. الموعد المحجوز ينقص جلسة تلقائيًا عند إكماله."
                : "Record after treatment. A booked appointment uses a session automatically when completed."}
            </p>
            <FormField
              label={ar ? "ملاحظة" : "Note"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              testId="use-session-note"
            />
            {canOverride && p.plan.allowManagerOverride && (
              <FormField
                label={
                  ar
                    ? "سبب تجاوز شرط الدفع (عند الحاجة)"
                    : "Payment override reason (if needed)"
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                testId="use-session-override"
              />
            )}
            <FormError
              message={command.error ? errorMessage(command.error) : undefined}
            />
            <Button
              disabled={command.isPending}
              type="submit"
              data-testid="use-session-save"
            >
              {ar ? "تأكيد استخدام الجلسة" : "Confirm session"}
            </Button>
          </form>
        </Modal>
      )}
      {status && (
        <Modal
          title={ar ? "تغيير حالة الباقة" : "Change package status"}
          onClose={() => setStatus("")}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              command.mutate({
                path: `/clinic/billing/patient-packages/${p.id}/status`,
                body: { status, reason },
              });
            }}
          >
            <p className="text-sm">
              {ar
                ? "الإلغاء يلغي مواعيد الباقة التي لم تبدأ. الدفعات والرصيد تبقى محفوظة، واستردادها يتم بشكل منفصل."
                : "Cancellation cancels package appointments that have not started. Payments and the outstanding balance are preserved. Refund payments separately."}
            </p>
            <FormField
              label={ar ? "السبب" : "Reason"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              testId="package-status-reason"
            />
            <FormError
              message={command.error ? errorMessage(command.error) : undefined}
            />
            <Button type="submit" disabled={command.isPending}>
              {ar ? "تأكيد" : "Confirm"}
            </Button>
          </form>
        </Modal>
      )}
    </article>
  );
}
export function PatientPackages({ customerId }: { customerId: number }) {
  const { lang } = useI18n(),
    ar = lang === "ar",
    errorMessage = useErrorMessage(),
    q = useCustomerBilling(customerId),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<PackageTemplate | null>(null),
    [walletOpen, setWalletOpen] = useState(false),
    [amount, setAmount] = useState(""),
    [note, setNote] = useState(""),
    catalog = usePackageCatalog(adding),
    command = useBillingCommand(() => setWalletOpen(false));
  if (q.isPending)
    return (
      <p role="status">
        {ar ? "تحميل الباقات والدفعات…" : "Loading packages and payments…"}
      </p>
    );
  if (q.isError) return <FormError message={errorMessage(q.error)} />;
  const b = q.data;
  return (
    <section className="space-y-4" data-testid="patient-packages">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">
          {ar ? "الباقات والدفعات" : "Packages and payments"}
        </h2>
        {b.canManage && (
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            data-testid="patient-add-package"
          >
            {ar ? "+ إضافة باقة" : "+ Add package"}
          </Button>
        )}
      </div>
      <div className="rounded-xl border p-3">
        <p className="font-semibold">
          {ar ? "رصيد المحفظة" : "Wallet balance"}: <Money value={b.wallet} />
        </p>
        {b.canManage && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => setWalletOpen(true)}
            data-testid="wallet-credit"
          >
            {ar ? "+ إضافة رصيد" : "+ Add credit"}
          </Button>
        )}
        <details className="mt-2">
          <summary className="cursor-pointer text-xs">
            {ar ? "حركات المحفظة" : "Wallet history"}
          </summary>
          {b.walletEntries.map((e) => (
            <p className="mt-2 text-xs" key={e.id}>
              <Money value={e.amount} /> · {e.note} · {e.actor}
            </p>
          ))}
        </details>
      </div>
      {!b.packages.length && (
        <p className="text-sm text-muted-foreground">
          {ar ? "لا توجد باقات للمريض بعد." : "No packages yet."}
        </p>
      )}
      {b.packages.map((p) => (
        <PackageCard
          key={p.id}
          p={p}
          manage={b.canManage}
          canOverride={b.canOverride}
          wallet={b.wallet}
        />
      ))}
      {b.invoices
        .filter((inv) => inv.appointmentId !== null)
        .map((inv) => (
          <div key={inv.id} className="space-y-3 rounded-xl border p-4">
            <h3 className="font-medium">
              {inv.name} ·{" "}
              <Link href={`/appointments/${inv.appointmentId}`}>
                {ar ? "الموعد" : "Appointment"} #{inv.appointmentId}
              </Link>
            </h3>
            <InvoiceCard
              invoice={inv}
              manage={b.canManage}
              canOverride={b.canOverride}
              wallet={b.wallet}
            />
          </div>
        ))}
      {adding && !selected && (
        <Modal
          title={ar ? "اختر الباقة" : "Choose package"}
          onClose={() => setAdding(false)}
        >
          {catalog.isPending ? (
            <p>{ar ? "تحميل…" : "Loading…"}</p>
          ) : catalog.isError ? (
            <FormError message={errorMessage(catalog.error)} />
          ) : (
            <div className="space-y-2">
              {catalog.data?.items
                .filter((p) => p.isActive)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full rounded-xl border p-3 text-start"
                    onClick={() => setSelected(p)}
                    data-testid={`assign-package-${p.id}`}
                  >
                    <strong>{p.name}</strong>
                    <p className="text-xs">
                      {p.items.reduce((n, i) => n + i.quantity, 0)}{" "}
                      {ar ? "جلسة" : "sessions"} ·{" "}
                      <Money
                        value={String(
                          Number(p.originalPrice) - Number(p.discount),
                        )}
                      />
                    </p>
                  </button>
                ))}
              {!catalog.data?.items.length && (
                <Link href="/business/services/packages">
                  {ar
                    ? "إنشاء باقة من الخدمات"
                    : "Create a package from services"}
                </Link>
              )}
            </div>
          )}
        </Modal>
      )}
      {selected && (
        <PackageEditor
          template={selected}
          customerId={customerId}
          onClose={() => {
            setSelected(null);
            setAdding(false);
          }}
          onSaved={() => {}}
        />
      )}
      {walletOpen && (
        <Modal
          title={ar ? "إضافة رصيد للمحفظة" : "Add wallet credit"}
          onClose={() => setWalletOpen(false)}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              command.mutate({
                path: `/clinic/billing/customers/${customerId}/wallet`,
                body: { amount, note },
              });
            }}
          >
            <FormField
              label={ar ? "المبلغ (JD)" : "Amount (JD)"}
              type="number"
              step="0.001"
              min="0.001"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              testId="wallet-amount"
            />
            <FormField
              label={ar ? "سبب / مصدر الرصيد" : "Credit source / reason"}
              value={note}
              required
              onChange={(e) => setNote(e.target.value)}
              testId="wallet-note"
            />
            <FormError
              message={command.error ? errorMessage(command.error) : undefined}
            />
            <Button
              type="submit"
              disabled={command.isPending}
              data-testid="wallet-save"
            >
              {ar ? "حفظ" : "Save"}
            </Button>
          </form>
        </Modal>
      )}
    </section>
  );
}
export function AppointmentLedger({
  appointmentId,
  customerId,
}: {
  appointmentId: number;
  customerId: number;
}) {
  const { lang } = useI18n(),
    ar = lang === "ar",
    errorMessage = useErrorMessage(),
    { user } = useAuth(),
    allowed = can(user, "customers.read"),
    [policy, setPolicy] = useState("refundable"),
    q = useCustomerBilling(allowed ? customerId : 0),
    command = useBillingCommand(),
    invoice = q.data?.invoices.find((i) => i.appointmentId === appointmentId);
  if (!allowed) return null;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">
        {ar ? "التحصيل والعربون" : "Payments and deposit"}
      </h2>
      {invoice ? (
        <InvoiceCard
          invoice={invoice}
          manage={q.data!.canManage}
          canOverride={q.data!.canOverride}
          wallet={q.data!.wallet}
        />
      ) : q.isPending ? (
        <p role="status">{ar ? "تحميل…" : "Loading…"}</p>
      ) : q.isError ? (
        <FormError message={errorMessage(q.error)} />
      ) : (
        q.data?.canManage && (
          <>
            <SelectField
              label={
                ar ? "سياسة العربون عند الإلغاء" : "Deposit cancellation policy"
              }
              value={policy}
              onChange={setPolicy}
              testId="appointment-deposit-policy"
            >
              <option value="refundable">
                {ar ? "قابل للاسترداد" : "Refundable"}
              </option>
              <option value="non_refundable">
                {ar ? "غير قابل للاسترداد" : "Non refundable"}
              </option>
              <option value="wallet">
                {ar ? "رصيد محفظة" : "Wallet credit"}
              </option>
            </SelectField>
            <Button
              type="button"
              disabled={command.isPending}
              onClick={() =>
                command.mutate({
                  path: `/clinic/billing/appointments/${appointmentId}/invoice`,
                  body: { depositPolicy: policy },
                })
              }
              data-testid="appointment-create-invoice"
            >
              {ar
                ? "فتح فاتورة وتسجيل دفعة"
                : "Open invoice and record payment"}
            </Button>
          </>
        )
      )}
      <FormError
        message={command.error ? errorMessage(command.error) : undefined}
      />
    </section>
  );
}
