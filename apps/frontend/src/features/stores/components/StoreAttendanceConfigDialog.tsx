"use client";

import { useState } from "react";
import { MapPin, Shield, AlertCircle } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form/form-field";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useUpdateStoreGeolocationMutation,
  useUpdateStoreIpWhitelistMutation,
} from "@/features/stores/api/stores.api";
import type { AttendanceMethod, Store } from "@/features/stores/types/store.types";

const ALL_METHODS: ReadonlyArray<{ value: AttendanceMethod; label: string }> = [
  { value: "WEB", label: "Web (browser self-service)" },
  { value: "MANUAL", label: "Manual (manager punch on behalf)" },
  { value: "GEOFENCE", label: "Geofence (location-locked)" },
  { value: "IP_RESTRICTED", label: "IP whitelist" },
  { value: "QR_CODE", label: "QR code (single-shot token)" },
  { value: "BIOMETRIC", label: "Biometric device webhook" },
];

interface Props {
  store: Store;
  open: boolean;
  onClose: () => void;
}

export function StoreAttendanceConfigDialog({ store, open, onClose }: Props) {
  const { can } = usePermissions();
  const canEditGeo = can("stores.geolocation.update");
  const canEditIp = can("stores.ip-whitelist.update");

  // Reset all state when the modal opens for a different store.
  // Pattern mirrors the existing ESS profile page: snapshot the
  // `store.id` we last seeded from, and re-seed when it changes
  // (render-time guard, no useEffect — keeps the lint rule happy).
  const initialGeoLat =
    store.geoLat !== null && store.geoLat !== undefined ? Number(store.geoLat).toString() : "";
  const initialGeoLng =
    store.geoLng !== null && store.geoLng !== undefined ? Number(store.geoLng).toString() : "";
  const initialRadius = store.geoRadiusM?.toString() ?? "";

  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [geoLat, setGeoLat] = useState(initialGeoLat);
  const [geoLng, setGeoLng] = useState(initialGeoLng);
  const [geoRadius, setGeoRadius] = useState(initialRadius);
  const [ipsText, setIpsText] = useState((store.ipWhitelist ?? []).join("\n"));
  const [methods, setMethods] = useState<AttendanceMethod[]>(
    (store.attendanceMethods ?? []) as AttendanceMethod[],
  );

  if (seededFor !== store.id) {
    setSeededFor(store.id);
    setGeoLat(initialGeoLat);
    setGeoLng(initialGeoLng);
    setGeoRadius(initialRadius);
    setIpsText((store.ipWhitelist ?? []).join("\n"));
    setMethods((store.attendanceMethods ?? []) as AttendanceMethod[]);
  }

  const [updateGeo, { isLoading: savingGeo }] = useUpdateStoreGeolocationMutation();
  const [updateIp, { isLoading: savingIp }] = useUpdateStoreIpWhitelistMutation();

  const geoFilled = [geoLat, geoLng, geoRadius].filter((v) => v.trim() !== "");
  const geoValid = geoFilled.length === 0 || geoFilled.length === 3;

  async function saveGeo() {
    if (!geoValid) return;
    try {
      await updateGeo({
        id: store.id,
        data:
          geoFilled.length === 0
            ? { geoLat: null, geoLng: null, geoRadiusM: null }
            : {
                geoLat: Number(geoLat),
                geoLng: Number(geoLng),
                geoRadiusM: Number(geoRadius),
              },
      }).unwrap();
      showSuccess("Geofence updated");
    } catch (err) {
      showApiError(err);
    }
  }

  async function saveIp() {
    const ips = ipsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    try {
      await updateIp({
        id: store.id,
        data: {
          ipWhitelist: ips,
          attendanceMethods: methods,
        },
      }).unwrap();
      showSuccess("IP whitelist + methods updated");
    } catch (err) {
      showApiError(err);
    }
  }

  function toggleMethod(m: AttendanceMethod) {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Attendance config — ${store.name}`}
      description="Configure server-side enforcement of geofence / IP / QR attendance methods for this store."
      size="lg"
      secondaryAction={{ label: "Done", onClick: onClose }}
    >
      <div className="space-y-6">
        {/* ── Geofence ──────────────────────────────────────── */}
        <section className="border rounded-md p-4">
          <header className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Geofence</h4>
            </div>
            {canEditGeo && (
              <Button size="sm" onClick={saveGeo} loading={savingGeo} disabled={!geoValid}>
                Save geofence
              </Button>
            )}
          </header>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Set all three fields together to enable. Leave all three blank to clear (and disable
            geofence checking).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Latitude">
              <Input
                inputMode="decimal"
                placeholder="23.7806"
                value={geoLat}
                onChange={(e) => setGeoLat(e.target.value)}
                disabled={!canEditGeo}
              />
            </FormField>
            <FormField label="Longitude">
              <Input
                inputMode="decimal"
                placeholder="90.4193"
                value={geoLng}
                onChange={(e) => setGeoLng(e.target.value)}
                disabled={!canEditGeo}
              />
            </FormField>
            <FormField label="Radius (m)">
              <Input
                inputMode="numeric"
                placeholder="100"
                value={geoRadius}
                onChange={(e) => setGeoRadius(e.target.value)}
                disabled={!canEditGeo}
              />
            </FormField>
          </div>
          {!geoValid && (
            <div className="flex items-start gap-2 mt-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Set all three fields, or clear all three — partial config is rejected.</span>
            </div>
          )}
        </section>

        {/* ── IP whitelist + method allowlist ───────────────── */}
        <section className="border rounded-md p-4">
          <header className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                IP whitelist + attendance methods
              </h4>
            </div>
            {canEditIp && (
              <Button size="sm" onClick={saveIp} loading={savingIp}>
                Save IP + methods
              </Button>
            )}
          </header>
          <FormField
            label="IP whitelist"
            hint="One CIDR or IPv4 per line (e.g. 203.0.113.0/24). Empty = no IP restriction."
          >
            <Textarea
              value={ipsText}
              onChange={(e) => setIpsText(e.target.value)}
              rows={4}
              placeholder={"203.0.113.0/24\n198.51.100.5"}
              disabled={!canEditIp}
              className="font-mono text-sm"
            />
          </FormField>
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Accepted attendance methods
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Empty = accept any method. Otherwise punches with a method not in this list are
              rejected with <code>STORE_METHOD_NOT_CONFIGURED</code>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_METHODS.map((m) => (
                <Checkbox
                  key={m.value}
                  label={m.label}
                  checked={methods.includes(m.value)}
                  onChange={() => toggleMethod(m.value)}
                  disabled={!canEditIp}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
