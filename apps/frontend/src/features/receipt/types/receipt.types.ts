// Receipt template and receipt data types matching the backend API

export interface ReceiptDisplayOptions {
  showLogo: boolean;
  showBarcode: boolean;
  showQrCode: boolean;
  showTaxBreakdown: boolean;
  showCashierName: boolean;
  showCustomerInfo: boolean;
  showPaymentDetails: boolean;
  showStoreName: boolean;
  showStoreAddress: boolean;
  showItemSku: boolean;
  showItemBarcode: boolean;
  showDiscountColumn: boolean;
  showTaxColumn: boolean;
  showLoyaltyPoints: boolean;
  showDueAmount: boolean;
  paperSize: "58mm" | "80mm" | "A4";
  fontSize: "small" | "medium" | "large";
}

export interface ReceiptCustomField {
  label: string;
  value: string;
}

export interface ReceiptTemplate {
  id: string | null;
  configured: boolean;
  name: string;
  logoUrl: string | null;
  businessName: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  taxId: string | null;
  website: string | null;
  headerText: string | null;
  footerText: string | null;
  termsText: string | null;
  thankYouMsg: string | null;
  displayOptions: ReceiptDisplayOptions;
  customFields: ReceiptCustomField[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpsertReceiptTemplateInput {
  name?: string;
  logoUrl?: string | null;
  businessName?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  taxId?: string | null;
  website?: string | null;
  headerText?: string | null;
  footerText?: string | null;
  termsText?: string | null;
  thankYouMsg?: string | null;
  displayOptions?: Partial<ReceiptDisplayOptions>;
  customFields?: ReceiptCustomField[];
  isActive?: boolean;
}

export interface ReceiptData {
  receipt: {
    invoiceNo: string;
    date: string;
    time: string;
    isDuplicate: boolean;
    status: string;
  };
  business: {
    name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    taxId: string | null;
    website: string | null;
    logoUrl: string | null;
  };
  store: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    phone: string | null;
  };
  cashier: {
    id: string;
    name: string;
  };
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    loyaltyPoints: number;
  } | null;
  items: Array<{
    name: string;
    sku: string;
    barcode: string | null;
    variantName: string | null;
    quantity: number;
    unitPrice: string;
    discount: string;
    taxRate: string;
    taxAmount: string;
    lineTotal: string;
  }>;
  totals: {
    subtotal: string;
    discountAmount: string;
    taxTotal: string;
    grandTotal: string;
    paidAmount: string;
    dueAmount: string;
    changeAmount: string;
    itemCount: number;
    totalQuantity: number;
  };
  payments: Array<{
    method: string;
    amount: string;
    referenceNo: string | null;
    status: string;
  }>;
  loyalty: {
    pointsEarned: number;
    totalPoints: number;
  } | null;
  template: {
    headerText: string | null;
    footerText: string | null;
    termsText: string | null;
    thankYouMsg: string | null;
    customFields: ReceiptCustomField[];
    displayOptions: ReceiptDisplayOptions;
  };
  currency: {
    code: string;
    symbol: string;
    position: string;
    decimals: number;
  };
}

export const DEFAULT_DISPLAY_OPTIONS: ReceiptDisplayOptions = {
  showLogo: true,
  showBarcode: true,
  showQrCode: false,
  showTaxBreakdown: true,
  showCashierName: true,
  showCustomerInfo: true,
  showPaymentDetails: true,
  showStoreName: true,
  showStoreAddress: true,
  showItemSku: false,
  showItemBarcode: false,
  showDiscountColumn: true,
  showTaxColumn: true,
  showLoyaltyPoints: true,
  showDueAmount: true,
  paperSize: "80mm",
  fontSize: "medium",
};
