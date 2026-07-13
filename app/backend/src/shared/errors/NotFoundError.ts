import { AppError } from "./AppError";

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, "NOT_FOUND", id ? `${resource} with id '${id}' not found` : `${resource} not found`);
    this.name = "NotFoundError";
  }
}
