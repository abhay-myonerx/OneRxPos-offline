import { prisma, TenantPrismaClient } from "../../config/database";
import { getNextDailySaleNumber, composeSaleInvoiceNo } from "../../shared/utils/invoiceNumber";
import { zonedDateKey } from "../../shared/utils/datetime";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { InsufficientStockError } from "../../shared/errors/InsufficientStockError";
import { logger } from "../../shared/utils/logger";
import { m, sum, max as dmax } from "../../shared/utils/money";
import { priceCart, roundCashDue, toDbNumber, type PriceLineInput, type Levy } from "rx-pos-shared";
import type Decimal from "decimal.js";
import type { CheckoutInput } from "./sale.validation";
import { assertVariableProductHasVariant } from "../product/product.validation";
import { consumeOverride } from "../pos-auth/override.service";
import { verifyOverrideGrant } from "../pos-auth/override-grant";
import { resolveCartSchedules } from "../drug/resolve-schedule";
import * as reorderService from "../inventory/reorder.service";
import { resolveForCart } from "../promotion/promotion-resolver";
import { enforceDiscountCaps, enforceCreditLimit } from "./discount-enforcement";
import { resolveRedemption, resolveTierMultiplier } from "./loyalty";
import { getDiscountCaps } from "../../shared/settings/discount-caps";
import type { PromoLine } from "rx-pos-shared";
// Importing the sectors barrel registers the shipped sectors (incl. pharmacy)
// into the process-global `sectorRegistry` at import time, so the compliance
// pipeline can resolve them for a tenant that has the sector enabled.
import {
  resolveActiveSectors,
  createCheckoutPipeline,
  sectorRegistry,
  type CheckoutContext,
} from "@/sectors";
import { readEnabledSectors } from "@/shared/settings";

// ── Checkout ───────────────────────────────────────────────────────────────────

