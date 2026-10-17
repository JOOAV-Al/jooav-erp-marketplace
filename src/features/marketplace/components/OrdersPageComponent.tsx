"use client";

import { useMemo, useState } from "react";
import { useGetOrders } from "@/features/marketplace/services/marketplace.api";
import { Order } from "@/features/marketplace/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OrdersGroupedTable from "@/features/marketplace/components/OrdersGroupedTable";
import SearchBox from "@/components/general/SearchBox";
import { useDebounce } from "@/hooks/useDebounce";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AUTO_TABS,
  filterOrdersByTab,
  OrderTabType,
} from "@/features/marketplace/services/orderTabs";

export default function OrderProcessingContent() {
  const searchParams = useSearchParams();
  const autoTab = searchParams?.get("tab");
  const [page, setPage] = useState<number>(1);
  const [query, setQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<OrderTabType>(
    AUTO_TABS[autoTab ?? ""] ?? "PENDING",
  );
  const debouncedQuery = useDebounce(query);
  const router = useRouter();

  const { data, isPending, refetch } = useGetOrders({
    page: page,
    limit: 100,
    search: debouncedQuery,
  });

  const allOrders = data?.data?.orders as Order[] | undefined;

  const filteredOrders = useMemo(
    () => filterOrdersByTab(allOrders ?? [], activeTab),
    [allOrders, activeTab],
  );

  const handleTabChange = (value: string) => {
    setActiveTab(value as OrderTabType);
  };

  const handleInitiatePayment = (orderNumber: string) => {
    if (!orderNumber) return;
    router.push(`/dashboard/checkout?orderNumber=${orderNumber}`);
  };

  const tabTriggerClass =
    "p-main! bg-transparent! data-[state=active]:bg-transparent! shadow-none! data-[state=active]:shadow-none! border-none! rounded-none! font-semibold text-body-passive data-[state=active]:text-heading text-base leading-[1.2] tracking-[0.01em] hover:bg-transparent!";

  return (
    <div className="flex flex-col gap-main">
      <div className="border-b border-border-main py-sm gap-main">
        <h3 className="py-5">Order processing</h3>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <div className="flex flex-row items-center justify-between flex-wrap gap-x-5 gap-y-main min-h-15">
          <TabsList className="h-auto! p-0! bg-transparent! border-none! w-fit flex flex-wrap">
            <TabsTrigger value="PENDING" className={tabTriggerClass}>
              Pending
            </TabsTrigger>
            <TabsTrigger value="PROCESSING" className={tabTriggerClass}>
              Processing
            </TabsTrigger>
            <TabsTrigger value="FULFILLED" className={tabTriggerClass}>
              Fulfilled
            </TabsTrigger>
            <TabsTrigger value="PENDING_PAYMENT" className={tabTriggerClass}>
              Initiate payment
            </TabsTrigger>
            <TabsTrigger value="UNDER_REVIEW" className={tabTriggerClass}>
              Under review
            </TabsTrigger>
          </TabsList>
          <SearchBox
            value={query}
            onChange={(value) => {
              setPage(1);
              setQuery(value);
            }}
          />
        </div>

        {/* With order card */}
        <OrdersGroupedTable
          orders={filteredOrders}
          loading={isPending}
          showActions
          emptyHeader="No orders yet"
          emptyDescription="No order records yet. Orders will appear here once placed."
          refetch={refetch}
          onReorder={(order) => handleInitiatePayment(order?.orderNumber)}
        />
      </Tabs>
    </div>
  );
}
