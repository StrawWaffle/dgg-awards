// Drag-to-reorder for the editor's lists, on dnd-kit. Rows move by a handle,
// so the rest of the row stays clickable; the handle also works from the
// keyboard (focus it, Space, arrow keys, Space).
import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DragHandleDots2Icon } from "@radix-ui/react-icons";

export function SortableList({
  ids,
  onReorder,
  children,
}: {
  ids: string[];
  /** The new order, every id. */
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so clicks still click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** For one row: put `ref` and `style` on the row, `handle` on a DragHandle. */
export function useSortableRow(id: string) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };
  return { ref: setNodeRef, style, isDragging, handle: { ref: setActivatorNodeRef, ...attributes, ...listeners } };
}

export function DragHandle({ label, ...props }: { label: string } & Record<string, unknown>) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Drag to reorder"
      className="shrink-0 cursor-grab touch-none rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 active:cursor-grabbing"
      {...props}
    >
      <DragHandleDots2Icon />
    </button>
  );
}
