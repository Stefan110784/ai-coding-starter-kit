import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-muted/40 p-6 text-center">
      <div className="text-6xl font-bold tracking-tight text-muted-foreground">404</div>
      <h1 className="text-xl font-semibold">Seite nicht gefunden</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Die aufgerufene Seite existiert nicht oder wurde verschoben.
      </p>
      <Button asChild>
        <Link href="/">Zum Dashboard</Link>
      </Button>
    </div>
  );
}
