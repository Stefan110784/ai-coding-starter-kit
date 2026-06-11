"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KundenauftraegeTab } from "@/components/vertrieb/kundenauftraege-tab";
import { KundenTab } from "@/components/vertrieb/kunden-tab";

/** Vertrieb (Anforderung Kap. 6; KF3-37): Kundenaufträge + Kundenstamm. */
export default function VertriebPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vertrieb</h1>
      <Tabs defaultValue="kundenauftraege">
        <TabsList>
          <TabsTrigger value="kundenauftraege">Kundenaufträge</TabsTrigger>
          <TabsTrigger value="kunden">Kunden</TabsTrigger>
        </TabsList>
        <TabsContent value="kundenauftraege" className="mt-4">
          <KundenauftraegeTab />
        </TabsContent>
        <TabsContent value="kunden" className="mt-4">
          <KundenTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
