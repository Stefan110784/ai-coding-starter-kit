"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Clock,
  Package,
  Star,
  BarChart2,
  CalendarDays,
  Truck,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { useMe } from "@/hooks/use-me";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard", recht: "dashboard" },
  { href: "/auftraege", icon: ClipboardList, label: "Aufträge", recht: "auftraege" },
  { href: "/zeiten", icon: Clock, label: "Zeiterfassung", recht: "zeiten" },
  { href: "/qualitaet", icon: Star, label: "Qualität", recht: "qualitaet" },
  { href: "/material", icon: Package, label: "Material / Lager", recht: "lager" },
  { href: "/planung", icon: CalendarDays, label: "Planung / Timeline", recht: "planung" },
  { href: "/lieferanten", icon: Truck, label: "Lieferanten & EOQ", recht: "lieferanten" },
  { href: "/auswertung", icon: BarChart2, label: "Auswertung", recht: "auswertung" },
  { href: "/verwaltung", icon: Settings, label: "Verwaltung", recht: "verwaltung" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { me, hatRecht } = useMe();

  // Während die Rechte noch laden, alles zeigen; danach gemäß Rechtesystem filtern.
  const sichtbar = me ? navItems.filter((i) => hatRecht(i.recht)) : navItems;

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <span className="text-xl font-bold">
          KIMA<span className="text-primary">-Flow</span>
          <span className="ml-1 text-xs font-normal text-muted-foreground">V3</span>
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {sichtbar.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href)
                  }
                >
                  <Link href={item.href}>
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
