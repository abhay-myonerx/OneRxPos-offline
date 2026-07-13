import { Link } from "@/shell/nav";
import { Compass, Home, LayoutGrid } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FullScreenState } from "@/components/shared/feedback/FullScreenState";
import { ROUTES } from "@/constants/routes";

export default function NotFound() {
  return (
    <FullScreenState
      tone="primary"
      code="404"
      icon={<Compass className="h-7 w-7" />}
      eyebrow="Page not found"
      title="We couldn't find that page"
      description="The page you're looking for doesn't exist, was moved, or the link is broken. Let's get you back on track."
      actions={
        <>
          <Button asChild fullWidth className="sm:w-auto">
            <Link href={ROUTES.DASHBOARD}>
              <Home className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" fullWidth className="sm:w-auto">
            <Link href={ROUTES.POS}>
              <LayoutGrid className="h-4 w-4" />
              Open POS
            </Link>
          </Button>
        </>
      }
    />
  );
}
