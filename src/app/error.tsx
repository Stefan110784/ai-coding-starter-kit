"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-muted/40 p-6 text-center">
      <div className="text-6xl font-bold tracking-tight text-muted-foreground">!</div>
      <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Erneut versuchen</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          Zum Dashboard
        </Button>
      </div>
    </div>
  );
}
