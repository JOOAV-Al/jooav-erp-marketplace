/**
 * Optimistic cart mutations for the marketplace.
 *
 * The cart is a DRAFT order on the server. Every cart action now:
 *  1. patches the cached `["order-details", orderNumber]` entry instantly, so
 *     the UI (card highlight, navbar count, drawer, checkout) reacts on click;
 *  2. syncs to the API in the background and replaces the local entry with the
 *     server's authoritative order (no follow-up GET needed).
 *
 * Failures roll back to the pre-click snapshot and surface an error toast.
 * All cart mutations share one TanStack mutation scope so they execute in
 * order (add -> qty -> remove) and can never interleave optimistic states.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDispatch, useStore } from "react-redux";
import { toast } from "sonner";
import { api, CustomAxiosRequestConfig } from "@/lib/api/axiosInstance";
import { updateCartNumber } from "@/redux/slices/authSlice";
import { RootState } from "@/redux/store";
import type {
  MutationResponse,
} from "@/interfaces/general";
import type {
  Order,
  OrderItem,
  Product,
} from "@/features/marketplace/types";

const CART_SCOPE = "cart";

// ── Cache helpers ──────────────────────────────────────────────────────────
// GET /orders/:orderNumber returns `{ success, message, data: <order> }`,
// while POST/PATCH return `{ success, message, data: { order } }`. These
// helpers normalize both shapes into the cached order-details entry.

export interface OrderDetailsCache {
  success?: boolean;
  message?: string;
  data: Order;
}

export const orderDetailsKey = (orderNumber: string) =>
  ["order-details", orderNumber] as const;

interface CartOptimisticContext {
  key: ReturnType<typeof orderDetailsKey>;
  previous?: OrderDetailsCache;
}

export interface CartProductInput {
  id: string;
  name: string;
  price: number;
  thumbnail?: string;
  images?: string[];
  variantName?: string;
  packSizeName?: string;
  packTypeName?: string;
}

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

export function buildOptimisticCartItem(
  input: CartProductInput,
  quantity: number,
): OrderItem {
  const lineTotal = input.price * quantity;
  return {
    id: `optimistic-${input.id}`,
    productId: input.id,
    quantity,
    unitPrice: String(input.price),
    lineTotal: String(lineTotal),
    status: "PENDING",
    // Only the fields the cart UI reads. The server response replaces this
    // entry moments later, so partial data never persists.
    product: {
      id: input.id,
      name: input.name,
      price: String(input.price),
      thumbnail: input.thumbnail ?? input.images?.[0] ?? "",
      images: input.images ?? [],
      variant: input.variantName
        ? { id: "", name: input.variantName }
        : undefined,
      packSize: input.packSizeName
        ? { id: "", name: input.packSizeName }
        : undefined,
      packType: input.packTypeName
        ? { id: "", name: input.packTypeName }
        : undefined,
    } as unknown as Product,
  };
}

function withRecalculatedTotals(order: Order, items: OrderItem[]): Order {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.lineTotal ?? 0),
    0,
  );
  return {
    ...order,
    items,
    subtotal: String(subtotal),
    totalAmount: String(subtotal),
  };
}

export function withAddedItem(order: Order, item: OrderItem): Order {
  return withRecalculatedTotals(order, [...order.items, item]);
}

export function withUpdatedItemQuantity(
  order: Order,
  itemId: string,
  quantity: number,
): Order {
  const items = order.items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          quantity,
          lineTotal: String(Number(item.unitPrice ?? 0) * quantity),
        }
      : item,
  );
  return withRecalculatedTotals(order, items);
}

export function withRemovedItem(order: Order, itemId: string): Order {
  return withRecalculatedTotals(
    order,
    order.items.filter((item) => item.id !== itemId),
  );
}

// ── Shared mutation plumbing ───────────────────────────────────────────────

function notifyCartError(error: unknown) {
  const message =
    (error as { response?: { data?: { message?: string; error?: string } } })
      ?.response?.data?.message ??
    (error as { response?: { data?: { error?: string } } })?.response?.data
      ?.error ??
    (error instanceof Error ? error.message : undefined) ??
    "Something went wrong. Please try again.";
  // Cart requests opt out of the global interceptor toasts; errors surface here.
  toast.error("Failed", {
    style: { backgroundColor: "#F43F5E", borderRadius: "12px" },
    description: message,
    className: "force-white-toast",
  });
}

function rollbackCart(
  queryClient: ReturnType<typeof useQueryClient>,
  error: unknown,
  context: CartOptimisticContext | undefined,
) {
  if (context?.previous !== undefined) {
    queryClient.setQueryData(context.key, context.previous);
  }
  notifyCartError(error);
}

function settleCart(
  queryClient: ReturnType<typeof useQueryClient>,
  context: CartOptimisticContext | undefined,
  order?: Order,
) {
  if (order && context?.key) {
    queryClient.setQueryData<OrderDetailsCache>(context.key, {
      success: true,
      data: order,
    });
  }
  queryClient.invalidateQueries({ queryKey: ["orders-stats"] });
}

const silentRequest = { noToast: true } as CustomAxiosRequestConfig;

// ── Add to cart ────────────────────────────────────────────────────────────

export interface AddToCartInput {
  product: CartProductInput;
  quantity: number;
}

export const useAddToCart = () => {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const store = useStore<RootState>();

  return useMutation({
    scope: { id: CART_SCOPE },
    mutationFn: async ({ product, quantity }: AddToCartInput) => {
      // Resolve the live draft at execution time: a queued add that started
      // before a draft existed must attach to the draft the first add created.
      const orderNumber = store.getState().auth.cartDraftNumber;
      if (!orderNumber) {
        const res = await api.post<MutationResponse<{ order: Order }>>(
          "/orders",
          { items: [{ productId: product.id, quantity }] },
          silentRequest,
        );
        return { created: true as const, order: res.data?.data?.order };
      }
      const res = await api.patch<MutationResponse<{ order: Order }>>(
        `/orders/${orderNumber}`,
        { item: { action: "ADD", productId: product.id, quantity } },
        silentRequest,
      );
      return { created: false as const, order: res.data?.data?.order };
    },
    onMutate: async ({ product, quantity }: AddToCartInput) => {
      const orderNumber = store.getState().auth.cartDraftNumber;
      if (!orderNumber) return undefined;
      const key = orderDetailsKey(orderNumber);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<OrderDetailsCache>(key);
      if (previous?.data) {
        queryClient.setQueryData<OrderDetailsCache>(key, {
          ...previous,
          data: withAddedItem(
            previous.data,
            buildOptimisticCartItem(product, quantity),
          ),
        });
      }
      return { key, previous };
    },
    onError: (error, _input, context) => rollbackCart(queryClient, error, context),
    onSuccess: (result, _input, context) => {
      if (result.created && result.order?.orderNumber) {
        // First item ever: remember the new draft and seed its cache so the
        // marketplace pages render it without a follow-up fetch.
        dispatch(updateCartNumber({ orderNumber: result.order.orderNumber }));
        queryClient.setQueryData<OrderDetailsCache>(
          orderDetailsKey(result.order.orderNumber),
          { success: true, data: result.order },
        );
        queryClient.invalidateQueries({ queryKey: ["orders-stats"] });
        return;
      }
      settleCart(queryClient, context, result.order);
    },
  });
};

// ── Update item quantity ───────────────────────────────────────────────────

export interface UpdateCartQuantityInput {
  orderNumber: string;
  itemId: string;
  productId: string;
  quantity: number;
}

export const useUpdateCartQuantity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    scope: { id: CART_SCOPE },
    mutationFn: async ({
      orderNumber,
      itemId,
      productId,
      quantity,
    }: UpdateCartQuantityInput) => {
      const res = await api.patch<MutationResponse<{ order: Order }>>(
        `/orders/${orderNumber}`,
        { item: { action: "UPDATE", itemId, productId, quantity } },
        silentRequest,
      );
      return res.data?.data?.order;
    },
    onMutate: async ({
      orderNumber,
      itemId,
      quantity,
    }: UpdateCartQuantityInput) => {
      const key = orderDetailsKey(orderNumber);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<OrderDetailsCache>(key);
      if (previous?.data) {
        queryClient.setQueryData<OrderDetailsCache>(key, {
          ...previous,
          data: withUpdatedItemQuantity(previous.data, itemId, quantity),
        });
      }
      return { key, previous };
    },
    onError: (error, _input, context) => rollbackCart(queryClient, error, context),
    onSuccess: (order, _input, context) => settleCart(queryClient, context, order),
  });
};

// ── Remove item ────────────────────────────────────────────────────────────

export interface RemoveCartItemInput {
  orderNumber: string;
  itemId: string;
  productId?: string;
}

export const useRemoveCartItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    scope: { id: CART_SCOPE },
    mutationFn: async ({
      orderNumber,
      itemId,
      productId,
    }: RemoveCartItemInput) => {
      const res = await api.patch<MutationResponse<{ order: Order }>>(
        `/orders/${orderNumber}`,
        { item: { action: "REMOVE", itemId, productId } },
        silentRequest,
      );
      return res.data?.data?.order;
    },
    onMutate: async ({ orderNumber, itemId }: RemoveCartItemInput) => {
      const key = orderDetailsKey(orderNumber);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<OrderDetailsCache>(key);
      if (previous?.data) {
        queryClient.setQueryData<OrderDetailsCache>(key, {
          ...previous,
          data: withRemovedItem(previous.data, itemId),
        });
      }
      return { key, previous };
    },
    onError: (error, _input, context) => rollbackCart(queryClient, error, context),
    onSuccess: (order, _input, context) => settleCart(queryClient, context, order),
  });
};
