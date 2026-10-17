"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";
import { AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/general/EmptyState";
import { PageSpinner, Spinner } from "@/components/ui/spinner";
import { RootState } from "@/redux/store";
import { formatCurrency, formatOrderDate } from "@/lib/utils";
import {
  useCreatePaymentClaim,
  useGetOrderDetails,
  useGetPaymentSettings,
} from "@/features/marketplace/services/marketplace.api";

const BACK_LINK_CLASS =
  "inline-flex items-center h-8.5 font-medium text-[15px] leading-[1.2] tracking-[0.04em] text-body hover:text-primary mb-2 transition-colors border border-border-main table-tag bg-storey-foreground p-md rounded-md outline-none";

export default function ManualPaymentPageComponent() {
  const params = useSearchParams();
  const orderNumber = params.get("orderNumber");
  const auth = useSelector((state: RootState) => state.auth);
  const selectedOrderNumber = orderNumber || auth.cartDraftNumber || "";

  const { data, isPending } = useGetOrderDetails({
    orderNumber: selectedOrderNumber,
  });
  const order = data?.data;

  const { data: paymentSettings, isPending: isLoadingSettings } =
    useGetPaymentSettings();
  const accounts = paymentSettings?.manualAccounts ?? [];

  const { mutateAsync: claimPayment, isPending: claiming } =
    useCreatePaymentClaim();

  const handleClaim = async () => {
    if (!order?.orderNumber || claiming) return;
    await claimPayment({ orderNumber: order.orderNumber });
  };

  if (isPending) {
    return (
      <div className="flex min-h-[60vh] justify-center items-center">
        <PageSpinner />
      </div>
    );
  }

  if (!order || !order.items || order.items.length === 0) {
    return (
      <div className="py-24 flex flex-col gap-main max-w-app mx-auto px-4">
        <Link href="/dashboard/orders?tab=incomplete" className={BACK_LINK_CLASS}>
          Back
        </Link>
        <EmptyState
          header="Order not found"
          description="The order you are looking for does not exist or has been removed."
        />
      </div>
    );
  }

  if (order.status !== "DRAFT" && order.status !== "PENDING_PAYMENT") {
    return (
      <div className="py-24 flex flex-col gap-main max-w-app mx-auto px-4">
        <Link href="/dashboard/orders" className={BACK_LINK_CLASS}>
          Back
        </Link>
        <EmptyState
          header="Payment not needed"
          description="This order is no longer awaiting payment."
        />
      </div>
    );
  }

  const isClaimPending = order.paymentClaimStatus === "PENDING";
  const isClaimRejected = order.paymentClaimStatus === "REJECTED";

  return (
    <div className="max-w-app mx-auto py-8 px-4 flex flex-col gap-main">
      <Link
        href={
          isClaimPending
            ? "/dashboard/orders?tab=review"
            : "/dashboard/orders?tab=incomplete"
        }
        className={BACK_LINK_CLASS}
      >
        Back
      </Link>

      <div className="py-md mdx:py-sm flex flex-col gap-2">
        <h2>Complete payment</h2>
        <p className="text-[14px] font-medium leading-[1.5] tracking-[0.03em] text-body-passive">
          Transfer the total to one of the accounts below, then confirm you have
          made the payment.
        </p>
      </div>

      {/* ── Order summary ─────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-storey-foreground px-main py-lg flex items-center justify-between gap-main flex-wrap">
        <div className="flex flex-col gap-5">
          <span className="font-mono text-[12px] py-2 leading-[1.2] tracking-[0.08em] uppercase text-body-passive">
            Order no:
          </span>
          <span className="text-body font-medium text-[14px] leading-[1.5] tracking-[0.04em] uppercase">
            {order.orderNumber}
          </span>
        </div>
        <div className="flex flex-col gap-5 items-end">
          <span className="font-mono text-[12px] py-2 leading-[1.2] tracking-[0.08em] uppercase text-body-passive">
            Amount to transfer:
          </span>
          <h3 className="text-body!">₦{formatCurrency(order.totalAmount)}</h3>
        </div>
      </div>

      {isClaimPending ? (
        <div className="rounded-2xl bg-storey-foreground px-main py-lg flex items-start gap-main">
          <Clock className="mt-1 size-5 shrink-0 text-outline-passive" />
          <div className="flex flex-col gap-2">
            <h4>Payment claim under review</h4>
            <p className="text-[14px] font-medium leading-[1.5] tracking-[0.03em] text-body-passive">
              We received your payment claim
              {order.paymentClaimedAt
                ? ` on ${formatOrderDate(order.paymentClaimedAt)}`
                : ""}
              . Our team will verify the transfer and confirm your order
              shortly.
            </p>
          </div>
        </div>
      ) : (
        <>
          {isClaimRejected && (
            <div className="rounded-2xl bg-storey-foreground px-main py-lg flex items-start gap-main">
              <AlertTriangle className="mt-1 size-5 shrink-0 text-outline-passive" />
              <div className="flex flex-col gap-2">
                <h4>Payment not confirmed</h4>
                <p className="text-[14px] font-medium leading-[1.5] tracking-[0.03em] text-body-passive">
                  {order.paymentClaimRejectionReason ??
                    "The payment could not be verified on our account."}{" "}
                  Check the account details below and submit a new claim if you
                  have paid.
                </p>
              </div>
            </div>
          )}

          {/* ── Bank accounts ───────────────────────────────────────────── */}
          <div className="rounded-2xl bg-storey-foreground px-main py-lg flex flex-col gap-main">
            <div className="flex flex-col gap-2">
              <h4>Bank accounts</h4>
              <p className="text-[14px] font-medium leading-[1.5] tracking-[0.03em] text-body-passive">
                Pay to any of the accounts below.
              </p>
            </div>

            {isLoadingSettings ? (
              <div className="flex justify-center py-main">
                <Spinner />
              </div>
            ) : accounts.length === 0 ? (
              <p className="text-[14px] font-medium leading-[1.5] tracking-[0.03em] text-body-passive">
                No bank accounts are configured right now. Please contact
                support.
              </p>
            ) : (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex flex-col gap-5 rounded-xl border border-border-main bg-white p-main"
                >
                  <div className="flex items-start justify-between gap-main flex-wrap">
                    <div className="flex flex-col gap-5">
                      <span className="font-mono text-[12px] py-2 leading-[1.2] tracking-[0.08em] uppercase text-body-passive">
                        Account name:
                      </span>
                      <span className="text-body font-medium text-[14px] leading-[1.5] tracking-[0.04em]">
                        {account.accountName}
                      </span>
                    </div>
                    <div className="flex flex-col gap-5">
                      <span className="font-mono text-[12px] py-2 leading-[1.2] tracking-[0.08em] uppercase text-body-passive">
                        Bank name:
                      </span>
                      <span className="text-body font-medium text-[14px] leading-[1.5] tracking-[0.04em]">
                        {account.bankName}
                      </span>
                    </div>
                  </div>
                  <div className="h-[0.5px] bg-[#E6E6E6] w-full"></div>
                  <div className="flex flex-col gap-5">
                    <span className="font-mono text-[12px] py-2 leading-[1.2] tracking-[0.08em] uppercase text-body-passive">
                      Account no:
                    </span>
                    <h4 className="text-body">{account.accountNumber}</h4>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── Claim ───────────────────────────────────────────────────── */}
          <Button
            type="button"
            className="w-full gap-4 tracking-[0.02em]"
            disabled={claiming}
            onClick={handleClaim}
          >
            {claiming ? (
              <>
                <Spinner color="white" /> Submitting...
              </>
            ) : (
              "I have made payment"
            )}
          </Button>
          <p className="text-center text-[13px] font-medium leading-[1.5] tracking-[0.03em] text-body-passive">
            Only confirm after you have sent the transfer. Every payment is
            verified before your order is confirmed.
          </p>
        </>
      )}
    </div>
  );
}
