'use client';

type ModuleOption = { id: string; title: string; slug?: string | null };

type Props = {
  productId: string;
  modules?: ModuleOption[];
  createMissing?: boolean;
};

export function AdminStreamFolderAudit(_props: Props) {
  return null;
}
