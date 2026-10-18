/**
 * Serialized optimistic cart mutations for the marketplace.
 *
 * The cart is a DRAFT order on the server. Every cart action:
 *  1. waits for its turn behind any in-flight cart action (one shared
 *     TanStack mutation scope), then patches the cached
 *     `["order-details", orderNumber]` entry so the UI (card highlight,
 *     navbar count, drawer, checkout) reacts immediately;
 *  2. syncs to the API and replaces the local entry with the server's
 *     authoritative order (no follow-up GET needed).
 *
 * Patches run inside `mutationFn`, never `onMutate`: TanStack calls
 * `onMutate` as soon as a mutation is queued — even while the mutation is
 * still paused behind an older one — so patches applied there interleave
 * with older requests. An earlier response settling would then wipe a newer
 * queued patch (the stepper bouncing back, or a just-re-added item
 * disappearing). Inside `mutationFn` the patch is applied exactly when the
 * request is about to fire, so every snapshot (for rollback) and every patch
 * is taken against a cache that already reflects all earlier actions.
 *
 * Item identity is resolved here too, at execution time: items can be
 * optimistically created with `optimistic-*` ids the API never saw, so
 * UPDATE/REMOVE resolve the live item id from the cache by `productId`
 * instead of trusting an id captured at click time. Actions that no longer
 * apply (item gone, add already satisfied) are skipped silently.
 *
 * Failures roll back to the pre-request snapshot and surface an error toast.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDispatch, useStore } from "react-redux";
import { toast } from "sonner";
import { api, CustomAxiosRequestConfig } from "@/lib/api/axiosInstance";
import { updateCartNumber } from "@/redux/slices/authSlice";
import { RootState } from "@/redux/store";
import type { MutationResponse } from "@/interfaces/general";
import type { Order, OrderItem, Product } from "@/features/marketplace/types";

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

type OrderKey = ReturnType<typeof orderDetailsKey>;
type CartQueryClient = ReturnType<typeof useQueryClient>;

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

/** Resolves a cart item by stable product identity, never by its id. */
function findCartItem(
  order: Order | undefined,
  productId: string,
): OrderItem | undefined {
  return order?.items?.find(
    (item) => item.productId === productId || item.product?.id === productId,
  );
}

/**
 * Applies the optimistic patch for the mutation that is executing right now.
 * Runs only from `mutationFn`, after all earlier cart mutations settled, so
 * it can never overwrite a newer patch (and vice versa).
 */
function patchCart(
  queryClient: CartQueryClient,
  key: OrderKey,
  previous: OrderDetailsCache | undefined,
  patch: (order: Order) => Order,
) {
  if (!previous?.data) return;
  queryClient.setQueryData<OrderDetailsCache>(key, {
    ...previous,
    data: patch(previous.data),
  });
}

/** Restores the snapshot taken at this mutation's execution start. */
function restoreCart(
  queryClient: CartQueryClient,
  key: OrderKey,
  previous: OrderDetailsCache | undefined,
) {
  if (previous !== undefined) {
    queryClient.setQueryData(key, previous);
  }
}

