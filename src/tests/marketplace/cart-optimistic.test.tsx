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
  useRemoveCartItem,
  useUpdateCartQuantity,
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const patchResponse = (order: Order) => ({
  data: { success: true, message: "ok", data: { order } },
});

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

describe("cart mutation queue", () => {
  const addInput = (productId: string, quantity = 10) => ({
    product: { id: productId, name: `Product ${productId}`, price: 500 },
    quantity,
  });

  it("patches a queued update only when its turn arrives", async () => {
    const { queryClient, wrapper } = createHarness("DRAFT-1");
    queryClient.setQueryData(orderDetailsKey("DRAFT-1"), {
      success: true,
      data: makeOrder(),
    });

    const addGate = deferred<unknown>();
    (api.patch as jest.Mock).mockImplementation(() => addGate.promise);

    const { result } = renderHook(
      () => ({ add: useAddToCart(), update: useUpdateCartQuantity() }),
      { wrapper },
    );

    await act(async () => {
      result.current.add.mutate(addInput("prod-2"));
    });
    // The add is in flight and shows its optimistic item.
    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(2);
    });

    await act(async () => {
      result.current.update.mutate({
        orderNumber: "DRAFT-1",
        productId: "prod-1",
        quantity: 20,
      });
    });

    // Queued behind the add: no patch, no request, cache untouched.
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[0].quantity).toBe(
      10,
    );
    expect(api.patch).toHaveBeenCalledTimes(1);

    const updateGate = deferred<unknown>();
    (api.patch as jest.Mock).mockImplementationOnce(() => updateGate.promise);

    const serverAfterAdd = makeOrder({
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
      addGate.resolve(patchResponse(serverAfterAdd));
    });

    // Now the update executes: it patches against the settled order and sends
    // the item id resolved at execution time.
    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[0].quantity).toBe(
        20,
      );
    });
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(2);
    });
    expect(api.patch).toHaveBeenLastCalledWith(
      "/orders/DRAFT-1",
      {
        item: {
          action: "UPDATE",
          itemId: "item-1",
          productId: "prod-1",
          quantity: 20,
        },
      },
      { noToast: true },
    );
    // The item added by the earlier mutation survived the settle.
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(2);

    await act(async () => {
      updateGate.resolve(
        patchResponse(
          makeOrder({
            items: [
              makeItem({ quantity: 20, lineTotal: "2000" }),
              makeItem({
                id: "item-2",
                productId: "prod-2",
                unitPrice: "500",
                lineTotal: "5000",
              }),
            ],
            subtotal: "7000",
            totalAmount: "7000",
          }),
        ),
      );
    });

    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.subtotal).toBe("7000");
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("resolves a just-added item's live id and never sends optimistic ids", async () => {
    const { queryClient, wrapper } = createHarness("DRAFT-1");
    queryClient.setQueryData(orderDetailsKey("DRAFT-1"), {
      success: true,
      data: makeOrder(),
    });

    const addGate = deferred<unknown>();
    (api.patch as jest.Mock).mockImplementation(() => addGate.promise);

    const { result } = renderHook(
      () => ({ add: useAddToCart(), update: useUpdateCartQuantity() }),
      { wrapper },
    );

    await act(async () => {
      result.current.add.mutate(addInput("prod-2"));
    });
    // The visible item is still the optimistic placeholder.
    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[1]?.id).toBe(
        "optimistic-prod-2",
      );
    });

    // The user steps the quantity while the add is still in flight.
    await act(async () => {
      result.current.update.mutate({
        orderNumber: "DRAFT-1",
        productId: "prod-2",
        quantity: 15,
      });
    });

    const updateGate = deferred<unknown>();
    (api.patch as jest.Mock).mockImplementationOnce(() => updateGate.promise);

    const serverAfterAdd = makeOrder({
      items: [
        makeItem(),
        makeItem({
          id: "item-2-real",
          productId: "prod-2",
          unitPrice: "500",
          lineTotal: "5000",
        }),
      ],
      subtotal: "6000",
      totalAmount: "6000",
    });
    await act(async () => {
      addGate.resolve(patchResponse(serverAfterAdd));
    });

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(2);
    });
    expect(api.patch).toHaveBeenLastCalledWith(
      "/orders/DRAFT-1",
      {
        item: {
          action: "UPDATE",
          itemId: "item-2-real",
          productId: "prod-2",
          quantity: 15,
        },
      },
      { noToast: true },
    );
    expect(
      JSON.stringify((api.patch as jest.Mock).mock.calls),
    ).not.toContain("optimistic-");
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[1].quantity).toBe(
      15,
    );

    await act(async () => {
      updateGate.resolve(
        patchResponse(
          makeOrder({
            items: [
              makeItem(),
              makeItem({
                id: "item-2-real",
                productId: "prod-2",
                quantity: 15,
                unitPrice: "500",
                lineTotal: "7500",
              }),
            ],
            subtotal: "8500",
            totalAmount: "8500",
          }),
        ),
      );
    });
    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.subtotal).toBe("8500");
    });
  });

  it("keeps a product that was re-added while its remove was in flight", async () => {
    const { queryClient, wrapper } = createHarness("DRAFT-1");
    queryClient.setQueryData(orderDetailsKey("DRAFT-1"), {
      success: true,
      data: makeOrder(),
    });

    const removeGate = deferred<unknown>();
    (api.patch as jest.Mock).mockImplementation(() => removeGate.promise);

    const { result } = renderHook(
      () => ({ add: useAddToCart(), remove: useRemoveCartItem() }),
      { wrapper },
    );

    await act(async () => {
      result.current.remove.mutate({
        orderNumber: "DRAFT-1",
        productId: "prod-1",
      });
    });
    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(0);
    });

    // Re-add the product immediately, while the remove is still in flight.
    await act(async () => {
      result.current.add.mutate(addInput("prod-1"));
    });
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(0);

    const addGate = deferred<unknown>();
    (api.patch as jest.Mock).mockImplementationOnce(() => addGate.promise);

    // The remove settles with the item gone — the queued add must survive it.
    await act(async () => {
      removeGate.resolve(
        patchResponse(
          makeOrder({ items: [], subtotal: "0", totalAmount: "0" }),
        ),
      );
    });

    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(1);
    });
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[0].id).toBe(
      "optimistic-prod-1",
    );

    await act(async () => {
      addGate.resolve(patchResponse(makeOrder()));
    });
    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[0].id).toBe(
        "item-1",
      );
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("rolls back to the snapshot taken when the update executed, not when it was clicked", async () => {
    const { queryClient, wrapper } = createHarness("DRAFT-1");
    queryClient.setQueryData(orderDetailsKey("DRAFT-1"), {
      success: true,
      data: makeOrder(),
    });

    const addGate = deferred<unknown>();
    (api.patch as jest.Mock).mockImplementation(() => addGate.promise);

    const { result } = renderHook(
      () => ({ add: useAddToCart(), update: useUpdateCartQuantity() }),
      { wrapper },
    );

    await act(async () => {
      result.current.add.mutate(addInput("prod-2"));
    });
    await act(async () => {
      result.current.update.mutate({
        orderNumber: "DRAFT-1",
        productId: "prod-1",
        quantity: 20,
      });
    });

    const updateGate = deferred<unknown>();
    (api.patch as jest.Mock).mockImplementationOnce(() => updateGate.promise);

    const serverAfterAdd = makeOrder({
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
      addGate.resolve(patchResponse(serverAfterAdd));
    });
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      updateGate.reject({
        response: {
          data: {
            message:
              "Insufficient stock for product Product two. Available: 12, Requested: 20",
          },
        },
      });
    });

    await waitFor(() => {
      expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[0].quantity).toBe(
        10,
      );
    });
    // The item added while the update was queued must survive the rollback —
    // a click-time snapshot would have dropped it.
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(2);
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items[1].id).toBe("item-2");
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("cart mutation guards", () => {
  it("skips an add when the product is already in the cart", async () => {
    const { queryClient, wrapper } = createHarness("DRAFT-1");
    queryClient.setQueryData(orderDetailsKey("DRAFT-1"), {
      success: true,
      data: makeOrder(),
    });

    const { result } = renderHook(() => useAddToCart(), { wrapper });

    await act(async () => {
      result.current.mutate({
        product: { id: "prod-1", name: "Product one", price: 100 },
        quantity: 10,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual({ created: false, skipped: true });
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("skips an update for an item that is no longer in the cart", async () => {
    const { queryClient, wrapper } = createHarness("DRAFT-1");
    queryClient.setQueryData(orderDetailsKey("DRAFT-1"), {
      success: true,
      data: makeOrder(),
    });

    const { result } = renderHook(() => useUpdateCartQuantity(), { wrapper });

    await act(async () => {
      result.current.mutate({
        orderNumber: "DRAFT-1",
        productId: "prod-9",
        quantity: 20,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.patch).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(cachedOrder(queryClient, "DRAFT-1")?.data.items).toHaveLength(1);
  });

  it("skips a remove for an item that is no longer in the cart", async () => {
    const { queryClient, wrapper } = createHarness("DRAFT-1");
    queryClient.setQueryData(orderDetailsKey("DRAFT-1"), {
      success: true,
      data: makeOrder(),
    });

    const { result } = renderHook(() => useRemoveCartItem(), { wrapper });

    await act(async () => {
      result.current.mutate({ orderNumber: "DRAFT-1", productId: "prod-9" });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.patch).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
