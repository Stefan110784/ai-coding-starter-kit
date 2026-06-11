"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VorschlaegeTab } from "@/components/einkauf/vorschlaege-tab";
import { BestellungenTab } from "@/components/einkauf/bestellungen-tab";

/** Einkauf (KF3-29/30): Bestellvorschläge, Bestellungen, Wareneingang. */
export default function EinkaufPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Einkauf</h1>
      <Tabs defaultValue="bestellungen">
        <TabsList>
          <TabsTrigger value="bestellungen">Bestellungen</TabsTrigger>
          <TabsTrigger value="vorschlaege">Bestellvorschläge</TabsTrigger>
        </TabsList>
        <TabsContent value="bestellungen" className="mt-3">
          <BestellungenTab />
        </TabsContent>
        <TabsContent value="vorschlaege" className="mt-3">
          <VorschlaegeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
