import { useMemo, useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ArrowDownIcon, CaretSortIcon, TrashIcon } from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Separator from "@radix-ui/react-separator";
import * as Tabs from "@radix-ui/react-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Label, Tooltip } from "radix-ui";
import {
  deleteCategory,
  deleteNominee,
  fetchAdminNom,
  fetchNominees,
  updateCategory,
  updateNominee,
} from "@/lib/queries";
import type { API } from "@/lib/types";

export function NomineesTab() {
  const queryClient = useQueryClient();

  const nomineesQuery = useQuery({
    queryKey: ["nominees"],
    queryFn: fetchAdminNom,
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["nominees"] });
    },
  });

  const deleteNomineeMutation = useMutation<void, unknown, [string, string]>({
    mutationFn: ([categoryId, id]) => deleteNominee(categoryId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["nominees"] });
    },
  });

  const updateCategoryMutation = useMutation<
    void,
    unknown,
    [string, string | undefined, string | undefined]
  >({
    mutationFn: ([categoryId, description, title]) =>
      updateCategory(categoryId, description, title),
  });

  const updateNomineeMutation = useMutation<
    void,
    unknown,
    API.PATCH_NomineeRequest
  >({ mutationFn: (d) => updateNominee(d) });

  const allIds = useMemo(
    () => nomineesQuery.data?.map((d) => d.id) || [],
    [nomineesQuery.data],
  );
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const isAllExpanded =
    allIds.length > 0 && expandedItems.length === allIds.length;

  const toggleExpandAll = () => {
    if (isAllExpanded) {
      setExpandedItems([]);
    } else {
      setExpandedItems(allIds);
    }
  };

  return (
    <Tabs.Content value="nominees" className="h-full outline-none">
      <div className="h-full rounded-xl border border-neutral-200 bg-white shadow-sm">
        <ScrollArea.Root className="h-full w-full overflow-hidden rounded-xl bg-white">
          <ScrollArea.Viewport className="h-full w-full p-4">
            {/* Header Section with Toggle Button */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-400 uppercase">
                Nominees & Categories
              </h2>
              <button
                onClick={toggleExpandAll}
                disabled={
                  !nomineesQuery.data || nomineesQuery.data.length === 0
                }
                className={clsx(
                  "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                  "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <CaretSortIcon />
                {isAllExpanded ? "Collapse All" : "Expand All"}
              </button>
            </div>

            {!nomineesQuery.data || nomineesQuery.data.length === 0 ? (
              <p className="text-neutral-400 italic">No data found.</p>
            ) : (
              <Accordion.Root
                type="multiple"
                value={expandedItems}
                onValueChange={setExpandedItems}
                className="flex flex-col gap-2"
              >
                {nomineesQuery.data.map((category) => (
                  <Accordion.Item
                    key={category.id}
                    value={category.id}
                    className="overflow-hidden rounded border border-neutral-200 bg-neutral-50/50 focus-within:ring-2 focus-within:ring-emerald-500/20"
                  >
                    <Accordion.Header className="flex">
                      <Accordion.Trigger className="group flex flex-1 items-center bg-white px-4 py-3 text-sm font-medium outline-none hover:bg-neutral-50">
                        <input
                          defaultValue={category.title}
                          type="text"
                          className="z-20 mr-4 w-1/3"
                          onClick={(e) => e.stopPropagation()}
                          onChange={({ currentTarget }) =>
                            updateCategoryMutation.mutate([
                              category.id,
                              undefined,
                              currentTarget.value.trim(),
                            ])
                          }
                        />
                        <span className="text-xs text-neutral-400 normal-case">
                          (id:
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(category.id);
                            }}
                            className="ml-1 cursor-copy hover:text-emerald-600 hover:underline"
                            title="Click to copy ID"
                          >
                            {category.id}
                          </span>
                          )
                        </span>
                        <span className="grow" />
                        <ArrowDownIcon className="text-neutral-400 transition-transform duration-300 ease-[cubic-bezier(0.87,0,0.13,1)] group-data-[state=open]:rotate-180" />
                      </Accordion.Trigger>
                    </Accordion.Header>
                    <Accordion.Content className="data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp overflow-hidden text-sm">
                      <div className="p-4 pt-2">
                        <div className="flex items-center justify-between">
                          <input
                            defaultValue={category.description}
                            className="h-8 w-full px-2 text-xs text-neutral-500"
                            onChange={({ currentTarget }) => {
                              updateCategoryMutation.mutate([
                                category.id,
                                currentTarget.value.trim(),
                                undefined,
                              ]);
                            }}
                            type="text"
                          />
                          <button
                            onClick={() =>
                              deleteCategoryMutation.mutate(category.id)
                            }
                            className="self-end rounded p-1 align-middle text-red-800 hover:bg-red-200"
                          >
                            <TrashIcon className="h-8" />
                          </button>
                        </div>
                        <Separator.Root className="my-2 h-px bg-neutral-200" />
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-neutral-400">
                            NOMINEES
                          </p>
                          {category.options.map((option) => (
                            <div
                              key={option.id}
                              className="flex items-center gap-2 rounded bg-neutral-100 p-2 text-xs"
                            >
                              <div className="grow">
                                <input
                                  defaultValue={option.title}
                                  onChange={({ currentTarget }) =>
                                    updateNomineeMutation.mutate({
                                      id: option.id,
                                      categoryId: option.categoryId,
                                      title: currentTarget.value.trim(),
                                    })
                                  }
                                  className="mr-1 font-bold"
                                />
                                <span>
                                  (id:
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(
                                        category.id,
                                      );
                                    }}
                                    className="ml-1 cursor-copy hover:text-emerald-600 hover:underline"
                                    title="Click to copy ID"
                                  >
                                    {option.id}
                                  </span>
                                  <button
                                    onClick={() =>
                                      deleteNomineeMutation.mutate([
                                        option.categoryId,
                                        option.id,
                                      ])
                                    }
                                    className="rounded p-1 align-middle text-red-800 hover:bg-red-200"
                                  >
                                    <TrashIcon />
                                  </button>
                                  )
                                </span>
                                <div className="flex flex-col border-l-2 border-neutral-500 pl-2">
                                  <Label.Root className="text-neutral-500">
                                    Description
                                  </Label.Root>
                                  <textarea
                                    className="p-0.5 pl-2"
                                    defaultValue={option.description}
                                    onChange={({ currentTarget }) =>
                                      updateNomineeMutation.mutate({
                                        id: option.id,
                                        categoryId: option.categoryId,
                                        description: currentTarget.value.trim(),
                                      })
                                    }
                                  />
                                  <Label.Root className="text-neutral-500">
                                    URL
                                  </Label.Root>
                                  <input
                                    type="text"
                                    defaultValue={option.url ?? ""}
                                    className="text-blue-1 p-0.5 pl-2"
                                    onChange={({ currentTarget }) =>
                                      updateNomineeMutation.mutate({
                                        id: option.id,
                                        categoryId: option.categoryId,
                                        url: currentTarget.value.trim(),
                                      })
                                    }
                                  />
                                  <Tooltip.Provider delayDuration={0}>
                                    <Tooltip.Root>
                                      <Tooltip.Trigger className="bg-neutral-300/50 text-left">
                                        <Label.Root className="text-left text-neutral-500 underline">
                                          Image ID
                                        </Label.Root>
                                      </Tooltip.Trigger>
                                      <Tooltip.Portal>
                                        <Tooltip.Content
                                          className="relative z-50"
                                          sideOffset={5}
                                        >
                                          {option.imageId ? (
                                            <img
                                              src={`/Media/${option.imageId}`}
                                              className="rounded"
                                            />
                                          ) : null}
                                        </Tooltip.Content>
                                      </Tooltip.Portal>
                                    </Tooltip.Root>
                                  </Tooltip.Provider>
                                  <input
                                    type="text"
                                    defaultValue={option.imageId ?? ""}
                                    className="p-0.5 pl-2"
                                    onChange={({ currentTarget }) =>
                                      updateNomineeMutation.mutate({
                                        id: option.id,
                                        categoryId: option.categoryId,
                                        imageId: currentTarget.value.trim(),
                                      })
                                    }
                                  />
                                  <Label.Root className="text-neutral-500">
                                    Video ID
                                  </Label.Root>
                                  <input
                                    type="text"
                                    defaultValue={option.videoId ?? ""}
                                    className="text-blue-1 p-0.5 pl-2"
                                    onChange={({ currentTarget }) =>
                                      updateNomineeMutation.mutate({
                                        id: option.id,
                                        categoryId: option.categoryId,
                                        videoId: currentTarget.value.trim(),
                                      })
                                    }
                                  />
                                  <Label.Root className="text-neutral-500">
                                    Render Type
                                  </Label.Root>
                                  <select
                                    defaultValue={
                                      option.renderType ?? "default"
                                    }
                                    onChange={({ currentTarget }) =>
                                      updateNomineeMutation.mutate({
                                        id: option.id,
                                        categoryId: option.categoryId,
                                        renderType: currentTarget.value as
                                          | "default"
                                          | "compact",
                                      })
                                    }
                                  >
                                    <option value="default">Default</option>
                                    <option value="compact">Compact</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                ))}
              </Accordion.Root>
            )}
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            orientation="vertical"
            className="flex w-2.5 touch-none border-l border-l-transparent bg-neutral-100 p-0.5 transition-colors duration-160 ease-out select-none hover:bg-neutral-200"
          >
            <ScrollArea.Thumb className="relative flex-1 rounded-[10px] bg-neutral-400 before:absolute before:top-1/2 before:left-1/2 before:h-full before:min-h-11 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </div>
    </Tabs.Content>
  );
}
