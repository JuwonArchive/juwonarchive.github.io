/** Raw official-API block with its children attached by fetch.ts. */
export type NBlock = { id: string; type: string; has_children?: boolean; children?: NBlock[]; [k: string]: any };
/** A database row (page) with its body blocks attached. */
export type NPage = { id: string; url?: string; properties: Record<string, any>; blocks: NBlock[] };
export type NotionSnapshot = { rootBlocks: NBlock[]; projects: NPage[]; skills: NPage[] };
