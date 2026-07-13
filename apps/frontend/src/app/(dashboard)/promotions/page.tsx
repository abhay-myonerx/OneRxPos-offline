"use client";

import { useState } from "react";
import { Tag, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useListPromotionsQuery,
  useCreatePromotionMutation,
  useSetPromotionActiveMutation,
} from "@/features/promotions/api/promotions.api";
import { PROMOTION_TYPE_LABELS } from "@/features/promotions/types/promotion.types";
import type { CreatePromotionInput } from "@/features/promotions/types/promotion.types";
import { PromotionForm } from "@/features/promotions/components/PromotionForm";

export default function PromotionsPage() {
  const { data: promotions, isLoading } = useListPromotionsQuery();
  const [create, { isLoading: creating }] = useCreatePromotionMutation();
  const [setActive] = useSetPromotionActiveMutation();
  const [modal, setModal] = useState(false);

  const onCreate = async (input: CreatePromotionInput) => {
    try {
      await create(input).unwrap();
      showSuccess("Promotion created");
      setModal(false);
    } catch (e) {
      showApiError(e);
    }
  };

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Discounts, BOGO, bundles, volume tiers, and coupons"
        actions={
          <Button onClick={() => setModal(true)}>
            <Plus className="mr-1 h-4 w-4" /> New promotion
          </Button>
        }
      />

      {isLoading ? (
        <Loading />
      ) : !promotions || promotions.length === 0 ? (
        <Card>
          <p className="p-4 text-sm text-slate-500">No promotions yet.</p>
        </Card>
      ) : (
        <Card padding={false}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" /> Promotions
            </CardTitle>
          </CardHeader>
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Coupon</Th>
                <Th>Used</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {promotions.map((p) => (
                <Tr key={p.id}>
                  <Td>{p.name}</Td>
                  <Td>{PROMOTION_TYPE_LABELS[p.type]}</Td>
                  <Td>{p.couponCode ?? "—"}</Td>
                  <Td>{p.timesUsed}</Td>
                  <Td>
                    {p.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="warning">Inactive</Badge>}
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setActive({ id: p.id, isActive: !p.isActive })}
                    >
                      {p.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="New promotion">
        <PromotionForm onSubmit={onCreate} submitting={creating} />
      </Modal>
    </>
  );
}
