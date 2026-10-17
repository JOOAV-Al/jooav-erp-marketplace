'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useSelector } from 'react-redux';
import { cn } from '@/lib/utils';
import { RootState } from '@/redux/store';
import { useAddToCart } from '@/features/marketplace/services/cart.api';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import AppImage from '@/components/general/AppImage';
import { Order } from '@/features/marketplace/types';

export interface ProductCardData {
  id: string;
  name: string;
  variant?: string;
  price: number;
  image: string;
  currency?: string;
  size?: string;
  type?: string;
}

interface ProductCardProps {
  product: ProductCardData;
  className?: string;
  href?: string;
  userDraftCart?: Order;
}

function formatPrice(amount: number, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}


export default function ProductCard({
  product,
  className,
  userDraftCart,
}: ProductCardProps) {
  const auth = useSelector((state: RootState) => state.auth);
  const isAuthenticated = auth.isAuthenticated;
  const user = auth.user;
  const router = useRouter();
  const existingItem = userDraftCart?.items?.find(
    i => i?.product?.id === product?.id,
  );

  const { mutate: addToCart, isPending: adding } = useAddToCart();
  const [justAdded, setJustAdded] = useState(false);
  const showAsAdded = !!existingItem || justAdded;

  const handleAddToCart = () => {
    const itemToSave = {
      id: product.id,
      productId: product.id,
      name: product.name,
      price: product?.price,
      quantity: 10,
      size: product?.size,
      type: product?.type,
      currency: 'NGN',
    };

    if (isAuthenticated) {
      if (user?.role !== 'WHOLESALER') {
        toast('Only wholesale accounts can add items to a cart');
        return;
      }

      if (existingItem) {
        toast('Product already in cart');
        return;
      }

      // Optimistic: the card shows "added" immediately while the cart syncs
      // to the draft order in the background.
      setJustAdded(true);
      addToCart(
        {
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            thumbnail: product.image,
            packSizeName: product.size,
            packTypeName: product.type,
          },
          quantity: 10,
        },
        { onSettled: () => setJustAdded(false) },
      );
    } else {
      // Else, save to local storage then retrieve and save as draft after login
      localStorage.setItem('tempCartItem', JSON.stringify(itemToSave));
      router.push('/login?fromCart=true');
    }
  };

  return (
    <Link
      href={`/marketplace/product/${product.id}`}
      className={cn(
        'group relative flex flex-col gap-5',
        'hover:border hover:border-border-main hover:rounded-t-2xl transition-all duration-200',
        'overflow-hidden cursor-pointer',
        className,
      )}
    >
      {/* Image area */}
      <div className="relative w-full aspect-square overflow-hidden rounded-t-2xl bg-storey-foreground">
        <AppImage
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover group-hover:scale-105 transition-transform duration-200"
        />

        {/* Cart icon — appears on hover */}
        <button
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            handleAddToCart();
          }}
          disabled={adding || justAdded}
          aria-label="Add to cart"
          className={cn(
            'absolute bottom-2 right-2 z-10',
            'h-8 w-8 rounded-full bg-white shadow-card',
            'flex items-center justify-center',
            'opacity-0 group-hover:opacity-100',
            'translate-y-2 group-hover:translate-y-0',
            'transition-all duration-200',
            'hover:bg-primary hover:text-white cursor-pointer',
            `${showAsAdded ? 'bg-primary text-white' : ''}`,
          )}
        >
          <ShoppingCart className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* Info */}
      <div className="px-main pt-5 pb-main flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium leading-[1.5] tracking-[0.03em] text-body line-clamp-2">
            {product.name}
          </p>
          {product.variant && (
            <p className="text-sm leading-[1.5] tracking-[0.04em] text-body-passive font-medium">
              {product.variant}
            </p>
          )}
        </div>
        <h3>{formatPrice(product.price, product.currency)}</h3>
      </div>
    </Link>
  );
}
