import { Order } from "@/features/marketplace/types";

export type OrderTabType =
  | "PENDING"
  | "PROCESSING"
  | "FULFILLED"
  | "PENDING_PAYMENT"
  | "UNDER_REVIEW";

// Deep links (?tab=) from the payment flows land on the matching tab
export const AUTO_TABS: Record<string, OrderTabType> = {
  incomplete: "PENDING_PAYMENT",
  review: "UNDER_REVIEW",
};

export const filterOrdersByTab = (orders: Order[], tab: OrderTabType) => {
  return orders.filter((order) => {
    // Always exclude empty draft orders — these are leftover cart artifacts
    if (order.status === "DRAFT" || !order.items || order.items.length === 0) {
      return false;
    }

    switch (tab) {
      case "PENDING":
        return order.status === "CONFIRMED";
      case "PROCESSING":
        return order.status === "IN_PROGRESS";
      case "PENDING_PAYMENT":
        // Claimed payments move to the "Under review" tab until an admin decides
        return (
          order.status === "PENDING_PAYMENT" &&
          order.paymentClaimStatus !== "PENDING"
        );
      case "UNDER_REVIEW":
        return (
          order.status === "PENDING_PAYMENT" &&
          order.paymentClaimStatus === "PENDING"
        );
      case "FULFILLED":
        return order.status === "COMPLETED";
      default:
        return false;
    }
  });
};
