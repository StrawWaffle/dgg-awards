import { CategorySelect } from "@/admin/components/CategorySelect";
import { PlusCircledIcon } from "@radix-ui/react-icons";
import * as Label from "@radix-ui/react-label";
import { Tabs } from "radix-ui";
import { useQuery } from "@tanstack/react-query";
import { fetchNominees } from "@/lib/queries";

export function ActionsTab() {
  const nomineesQuery = useQuery({
    queryKey: ["nominees"],
    queryFn: fetchNominees,
  });

  return (
    <Tabs.Content value="actions" className="flex h-full gap-6 outline-none">
      <form method="post" action="/api/admin/import" className="flex flex-col">
        <Label.Root className="text-emerald-600">Import data</Label.Root>
        <input
          type="text"
          name="data"
          className="border border-black"
          placeholder="paste json"
        />
        <button type="submit">Import</button>
      </form>
      {/* Add Category Form */}
      <div className="w-1/2 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="mb-6 flex items-center gap-2 border-b border-neutral-100 pb-2 text-sm font-bold text-emerald-600 uppercase">
          <PlusCircledIcon /> Add Category
        </h3>
        <form
          method="post"
          action="/api/admin/category"
          className="flex flex-col gap-4"
        >
          <div className="grid gap-1">
            <Label.Root className="text-xs font-bold text-neutral-500">
              Unique ID
            </Label.Root>
            <input
              name="category_id"
              required
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="grid gap-1">
            <Label.Root className="text-xs font-bold text-neutral-500">
              Display Title
            </Label.Root>
            <input
              name="category_title"
              required
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="grid gap-1">
            <Label.Root className="text-xs font-bold text-neutral-500">
              Description
            </Label.Root>
            <textarea
              name="category_description"
              rows={3}
              className="resize-none rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded bg-emerald-500 py-2 text-sm font-bold text-white hover:bg-emerald-600"
          >
            Create Category
          </button>
        </form>
      </div>

      {/* Add Nominee Form */}
      {nomineesQuery.data && nomineesQuery.data.length > 0 && (
        <div className="w-1/2 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 flex items-center gap-2 border-b border-neutral-100 pb-2 text-sm font-bold text-blue-600 uppercase">
            <PlusCircledIcon /> Add Nominee
          </h3>
          <form
            method="post"
            action="/api/admin/nominee"
            className="flex flex-col gap-4"
          >
            <div className="grid gap-1">
              <Label.Root className="text-xs font-bold text-neutral-500">
                Nominee ID
              </Label.Root>
              <input
                name="nominee_id"
                required
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid gap-1">
              <Label.Root className="text-xs font-bold text-neutral-500">
                Target Category
              </Label.Root>
              <CategorySelect data={nomineesQuery.data} />
            </div>

            <div className="grid gap-1">
              <Label.Root className="text-xs font-bold text-neutral-500">
                Nominee Name
              </Label.Root>
              <input
                name="nominee_title"
                required
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="grid gap-1">
              <Label.Root className="text-xs font-bold text-neutral-500">
                Image ID (filename)
              </Label.Root>
              <input
                name="image_id"
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="grid gap-1">
              <Label.Root className="text-xs font-bold text-neutral-500">
                Video ID (shortcode)
              </Label.Root>
              <input
                name="video_id"
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="grid gap-1">
              <Label.Root className="text-xs font-bold text-neutral-500">
                URL
              </Label.Root>
              <input
                name="url"
                required
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="grid gap-1">
              <Label.Root className="text-xs font-bold text-neutral-500">
                Description
              </Label.Root>
              <textarea
                name="nominee_description"
                rows={3}
                className="resize-none rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="mt-2 rounded bg-blue-500 py-2 text-sm font-bold text-white hover:bg-blue-600"
            >
              Add Nominee
            </button>
          </form>
        </div>
      )}
    </Tabs.Content>
  );
}
