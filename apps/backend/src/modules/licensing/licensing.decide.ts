export type ActivationView = { deviceFingerprint: string; revokedAt: number | null };
export type ActivationDecision = { action: "reuse" | "create" | "reject-cap" | "reject-status" };

export function decideActivation(input: {
  licenseStatus: string;
  seatCap: number;
  fingerprint: string;
  activations: ActivationView[];
}): ActivationDecision {
  if (input.licenseStatus !== "active") return { action: "reject-status" };

  const live = input.activations.filter((a) => a.revokedAt == null);
  if (live.some((a) => a.deviceFingerprint === input.fingerprint)) return { action: "reuse" };
  if (live.length < input.seatCap) return { action: "create" };
  return { action: "reject-cap" };
}
