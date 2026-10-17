import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { toast } from "sonner";
import authReducer from "@/redux/slices/authSlice";
import { api } from "@/lib/api/axiosInstance";
import {
  buildOptimisticCartItem,
  OrderDetailsCache,
  orderDetailsKey,
  useAddToCart,
  withAddedItem,
  withRemovedItem,
  withUpdatedItemQuantity,
} from "@/features/marketplace/services/cart.api";
import { Order, OrderItem } from "@/features/marketplace/types";

jest.mock("@/lib/api/axiosInstance", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const makeItem = (overrides: Partial<OrderItem> = {}): OrderItem =>
  ({
    id: "item-1",
    productId: "prod-1",
    quantity: 10,
    unitPrice: "100",
    lineTotal: "1000",
    status: "PENDING",
    product: { id: "prod-1", name: "Product one", thumbnail: "img.png" },
    ...overrides,
  }) as OrderItem;

const makeOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: "order-db-1",
    orderNumber: "DRAFT-1",
    items: [makeItem()],
    subtotal: "1000",
    totalAmount: "1000",
    status: "DRAFT",
    ...overrides,
  }) as Order;

function createHarness(draftNumber: string | null) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: null,
        token: null,
        cartDraftNumber: draftNumber,
        isAuthenticated: !!draftNumber,
        isUserLoading: false,
      },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  );
  return { queryClient, store, wrapper };
}

const cachedOrder = (
  queryClient: QueryClient,
  orderNumber: string,
): OrderDetailsCache | undefined =>
  queryClient.getQueryData<OrderDetailsCache>(orderDetailsKey(orderNumber));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("cart optimistic helpers", () => {
  it("builds a cart item from product info", () => {
    const item = buildOptimisticCartItem(
      {
        id: "prod-9",
        name: "Rice",
        price: 250,
        thumbnail: "rice.png",
        packSizeName: "50kg",
      },
      10,
    );

    expect(item.id).toBe("optimistic-prod-9");
    expect(item.productId).toBe("prod-9");
    expect(item.quantity).toBe(10);
    expect(item.lineTotal).toBe("2500");
    expect(item.product.name).toBe("Rice");
    expect(item.product.thumbnail).toBe("rice.png");
    expect(item.product.packSize?.name).toBe("50kg");
  });

  it("falls back to the first image when no thumbnail exists", () => {
    const item = buildOptimisticCartItem(
      { id: "prod-9", name: "Rice", price: 100, images: ["a.png", "b.png"] },
      10,
    );
    expect(item.product.thumbnail).toBe("a.png");
  });

  it("adds an item and recalculates totals", () => {
    const updated = withAddedItem(
      makeOrder(),
      buildOptimisticCartItem({ id: "prod-2", name: "Beans", price: 500 }, 10),
    );

    expect(updated.items).toHaveLength(2);
    expect(updated.items[1].id).toBe("optimistic-prod-2");
    expect(updated.subtotal).toBe("6000");
    expect(updated.totalAmount).toBe("6000");
  });

  it("updates a quantity in place and recalculates totals", () => {
    const updated = withUpdatedItemQuantity(makeOrder(), "item-1", 20);

    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].quantity).toBe(20);
    expect(updated.items[0].lineTotal).toBe("2000");
    expect(updated.subtotal).toBe("2000");
  });

  it("removes an item and recalculates totals", () => {
    const updated = withRemovedItem(makeOrder(), "item-1");

    expect(updated.items).toHaveLength(0);
    expect(updated.subtotal).toBe("0");
    expect(updated.totalAmount).toBe("0");
  });

  it("leaves unrelated items untouched", () => {
    const order = makeOrder({
      items: [makeItem(), makeItem({ id: "item-2", productId: "prod-2" })],
      subtotal: "2000",
      totalAmount: "2000",
    });

    const updated = withRemovedItem(order, "item-1");
    expect(updated.items.map((i) => i.id)).toEqual(["item-2"]);
    expect(updated.subtotal).toBe("1000");
  });
});

describe("useAddToCart", () => {
  it("patches the cached draft immediately and reconciles with the server order", async () => {
    const { queryClient, wrapper } = createHarness("DRAFT-1");
    queryClient.setQueryData(orderDetailsKey("DRAFT-1"), {
      success: true,
      data: makeOrder(),
    });

    let resolvePatch!: (value: unknown) => void;
    (api.patch as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePatch = resolve;
        }),
    );

    const { result } = renderHook(() => useAddToCart(), { wrapper });

    await act(async () => {
      result.current.mutate({
        product: { id: "prod-2", name: "Beans", price: 500 },
        quantity: 10,
      });
    });

    // Visible before the request resolves.
    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(2);
    });
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[1].id).toBe(
      "optimistic-prod-2",
    );
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.subtotal).toBe("6000");
    expect(api.patch).toHaveBeenCalledWith(
      "/orders/DRAFT-1",
      { item: { action: "ADD", productId: "prod-2", quantity: 10 } },
      { noToast: true },
    );

    // The server response replaces the optimistic entry — no refetch needed.
    const serverOrder = makeOrder({
      items: [
        makeItem(),
        makeItem({
          id: "item-2",
          productId: "prod-2",
          unitPrice: "500",
          lineTotal: "5000",
        }),
      ],
      subtotal: "6000",
      totalAmount: "6000",
    });

    await act(async () => {
      resolvePatch({
        data: { success: true, message: "ok", data: { order: serverOrder } },
      });
    });

    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[1].id).toBe(
        "item-2",
      );
    });
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.subtotal).toBe("6000");
  });

  it("rolls back the optimistic add when the server rejects it", async () => {
    const { queryClient, wrapper } = createHarness("DRAFT-1");
    queryClient.setQueryData(orderDetailsKey("DRAFT-1"), {
      success: true,
      data: makeOrder(),
    });

    let rejectPatch!: (reason?: unknown) => void;
    (api.patch as jest.Mock).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectPatch = reject;
        }),
    );

    const { result } = renderHook(() => useAddToCart(), { wrapper });

    await act(async () => {
      result.current.mutate({
        product: { id: "prod-2", name: "Beans", price: 500 },
        quantity: 10,
      });
    });

    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(2);
    });

    await act(async () => {
      rejectPatch({
        response: {
          data: {
            message:
              "Product already exists in order. Use UPDATE action instead.",
          },
        },
      });
    });

    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(1);
    });
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[0].id).toBe("item-1");
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.subtotal).toBe("1000");
    expect(toast.error).toHaveBeenCalled();
  });

  it("creates the draft on the first add and seeds its cache", async () => {
    const { queryClient, store, wrapper } = createHarness(null);

    (api.post as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        message: "Draft order created successfully",
        data: {
          order: makeOrder({
            orderNumber: "DRAFT-9",
            items: [makeItem({ id: "item-9" })],
          }),
        },
      },
    });

    const { result } = renderHook(() => useAddToCart(), { wrapper });

    await act(async () => {
      result.current.mutate({
        product: { id: "prod-1", name: "Rice", price: 100 },
        quantity: 10,
      });
    });

    await waitFor(() => {
      expect(store.getState().auth.cartDraftNumber).toBe("DRAFT-9");
    });
    expect(cachedOrder(queryClient, "DRAFT-9")?.data.items).toHaveLength(1);
    expect(api.post).toHaveBeenCalledWith(
      "/orders",
      { items: [{ productId: "prod-1", quantity: 10 }] },
      { noToast: true },
    );
  });
});
