import { AppError } from "./AppError";

export class AuthenticationError extends AppError {
  constructor(message = "Invalid credentials") {
    super(401, "AUTHENTICATION_ERROR", message);
    this.name = "AuthenticationError";
  }
}
