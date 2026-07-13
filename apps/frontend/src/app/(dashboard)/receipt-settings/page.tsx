// Redirects legacy route → unified settings page
"use client";

import { useEffect } from "react";
import { useNavigate } from "@/shell/nav";
import { Loading } from "@/components/shared/feedback/Loading";

export default function ReceiptSettingsRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/settings?tab=receipt", { replace: true });
  }, [navigate]);

  return <Loading />;
}