function settleCart(
  queryClient: CartQueryClient,
  key: OrderKey,
  order?: Order,
) {
  if (order) {
    queryClient.setQueryData<OrderDetailsCache>(key, {
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

type AddToCartResult =
  | { created: true; order?: Order }
  | { created: false; key: OrderKey; order?: Order }
  | { created: false; skipped: true };

export const useAddToCart = () => {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const store = useStore<RootState>();

  return useMutation({
    scope: { id: CART_SCOPE },
    mutationFn: async ({
      product,
      quantity,
    }: AddToCartInput): Promise<AddToCartResult> => {
      // Resolve the live draft at execution time: a queued add that started
      // before a draft existed must attach to the draft the first add created.
      const orderNumber = store.getState().auth.cartDraftNumber;
      if (!orderNumber) {
        const res = await api.post<MutationResponse<{ order: Order }>>(
          "/orders",
          { items: [{ productId: product.id, quantity }] },
          silentRequest,
        );
        return { created: true, order: res.data?.data?.order };
      }

      const key = orderDetailsKey(orderNumber);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<OrderDetailsCache>(key);
      if (findCartItem(previous?.data, product.id)) {
        // The product reached the cart while this add was queued (an earlier
        // add in the same burst, or another surface). Treat the add as
        // already satisfied: firing it would trip the server's duplicate
        // guard and roll the cart back over the item.
        return { created: false, skipped: true };
      }

      patchCart(queryClient, key, previous, (order) =>
        withAddedItem(order, buildOptimisticCartItem(product, quantity)),
      );

      try {
        const res = await api.patch<MutationResponse<{ order: Order }>>(
          `/orders/${orderNumber}`,
          { item: { action: "ADD", productId: product.id, quantity } },
          silentRequest,
        );
        return { created: false, key, order: res.data?.data?.order };
      } catch (error) {
        restoreCart(queryClient, key, previous);
        notifyCartError(error);
        throw error;
      }
    },
    onSuccess: (result) => {
      if (result.created) {
        if (result.order?.orderNumber) {
          // First item ever: remember the new draft and seed its cache so the
          // marketplace pages render it without a follow-up fetch.
          dispatch(
            updateCartNumber({ orderNumber: result.order.orderNumber }),
          );
          queryClient.setQueryData<OrderDetailsCache>(
            orderDetailsKey(result.order.orderNumber),
            { success: true, data: result.order },
          );
          queryClient.invalidateQueries({ queryKey: ["orders-stats"] });
        }
        return;
      }
      if ("skipped" in result) return;
      settleCart(queryClient, result.key, result.order);
    },
  });
};

// ── Update item quantity ───────────────────────────────────────────────────

export interface UpdateCartQuantityInput {
  orderNumber: string;
  productId: string;
  quantity: number;
}

export const useUpdateCartQuantity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    scope: { id: CART_SCOPE },
    mutationFn: async ({
      orderNumber,
      productId,
      quantity,
    }: UpdateCartQuantityInput) => {
      const key = orderDetailsKey(orderNumber);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<OrderDetailsCache>(key);
      // Resolve the live item id now: click-time ids can still be
      // `optimistic-*` placeholders the API has never seen.
      const item = findCartItem(previous?.data, productId);
      if (!item) {
        // The item left the cart while the update was queued — nothing to do.
        return undefined;
      }

      patchCart(queryClient, key, previous, (order) =>
        withUpdatedItemQuantity(order, item.id, quantity),
      );

      try {
        const res = await api.patch<MutationResponse<{ order: Order }>>(
          `/orders/${orderNumber}`,
          { item: { action: "UPDATE", itemId: item.id, productId, quantity } },
          silentRequest,
        );
        return { key, order: res.data?.data?.order };
      } catch (error) {
        restoreCart(queryClient, key, previous);
        notifyCartError(error);
        throw error;
      }
    },
    onSuccess: (result) => {
      if (result) settleCart(queryClient, result.key, result.order);
    },
  });
};

// ── Remove item ────────────────────────────────────────────────────────────

export interface RemoveCartItemInput {
  orderNumber: string;
  productId: string;
}

export const useRemoveCartItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    scope: { id: CART_SCOPE },
    mutationFn: async ({ orderNumber, productId }: RemoveCartItemInput) => {
      const key = orderDetailsKey(orderNumber);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<OrderDetailsCache>(key);
      const item = findCartItem(previous?.data, productId);
      if (!item) {
        // Already gone (double click, or the add that created it failed).
        return undefined;
      }

      patchCart(queryClient, key, previous, (order) =>
        withRemovedItem(order, item.id),
      );

      try {
        const res = await api.patch<MutationResponse<{ order: Order }>>(
          `/orders/${orderNumber}`,
          { item: { action: "REMOVE", itemId: item.id, productId } },
          silentRequest,
        );
        return { key, order: res.data?.data?.order };
      } catch (error) {
        restoreCart(queryClient, key, previous);
        notifyCartError(error);
        throw error;
      }
    },
    onSuccess: (result) => {
      if (result) settleCart(queryClient, result.key, result.order);
    },
  });
};
