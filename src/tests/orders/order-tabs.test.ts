import {
  AUTO_TABS,
  filterOrdersByTab,
} from "@/features/marketplace/services/orderTabs";
import { Order } from "@/features/marketplace/types";

const order = (overrides: Partial<Order>): Order =>
  ({
    status: "PENDING_PAYMENT",
    paymentClaimStatus: null,
    items: [{ id: "item-1" }],
    ...overrides,
  }) as Order;

describe("filterOrdersByTab", () => {
  it("splits pending-payment orders between 'Initiate payment' and 'Under review'", () => {
    const unclaimed = order({});
    const underReview = order({ paymentClaimStatus: "PENDING" });

    expect(
      filterOrdersByTab([unclaimed, underReview], "PENDING_PAYMENT"),
    ).toEqual([unclaimed]);
    expect(filterOrdersByTab([unclaimed, underReview], "UNDER_REVIEW")).toEqual(
      [underReview],
    );
  });

  it("treats rejected claims as claimable again (Initiate payment)", () => {
    const rejected = order({ paymentClaimStatus: "REJECTED" });

    expect(filterOrdersByTab([rejected], "PENDING_PAYMENT")).toEqual([rejected]);
    expect(filterOrdersByTab([rejected], "UNDER_REVIEW")).toEqual([]);
  });

  it("keeps the existing status tabs unchanged", () => {
    const confirmed = order({ status: "CONFIRMED" });
    const inProgress = order({ status: "IN_PROGRESS" });
    const completed = order({ status: "COMPLETED" });
    const all = [confirmed, inProgress, completed];

    expect(filterOrdersByTab(all, "PENDING")).toEqual([confirmed]);
    expect(filterOrdersByTab(all, "PROCESSING")).toEqual([inProgress]);
    expect(filterOrdersByTab(all, "FULFILLED")).toEqual([completed]);
  });

  it("always excludes drafts and empty carts", () => {
    const draft = order({ status: "DRAFT", paymentClaimStatus: "PENDING" });
    const empty = order({ items: [] });

    expect(filterOrdersByTab([draft, empty], "PENDING_PAYMENT")).toEqual([]);
    expect(filterOrdersByTab([draft, empty], "UNDER_REVIEW")).toEqual([]);
  });
});

describe("AUTO_TABS", () => {
  it("maps payment-flow deep links to their tabs", () => {
    expect(AUTO_TABS["incomplete"]).toBe("PENDING_PAYMENT");
    expect(AUTO_TABS["review"]).toBe("UNDER_REVIEW");
    expect(AUTO_TABS["bogus"]).toBeUndefined();
  });
});