export async function processCheckout(
  db: TenantPrismaClient,
  tenantId: string,
  cashierId: string,
  input: CheckoutInput,
) {
  // ── 1. Pre-validate: store, customer, shift ─────────────────────────────

  const store = await db.store.findUnique({ where: { id: input.storeId } });
  if (!store) throw new NotFoundError("Store", input.storeId);
  if (!store.isActive) throw new ValidationError("Store is not active");

  // Fail closed: never guess tax when the store has no province.
  if (!store.province) {
    throw new ValidationError("Store has no province set; cannot compute tax. Set it in store settings.");
  }

  // ── Manager-override grants (Phase 1.3a Task 9) ─────────────────────────
  //
  //   Fail-closed: any invalid/expired/mismatched grant throws HERE, before
  //   any DB write (no sale, no SaleItem, no SaleOverride is ever written
  //   for a rejected override). `context` is forwarded VERBATIM to
  //   `consumeOverride` (which hashes it) — never reformatted. Accepted
  //   overrides are re-decoded via `verifyOverrideGrant` to pull the real
  //   authorizer's userId off the grant's own claims (not caller-supplied),
  //   then persisted as `SaleOverride` rows inside the SAME `$transaction`
  //   as the sale below, so a sale and its override rows commit atomically.
  const acceptedOverrides = (input.overrides ?? []).map((o) => {
    if (!consumeOverride(o.grant, o.action, o.context)) {
      throw new ValidationError(`Invalid or expired override grant for ${o.action}.`);
    }
    const claims = verifyOverrideGrant(o.grant);
    return { action: o.action, context: o.context, authorizerUserId: claims.authorizerUserId };
  });

  // Captured for the 3H.7 credit-limit enforcement below.
  let creditCustomer: { creditLimit: unknown; currentBalance: unknown } | null = null;
  if (input.customerId) {
    const customer = await db.customer.findUnique({
      where: { id: input.customerId },
    });
    if (!customer) throw new NotFoundError("Customer", input.customerId);
    if (!customer.isActive) throw new ValidationError("Customer account is inactive");
    creditCustomer = { creditLimit: customer.creditLimit, currentBalance: customer.currentBalance };
  }

  if (input.shiftId) {
    const shift = await db.cashierShift.findFirst({
      where: { id: input.shiftId, storeId: input.storeId },
    });
    if (!shift) throw new NotFoundError("Cashier shift", input.shiftId);
    if (shift.closedAt) throw new ValidationError("Cashier shift is already closed");
  }

  // ── 2. Resolve products + build pricing engine input ────────────────────
  //
  //    Per-line tax/levy computation is delegated to the shared `priceCart`
  //    engine (rx-pos-shared) — the single source of truth for Canadian tax
  //    treatment, levies, and cart-discount distribution. This loop only
  //    resolves DB-dependent facts (product, variant, stock, cost price) and
  //    collects them for both the pricing call and the later SaleItem write.

  type RawLine = {
    productId: string;
    productName: string;
    productType: string;
    variantId: string | null;
    quantity: number;
    costPrice: Decimal;
  };

  // Local helper (rather than an inline call) so its return type — including
  // the `productLevies: { include: { levy: true } }` relation — can be
  // captured via `Awaited<ReturnType<...>>` for the `productById` map below;
  // Prisma's `findUnique` return type otherwise only resolves per call site.
  const loadProduct = (productId: string, variantId: string | null | undefined) =>
    db.product.findUnique({
      where: { id: productId },
      include: {
        taxGroup: true,
        variants: variantId ? { where: { id: variantId } } : false,
        productLevies: { include: { levy: true } },
      },
    });

  const rawLines: RawLine[] = [];
  const productById = new Map<string, NonNullable<Awaited<ReturnType<typeof loadProduct>>>>();

  for (const item of input.items) {
    const product = await loadProduct(item.productId, item.variantId);
    if (!product) throw new NotFoundError("Product", item.productId);
    if (!product.isActive) {
      throw new ValidationError(`Product "${product.name}" is not active`);
    }

    assertVariableProductHasVariant(
      product.productType,
      item.variantId,
      `Checkout line for "${product.name}" requires variantId because this product is variable; stock is tracked per variant.`,
    );

    // Resolve effective cost price (variant override > product default)
    let costPrice = m(product.costPrice);
    if (item.variantId) {
      const variant = (
        product.variants as { id: string; costPrice: unknown; isActive: boolean }[]
      )[0];
      if (!variant) throw new NotFoundError("Variant", item.variantId);
      if (!variant.isActive) {
        throw new ValidationError(`Variant "${item.variantId}" is not active`);
      }
      if (variant.costPrice != null) costPrice = m(variant.costPrice as string);
    }

    // Pre-flight stock check (authoritative check happens inside the txn)
    if (product.productType !== "SERVICE") {
      const stock = await db.storeStock.findFirst({
        where: {
          storeId: input.storeId,
          productId: item.productId,
          variantId: item.variantId ?? null,
        },
      });
      if (!stock || stock.quantity < item.quantity) {
        throw new InsufficientStockError(product.name, stock?.quantity ?? 0, item.quantity);
      }
    }

    productById.set(item.productId, product);
    rawLines.push({
      productId: item.productId,
      productName: product.name,
      productType: product.productType,
      variantId: item.variantId ?? null,
      quantity: item.quantity,
      costPrice,
    });
  }

  // Single "now" reused for both the pricing engine's date-effective tax-rate
  // lookup and the levy effective-date/active filter below, so the two never
  // disagree about what instant "now" was.
  const now = new Date();

  const priceLines: PriceLineInput[] = input.items.map((it) => {
    const product = productById.get(it.productId)!;
    return {
      id: it.productId + (it.variantId ?? ""),
      unitPrice: String(it.unitPrice),
      qty: String(it.quantity),
      lineDiscount: String(it.discount ?? 0),
      taxCategory: product.taxCategory,
      taxInclusive: product.taxInclusive,
      // priceCart filters tax RATES by date but does not know about levies'
      // active/effective-date fields — filter here so expired or inactive
      // levies are never charged.
      levies: product.productLevies
        .filter(
          (pl) =>
            pl.levy.isActive &&
            pl.levy.effectiveFrom <= now &&
            (pl.levy.effectiveTo == null || pl.levy.effectiveTo >= now),
        )
        .map((pl): Levy => ({
          code: pl.levy.code, name: pl.levy.name, mode: pl.levy.mode,
          amount: String(pl.levy.amount), taxable: pl.levy.taxable,
        })),
    };
  });

  // ── 2b. Promotions (3H.4) — SERVER-AUTHORITATIVE ─────────────────────────
  // Resolve promotions/coupon/group-discount server-side (never trust the
  // client) and fold the resulting discounts into each line's lineDiscount so
  // priceCart taxes the already-discounted net. The cart-level promo discount is
  // distributed across lines proportionally to their net. Best-effort: a resolver
  // failure yields no promos and the sale proceeds.
  const promoLines: PromoLine[] = input.items.map((it) => {
    const product = productById.get(it.productId)!;
    return {
      id: it.productId + (it.variantId ?? ""),
      productId: it.productId,
      categoryId: product.categoryId ?? null,
      unitPrice: String(it.unitPrice),
      qty: String(it.quantity),
      existingLineDiscount: String(it.discount ?? 0),
    };
  });
  const promo = await resolveForCart(db, {
    lines: promoLines,
    customerId: input.customerId ?? null,
    couponCode: input.couponCode ?? null,
    now,
  });
  const appliedPromotions = promo.applied;
  // Per-line promo discount = its own line discount + a proportional share of the
  // cart-level promo discount (by net after line promos).
  const promoLineDiscount = new Map<string, Decimal>();
  const netAfterLine = promoLines.map((pl) => {
    const base = m(pl.unitPrice).times(pl.qty).minus(pl.existingLineDiscount);
    const linePromo = m(promo.lineDiscounts[pl.id] ?? 0);
    promoLineDiscount.set(pl.id, linePromo);
    return { id: pl.id, net: dmax(0, base.minus(linePromo)) };
  });
  const netSumAfterLine = sum(netAfterLine.map((n) => n.net));
  const cartPromo = m(promo.cartDiscount);
  if (cartPromo.gt(0) && netSumAfterLine.gt(0)) {
    for (const n of netAfterLine) {
      const share = cartPromo.times(n.net).div(netSumAfterLine);
      promoLineDiscount.set(n.id, (promoLineDiscount.get(n.id) ?? m(0)).plus(share));
    }
  }
  for (const pl of priceLines) {
    const extra = promoLineDiscount.get(pl.id);
    if (extra && extra.gt(0)) pl.lineDiscount = m(pl.lineDiscount).plus(extra).toString();
  }

  const priced = priceCart({
    province: store.province,
    at: now,
    exemption: input.exemption ?? null,
    cartDiscount: { mode: input.cartDiscountMode ?? "flat", value: String(input.cartDiscount ?? 0) },
    lines: priceLines,
  });

  // ── 2c. Loyalty redemption (3H.5) — fail-closed, before the payment math ─
  // Redeemed points are a cash-equivalent tender (reduces due, NOT a discount —
  // tax untouched). Load the program once here (reused by the earn block).
  let redemption: { points: number; value: number } | null = null;
  let loyaltyProgram: { isActive: boolean; earnRate: unknown; redeemRate: unknown; minRedeemPoints: number; tiers?: Array<{ minSpend: unknown; multiplier: unknown }> } | null = null;
  if (input.customerId) {
    loyaltyProgram = await db.loyaltyProgram.findUnique({ where: { tenantId }, include: { tiers: true } });
    if ((input.redeemPoints ?? 0) > 0) {
      if (!loyaltyProgram?.isActive) throw new ValidationError("Loyalty program is not active");
      const cust = await db.customer.findUnique({ where: { id: input.customerId }, select: { loyaltyPoints: true } });
      redemption = resolveRedemption({
        redeemRate: Number(loyaltyProgram.redeemRate),
        minRedeemPoints: loyaltyProgram.minRedeemPoints,
        availablePoints: cust?.loyaltyPoints ?? 0,
        redeemPoints: input.redeemPoints as number,
        grandTotal: priced.grandTotal.toNumber(),
      });
    }
  }
  const redemptionValue = redemption ? m(redemption.value) : m(0);

  // ── 3. Validate payments ────────────────────────────────────────────────

  // The loyalty redemption is a non-cash tender counted toward the total paid.
  const totalPaid = sum(input.payments.map((p) => m(p.amount))).plus(redemptionValue);

  if (totalPaid.lte(0)) {
    throw new ValidationError("Total payment amount must be greater than zero");
  }

  // ── 4. Cash-only change + rounding calculation ──────────────────────────
  //
  //   Non-cash payments (card, mobile, gift card) are for exact amounts —
  //   you never "give change" on a card swipe. Only cash can produce
  //   physical change from the drawer, and only cash is subject to the
  //   Royal Canadian Mint's nickel-rounding rule (no penny in circulation).
  //
  //   cashPaid    = sum of CASH payments
  //   nonCash     = sum of non-CASH payments
  //   cashDue     = grandTotal - nonCash, rounded to the nearest $0.05 when
  //                 cash was tendered (rounding only ever applies to the
  //                 cash-due slice, never to the card/mobile/gift portion)
  //   grandTotal  = priced.grandTotal + roundingAdjustment (the persisted
  //                 total must NEVER exceed the engine's priced total — it is
  //                 never derived from nonCashPaid, which can overshoot the
  //                 real total when a non-cash tender is over-tendered)
  //   change      = max(0, cashPaid - cashDue)

  const cashPaid = sum(input.payments.filter((p) => p.method === "CASH").map((p) => m(p.amount)));
  const nonCashPaid = totalPaid.minus(cashPaid);

  let roundingAdjustment = m(0);
  let cashDue = m(0);

  if (cashPaid.gt(0)) {
    const rawCashDue = dmax(0, priced.grandTotal.minus(nonCashPaid));
    const { rounded, adjustment } = roundCashDue(rawCashDue);
    cashDue = rounded;
    roundingAdjustment = adjustment;
  }

  const grandTotal = priced.grandTotal.plus(roundingAdjustment);

  const changeAmount = dmax(0, cashPaid.minus(cashDue));

  // Effective amount applied to the sale = min(totalPaid, grandTotal + changeGiven)
  // Simpler: the sale is "paid" up to grandTotal; change is excess cash returned.
  const paidAmount = dmax(0, totalPaid.minus(changeAmount));
  const dueAmount = dmax(0, grandTotal.minus(paidAmount));

  const saleStatus = dueAmount.gt(0) ? "PARTIAL" : "COMPLETED";

  // ── 4.5 Sector compliance (Phase 2.2) — schedule enforcement, fail-closed ─
  //
  //   Runs the active-sector compliance pipeline BEFORE the $transaction,
  //   after products are resolved and override grants consumed — the SAME
  //   fail-closed posture as the 1.3a override path above: a
  //   `ComplianceBlockedError` (403) propagates and aborts HERE, before any
  //   sale/stock/RxLink write. It is deliberately NOT caught. A non-pharmacy
  //   tenant has no active sector (sectors default OFF) → the pipeline is a
  //   no-op and every existing (OPEN-product) checkout is unaffected.
  //
  //   A consumed `RX_CONSULT` override rides in `overrides[]` with
  //   `context = productId`; it marks that product's behind-counter consult as
  //   acknowledged (both for the compliance check and the persisted RxLink).
  const consultAckProductIds = new Set(
    acceptedOverrides.filter((o) => o.action === "RX_CONSULT").map((o) => o.context),
  );

  const tenantRow = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  // Store-local date for the invoice number's date segment (and, via createdAt
  // below, the receipt) — uses the tenant's configured timezone (Settings →
  // Regional), falling back to the runtime clock.
  const storeTz = (tenantRow?.settings as { timezone?: string } | null)?.timezone || undefined;
  const invoiceDateKey = zonedDateKey(now, storeTz);
  const activeSectors = resolveActiveSectors(
    sectorRegistry,
    readEnabledSectors(tenantRow ?? { settings: null }),
  );

  if (activeSectors.length > 0) {
    const scheduleByProduct = await resolveCartSchedules(
      db,
      input.items.map((it) => ({
        productId: it.productId,
        din: productById.get(it.productId)?.din ?? null,
      })),
    );

    const complianceCtx: CheckoutContext = {
      tenantId,
      storeId: input.storeId,
      scratch: {},
      items: input.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        attributes: {
          scheduleCategory: scheduleByProduct.get(it.productId) ?? "OPEN",
          rxLinked: !!it.rx?.rxNumber,
          consultAck: consultAckProductIds.has(it.productId),
        },
      })),
    };

    await createCheckoutPipeline([], activeSectors).run(complianceCtx);
  }

  // ── 4b. Server-authoritative enforcement (3H.7) ─────────────────────────
  // Discount caps + credit limit were UI-only/bypassable. Enforce them here,
  // fail-closed, BEFORE any write, using the SHARED exceedsCap (identical to
  // the POS gate). Only the cashier's MANUAL discounts are cap-checked (not
  // promotion-driven ones). A required manager override grant must be present.
  const acceptedForEnforcement = acceptedOverrides.map((o) => ({ action: o.action, context: o.context }));
  const cashierUser = await db.user.findUnique({ where: { id: cashierId }, select: { role: true } });
  const manualSubtotal = input.items.reduce(
    (s, it) => s + Math.max(0, it.unitPrice * it.quantity - (it.discount ?? 0)),
    0,
  );
  enforceDiscountCaps({
    role: cashierUser?.role ?? "CASHIER",
    caps: getDiscountCaps(tenantRow?.settings ?? null),
    cartDiscount: input.cartDiscount ?? 0,
    cartDiscountMode: input.cartDiscountMode ?? "flat",
    subtotal: manualSubtotal,
    lines: input.items.map((it) => ({ discount: it.discount ?? 0, base: it.unitPrice * it.quantity })),
    accepted: acceptedForEnforcement,
  });
  if (input.customerId && creditCustomer && dueAmount.gt(0)) {
    enforceCreditLimit({
      customerId: input.customerId,
      dueAmount: dueAmount.toNumber(),
      creditLimit: Number(creditCustomer.creditLimit),
      currentBalance: Number(creditCustomer.currentBalance),
      accepted: acceptedForEnforcement,
    });
  }

  // ── 5. Atomic transaction ───────────────────────────────────────────────

  // Collected inside the txn (post-sale stock qty per line); consumed by the
  // best-effort auto-reorder trigger AFTER commit (3H.2).
  const affectedForReorder: reorderService.AffectedLine[] = [];

  const sale = await prisma.$transaction(async (tx) => {
    // RXPOS-<storeCode>-<dailyNo>-<YYYYMMDD>, daily-reset per store.
    const dailyNo = await getNextDailySaleNumber(
      tx as never,
      tenantId,
      input.storeId,
      invoiceDateKey,
    );
    const invoiceNo = composeSaleInvoiceNo(store.code, dailyNo, invoiceDateKey);

    const newSale = await tx.sale.create({
      data: {
        tenantId,
        storeId: input.storeId,
        customerId: input.customerId ?? null,
        cashierId,
        shiftId: input.shiftId ?? null,
        invoiceNo,
        // Pin createdAt to the same instant used for the invoice date segment,
        // so the receipt date can never disagree with the invoice number.
        createdAt: now,
        subtotal: toDbNumber(priced.subtotal),
        taxTotal: toDbNumber(priced.taxTotal),
        levyTotal: toDbNumber(priced.levyTotal),
        roundingAdjustment: toDbNumber(roundingAdjustment),
        discountAmount: toDbNumber(priced.discountTotal),
        grandTotal: toDbNumber(grandTotal),
        paidAmount: toDbNumber(paidAmount),
        dueAmount: toDbNumber(dueAmount),
        changeAmount: toDbNumber(changeAmount),
        status: saleStatus,
        notes: input.notes ?? null,
      },
    });

    await tx.saleItem.createMany({
      data: rawLines.map((rl, i) => {
        const pLine = priced.lines[i];
        const qty = m(rl.quantity);
        const lineTax = sum(Object.values(pLine.taxByComponent));
        const unitPrice = qty.gt(0) ? pLine.net.div(qty) : m(0);
        const taxRate = pLine.net.gt(0) ? lineTax.div(pLine.net).times(100) : m(0);
        return {
          saleId: newSale.id,
          productId: rl.productId,
          variantId: rl.variantId,
          quantity: rl.quantity,
          unitPrice: toDbNumber(unitPrice),
          costPrice: toDbNumber(rl.costPrice),
          discount: toDbNumber(pLine.discount),
          taxRate: toDbNumber(taxRate),
          taxAmount: toDbNumber(lineTax),
          lineTotal: toDbNumber(pLine.gross),
        };
      }),
    });

    // ── Rx-at-till links (Phase 2.2) ───────────────────────────────────
    //   Persist a PII-free RxLink for every line that carries a linked Rx —
    //   rx number + copay + the consult-ack flag, tied to the line's DIN.
    //   `saleItemId` is left null: createMany above does not return the
    //   created SaleItem rows to map back to lines (schema allows null).
    const rxRows = input.items
      .filter((it) => it.rx)
      .map((it) => ({
        tenantId,
        saleId: newSale.id,
        productId: it.productId,
        din: productById.get(it.productId)?.din ?? null,
        rxNumber: it.rx!.rxNumber,
        copay: it.rx!.copay ?? null,
        consultAck: consultAckProductIds.has(it.productId),
      }));

    if (rxRows.length > 0) {
      await tx.rxLink.createMany({ data: rxRows });
    }

    if (acceptedOverrides.length > 0) {
      await tx.saleOverride.createMany({
        data: acceptedOverrides.map((o) => ({
          saleId: newSale.id,
          action: o.action,
          context: o.context,
          authorizerUserId: o.authorizerUserId,
          cashierId,
        })),
      });
    }

    if (priced.taxBreakdown.length > 0) {
      await tx.saleTaxLine.createMany({
        data: priced.taxBreakdown.map((t) => ({
          saleId: newSale.id,
          componentCode: t.code,
          base: toDbNumber(t.base),
          ratePct: toDbNumber(m(t.ratePct)),
          amount: toDbNumber(t.amount),
        })),
      });
    }

    await tx.payment.createMany({
      data: input.payments.map((p) => ({
        tenantId,
        saleId: newSale.id,
        customerId: input.customerId ?? null,
        method: p.method,
        amount: toDbNumber(m(p.amount)),
        referenceNo: p.referenceNo ?? null,
        status: "COMPLETED" as const,
        notes: p.notes ?? null,
      })),
    });

    // 3H.5: persist the loyalty redemption — a LOYALTY tender + a REDEEMED
    // transaction + a points decrement (before the EARNED increment below).
    if (redemption && input.customerId) {
      await tx.payment.create({
        data: {
          tenantId,
          saleId: newSale.id,
          customerId: input.customerId,
          method: "LOYALTY",
          amount: toDbNumber(redemptionValue),
          referenceNo: null,
          status: "COMPLETED",
          notes: `Redeemed ${redemption.points} loyalty points`,
        },
      });
      await tx.customer.update({
        where: { id: input.customerId },
        data: { loyaltyPoints: { decrement: redemption.points } },
      });
      await tx.loyaltyTransaction.create({
        data: {
          tenantId,
          customerId: input.customerId,
          type: "REDEEMED",
          points: redemption.points,
          saleId: newSale.id,
          notes: `Redeemed on sale ${invoiceNo}`,
        },
      });
    }

    // ── Stock deduction: atomic conditional UPDATE closes the TOCTOU window.
    // If two concurrent checkouts race for the last unit, one will see
    // count:0 and throw InsufficientStockError.
    for (const line of rawLines) {
      if (line.productType === "SERVICE") continue;

      const result = await tx.storeStock.updateMany({
        where: {
          storeId: input.storeId,
          productId: line.productId,
          variantId: line.variantId,
          quantity: { gte: line.quantity },
        },
        data: {
          quantity: { decrement: line.quantity },
        },
      });

      if (result.count === 0) {
        const current = await tx.storeStock.findFirst({
          where: {
            storeId: input.storeId,
            productId: line.productId,
            variantId: line.variantId,
          },
        });
        throw new InsufficientStockError(line.productName, current?.quantity ?? 0, line.quantity);
      }

      const updated = await tx.storeStock.findFirst({
        where: {
          storeId: input.storeId,
          productId: line.productId,
          variantId: line.variantId,
        },
      });

      // 3H.2: remember the post-sale quantity so the auto-reorder trigger can
      // check it AFTER this transaction commits (never inside the money path).
      affectedForReorder.push({
        productId: line.productId,
        variantId: line.variantId,
        newQty: updated!.quantity,
      });

      await tx.stockMovement.create({
        data: {
          tenantId,
          storeId: input.storeId,
          productId: line.productId,
          variantId: line.variantId,
          type: "SALE",
          quantityChange: -line.quantity,
          quantityAfter: updated!.quantity,
          notes: `Sale ${invoiceNo}`,
          performedBy: cashierId,
          referenceId: newSale.id,
          referenceType: "SALE",
        },
      });
    }

    // ── Loyalty points (earn — 3H.5 tier-aware) ────────────────────────
    if (input.customerId && saleStatus === "COMPLETED") {
      if (loyaltyProgram?.isActive) {
        // Apply the customer's spend tier's earn multiplier (highest tier whose
        // minSpend ≤ this sale's grandTotal; default 1).
        const multiplier = resolveTierMultiplier(
          (loyaltyProgram.tiers ?? []).map((t) => ({ minSpend: Number(t.minSpend), multiplier: Number(t.multiplier) })),
          grandTotal.toNumber(),
        );
        const pointsEarned = grandTotal.times(m(Number(loyaltyProgram.earnRate))).times(m(multiplier)).floor().toNumber();

        if (pointsEarned > 0) {
          await tx.customer.update({
            where: { id: input.customerId },
            data: { loyaltyPoints: { increment: pointsEarned } },
          });

          await tx.loyaltyTransaction.create({
            data: {
              tenantId,
              customerId: input.customerId,
              type: "EARNED",
              points: pointsEarned,
              saleId: newSale.id,
              notes: `Points earned on sale ${invoiceNo}`,
            },
          });
        }
      }
    }

    // ── Due amount → customer AR balance ───────────────────────────────
    if (input.customerId && dueAmount.gt(0)) {
      await tx.customer.update({
        where: { id: input.customerId },
        data: { currentBalance: { increment: toDbNumber(dueAmount) } },
      });
    }

    // 3H.4: record applied promotions (usage tracking). The synthetic
    // "__group__" pseudo-promo isn't a Promotion row — skip it.
    for (const ap of appliedPromotions) {
      if (ap.promotionId === "__group__") continue;
      await tx.promotionRedemption.create({
        data: {
          tenantId,
          promotionId: ap.promotionId,
          saleId: newSale.id,
          customerId: input.customerId ?? null,
          amount: Number(ap.amount),
        },
      });
      await tx.promotion.update({ where: { id: ap.promotionId }, data: { timesUsed: { increment: 1 } } });
    }

    return newSale;
  });

  // 3H.2 auto-reorder: best-effort, post-commit, Redis-free. Never blocks or
  // fails the sale — fire-and-forget with an internal catch.
  void reorderService
    .maybeReorder(db, { tenantId, storeId: input.storeId }, affectedForReorder)
    .catch(() => {});

  const fullSale = await db.sale.findUnique({
    where: { id: sale.id },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          variant: { select: { id: true, name: true, sku: true } },
        },
      },
      payments: true,
      taxLines: true,
      customer: { select: { id: true, name: true, phone: true } },
      cashier: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  logger.info(
    {
      tenantId,
      saleId: sale.id,
      invoiceNo: sale.invoiceNo,
      grandTotal: toDbNumber(grandTotal),
      status: saleStatus,
    },
    "Checkout completed",
  );

  return {
    ...fullSale,
    _links: {
      receipt: `/api/v1/receipts/sale/${sale.id}`,
      receiptHtml: `/api/v1/receipts/sale/${sale.id}?format=html`,
      receiptThermal: `/api/v1/receipts/sale/${sale.id}?format=thermal`,
      receiptPreview: `/api/v1/receipts/sale/${sale.id}/preview`,
    },
  };
}
