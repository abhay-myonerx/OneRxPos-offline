"use client";

import { Printer, Mail } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/shared/feedback/Loading";
import { formatMoney } from "@/lib/currency/format-money";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useGetCustomerStatementQuery,
  useEmailCustomerStatementMutation,
} from "../api/customers.api";

export interface CustomerStatementProps {
  customerId: string;
}

/** Customer statement of account (3H.6): aging summary + open invoices, with
 *  print (opens the server-rendered HTML) and email (via the 3H.1 outbox). */
export function CustomerStatement({ customerId }: CustomerStatementProps) {
  const { data, isLoading } = useGetCustomerStatementQuery({ id: customerId });
  const [emailStatement, { isLoading: emailing }] = useEmailCustomerStatementMutation();

  const print = () => {
    window.open(`/api/v1/customers/${customerId}/statement/print`, "_blank");
  };
  const email = async () => {
    try {
      await emailStatement({ id: customerId }).unwrap();
      showSuccess("Statement emailed");
    } catch (e) {
      showApiError(e);
    }
  };

  if (isLoading) return <Loading />;
  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statement of account</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={print}>
            <Printer className="mr-1 h-4 w-4" /> Print
          </Button>
          <Button size="sm" onClick={email} disabled={emailing}>
            <Mail className="mr-1 h-4 w-4" /> Email statement
          </Button>
        </div>
      </CardHeader>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-sm">
          {(
            [
              ["Current", data.aging.current],
              ["31–60", data.aging.d31_60],
              ["61–90", data.aging.d61_90],
              ["90+", data.aging.d90plus],
              ["Total", data.aging.total],
            ] as const
          ).map(([label, val]) => (
            <div key={label} className="rounded border border-slate-200 dark:border-slate-800 p-2">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="font-medium">{formatMoney(val)}</p>
            </div>
          ))}
        </div>

        {!data.reconciled && (
          <Badge variant="warning">
            Aged invoices total differs from the account balance ({formatMoney(data.currentBalance)})
          </Badge>
        )}

        {data.openInvoices.length === 0 ? (
          <p className="text-sm text-slate-500">No open invoices.</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Invoice</Th>
                <Th>Date</Th>
                <Th className="text-right">Age</Th>
                <Th className="text-right">Due</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.openInvoices.map((inv) => (
                <Tr key={inv.saleId}>
                  <Td>{inv.invoiceNo}</Td>
                  <Td>{inv.date.slice(0, 10)}</Td>
                  <Td className="text-right">{inv.ageDays}</Td>
                  <Td className="text-right">{formatMoney(inv.dueAmount)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}
