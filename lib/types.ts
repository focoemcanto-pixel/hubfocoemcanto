export type Module = { id: string; title: string; slug: string; description: string | null; icon: string | null; sort_order: number };
export type Exercise = { id: string; module_id: string | null; title: string; slug: string; description: string | null; media_type: string; difficulty: number };
