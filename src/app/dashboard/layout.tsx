"use client";

import DashboardTopBar from "@/components/general/DashboardTopBar";
import MarketplaceNavbar from "@/components/general/MarketplaceNavbar";
import Sidebar from "@/components/general/Sidebar";
import { useAuthHydration } from "@/features/auth/hooks/useAuthHydration";
import LoadingScreen from "@/layouts/LoadingScreen";
import { RootState } from "@/redux/store";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSelector } from "react-redux";

// customer-facing routes keep the marketplace chrome, the rest use the dashboard chrome
const marketplaceRoutes = [
  "/dashboard/orders",
  "/dashboard/payments",
  "/dashboard/profile",
  "/dashboard/inventory",
  "/dashboard/checkout",
  "/dashboard/payment-verification",
];

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  useAuthHydration({ isMarketPlace: false });
  const auth = useSelector((state: RootState) => state.auth);
  const pathname = usePathname();
  const isMarketplaceRoute = marketplaceRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isHomePage = pathname === "/dashboard";

  const toggleSidebarCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const shouldRenderIcon = isSidebarHidden || !isSidebarOpen;
  const visibilityClass = isSidebarHidden ? "block" : "block md:hidden";
  const handleSidebarToggleWithIcon = () => {
    if (isSidebarHidden) {
      setIsSidebarHidden(false);
    }
    setIsSidebarOpen(true);
  };

  const getPageHeading = (): string => {
    return pathname.startsWith("/dashboard/manufacturer")
      ? "Manage manufacturer"
      : pathname.startsWith("/dashboard/brand")
        ? "Manage brands"
        : pathname.startsWith("/dashboard/variant")
          ? "Manage variant"
          : pathname.startsWith("/dashboard/category")
            ? "Manage category"
            : pathname.startsWith("/dashboard/product")
              ? "Manage product"
              : pathname.startsWith("/dashboard/users")
                ? "Manage user"
                : pathname.startsWith("/dashboard/roles-and-permissions")
                  ? "Permission categories"
                  : pathname.startsWith("/dashboard/order-logs")
                    ? "Order Management"
                    : pathname.startsWith("/dashboard/fulfilled-orders")
                      ? "Order Management"
                      : "Dashboard";
  };

  if (auth.isUserLoading) {
    return <LoadingScreen className="w-full min-h-screen" />;
  }

  if (isMarketplaceRoute) {
    return (
      <div className="flex flex-col min-h-screen bg-white px-6 sm:px-main lg:px-layout py-main">
        <MarketplaceNavbar />
        <main className="flex-1 max-w-app w-full mx-auto py-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen overflow-hidden">
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isHidden={isSidebarHidden}
        hideSidebar={() => setIsSidebarHidden(true)}
        isCollapsed={isCollapsed}
        setIsCollapsed={toggleSidebarCollapse}
      />

      {/* Main Content */}
      <div
        className={`flex flex-col flex-1 overflow-auto mt-3 mr-3 ${
          isCollapsed ? "" : "rounded-t-2xl"
        } ${isHomePage ? "bg-background" : "bg-white"} ${
          isSidebarHidden ? "md:ml-0" : isCollapsed ? "md:ml-17" : "md:ml-57.5"
        }`}
      >
        <DashboardTopBar
          toggleSidebar={handleSidebarToggleWithIcon}
          shouldRenderIcon={shouldRenderIcon}
          visibilityClass={visibilityClass}
          pageHeading={getPageHeading()}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
