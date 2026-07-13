import jwt from "jsonwebtoken";

// The verification key set for a secret: current, plus the retiring previous
// key if one is configured. Signing always uses the current key elsewhere.
export function rotationKeys(current: string, previous?: string): string[] {
  return previous ? [current, previous] : [current];
}

// Verify a JWT against a rotation key set. Tries each key in order:
//   - first signature match -> return the payload;
//   - TokenExpiredError (signature matched, token expired) -> rethrow now, since
//     no other key can make an expired token valid and masking it would be wrong;
//   - any other verify error (bad signature) -> try the next key;
//   - all keys fail on signature -> throw the first (current-key) error.
export function verifyWithRotation<T>(
  token: string,
  keys: string[],
  options?: jwt.VerifyOptions,
): T {
  if (keys.length === 0) throw new Error("verifyWithRotation: no keys provided");
  let firstError: unknown;
  for (let i = 0; i < keys.length; i++) {
    try {
      return jwt.verify(token, keys[i], options) as T;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) throw err;
      if (i === 0) firstError = err;
    }
  }
  throw firstError;
}
