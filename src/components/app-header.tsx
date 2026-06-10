"use client";

import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { User, LogOut, KeyRound, ChevronDown } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/hooks/use-me";

const TITEL: Record<string, string> = {
  "": "Dashboard",
  auftraege: "Aufträge",
  zeiten: "Zeiterfassung",
  qualitaet: "Qualität",
  material: "Material / Lager",
  planung: "Planung / Timeline",
  lieferanten: "Lieferanten & EOQ",
  auswertung: "Auswertung",
  verwaltung: "Verwaltung",
  "passwort-aendern": "Passwort ändern",
};

const ROLLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  kommissionierung: "Kommissionierung",
  mitarbeiter: "Mitarbeiter",
};

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useMe();

  const segment = pathname.split("/")[1] ?? "";
  const titel = TITEL[segment] ?? "KIMA-Flow";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Abgemeldet");
    router.push("/login");
  }

  return (
    <header className="flex h-12 items-center gap-2 border-b px-4 shrink-0">
      <SidebarTrigger className="-ml-1" />
      <h2 className="text-sm font-semibold">{titel}</h2>

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <User className="size-4" />
              <span className="hidden sm:inline">{me?.name ?? me?.username ?? "Benutzer"}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1">
                <span>{me?.name ?? me?.username ?? "—"}</span>
                {me && (
                  <Badge variant="secondary" className="w-fit text-xs font-normal">
                    {ROLLE_LABEL[me.rolle] ?? me.rolle}
                  </Badge>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/passwort-aendern")}>
              <KeyRound className="size-4 mr-2" />
              Passwort ändern
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="size-4 mr-2" />
              Abmelden
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
