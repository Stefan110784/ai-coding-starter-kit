"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";

const schema = z
  .object({
    altesPasswort: z.string().min(1, "Bitte das aktuelle Passwort eingeben"),
    neuesPasswort: z.string().min(4, "Mindestens 4 Zeichen"),
    wiederholung: z.string().min(1, "Bitte wiederholen"),
  })
  .refine((d) => d.neuesPasswort === d.wiederholung, {
    path: ["wiederholung"],
    message: "Die neuen Passwörter stimmen nicht überein",
  });

type FormWerte = z.infer<typeof schema>;

export default function PasswortAendernPage() {
  const router = useRouter();
  const form = useForm<FormWerte>({
    resolver: zodResolver(schema),
    defaultValues: { altesPasswort: "", neuesPasswort: "", wiederholung: "" },
  });

  async function onSubmit(werte: FormWerte) {
    const res = await fetch("/api/auth/passwort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        altesPasswort: werte.altesPasswort,
        neuesPasswort: werte.neuesPasswort,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Serverfehler dem passenden Feld zuordnen, sonst als Toast.
      if (res.status === 403) {
        form.setError("altesPasswort", {
          message: data.error ?? "Aktuelles Passwort ist falsch",
        });
      } else {
        toast.error(data.error ?? "Passwort konnte nicht geändert werden");
      }
      return;
    }
    toast.success("Passwort geändert");
    router.push("/");
  }

  const { isSubmitting } = form.formState;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 text-3xl font-bold tracking-tight">
            KIMA<span className="text-primary">-Flow</span>
          </div>
          <CardTitle className="text-base text-muted-foreground font-normal">
            Passwort ändern
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="altesPasswort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aktuelles Passwort</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="neuesPasswort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Neues Passwort</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wiederholung"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Neues Passwort wiederholen</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Speichern…" : "Passwort ändern"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
