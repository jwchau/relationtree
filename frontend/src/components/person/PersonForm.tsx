import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { personFormSchema, type PersonFormValues } from '@/lib/validation';
import { RELATIONSHIP_CATEGORIES, categoryLabel } from '@/lib/relationshipTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export interface PersonFormProps {
  defaultValues?: Partial<PersonFormValues>;
  onSubmit: (values: PersonFormValues) => Promise<void> | void;
  submitLabel?: string;
  isSubmitting?: boolean;
  /** Show the details without letting them be changed (viewers of a shared tree). */
  readOnly?: boolean;
}

export function PersonForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Save',
  isSubmitting,
  readOnly = false,
}: PersonFormProps) {
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personFormSchema),
    defaultValues: {
      name: '',
      relationshipCategory: 'FRIEND',
      context: '',
      phone: '',
      email: '',
      address: '',
      birthday: '',
      notes: '',
      lastContactedDate: '',
      ...defaultValues,
    },
  });
  // Example text in an empty read-only field would look like real data.
  const hint = (example: string) => (readOnly ? undefined : example);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <fieldset disabled={readOnly} className="space-y-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder={hint('Jane Doe')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="relationshipCategory"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {RELATIONSHIP_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {categoryLabel(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="context"
            render={({ field }) => (
              <FormItem>
                <FormLabel>How you know them</FormLabel>
                <FormControl>
                  <Input placeholder={hint('College roommate, met at a conference...')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder={hint('(555) 555-5555')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder={hint('jane@example.com')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Input placeholder={hint('123 Main St, Springfield, IL 62704')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
            <FormField
              control={form.control}
              name="birthday"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Birthday</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastContactedDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last contacted</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea rows={4} placeholder={hint('Anything worth remembering...')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {!readOnly && (
            <Button type="submit" disabled={isSubmitting} className="max-sm:w-full">
              {isSubmitting ? 'Saving...' : submitLabel}
            </Button>
          )}
        </fieldset>
      </form>
    </Form>
  );
}
