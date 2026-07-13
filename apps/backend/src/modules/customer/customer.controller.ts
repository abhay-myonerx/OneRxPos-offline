import { Request, Response, NextFunction } from "express";
import * as customerService from "./customer.service";
import * as loyaltyService from "./loyalty.service";
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersSchema,
  createGroupSchema,
  updateGroupSchema,
  adjustPointsSchema,
} from "./customer.validation";
import { ValidationError } from "../../shared/errors";
import { enqueue, loadTenantContext } from "../messaging/messaging.service";
import { renderStatementHtml } from "./customer-statement.render";
import { getCustomerStatement } from "../report/ar-report.service";

// ── Customers ────────────────────────────────────────────────────────────────────

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listCustomersSchema.parse(req.query);
    const result = await customerService.listCustomers(req.db!, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const customer = await customerService.getCustomerById(req.db!, req.params.id as string);
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createCustomerSchema.parse(req.body);
    const customer = await customerService.createCustomer(req.db!, req.tenantId!, input);
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateCustomerSchema.parse(req.body);
    const customer = await customerService.updateCustomer(req.db!, req.params.id as string, input);
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await customerService.deleteCustomer(req.db!, req.params.id as string);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await customerService.getCustomerLedger(
      req.db!,
      req.params.id as string,
      page,
      limit,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/customers/:id/statement/email ─────────────────────────────────
// Email a customer their statement of account (3H.1 messaging consumer). As of
// 3H.6 the statement carries the full 30/60/90 aging + open invoices. Recipient
// defaults to the customer's email; `body.to` overrides. Durable/async via outbox.
export async function emailStatement(req: Request, res: Response, next: NextFunction) {
  try {
    const customerId = req.params.id as string;
    const statement = await getCustomerStatement(req.db!, customerId, {});

    const to = ((req.body?.to as string) || statement.customer.email || "").trim();
    if (!to) throw new ValidationError("No recipient email address (customer has no email)");

    const html = renderStatementHtml(statement);
    const tenant = await loadTenantContext(req.db!, req.tenantId!);
    const row = await enqueue(req.db!, tenant, {
      tenantId: req.tenantId!,
      kind: "AR_STATEMENT",
      to: { email: to, name: statement.customer.name },
      subject: `Statement of account`,
      html,
      related: { type: "Customer", id: customerId },
      createdBy: req.user?.id,
    });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/customers/:id/statement ────────────────────────────────────────
// The statement data (aging + open invoices) for the on-screen view.
export async function statement(req: Request, res: Response, next: NextFunction) {
  try {
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : undefined;
    const data = await getCustomerStatement(req.db!, req.params.id as string, { asOf });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/customers/:id/statement/print ──────────────────────────────────
// Printable HTML statement (browser prints to PDF).
export async function statementPrint(req: Request, res: Response, next: NextFunction) {
  try {
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : undefined;
    const data = await getCustomerStatement(req.db!, req.params.id as string, { asOf });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderStatementHtml(data));
  } catch (err) {
    next(err);
  }
}

// ── Groups ───────────────────────────────────────────────────────────────────────

export async function listGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const groups = await customerService.listGroups(req.db!);
    res.json({ success: true, data: groups });
  } catch (err) {
    next(err);
  }
}

export async function createGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createGroupSchema.parse(req.body);
    const group = await customerService.createGroup(req.db!, req.tenantId!, input);
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

export async function updateGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateGroupSchema.parse(req.body);
    const group = await customerService.updateGroup(req.db!, req.params.id as string, input);
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

export async function deleteGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await customerService.deleteGroup(req.db!, req.params.id as string);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Loyalty ──────────────────────────────────────────────────────────────────────

export async function getLoyaltyProgram(req: Request, res: Response, next: NextFunction) {
  try {
    const program = await loyaltyService.getLoyaltyProgram(req.db!, req.tenantId!);
    res.json({ success: true, data: program });
  } catch (err) {
    next(err);
  }
}

export async function getLoyaltyHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await loyaltyService.getCustomerLoyaltyHistory(
      req.db!,
      req.params.id as string,
      page,
      limit,
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function adjustPoints(req: Request, res: Response, next: NextFunction) {
  try {
    const input = adjustPointsSchema.parse(req.body);
    const result = await loyaltyService.adjustPoints(
      req.db!,
      req.tenantId!,
      req.params.id as string,
      input,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
