import { env } from "@/shell/env";

test("env exposes an apiUrl string", () => {
  expect(typeof env.apiUrl).toBe("string");
  expect(env.apiUrl.length).toBeGreaterThan(0);
});
