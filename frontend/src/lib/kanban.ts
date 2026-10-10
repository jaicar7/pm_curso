export type Priority = "baja" | "media" | "alta";

export const PRIORITIES: Priority[] = ["alta", "media", "baja"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority;
  due_date: string | null;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

export const initialData: BoardData = {
  columns: [
    { id: "col-backlog", title: "Pendientes", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Descubrimiento", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "En curso",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Revisión", cardIds: ["card-6"] },
    { id: "col-done", title: "Hecho", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Alinear los temas del roadmap",
      details: "Redactar los temas trimestrales con su impacto esperado y sus métricas.",
      priority: "media",
      due_date: null,
    },
    "card-2": {
      id: "card-2",
      title: "Recoger señales de clientes",
      details: "Revisar etiquetas de soporte, notas de ventas y motivos de baja.",
      priority: "media",
      due_date: null,
    },
    "card-3": {
      id: "card-3",
      title: "Prototipo de vista analítica",
      details: "Esbozar el diseño inicial del panel y los desgloses clave.",
      priority: "media",
      due_date: null,
    },
    "card-4": {
      id: "card-4",
      title: "Afinar el lenguaje de estados",
      details: "Unificar los nombres de columnas y el tono en todo el tablero.",
      priority: "media",
      due_date: null,
    },
    "card-5": {
      id: "card-5",
      title: "Diseñar la disposición de tarjetas",
      details: "Añadir jerarquía y espaciado para leer listas densas.",
      priority: "media",
      due_date: null,
    },
    "card-6": {
      id: "card-6",
      title: "Probar las microinteracciones",
      details: "Verificar los estados de foco, carga y al pasar el ratón.",
      priority: "media",
      due_date: null,
    },
    "card-7": {
      id: "card-7",
      title: "Publicar la página de marketing",
      details: "Textos finales aprobados y recursos gráficos entregados.",
      priority: "media",
      due_date: null,
    },
    "card-8": {
      id: "card-8",
      title: "Cerrar el sprint de bienvenida",
      details: "Documentar las notas de la versión y compartirlas internamente.",
      priority: "media",
      due_date: null,
    },
  },
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

// Today as YYYY-MM-DD in the viewer's time zone, the same format the API uses for due dates.
export const todayIso = (now = new Date()) => {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

export const isOverdue = (dueDate: string | null, today = todayIso()) =>
  dueDate !== null && dueDate < today;

export const formatDueDate = (dueDate: string) => {
  const [year, month, day] = dueDate.split("-");
  return `${day}/${month}/${year}`;
};

export type CardFilter = {
  query: string;
  priority: Priority | "todas";
};

export const matchesFilter = (card: Card, filter: CardFilter) => {
  const query = filter.query.trim().toLocaleLowerCase("es");
  const matchesQuery =
    !query ||
    card.title.toLocaleLowerCase("es").includes(query) ||
    card.details.toLocaleLowerCase("es").includes(query);
  return matchesQuery && (filter.priority === "todas" || card.priority === filter.priority);
};
