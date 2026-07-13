// Thin async adapter layer — parses validated inputs, calls service,
// returns JSON. No business logic here.

import type { Request, Response, NextFunction } from "express";

import * as service from "./payroll.service";
import * as advService from "./salary-advance.service";
import type {
  ApplyPresetInput,
  EmployeeSalaryAssignInput,
  EmployeeSalaryListInput,
  PayrollRunCreateInput,
  PayrollRunListInput,
  PayslipListInput,
  PayslipVoidInput,
  SalaryAdvanceCreateInput,
  SalaryAdvanceListInput,
  SalaryComponentCreateInput,
  SalaryComponentUpdateInput,
  SalaryStructureCreateInput,
  SalaryStructureListInput,
  SalaryStructureUpdateInput,
} from "./payroll.validation";
import type { PayrollActor } from "./payroll.types";

function actorFromReq(req: Request): PayrollActor {
  return {
    id: req.user!.id,
    tenantId: req.user!.tenantId,
    role: req.user!.role,
    employeeId: req.user!.employeeId ?? null,
  };
}

// ─── Salary Structures ─────────────────────────────────────────────────────────

export const listSalaryStructures = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.listSalaryStructures(
      req.db!,
      actorFromReq(req),
      req.query as unknown as SalaryStructureListInput,
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const getSalaryStructure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.getSalaryStructure(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const createSalaryStructure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.createSalaryStructure(
      req.db!,
      actorFromReq(req),
      req.body as SalaryStructureCreateInput,
    );
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const updateSalaryStructure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.updateSalaryStructure(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
      req.body as SalaryStructureUpdateInput,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const deactivateSalaryStructure = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await service.deactivateSalaryStructure(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

// ─── Salary Components ─────────────────────────────────────────────────────────

export const createSalaryComponent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.createSalaryComponent(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
      req.body as SalaryComponentCreateInput,
    );
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const updateSalaryComponent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.updateSalaryComponent(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
      req.params.cid as string,
      req.body as SalaryComponentUpdateInput,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const deactivateSalaryComponent = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await service.deactivateSalaryComponent(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
      req.params.cid as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

// ─── Country Presets ───────────────────────────────────────────────────────────

export const listCountryPresets = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(service.getCountryPresets());
  } catch (e) {
    next(e);
  }
};

export const applyCountryPreset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.applyCountryPreset(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
      req.body as ApplyPresetInput,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

// ─── Employee Salary Assignment ────────────────────────────────────────────────

export const listEmployeeSalaries = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.listEmployeeSalaries(
      req.db!,
      actorFromReq(req),
      req.query as unknown as EmployeeSalaryListInput,
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const assignEmployeeSalary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.assignEmployeeSalary(
      req.db!,
      actorFromReq(req),
      req.body as EmployeeSalaryAssignInput,
    );
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

// ─── Payroll Runs ──────────────────────────────────────────────────────────────

export const listPayrollRuns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.listPayrollRuns(
      req.db!,
      actorFromReq(req),
      req.query as unknown as PayrollRunListInput,
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const getPayrollRun = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.getPayrollRun(req.db!, actorFromReq(req), req.params.id as string);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const createPayrollRun = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.createPayrollRun(
      req.db!,
      actorFromReq(req),
      req.body as PayrollRunCreateInput,
    );
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const processPayrollRun = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.processPayrollRun(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const approvePayrollRun = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.approvePayrollRun(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const disbursePayrollRun = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.disbursePayrollRun(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const cancelPayrollRun = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.cancelPayrollRun(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
      req.body?.reason,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

// ─── Payslips ──────────────────────────────────────────────────────────────────

export const listRunPayslips = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.listRunPayslips(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
      req.query as unknown as PayslipListInput,
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const getPayslip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.getPayslip(req.db!, actorFromReq(req), req.params.id as string);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const voidPayslip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.voidPayslip(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
      req.body as PayslipVoidInput,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

// ─── ESS: Own Payslips ─────────────────────────────────────────────────────────

export const listOwnPayslips = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.listOwnPayslips(
      req.db!,
      actorFromReq(req),
      req.query as unknown as PayslipListInput,
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
};

// Payslip HTML (printable; browser → PDF via window.print).
export const getPayslipHtml = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const html = await service.getPayslipHtml(req.db!, actorFromReq(req), req.params.id as string);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    next(e);
  }
};

export const getOwnPayslipHtml = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const html = await service.getPayslipHtml(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
      true,
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    next(e);
  }
};

export const getOwnPayslip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.getPayslip(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
      true,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

// ─── Salary Advances ───────────────────────────────────────────────────────────

export const listSalaryAdvances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await advService.listSalaryAdvances(
      req.db!,
      actorFromReq(req),
      req.query as unknown as SalaryAdvanceListInput,
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const getSalaryAdvance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await advService.getSalaryAdvance(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const createSalaryAdvance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await advService.createSalaryAdvance(
      req.db!,
      actorFromReq(req),
      req.body as SalaryAdvanceCreateInput,
    );
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const approveSalaryAdvance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await advService.approveSalaryAdvance(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const rejectSalaryAdvance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await advService.rejectSalaryAdvance(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const disburseSalaryAdvance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await advService.disburseSalaryAdvance(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};

export const cancelSalaryAdvance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await advService.cancelSalaryAdvance(
      req.db!,
      actorFromReq(req),
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
};
