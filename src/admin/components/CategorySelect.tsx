import { ArrowDownIcon, CheckIcon } from "@radix-ui/react-icons";
import * as Select from "@radix-ui/react-select";

// Define a minimal shape for the data needed by the select
interface Category {
  id: string;
  title: string;
}

export function CategorySelect({ data }: { data: Category[] }) {
  return (
    <Select.Root name="category_id">
      <Select.Trigger className="flex items-center justify-between rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none data-placeholder:text-neutral-400">
        <Select.Value placeholder="Select a category..." />
        <Select.Icon className="text-neutral-400">
          <ArrowDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
          <Select.Viewport className="p-1">
            {data.map((cat) => (
              <Select.Item
                key={cat.id}
                value={cat.id}
                className="relative flex items-center rounded-sm py-1.5 pr-2 pl-8 text-sm text-neutral-700 select-none hover:bg-emerald-50 hover:text-emerald-700 focus:bg-emerald-50 focus:text-emerald-700 focus:outline-none"
              >
                <Select.ItemText>{cat.title}</Select.ItemText>
                <Select.ItemIndicator className="absolute left-2 flex items-center justify-center text-emerald-600">
                  <CheckIcon />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
