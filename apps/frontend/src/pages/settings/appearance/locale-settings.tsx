import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { useSettingsContext } from "@/lib/settings-provider";

export const SUPPORTED_LOCALES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
];

const localeFormSchema = z.object({
  locale: z.string().min(1, "Please select a language."),
});

type LocaleFormValues = z.infer<typeof localeFormSchema>;

export function LocaleSettings() {
  const { settings, updateSettings } = useSettingsContext();

  const form = useForm<LocaleFormValues>({
    resolver: zodResolver(localeFormSchema),
    defaultValues: { locale: settings?.locale ?? "en" },
    values: { locale: settings?.locale ?? "en" },
  });

  async function onSubmit(data: LocaleFormValues) {
    await updateSettings({ locale: data.locale });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Language</CardTitle>
        <CardDescription>Choose the language used throughout the interface.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="locale"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full max-w-[360px]">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_LOCALES.map((loc) => (
                          <SelectItem key={loc.value} value={loc.value}>
                            {loc.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">Save Language</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
