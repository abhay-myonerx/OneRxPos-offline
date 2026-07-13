"use client";

import { ShoppingCart } from "lucide-react";

export function AuthMobileBrand() {
  return (
    <div className="flex lg:hidden items-center justify-center gap-2.5 mb-8">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl shadow"
        style={{ background: "linear-gradient(135deg, #3b5ef8, #02bcf5)" }}
      >
        <ShoppingCart className="h-5 w-5 text-white" />
      </div>
      <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
        Pos<span className="text-primary-500 font-light">Velo</span>
      </span>
    </div>
  );
}
