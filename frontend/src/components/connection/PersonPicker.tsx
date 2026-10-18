import { useState } from 'react';
import { Check, ChevronsUpDown, UserPlus } from 'lucide-react';
import type { Person } from '@/api/client';
import { usePersonList } from '@/hooks/usePersonList';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface PersonPickerProps {
  excludePersonId?: string;
  value: Person | null;
  onChange: (person: Person | null) => void;
  onCreateNew: (name: string) => void;
}

export function PersonPicker({ excludePersonId, value, onChange, onCreateNew }: PersonPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const people = usePersonList().people.filter((p) => p.id !== excludePersonId);

  const filtered = people.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const exactMatch = people.some((p) => p.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? value.name : 'Search or add a person...'}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search people..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((person) => (
                <CommandItem
                  key={person.id}
                  value={person.id}
                  onSelect={() => {
                    onChange(person);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(value?.id === person.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {person.name}
                </CommandItem>
              ))}
              {search.trim() && !exactMatch && (
                <CommandItem
                  value={`__create__${search}`}
                  onSelect={() => {
                    onCreateNew(search.trim());
                    setOpen(false);
                  }}
                >
                  <UserPlus />
                  Add "{search.trim()}" as a new person
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
