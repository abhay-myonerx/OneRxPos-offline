"use client";
import { Edit, Trash2, CreditCard, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Empty } from "@/components/shared/feedback/Empty";
import { formatMoney } from "@/lib/currency/format-money";
import { formatDate } from "@/lib/date/format-date";
import type { Expense } from "../types/expense.types";

interface Props {
  expenses: Expense[];
  onEdit: (id: string) => void;
  onDelete: (expense: Expense) => void;
}

export function ExpenseTable({ expenses, onEdit, onDelete }: Props) {
  if (!expenses.length) {
    return (
      <Card padding={false}>
        <Empty
          title="No expenses found"
          description="Try adjusting filters or record your first expense."
          icon={<CreditCard className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
        />
      </Card>
    );
  }

  return (
    <Card padding={false} className="overflow-hidden">
      <Table>
        <Thead>
          <Tr>
            <Th>Description</Th>
            <Th>Category</Th>
            <Th>Date</Th>
            <Th>Recorded By</Th>
            <Th className="text-right">Amount</Th>
            <Th className="text-right">Actions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {expenses.map((ex) => (
            <Tr key={ex.id} className="hover:bg-slate-50/60">
              <Td className="max-w-[260px]">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                    {ex.description}
                  </p>
                  {ex.receiptUrl && (
                    <a
                      href={ex.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 dark:text-slate-500 hover:text-[#233699] shrink-0"
                      title="View receipt"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </Td>
              <Td>
                {ex.category?.name ? (
                  <Badge variant="default">{ex.category.name}</Badge>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                )}
              </Td>
              <Td className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {formatDate(ex.date)}
              </Td>
              <Td className="text-xs text-slate-500 dark:text-slate-400">
                {ex.recorder ? `${ex.recorder.firstName} ${ex.recorder.lastName}` : "—"}
              </Td>
              <Td className="text-right font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                {formatMoney(ex.amount)}
              </Td>
              <Td className="text-right">
                <div className="inline-flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(ex.id)} title="Edit">
                    <Edit className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(ex)} title="Delete">
                    <Trash2 className="h-4 w-4 text-danger-500" />
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Card>
  );
}
