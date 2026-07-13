"use client";

/**
 * Driver Panel (Phase 2.9.5b). Manage peripheral device profiles and test any
 * network device (print / pop drawer / read weight). USB/serial devices run
 * through their station host (Electron executor deferred). Reads are till-open;
 * writes are admin-gated server-side, so no client role-gating here.
 */

import { useState } from "react";
import { Cpu, Plus, Trash2, Save, X, Pencil, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { useListStoresQuery } from "@/features/stores/api/stores.api";
import {
  useListDeviceProfilesQuery,
  useCreateDeviceProfileMutation,
  useUpdateDeviceProfileMutation,
  useDeleteDeviceProfileMutation,
  useTestPrintMutation,
  useTestDrawerMutation,
  useTestScaleMutation,
  useLazyDiscoverDevicesQuery,
  type DeviceProfileDto,
  type DeviceKind,
  type Transport,
  type ConnectionSpec,
  type ScaleProtocol,
} from "@/features/hardware/hardware.api";
import { SectionTitle, SettingsCard, Divider, InfoBanner } from "./shared";

const SELECT_CLASS =
  "w-full h-9 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400";

type ConnKind = ConnectionSpec["kind"];

interface FormState {
  storeId: string;
  kind: DeviceKind;
  label: string;
  connKind: ConnKind;
  ip: string;
  port: string;
  usbVendorId: string;
  usbProductId: string;
  serialPath: string;
  baudRate: string;
  printerName: string;
  transport: Transport;
  ownerStationId: string;
  protocol: ScaleProtocol | "";
}

const EMPTY: FormState = {
  storeId: "",
  kind: "printer",
  label: "",
  connKind: "network",
  ip: "",
  port: "9100",
  usbVendorId: "",
  usbProductId: "",
  serialPath: "",
  baudRate: "9600",
  printerName: "",
  transport: "network",
  ownerStationId: "",
  protocol: "",
};

const KIND_OPTIONS: { value: DeviceKind; label: string }[] = [
  { value: "printer", label: "Receipt printer" },
  { value: "drawer", label: "Cash drawer" },
  { value: "scale", label: "Weighing scale" },
  { value: "scanner", label: "Barcode scanner" },
];

const TRANSPORT_LABEL: Record<Transport, string> = {
  network: "Network",
  native: "USB / Serial",
  relay: "Via station",
};

function connSummary(c: ConnectionSpec): string {
  if (c.kind === "network") return `${c.ip}:${c.port}`;
  if (c.kind === "usb") return `USB ${c.usbVendorId}:${c.usbProductId}`;
  if (c.kind === "windows-printer") return `Windows: ${c.printerName}`;
  return `${c.serialPath} @ ${c.baudRate}`;
}

function buildConnection(f: FormState): ConnectionSpec {
  if (f.connKind === "network") return { kind: "network", ip: f.ip.trim(), port: Number(f.port) };
  if (f.connKind === "usb")
    return { kind: "usb", usbVendorId: Number(f.usbVendorId), usbProductId: Number(f.usbProductId) };
  if (f.connKind === "windows-printer")
    return { kind: "windows-printer", printerName: f.printerName.trim() };
  return { kind: "serial", serialPath: f.serialPath.trim(), baudRate: Number(f.baudRate) };
}

export function HardwareTab() {
  const { data: devices = [], isLoading } = useListDeviceProfilesQuery();
  const { data: stores = [] } = useListStoresQuery({ isActive: true, limit: 50 });
  const [createDevice] = useCreateDeviceProfileMutation();
  const [updateDevice] = useUpdateDeviceProfileMutation();
  const [deleteDevice] = useDeleteDeviceProfileMutation();
  const [testPrint] = useTestPrintMutation();
  const [testDrawer] = useTestDrawerMutation();
  const [testScale] = useTestScaleMutation();
  const [detectDevices, { data: detected, isFetching: detecting }] =
    useLazyDiscoverDevicesQuery();

  const [editing, setEditing] = useState<DeviceProfileDto | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, storeId: stores[0]?.id ?? "" });
  };

  const openEdit = (d: DeviceProfileDto) => {
    setEditing(d);
    setForm({
      storeId: d.storeId,
      kind: d.kind,
      label: d.label,
      connKind: d.connection.kind,
      ip: d.connection.kind === "network" ? d.connection.ip : "",
      port: d.connection.kind === "network" ? String(d.connection.port) : "9100",
      usbVendorId: d.connection.kind === "usb" ? String(d.connection.usbVendorId) : "",
      usbProductId: d.connection.kind === "usb" ? String(d.connection.usbProductId) : "",
      serialPath: d.connection.kind === "serial" ? d.connection.serialPath : "",
      baudRate: d.connection.kind === "serial" ? String(d.connection.baudRate) : "9600",
      printerName: d.connection.kind === "windows-printer" ? d.connection.printerName : "",
      transport: d.transport,
      ownerStationId: d.ownerStationId ?? "",
      protocol: (d.protocol ?? "") as ScaleProtocol | "",
    });
  };

  const closeForm = () => {
    setForm(null);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form) return;
    const body = {
      storeId: form.storeId,
      kind: form.kind,
      label: form.label.trim(),
      transport: form.transport,
      connection: buildConnection(form),
      ownerStationId: form.ownerStationId.trim() || null,
      protocol: form.protocol || null,
    };
    try {
      if (editing) {
        await updateDevice({ id: editing.id, ...body }).unwrap();
        showSuccess("Device updated");
      } else {
        await createDevice(body).unwrap();
        showSuccess("Device added");
      }
      closeForm();
    } catch (err) {
      showApiError(err);
    }
  };

  const handleDelete = async (d: DeviceProfileDto) => {
    try {
      await deleteDevice({ id: d.id }).unwrap();
      showSuccess("Device removed");
    } catch (err) {
      showApiError(err);
    }
  };

  const handleTest = async (d: DeviceProfileDto) => {
    // Transport-aware: the backend opens the socket / COM port / HID device
    // from the profile's own connection, so network, serial and USB devices
    // are all testable here.
    const connection = d.connection;
    try {
      if (d.kind === "printer") {
        await testPrint({ connection }).unwrap();
        showSuccess("Test receipt sent");
      } else if (d.kind === "drawer") {
        await testDrawer({ connection }).unwrap();
        showSuccess("Drawer opened");
      } else if (d.kind === "scale") {
        const r = await testScale({ connection }).unwrap();
        showSuccess(`Weight: ${r.value} ${r.unit}${r.stable ? "" : " (unstable)"}`);
      } else {
        showApiError(new Error("Scanners report their status automatically."));
      }
    } catch (err) {
      showApiError(err);
    }
  };

  return (
    <SettingsCard>
      <SectionTitle
        icon={<Cpu className="h-4 w-4" />}
        title="Hardware"
        description="Receipt printers, cash drawers and scales. Network devices work on every client (incl. tablets); USB/serial gear is driven by a station host."
        action={
          <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
            Add device
          </Button>
        }
      />

      <InfoBanner
        icon={<FlaskConical className="h-4 w-4" />}
        title="Test any network device"
        description="Use Test to print a sample receipt, pop the drawer, or read a live weight. USB/serial devices are tested through their station host."
      />

      <Divider className="my-5" />

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading devices…</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-slate-500">
          No devices yet. Add your first printer, drawer or scale.
        </p>
      ) : (
        <ul className="space-y-2">
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-slate-200/70 dark:border-slate-700 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {d.label}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {TRANSPORT_LABEL[d.transport]}
                  </span>
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {d.kind} · {connSummary(d.connection)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="outline" onClick={() => handleTest(d)} aria-label={`Test ${d.label}`}>
                  Test
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => openEdit(d)}
                  aria-label={`Edit ${d.label}`}
                  icon={<Pencil className="h-4 w-4" />}
                />
                <Button
                  variant="ghost"
                  onClick={() => handleDelete(d)}
                  aria-label={`Delete ${d.label}`}
                  icon={<Trash2 className="h-4 w-4" />}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <div className="mt-6">
          <Divider className="mb-5" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Label" className="sm:col-span-2">
              <Input
                aria-label="Label"
                value={form.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="e.g. Front counter printer"
              />
            </FormField>

            <FormField label="Type">
              <select
                aria-label="Type"
                className={SELECT_CLASS}
                value={form.kind}
                onChange={(e) => patch({ kind: e.target.value as DeviceKind })}
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Store">
              <select
                aria-label="Store"
                className={SELECT_CLASS}
                value={form.storeId}
                onChange={(e) => patch({ storeId: e.target.value })}
              >
                <option value="">Select store…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Connection">
              <select
                aria-label="Connection"
                className={SELECT_CLASS}
                value={form.connKind}
                onChange={(e) => {
                  const ck = e.target.value as ConnKind;
                  patch({ connKind: ck, transport: ck === "network" ? "network" : "native" });
                }}
              >
                <option value="network">Network (IP)</option>
                <option value="usb">USB</option>
                <option value="serial">Serial</option>
                <option value="windows-printer">Windows printer</option>
              </select>
            </FormField>

            {form.connKind !== "network" && (
              <FormField label="Detect">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => detectDevices()}
                    disabled={detecting}
                  >
                    {detecting ? "Detecting…" : "Detect devices"}
                  </Button>
                  {detected && form.connKind === "serial" && (
                    <select
                      className={SELECT_CLASS}
                      aria-label="Detected serial ports"
                      defaultValue=""
                      onChange={(e) => e.target.value && patch({ serialPath: e.target.value })}
                    >
                      <option value="">
                        {detected.serial.length ? "Pick a COM port…" : "No COM ports found"}
                      </option>
                      {detected.serial.map((s) => (
                        <option key={s.path} value={s.path}>
                          {s.path}
                          {s.manufacturer ? ` — ${s.manufacturer}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {detected && form.connKind === "windows-printer" && (
                    <select
                      className={SELECT_CLASS}
                      aria-label="Detected printers"
                      defaultValue=""
                      onChange={(e) => e.target.value && patch({ printerName: e.target.value })}
                    >
                      <option value="">
                        {detected.printers.length ? "Pick a printer…" : "No printers found"}
                      </option>
                      {detected.printers.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  )}
                  {detected && form.connKind === "usb" && (
                    <select
                      className={SELECT_CLASS}
                      aria-label="Detected USB devices"
                      defaultValue=""
                      onChange={(e) => {
                        const d = detected.hid.find(
                          (h) => `${h.vendorId}:${h.productId}` === e.target.value,
                        );
                        if (d)
                          patch({
                            usbVendorId: String(d.vendorId),
                            usbProductId: String(d.productId),
                          });
                      }}
                    >
                      <option value="">
                        {detected.hid.length ? "Pick a USB device…" : "No USB devices found"}
                      </option>
                      {detected.hid.map((h) => (
                        <option
                          key={`${h.vendorId}:${h.productId}:${h.path ?? ""}`}
                          value={`${h.vendorId}:${h.productId}`}
                        >
                          {h.product || h.manufacturer || "HID device"} ({h.vendorId}:{h.productId})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </FormField>
            )}

            {form.connKind === "network" && (
              <>
                <FormField label="IP address">
                  <Input
                    aria-label="IP address"
                    value={form.ip}
                    onChange={(e) => patch({ ip: e.target.value })}
                    placeholder="192.168.1.50"
                  />
                </FormField>
                <FormField label="Port">
                  <Input
                    aria-label="Port"
                    value={form.port}
                    onChange={(e) => patch({ port: e.target.value })}
                    placeholder="9100"
                  />
                </FormField>
              </>
            )}

            {form.connKind === "usb" && (
              <>
                <FormField label="USB Vendor ID">
                  <Input
                    aria-label="USB Vendor ID"
                    value={form.usbVendorId}
                    onChange={(e) => patch({ usbVendorId: e.target.value })}
                  />
                </FormField>
                <FormField label="USB Product ID">
                  <Input
                    aria-label="USB Product ID"
                    value={form.usbProductId}
                    onChange={(e) => patch({ usbProductId: e.target.value })}
                  />
                </FormField>
              </>
            )}

            {form.connKind === "windows-printer" && (
              <FormField label="Windows printer name">
                <Input
                  aria-label="Windows printer name"
                  value={form.printerName}
                  onChange={(e) => patch({ printerName: e.target.value })}
                  placeholder="EPSON TM-T88V Receipt"
                />
              </FormField>
            )}

            {form.connKind === "serial" && (
              <>
                <FormField label="Serial path">
                  <Input
                    aria-label="Serial path"
                    value={form.serialPath}
                    onChange={(e) => patch({ serialPath: e.target.value })}
                    placeholder="COM3 / /dev/ttyUSB0"
                  />
                </FormField>
                <FormField label="Baud rate">
                  <Input
                    aria-label="Baud rate"
                    value={form.baudRate}
                    onChange={(e) => patch({ baudRate: e.target.value })}
                  />
                </FormField>
              </>
            )}

            {form.connKind !== "network" && (
              <FormField label="Host station ID (optional)">
                <Input
                  aria-label="Host station ID"
                  value={form.ownerStationId}
                  onChange={(e) => patch({ ownerStationId: e.target.value })}
                />
              </FormField>
            )}

            {form.kind === "scale" && (
              <FormField label="Scale protocol">
                <select
                  aria-label="Scale protocol"
                  className={SELECT_CLASS}
                  value={form.protocol}
                  onChange={(e) => patch({ protocol: e.target.value as ScaleProtocol | "" })}
                >
                  <option value="">Default</option>
                  <option value="nci">NCI serial</option>
                  <option value="hid">USB HID</option>
                  <option value="network">Network</option>
                </select>
              </FormField>
            )}

            <div className="sm:col-span-2 flex items-center gap-2 pt-1">
              <Button
                icon={<Save className="h-4 w-4" />}
                onClick={handleSave}
                disabled={!form.label.trim() || !form.storeId}
              >
                {editing ? "Save changes" : "Create device"}
              </Button>
              <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
