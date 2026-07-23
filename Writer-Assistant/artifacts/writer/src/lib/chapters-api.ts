import { useQuery, useMutation } from "@tanstack/react-query";

export interface Chapter {
  id: number;
  documentId: number;
  title: string;
  content: string;
  position: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export const getListChaptersQueryKey = (documentId: number) => ["chapters", documentId] as const;

export function useListChapters(documentId: number, enabled = true) {
  return useQuery<Chapter[]>({
    queryKey: getListChaptersQueryKey(documentId),
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/chapters`);
      if (!res.ok) throw new Error("Failed to load chapters");
      return res.json() as Promise<Chapter[]>;
    },
    enabled: enabled && !!documentId && !isNaN(documentId),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateChapter(documentId: number) {
  return useMutation<Chapter, Error, { title?: string; content?: string }>({
    mutationFn: async (data) => {
      const res = await fetch(`/api/documents/${documentId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create chapter");
      return res.json() as Promise<Chapter>;
    },
  });
}

export function useUpdateChapter() {
  return useMutation<Chapter, Error, { id: number; data: { title?: string; content?: string; position?: number } }>({
    mutationFn: async ({ id, data }) => {
      const res = await fetch(`/api/chapters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update chapter");
      return res.json() as Promise<Chapter>;
    },
  });
}

export function useDeleteChapter() {
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/chapters/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete chapter");
    },
  });
}

export function useReorderChapters(documentId: number) {
  return useMutation<void, Error, number[]>({
    mutationFn: async (order) => {
      const res = await fetch(`/api/documents/${documentId}/chapters/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error("Failed to reorder chapters");
    },
  });
}
