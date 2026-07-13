import { AppError } from "./AppError";

export class InsufficientStockError extends AppError {
  constructor(productName: string, available: number, requested: number) {
    super(
      409,
      "INSUFFICIENT_STOCK",
      `Insufficient stock for "${productName}": available ${available}, requested ${requested}`,
      { productName, available, requested },
    );
    this.name = "InsufficientStockError";
  }
}
