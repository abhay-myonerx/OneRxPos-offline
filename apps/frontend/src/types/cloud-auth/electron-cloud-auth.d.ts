export {};

export interface ElectronCloudRequestPayload {
  url: string;

  method: string;

  headers?: Record<
    string,
    string
  >;

  body?: string;
}

export interface ElectronCloudResponse {
  ok: boolean;

  status: number;

  statusText: string;

  headers: Record<
    string,
    string
  >;

  body: string;
}

declare global {
  interface Window {
    rxPosCloudAuth?: {
      request: (
        payload:
          ElectronCloudRequestPayload,
      ) => Promise<
        ElectronCloudResponse
      >;
    };
  }
}