"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { useState } from "react";
import { RootState } from "@/redux/store";
import { logout } from "@/redux/slices/authSlice";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShoppingCart, Menu } from "lucide-react";
import Cookies from "js-cookie";
import { cn, truncateText } from "@/lib/utils";
import DashboardDrawer from "@/components/general/DashboardDrawer";
import { useGetOrderDetails } from "@/features/marketplace/services/marketplace.api";
import {
  useRemoveCartItem,
  useUpdateCartQuantity,
} from "@/features/marketplace/services/cart.api";
import { OrderItem } from "@/features/marketplace/types";
import DrawerBoxContent from "@/components/general/DrawerBoxContent";
import CartOrderList from "@/features/marketplace/components/CartOrderList";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LoginForm from "@/features/auth/components/LoginForm";
import CategoriesDropdown from "@/features/marketplace/components/CategoriesDropdown";

const links = [
  // { label: "Shop by categories", href: "/marketplace" },
  { label: "Contact us", href: "https://www.jooav.com/contact-us" },
];

export default function MarketplaceNavbar() {
  const dispatch = useDispatch();
  const router = useRouter();
  const auth = useSelector((state: RootState) => state.auth);
  const isAuthenticated = auth.isAuthenticated;
  const user = auth.user;
  const orderNumber = auth.cartDraftNumber ?? "";
  const { data, isPending: draftCartPending } = useGetOrderDetails({
    orderNumber: orderNumber ?? "",
  });
  const userDraftOrder = data?.data;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [openLoginForm, setOpenLoginForm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { mutate: removeCartItem } = useRemoveCartItem();
  const { mutate: updateCartQuantity } = useUpdateCartQuantity();

  // Functions
  const cartCount = userDraftOrder?.items?.length || 0;

  const handleRemoveItem = (item: OrderItem) => {
    if (!item || !orderNumber) return;
    removeCartItem({
      orderNumber,
      itemId: item.id,
      productId: item.product?.id,
    });
  };

  const handleUpdateQuantity = (item: OrderItem, quantity: number) => {
    if (!item || !orderNumber) return;
    updateCartQuantity({
      orderNumber,
      itemId: item.id,
      productId: item.productId,
      quantity,
    });
  };

  const handleLogout = () => {
    dispatch(logout());
    Cookies.remove("authToken");
    Cookies.remove("refreshToken");
    router.push("/login");
  };

  const options = [
    {
      label: "Inventory",
      action: () => router.push("/dashboard/inventory"),
    },
    {
      label: "Orders",
      action: () => router.push("/dashboard/orders"),
    },
    {
      action: handleLogout,
      label: "Logout",
    },
  ];

  const hideCheckout =
    draftCartPending ||
    (userDraftOrder?.items && userDraftOrder?.items?.length <= 0);
  return (
    <>
      <header className="w-full sticky top-0 z-40 bg-white ">
        <div className="flex items-center justify-between h-18 px-4 md:px-lg lg:px-main">
          <div className="flex items-center gap-lg">
            {/* Logo */}
            <Link href="/marketplace" className="shrink-0">
              <Image
                src="/auth/jooav-logo.svg"
                alt="JOOAV"
                width={90}
                height={24}
                priority
              />
            </Link>

            {/* nav */}
            <nav className="hidden lg:flex items-center gap-2 text-sm font-medium text-foreground">
              <CategoriesDropdown />
              {links.map((link, i) => (
                <Link
                  key={i}
                  href={link.href}
                  className="hover:text-primary transition-colors p-sm"
                >
                  <span className="py-4 px-2 leading-[1.5] tracking-[0.04em] font-medium text-body">
                    {link.label}
                  </span>
                </Link>
              ))}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4 md:gap-lg shrink-0">
            {/* Cart icon — opens the cart drawer */}
            <button
              onClick={() => {
                if (isAuthenticated) {
                  setOpen(true);
                } else {
                  setOpenLoginForm(true);
                }
              }}
              className="cursor-pointer relative w-8.5 h-8.5 p-4 flex justify-center items-center rounded-full hover:bg-storey-foreground transition-colors"
              aria-label="Open cart"
            >
              <ShoppingCart className="h-6 w-6 text-outline" strokeWidth={2} />
              {cartCount > 0 && (
                <span className="absolute -top-2.5 -right-2.5 h-5.5 w-5.5 rounded-full bg-destructive text-[13px] tracking-[0.05em] text-[#FEFAEB] flex items-center justify-center font-semibold">
                  {cartCount}
                </span>
              )}
            </button>

            {isAuthenticated && user ? (
              /* Authenticated avatar + dropdown (desktop only) */
              <div className="flex items-center gap-2">
                <DropdownMenu
                  open={dropdownOpen}
                  onOpenChange={setDropdownOpen}
                >
                  <DropdownMenuTrigger asChild className="hidden lg:flex">
                    <div className="cursor-pointer flex items-center rounded-full hover:bg-gray-100 px-2 py-1 transition-colors outline-none">
                      <Avatar className="size-6">
                        {user.avatar && (
                          <AvatarImage
                            src={user.avatar}
                            alt={user.firstName ?? ""}
                          />
                        )}
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {(user.firstName?.[0] ?? "") +
                            (user.lastName?.[0] ?? "")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden sm:block text-sm font-medium max-w-[100px] p-sm">
                        {truncateText(user.firstName, 10)}
                      </span>
                    </div>
                  </DropdownMenuTrigger>

                  {/* Avatar for Tablet/Mobile — triggers Mobile Menu */}
                  <div 
                    onClick={() => setMenuOpen(true)}
                    className="flex lg:hidden items-center rounded-full px-2 py-1 cursor-pointer"
                  >
                    <Avatar className="size-6">
                      {user.avatar && (
                        <AvatarImage
                          src={user.avatar}
                          alt={user.firstName ?? ""}
                        />
                      )}
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {(user.firstName?.[0] ?? "") +
                          (user.lastName?.[0] ?? "")}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="flex flex-col gap-5 p-sm! rounded-lg! max-h-90 w-[208px] overflow-y-auto user-dropdown"
                  >
                    <p className="py-5 px-3 tracking-[0.08em] text-body-passive font-mono leading-[1.2] text-xs font-normal">
                      OTHERS
                    </p>
                    {options?.map((o, i) => (
                      <DropdownMenuItem
                        key={i}
                        className={cn(
                          "rounded-md py-5 px-sm h-[22px] cursor-pointer transition-colors text-body-passive hover:bg-storey-foreground select-option",
                        )}
                        onClick={() => o.action?.()}
                      >
                        <div className="flex items-center gap-5">
                          <span className="text-[14px] font-medium text-body leading-[1.5] tracking-[0.04em]">
                            {o.label}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              /* Unauthenticated CTA buttons */
              <div className="hidden lg:flex items-center gap-6">
                <DropdownMenu
                  open={openLoginForm}
                  onOpenChange={setOpenLoginForm}
                >
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="neutral">
                      Login
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="flex flex-col gap-5 shadow-none bg-transparent border-none!"
                  >
                    <LoginForm
                      isCustom={true}
                      handleCustomAction={() => setOpenLoginForm(false)}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  size={"neutral"}
                  onClick={() => router.push("/register")}
                >
                  Create account
                </Button>
              </div>
            )}

            {/* Hamburger for mobile — moved to the end */}
            <button
              onClick={() => setMenuOpen(true)}
              className="lg:hidden cursor-pointer p-2 flex justify-center items-center rounded-full hover:bg-storey-foreground transition-colors"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6 text-outline" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      <DashboardDrawer
        openDrawer={setMenuOpen}
        isOpen={menuOpen}
        showHeader={false}
        temporaryFooter={
          <div className="flex flex-col gap-main w-full">
            <Button
              variant="neutral"
              className="w-full gap-4 text-body tracking-[0.02em]"
              onClick={() => setMenuOpen(false)}
            >
              Close Menu
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-6 p-main">
          <div className="flex items-center justify-between pb-4 border-b">
            <h3 className="text-lg font-bold">Menu</h3>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-mono text-body-passive uppercase tracking-widest pb-2">
              Navigation
            </p>
            <CategoriesDropdown />
            {links.map((link, i) => (
              <Link
                key={i}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="hover:text-primary transition-colors py-3 px-2 text-base font-medium text-body border-b border-border-main last:border-0"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {!isAuthenticated && (
            <div className="flex flex-col gap-4 pt-8 mt-4 border-t">
              <p className="text-xs font-mono text-body-passive uppercase tracking-widest pb-2">
                Account
              </p>
              <Button
                variant="neutral"
                className="w-full justify-start"
                onClick={() => {
                  setMenuOpen(false);
                  setOpenLoginForm(true);
                }}
              >
                Login
              </Button>
              <Button
                className="w-full"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/register");
                }}
              >
                Create account
              </Button>
            </div>
          )}

          {isAuthenticated && (
            <div className="flex flex-col gap-4 pt-8 mt-4 border-t">
              <p className="text-xs font-mono text-body-passive uppercase tracking-widest pb-2">
                Dashboard
              </p>
              {options.map((o, i) => (
                <Button
                  key={i}
                  variant="neutral"
                  className="w-full justify-start"
                  onClick={() => {
                    setMenuOpen(false);
                    o.action();
                  }}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </DashboardDrawer>

      <DashboardDrawer
        openDrawer={setOpen}
        isOpen={open}
        temporaryFooter={
          <div className="flex flex-col gap-main w-full">
            {!hideCheckout && (
              <Button
                className="w-full gap-4 tracking-[0.02em]"
                onClick={() => {
                  setOpen(false);
                  router.push("/dashboard/checkout");
                }}
              >
                Checkout
              </Button>
            )}
            <Button
              variant="neutral"
              className="w-full gap-4 text-body tracking-[0.02em]"
              onClick={() => {
                setOpen(false);
                router.push("/marketplace");
              }}
            >
              Continue shopping
            </Button>
          </div>
        }
        showHeader={false}
      >
        {/* ── Order list ─────────────────────────────────────────── */}
        {orderNumber && (
          <DrawerBoxContent
            heading={`Cart (${userDraftOrder?.items?.length ?? 0})`}
            showClose
            content={
              <CartOrderList
                order={userDraftOrder}
                orderNumber={orderNumber}
                isPending={draftCartPending}
                onRemoveItem={handleRemoveItem}
                onUpdateQuantity={handleUpdateQuantity}
              />
            }
          />
        )}
      </DashboardDrawer>
    </>
  );
}
