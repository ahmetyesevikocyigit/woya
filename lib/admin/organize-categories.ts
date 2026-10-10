// Explicit, one-off organization. Never called by application boot or deployment.
export interface CategoryMigrationRow {
  id: string;
  version: number;
  category_id?: string;
  code?: string;
  data: Record<string, unknown>;
}
interface Client {
  query: (
    query: string,
    params?: unknown[],
  ) => Promise<{ rows: CategoryMigrationRow[] }>;
}
export interface CategoryMigrationSnapshot {
  woya_products: CategoryMigrationRow[];
  woya_categories: CategoryMigrationRow[];
}
const setCodes = new Set(["46", "47", "48", "49", "50", "53"]);
export function categoryMoves(snapshot: CategoryMigrationSnapshot) {
  return snapshot.woya_products.filter(
    (p) =>
      ((p.category_id === "tablo-saat-setleri" ||
        p.category_id === "aynali-setler") &&
        p.data.type === "set") ||
      (p.category_id === "dekoratif-saatler" &&
        p.data.type === "saat" &&
        setCodes.has(p.code ?? "")),
  );
}
export async function organizeCategories(
  client: Client,
  snapshot: CategoryMigrationSnapshot,
) {
  const targets = categoryMoves(snapshot);
  if (!targets.length) throw new Error("No reviewed products to move");
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const current = (
      await client.query("SELECT * FROM woya_products ORDER BY id FOR UPDATE")
    ).rows;
    if (
      categoryMoves({ ...snapshot, woya_products: current })
        .map((p) => p.id)
        .sort()
        .join() !==
      targets
        .map((p) => p.id)
        .sort()
        .join()
    )
      throw new Error("Product membership changed; review a fresh snapshot");
    for (const product of targets) {
      const now = current.find((p) => p.id === product.id);
      if (
        !now ||
        now.version !== product.version ||
        now.category_id !== product.category_id
      )
        throw new Error("A reviewed product changed; review a fresh snapshot");
    }
    const categories = (
      await client.query("SELECT * FROM woya_categories ORDER BY id FOR UPDATE")
    ).rows;
    if (categories.some((c) => c.id === "uclu-setler"))
      throw new Error("Target category already exists; review manually");
    const patches = [
      {
        id: "dekoratif-saatler",
        data: {
          title: "Saatler",
          position: 0,
          surfaces: ["saatler", "koleksiyon"],
        },
      },
      { id: "tablolar", data: { position: 2 } },
      { id: "tablo-saat-setleri", data: { active: false } },
      { id: "aynali-setler", data: { active: false } },
    ];
    for (const patch of patches) {
      const expected = snapshot.woya_categories.find((c) => c.id === patch.id);
      const now = categories.find((c) => c.id === patch.id);
      if (!expected || !now || now.version !== expected.version)
        throw new Error("A reviewed category changed; review a fresh snapshot");
      if (
        patch.data.active === false &&
        current.some(
          (p) =>
            p.category_id === patch.id && !targets.some((t) => t.id === p.id),
        )
      )
        throw new Error("Legacy category has unreviewed products");
    }
    await client.query(
      "INSERT INTO woya_categories(id,data) VALUES ($1,$2::jsonb)",
      [
        "uclu-setler",
        {
          id: "uclu-setler",
          title: "Üçlü Setler",
          description:
            "Saat ve iki yan parçadan oluşan üçlü tablo ve aynalı duvar setleri.",
          active: true,
          position: 1,
          surfaces: ["koleksiyon"],
        },
      ],
    );
    for (const product of targets) {
      await client.query(
        "UPDATE woya_products SET category_id=$1, data=jsonb_set(data,'{categoryId}',to_jsonb($1::text)),version=version+1,updated_at=now() WHERE id=$2 AND version=$3",
        ["uclu-setler", product.id, product.version],
      );
    }
    for (const patch of patches)
      await client.query(
        "UPDATE woya_categories SET data=data || $2::jsonb,version=version+1 WHERE id=$1",
        [patch.id, patch.data],
      );
    await client.query(
      "INSERT INTO woya_audit(actor,action,entity) VALUES ('category-organization','organize-categories',$1)",
      [
        JSON.stringify({
          products: targets.map((p) => p.id),
          category: "uclu-setler",
        }),
      ],
    );
    await client.query("COMMIT");
    return { moved: targets.length, category: "uclu-setler" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
