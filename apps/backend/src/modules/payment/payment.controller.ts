import { Request, Response, NextFunction } from "express";
import * as paymentService from "./payment.service";
import { listPaymentsSchema, collectDueSchema } from "./payment.validation";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listPaymentsSchema.parse(req.query);
    const result = await paymentService.listPayments(req.db!, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const payment = await paymentService.getPaymentById(req.db!, req.params.id as string);
    res.json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
}

export async function collectDue(req: Request, res: Response, next: NextFunction) {
  try {
    const input = collectDueSchema.parse(req.body);
    const payment = await paymentService.collectDue(req.db!, req.tenantId!, req.user!.id, input);
    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
}

export async function customerPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await paymentService.getCustomerPayments(
      req.db!,
      req.params.customerId as string,
      page,
      limit,
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
