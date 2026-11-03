import notionPkg from '@notionhq/client';
import type { Client } from '@notionhq/client';

// The package is CommonJS; named ESM imports fail under Node, so destructure the default export.
const { Client: NotionClient, collectPaginatedAPI, collectAllDataSourceRows, isFullBlock } = notionPkg;
import type { NBlock, NotionSnapshot, NPage } from './types';

/** Blocks below these are other pages/databases, not content of this page. */
const NO_DESCEND = new Set(['child_page', 'child_database']);

async function blockTree(notion: Client, blockId: string): Promise<NBlock[]> {
  const items = await collectPaginatedAPI(notion.blocks.children.list, { block_id: blockId, page_size: 100 });
  const out: NBlock[] = [];
  for (const item of items) {
    if (!isFullBlock(item)) continue;
    const node = item as unknown as NBlock;
    if (node.has_children && !NO_DESCEND.has(node.type)) node.children = await blockTree(notion, node.id);
    out.push(node);
  }
  return out;
}

function findDatabases(blocks: NBlock[]): string[] {
  return blocks.flatMap((b) => (b.type === 'child_database' ? [b.id] : findDatabases(b.children ?? [])));
}

async function rows(notion: Client, databaseId: string): Promise<{ schema: Record<string, any>; rows: any[] }> {
  const db: any = await notion.databases.retrieve({ database_id: databaseId });
  const dataSourceId = db.data_sources?.[0]?.id;
  if (!dataSourceId) throw new Error(`Database ${databaseId} has no data source`);
  const ds: any = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const result = await collectAllDataSourceRows(notion, {
    data_source_id: dataSourceId,
    // The API does not expose a view's manual order; creation order matches how the page was built.
    sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
  } as any);
  return { schema: ds.properties ?? {}, rows: result as any[] };
}

export async function fetchSnapshot(token: string, rootPageId: string): Promise<NotionSnapshot> {
  const notion = new NotionClient({ auth: token });
  const rootBlocks = await blockTree(notion, rootPageId);
  let projects: NPage[] = [];
  let skills: NPage[] = [];

  for (const dbId of findDatabases(rootBlocks)) {
    const { schema, rows: list } = await rows(notion, dbId);
    const props = Object.values(schema) as any[];
    const isProjects = props.some((p) => p.type === 'files');
    const isSkills = props.some((p) => p.type === 'select' && p.name === 'Type');
    if (isProjects) {
      projects = [];
      for (const row of list) projects.push({ id: row.id, url: row.url, properties: row.properties, blocks: await blockTree(notion, row.id) });
    } else if (isSkills) {
      skills = list.map((row) => ({ id: row.id, url: row.url, properties: row.properties, blocks: [] }));
    }
  }
  return { rootBlocks, projects, skills };
}
